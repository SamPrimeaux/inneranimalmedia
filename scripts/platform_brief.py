#!/usr/bin/env python3
"""
IAM Platform Brief — truth compiler for session orientation.

Outputs a local, gitignored SESSION.md (and optional state.json) that
answers the only question that matters at session start:
  "What is the actual state of this platform right now?"

Every fact declares: value · source · observed_at · confidence

Usage:
  python3 scripts/platform_brief.py             # session briefing → .scratch/platform/SESSION.md
  python3 scripts/platform_brief.py --check     # drift detection gate (exits 1 on drift)
  python3 scripts/platform_brief.py --json      # machine-readable → .scratch/platform/state.json
  python3 scripts/platform_brief.py --dry-run   # print to stdout, write nothing

Add to package.json:
  "status": "python3 scripts/platform_brief.py",
  "status:check": "python3 scripts/platform_brief.py --check",

Add to .gitignore:
  .scratch/
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
if ROOT.name != "inneranimalmedia":
    raise RuntimeError(f"Refusing to run outside inneranimalmedia repo: {ROOT}")

SCRATCH_DIR = ROOT / ".scratch" / "platform"
SESSION_MD = SCRATCH_DIR / "SESSION.md"
STATE_JSON = SCRATCH_DIR / "state.json"
ENV_FILE = ROOT / ".env.cloudflare"

MIGRATIONS_DIR = ROOT / "migrations"
WRANGLER_CFG = "wrangler.production.toml"
D1_DB = "inneranimalmedia-business"
MIGRATION_MIN = 450
MIGRATION_DENYLIST = {
    "agentsam_schema_unify.sql",
    "supabase_semantic_code_search_1536.sql",
}

# Repos to check against GitHub (owner/repo)
REPOS = {
    "main": "SamPrimeaux/inneranimalmedia",
    "mcp": "SamPrimeaux/inneranimalmedia-mcp-server",
}

# Known sentinel files — report modification time so you know if Cursor touched them
SENTINEL_FILES = [
    "src/api/agent-chat-spine.js",
    "src/core/catalog-tool-executor.js",
    "dashboard/lib/agentRoutes.ts",
    "dashboard/components/ChatAssistant/ChatAssistant.tsx",
    "src/mcp-oauth-token-refresh.js",  # MCP repo — will skip if missing
]

NOW_ISO = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
NOW_DISPLAY = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

DRY_RUN = "--dry-run" in sys.argv
CHECK_MODE = "--check" in sys.argv
JSON_MODE = "--json" in sys.argv


# ── Helpers ───────────────────────────────────────────────────────────────────

def run(cmd, cwd=None, timeout=10, env=None):
    """Run a shell command, return (stdout, returncode). Never raises."""
    try:
        r = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            cwd=cwd or ROOT, timeout=timeout, env=env or os.environ
        )
        return r.stdout.strip(), r.returncode
    except Exception as e:
        return f"ERROR: {e}", 1


def load_cf_env():
    """Load .env.cloudflare into os.environ (non-destructive, same as with-cloudflare-env.sh)."""
    if not ENV_FILE.exists():
        return False
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip("\"'")
        if k and k not in os.environ:
            os.environ[k] = v
    return True


def fact(value, source, confidence="verified"):
    return {"value": value, "source": source, "observed_at": NOW_ISO, "confidence": confidence}


def migration_number(filename):
    """Return a sequential migration prefix; ignore YYYYMMDD date-format names."""
    m = re.match(r"^(\d+)_", filename)
    if not m:
        return 0
    number = int(m.group(1))
    return number if number < 10000 else 0


def is_tracked_migration(filename):
    """Match the production ledger scope used by d1-apply-pending.mjs."""
    return (
        filename.endswith(".sql")
        and not filename.startswith("_")
        and filename not in MIGRATION_DENYLIST
        and migration_number(filename) >= MIGRATION_MIN
    )


# ── Data collectors ───────────────────────────────────────────────────────────

def collect_git():
    """Tier 1: local git facts. Always available, no network."""
    out = {}

    branch, rc = run("git rev-parse --abbrev-ref HEAD")
    out["branch"] = fact(branch if rc == 0 else "unknown", "git rev-parse HEAD")

    sha, rc = run("git rev-parse --short HEAD")
    out["local_sha"] = fact(sha if rc == 0 else "unknown", "git rev-parse --short HEAD")

    full_sha, rc = run("git rev-parse HEAD")
    out["local_sha_full"] = fact(full_sha if rc == 0 else "unknown", "git rev-parse HEAD")

    # Dirty files
    status_out, _ = run("git status --porcelain")
    dirty = [l for l in status_out.splitlines() if l.strip()]
    out["dirty_files"] = fact(dirty, "git status --porcelain")
    out["dirty_count"] = fact(len(dirty), "git status --porcelain")

    # Staged vs unstaged
    staged = [l[3:].strip() for l in dirty if l[:2].strip() and not l[0] == " "]
    unstaged = [l[3:].strip() for l in dirty if l[0] == " " or l[:2] == "??"]
    out["staged_files"] = fact(staged, "git status --porcelain")
    out["unstaged_files"] = fact(unstaged, "git status --porcelain")

    # Last 7 commits
    log_out, _ = run("git log --oneline -7")
    commits = []
    for line in log_out.splitlines():
        parts = line.split(" ", 1)
        commits.append({"sha": parts[0], "message": parts[1] if len(parts) > 1 else ""})
    out["recent_commits"] = fact(commits, "git log --oneline -7")

    # Files changed in last 3 commits
    changed_out, _ = run("git diff --name-only HEAD~3 HEAD 2>/dev/null || git diff --name-only HEAD")
    changed_files = [f for f in changed_out.splitlines() if f.strip()]
    out["recently_changed_files"] = fact(changed_files, "git diff --name-only HEAD~3 HEAD")

    # Unpushed commits
    unpushed_out, rc = run("git log @{u}..HEAD --oneline 2>/dev/null")
    if rc == 0:
        unpushed = [l for l in unpushed_out.splitlines() if l.strip()]
        out["unpushed_commits"] = fact(unpushed, "git log @{u}..HEAD")
    else:
        out["unpushed_commits"] = fact([], "git log @{u}..HEAD", confidence="unavailable")

    return out


def collect_migrations():
    """Tier 1: local migration file ceiling. No network."""
    out = {}
    if not MIGRATIONS_DIR.exists():
        out["local_max_migration"] = fact(None, "ls migrations/", confidence="unavailable")
        return out

    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        out["local_max_migration"] = fact(0, "ls migrations/")
        out["local_migration_files"] = fact([], "ls migrations/")
        return out

    numbered = [(migration_number(f.name), f.name) for f in files if migration_number(f.name) > 0]
    numbered.sort()
    tracked = sorted(f.name for f in files if is_tracked_migration(f.name))
    dated = sorted(
        f.name
        for f in files
        if re.match(r"^\d{8}_", f.name) and migration_number(f.name) == 0
    )
    out["local_max_migration"] = fact(
        numbered[-1][0] if numbered else 0,
        "migrations/*.sql sequential prefixes",
        confidence="inferred",
    )
    out["local_max_migration_name"] = fact(
        numbered[-1][1] if numbered else None,
        "migrations/*.sql sequential prefixes",
    )
    out["tracked_migration_files"] = fact(
        tracked,
        f"migrations/*.sql exact filenames (sequential >= {MIGRATION_MIN})",
    )
    out["dated_migration_files"] = fact(
        dated,
        "migrations/*.sql YYYYMMDD prefixes excluded from sequence comparison",
    )
    out["local_migration_count"] = fact(len(files), "migrations/*.sql")
    return out


def collect_sentinel_files():
    """Tier 1: modification times of sentinel files."""
    out = {}
    results = []
    for rel_path in SENTINEL_FILES:
        p = ROOT / rel_path
        if p.exists():
            mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)
            results.append({
                "path": rel_path,
                "modified": mtime.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "age_minutes": int((datetime.now(timezone.utc) - mtime).total_seconds() / 60)
            })
    out["sentinel_files"] = fact(results, "os.stat(sentinel_files)")
    return out


def collect_d1(cf_env_loaded):
    """Tier 2: D1 queries via wrangler. Skipped gracefully if CF env unavailable."""
    out = {}
    if not cf_env_loaded:
        unavail = fact(None, "wrangler d1 execute", confidence="unavailable")
        out["applied_max_migration"] = unavail
        out["applied_migration_names"] = unavail
        out["open_tickets_by_subsystem"] = unavail
        out["active_tickets"] = unavail
        return out

    def d1(sql):
        cmd = (
            f'npx wrangler d1 execute {D1_DB} --remote -c {WRANGLER_CFG} '
            f'--json --command "{sql}"'
        )
        raw, rc = run(cmd, timeout=20)
        if rc != 0:
            return None, f"exit {rc}"
        try:
            data = json.loads(raw)
            # Wrangler returns [{results:[...]}] or {results:[...]}
            if isinstance(data, list) and data:
                rows = data[0].get("results", [])
            elif isinstance(data, dict):
                rows = data.get("results", [])
            else:
                rows = []
            return rows, None
        except json.JSONDecodeError as e:
            return None, str(e)

    # Exact applied filenames. d1_migrations.id is a ledger row id, not a
    # migration sequence number, so numeric ceiling comparison is invalid.
    rows, err = d1("SELECT name, applied_at FROM d1_migrations ORDER BY name")
    if rows is not None:
        names = sorted(
            str(row.get("name", "")).strip()
            for row in rows
            if str(row.get("name", "")).strip()
        )
        sequential = [
            (migration_number(name), name)
            for name in names
            if migration_number(name) > 0
        ]
        sequential.sort()
        out["applied_migration_names"] = fact(
            names,
            "d1_migrations.name exact filename set",
        )
        out["applied_max_migration"] = fact(
            {
                "number": sequential[-1][0],
                "name": sequential[-1][1],
            } if sequential else None,
            "max sequential prefix parsed from d1_migrations.name",
            confidence="inferred",
        )
    else:
        unavailable = fact(None, "d1_migrations", confidence="error" if err else "unavailable")
        out["applied_migration_names"] = unavailable
        out["applied_max_migration"] = unavailable

    # Open tickets by subsystem
    rows, err = d1(
        "SELECT subsystem, COUNT(*) as cnt FROM agentsam_tickets "
        "WHERE status NOT IN ('shipped','closed') "
        "GROUP BY subsystem ORDER BY cnt DESC LIMIT 20"
    )
    if rows is not None:
        out["open_tickets_by_subsystem"] = fact(rows, "agentsam_tickets GROUP BY subsystem")
    else:
        out["open_tickets_by_subsystem"] = fact([], "agentsam_tickets", confidence="error")

    # Active / in_review / blocked tickets
    rows, err = d1(
        "SELECT id, title, subsystem, status, priority FROM agentsam_tickets "
        "WHERE status IN ('active','in_review','blocked') "
        "ORDER BY priority, updated_at DESC LIMIT 20"
    )
    if rows is not None:
        out["active_tickets"] = fact(rows, "agentsam_tickets WHERE status IN (active,in_review,blocked)")
    else:
        out["active_tickets"] = fact([], "agentsam_tickets", confidence="error")

    return out


def collect_github():
    """Tier 3: GitHub API for deployed SHAs. Optional, adds confidence."""
    out = {}
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        for repo_key in REPOS:
            out[f"{repo_key}_github_sha"] = fact(
                None, "GitHub API", confidence="unavailable"
            )
        return out

    import urllib.request
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "iam-platform-brief/1.0",
    }

    for repo_key, repo in REPOS.items():
        try:
            url = f"https://api.github.com/repos/{repo}/commits/main"
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read())
                sha = data.get("sha", "")[:7]
                msg = data.get("commit", {}).get("message", "").splitlines()[0][:80]
                out[f"{repo_key}_github_sha"] = fact(
                    {"sha": sha, "message": msg}, f"GitHub API {repo}/commits/main"
                )
        except Exception as e:
            out[f"{repo_key}_github_sha"] = fact(
                None, f"GitHub API {repo}", confidence="error"
            )

    return out


# ── Drift detection ───────────────────────────────────────────────────────────

def detect_drift(git, migrations, d1):
    """
    Returns list of concrete drift conditions. These are the only things --check cares about.
    Each item: {"kind": str, "detail": str, "severity": "warn"|"fail"}
    """
    drift = []

    # 1. Unpushed commits
    unpushed = git.get("unpushed_commits", {}).get("value", [])
    if unpushed and git.get("unpushed_commits", {}).get("confidence") != "unavailable":
        drift.append({
            "kind": "unpushed_commits",
            "detail": f"{len(unpushed)} commit(s) not pushed to remote",
            "severity": "warn",
            "items": unpushed,
        })

    # 2. Exact migration ledger gaps. Missing names mean unregistered OR
    # unapplied; never claim SQL is unapplied from filename ordering alone.
    local_files = migrations.get("tracked_migration_files", {}).get("value", [])
    applied_names = d1.get("applied_migration_names", {}).get("value")
    if isinstance(applied_names, list):
        applied_max = d1.get("applied_max_migration", {}).get("value") or {}
        applied_max_number = int(applied_max.get("number") or 0)
        forward_missing = sorted(
            name
            for name in set(local_files) - set(applied_names)
            if migration_number(name) > applied_max_number
        )
        if forward_missing:
            drift.append({
                "kind": "migration_ledger_gap",
                "detail": (
                    f"{len(forward_missing)} migration file(s) newer than ledger ceiling "
                    f"{applied_max_number} are absent from d1_migrations.name; verify whether "
                    "they are unapplied or only unregistered"
                ),
                "severity": "fail",
                "items": forward_missing,
            })

    # 3. Dirty files present at ship time
    dirty = git.get("dirty_count", {}).get("value", 0)
    if dirty and CHECK_MODE:
        drift.append({
            "kind": "dirty_working_tree",
            "detail": f"{dirty} uncommitted file(s) in working tree",
            "severity": "warn",
            "items": git.get("dirty_files", {}).get("value", []),
        })

    # 4. Active P0 tickets still open
    active = d1.get("active_tickets", {}).get("value", [])
    p0_active = [t for t in active if t.get("priority") == "P0" and t.get("status") == "active"]
    if p0_active:
        drift.append({
            "kind": "p0_active",
            "detail": f"{len(p0_active)} P0 ticket(s) still in active status",
            "severity": "warn",
            "items": [f"{t['id']}: {t['title']}" for t in p0_active],
        })

    return drift


# ── Renderers ─────────────────────────────────────────────────────────────────

def render_md(git, migrations, d1, github, drift):
    local_sha = git.get("local_sha", {}).get("value", "unknown")
    branch = git.get("branch", {}).get("value", "unknown")
    dirty_count = git.get("dirty_count", {}).get("value", 0)
    dirty_files = git.get("dirty_files", {}).get("value", [])
    staged = git.get("staged_files", {}).get("value", [])
    unstaged = git.get("unstaged_files", {}).get("value", [])
    unpushed = git.get("unpushed_commits", {}).get("value", [])
    recent_commits = git.get("recent_commits", {}).get("value", [])
    recently_changed = git.get("recently_changed_files", {}).get("value", [])

    local_max = migrations.get("local_max_migration", {}).get("value")
    local_max_name = migrations.get("local_max_migration_name", {}).get("value", "")
    local_count = migrations.get("local_migration_count", {}).get("value", 0)

    applied = d1.get("applied_max_migration", {}).get("value")
    applied_confidence = d1.get("applied_migration_names", {}).get("confidence", "unavailable")
    applied_names = d1.get("applied_migration_names", {}).get("value")
    tracked_files = migrations.get("tracked_migration_files", {}).get("value", [])
    dated_files = migrations.get("dated_migration_files", {}).get("value", [])
    open_by_sub = d1.get("open_tickets_by_subsystem", {}).get("value", [])
    active_tickets = d1.get("active_tickets", {}).get("value", [])

    sentinel_files = d1.get("sentinel_files", {}).get("value", [])  # may be absent
    sentinels = git.get("sentinel_files") or {}  # collected separately

    lines = []
    lines.append(f"# IAM Platform Brief")
    lines.append(f"Generated: {NOW_DISPLAY}  |  Branch: `{branch}`  |  HEAD: `{local_sha}`")
    lines.append("")

    # ── Drift / alerts ─────────────────────────────────────────────────────────
    if drift:
        lines.append("## ⚠ Drift Detected")
        for d in drift:
            icon = "🔴" if d["severity"] == "fail" else "🟡"
            lines.append(f"{icon} **{d['kind']}** — {d['detail']}")
            for item in d.get("items", [])[:5]:
                lines.append(f"   - {item}")
        lines.append("")
    else:
        lines.append("## ✓ No Drift Detected")
        lines.append("")

    # ── Working tree ───────────────────────────────────────────────────────────
    lines.append("## Working Tree")
    if dirty_count == 0:
        lines.append("Clean — no uncommitted changes.")
    else:
        lines.append(f"{dirty_count} dirty file(s):")
        if staged:
            lines.append(f"  Staged ({len(staged)}): " + ", ".join(f"`{f}`" for f in staged[:8]))
        if unstaged:
            lines.append(f"  Unstaged ({len(unstaged)}): " + ", ".join(f"`{f}`" for f in unstaged[:8]))

    if unpushed:
        lines.append(f"  **{len(unpushed)} unpushed commit(s)**")
    lines.append("")

    # ── Recent commits ─────────────────────────────────────────────────────────
    lines.append("## Recent Commits (main)")
    for c in recent_commits:
        lines.append(f"  `{c['sha']}`  {c['message']}")
    lines.append("")

    # ── Migrations ─────────────────────────────────────────────────────────────
    lines.append("## Migrations")
    if isinstance(applied_names, list):
        all_missing = sorted(set(tracked_files) - set(applied_names))
        applied_max_number = int((applied or {}).get("number") or 0)
        missing = [
            name for name in all_missing
            if migration_number(name) > applied_max_number
        ]
        historical_missing = [
            name for name in all_missing
            if migration_number(name) <= applied_max_number
        ]
        if applied:
            lines.append(
                f"  Highest sequential name in D1 ledger: "
                f"**{applied.get('number', '?')}** (`{applied.get('name', '?')}`)"
            )
        lines.append(f"  Exact tracked files checked: {len(tracked_files)} (scope >= {MIGRATION_MIN})")
        if missing:
            lines.append(
                f"  ⚠ Ledger gap: {len(missing)} exact filename(s) absent "
                "(unapplied vs unregistered requires verification)"
            )
            for name in missing[:8]:
                lines.append(f"    - `{name}`")
        else:
            lines.append("  Exact filename ledger comparison: in sync ✓")
        if historical_missing:
            lines.append(
                f"  Historical ledger gaps (at/below ceiling, informational): "
                f"{len(historical_missing)}"
            )
        if dated_files:
            lines.append(
                f"  Date-format files excluded from sequence ceiling: {len(dated_files)}"
            )
    else:
        lines.append(f"  D1 ledger: unavailable ({applied_confidence})")
        if local_max:
            lines.append(f"  Local ceiling (inferred from filenames): {local_max} (`{local_max_name}`)")
    lines.append(f"  Total local migration files: {local_count}")
    lines.append("")

    # ── GitHub SHAs ────────────────────────────────────────────────────────────
    main_gh = github.get("main_github_sha", {})
    mcp_gh = github.get("mcp_github_sha", {})
    if main_gh.get("confidence") not in (None, "unavailable", "error"):
        gh_val = main_gh.get("value", {})
        lines.append("## Deployed SHAs (GitHub main)")
        lines.append(f"  Main: `{gh_val.get('sha', '?')}` — {gh_val.get('message', '')}")
        if mcp_gh.get("confidence") not in (None, "unavailable", "error"):
            mcp_val = mcp_gh.get("value", {})
            lines.append(f"  MCP:  `{mcp_val.get('sha', '?')}` — {mcp_val.get('message', '')}")
        local = git.get("local_sha_full", {}).get("value", "")[:7]
        gh_sha = gh_val.get("sha", "")
        if local and gh_sha and local != gh_sha:
            lines.append(f"  ⚠ Local HEAD `{local}` ≠ GitHub main `{gh_sha}` — unpushed or ahead")
        lines.append("")

    # ── Active tickets ─────────────────────────────────────────────────────────
    lines.append("## Active Tickets")
    if active_tickets:
        p0 = [t for t in active_tickets if t.get("priority") == "P0"]
        p1 = [t for t in active_tickets if t.get("priority") != "P0"]
        if p0:
            lines.append(f"  **P0 ({len(p0)})**")
            for t in p0:
                status_icon = {"active": "🔵", "in_review": "🟣", "blocked": "🔴"}.get(t.get("status"), "⚪")
                lines.append(f"  {status_icon} `{t['id']}` [{t.get('subsystem','')}] {t['title']}")
        if p1:
            lines.append(f"  **P1+ ({len(p1)})**")
            for t in p1[:6]:
                status_icon = {"active": "🔵", "in_review": "🟣", "blocked": "🔴"}.get(t.get("status"), "⚪")
                lines.append(f"  {status_icon} `{t['id']}` [{t.get('subsystem','')}] {t['title']}")
    else:
        lines.append("  No active tickets — or D1 unavailable.")
    lines.append("")

    # ── Open ticket totals by subsystem ────────────────────────────────────────
    if open_by_sub:
        lines.append("## Open Ticket Totals by Subsystem")
        for row in open_by_sub:
            bar = "█" * min(row.get("cnt", 0), 20)
            lines.append(f"  {str(row.get('subsystem','(none)')):25s} {row.get('cnt',0):3d}  {bar}")
        lines.append("")

    # ── Recently changed sentinel files ────────────────────────────────────────
    recently_changed_set = set(recently_changed)
    lines.append("## Sentinel Files")
    lines.append("_(files most likely touched by a Cursor sprint)_")
    for sf in SENTINEL_FILES:
        p = ROOT / sf
        if p.exists():
            mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)
            age_min = int((datetime.now(timezone.utc) - mtime).total_seconds() / 60)
            tag = " ← recently changed" if sf in recently_changed_set else ""
            age_str = f"{age_min}m ago" if age_min < 120 else f"{age_min // 60}h ago"
            lines.append(f"  `{sf}` — modified {age_str}{tag}")
        else:
            lines.append(f"  `{sf}` — not found (different repo?)")
    lines.append("")

    # ── Source legend ──────────────────────────────────────────────────────────
    lines.append("---")
    lines.append("_Sources: git (local) · D1 agentsam_tickets · d1_migrations ledger · GitHub API (if GITHUB_TOKEN set)_")
    lines.append(f"_Confidence: verified=live query · inferred=filename heuristic · unavailable=source offline_")

    return "\n".join(lines)


def render_json(git, migrations, d1, github, drift):
    return {
        "generated_at": NOW_ISO,
        "git": git,
        "migrations": migrations,
        "d1": d1,
        "github": github,
        "drift": drift,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    cf_loaded = load_cf_env()

    # Collect all tiers
    git = collect_git()
    migrations = collect_migrations()
    d1 = collect_d1(cf_loaded)
    github = collect_github()

    # Merge sentinel files into git dict for rendering
    git.update(collect_sentinel_files())

    drift = detect_drift(git, migrations, d1)

    # Outputs
    md = render_md(git, migrations, d1, github, drift)
    state = render_json(git, migrations, d1, github, drift)

    if DRY_RUN or (not CHECK_MODE and not JSON_MODE):
        # Default: write SESSION.md + print summary
        if DRY_RUN:
            print(md)
        else:
            SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
            SESSION_MD.write_text(md)
            print(f"✓ Session brief written to {SESSION_MD.relative_to(ROOT)}")

            if drift:
                print(f"\n⚠ {len(drift)} drift condition(s) found:")
                for d in drift:
                    print(f"  [{d['severity'].upper()}] {d['kind']}: {d['detail']}")
            else:
                print("✓ No drift detected.")

            # Always write state.json alongside
            STATE_JSON.write_text(json.dumps(state, indent=2))
            print(f"✓ State JSON written to {STATE_JSON.relative_to(ROOT)}")

    if JSON_MODE:
        if DRY_RUN:
            print(json.dumps(state, indent=2))
        else:
            SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
            STATE_JSON.write_text(json.dumps(state, indent=2))
            print(f"✓ {STATE_JSON.relative_to(ROOT)}")

    if CHECK_MODE:
        if drift:
            fail_items = [d for d in drift if d["severity"] == "fail"]
            warn_items = [d for d in drift if d["severity"] == "warn"]
            print(f"\n── Platform Brief --check ──────────────────────────────────")
            for d in drift:
                icon = "✗" if d["severity"] == "fail" else "⚠"
                print(f"  {icon} [{d['kind']}] {d['detail']}")
                for item in d.get("items", [])[:3]:
                    print(f"      {item}")
            if fail_items:
                print(f"\n✗ {len(fail_items)} FAIL condition(s) — resolve before shipping.")
                sys.exit(1)
            else:
                print(f"\n⚠ {len(warn_items)} warning(s) — review before shipping.")
                sys.exit(0)
        else:
            print("✓ --check passed. No drift detected.")
            sys.exit(0)


if __name__ == "__main__":
    main()
