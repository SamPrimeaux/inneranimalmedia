#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Any

DEFAULT_IN = "artifacts/agentsam_cursor_gap_pack"
DEFAULT_OUT = "artifacts/agentsam_cursor_gap_pack_v2"

CHUNK_TARGET = 2200
CHUNK_OVERLAP = 250

CURATED_FILES = [
    "artifacts/agentsam_cursor_gap_pack/00_INDEX.md",
    "artifacts/agentsam_cursor_gap_pack/15_cursor_quality_gap_summary.md",
    "artifacts/agentsam_cursor_gap_pack/17_openai_recommendations.md",
    "artifacts/agentsam_cursor_gap_pack/findings.json",
    "artifacts/agentsam_cursor_gap_pack/table_usage.json",
    "src/api/agent.js",
    "src/core/routing.js",
    "src/core/capability-router.js",
    "src/core/workflow-executor.js",
    "dashboard/App.tsx",
    "dashboard/features/agent-chat/ChatAssistant.tsx",
    "dashboard/features/agent-chat/hooks/useAgentChatStream.ts",
    "dashboard/features/agent-chat/streamParsing.ts",
    "dashboard/src/EditorContext.tsx",
    "scripts/build_agentsam_cursor_gap_pack.py",
]

ALLOWED_ARTIFACTS = {
    "artifacts/agentsam_cursor_gap_pack/00_INDEX.md",
    "artifacts/agentsam_cursor_gap_pack/15_cursor_quality_gap_summary.md",
    "artifacts/agentsam_cursor_gap_pack/17_openai_recommendations.md",
    "artifacts/agentsam_cursor_gap_pack/findings.json",
    "artifacts/agentsam_cursor_gap_pack/table_usage.json",
}

NOISY_PREFIXES = (
    "artifacts/",
    "analytics/",
    ".tmp/",
    "iam-test-reports/",
    "captures/",
    ".deploy-",
    "node_modules/",
    "dist/",
    "dashboard/dist/",
    ".wrangler/",
)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha16(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()[:16]


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    data = path.read_bytes()
    if b"\x00" in data[:4096]:
        return ""
    return data.decode("utf-8", errors="replace")


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_md(path: Path, title: str, body: str) -> None:
    path.write_text(f"# {title}\n\n{body.rstrip()}\n", encoding="utf-8")


def is_noise_source(source: str) -> bool:
    if source in ALLOWED_ARTIFACTS:
        return False
    return source.startswith(NOISY_PREFIXES)


def clean_hit_list(rows: Any) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    clean: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        source = str(row.get("path") or row.get("source") or row.get("file") or "")
        if source and is_noise_source(source):
            continue
        clean.append(row)
    return clean


def clean_evidence(evidence: Any) -> Any:
    if isinstance(evidence, list):
        return clean_hit_list(evidence)
    if isinstance(evidence, dict):
        out: dict[str, Any] = {}
        for key, value in evidence.items():
            if isinstance(value, list):
                out[key] = clean_hit_list(value)
            else:
                out[key] = value
        return out
    return evidence


def md_table(rows: list[dict[str, Any]], cols: list[str], limit: int = 200) -> str:
    if not rows:
        return "_None._\n"
    out = "| " + " | ".join(cols) + " |\n"
    out += "| " + " | ".join(["---"] * len(cols)) + " |\n"
    for row in rows[:limit]:
        vals = []
        for col in cols:
            value = row.get(col, "")
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)[:180]
            vals.append(str(value).replace("\n", " ").replace("|", "\\|")[:260])
        out += "| " + " | ".join(vals) + " |\n"
    if len(rows) > limit:
        out += f"\n_Truncated: showing {limit} of {len(rows)} rows._\n"
    return out


def refine_findings(raw_findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refined: list[dict[str, Any]] = []
    for item in raw_findings:
        row = dict(item)
        row["evidence"] = clean_evidence(row.get("evidence"))
        ev = row.get("evidence")
        row["clean_evidence_count"] = len(ev) if isinstance(ev, list) else None
        refined.append(row)
    order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    refined.sort(key=lambda x: (order.get(x.get("severity"), 9), x.get("category", ""), x.get("id", "")))
    return refined


def refine_table_usage(raw: dict[str, Any]) -> dict[str, Any]:
    refined: dict[str, Any] = {}
    for table, data in raw.items():
        row = dict(data) if isinstance(data, dict) else {}
        for key in ["insert_hits", "update_hits", "select_hits", "delete_hits", "all_hits"]:
            row[key] = clean_hit_list(row.get(key, []))

        has_read = bool(row["select_hits"])
        has_write = bool(row["insert_hits"] or row["update_hits"] or row["delete_hits"])
        has_any = bool(row["all_hits"])

        if has_read and has_write:
            clean_class = "read_write"
        elif has_read:
            clean_class = "read_only"
        elif has_write:
            clean_class = "write_only"
        elif has_any:
            clean_class = "mentioned_only"
        else:
            clean_class = "not_found_after_noise_filter"

        row["classification_after_noise_filter"] = clean_class
        refined[table] = row
    return refined


def chunk_text(source: str, text: str) -> list[dict[str, Any]]:
    text = text.replace("\r\n", "\n")
    chunks: list[dict[str, Any]] = []
    start = 0
    index = 0

    while start < len(text):
        end = min(len(text), start + CHUNK_TARGET)
        if end < len(text):
            boundary = text.rfind("\n\n", start, end)
            if boundary > start + (CHUNK_TARGET // 2):
                end = boundary

        chunk = text[start:end].strip()
        if chunk:
            chunk_id = f"{Path(source).stem}_{index:04d}_{sha16(source + ':' + str(index) + ':' + chunk)}"
            chunks.append({
                "id": chunk_id,
                "source": source,
                "chunk_index": index,
                "start_char": start,
                "end_char": end,
                "chars": len(chunk),
                "text": chunk,
                "metadata": {
                    "pack": "agentsam_cursor_gap_pack_v2",
                    "source": source,
                    "chunk_index": index,
                    "chunk_target_chars": CHUNK_TARGET,
                    "chunk_overlap_chars": CHUNK_OVERLAP,
                    "generated_at": now_iso(),
                },
            })
            index += 1

        if end >= len(text):
            break
        start = max(end - CHUNK_OVERLAP, start + 1)

    return chunks


def build_clean_chunks(repo_root: Path, findings: list[dict[str, Any]], table_usage: dict[str, Any]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []

    for source in CURATED_FILES:
        text = read_text(repo_root / source)
        if text:
            chunks.extend(chunk_text(source, text))

    for finding in findings:
        if finding.get("severity") not in {"P0", "P1"}:
            continue
        source = f"virtual/findings/{finding.get('id')}.md"
        body = (
            f"# {finding.get('id')}\n\n"
            f"Severity: {finding.get('severity')}\n"
            f"Category: {finding.get('category')}\n\n"
            f"## Title\n\n{finding.get('title')}\n\n"
            f"## Recommendation\n\n{finding.get('recommendation')}\n\n"
            f"## Evidence\n\n{json.dumps(finding.get('evidence'), indent=2, ensure_ascii=False)[:6000]}\n"
        )
        chunks.extend(chunk_text(source, body))

    rows = []
    for table, data in table_usage.items():
        rows.append({
            "table": table,
            "original": data.get("classification"),
            "clean": data.get("classification_after_noise_filter"),
            "insert_hits": len(data.get("insert_hits", [])),
            "select_hits": len(data.get("select_hits", [])),
            "all_hits": len(data.get("all_hits", [])),
        })

    table_doc = "# D1 Closed Loop Table Classifications\n\n"
    table_doc += md_table(rows, ["table", "original", "clean", "insert_hits", "select_hits", "all_hits"], 300)
    chunks.extend(chunk_text("virtual/d1_closed_loop_table_classifications.md", table_doc))

    return chunks


def build_embedding_queue(repo_root: Path, findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    queue: list[dict[str, Any]] = []
    for source in CURATED_FILES:
        path = repo_root / source
        text = read_text(path)
        queue.append({
            "source": source,
            "exists": path.exists(),
            "bytes": path.stat().st_size if path.exists() else 0,
            "priority": "P0" if source.endswith(("findings.json", "table_usage.json")) else "P1",
            "reason": "curated_high_signal_file",
            "recommended_table": "codebase_chunks" if not source.startswith("artifacts/") else "documents_or_agent_context_snapshots",
            "embed_model": "mxbai-embed-large:latest",
            "dimension_expected": 1024,
            "text_preview": text[:500],
        })

    for finding in findings:
        if finding.get("severity") not in {"P0", "P1"}:
            continue
        queue.append({
            "source": f"virtual/findings/{finding.get('id')}.md",
            "exists": True,
            "bytes": 0,
            "priority": finding.get("severity"),
            "reason": "virtual_finding_summary",
            "recommended_table": "documents",
            "embed_model": "mxbai-embed-large:latest",
            "dimension_expected": 1024,
            "text_preview": f"{finding.get('title')}\n{finding.get('recommendation')}",
        })

    return queue


def write_noise_report(out_dir: Path, symbols: dict[str, Any]) -> None:
    rows = []
    for group, hits in symbols.items():
        if not isinstance(hits, list):
            continue
        total = len(hits)
        noisy = 0
        clean = 0
        for hit in hits:
            if not isinstance(hit, dict):
                continue
            source = str(hit.get("path") or hit.get("source") or "")
            if is_noise_source(source):
                noisy += 1
            else:
                clean += 1
        rows.append({
            "group": group,
            "total_hits": total,
            "noisy_hits": noisy,
            "clean_hits": clean,
            "noise_pct": round((noisy / total) * 100, 1) if total else 0,
        })

    body = "## Symbol noise by group\n\n"
    body += md_table(rows, ["group", "total_hits", "noisy_hits", "clean_hits", "noise_pct"], 100)
    body += "\n## Rule\n\nGenerated artifacts, analytics dumps, `.tmp`, captures, test reports, deploy stats, and prior pack outputs are excluded from the clean corpus unless explicitly curated.\n"
    write_md(out_dir / "NOISE_REPORT.md", "Noise Report", body)


def build_cursor_next_patch_pack(findings: list[dict[str, Any]], table_usage: dict[str, Any]) -> str:
    p0 = [f for f in findings if f.get("severity") == "P0"]
    p1 = [f for f in findings if f.get("severity") == "P1"]

    table_rows = []
    for table in [
        "agentsam_compaction_events",
        "agentsam_guardrail_events",
        "agentsam_skill_revision",
        "agentsam_user_feature_override",
    ]:
        data = table_usage.get(table, {})
        table_rows.append({
            "table": table,
            "original": data.get("classification"),
            "clean": data.get("classification_after_noise_filter"),
            "insert_hits": len(data.get("insert_hits", [])),
            "select_hits": len(data.get("select_hits", [])),
            "next_action": "schema inspect + upstream writer locator",
        })

    return f"""
Generated: `{now_iso()}`

This is the clean v2 handoff. The first scanner was useful, but noisy because it scanned generated artifacts and prior reports. This pack filters that noise and keeps the high-signal repair map.

## P0 findings

{md_table(p0, ["id", "severity", "category", "title", "recommendation"], 80)}

## P1 findings

{md_table(p1, ["id", "severity", "category", "title", "recommendation"], 80)}

## Empty-table repair map

{md_table(table_rows, ["table", "original", "clean", "insert_hits", "select_hits", "next_action"], 20)}

## Next Cursor batch

Create `scripts/locate_agentsam_p0_writer_hooks.py`.

It should read schema for the four empty tables, grep source-only paths, locate candidate upstream events, and write `artifacts/agentsam_p0_writer_hooks/HOOK_CANDIDATES.md`. It must not patch code or write D1.

Create `scripts/audit_read_before_edit_enforcement.py`.

It should locate read tools, write tools, executor dispatch, and prove whether same-run path read state exists. It must output exact hook candidates.

Create `scripts/audit_agentsam_routing_trace.py`.

It should locate `classifyIntent`, `selectAutoModel`, route requirement reads, routing arms, model catalog resolution, and output the actual call chain or missing edges.

## Do not do yet

Do not auto-apply SamSeek.
Do not insert synthetic D1 rows just to make empty tables non-empty.
Do not embed the noisy first-pass chunk set.
Do not ask Cursor to patch all P0s from the first report alone.
""".strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--in-dir", default=DEFAULT_IN)
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    in_dir = (repo_root / args.in_dir).resolve()
    out_dir = (repo_root / args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    findings_raw = read_json(in_dir / "findings.json", {}).get("findings", [])
    table_usage_raw = read_json(in_dir / "table_usage.json", {})
    symbols_raw = read_json(in_dir / "symbols.json", {})

    findings = refine_findings(findings_raw)
    table_usage = refine_table_usage(table_usage_raw)
    queue = build_embedding_queue(repo_root, findings)
    chunks = build_clean_chunks(repo_root, findings, table_usage)

    p0 = [f for f in findings if f.get("severity") == "P0"]
    p1 = [f for f in findings if f.get("severity") == "P1"]

    index_body = f"""
Generated: `{now_iso()}`
Input pack: `{in_dir}`
Output pack: `{out_dir}`

## Summary

| Metric | Value |
|---|---:|
| Refined findings | {len(findings)} |
| P0 findings | {len(p0)} |
| P1 findings | {len(p1)} |
| Refined D1 table mappings | {len(table_usage)} |
| Embedding queue rows | {len(queue)} |
| Clean chunks | {len(chunks)} |
| Chunk target chars | {CHUNK_TARGET} |
| Chunk overlap chars | {CHUNK_OVERLAP} |

## Highest priority

{md_table(p0 + p1, ["id", "severity", "category", "title", "recommendation"], 80)}

## Next file

`artifacts/agentsam_cursor_gap_pack_v2/CURSOR_NEXT_PATCH_PACK.md`
"""
    write_md(out_dir / "00_INDEX.md", "Agent Sam Cursor Gap Pack V2", index_body)
    write_md(out_dir / "CLEAN_FINDINGS.md", "Clean Findings", md_table(findings, ["id", "severity", "category", "title", "recommendation", "clean_evidence_count"], 200))
    write_md(out_dir / "CURSOR_NEXT_PATCH_PACK.md", "Cursor Next Patch Pack", build_cursor_next_patch_pack(findings, table_usage))
    write_noise_report(out_dir, symbols_raw)

    write_json(out_dir / "clean_findings.json", {"generated_at": now_iso(), "findings": findings})
    write_json(out_dir / "clean_table_usage.json", table_usage)
    write_jsonl(out_dir / "EMBEDDING_QUEUE.jsonl", queue)
    write_jsonl(out_dir / "CLEAN_CHUNKS.jsonl", chunks)
    write_json(out_dir / "index.json", {
        "generated_at": now_iso(),
        "input_pack": str(in_dir),
        "output_pack": str(out_dir),
        "summary": {
            "refined_findings": len(findings),
            "p0": len(p0),
            "p1": len(p1),
            "embedding_queue_rows": len(queue),
            "clean_chunks": len(chunks),
            "chunk_target_chars": CHUNK_TARGET,
            "chunk_overlap_chars": CHUNK_OVERLAP,
        },
        "outputs": [
            "00_INDEX.md",
            "CLEAN_FINDINGS.md",
            "CURSOR_NEXT_PATCH_PACK.md",
            "EMBEDDING_QUEUE.jsonl",
            "CLEAN_CHUNKS.jsonl",
            "NOISE_REPORT.md",
            "clean_findings.json",
            "clean_table_usage.json",
        ],
    })

    print(f"Done: {out_dir}")
    print(f"Index: {out_dir / '00_INDEX.md'}")
    print(f"Next:  {out_dir / 'CURSOR_NEXT_PATCH_PACK.md'}")
    print(f"Queue: {out_dir / 'EMBEDDING_QUEUE.jsonl'}")
    print(f"Chunks:{out_dir / 'CLEAN_CHUNKS.jsonl'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
