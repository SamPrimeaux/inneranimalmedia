#!/usr/bin/env python3
"""
locate_agentsam_p0_writer_hooks.py
==================================

Read-only locator for P0 D1 writer hook candidates (closed-loop tables with
missing or unreliable write paths).

Produces:
  artifacts/agentsam_p0_writer_hooks/HOOK_CANDIDATES.md
  artifacts/agentsam_p0_writer_hooks/schema.json
  artifacts/agentsam_p0_writer_hooks/source_hits.json
  artifacts/agentsam_p0_writer_hooks/NEXT_CURSOR_PATCH.md

Anchors (gap pack v2):
  plan_id: plan_cursor_gap_pack_20260516
  task_id: task_locate_p0_writer_hooks
  pack_id: agentsam_cursor_gap_pack_v2_20260516
  vectorize_index: ai-search-inneranimalmedia-autorag

Usage (repo root):
  python3 scripts/locate_agentsam_p0_writer_hooks.py
  ./scripts/with-cloudflare-env.sh python3 scripts/locate_agentsam_p0_writer_hooks.py --with-d1
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "artifacts" / "agentsam_p0_writer_hooks"
SCHEMA_SNAPSHOT = REPO / "docs" / "db" / "agentsam-d1-context" / "2026-05-07_agentsam-schema.json"

PLAN_ID = "plan_cursor_gap_pack_20260516"
TASK_ID = "task_locate_p0_writer_hooks"
PACK_ID = "agentsam_cursor_gap_pack_v2_20260516"
VECTORIZE_INDEX = "ai-search-inneranimalmedia-autorag"

TABLES = [
    "agentsam_compaction_events",
    "agentsam_guardrail_events",
    "agentsam_skill_revision",
    "agentsam_user_feature_override",
]

SCAN_ROOTS = ("src", "dashboard", "scripts", "migrations")
SKIP_DIR_NAMES = {
    ".git",
    "node_modules",
    ".wrangler",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    "patch_results",
}
SKIP_FILE_SUFFIXES = (".min.js", ".orig", ".map")
SKIP_REL_PATHS = {
    "scripts/locate_agentsam_p0_writer_hooks.py",
}

# Curated hook symbols / routes (scored separately from raw SQL hits)
CURATED_HOOKS: dict[str, list[dict[str, str]]] = {
    "agentsam_compaction_events": [
        {
            "symbol": "scheduleCompactionEvent",
            "file": "src/core/agentsam-ops-ledger.js",
            "role": "writer_helper",
            "note": "Dynamic INSERT via buildInsertParts; exported but has zero call sites in src/.",
        },
        {
            "symbol": "settings-sections compaction query",
            "file": "src/api/settings-sections.js",
            "role": "reader",
            "note": "SELECT uses columns kind/status — verify against live PRAGMA (schema uses provider/tokens_*).",
        },
        {
            "symbol": "anthropic compaction beta",
            "file": "src/integrations/anthropic.js",
            "role": "upstream_signal",
            "note": "features.compaction adds compact-2026-01-12 beta; wire scheduleCompactionEvent after successful compact.",
        },
        {
            "symbol": "agent chat stream loop",
            "file": "src/api/agent.js",
            "role": "wire_target",
            "note": "Primary chat path; no scheduleCompactionEvent import today.",
        },
    ],
    "agentsam_guardrail_events": [
        {
            "symbol": "scheduleGuardrailEvent",
            "file": "src/core/guardrails.js",
            "role": "writer_helper",
            "note": "INSERT on every matched guardrail; internal, called from evaluateGuardrails.",
        },
        {
            "symbol": "evaluateGuardrails",
            "file": "src/core/guardrails.js",
            "role": "orchestrator",
            "note": "Loads agentsam_guardrails, fires audit rows.",
        },
        {
            "symbol": "evaluateGuardrails (model)",
            "file": "src/api/agent.js",
            "role": "caller",
            "note": "applies_to: model before dispatchStream (~line 3105).",
        },
        {
            "symbol": "evaluateGuardrails (mcp_tool)",
            "file": "src/api/agent.js",
            "role": "caller",
            "note": "applies_to: mcp_tool before tool execution (~line 3614).",
        },
        {
            "symbol": "analytics guardrail board",
            "file": "src/api/analytics/boards.js",
            "role": "reader",
            "note": "SELECT * for dashboard Advisors tab.",
        },
    ],
    "agentsam_skill_revision": [
        {
            "symbol": "PATCH /api/settings/skills/:id",
            "file": "src/api/settings.js",
            "role": "writer",
            "note": "INSERT revision only when content_markdown in PATCH body; errors swallowed via .catch.",
        },
        {
            "symbol": "POST /api/settings/skills",
            "file": "src/api/settings.js",
            "role": "gap",
            "note": "Creates agentsam_skill row but does not seed agentsam_skill_revision v1.",
        },
        {
            "symbol": "useSettingsData skills PATCH",
            "file": "dashboard/components/settings/hooks/useSettingsData.ts",
            "role": "ui_caller",
            "note": "Dashboard settings skills editor.",
        },
        {
            "symbol": "migration seed",
            "file": "migrations/177_agentsam_skill_parity.sql",
            "role": "migration_seed",
            "note": "One-time INSERT backfill for parity migration.",
        },
    ],
    "agentsam_user_feature_override": [
        {
            "symbol": "isFeatureEnabledFallback",
            "file": "src/core/features.js",
            "role": "reader",
            "note": "SELECT enabled per user_id + flag_key when extended flag columns missing.",
        },
        {
            "symbol": "loadFeatureFlags",
            "file": "src/core/auth.js",
            "role": "reader",
            "note": "Bulk SELECT overrides; merges into session feature_flags (~60s KV cache).",
        },
        {
            "symbol": "isFeatureEnabled",
            "file": "src/core/features.js",
            "role": "orchestrator",
            "note": "Runtime gate; callers include routing-thompson-flag, workflows, command-run-telemetry.",
        },
        {
            "symbol": "settings feature API",
            "file": "src/api/settings.js",
            "role": "gap",
            "note": "No PATCH/POST route for agentsam_user_feature_override; only feature_flags_json on profile rows.",
        },
    ],
}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_schema_from_snapshot() -> dict[str, Any]:
    if not SCHEMA_SNAPSHOT.is_file():
        return {"source": "missing_snapshot", "tables": {}}
    data = json.loads(SCHEMA_SNAPSHOT.read_text(encoding="utf-8"))
    tables_block = data.get("tables") or data.get("schema", {}).get("tables") or []
    out: dict[str, Any] = {}
    if isinstance(tables_block, list):
        for t in tables_block:
            name = t.get("name")
            if name in TABLES:
                out[name] = {
                    "columns": t.get("columns") or [],
                    "compact_columns": t.get("compact_columns"),
                    "create_sql": t.get("create_sql"),
                    "row_count_snapshot": t.get("row_count"),
                    "group": t.get("group"),
                }
    return {"source": str(SCHEMA_SNAPSHOT.relative_to(REPO)), "tables": out}


def load_schema_from_d1() -> dict[str, Any]:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not token:
        return {}
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "ede6590ac0d2fb7daf155b35653457b2")
    db_id = os.environ.get("D1_DATABASE_ID", "cf87b717-d4e2-4cf8-bab0-a81268e32d49")
    import urllib.error
    import urllib.request

    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db_id}/query"
    )
    tables_out: dict[str, Any] = {}
    for table in TABLES:
        sql = f"PRAGMA table_info({table})"
        payload = json.dumps({"sql": sql}).encode()
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                body = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            tables_out[table] = {"error": e.read().decode("utf-8", "replace")[:500]}
            continue
        if not body.get("success"):
            tables_out[table] = {"error": body.get("errors")}
            continue
        cols = (body.get("result") or [{}])[0].get("results") or []
        count_sql = f"SELECT COUNT(*) AS n FROM {table}"
        req2 = urllib.request.Request(
            url,
            data=json.dumps({"sql": count_sql}).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        row_count = None
        try:
            with urllib.request.urlopen(req2, timeout=45) as resp2:
                cbody = json.loads(resp2.read().decode())
            if cbody.get("success"):
                rows = (cbody.get("result") or [{}])[0].get("results") or []
                row_count = rows[0].get("n") if rows else None
        except Exception:
            pass
        tables_out[table] = {
            "columns": cols,
            "row_count_live": row_count,
        }
    return {"source": "d1_remote", "tables": tables_out}


def iter_source_files() -> list[Path]:
    files: list[Path] = []
    for root_name in SCAN_ROOTS:
        root = REPO / root_name
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if any(part in SKIP_DIR_NAMES for part in path.parts):
                continue
            if path.suffix in {".png", ".jpg", ".woff", ".woff2", ".gif", ".ico", ".zip"}:
                continue
            if any(path.name.endswith(s) for s in SKIP_FILE_SUFFIXES):
                continue
            rel_check = str(path.relative_to(REPO))
            if rel_check in SKIP_REL_PATHS:
                continue
            if path.suffix not in {
                ".js",
                ".jsx",
                ".ts",
                ".tsx",
                ".mjs",
                ".sql",
                ".py",
                ".md",
            }:
                continue
            files.append(path)
    return sorted(files)


def classify_line(line: str, table: str) -> str | None:
    upper = line.upper()
    if re.search(rf"\bINSERT\s+INTO\s+{re.escape(table)}\b", upper):
        return "insert"
    if re.search(rf"\bUPDATE\s+{re.escape(table)}\b", upper):
        return "update"
    if re.search(rf"\bDELETE\s+FROM\s+{re.escape(table)}\b", upper):
        return "delete"
    if re.search(rf"\bREPLACE\s+INTO\s+{re.escape(table)}\b", upper):
        return "replace"
    if table in line and re.search(r"\bSELECT\b", upper):
        return "select"
    if table in line:
        return "reference"
    return None


def file_level_write_hits(rel: str, text: str) -> dict[str, list[dict[str, Any]]]:
    """Catch multi-line template SQL (INSERT on one line, table on the next)."""
    out: dict[str, list[dict[str, Any]]] = {t: [] for t in TABLES}
    for table in TABLES:
        for kind, pattern in (
            ("insert", rf"\bINSERT\s+INTO\s+{re.escape(table)}\b"),
            ("update", rf"\bUPDATE\s+{re.escape(table)}\b"),
            ("replace", rf"\bREPLACE\s+INTO\s+{re.escape(table)}\b"),
        ):
            for m in re.finditer(pattern, text, re.IGNORECASE | re.DOTALL):
                line = text[: m.start()].count("\n") + 1
                snippet = text[m.start() : m.start() + 120].replace("\n", " ").strip()
                out[table].append(
                    {
                        "file": rel,
                        "line": line,
                        "kind": kind,
                        "snippet": snippet[:240],
                        "detection": "file_multiline",
                    }
                )
    return out


def scan_sources(files: list[Path]) -> dict[str, Any]:
    hits_by_table: dict[str, list[dict[str, Any]]] = {t: [] for t in TABLES}
    symbol_refs: dict[str, set[str]] = defaultdict(set)

    symbol_patterns = {
        "scheduleCompactionEvent": re.compile(r"\bscheduleCompactionEvent\b"),
        "scheduleGuardrailEvent": re.compile(r"\bscheduleGuardrailEvent\b"),
        "evaluateGuardrails": re.compile(r"\bevaluateGuardrails\b"),
        "isFeatureEnabled": re.compile(r"\bisFeatureEnabled\b"),
        "loadFeatureFlags": re.compile(r"\bloadFeatureFlags\b"),
        "isFeatureEnabledFallback": re.compile(r"\bisFeatureEnabledFallback\b"),
    }

    for path in files:
        rel = str(path.relative_to(REPO))
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        file_writes = file_level_write_hits(rel, text)
        for table, wh_list in file_writes.items():
            for wh in wh_list:
                dedupe_key = (wh["file"], wh["line"], wh["kind"])
                existing = {
                    (h["file"], h["line"], h["kind"])
                    for h in hits_by_table[table]
                }
                if dedupe_key not in existing:
                    hits_by_table[table].append(wh)

        lines = text.splitlines()
        for i, line in enumerate(lines, start=1):
            for sym, pat in symbol_patterns.items():
                if pat.search(line):
                    symbol_refs[sym].add(f"{rel}:{i}")
            for table in TABLES:
                if table not in line:
                    continue
                kind = classify_line(line, table)
                if not kind:
                    continue
                hits_by_table[table].append(
                    {
                        "file": rel,
                        "line": i,
                        "kind": kind,
                        "snippet": line.strip()[:240],
                    }
                )

    return {
        "scanned_files": len(files),
        "hits_by_table": hits_by_table,
        "symbol_refs": {k: sorted(v) for k, v in symbol_refs.items()},
    }


def writer_status(table: str, hits: list[dict[str, Any]], symbol_refs: dict[str, list[str]]) -> dict[str, Any]:
    writes = [h for h in hits if h["kind"] in ("insert", "update", "replace")]
    reads = [h for h in hits if h["kind"] in ("select", "reference")]
    prod_writes = [
        h
        for h in writes
        if not h["file"].startswith("migrations/")
        and not h["file"].startswith("scripts/")
        and "seed_" not in Path(h["file"]).name
    ]
    prod_writes_excluding_helper_def = [
        h
        for h in prod_writes
        if not (
            table == "agentsam_compaction_events"
            and h["file"] == "src/core/agentsam-ops-ledger.js"
        )
    ]

    status = "missing_writer"
    rationale = "No INSERT/UPDATE in src/ production paths."

    if table == "agentsam_guardrail_events" and prod_writes:
        status = "writer_present"
        rationale = "INSERT in src/core/guardrails.js; verify rows on live guardrail matches."
    elif table == "agentsam_skill_revision" and prod_writes:
        status = "writer_partial"
        rationale = (
            "INSERT on PATCH /api/settings/skills/:id when content_markdown changes; "
            "POST create and agent-skill paths do not append revision."
        )
    elif table == "agentsam_compaction_events":
        helper_refs = symbol_refs.get("scheduleCompactionEvent", [])
        external = [
            r
            for r in helper_refs
            if "agentsam-ops-ledger.js" not in r
            and "locate_agentsam_p0_writer_hooks.py" not in r
        ]
        if external or prod_writes_excluding_helper_def:
            status = "writer_present" if external else "writer_partial"
            rationale = (
                f"scheduleCompactionEvent helper + {len(external)} external call site(s)."
            )
        else:
            status = "writer_orphan_helper"
            rationale = (
                "scheduleCompactionEvent exported in agentsam-ops-ledger.js but never called."
            )
    elif table == "agentsam_user_feature_override":
        if prod_writes:
            status = "writer_partial"
            rationale = "Some write path found; confirm it is not migration-only."
        else:
            status = "missing_writer"
            rationale = "Only SELECT readers (features.js, auth.js); no API upsert route."

    return {
        "status": status,
        "rationale": rationale,
        "write_hits": len(writes),
        "prod_write_hits": len(prod_writes),
        "read_hits": len(reads),
    }


def build_hook_candidates(
    scan: dict[str, Any], schema: dict[str, Any]
) -> dict[str, Any]:
    symbol_refs = scan.get("symbol_refs") or {}
    candidates: dict[str, Any] = {}
    for table in TABLES:
        hits = scan["hits_by_table"][table]
        ws = writer_status(table, hits, symbol_refs)
        curated = CURATED_HOOKS.get(table, [])
        compaction_callers = [
            r
            for r in symbol_refs.get("scheduleCompactionEvent", [])
            if "agentsam-ops-ledger.js" not in r
            and "locate_agentsam_p0_writer_hooks.py" not in r
        ]
        candidates[table] = {
            **ws,
            "curated_hooks": curated,
            "top_write_hits": [h for h in hits if h["kind"] in ("insert", "update", "replace")][:12],
            "top_read_hits": [h for h in hits if h["kind"] == "select"][:8],
            "schedule_compaction_external_callers": compaction_callers,
            "evaluate_guardrails_callers": [
                r
                for r in symbol_refs.get("evaluateGuardrails", [])
                if "guardrails.js" not in r
                and "locate_agentsam_p0_writer_hooks.py" not in r
            ],
        }
    return candidates


def render_hook_candidates_md(candidates: dict[str, Any], meta: dict[str, Any]) -> str:
    lines = [
        "# P0 D1 writer hook candidates",
        "",
        f"- Generated: `{meta['generated_at']}`",
        f"- plan_id: `{PLAN_ID}`",
        f"- task_id: `{TASK_ID}`",
        f"- pack_id: `{PACK_ID}`",
        f"- vectorize_index: `{VECTORIZE_INDEX}`",
        f"- Schema source: `{meta.get('schema_source', 'unknown')}`",
        "",
        "Read-only scan of `src/`, `dashboard/`, `scripts/`, `migrations/`. "
        "Use with Vectorize pack `agentsam_cursor_gap_pack_v2_20260516` before patching.",
        "",
    ]
    for table in TABLES:
        c = candidates[table]
        lines += [
            f"## `{table}`",
            "",
            f"- **Writer status:** `{c['status']}`",
            f"- **Rationale:** {c['rationale']}",
            f"- **SQL writes (all / prod):** {c['write_hits']} / {c['prod_write_hits']} · **reads:** {c['read_hits']}",
            "",
            "### Curated hook candidates",
            "",
        ]
        for h in c["curated_hooks"]:
            lines.append(
                f"- **{h['role']}** — `{h['symbol']}` → `{h['file']}`  \n  {h['note']}"
            )
        if c.get("schedule_compaction_external_callers") is not None and table == "agentsam_compaction_events":
            lines += [
                "",
                f"- **External `scheduleCompactionEvent` call sites:** "
                f"{len(c['schedule_compaction_external_callers']) or 0}",
            ]
        if table == "agentsam_guardrail_events" and c.get("evaluate_guardrails_callers"):
            lines += ["", "### `evaluateGuardrails` call sites", ""]
            for ref in c["evaluate_guardrails_callers"][:10]:
                lines.append(f"- `{ref}`")
        lines += ["", "### Top SQL write hits", ""]
        if c["top_write_hits"]:
            for h in c["top_write_hits"]:
                lines.append(f"- `{h['file']}:{h['line']}` ({h['kind']}) — `{h['snippet'][:100]}`")
        else:
            lines.append("- _(none in production src/)_")
        lines += ["", "### Top SQL read hits", ""]
        if c["top_read_hits"]:
            for h in c["top_read_hits"][:6]:
                lines.append(f"- `{h['file']}:{h['line']}` — `{h['snippet'][:100]}`")
        else:
            lines.append("- _(none)_")
        lines.append("")
    return "\n".join(lines)


def render_next_cursor_patch(candidates: dict[str, Any]) -> str:
    return "\n".join(
        [
            "# NEXT_CURSOR_PATCH — P0 writer hooks",
            "",
            f"plan_id: `{PLAN_ID}` · task_id: `{TASK_ID}` · pack_id: `{PACK_ID}`",
            "",
            "Ordered patches for a follow-up Cursor session (do not apply blindly — read HOOK_CANDIDATES.md).",
            "",
            "## 1. `agentsam_compaction_events` — wire orphan helper",
            "",
            "- Import `scheduleCompactionEvent` from `src/core/agentsam-ops-ledger.js` in `src/api/agent.js`.",
            "- After Anthropic/OpenAI context compaction succeeds (see `src/integrations/anthropic.js` `features.compaction`), call:",
            "  - `tenant_id`, `workspace_id`, `user_id`, `session_id`",
            "  - `provider`, `model_key`, `tokens_before`, `tokens_after`, `compaction_strategy`",
            "- Fix `src/api/settings-sections.js` compaction SELECT to use real columns (`provider`, `compacted_at`, `tokens_saved`), not `kind`/`status`.",
            "",
            "## 2. `agentsam_guardrail_events` — verify + extend coverage",
            "",
            "- Writer exists: `scheduleGuardrailEvent` in `src/core/guardrails.js`.",
            "- Confirm live rows after tool/model guardrail triggers in `/api/agent/chat`.",
            "- Optional: add `evaluateGuardrails` for `route` / `rag` applies_to on high-risk API paths.",
            "- Optional: load `agentsam_guardrail_rulesets` inside `evaluateGuardrails` (see `scripts/seed_session_plan.py` note).",
            "",
            "## 3. `agentsam_skill_revision` — close create + agent paths",
            "",
            "- After `POST /api/settings/skills`, insert revision v1 from initial `content_markdown`.",
            "- Remove silent `.catch` on PATCH revision INSERT — surface 500 or log via `scheduleAgentsamErrorLog`.",
            "- On agent skill tool updates (if any), append revision same as settings PATCH.",
            "",
            "## 4. `agentsam_user_feature_override` — add upsert API",
            "",
            "- Add `PATCH /api/settings/feature-flags/:flag_key` (or bulk) upserting `(user_id, flag_key, enabled)`.",
            "- Invalidate KV cache key `ff:{userId}` from `loadFeatureFlags` after write.",
            "- Dashboard: expose per-user overrides in settings/general (join `agentsam_feature_flag`).",
            "",
            "## Validation",
            "",
            "```bash",
            "./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \\",
            "  -c wrangler.production.toml --command \"SELECT 'compaction' t, COUNT(*) n FROM agentsam_compaction_events",
            "UNION ALL SELECT 'guardrail', COUNT(*) FROM agentsam_guardrail_events",
            "UNION ALL SELECT 'skill_rev', COUNT(*) FROM agentsam_skill_revision",
            "UNION ALL SELECT 'ff_override', COUNT(*) FROM agentsam_user_feature_override\"",
            "```",
            "",
            "- Trigger guardrail + skill PATCH + feature override in staging; confirm row counts increase.",
            "- Mark `task_locate_p0_writer_hooks` done in D1; append `session_notes` on `plan_cursor_gap_pack_20260516`.",
            "",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Locate P0 agentsam D1 writer hooks (read-only).")
    parser.add_argument(
        "--with-d1",
        action="store_true",
        help="Merge live PRAGMA + row counts from remote D1 (needs CLOUDFLARE_API_TOKEN).",
    )
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    schema: dict[str, Any] = {
        "meta": {
            "generated_at": utc_now(),
            "plan_id": PLAN_ID,
            "task_id": TASK_ID,
            "pack_id": PACK_ID,
            "vectorize_index": VECTORIZE_INDEX,
        },
        "snapshot": load_schema_from_snapshot(),
    }
    if args.with_d1:
        live = load_schema_from_d1()
        if live:
            schema["live_d1"] = live
            schema["meta"]["schema_source"] = "snapshot+d1_remote"
        else:
            schema["meta"]["schema_source"] = "snapshot_only (d1 fetch skipped/failed)"
    else:
        schema["meta"]["schema_source"] = "snapshot_only"

    source_files = iter_source_files()
    scan = scan_sources(source_files)
    candidates = build_hook_candidates(scan, schema)

    source_hits = {
        "meta": schema["meta"],
        "candidates": candidates,
        "hits_by_table": scan["hits_by_table"],
        "symbol_refs": scan["symbol_refs"],
        "scanned_file_count": scan["scanned_files"],
    }

    (OUT_DIR / "schema.json").write_text(
        json.dumps(schema, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "source_hits.json").write_text(
        json.dumps(source_hits, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "HOOK_CANDIDATES.md").write_text(
        render_hook_candidates_md(candidates, schema["meta"]),
        encoding="utf-8",
    )
    (OUT_DIR / "NEXT_CURSOR_PATCH.md").write_text(
        render_next_cursor_patch(candidates),
        encoding="utf-8",
    )

    print(f"Wrote artifacts under {OUT_DIR.relative_to(REPO)}/")
    for table in TABLES:
        c = candidates[table]
        print(f"  {table}: {c['status']} (prod writes={c['prod_write_hits']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
