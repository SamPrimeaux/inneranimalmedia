#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

PACK_DIR = Path("artifacts/agentsam_cursor_gap_pack_v2")

PACK_ID = "agentsam_cursor_gap_pack_v2_20260516"
PLAN_ID = "plan_cursor_gap_pack_20260516"
WORKFLOW_RUN_ID = "wr_cursor_gap_pack_v2_20260516"
SNAPSHOT_ID = "snapshot_cursor_gap_pack_v2_20260516"

TENANT_ID = "tenant_sam_primeaux"
WORKSPACE_ID = "workspace_inneranimalmedia"
AGENT_ID = "agent_sam"
SOURCE_TOOL = "prepare_agentsam_gap_pack_supabase_ingest.py"

VECTORIZE_INDEX = "ai-search-inneranimalmedia-autorag"
VECTORIZE_CHANGESET_ID = "19631cb8-48b0-4ee7-9190-fe9ac7c1ed5d"
VECTORIZE_UPLOADED_FILE = "artifacts/agentsam_cursor_gap_pack_v2/embeddings_clean_openai.vectorize.balanced.fixed_ids.ndjson"

EMBED_MODEL = "text-embedding-3-large"
EMBED_DIMENSIONS = 1024

OUT_PLAN = PACK_DIR / "SUPABASE_INGEST_PLAN.md"
OUT_ROWS = PACK_DIR / "SUPABASE_ROWS_PREVIEW.json"
OUT_PROMPTS = PACK_DIR / "PROMPT_TRACE_ROWS_PREVIEW.json"
OUT_POINTER = PACK_DIR / "ACTIVE_PACK_POINTER.json"
OUT_MANIFEST = PACK_DIR / "SUPABASE_INGEST_MANIFEST.md"

FILES = {
    "index": PACK_DIR / "00_INDEX.md",
    "clean_findings_md": PACK_DIR / "CLEAN_FINDINGS.md",
    "cursor_patch_pack": PACK_DIR / "CURSOR_NEXT_PATCH_PACK.md",
    "noise_report": PACK_DIR / "NOISE_REPORT.md",
    "clean_findings_json": PACK_DIR / "clean_findings.json",
    "clean_table_usage_json": PACK_DIR / "clean_table_usage.json",
    "embedding_queue": PACK_DIR / "EMBEDDING_QUEUE.jsonl",
    "clean_chunks": PACK_DIR / "CLEAN_CHUNKS.jsonl",
    "openai_embeddings": PACK_DIR / "embeddings_clean_openai.local.jsonl",
    "openai_vectorize": PACK_DIR / "embeddings_clean_openai.vectorize.balanced.fixed_ids.ndjson",
    "openai_status": PACK_DIR / "EMBEDDING_STATUS_OPENAI.md",
    "vectorize_receipt": PACK_DIR / "VECTORIZE_UPLOAD_RECEIPT.md",
    "vectorize_manifest": PACK_DIR / "VECTORIZE_FIXED_IDS_MANIFEST.md",
}


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def today() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def sh(cmd: list[str]) -> str:
    try:
        return subprocess.run(cmd, text=True, capture_output=True, check=False).stdout.strip()
    except Exception:
        return ""


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path, limit: int | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
                if limit is not None and len(rows) >= limit:
                    break
    return rows


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_md(path: Path, body: str) -> None:
    path.write_text(body.rstrip() + "\n", encoding="utf-8")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def file_hash(path: Path) -> str | None:
    if not path.exists():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as f:
        return sum(1 for line in f if line.strip())


def estimate_tokens(chars: int) -> int:
    return max(1, round(chars / 4))


def compact(s: str, n: int = 8000) -> str:
    s = s.strip()
    return s if len(s) <= n else s[:n] + "\n\n[TRUNCATED]"


def table(rows: list[dict[str, Any]], cols: list[str]) -> str:
    if not rows:
        return "_None._\n"
    out = "| " + " | ".join(cols) + " |\n"
    out += "| " + " | ".join(["---"] * len(cols)) + " |\n"
    for r in rows:
        vals = []
        for c in cols:
            v = r.get(c, "")
            if isinstance(v, (dict, list)):
                v = json.dumps(v, ensure_ascii=False)
            vals.append(str(v).replace("\n", " ").replace("|", "\\|")[:300])
        out += "| " + " | ".join(vals) + " |\n"
    return out


def load_pack_state() -> dict[str, Any]:
    findings_data = read_json(FILES["clean_findings_json"], {"findings": []})
    table_usage = read_json(FILES["clean_table_usage_json"], {})
    embedding_queue = read_jsonl(FILES["embedding_queue"])
    chunks_count = count_jsonl(FILES["clean_chunks"])
    embeddings_count = count_jsonl(FILES["openai_embeddings"])
    vector_rows = count_jsonl(FILES["openai_vectorize"])

    findings = findings_data.get("findings", [])
    p0 = [f for f in findings if f.get("severity") == "P0"]
    p1 = [f for f in findings if f.get("severity") == "P1"]

    git_sha = sh(["git", "rev-parse", "HEAD"])
    branch = sh(["git", "branch", "--show-current"])
    repo_url = sh(["git", "config", "--get", "remote.origin.url"])

    return {
        "generated_at": now_iso(),
        "pack_id": PACK_ID,
        "plan_id": PLAN_ID,
        "workflow_run_id": WORKFLOW_RUN_ID,
        "snapshot_id": SNAPSHOT_ID,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "agent_id": AGENT_ID,
        "git_sha": git_sha,
        "branch": branch,
        "repo_url": repo_url,
        "findings": findings,
        "p0_count": len(p0),
        "p1_count": len(p1),
        "table_usage": table_usage,
        "embedding_queue": embedding_queue,
        "chunks_count": chunks_count,
        "embeddings_count": embeddings_count,
        "vector_rows": vector_rows,
        "vectorize_index": VECTORIZE_INDEX,
        "vectorize_changeset_id": VECTORIZE_CHANGESET_ID,
        "vectorize_uploaded_file": VECTORIZE_UPLOADED_FILE,
        "embed_model": EMBED_MODEL,
        "embed_dimensions": EMBED_DIMENSIONS,
        "artifact_hashes": {
            name: file_hash(path)
            for name, path in FILES.items()
        },
    }


def build_plan_rows(state: dict[str, Any]) -> dict[str, Any]:
    p0 = [f for f in state["findings"] if f.get("severity") == "P0"]
    p1 = [f for f in state["findings"] if f.get("severity") == "P1"]

    plan = {
        "id": PLAN_ID,
        "plan_date": today(),
        "title": "Agent Sam Cursor-Level Quality Gap Pack V2",
        "status": "active",
        "morning_brief": "Ingest curated Agent Sam Cursor Gap Pack V2 into Vectorize and Supabase so sprint agents can retrieve the P0/P1 repair map without rerunning the full audit.",
        "available_providers": ["openai", "ollama", "cloudflare_vectorize", "supabase"],
        "blocked_providers": ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4-pro"],
        "budget_snapshot": {
            "strategy": "embed curated chunks only; avoid noisy artifacts; use content hashes to prevent duplicate embedding",
            "embed_model": EMBED_MODEL,
            "dimensions": EMBED_DIMENSIONS,
        },
        "default_model": "gpt-5.4-mini",
        "session_notes": "Pack generated from cleaned repo audit. Vectorize upload succeeded with 180 balanced vectors. Supabase ingest preview prepared before writes.",
        "tasks_total": 6,
        "tasks_done": 2,
        "tasks_blocked": 0,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "plan_type": "repair",
        "risk_level": "medium",
        "requires_approval": 1,
        "token_budget": 250000,
        "tokens_used": None,
        "cost_usd": None,
        "agent_id": AGENT_ID,
        "workflow_id": "wf_cursor_gap_pack_pipeline",
        "workflow_run_id": WORKFLOW_RUN_ID,
        "graph_mode": 1,
        "linked_project_keys": json.dumps(["agent_sam", "cursor_quality_gap", "samseek", "read_before_edit"]),
        "linked_todo_ids": json.dumps([]),
        "linked_context_ids": json.dumps([PACK_ID, SNAPSHOT_ID]),
        "r2_prefix": "artifacts/agentsam_cursor_gap_pack_v2/",
        "plan_md_url": "artifacts/agentsam_cursor_gap_pack_v2/SUPABASE_INGEST_PLAN.md",
        "plan_map_url": "artifacts/agentsam_cursor_gap_pack_v2/ACTIVE_PACK_POINTER.json",
    }

    task_specs = [
        {
            "id": "task_embed_clean_gap_pack",
            "order_index": 1,
            "title": "Embed clean Agent Sam gap pack",
            "description": "Create 1024-dim OpenAI embeddings for cleaned P0/P1 sprint alignment corpus.",
            "priority": "high",
            "category": "embedding",
            "status": "completed",
            "files_involved": ["CLEAN_CHUNKS.jsonl", "embeddings_clean_openai.local.jsonl"],
            "tables_involved": [],
            "routes_involved": [],
            "output_summary": f"Embedded {state['embeddings_count']} chunks at {EMBED_DIMENSIONS} dimensions.",
        },
        {
            "id": "task_upload_gap_pack_to_vectorize",
            "order_index": 2,
            "title": "Upload balanced sprint alignment vectors to Vectorize",
            "description": "Upload balanced, fixed-id Vectorize NDJSON to ai-search-inneranimalmedia-autorag.",
            "priority": "high",
            "category": "vectorize",
            "status": "completed",
            "files_involved": [VECTORIZE_UPLOADED_FILE],
            "tables_involved": [],
            "routes_involved": [],
            "output_summary": f"Uploaded 180 balanced vectors. Changeset {VECTORIZE_CHANGESET_ID}.",
        },
        {
            "id": "task_ingest_gap_pack_to_supabase",
            "order_index": 3,
            "title": "Ingest gap pack metadata into Supabase",
            "description": "Store plan, tasks, workflow run, steps, prompt trace, tool events, documents, context snapshot, and codebase snapshot rows.",
            "priority": "high",
            "category": "supabase_ingest",
            "status": "ready",
            "files_involved": ["SUPABASE_ROWS_PREVIEW.json", "PROMPT_TRACE_ROWS_PREVIEW.json"],
            "tables_involved": ["agentsam_plans", "agentsam_plan_tasks", "agentsam_workflow_runs", "agentsam_workflow_steps", "agentsam_workflow_events", "codebase_snapshots", "documents", "agent_context_snapshots", "agentsam_prompt_runs", "agentsam_tool_call_events", "agent_decisions"],
            "routes_involved": [],
            "output_summary": None,
        },
        {
            "id": "task_locate_p0_writer_hooks",
            "order_index": 4,
            "title": "Locate P0 D1 writer hooks",
            "description": "Find upstream hook candidates for four empty D1 closed-loop tables without writing source or D1 rows.",
            "priority": "critical",
            "category": "audit",
            "status": "queued",
            "files_involved": ["scripts/locate_agentsam_p0_writer_hooks.py"],
            "tables_involved": ["agentsam_compaction_events", "agentsam_guardrail_events", "agentsam_skill_revision", "agentsam_user_feature_override"],
            "routes_involved": [],
            "output_summary": None,
        },
        {
            "id": "task_audit_read_before_edit_enforcement",
            "order_index": 5,
            "title": "Audit read-before-edit enforcement",
            "description": "Prove whether file write tools are blocked unless their target was read in the same run or seeded from context_bundle.",
            "priority": "critical",
            "category": "executor_safety",
            "status": "queued",
            "files_involved": ["scripts/audit_read_before_edit_enforcement.py"],
            "tables_involved": ["agentsam_execution_steps", "agentsam_tool_call_log"],
            "routes_involved": ["/api/agent/chat"],
            "output_summary": None,
        },
        {
            "id": "task_audit_agentsam_routing_trace",
            "order_index": 6,
            "title": "Audit Agent Sam routing trace",
            "description": "Prove classifyIntent -> route requirements -> routing arms -> model catalog/provider resolution call chain.",
            "priority": "high",
            "category": "ai_routing",
            "status": "queued",
            "files_involved": ["scripts/audit_agentsam_routing_trace.py", "src/core/routing.js", "src/api/agent.js"],
            "tables_involved": ["agentsam_prompt_routes", "agentsam_route_requirements", "agentsam_routing_arms", "agentsam_model_catalog"],
            "routes_involved": ["/api/agent/chat"],
            "output_summary": None,
        },
    ]

    tasks = []
    for spec in task_specs:
        tasks.append({
            **spec,
            "plan_id": PLAN_ID,
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "agent_id": AGENT_ID,
            "assigned_model": "gpt-5.4-mini",
            "risk_level": "medium" if spec["status"] != "completed" else "low",
            "requires_approval": 1 if spec["status"] != "completed" else 0,
            "quality_gate_json": json.dumps({
                "requires_read_only_first": True,
                "requires_artifact_output": True,
                "requires_no_source_patch": spec["id"] in {
                    "task_locate_p0_writer_hooks",
                    "task_audit_read_before_edit_enforcement",
                    "task_audit_agentsam_routing_trace",
                },
            }),
            "workflow_run_id": WORKFLOW_RUN_ID,
            "created_at": state["generated_at"],
        })

    return {"agentsam_plans": [plan], "agentsam_plan_tasks": tasks}


def build_workflow_rows(state: dict[str, Any]) -> dict[str, Any]:
    steps = [
        ("step_001_read_existing_pack", "read_artifacts", "completed", "Read v1/v2 pack artifacts."),
        ("step_002_filter_noise", "python", "completed", "Filtered generated-artifact noise into v2 clean corpus."),
        ("step_003_openai_recommendations", "openai", "completed", "Generated recommendations with GPT-5.4 Mini in prior pack run."),
        ("step_004_openai_embeddings", "openai_embeddings", "completed", f"Embedded {state['embeddings_count']} chunks with {EMBED_MODEL} at 1024 dims."),
        ("step_005_balance_vectorize", "python", "completed", "Balanced Vectorize upload to 180 rows and fixed IDs under 64 bytes."),
        ("step_006_vectorize_upload", "cloudflare_vectorize", "completed", f"Uploaded to {VECTORIZE_INDEX}, changeset {VECTORIZE_CHANGESET_ID}."),
        ("step_007_prepare_supabase_preview", "python", "completed", "Prepared Supabase ingest preview rows."),
    ]

    run = {
        "id": WORKFLOW_RUN_ID,
        "d1_run_id": None,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "workflow_id": "wf_cursor_gap_pack_pipeline",
        "workflow_key": "cursor_gap_pack_pipeline",
        "display_name": "Cursor Gap Pack V2 Build, Embed, Vectorize, Supabase Preview",
        "trigger_type": "manual",
        "status": "completed",
        "input_json": {
            "pack_dir": str(PACK_DIR),
            "embed_model": EMBED_MODEL,
            "embed_dimensions": EMBED_DIMENSIONS,
            "vectorize_index": VECTORIZE_INDEX,
        },
        "output_json": {
            "pack_id": PACK_ID,
            "chunks_count": state["chunks_count"],
            "embeddings_count": state["embeddings_count"],
            "vector_rows_uploaded": 180,
            "vectorize_changeset_id": VECTORIZE_CHANGESET_ID,
            "p0_count": state["p0_count"],
            "p1_count": state["p1_count"],
        },
        "step_results_json": {
            "steps": [{"id": sid, "status": status, "message": message} for sid, _, status, message in steps]
        },
        "steps_completed": len(steps),
        "steps_total": len(steps),
        "error_message": None,
        "model_used": EMBED_MODEL,
        "input_tokens": None,
        "output_tokens": 0,
        "cost_usd": None,
        "duration_ms": None,
        "environment": "local",
        "retry_count": 0,
        "parent_run_id": None,
        "started_at": state["generated_at"],
        "completed_at": state["generated_at"],
        "created_at": state["generated_at"],
        "updated_at": state["generated_at"],
        "supabase_sync_status": "preview",
        "d1_sync_status": "not_applicable",
        "session_id": None,
        "conversation_id": None,
        "user_id": "sam_primeaux",
        "run_group_id": PACK_ID,
        "mode": "audit",
        "provider": "openai",
        "model_key": EMBED_MODEL,
        "total_tokens": None,
        "estimated_cost_usd": None,
        "latency_ms": None,
        "metadata": {
            "pack_id": PACK_ID,
            "source_tool": SOURCE_TOOL,
            "artifact_hashes": state["artifact_hashes"],
        },
        "plan_id": PLAN_ID,
        "task_id": "task_ingest_gap_pack_to_supabase",
        "source_tool": SOURCE_TOOL,
    }

    step_rows = []
    event_rows = []
    for idx, (sid, step_type, status, message) in enumerate(steps, 1):
        step_rows.append({
            "id": sid,
            "run_id": WORKFLOW_RUN_ID,
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "step_index": idx,
            "step_key": sid,
            "step_type": step_type,
            "status": status,
            "tool_key": step_type,
            "command_key": None,
            "provider": "openai" if "openai" in step_type else None,
            "model_key": EMBED_MODEL if "openai" in step_type else None,
            "input_json": {},
            "output_json": {"message": message},
            "error_message": None,
            "started_at": state["generated_at"],
            "completed_at": state["generated_at"],
            "latency_ms": None,
            "metadata": {"pack_id": PACK_ID},
            "created_at": state["generated_at"],
            "updated_at": state["generated_at"],
            "plan_id": PLAN_ID,
            "task_id": "task_ingest_gap_pack_to_supabase",
            "source_tool": SOURCE_TOOL,
        })
        event_rows.append({
            "id": f"evt_{sid}",
            "run_id": WORKFLOW_RUN_ID,
            "step_id": sid,
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "event_type": status,
            "event_level": "info",
            "message": message,
            "payload_json": {"pack_id": PACK_ID, "step_type": step_type},
            "created_at": state["generated_at"],
            "plan_id": PLAN_ID,
            "task_id": "task_ingest_gap_pack_to_supabase",
            "source_tool": SOURCE_TOOL,
        })

    return {
        "agentsam_workflow_runs": [run],
        "agentsam_workflow_steps": step_rows,
        "agentsam_workflow_events": event_rows,
    }


def build_codebase_rows(state: dict[str, Any]) -> dict[str, Any]:
    queue = state["embedding_queue"]
    real_files = [
        row for row in queue
        if row.get("exists") and not str(row.get("source", "")).startswith("artifacts/") and not str(row.get("source", "")).startswith("virtual/")
    ]

    source_chunks = read_jsonl(FILES["openai_embeddings"], limit=250)
    chunk_rows = []
    file_rows = []

    for row in real_files:
        source = row["source"]
        path = Path(source)
        text = read_text(path)
        file_rows.append({
            "snapshot_id": SNAPSHOT_ID,
            "workspace_id": WORKSPACE_ID,
            "tenant_id": TENANT_ID,
            "file_path": source,
            "file_size_bytes": path.stat().st_size if path.exists() else 0,
            "line_count": text.count("\n") + 1 if text else 0,
            "language": path.suffix.lstrip(".") or None,
            "category": "agent_sam_cursor_gap_source",
            "is_priority": True,
            "last_modified_at": None,
            "metadata": {
                "pack_id": PACK_ID,
                "embedding_queue_priority": row.get("priority"),
                "recommended_table": row.get("recommended_table"),
            },
            "created_at": state["generated_at"],
        })

    for emb in source_chunks:
        source = emb.get("source")
        if not source or str(source).startswith("artifacts/") or str(source).startswith("virtual/"):
            continue
        chunk_rows.append({
            "snapshot_id": SNAPSHOT_ID,
            "file_id": None,
            "workspace_id": WORKSPACE_ID,
            "tenant_id": TENANT_ID,
            "file_path": source,
            "chunk_index": emb.get("chunk_index") or 0,
            "chunk_type": "source_code",
            "content": emb.get("text", ""),
            "embedding": f"<{len(emb.get('embedding', []))}-dim vector omitted from preview>",
            "line_start": None,
            "line_end": None,
            "symbol_name": None,
            "language": Path(source).suffix.lstrip(".") or None,
            "metadata": {
                "pack_id": PACK_ID,
                "source_vector_id": emb.get("id"),
                "embed_source": "openai",
                "dimensions": emb.get("dimension"),
            },
            "embed_model": EMBED_MODEL,
            "created_at": state["generated_at"],
        })

    snapshot = {
        "snapshot_id": SNAPSHOT_ID,
        "workspace_id": WORKSPACE_ID,
        "tenant_id": TENANT_ID,
        "commit_sha": state["git_sha"] or "unknown",
        "branch": state["branch"] or "unknown",
        "repo_url": state["repo_url"],
        "file_count": len(file_rows),
        "total_lines": sum(r.get("line_count") or 0 for r in file_rows),
        "total_bytes": sum(r.get("file_size_bytes") or 0 for r in file_rows),
        "chunk_count": state["embeddings_count"],
        "r2_prefix": "artifacts/agentsam_cursor_gap_pack_v2/",
        "upload_status": "vectorize_uploaded_supabase_preview",
        "metadata": {
            "pack_id": PACK_ID,
            "vectorize_index": VECTORIZE_INDEX,
            "vectorize_changeset_id": VECTORIZE_CHANGESET_ID,
            "balanced_vector_count": 180,
            "full_embedding_count": state["embeddings_count"],
            "source_tool": SOURCE_TOOL,
        },
        "created_at": state["generated_at"],
        "updated_at": state["generated_at"],
        "plan_id": PLAN_ID,
        "task_id": "task_ingest_gap_pack_to_supabase",
    }

    return {
        "codebase_snapshots": [snapshot],
        "codebase_files": file_rows,
        "codebase_chunks_preview_first_250_embeddings_source_only": chunk_rows,
    }


def build_document_context_rows(state: dict[str, Any]) -> dict[str, Any]:
    docs = []

    doc_specs = [
        ("gap_pack_index", FILES["index"], "Agent Sam Cursor Gap Pack V2 Index"),
        ("cursor_next_patch_pack", FILES["cursor_patch_pack"], "Cursor Next Patch Pack"),
        ("clean_findings", FILES["clean_findings_md"], "Clean P0/P1 Findings"),
        ("noise_report", FILES["noise_report"], "Gap Pack Noise Report"),
        ("vectorize_receipt", FILES["vectorize_receipt"], "Vectorize Upload Receipt"),
        ("embedding_status_openai", FILES["openai_status"], "OpenAI Embedding Status"),
    ]

    for source_key, path, title in doc_specs:
        content = read_text(path)
        if not content:
            continue
        docs.append({
            "project_id": "agent_sam",
            "source": str(path),
            "title": title,
            "content": content,
            "embedding": None,
            "metadata": {
                "pack_id": PACK_ID,
                "source_key": source_key,
                "vectorize_index": VECTORIZE_INDEX,
                "vectorize_changeset_id": VECTORIZE_CHANGESET_ID,
            },
            "workspace_id": WORKSPACE_ID,
            "embed_model": EMBED_MODEL,
            "tenant_id": TENANT_ID,
            "content_hash": sha256_text(content),
            "source_chunk_id": source_key,
        })

    summary_content = f"""
Agent Sam Cursor Gap Pack V2 is active.

P0 findings:
- agentsam_compaction_events missing reliable writer path
- agentsam_guardrail_events missing reliable writer path
- agentsam_skill_revision missing reliable writer path
- agentsam_user_feature_override missing reliable writer path
- read-before-edit enforcement is not proven

P1 findings:
- classifyIntent/selectAutoModel call order needs routing trace proof
- forbidden/expensive model references need default routing guard
- large files require scoped context and surgical edits

Vectorize:
- index: {VECTORIZE_INDEX}
- changeset: {VECTORIZE_CHANGESET_ID}
- uploaded vectors: 180 balanced vectors
- dimensions: {EMBED_DIMENSIONS}
- model: {EMBED_MODEL}

Next action:
Create targeted read-only audit scripts before source patches:
- locate_agentsam_p0_writer_hooks.py
- audit_read_before_edit_enforcement.py
- audit_agentsam_routing_trace.py
""".strip()

    context_snapshot = {
        "snapshot_type": "sprint_alignment",
        "title": "Agent Sam Cursor Gap Pack V2",
        "content": summary_content,
        "embedding": None,
        "metadata": {
            "pack_id": PACK_ID,
            "vectorize_index": VECTORIZE_INDEX,
            "vectorize_changeset_id": VECTORIZE_CHANGESET_ID,
            "p0_count": state["p0_count"],
            "p1_count": state["p1_count"],
        },
        "worker_version": None,
        "deploy_id": state["git_sha"],
        "models_active": [EMBED_MODEL, "gpt-5.4-mini", "mxbai-embed-large:latest"],
        "blocked_providers": ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4-pro"],
        "budget_snapshot": {
            "embedding_count": state["embeddings_count"],
            "balanced_vectorize_count": 180,
        },
        "active_plan_id": PLAN_ID,
        "tasks_done": 2,
        "tasks_pending": 4,
        "workspace_id": WORKSPACE_ID,
        "tenant_id": TENANT_ID,
        "plan_id": PLAN_ID,
        "source_tool": SOURCE_TOOL,
    }

    decisions = [
        {
            "decision_type": "retrieval",
            "question": "Should the noisy first-pass gap pack be uploaded to Vectorize?",
            "decision": "No. Upload only the balanced fixed-id v2 Vectorize file.",
            "reasoning": "The unbalanced file was dominated by table_usage.json. The balanced file preserves strategic docs and caps table evidence.",
            "confidence": 0.98,
            "metadata": {"pack_id": PACK_ID},
            "plan_id": PLAN_ID,
            "task_id": "task_upload_gap_pack_to_vectorize",
            "source_tool": SOURCE_TOOL,
        },
        {
            "decision_type": "executor_safety",
            "question": "Should SamSeek auto-apply be enabled now?",
            "decision": "No. Parse/dry-run/ledger can proceed later, but auto-apply must wait until read-before-edit enforcement is proven.",
            "reasoning": "The P0 finding read_before_edit_enforcement_needed remains unresolved.",
            "confidence": 0.99,
            "metadata": {"pack_id": PACK_ID},
            "plan_id": PLAN_ID,
            "task_id": "task_audit_read_before_edit_enforcement",
            "source_tool": SOURCE_TOOL,
        },
        {
            "decision_type": "embedding_strategy",
            "question": "Should Ollama be discredited because this batch had failures?",
            "decision": "No. Ollama remains the preferred bulk local embedding path when chunking/request shape is stable. OpenAI embeddings were used here for a clean, zero-failure strategic pack.",
            "reasoning": "Sam reported Ollama handled over 15000 vectors recently. Failures were likely chunking/script/request-shape related.",
            "confidence": 0.95,
            "metadata": {"pack_id": PACK_ID},
            "plan_id": PLAN_ID,
            "task_id": "task_embed_clean_gap_pack",
            "source_tool": SOURCE_TOOL,
        },
    ]

    return {
        "documents": docs,
        "agent_context_snapshots": [context_snapshot],
        "agent_decisions": decisions,
    }


def build_prompt_tool_trace_rows(state: dict[str, Any]) -> dict[str, Any]:
    openai_recs = read_text(Path("artifacts/agentsam_cursor_gap_pack/17_openai_recommendations.md"))
    digest_chars = 76200
    recommendation_chars = len(openai_recs)

    prompt_run = {
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "session_id": None,
        "conversation_id": None,
        "request_id": f"req_{PACK_ID}_openai_recommendations",
        "run_group_id": PACK_ID,
        "prompt_profile_key": "cursor_gap_pack_reviewer_v1",
        "agent_id": AGENT_ID,
        "mode": "audit",
        "intent": "cursor_quality_gap_review",
        "system_prompt_hash": sha256_text("senior repo architect and agent-systems reviewer"),
        "system_prompt_chars": len("senior repo architect and agent-systems reviewer"),
        "context_block_chars": digest_chars,
        "total_prompt_chars": digest_chars + 500,
        "estimated_tokens": estimate_tokens(digest_chars + 500),
        "final_input_tokens": None,
        "included_prompts": [
            "repo intelligence digest",
            "P0/P1 findings",
            "D1 closed loop table usage",
            "Cursor-level quality gap instructions",
        ],
        "omitted_prompts": [
            "full source files",
            "noisy first-pass artifact chunks",
        ],
        "context_sources": [
            "artifacts/agentsam_cursor_gap_pack/findings.json",
            "artifacts/agentsam_cursor_gap_pack/table_usage.json",
            "artifacts/agentsam_cursor_gap_pack/symbols.json",
        ],
        "warnings": [
            "This is a recommendation trace preview; exact API token usage should be filled from logged response metadata when available."
        ],
        "metadata": {
            "pack_id": PACK_ID,
            "model": "gpt-5.4-mini",
            "output_chars": recommendation_chars,
        },
        "created_at": state["generated_at"],
        "plan_id": PLAN_ID,
        "task_id": "task_embed_clean_gap_pack",
        "source_tool": "build_agentsam_cursor_gap_pack.py",
    }

    tool_events = [
        {
            "tool_name": "openai.embeddings",
            "tool_category": "embedding",
            "tool_source": "openai",
            "call_index": 1,
            "input_tokens": None,
            "output_tokens": 0,
            "cost_usd": None,
            "duration_ms": None,
            "success": True,
            "error_message": None,
            "input_preview": "Embed clean Agent Sam Cursor Gap Pack V2 chunks.",
            "output_preview": f"{state['embeddings_count']} embeddings generated at {EMBED_DIMENSIONS} dimensions.",
            "input_json": {
                "model": EMBED_MODEL,
                "dimensions": EMBED_DIMENSIONS,
                "pack_id": PACK_ID,
            },
            "output_json": {
                "embeddings_count": state["embeddings_count"],
                "dimensions": EMBED_DIMENSIONS,
                "failed": 0,
            },
            "metadata": {
                "pack_id": PACK_ID,
                "local_file": str(FILES["openai_embeddings"]),
            },
            "created_at": state["generated_at"],
            "plan_id": PLAN_ID,
            "task_id": "task_embed_clean_gap_pack",
            "source_tool": "embed_agentsam_clean_chunks_openai.py",
        },
        {
            "tool_name": "cloudflare.vectorize.insert",
            "tool_category": "vector_database",
            "tool_source": "cloudflare",
            "call_index": 2,
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_usd": 0,
            "duration_ms": None,
            "success": True,
            "error_message": None,
            "input_preview": VECTORIZE_UPLOADED_FILE,
            "output_preview": f"Enqueued 180 vectors. Changeset {VECTORIZE_CHANGESET_ID}.",
            "input_json": {
                "index": VECTORIZE_INDEX,
                "file": VECTORIZE_UPLOADED_FILE,
            },
            "output_json": {
                "changeset_id": VECTORIZE_CHANGESET_ID,
                "enqueued_vectors": 180,
            },
            "metadata": {
                "pack_id": PACK_ID,
            },
            "created_at": state["generated_at"],
            "plan_id": PLAN_ID,
            "task_id": "task_upload_gap_pack_to_vectorize",
            "source_tool": "wrangler vectorize insert",
        },
    ]

    return {
        "agentsam_prompt_runs": [prompt_run],
        "agentsam_tool_call_events": tool_events,
    }


def build_active_pointer(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "active_pack_id": PACK_ID,
        "status": "active",
        "created_at": state["generated_at"],
        "plan_id": PLAN_ID,
        "workflow_run_id": WORKFLOW_RUN_ID,
        "snapshot_id": SNAPSHOT_ID,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "vectorize": {
            "index": VECTORIZE_INDEX,
            "changeset_id": VECTORIZE_CHANGESET_ID,
            "uploaded_file": VECTORIZE_UPLOADED_FILE,
            "balanced_vector_count": 180,
            "dimensions": EMBED_DIMENSIONS,
            "embed_model": EMBED_MODEL,
        },
        "supabase": {
            "preview_file": str(OUT_ROWS),
            "prompt_trace_preview_file": str(OUT_PROMPTS),
            "ready_for_ingest": True,
            "write_script_next": "scripts/ingest_agentsam_gap_pack_supabase.py",
        },
        "p0_findings": [
            "agentsam_compaction_events_missing_writer",
            "agentsam_guardrail_events_missing_writer",
            "agentsam_skill_revision_missing_writer",
            "agentsam_user_feature_override_missing_writer",
            "read_before_edit_enforcement_needed",
        ],
        "p1_findings": [
            "ai_routing_core_symbols_found",
            "forbidden_expensive_model_references",
            "large_files_require_scoped_context",
        ],
        "next_tasks": [
            "task_ingest_gap_pack_to_supabase",
            "task_locate_p0_writer_hooks",
            "task_audit_read_before_edit_enforcement",
            "task_audit_agentsam_routing_trace",
        ],
    }


def main() -> int:
    state = load_pack_state()

    plan_rows = build_plan_rows(state)
    workflow_rows = build_workflow_rows(state)
    codebase_rows = build_codebase_rows(state)
    doc_context_rows = build_document_context_rows(state)
    prompt_trace_rows = build_prompt_tool_trace_rows(state)
    active_pointer = build_active_pointer(state)

    all_rows = {
        "meta": {
            "generated_at": state["generated_at"],
            "pack_id": PACK_ID,
            "plan_id": PLAN_ID,
            "workflow_run_id": WORKFLOW_RUN_ID,
            "snapshot_id": SNAPSHOT_ID,
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "source_tool": SOURCE_TOOL,
            "vectorize_changeset_id": VECTORIZE_CHANGESET_ID,
        },
        **plan_rows,
        **workflow_rows,
        **codebase_rows,
        **doc_context_rows,
    }

    write_json(OUT_ROWS, all_rows)
    write_json(OUT_PROMPTS, prompt_trace_rows)
    write_json(OUT_POINTER, active_pointer)

    summary_rows = []
    for key, value in all_rows.items():
        if key == "meta":
            continue
        if isinstance(value, list):
            summary_rows.append({"target": key, "preview_rows": len(value)})
        elif isinstance(value, dict):
            summary_rows.append({"target": key, "preview_rows": len(value)})

    prompt_rows = []
    for key, value in prompt_trace_rows.items():
        prompt_rows.append({"target": key, "preview_rows": len(value)})

    ingest_plan = f"""# Supabase Ingest Plan

Generated: `{state['generated_at']}`

Pack: `{PACK_ID}`
Plan: `{PLAN_ID}`
Workflow run: `{WORKFLOW_RUN_ID}`
Snapshot: `{SNAPSHOT_ID}`

Vectorize index: `{VECTORIZE_INDEX}`
Vectorize changeset: `{VECTORIZE_CHANGESET_ID}`
Vectorize uploaded file: `{VECTORIZE_UPLOADED_FILE}`

## Preview row counts

{table(summary_rows, ["target", "preview_rows"])}

## Prompt/tool trace preview counts

{table(prompt_rows, ["target", "preview_rows"])}

## Destination intent

| Supabase table | Purpose |
|---|---|
| `agentsam_plans` | Parent repair/alignment plan |
| `agentsam_plan_tasks` | Concrete P0/P1 work items |
| `agentsam_workflow_runs` | Pack build/embed/upload run |
| `agentsam_workflow_steps` | Stage-level proof |
| `agentsam_workflow_events` | Timeline events |
| `codebase_snapshots` | Version anchor for this pack |
| `codebase_files` | Real source files from embedding queue |
| `codebase_chunks` | Source-code chunks with embeddings, inserted later with full vectors |
| `documents` | Strategic docs and receipts |
| `agent_context_snapshots` | Compressed sprint alignment brain state |
| `agent_decisions` | Durable architectural decisions |
| `agentsam_prompt_runs` | GPT-5.4 Mini recommendation trace |
| `agentsam_tool_call_events` | OpenAI embedding + Vectorize upload traces |

## Important safety

This script only generated previews. It did not write Supabase.

Next script should insert in this order:
1. `agentsam_plans`
2. `agentsam_plan_tasks`
3. `agentsam_workflow_runs`
4. `agentsam_workflow_steps`
5. `agentsam_workflow_events`
6. `codebase_snapshots`
7. `codebase_files`
8. `documents`
9. `agent_context_snapshots`
10. `agent_decisions`
11. `agentsam_prompt_runs`
12. `agentsam_tool_call_events`

Do not insert `codebase_chunks` with placeholder embeddings. Use the local JSONL with real vectors or a database-side bulk loader.
"""
    write_md(OUT_PLAN, ingest_plan)

    manifest = f"""# Supabase Ingest Manifest

Pack: `{PACK_ID}`
Generated: `{state['generated_at']}`
Rows preview: `{OUT_ROWS}`
Prompt/tool preview: `{OUT_PROMPTS}`
Active pointer: `{OUT_POINTER}`

Ready for reviewed Supabase ingest: `yes`
"""
    write_md(OUT_MANIFEST, manifest)

    print(f"ok pack={PACK_ID}")
    print(f"rows={OUT_ROWS}")
    print(f"prompts={OUT_PROMPTS}")
    print(f"pointer={OUT_POINTER}")
    print(f"plan={OUT_PLAN}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
