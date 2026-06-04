#!/usr/bin/env python3
"""
d1_bloat_audit.py — find largest / text-heavy D1 tables (inneranimalmedia-business).

D1 has no dbstat on remote; this estimates bloat via row counts + SUM(LENGTH(text cols)).
Use results to plan rollups: move large markdown/JSON to R2, keep D1 as pointers + vectors.

Usage:
  python3 scripts/d1_bloat_audit.py
  python3 scripts/d1_bloat_audit.py --quick          # agentsam_*, otlp_*, hot ops tables (~2 min)
  python3 scripts/d1_bloat_audit.py --full           # all 576 tables (~12 min)
  python3 scripts/d1_bloat_audit.py --top 30 --json
  python3 scripts/d1_bloat_audit.py --out .scratch/d1-bloat.md

Env (from .env.cloudflare or shell):
  CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (optional)
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import textwrap
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_NAME = "inneranimalmedia-business"
WRANGLER_CONFIG = "wrangler.production.toml"
D1_DATABASE_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
CF_ACCOUNT_ID = "ede6590ac0d2fb7daf155b35653457b2"

# Column name heuristics for text/JSON payload bloat (not ids/timestamps).
BLOAT_COL_RE = re.compile(
    r"(body|content|value|markdown|_json\b|schema|payload|output|prompt|message|"
    r"text|config|metadata|description|notes|script|summary|arguments|result|"
    r"attributes|events|resource|handler|input_|output_|sql\b|embedding|merged_)",
    re.I,
)

SKIP_COL_RE = re.compile(
    r"(^id$|_id$|_at$|_at_epoch$|_hash$|_key$|_uuid$|_ref$|_url$|_path$|_email$|"
    r"_slug$|_name$|_type$|_status$|_mode$|_token$|tenant_id|workspace_id|user_id)",
    re.I,
)

QUICK_TABLE_RE = re.compile(
    r"^(agentsam_|otlp_|system_health|deployment|terminal_|cms_|worker_analytics|"
    r"ai_api_test|dashboard_versions|semantic_search)",
    re.I,
)

ROLLUP_HINTS: dict[str, str] = {
    "agentsam_tool_call_log": "Archive/purge output_json + input_json >30d; keep output_summary + ids. High churn telemetry.",
    "agentsam_tool_chain": "Same as tool_call_log — result_json dominates (~18MB). Rollup to object storage or truncate JSON.",
    "agentsam_tool_cache": "Cache table — enforce TTL + max rows; output_json should not grow unbounded.",
    "agentsam_mcp_tool_execution": "Archive old output_json; mirror agentsam_tool_call_log policy.",
    "agentsam_execution_steps": "Archive input_json/output_json after workflow completes; keep step index + status in D1.",
    "agentsam_workflow_runs": "Move step_results_json to R2 artifact; D1 row = pointer + status + cost.",
    "agentsam_webhook_events": "Rollup payload_json; retain event type + ts + external id.",
    "agentsam_scripts": "body must stay empty; canonical source in R2 (source_stored=r2:…). Re-run upload-agentsam-scripts-r2.sh.",
    "agentsam_skill": "Large SKILL.md → R2 inneranimalmedia-autorag/skills/; D1 = metadata + retrieval_strategy=r2. Embed via rag lanes.",
    "agentsam_memory": "value is prose — OK for pinned rows; archive stale; vectors live in Supabase/Vectorize not D1.",
    "agentsam_rules_document": "body_markdown → R2 or rules bucket; D1 = trigger + key + short summary.",
    "agentsam_cron_runs": "Trim metadata_json on old runs; keep status + duration.",
    "agentsam_hook_execution": "Archive payload_json; keep hook id + status.",
    "agentsam_eval_runs": "Cap grader_notes/output_text; long eval artifacts → Supabase eval tables.",
    "otlp_traces": "Retention policy on attributes_json; sample or export to observability backend.",
    "terminal_history_archive_431": "Terminal scrollback — archive to R2 or cap rows per connection.",
    "system_health_snapshots": "JSON blobs are rollups already — consider shorter retention or aggregate further.",
}


@dataclass
class ColStat:
    name: str
    bytes: int
    max_len: int = 0


@dataclass
class TableStat:
    name: str
    row_count: int = 0
    text_bytes: int = 0
    est_bytes: int = 0
    columns: list[ColStat] = field(default_factory=list)
    error: str | None = None

    @property
    def rollup_hint(self) -> str | None:
        if self.name in ROLLUP_HINTS:
            return ROLLUP_HINTS[self.name]
        if self.text_bytes > 500_000 and any(
            c.name in ("body", "content_markdown", "value", "output_json", "result_json", "payload_json")
            for c in self.columns
        ):
            return "Large text/JSON in D1 — prefer R2 pointer + vector lanes (Supabase/CF Vectorize) for search."
        return None


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    env_file = ROOT / ".env.cloudflare"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"):
        if k in env:
            env.setdefault(k.replace("CLOUDFLARE_", "CF_").replace("_API_TOKEN", "_API_TOKEN"), env[k])
    return env


def d1_query(sql: str, env: dict[str, str]) -> list[dict]:
    """Run SQL on remote D1 via wrangler (uses with-cloudflare-env.sh)."""
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
    proc = subprocess.run(
        cmd,
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    raw = proc.stdout.strip()
    if not raw:
        err = (proc.stderr or "")[:400]
        raise RuntimeError(err or "empty wrangler output")
    data = json.loads(raw)
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(str(data["error"])[:400])
    if isinstance(data, list) and data:
        return data[0].get("results") or []
    return []


def d1_info_database_size() -> str | None:
    proc = subprocess.run(
        [str(ROOT / "scripts/with-cloudflare-env.sh"), "npx", "wrangler", "d1", "info", DB_NAME, "-c", WRANGLER_CONFIG],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    for line in proc.stdout.splitlines():
        if "database_size" in line.lower() or "database size" in line.lower():
            parts = line.split("│")
            if len(parts) >= 3:
                return parts[2].strip()
    m = re.search(r"database_size\s*\│\s*([^\│]+)", proc.stdout)
    return m.group(1).strip() if m else None


def list_tables(env: dict[str, str]) -> list[str]:
    rows = d1_query(
        "SELECT name FROM sqlite_master "
        "WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' "
        "ORDER BY name",
        env,
    )
    return [r["name"] for r in rows]


def table_columns(table: str, env: dict[str, str]) -> list[tuple[str, str]]:
    rows = d1_query(
        f"SELECT name, type FROM pragma_table_info('{table.replace(chr(39), '')}')",
        env,
    )
    return [(r["name"], r.get("type") or "TEXT") for r in rows]


def pick_bloat_columns(cols: list[tuple[str, str]], max_cols: int = 8) -> list[str]:
    out: list[str] = []
    for name, typ in cols:
        if typ not in ("TEXT", "BLOB", "JSON"):
            continue
        if SKIP_COL_RE.search(name):
            continue
        if BLOAT_COL_RE.search(name):
            out.append(name)
    return out[:max_cols]


def scan_table(table: str, env: dict[str, str], analyze_text: bool) -> TableStat:
    stat = TableStat(name=table)
    try:
        cols = table_columns(table, env)
        bloat_cols = pick_bloat_columns(cols) if analyze_text else []

        if bloat_cols:
            parts = [
                f'SUM(LENGTH(COALESCE("{c}", \'\'))) AS "{c}"' for c in bloat_cols
            ]
            max_parts = [
                f'MAX(LENGTH(COALESCE("{c}", \'\'))) AS "m_{c}"' for c in bloat_cols
            ]
            sql = (
                f'SELECT COUNT(*) AS rc, {", ".join(parts + max_parts)} FROM "{table}"'
            )
            row = d1_query(sql, env)[0]
            stat.row_count = int(row.get("rc") or 0)
            for c in bloat_cols:
                b = int(row.get(c) or 0)
                if b:
                    stat.columns.append(
                        ColStat(name=c, bytes=b, max_len=int(row.get(f"m_{c}") or 0))
                    )
            stat.text_bytes = sum(c.bytes for c in stat.columns)
            stat.est_bytes = stat.text_bytes if stat.text_bytes else stat.row_count * 120
        else:
            row = d1_query(f'SELECT COUNT(*) AS rc FROM "{table}"', env)[0]
            stat.row_count = int(row.get("rc") or 0)
            stat.est_bytes = stat.row_count * 120
    except Exception as e:
        stat.error = str(e)[:200]
    return stat


def filter_tables(tables: list[str], mode: str, prefix: str | None) -> list[str]:
    if prefix:
        p = prefix.lower()
        return [t for t in tables if t.lower().startswith(p)]
    if mode == "quick":
        return [t for t in tables if QUICK_TABLE_RE.match(t)]
    return tables


def fmt_bytes(n: int) -> str:
    if n >= 1024 * 1024:
        return f"{n / 1024 / 1024:.2f} MB"
    if n >= 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n} B"


def render_markdown(
    stats: list[TableStat],
    db_size: str | None,
    mode: str,
    table_total: int,
    scanned: int,
) -> str:
    lines = [
        "# D1 bloat audit — inneranimalmedia-business",
        "",
        f"- **Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"- **Reported DB size:** {db_size or 'unknown'}",
        f"- **Mode:** {mode}",
        f"- **Tables in DB:** {table_total}",
        f"- **Tables scanned:** {scanned}",
        f"- **Estimated text payload (scanned):** {fmt_bytes(sum(s.text_bytes for s in stats))}",
        "",
        "> D1 remote has no `dbstat`. Sizes are `SUM(LENGTH(text_col))` estimates, not exact page bytes.",
        "",
        "## Top tables by estimated text bytes",
        "",
        "| Rank | Table | Rows | Text est. | Top columns | Rollup hint |",
        "|------|-------|------|-----------|-------------|-------------|",
    ]

    ranked = sorted(stats, key=lambda s: s.est_bytes, reverse=True)
    for i, s in enumerate(ranked[:40], 1):
        top_cols = ", ".join(
            f"`{c.name}` {fmt_bytes(c.bytes)}" for c in sorted(s.columns, key=lambda x: x.bytes, reverse=True)[:3]
        )
        hint = (s.rollup_hint or "").replace("|", "/")[:80]
        err = f" ⚠ {s.error}" if s.error else ""
        lines.append(
            f"| {i} | `{s.name}` | {s.row_count:,} | {fmt_bytes(s.text_bytes or s.est_bytes)} | {top_cols or '—'} | {hint or '—'}{err} |"
        )

    lines.extend(
        [
            "",
            "## Architecture reminders",
            "",
            "- **D1:** registry, pointers, short summaries, operational state.",
            "- **R2:** canonical script/skill/doc bytes (`source_stored=r2:…`).",
            "- **Supabase + CF Vectorize:** embed/chunk for semantic search (1536 / 3072 lanes).",
            "- **Do not** store full SKILL.md, script bodies, or tool I/O JSON long-term in D1.",
            "",
            "## Suggested next actions",
            "",
        ]
    )

    seen: set[str] = set()
    for s in ranked:
        h = s.rollup_hint
        if not h or s.name in seen or s.text_bytes < 200_000:
            continue
        seen.add(s.name)
        lines.append(f"- **`{s.name}`** ({fmt_bytes(s.text_bytes)}): {h}")

    if not seen:
        lines.append("- No critical rollup hints triggered; re-run with `--full` for complete inventory.")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description="Audit D1 table bloat (inneranimalmedia-business)")
    ap.add_argument("--full", action="store_true", help="Scan all tables (~12 min)")
    ap.add_argument("--quick", action="store_true", help="Scan hot/agentsam tables only (~2 min)")
    ap.add_argument("--prefix", help="Only tables starting with this prefix")
    ap.add_argument("--workers", type=int, default=6, help="Parallel wrangler workers (default 6)")
    ap.add_argument("--top", type=int, default=40, help="Rows in markdown report")
    ap.add_argument("--json", action="store_true", dest="as_json", help="Print JSON to stdout")
    ap.add_argument(
        "--out",
        type=Path,
        help="Write markdown report (default: .scratch/d1-bloat-audit-YYYYMMDD.md)",
    )
    ap.add_argument(
        "--count-only",
        action="store_true",
        help="Row counts only (fast pass, no LENGTH aggregation)",
    )
    args = ap.parse_args()

    mode = "full" if args.full else ("quick" if args.quick or args.prefix else "default")
    if not args.full and not args.quick and not args.prefix:
        mode = "quick"  # sensible default

    env = load_env()
    if not env.get("CLOUDFLARE_API_TOKEN"):
        print("Missing CLOUDFLARE_API_TOKEN — set in .env.cloudflare", file=sys.stderr)
        return 1

    print(f"Loading table list from {DB_NAME}…", file=sys.stderr)
    all_tables = list_tables(env)
    tables = filter_tables(all_tables, mode, args.prefix)
    print(f"Scanning {len(tables)} / {len(all_tables)} tables (mode={mode}, workers={args.workers})…", file=sys.stderr)

    db_size = d1_info_database_size()
    stats: list[TableStat] = []
    done = 0

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {
            pool.submit(scan_table, t, env, not args.count_only): t for t in tables
        }
        for fut in as_completed(futures):
            done += 1
            if done % 25 == 0 or done == len(tables):
                print(f"  {done}/{len(tables)}", file=sys.stderr)
            try:
                stats.append(fut.result())
            except Exception as e:
                stats.append(TableStat(name=futures[fut], error=str(e)))

    stats.sort(key=lambda s: s.est_bytes, reverse=True)

    out_path = args.out
    if out_path is None and not args.as_json:
        out_path = ROOT / ".scratch" / f"d1-bloat-audit-{datetime.now(timezone.utc).strftime('%Y%m%d')}.md"
    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        md = render_markdown(stats, db_size, mode, len(all_tables), len(tables))
        out_path.write_text(md, encoding="utf-8")
        print(f"Wrote {out_path}", file=sys.stderr)

    if args.as_json:
        payload = {
            "database": DB_NAME,
            "database_size": db_size,
            "mode": mode,
            "tables_total": len(all_tables),
            "tables_scanned": len(tables),
            "estimated_text_bytes": sum(s.text_bytes for s in stats),
            "tables": [
                {
                    **{k: v for k, v in asdict(s).items() if k != "columns"},
                    "columns": [asdict(c) for c in s.columns],
                    "rollup_hint": s.rollup_hint,
                }
                for s in stats[: args.top]
            ],
        }
        print(json.dumps(payload, indent=2))
    else:
        print("\nTop tables by estimated text bytes:\n")
        for s in stats[: min(args.top, 25)]:
            tops = ", ".join(f"{c.name}:{fmt_bytes(c.bytes)}" for c in sorted(s.columns, key=lambda x: x.bytes, reverse=True)[:3])
            hint = f"  ← {s.rollup_hint[:70]}…" if s.rollup_hint and len(s.rollup_hint) > 70 else (f"  ← {s.rollup_hint}" if s.rollup_hint else "")
            print(f"  {fmt_bytes(s.text_bytes or s.est_bytes):>10}  rows={s.row_count:>6}  {s.name}  [{tops}]{hint}")

        print(f"\nDB size (Cloudflare): {db_size or '?'}", file=sys.stderr)
        print(f"Estimated text scanned: {fmt_bytes(sum(s.text_bytes for s in stats))}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
