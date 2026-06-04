#!/usr/bin/env python3
"""
backfill_agentsam_scripts_r2.py — move D1 agentsam_scripts.body → inneranimalmedia-autorag/scripts/

Exports registry from remote D1, uploads bytes + *.meta.md sidecars to R2, batch-updates D1
(source_stored, body='', script_hash), rebuilds inventory.json, writes overlap audit.

Usage:
  ./scripts/with-cloudflare-env.sh python3 scripts/backfill_agentsam_scripts_r2.py
  ./scripts/with-cloudflare-env.sh python3 scripts/backfill_agentsam_scripts_r2.py --dry-run
  ./scripts/with-cloudflare-env.sh python3 scripts/backfill_agentsam_scripts_r2.py --limit 20
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import textwrap
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_NAME = "inneranimalmedia-business"
WRANGLER_CONFIG = "wrangler.production.toml"
BUCKET = "inneranimalmedia-autorag"
R2_PREFIX = "scripts"
STAGING = ROOT / ".scratch" / "agentsam-scripts-backfill"
REPORT_PATH = ROOT / "scripts" / "autorag-scripts" / "OVERLAP_AUDIT.md"

VALID_LANES = frozenset(
    {"deploy", "maintenance", "cicd", "test", "ingest", "audit", "infra", "benchmark", "archive", "registry"}
)

RUNNER_EXT = {
    "bash": ".sh",
    "python": ".py",
    "node": ".mjs",
    "sql": ".sql",
    "wrangler": ".sh",
    "npm": ".cmd.txt",
}

STALE_NOTE_RE = re.compile(
    r"STALE|QUALITY_FLAGS|WRONG_|OUTDATED|deprecated|do not use|never use|not for manual",
    re.I,
)


@dataclass
class ScriptRow:
    id: str
    slug: str
    purpose: str
    path: str
    body: str
    description: str
    runner: str
    risk_level: str
    is_active: int
    source_stored: str
    notes: str
    script_hash: str = ""


@dataclass
class UploadPlan:
    slug: str
    lane: str
    r2_key: str
    local_file: Path
    meta_file: Path
    sha256: str
    content_source: str
    skipped: bool = False
    skip_reason: str = ""


def d1_query(sql: str) -> list[dict]:
    cmd = [
        str(ROOT / "scripts/with-cloudflare-env.sh"),
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "--remote",
        "-c",
        WRANGLER_CONFIG,
        "--json",
        "--command",
        sql,
    ]
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=180)
    raw = proc.stdout.strip()
    if not raw:
        raise RuntimeError((proc.stderr or "empty wrangler output")[:500])
    data = json.loads(raw)
    if isinstance(data, list) and data:
        return data[0].get("results") or []
    return []


def d1_execute_file(path: Path) -> None:
    cmd = [
        str(ROOT / "scripts/with-cloudflare-env.sh"),
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "--remote",
        "-c",
        WRANGLER_CONFIG,
        "--file",
        str(path),
    ]
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError(f"D1 execute failed: {(proc.stderr or proc.stdout)[:800]}")


def r2_put(key: str, file_path: Path) -> None:
    ct = content_type(file_path.name)
    cmd = [
        str(ROOT / "scripts/with-cloudflare-env.sh"),
        "npx",
        "wrangler",
        "r2",
        "object",
        "put",
        f"{BUCKET}/{key}",
        f"--file={file_path}",
        f"--content-type={ct}",
        "--remote",
        "-c",
        WRANGLER_CONFIG,
    ]
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(f"R2 put {key}: {(proc.stderr or proc.stdout)[:400]}")


def content_type(name: str) -> str:
    if name.endswith(".sh"):
        return "text/x-shellscript; charset=utf-8"
    if name.endswith((".mjs", ".js")):
        return "text/javascript; charset=utf-8"
    if name.endswith(".py"):
        return "text/x-python; charset=utf-8"
    if name.endswith(".sql"):
        return "text/plain; charset=utf-8"
    if name.endswith(".md"):
        return "text/markdown; charset=utf-8"
    if name.endswith(".json"):
        return "application/json; charset=utf-8"
    return "text/plain; charset=utf-8"


def lane_for(purpose: str, is_active: int) -> str:
    p = (purpose or "maintenance").strip().lower()
    if p not in VALID_LANES:
        p = "maintenance"
    if p == "archive" or (is_active == 0 and p in ("cicd", "dev")):
        return "archive"
    return p


def normalize_repo_path(path: str) -> str | None:
    p = (path or "").strip()
    if not p:
        return None
    if p.startswith("scripts/") or p.startswith("migrations/"):
        return p.split(" →")[0].split(" (")[0].strip()
    if p.startswith("./scripts/"):
        return p[2:].split(" →")[0].strip()
    if "/" in p and not p.startswith("http") and not p.startswith("npm ") and "package.json" not in p:
        if any(p.endswith(ext) for ext in (".sh", ".py", ".mjs", ".js", ".sql")):
            return p
    return None


def filename_for(row: ScriptRow, lane: str) -> str:
    repo_path = normalize_repo_path(row.path)
    if repo_path:
        base = Path(repo_path).name
        if base and base not in ("package.json",):
            return base
    ext = RUNNER_EXT.get(row.runner, ".txt")
    if row.runner == "npm":
        return f"{row.slug}.cmd.txt"
    return f"{row.slug}{ext}"


def looks_like_script_content(body: str) -> bool:
    b = (body or "").strip()
    if len(b) < 40:
        return False
    head = b[:200]
    return bool(
        re.match(r"^(\#!/|import |from |\"\"\"|-- |SELECT |CREATE |def |async function|/\*)", head, re.I)
    )


def resolve_content(row: ScriptRow) -> tuple[str, str]:
    """Returns (content, source_label)."""
    repo_path = normalize_repo_path(row.path)
    if repo_path:
        abs_path = ROOT / repo_path
        if abs_path.is_file():
            return abs_path.read_text(encoding="utf-8", errors="replace"), f"repo:{repo_path}"

    body = row.body or ""
    if looks_like_script_content(body):
        return body, "d1:body"

    if body.strip():
        return body.strip() + "\n", "d1:body-invocation"

    path = (row.path or "").strip()
    if path:
        return f"# Registry invocation\n# path: {path}\n", "path-only"

    return f"# Empty registry stub for slug={row.slug}\n", "empty"


def already_on_autorag(row: ScriptRow) -> bool:
    ss = row.source_stored or ""
    return ss.startswith(f"r2:{BUCKET}/{R2_PREFIX}/")


def write_meta(row: ScriptRow, plan: UploadPlan) -> None:
    inv = row.path or f"./scripts/... ({row.slug})"
    if normalize_repo_path(row.path):
        inv = f"./{normalize_repo_path(row.path)}"
    meta = textwrap.dedent(
        f"""\
        ---
        lane: {plan.lane}
        slug: {row.slug}
        risk: {row.risk_level or 'low'}
        status: {'canonical' if row.is_active else 'archived'}
        is_active: {row.is_active}
        runner: {row.runner}
        content_source: {plan.content_source}
        canonical_repo: {normalize_repo_path(row.path) or ''}
        r2_key: {plan.r2_key}
        sha256: {plan.sha256}
        invocation: {inv}
        updated: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}
        ---

        # {row.slug}

        # {row.description or row.slug}

        **Path:** `{row.path}`

        {row.notes or ''}
        """
    ).strip() + "\n"
    plan.meta_file.write_text(meta, encoding="utf-8")


def fetch_rows(limit: int | None) -> list[ScriptRow]:
    lim = f" LIMIT {int(limit)}" if limit else ""
    sql = (
        "SELECT id, slug, purpose, path, body, description, runner, risk_level, "
        "COALESCE(is_active,1) AS is_active, source_stored, notes, script_hash "
        f"FROM agentsam_scripts ORDER BY slug{lim}"
    )
    raw = d1_query(sql)
    rows: list[ScriptRow] = []
    for r in raw:
        rows.append(
            ScriptRow(
                id=str(r.get("id") or ""),
                slug=str(r.get("slug") or ""),
                purpose=str(r.get("purpose") or "maintenance"),
                path=str(r.get("path") or ""),
                body=str(r.get("body") or ""),
                description=str(r.get("description") or ""),
                runner=str(r.get("runner") or "bash"),
                risk_level=str(r.get("risk_level") or "low"),
                is_active=int(r.get("is_active") or 0),
                source_stored=str(r.get("source_stored") or ""),
                notes=str(r.get("notes") or ""),
                script_hash=str(r.get("script_hash") or ""),
            )
        )
    return rows


def build_plans(rows: list[ScriptRow]) -> list[UploadPlan]:
    used_keys: dict[str, str] = {}
    plans: list[UploadPlan] = []

    for row in rows:
        if already_on_autorag(row):
            plans.append(
                UploadPlan(
                    slug=row.slug,
                    lane=lane_for(row.purpose, row.is_active),
                    r2_key=row.source_stored.replace(f"r2:{BUCKET}/", ""),
                    local_file=Path(),
                    meta_file=Path(),
                    sha256=row.script_hash or "",
                    content_source="existing-r2",
                    skipped=True,
                    skip_reason="already on autorag",
                )
            )
            continue

        lane = lane_for(row.purpose, row.is_active)
        content, source = resolve_content(row)
        fname = filename_for(row, lane)

        # npm / path-only → registry lane meta-primary; still store invocation file
        if row.runner == "npm" or source in ("path-only", "empty"):
            lane = "registry" if source != "d1:body" else lane

        r2_key = f"{R2_PREFIX}/{lane}/{fname}"
        if r2_key in used_keys and used_keys[r2_key] != row.slug:
            stem = Path(fname).stem
            suffix = Path(fname).suffix
            r2_key = f"{R2_PREFIX}/{lane}/{stem}__{row.slug}{suffix}"

        used_keys[r2_key] = row.slug
        local_file = STAGING / r2_key
        local_file.parent.mkdir(parents=True, exist_ok=True)
        local_file.write_text(content, encoding="utf-8")
        sha = hashlib.sha256(content.encode("utf-8")).hexdigest()
        meta_file = STAGING / f"{r2_key}.meta.md"

        plan = UploadPlan(
            slug=row.slug,
            lane=lane,
            r2_key=r2_key,
            local_file=local_file,
            meta_file=meta_file,
            sha256=sha,
            content_source=source,
        )
        write_meta(row, plan)
        plans.append(plan)

    return plans


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def write_d1_updates(plans: list[UploadPlan], rows_by_slug: dict[str, ScriptRow]) -> Path:
    sql_path = STAGING / "d1_backfill_updates.sql"
    lines = [
        f"-- Generated {datetime.now(timezone.utc).isoformat()} by backfill_agentsam_scripts_r2.py",
        "BEGIN TRANSACTION;",
    ]
    for plan in plans:
        if plan.skipped:
            continue
        ss = f"r2:{BUCKET}/{plan.r2_key}"
        path_display = f"scripts/{plan.r2_key.replace(R2_PREFIX + '/', '', 1)}"
        lines.append(
            f"UPDATE agentsam_scripts SET "
            f"source_stored = '{sql_escape(ss)}', "
            f"path = '{sql_escape(path_display)}', "
            f"body = '', "
            f"script_hash = '{plan.sha256}', "
            f"updated_at_epoch = unixepoch() "
            f"WHERE slug = '{sql_escape(plan.slug)}';"
        )
    # Null body for any row now pointing at autorag
    lines.append(
        "UPDATE agentsam_scripts SET body = '', updated_at_epoch = unixepoch() "
        f"WHERE source_stored LIKE 'r2:{BUCKET}/{R2_PREFIX}/%' AND COALESCE(body,'') != '';"
    )
    lines.append("COMMIT;")
    sql_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return sql_path


def write_inventory(plans: list[UploadPlan], rows_by_slug: dict[str, ScriptRow]) -> Path:
    entries = []
    for plan in plans:
        row = rows_by_slug.get(plan.slug)
        if plan.skipped and plan.sha256:
            sha = plan.sha256
        elif plan.skipped:
            continue
        else:
            sha = plan.sha256
        entries.append(
            {
                "slug": plan.slug,
                "lane": plan.lane,
                "r2_key": plan.r2_key,
                "meta_key": f"{plan.r2_key}.meta.md",
                "sha256": sha,
                "risk": row.risk_level if row else "low",
                "status": "archived" if row and row.is_active == 0 else "canonical",
                "is_active": row.is_active if row else 1,
                "content_source": plan.content_source,
            }
        )
    lanes: dict[str, list] = defaultdict(list)
    for e in entries:
        lanes[e["lane"]].append(e)
    inv = {
        "schema": "iam-autorag-scripts-inventory/v1",
        "bucket": BUCKET,
        "prefix": R2_PREFIX,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "canonical_count": len(entries),
        "lanes": dict(lanes),
    }
    inv_path = STAGING / "_index" / "inventory.json"
    inv_path.parent.mkdir(parents=True, exist_ok=True)
    inv_path.write_text(json.dumps(inv, indent=2) + "\n", encoding="utf-8")
    return inv_path


def analyze_overlaps(rows: list[ScriptRow], plans: list[UploadPlan]) -> str:
    by_path: dict[str, list[str]] = defaultdict(list)
    deploy_slugs: list[str] = []
    stale: list[str] = []
    inactive: list[str] = []
    large_d1_body: list[tuple[str, int]] = []

    for row in rows:
        key = (row.path or "").strip().lower()
        if key:
            by_path[key].append(row.slug)
        if row.purpose == "deploy" or "deploy" in row.slug:
            deploy_slugs.append(row.slug)
        if STALE_NOTE_RE.search(row.notes or ""):
            stale.append(row.slug)
        if row.is_active == 0:
            inactive.append(row.slug)
        if len(row.body or "") > 5000 and not already_on_autorag(row):
            large_d1_body.append((row.slug, len(row.body)))

    dup_paths = {p: slugs for p, slugs in by_path.items() if len(slugs) > 1 and p}

    # deploy cluster heuristics
    deploy_clusters: dict[str, list[str]] = defaultdict(list)
    for s in deploy_slugs:
        norm = re.sub(r"^(a|script_|npm_)", "", s)
        norm = re.sub(r"(_prod|_full|_worker|_frontend)$", "", norm)
        deploy_clusters[norm].append(s)

    uploaded = sum(1 for p in plans if not p.skipped)
    skipped = sum(1 for p in plans if p.skipped)

    lines = [
        "# agentsam_scripts overlap & stale audit",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Summary",
        "",
        f"- Total registry rows: **{len(rows)}**",
        f"- Uploaded this run: **{uploaded}**",
        f"- Already on autorag (skipped): **{skipped}**",
        f"- Inactive (`is_active=0`): **{len(inactive)}**",
        f"- Notes flagged stale/risky: **{len(stale)}**",
        "",
        "## Duplicate paths (same `path`, multiple slugs)",
        "",
        "These are prime consolidation candidates — pick one canonical slug per path.",
        "",
    ]
    for path, slugs in sorted(dup_paths.items(), key=lambda x: -len(x[1]))[:40]:
        lines.append(f"- `{path}` → {', '.join(f'`{s}`' for s in sorted(slugs))}")

    lines.extend(["", "## Deploy slug clusters (likely overlap)", ""])
    for norm, slugs in sorted(deploy_clusters.items(), key=lambda x: -len(x[1])):
        if len(slugs) < 2:
            continue
        lines.append(f"- **{norm}**: {', '.join(f'`{s}`' for s in sorted(slugs))}")

    lines.extend(["", "## Stale / quality-flagged (from notes)", ""])
    for s in sorted(stale)[:50]:
        lines.append(f"- `{s}`")
    if len(stale) > 50:
        lines.append(f"- … and {len(stale) - 50} more")

    lines.extend(["", "## Recommended keep (tier-1 canonical — already on autorag)", ""])
    canonical = [
        "deploy_gate", "deploy_full", "deploy_frontend", "deploy_with_record",
        "with_cloudflare_env", "d1_apply_pending", "guard_no_hardcoded_identity",
        "verify_supabase_pg", "d1_bloat_audit", "upload_agentsam_scripts_r2",
    ]
    for s in canonical:
        lines.append(f"- `{s}`")

    lines.extend(["", "## Likely trash / archive candidates", ""])
    trash_hints = [
        s for s in deploy_slugs
        if s.startswith(("adeploy_", "scr_e2e_", "dev-deploy"))
        or "connor" in s
        or s.endswith("_old")
    ]
    for s in sorted(set(trash_hints))[:30]:
        lines.append(f"- `{s}` — duplicate dev/legacy deploy alias")

    lines.extend(["", "## Largest D1 bodies moved this run", ""])
    for slug, n in sorted(large_d1_body, key=lambda x: -x[1])[:20]:
        lines.append(f"- `{slug}` — {n:,} bytes")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--skip-upload", action="store_true", help="Only regenerate SQL/report")
    args = parser.parse_args()

    if Path.cwd().name != "inneranimalmedia":
        print("Run from repo root (inneranimalmedia)", file=sys.stderr)
        return 1

    STAGING.mkdir(parents=True, exist_ok=True)
    print(f"Fetching agentsam_scripts from D1…")
    rows = fetch_rows(args.limit)
    print(f"  {len(rows)} rows")

    rows_by_slug = {r.slug: r for r in rows}
    plans = build_plans(rows)
    to_upload = [p for p in plans if not p.skipped]

    print(f"  {len(to_upload)} to upload, {len(plans) - len(to_upload)} already on autorag")

    if args.dry_run:
        for p in to_upload[:15]:
            print(f"  DRY {p.slug} → {p.r2_key} ({p.content_source})")
        if len(to_upload) > 15:
            print(f"  … and {len(to_upload) - 15} more")
        report = analyze_overlaps(rows, plans)
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(report, encoding="utf-8")
        print(f"Wrote {REPORT_PATH}")
        return 0

    if not args.skip_upload:
        for i, plan in enumerate(to_upload, 1):
            print(f"[{i}/{len(to_upload)}] {plan.slug} → {plan.r2_key}")
            r2_put(plan.r2_key, plan.local_file)
            r2_put(f"{plan.r2_key}.meta.md", plan.meta_file)

        # Refresh meta for skipped autorag rows too
        inv_path = write_inventory(plans, rows_by_slug)
        print(f"Uploading inventory → {inv_path.name}")
        r2_put(f"{R2_PREFIX}/_index/inventory.json", inv_path)

        readme = ROOT / "scripts/autorag-scripts/README.md"
        if readme.is_file():
            r2_put(f"{R2_PREFIX}/README.md", readme)

    sql_path = write_d1_updates(plans, rows_by_slug)
    migration = ROOT / "migrations/561_agentsam_scripts_r2_backfill.sql"
    migration.write_text(sql_path.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Applying D1 updates ({sql_path})…")
    d1_execute_file(sql_path)

    report = analyze_overlaps(rows, plans)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"Wrote {REPORT_PATH}")

    after = d1_query(
        "SELECT COUNT(*) AS n, SUM(length(body)) AS body_bytes "
        "FROM agentsam_scripts"
    )
    if after:
        print(f"D1 after: rows={after[0].get('n')} body_bytes={after[0].get('body_bytes')}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
