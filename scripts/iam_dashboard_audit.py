#!/usr/bin/env python3
"""
iam_dashboard_audit.py
======================
Audits the IAM agent dashboard source files, embeds chunks with local Ollama,
analyzes bugs with GPT-4.1-mini, and writes agentsam_plans + agentsam_plan_tasks
to D1 via the IAM API.

Usage:
  ./scripts/with-cloudflare-env.sh python3 scripts/iam_dashboard_audit.py

Requirements:
  pip install openai httpx python-dotenv
  Ollama running locally with mxbai-embed-large pulled:
    ollama pull mxbai-embed-large

Env vars (from .env.cloudflare or environment):
  OPENAI_API_KEY          - for GPT-4.1-mini analysis
  IAM_API_BASE            - e.g. https://inneranimalmedia.com
  IAM_AGENT_TOKEN         - Bearer token for /api/* calls
  OLLAMA_BASE_URL         - default http://localhost:11434
  OLLAMA_EMBED_MODEL      - default mxbai-embed-large (1024 dim)
"""

import os
import sys
import json
import uuid
import time
import hashlib
import textwrap
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

import httpx
from openai import OpenAI
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent.parent / ".env.cloudflare")
load_dotenv(Path(__file__).parent.parent / ".env")

REPO_ROOT        = Path(__file__).parent.parent.resolve()
OLLAMA_BASE      = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL     = os.getenv("OLLAMA_EMBED_MODEL", "mxbai-embed-large")
GPT_MODEL        = os.getenv("AUDIT_GPT_MODEL", "gpt-5.4-mini")
IAM_API_BASE     = os.getenv("IAM_API_BASE", "https://inneranimalmedia.com")
IAM_TOKEN        = os.getenv("IAM_AGENT_TOKEN", "")
SAM_USER_ID      = "au_871d920d1233cbd1"
SAM_WORKSPACE_ID = "ws_inneranimalmedia"
CHUNK_SIZE       = 120   # lines per chunk
OVERLAP          = 10    # lines overlap between chunks

# Files to audit — ordered by relevance to the reported bugs
TARGET_FILES = [
    "dashboard/App.tsx",
    "dashboard/components/LocalExplorer.tsx",
    "dashboard/components/UnifiedSearchBar.tsx",
    "dashboard/components/GitHubExplorer.tsx",
    "dashboard/components/GoogleDriveExplorer.tsx",
    "src/api/r2-api.js",
    "src/api/agent.js",
    "src/core/agent-dispatch.js",
    "src/tools/r2-dispatch.js",
    "src/core/pty-workspace-paths.js",
]

# Bug areas to focus analysis on
BUG_CONTEXTS = [
    "GitHub repos showing across workspaces (Connor seeing Sam's repos)",
    "R2 explorer only shows bound buckets, no object content loads",
    "Agent routes D1 queries to i-am-builder-monaco workflow instead of direct tools",
    "R2 click in topbar opens wrong panel / explorer R2 section empty",
    "Dual PTY endpoint: local Mac vs VM tunnel, gated by user_id",
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def chunk_lines(lines: list[str], size: int, overlap: int) -> list[tuple[int, list[str]]]:
    """Yield (start_line, chunk_lines) with overlap."""
    chunks = []
    i = 0
    while i < len(lines):
        chunk = lines[i:i + size]
        chunks.append((i + 1, chunk))
        i += size - overlap
    return chunks


def embed_ollama(text: str) -> Optional[list[float]]:
    """Get 1024-dim embedding from local Ollama."""
    try:
        # Ollama >= 0.1.26 uses /api/embed; older used /api/embeddings
        r = httpx.post(
            f"{OLLAMA_BASE}/api/embed",
            json={"model": OLLAMA_MODEL, "input": text[:512]},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        # /api/embed returns {"embeddings": [[...]]} (list of lists)
        embeddings = data.get("embeddings") or data.get("embedding")
        if isinstance(embeddings[0], list):
            return embeddings[0]
        return embeddings
    except Exception as e:
        log(f"  [WARN] Ollama embed failed: {e}")
        return None


def cosine_sim(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na  = sum(x ** 2 for x in a) ** 0.5
    nb  = sum(x ** 2 for x in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


# ── Step 1: Crawl + chunk source files ───────────────────────────────────────

def crawl_files() -> list[dict]:
    """Read target files, chunk them, return list of chunk dicts."""
    chunks = []
    for rel_path in TARGET_FILES:
        fpath = REPO_ROOT / rel_path
        if not fpath.exists():
            log(f"  [SKIP] {rel_path} not found")
            continue
        lines = fpath.read_text(errors="replace").splitlines()
        log(f"  {rel_path} — {len(lines)} lines")
        for start_line, chunk_lines_list in chunk_lines(lines, CHUNK_SIZE, OVERLAP):
            text = "\n".join(chunk_lines_list)
            chunks.append({
                "id":        hashlib.md5(f"{rel_path}:{start_line}".encode()).hexdigest()[:12],
                "file":      rel_path,
                "start":     start_line,
                "end":       start_line + len(chunk_lines_list) - 1,
                "text":      text,
                "embedding": None,
            })
    log(f"Total chunks: {len(chunks)}")
    return chunks


# ── Step 2: Embed chunks with Ollama ─────────────────────────────────────────

def embed_chunks(chunks: list[dict]) -> list[dict]:
    log(f"Embedding {len(chunks)} chunks via Ollama ({OLLAMA_MODEL})...")
    for i, chunk in enumerate(chunks):
        chunk["embedding"] = embed_ollama(chunk["text"])
        if (i + 1) % 20 == 0:
            log(f"  {i+1}/{len(chunks)} embedded")
        time.sleep(0.05)  # be gentle to local Ollama
    embedded = [c for c in chunks if c["embedding"]]
    log(f"  {len(embedded)}/{len(chunks)} successfully embedded")
    return embedded


# ── Step 3: Retrieve relevant chunks per bug context ─────────────────────────

def retrieve_for_bug(bug: str, chunks: list[dict], top_k: int = 6) -> list[dict]:
    """Find top-k chunks most relevant to a bug description."""
    query_emb = embed_ollama(bug)
    if not query_emb:
        # fallback: keyword match
        kw = bug.lower().split()
        scored = [(sum(k in c["text"].lower() for k in kw), c) for c in chunks]
    else:
        scored = [(cosine_sim(query_emb, c["embedding"]), c) for c in chunks]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:top_k]]


# ── Step 4: GPT-4.1-mini analysis ────────────────────────────────────────────

def analyze_bug(client: OpenAI, bug: str, relevant_chunks: list[dict]) -> dict:
    """Ask GPT to diagnose the bug and produce a structured plan."""
    context_parts = []
    for c in relevant_chunks:
        context_parts.append(
            f"--- {c['file']} lines {c['start']}-{c['end']} ---\n{c['text'][:2000]}"
        )
    context = "\n\n".join(context_parts)

    system = textwrap.dedent("""
        You are a senior engineer auditing the IAM Agent Dashboard codebase.
        The platform is a Cloudflare Workers + D1 + R2 multi-tenant SaaS.
        Key rules:
        - No hardcoded tenant_ids, user_ids, workspace_ids, or model strings in code.
        - Workspace isolation is enforced via workspace_id on every query.
        - R2 access uses binding-first with S3 SigV4 fallback.
        - Agent command routing goes through resolveAgentCommand → agentsam_command_pattern → agentsam_commands.

        You will be given:
        1. A bug description
        2. Relevant code chunks (file + line numbers)

        Respond ONLY with a valid JSON object, no markdown, no preamble:
        {
          "plan_title": "short title for agentsam_plans",
          "diagnosis": "1-2 sentences: what is broken and why",
          "root_file": "the primary file to fix",
          "root_lines": "e.g. lines 38-105",
          "fix_summary": "1 sentence surgical fix description",
          "tasks": [
            {
              "title": "short task title",
              "file": "path/to/file.tsx",
              "lines": "e.g. 38-45",
              "action": "exact change to make",
              "priority": 1
            }
          ],
          "estimated_risk": "low|medium|high",
          "deploy_cmd": "npm run deploy or npm run deploy:full:safe"
        }
    """).strip()

    user_msg = f"Bug: {bug}\n\nRelevant code:\n{context}"

    resp = client.chat.completions.create(
        model=GPT_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user_msg},
        ],
        temperature=0.1,
        max_completion_tokens=1200,
    )
    raw = resp.choices[0].message.content.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        log(f"  [WARN] GPT returned non-JSON, storing raw")
        return {"plan_title": bug[:60], "raw": raw, "tasks": []}


# ── Step 5: Write agentsam_plans + agentsam_plan_tasks to D1 ─────────────────

def write_plan_to_d1(plan_data: dict, bug: str) -> Optional[str]:
    """POST plan to IAM API → D1 agentsam_plans + agentsam_plan_tasks."""
    if not IAM_TOKEN:
        log("  [SKIP] IAM_AGENT_TOKEN not set — printing plan instead")
        print(json.dumps(plan_data, indent=2))
        return None

    plan_id = f"plan_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    plan_payload = {
        "id":           plan_id,
        "workspace_id": SAM_WORKSPACE_ID,
        "user_id":      SAM_USER_ID,
        "title":        plan_data.get("plan_title", bug[:60]),
        "description":  plan_data.get("diagnosis", ""),
        "status":       "pending",
        "source":       "iam_dashboard_audit",
        "metadata": json.dumps({
            "bug":            bug,
            "root_file":      plan_data.get("root_file"),
            "root_lines":     plan_data.get("root_lines"),
            "fix_summary":    plan_data.get("fix_summary"),
            "estimated_risk": plan_data.get("estimated_risk"),
            "deploy_cmd":     plan_data.get("deploy_cmd"),
        }),
        "created_at":   now_iso,
    }

    tasks = []
    for i, t in enumerate(plan_data.get("tasks", [])):
        tasks.append({
            "id":         f"task_{uuid.uuid4().hex[:12]}",
            "plan_id":    plan_id,
            "workspace_id": SAM_WORKSPACE_ID,
            "title":      t.get("title", f"Task {i+1}"),
            "file_path":  t.get("file", ""),
            "lines":      t.get("lines", ""),
            "action":     t.get("action", ""),
            "priority":   t.get("priority", i + 1),
            "status":     "pending",
            "created_at": now_iso,
        })

    headers = {
        "Authorization": f"Bearer {IAM_TOKEN}",
        "Content-Type":  "application/json",
    }

    try:
        r = httpx.post(
            f"{IAM_API_BASE}/api/agentsam/plans",
            json={"plan": plan_payload, "tasks": tasks},
            headers=headers,
            timeout=15,
        )
        if r.status_code in (200, 201):
            log(f"  ✓ Plan written: {plan_id} ({len(tasks)} tasks)")
            return plan_id
        else:
            log(f"  [WARN] API returned {r.status_code}: {r.text[:200]}")
            # Fallback: write via wrangler D1 direct
            _write_plan_via_wrangler(plan_payload, tasks)
            return plan_id
    except Exception as e:
        log(f"  [WARN] API call failed: {e} — falling back to wrangler")
        _write_plan_via_wrangler(plan_payload, tasks)
        return plan_id


def _write_plan_via_wrangler(plan: dict, tasks: list[dict]):
    """Fallback: write plan + tasks via wrangler d1 execute."""
    import subprocess

    def q(v):
        if v is None: return "NULL"
        return "'" + str(v).replace("'", "''") + "'"

    plan_sql = (
        f"INSERT OR REPLACE INTO agentsam_plans "
        f"(id, workspace_id, user_id, title, description, status, source, metadata, created_at) VALUES "
        f"({q(plan['id'])},{q(plan['workspace_id'])},{q(plan['user_id'])},"
        f"{q(plan['title'])},{q(plan['description'])},{q(plan['status'])},"
        f"{q(plan['source'])},{q(plan['metadata'])},{q(plan['created_at'])});"
    )

    for t in tasks:
        task_sql = (
            f"INSERT OR REPLACE INTO agentsam_plan_tasks "
            f"(id, plan_id, workspace_id, title, file_path, lines, action, priority, status, created_at) VALUES "
            f"({q(t['id'])},{q(t['plan_id'])},{q(t['workspace_id'])},"
            f"{q(t['title'])},{q(t['file_path'])},{q(t['lines'])},"
            f"{q(t['action'])},{t['priority']},{q(t['status'])},{q(t['created_at'])});"
        )

    wrangler_base = [
        "npx", "wrangler", "d1", "execute", "inneranimalmedia-business",
        "--remote", "-c", str(REPO_ROOT / "wrangler.production.toml"),
    ]

    for sql in [plan_sql] + [
        f"INSERT OR REPLACE INTO agentsam_plan_tasks "
        f"(id, plan_id, workspace_id, title, file_path, lines, action, priority, status, created_at) VALUES "
        f"({q(t['id'])},{q(t['plan_id'])},{q(t['workspace_id'])},"
        f"{q(t['title'])},{q(t['file_path'])},{q(t['lines'])},"
        f"{q(t['action'])},{t['priority']},{q(t['status'])},{q(t['created_at'])});"
        for t in tasks
    ]:
        result = subprocess.run(
            wrangler_base + ["--command", sql],
            capture_output=True, text=True, cwd=REPO_ROOT
        )
        if result.returncode != 0:
            log(f"  [ERROR] wrangler: {result.stderr[:200]}")


# ── Step 6: Print summary report ─────────────────────────────────────────────

def print_report(analyses: list[tuple[str, dict, Optional[str]]]):
    print("\n" + "=" * 70)
    print("IAM DASHBOARD AUDIT REPORT")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 70)
    for bug, analysis, plan_id in analyses:
        print(f"\n▸ {analysis.get('plan_title', bug)}")
        print(f"  Diagnosis:  {analysis.get('diagnosis', 'N/A')}")
        print(f"  Root file:  {analysis.get('root_file', 'N/A')} {analysis.get('root_lines', '')}")
        print(f"  Fix:        {analysis.get('fix_summary', 'N/A')}")
        print(f"  Risk:       {analysis.get('estimated_risk', 'N/A')}")
        print(f"  Deploy:     {analysis.get('deploy_cmd', 'N/A')}")
        if plan_id:
            print(f"  Plan ID:    {plan_id}")
        tasks = analysis.get("tasks", [])
        if tasks:
            print(f"  Tasks ({len(tasks)}):")
            for t in tasks:
                print(f"    [{t.get('priority','-')}] {t.get('title')} — {t.get('file')} {t.get('lines','')}")
    print("\n" + "=" * 70)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log("IAM Dashboard Audit starting...")

    # Verify Ollama is up
    try:
        r = httpx.get(f"{OLLAMA_BASE}/api/tags", timeout=5)
        models = [m["name"] for m in r.json().get("models", [])]
        if not any(OLLAMA_MODEL.split(":")[0] in m for m in models):
            log(f"[WARN] {OLLAMA_MODEL} not found in Ollama. Run: ollama pull {OLLAMA_MODEL}")
            log(f"       Available: {models}")
            log("       Continuing with keyword fallback for retrieval...")
    except Exception as e:
        log(f"[WARN] Ollama not reachable ({e}) — embeddings disabled, using keyword fallback")

    # OpenAI client
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        log("[ERROR] OPENAI_API_KEY not set. Exiting.")
        sys.exit(1)
    client = OpenAI(api_key=api_key)

    # Step 1: Crawl
    log("Step 1: Crawling source files...")
    chunks = crawl_files()
    if not chunks:
        log("[ERROR] No files found. Check REPO_ROOT and TARGET_FILES.")
        sys.exit(1)

    # Step 2: Embed
    log("Step 2: Embedding chunks...")
    chunks = embed_chunks(chunks)

    # Step 3-5: Per bug — retrieve, analyze, write
    log("Step 3: Analyzing bugs with GPT...")
    analyses = []
    for i, bug in enumerate(BUG_CONTEXTS, 1):
        log(f"\n  Bug {i}/{len(BUG_CONTEXTS)}: {bug[:60]}...")
        relevant = retrieve_for_bug(bug, chunks, top_k=6)
        log(f"  Retrieved {len(relevant)} relevant chunks")
        analysis = analyze_bug(client, bug, relevant)
        plan_id  = write_plan_to_d1(analysis, bug)
        analyses.append((bug, analysis, plan_id))
        time.sleep(1)  # rate limit buffer

    # Step 6: Report
    print_report(analyses)
    log("Done.")


if __name__ == "__main__":
    main()
