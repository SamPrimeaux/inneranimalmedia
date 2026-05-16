#!/usr/bin/env python3
"""
seed_rules_and_workflows.py
Inserts into remote D1 via CF REST API. No wrangler. No heredoc.
Covers: agentsam_scripts, agentsam_mcp_workflows, agentsam_rules_document.

Usage:
    cd /Users/samprimeaux/inneranimalmedia
    set -a && source .env.cloudflare && set +a
    python3 scripts/seed_rules_and_workflows.py
"""

import ast
import json
import os
import sys
import requests

ACCOUNT_ID = os.environ["CLOUDFLARE_ACCOUNT_ID"]
API_TOKEN  = os.environ["CLOUDFLARE_API_TOKEN"]
DB_ID      = os.environ.get("CF_D1_DATABASE_ID", "cf87b717-d4e2-4cf8-bab0-a81268e32d49")
D1_URL     = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DB_ID}/query"
HEADERS    = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}


def d1(sql, params=None):
    body = {"sql": sql, "params": params or []}
    r = requests.post(D1_URL, headers=HEADERS, json=body, timeout=20)
    data = r.json()
    if not r.ok or not data.get("success"):
        print(f"  FAIL: {data.get('errors')}")
        sys.exit(1)
    return data


def run(label, sql, params=None):
    print(f"  >> {label}")
    d1(sql, params)
    print(f"     OK")


# ══════════════════════════════════════════════════════════════
# 1. agentsam_scripts
# ══════════════════════════════════════════════════════════════

SCRIPTS_SQL = """
INSERT OR REPLACE INTO agentsam_scripts (
  id, workspace_id, name, path, description, purpose,
  runner, requires_env, owner_only, safe_to_run,
  run_before, run_after, never_run_with, preferred_for,
  notes, is_active, slug, is_global, body, tenant_id, language
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""

SCRIPTS = [
    {
        "id": "script_ingest_py",
        "name": "RAG Ingest Pipeline (ingest.py)",
        "path": "scripts/ingest.py",
        "description": "Reusable Python RAG ingestion pipeline. Chunks a plain-text doc, embeds via local Ollama mxbai-embed-large:latest (1024d), upserts to Cloudflare Vectorize v2, verifies retrieval. Flags: --verify, --dry-run, --top-k, --verify-query.",
        "purpose": "ingest",
        "runner": "python",
        "preferred_for": "knowledge_ingestion,rag,vectorize,embedding",
        "notes": "Requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN from .env.cloudflare. Chunk size 900 chars (~225 tokens). Overlap 100 chars. Source docs in scripts/sources/*.txt. Always python3, never python.",
        "slug": "ingest-py",
        "body": "python3 scripts/ingest.py --source-id {source_id} --file {file} --verify-query \"{verify_query}\"",
        "language": "python",
    },
    {
        "id": "script_ingest_rag_knowledge",
        "name": "Ingest: RAG & Vectorize Knowledge",
        "path": "scripts/sources/iam_rag_knowledge.txt",
        "description": "Ingests IAM RAG and Vectorize end-to-end knowledge. Covers mxbai usage, asymmetric query prefix, Vectorize v2 API, chunking strategy, similarity scoring, retrieval best practices, ingest.py usage. Source ID: wf_rag_vectorize_knowledge_001.",
        "purpose": "ingest",
        "runner": "bash",
        "preferred_for": "rag,vectorize,knowledge_base,agent_sam_core",
        "notes": "Verified PASS score 0.7357. 12 chunks avg 201 tokens. Source: scripts/sources/iam_rag_knowledge.txt. Re-ingest is idempotent.",
        "slug": "ingest-rag-knowledge",
        "body": "set -a && source .env.cloudflare && set +a && python3 scripts/ingest.py --source-id wf_rag_vectorize_knowledge_001 --file scripts/sources/iam_rag_knowledge.txt --verify-query \"RAG chunking embedding Vectorize mxbai Ollama cosine retrieval\"",
        "language": "python",
    },
    {
        "id": "script_ingest_testing_knowledge",
        "name": "Ingest: Testing, Quality & SLO Knowledge",
        "path": "scripts/sources/iam_testing_knowledge.txt",
        "description": "Ingests IAM smoke testing, SLO enforcement, AI spend analytics, and D1-to-Supabase join strategy knowledge. Source ID: iam_testing_quality_knowledge_001.",
        "purpose": "ingest",
        "runner": "bash",
        "preferred_for": "testing,slo,smoke_test,d1,supabase,analytics,knowledge_base",
        "notes": "Verified PASS score 0.6709 at rank 14 in topK=20. 14 chunks. Dense index: use domain-specific verify-query. Source: scripts/sources/iam_testing_knowledge.txt.",
        "slug": "ingest-testing-knowledge",
        "body": "set -a && source .env.cloudflare && set +a && python3 scripts/ingest.py --source-id iam_testing_quality_knowledge_001 --file scripts/sources/iam_testing_knowledge.txt --verify-query \"agentsam_task_slos sla_p95_latency_ms smoke test run_group_id D1 Supabase eval_runs\"",
        "language": "python",
    },
    {
        "id": "script_ingest_cms_knowledge",
        "name": "Ingest: CMS Homepage Section Migration Knowledge",
        "path": "scripts/sources/iam_cms_section_knowledge.txt",
        "description": "Ingests IAM CMS Shopify-Liquid architecture knowledge: Selected Work replaced by Agent Sam Platform Services, cms_liquid_sections, cms_liquid_imports, R2 artifact, FK chain. Source ID: iam_cms_section_knowledge_001.",
        "purpose": "ingest",
        "runner": "bash",
        "preferred_for": "cms,r2,liquid,homepage,knowledge_base,d1",
        "notes": "Verified PASS score 0.7564 at rank 1 in topK=20. 12 chunks. Strongest retrieval of three sources. Source: scripts/sources/iam_cms_section_knowledge.txt.",
        "slug": "ingest-cms-knowledge",
        "body": "set -a && source .env.cloudflare && set +a && python3 scripts/ingest.py --source-id iam_cms_section_knowledge_001 --file scripts/sources/iam_cms_section_knowledge.txt --verify-query \"cms_liquid_sections cms_liquid_imports cms_page_sections agent_sam_platform_services R2\"",
        "language": "python",
    },
    {
        "id": "script_seed_rules_workflows",
        "name": "Seed: Rules Document & Workflows",
        "path": "scripts/seed_rules_and_workflows.py",
        "description": "Seeds agentsam_scripts, agentsam_mcp_workflows, and agentsam_rules_document into remote D1 via CF REST API. No wrangler, no heredoc, parameterized queries only. Safe to re-run (INSERT OR REPLACE).",
        "purpose": "ingest",
        "runner": "python",
        "preferred_for": "seeding,rules,workflows,knowledge_base",
        "notes": "Uses CF D1 REST API directly. Requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN. DB ID defaults to cf87b717-d4e2-4cf8-bab0-a81268e32d49.",
        "slug": "seed-rules-workflows",
        "body": "set -a && source .env.cloudflare && set +a && python3 scripts/seed_rules_and_workflows.py",
        "language": "python",
    },
]


# ══════════════════════════════════════════════════════════════
# 2. agentsam_mcp_workflows
# ══════════════════════════════════════════════════════════════

WORKFLOW_SQL = """
INSERT OR REPLACE INTO agentsam_mcp_workflows (
  id, workflow_key, display_name, description, status, priority,
  steps_json, tools_json, acceptance_criteria_json, notes,
  tenant_id, workspace_id, trigger_type, input_schema_json, output_schema_json,
  requires_approval, risk_level, run_count, success_count,
  last_run_at, last_run_status, avg_duration_ms, total_cost_usd,
  version, is_active, subagent_slug, model_id, timeout_seconds,
  category, tags_json, retry_policy_json, on_failure_json,
  max_concurrent_runs, environment, visibility, input_defaults_json,
  last_error, task_type, graph_mode, created_at_unix
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""

RETRY = json.dumps({"max_retries": 2, "backoff": "exponential", "delay_ms": 2000, "retry_on": ["timeout", "network_error", "ollama_unavailable"]})
ON_FAIL = json.dumps({"action": "notify", "notify_channel": "resend"})
IN_SCHEMA = json.dumps({"source_id": "string", "force_reingest": "boolean"})
OUT_SCHEMA = json.dumps({"chunk_count": "integer", "top_score": "number", "mutation_id": "string", "status": "string"})

WORKFLOWS = [
    {
        "id": "wf_rag_vectorize_knowledge_001",
        "workflow_key": "rag_vectorize_knowledge_base",
        "display_name": "RAG, Vectorize & Embedding Knowledge Base",
        "description": "Agent Sam end-to-end knowledge on chunking, Ollama mxbai-embed-large:latest (1024d), Vectorize v2 ops. 12 chunks. PASS 0.7357. Source: scripts/sources/iam_rag_knowledge.txt.",
        "steps": [
            {"step": 1, "id": "preflight", "name": "Preflight", "description": "Check CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN. Confirm Ollama running with mxbai-embed-large:latest via GET http://localhost:11434/api/tags. Fail loudly if missing."},
            {"step": 2, "id": "compile_check", "name": "Compile check", "description": "Run python3 -m py_compile scripts/ingest.py and ast.parse before executing. Never proceed to execution if compile fails."},
            {"step": 3, "id": "dry_run", "name": "Dry run", "description": "Run python3 scripts/ingest.py --source-id wf_rag_vectorize_knowledge_001 --file scripts/sources/iam_rag_knowledge.txt --dry-run to confirm chunking and embedding without upsert."},
            {"step": 4, "id": "ingest", "name": "Ingest", "description": "Run without --dry-run to chunk, embed, upsert. 12 chunks at 900 chars target, 100 char overlap."},
            {"step": 5, "id": "verify", "name": "Verify", "description": "Script auto-verifies after 5s settle. Use --verify --top-k 20 --verify-query 'RAG chunking embedding Vectorize mxbai Ollama cosine retrieval' if checking independently."},
        ],
        "tools": ["ollama_embed", "vectorize_upsert", "vectorize_query", "execute_code"],
        "criteria": ["Source chunk in topK=20 score >= 0.70", "12 chunks upserted with valid mutation_id", "py_compile passes before execution"],
        "notes": "12 chunks. PASS 0.7357. Script: scripts/ingest.py. Env: .env.cloudflare.",
        "tags": ["rag", "vectorize", "embeddings", "chunking", "mxbai", "ollama", "knowledge-base", "verified"],
        "defaults": {"chunk_size_chars": 900, "chunk_overlap_chars": 100, "min_verify_score": 0.70, "top_k": 20, "verify_query": "RAG chunking embedding Vectorize mxbai Ollama cosine retrieval", "use_metadata_filter": False},
        "run_count": 1, "success_count": 1, "last_run_at": "2026-05-16T07:12:00Z", "avg_ms": 8200.0,
    },
    {
        "id": "wf_iam_testing_quality_001",
        "workflow_key": "iam_testing_quality_knowledge_base",
        "display_name": "Testing, Quality & SLO Knowledge Base",
        "description": "Agent Sam knowledge on smoke testing, SLO enforcement, AI spend analytics, D1-to-Supabase joins. 14 chunks. PASS 0.6709 topK=20. Source: scripts/sources/iam_testing_knowledge.txt.",
        "steps": [
            {"step": 1, "id": "preflight", "name": "Preflight", "description": "Check env vars and Ollama."},
            {"step": 2, "id": "compile_check", "name": "Compile check", "description": "python3 -m py_compile scripts/ingest.py before any execution."},
            {"step": 3, "id": "ingest", "name": "Ingest", "description": "python3 scripts/ingest.py --source-id iam_testing_quality_knowledge_001 --file scripts/sources/iam_testing_knowledge.txt"},
            {"step": 4, "id": "verify", "name": "Verify", "description": "Use --verify --top-k 20 --verify-query 'agentsam_task_slos sla_p95_latency_ms smoke test run_group_id D1 Supabase eval_runs'. Source chunks appear in top-20. Dense index: generic queries rank below existing codebase vectors."},
        ],
        "tools": ["ollama_embed", "vectorize_upsert", "vectorize_query", "execute_code"],
        "criteria": ["Source chunk in topK=20 score >= 0.65", "Domain-specific verify-query required", "14 chunks with valid mutation_id"],
        "notes": "14 chunks. PASS 0.6709 rank 14 topK=20. Dense index. Domain-specific queries retrieve correctly.",
        "tags": ["testing", "slo", "smoke-test", "d1", "supabase", "analytics", "run-group-id", "knowledge-base", "verified"],
        "defaults": {"chunk_size_chars": 900, "chunk_overlap_chars": 100, "min_verify_score": 0.65, "top_k": 20, "verify_query": "agentsam_task_slos sla_p95_latency_ms smoke test run_group_id D1 Supabase eval_runs", "use_metadata_filter": False},
        "run_count": 1, "success_count": 1, "last_run_at": "2026-05-16T07:27:00Z", "avg_ms": 9000.0,
    },
    {
        "id": "wf_iam_cms_section_001",
        "workflow_key": "iam_cms_section_knowledge_base",
        "display_name": "CMS Homepage Section Migration Knowledge Base",
        "description": "Agent Sam knowledge on IAM CMS Liquid architecture, Selected Work to Agent Sam Platform Services replacement, cms_liquid_sections, cms_liquid_imports, R2 artifact, FK chain. 12 chunks. PASS 0.7564 rank 1.",
        "steps": [
            {"step": 1, "id": "preflight", "name": "Preflight", "description": "Check env vars and Ollama."},
            {"step": 2, "id": "compile_check", "name": "Compile check", "description": "python3 -m py_compile scripts/ingest.py before any execution."},
            {"step": 3, "id": "ingest", "name": "Ingest", "description": "python3 scripts/ingest.py --source-id iam_cms_section_knowledge_001 --file scripts/sources/iam_cms_section_knowledge.txt"},
            {"step": 4, "id": "verify", "name": "Verify", "description": "Use --verify --top-k 20 --verify-query 'cms_liquid_sections cms_liquid_imports cms_page_sections agent_sam_platform_services R2'. Top chunk scores 0.7564 at rank 1."},
        ],
        "tools": ["ollama_embed", "vectorize_upsert", "vectorize_query", "execute_code"],
        "criteria": ["Source chunk in topK=5 rank 1 score >= 0.70", "12 chunks with valid mutation_id"],
        "notes": "12 chunks. PASS 0.7564 rank 1 topK=20. Strongest retrieval of three sources.",
        "tags": ["cms", "liquid", "r2", "homepage", "d1", "sections", "knowledge-base", "verified"],
        "defaults": {"chunk_size_chars": 900, "chunk_overlap_chars": 100, "min_verify_score": 0.70, "top_k": 20, "verify_query": "cms_liquid_sections cms_liquid_imports cms_page_sections agent_sam_platform_services R2", "use_metadata_filter": False},
        "run_count": 1, "success_count": 1, "last_run_at": "2026-05-16T07:43:00Z", "avg_ms": 7000.0,
    },
]


# ══════════════════════════════════════════════════════════════
# 3. agentsam_rules_document
# ══════════════════════════════════════════════════════════════

RULES_BODY = """# IAM Knowledge Ingestion Protocol — Agent Sam Rules

## Stack Reference

| Component | Value |
|---|---|
| Embed model | mxbai-embed-large:latest (Ollama, local) |
| Vectorize index | ai-search-inneranimalmedia-autorag |
| Index dimensions | 1024 |
| Index metric | cosine |
| Chunk size | 900 chars (~225 tokens) |
| Chunk overlap | 100 chars (~25 tokens) |
| Ingest script | scripts/ingest.py |
| Source docs | scripts/sources/*.txt |
| Env file | .env.cloudflare |
| Python binary | python3 (never python) |
| D1 access | CF REST API via requests (never wrangler for complex SQL) |

---

## Python Quality Gates

Generated Python is not accepted until ALL of the following pass:

1. `python3 -m py_compile <script>` exits 0
2. `ast.parse(open(<script>).read())` raises no exception
3. No shell heredoc syntax detected (`<<EOF`, `<<'EOF'`, etc.)
4. Write-capable scripts include a `--dry-run` flag that skips destructive operations
5. Dangerous scripts include explicit backup and rollback language in docstring and steps
6. Script produces a file artifact or logged output confirming what it did
7. `git status` is checked before any apply step that modifies tracked files

Script writing rules:

1. Write scripts as real files — never use `python3 -c` for anything over 3 lines
2. Never use shell heredoc for long content — write a Python file, then run it
3. Never use nested quote-heavy one-liners for complex file creation
4. After writing any Python file, immediately run `python3 -m py_compile` on it
5. If compile fails, patch only the exact syntax error — do not rewrite unrelated sections
6. Never proceed to execution until compile passes
7. All D1 inserts with long strings or JSON use parameterized queries via CF REST API
8. Never use wrangler `--command` for SQL containing single quotes or multiline strings

---

## Adding a New Knowledge Source (4-Step Protocol)

### Step 1 — Write the document

Create `scripts/sources/iam_{domain}_{topic}.txt`.

Writing rules for chunking-optimized content:
- Prose paragraphs only, not bullet lists
- Each paragraph covers exactly one idea
- Blank line between every paragraph (double newline for clean splits)
- Section headers as plain text: `SECTION N: TITLE`
- Keep paragraphs under 800 characters
- No markdown, no code fences, no tables
- Spell out abbreviations on first use per section

### Step 2 — Register in agentsam_scripts

Add a row to `agentsam_scripts` via `scripts/seed_rules_and_workflows.py`. Copy an existing SCRIPTS entry and update:

```python
{
    "id":          "script_ingest_{domain}_{topic}",
    "slug":        "ingest-{domain}-{topic}",
    "name":        "Ingest: {Human Readable Name}",
    "path":        "scripts/sources/iam_{domain}_{topic}.txt",
    "description": "One sentence describing the knowledge domain.",
    "purpose":     "ingest",
    "runner":      "bash",
    "body":        "set -a && source .env.cloudflare && set +a && python3 scripts/ingest.py --source-id {source_id} --file scripts/sources/{filename}.txt --verify-query \"{domain specific terms}\"",
    "language":    "python",
}
```

Body must be a single bash line. No heredoc. No multiline.

### Step 3 — Register in agentsam_mcp_workflows

Add a WORKFLOWS entry to `scripts/seed_rules_and_workflows.py`. Key fields:

```python
{
    "id":           "wf_{domain}_{topic}_001",
    "workflow_key": "{domain}_{topic}_knowledge_base",
    "category":     "knowledge",
    "task_type":    "knowledge_document",
    "model_id":     "gpt-5.4-nano",
    "subagent":     "subagent_toolbox",
}
```

Steps must include: preflight, compile_check, dry_run (optional), ingest, verify.
The compile_check step is mandatory and must run before ingest.

### Step 4 — Compile check then run

```bash
python3 -m py_compile scripts/ingest.py
python3 scripts/ingest.py --source-id {source_id} --file scripts/sources/{filename}.txt --dry-run
python3 scripts/ingest.py --source-id {source_id} --file scripts/sources/{filename}.txt --verify-query "{terms}"
```

Run dry-run first. Check for SUCCESS or PASS. If DEGRADED, run `--verify --top-k 20` with a more specific `--verify-query` before assuming failure.

---

## Verification Rules

PASS: any source chunk appears in topK=20 with score >= 0.65.

DEGRADED does not mean failed. It means the generic verify-query lost to existing index content. Run `--verify --top-k 20` with 4-8 distinctive domain terms. If source chunks appear anywhere in top-20, the vectors landed correctly.

TRUE FAIL: no source chunks in topK=20. Check: Ollama running, model pulled, env vars set, correct index name.

---

## Absolute Rules

Never use `python` — always `python3`.

Never use wrangler `--command` for SQL with embedded quotes or JSON. Use CF D1 REST API via Python requests with parameterized queries.

Never add `--remote` as an afterthought — all seed scripts target the remote DB via REST API by design.

Never embed a Vectorize query without the mxbai instruction prefix: `Represent this sentence for searching: {query}`. Query-side only. Document chunks embed without prefix.

Never run Vectorize queries with a metadata filter. The IAM index has no pre-indexed filter fields.

Never write ingest logic in JavaScript. All pipeline work uses Python via `scripts/ingest.py`.

Never commit a knowledge source without a PASS verification.

Never proceed to execution of any generated Python script until `python3 -m py_compile` exits 0.

---

## Source Registry

| source_id | file | chunks | top_score | status |
|---|---|---|---|---|
| wf_rag_vectorize_knowledge_001 | iam_rag_knowledge.txt | 12 | 0.7357 | PASS |
| iam_testing_quality_knowledge_001 | iam_testing_knowledge.txt | 14 | 0.6709 | PASS |
| iam_cms_section_knowledge_001 | iam_cms_section_knowledge.txt | 12 | 0.7564 | PASS |
"""

RULES_SQL = """
INSERT OR REPLACE INTO agentsam_rules_document (
  id, user_id, workspace_id, title, body_markdown, version, is_active, person_uuid
) VALUES (?,?,?,?,?,?,?,?)
"""


# ══════════════════════════════════════════════════════════════
# Run
# ══════════════════════════════════════════════════════════════

def main():
    print("\n=== 1. agentsam_scripts ===")
    for s in SCRIPTS:
        run(
            s["slug"],
            SCRIPTS_SQL,
            [
                s["id"], "ws_sam_primeaux", s["name"], s["path"],
                s["description"], s["purpose"], s["runner"],
                1, 1, 1,
                None, None, None,
                s["preferred_for"], s["notes"],
                1, s["slug"], 1, s["body"], "sam_primeaux", s["language"],
            ],
        )

    print("\n=== 2. agentsam_mcp_workflows ===")
    for wf in WORKFLOWS:
        run(
            wf["display_name"],
            WORKFLOW_SQL,
            [
                wf["id"],
                wf["workflow_key"],
                wf["display_name"],
                wf["description"],
                "ready",
                "high",
                json.dumps(wf["steps"]),
                json.dumps(wf["tools"]),
                json.dumps(wf["criteria"]),
                wf["notes"],
                "sam_primeaux",
                "ws_sam_primeaux",
                "manual",
                IN_SCHEMA,
                OUT_SCHEMA,
                0,
                "low",
                wf["run_count"],
                wf["success_count"],
                wf["last_run_at"],
                "success",
                wf["avg_ms"],
                0.0,
                1,
                1,
                "subagent_toolbox",
                "gpt-5.4-nano",
                60,
                "knowledge",
                json.dumps(wf["tags"]),
                RETRY,
                ON_FAIL,
                1,
                "production",
                "workspace",
                json.dumps(wf["defaults"]),
                None,
                "knowledge_document",
                0,
                1747382820,
            ],
        )

    print("\n=== 3. agentsam_rules_document ===")
    run(
        "IAM Knowledge Ingestion Protocol",
        RULES_SQL,
        [
            "rdoc_iam_ingest_protocol_001",
            "sam_primeaux",
            "ws_sam_primeaux",
            "IAM Knowledge Ingestion Protocol — Agent Sam Rules",
            RULES_BODY.strip(),
            1,
            1,
            None,
        ],
    )

    print("\nAll done.")


if __name__ == "__main__":
    main()
