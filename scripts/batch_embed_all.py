#!/usr/bin/env python3
"""
batch_embed_all.py
──────────────────
Multi-source embedding pipeline for Agent Sam / Cursor replacement.
Pulls from: repo files, Supabase (via psycopg2), D1 inspection dumps.
Embeds with local Ollama. Pushes to Vectorize.

Priority order (highest signal for Cursor replacement):
  1. Source code  — JS/TS/Python files, chunked by function/section
  2. Plans/todos  — agentsam_plans, agentsam_plan_tasks, agentsam_todo (Supabase)
  3. Skills/tools — agentsam_skill, agentsam_tools, agentsam_mcp_tools (Supabase)
  4. Errors/runs  — agentsam_error_log, agentsam_agent_run, agentsam_executions
  5. Docs/rules   — .md files, .cursorrules, SQL migrations

Usage:
  # Everything — full pipeline
  python3 scripts/batch_embed_all.py --push

  # Just source code
  python3 scripts/batch_embed_all.py --source --push

  # Just Supabase tables
  python3 scripts/batch_embed_all.py --supabase --push \
    --db-url "postgresql://USER:PASS@HOST:5432/DB"

  # Dry run (embed only, no push)
  python3 scripts/batch_embed_all.py --all

Env vars (alternative to flags):
  SUPABASE_DB_URL   postgresql connection string
  OLLAMA_BASE       http://localhost:11434
  VECTORIZE_INDEX   ai-search-inneranimalmedia-autorag
  WRANGLER_TOML     wrangler.production.toml
"""

import argparse
import ast
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from textwrap import dedent


# ─── Config ──────────────────────────────────────────────────────────────────

OLLAMA_BASE     = os.getenv("OLLAMA_BASE", "http://localhost:11434")
VECTORIZE_INDEX = os.getenv("VECTORIZE_INDEX", "ai-search-inneranimalmedia-autorag")
WRANGLER_TOML   = os.getenv("WRANGLER_TOML", "wrangler.production.toml")
PREFERRED_MODEL = "mxbai-embed-large"
EMBED_BATCH     = 16           # conservative for Ollama stability
CHUNK_TOKENS    = 400          # ~chars per code chunk
OUT_DIR         = Path("artifacts/batch_embed")

# ── Source file globs ─────────────────────────────────────────────────────────
SOURCE_GLOBS = [
    ("src/**/*.js",    "source_js"),
    ("src/**/*.ts",    "source_ts"),
    ("worker.js",      "source_js"),
    ("dashboard/features/**/*.tsx", "source_tsx"),
    ("dashboard/features/**/*.ts",  "source_ts"),
    ("scripts/**/*.py", "source_py"),
    ("scripts/**/*.js", "source_js"),
]
SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".wrangler", "__pycache__"}

# ── Supabase tables — ordered by value for Cursor replacement ─────────────────
SUPABASE_QUERIES = [
    ("plans",        "SELECT id, title, status, session_notes, tasks_total, tasks_done FROM agentsam_plans ORDER BY updated_at DESC LIMIT 200"),
    ("plan_tasks",   "SELECT id, plan_id, title, description, status, files_involved, tables_involved FROM agentsam_plan_tasks ORDER BY created_at DESC LIMIT 500"),
    ("skills",       "SELECT id, name, description, trigger_pattern, handler_key, skill_type, tags FROM agentsam_skill WHERE COALESCE(is_active,1)=1 LIMIT 300"),
    ("tools",        "SELECT id, name, description, input_schema, category, tags FROM agentsam_tools WHERE COALESCE(is_active,1)=1 LIMIT 300"),
    ("mcp_tools",    "SELECT id, name, description, input_schema, server_name FROM agentsam_mcp_tools LIMIT 300"),
    ("error_log",    "SELECT id, error_type, message, context_json, created_at FROM agentsam_error_log ORDER BY created_at DESC LIMIT 200"),
    ("agent_run",    "SELECT id, status, intent, model_key, task_type, duration_ms, created_at FROM agentsam_agent_run ORDER BY created_at DESC LIMIT 200"),
    ("memory",       "SELECT id, key, value, scope, tags FROM agentsam_memory WHERE COALESCE(is_active,1)=1 LIMIT 200"),
    ("prompt_routes","SELECT id, route_key, intent_slug, task_type, preferred_model, system_prompt_override FROM agentsam_prompt_routes LIMIT 100"),
    ("model_catalog","SELECT id, model_key, display_name, provider, context_window, is_active, notes FROM agentsam_model_catalog LIMIT 100"),
    ("workflows",    "SELECT id, workflow_key, name, description, is_active FROM agentsam_workflows LIMIT 100"),
]

# ── D1 tables — pulled via wrangler, embedded with Vectorize filter metadata ──
D1_TABLES = [
    {
        "slug":   "skill",
        "source": "skill",
        "sql":    "SELECT id, name, description, trigger_pattern, handler_key, skill_type, task_type, tags FROM agentsam_skill WHERE COALESCE(is_active,1)=1 LIMIT 500",
        "label_col": "name",
    },
    {
        "slug":   "command",
        "source": "command",
        "sql":    "SELECT id, name, description, slug, category, trigger_pattern, task_type FROM agentsam_commands WHERE COALESCE(is_active,1)=1 LIMIT 500",
        "label_col": "name",
    },
    {
        "slug":   "workflow",
        "source": "workflow",
        "sql":    "SELECT id, workflow_key, name, description, trigger_pattern, mode FROM agentsam_workflows WHERE COALESCE(is_active,1)=1 LIMIT 200",
        "label_col": "name",
    },
    {
        "slug":   "memory",
        "source": "memory",
        "sql":    "SELECT id, key, value, scope, tags, workspace_id FROM agentsam_memory WHERE COALESCE(is_active,1)=1 LIMIT 300",
        "label_col": "key",
    },
    {
        "slug":   "plan",
        "source": "plan",
        "sql":    "SELECT id, title, status, session_notes, tasks_total, tasks_done FROM agentsam_plans ORDER BY updated_at DESC LIMIT 50",
        "label_col": "title",
    },
    {
        "slug":   "plan_task",
        "source": "plan",
        "sql":    "SELECT id, plan_id, title, description, status, priority, files_involved, tables_involved FROM agentsam_plan_tasks ORDER BY created_at DESC LIMIT 300",
        "label_col": "title",
    },
    {
        "slug":   "project_context",
        "source": "project",
        "sql":    "SELECT id, project_key, name, description, tech_stack, active_files, active_tables, notes FROM agentsam_project_context WHERE COALESCE(is_active,1)=1 LIMIT 100",
        "label_col": "name",
    },
    {
        "slug":   "prompt_route",
        "source": "route",
        "sql":    "SELECT id, route_key, intent_slug, task_type, preferred_model, fallback_model, system_prompt_override, description FROM agentsam_prompt_routes LIMIT 200",
        "label_col": "route_key",
    },
    {
        "slug":   "prompt_cache",
        "source": "cache",
        "sql":    "SELECT id, cache_key, prompt_key, description, token_count FROM agentsam_prompt_cache_keys LIMIT 50",
        "label_col": "cache_key",
    },
    {
        "slug":   "tool",
        "source": "tool",
        "sql":    "SELECT id, name, description, category, tags, task_type FROM agentsam_tools WHERE COALESCE(is_active,1)=1 LIMIT 300",
        "label_col": "name",
    },
    {
        "slug":   "mcp_tool",
        "source": "tool",
        "sql":    "SELECT id, name, description, server_name, category FROM agentsam_mcp_tools LIMIT 300",
        "label_col": "name",
    },
    {
        "slug":   "mcp_workflow",
        "source": "workflow",
        "sql":    "SELECT id, workflow_key, name, description, trigger_pattern FROM agentsam_mcp_workflows WHERE COALESCE(is_active,1)=1 LIMIT 100",
        "label_col": "name",
    },
]


# ── Doc/rule globs ────────────────────────────────────────────────────────────
DOC_GLOBS = [
    ("**/*.md",          "doc_md"),
    (".cursorrules",     "doc_rules"),
    (".cursor/**/*.mdc", "doc_rules"),
    ("**/*.sql",         "doc_sql"),
]
DOC_SKIP = {"node_modules", ".git", "dist", "artifacts"}


# ─── Ollama ───────────────────────────────────────────────────────────────────

def _post(path, payload):
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(
        f"{OLLAMA_BASE}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode())


def detect_model(preferred=PREFERRED_MODEL):
    req = urllib.request.Request(f"{OLLAMA_BASE}/api/tags")
    with urllib.request.urlopen(req, timeout=10) as r:
        tags = json.loads(r.read().decode())
    names = [m["name"] for m in tags.get("models", [])]
    match = next((n for n in names if n.startswith(preferred)), None)
    if match:
        print(f"  Ollama model: {match}")
        return match
    sys.exit(f"Model '{preferred}' not found. Run: ollama pull {preferred}")


def _sanitize(t):
    """Aggressively clean text before sending to Ollama."""
    t = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', t)  # control chars
    t = re.sub(r'\\u[0-9a-fA-F]{4}', ' ', t)                         # escaped unicode
    t = re.sub(r'[^\x09\x0a\x0d\x20-\x7e\u0080-\ufffd]', ' ', t) # non-printable
    t = re.sub(r'\s{4,}', '   ', t)                                    # collapse whitespace
    return t[:1800].strip()


def embed_single(model, text):
    """Embed one text, return vector or None on failure."""
    t = _sanitize(text)
    if len(t) < 8:
        return None
    try:
        r = _post("/api/embeddings", {"model": model, "prompt": t})
        vec = r.get("embedding")
        return vec if vec and len(vec) > 0 else None
    except Exception:
        return None


def embed_batch(model, texts):
    """Batch embed — try /api/embed first, fall back to serial with skip-on-fail."""
    clean = [_sanitize(t) for t in texts]

    # Try batch endpoint first (Ollama >= 0.3)
    try:
        resp = _post("/api/embed", {"model": model, "input": clean})
        vecs = resp.get("embeddings")
        if vecs and len(vecs) == len(clean):
            return vecs
    except Exception:
        pass

    # Serial fallback — skip failures, never stall
    results = []
    for t in clean:
        vec = embed_single(model, t)
        if vec is None:
            # Try once more with extra-stripped version
            stripped = re.sub(r'[^\x20-\x7e]', ' ', t)[:800]
            vec = embed_single(model, stripped)
        results.append(vec)  # None entries are filtered downstream
    return results


# ─── Source code chunker ──────────────────────────────────────────────────────

def iter_source_files(root: Path):
    for glob_pat, kind in SOURCE_GLOBS:
        for p in root.glob(glob_pat):
            if any(s in p.parts for s in SKIP_DIRS):
                continue
            if p.stat().st_size > 500_000:   # skip minified/generated >500KB
                continue
            yield p, kind


def chunk_source_file(path: Path, kind: str) -> list:
    """
    Chunk a source file into function/section-level passages.
    JS/TS: split on `function`, `export`, `async function`, class declarations.
    Python: split on `def`, `class`.
    Fallback: fixed-size windows.
    """
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []

    rel = str(path)
    chunks = []

    if kind in ("source_js", "source_ts", "source_tsx"):
        # Split on top-level function/export/class boundaries
        pattern = re.compile(
            r'(?=^(?:export\s+)?(?:async\s+)?(?:function|class|const\s+\w+\s*=\s*(?:async\s+)?\(|(?:export\s+)?default\s+))',
            re.MULTILINE
        )
        parts = pattern.split(text)
    elif kind == "source_py":
        pattern = re.compile(r'(?=^(?:def |class |async def ))', re.MULTILINE)
        parts = pattern.split(text)
    else:
        # Fixed windows
        parts = [text[i:i+CHUNK_TOKENS*4] for i in range(0, len(text), CHUNK_TOKENS*4)]

    for i, part in enumerate(parts):
        part = part.strip()
        if len(part) < 40:
            continue
        # Extract a label from first line
        first_line = part.splitlines()[0][:120]
        chunks.append({
            "text": f"[{rel}] {part[:1800]}",
            "meta": {
                "source": "code",
                "kind":   kind,
                "file":   rel,
                "chunk":  i,
                "label":  first_line,
            }
        })

    if not chunks and text.strip():
        # File too short to split — embed as one
        chunks.append({
            "text": f"[{rel}] {text[:1800]}",
            "meta": {"source": "code", "kind": kind, "file": rel, "chunk": 0, "label": rel},
        })

    return chunks


# ─── Doc/rule chunker ─────────────────────────────────────────────────────────

def iter_doc_files(root: Path):
    for glob_pat, kind in DOC_GLOBS:
        for p in root.glob(glob_pat):
            if any(s in p.parts for s in DOC_SKIP):
                continue
            if p.stat().st_size > 200_000:
                continue
            yield p, kind


def chunk_doc_file(path: Path, kind: str) -> list:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []

    rel  = str(path)
    # Split on markdown headings or blank-line paragraphs
    if kind in ("doc_md", "doc_rules"):
        parts = re.split(r'\n(?=#{1,3} )', text)
    else:
        parts = re.split(r'\n{2,}', text)

    chunks = []
    for i, part in enumerate(parts):
        part = part.strip()
        if len(part) < 30:
            continue
        first = part.splitlines()[0][:100]
        chunks.append({
            "text": f"[{rel}] {part[:1800]}",
            "meta": {"source": "doc", "kind": kind, "file": rel, "chunk": i, "label": first},
        })
    return chunks


# ─── Supabase source ──────────────────────────────────────────────────────────

def fetch_supabase_passages(db_url: str) -> list:
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        sys.exit("psycopg2 not installed. Run: pip install psycopg2-binary --break-system-packages")

    passages = []
    print(f"  Connecting to Supabase …")
    conn = psycopg2.connect(db_url, connect_timeout=15)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    for table_slug, sql in SUPABASE_QUERIES:
        try:
            cur.execute(sql)
            rows = cur.fetchall()
            print(f"    {table_slug}: {len(rows)} rows")
            for i, row in enumerate(rows):
                parts = [f"{k}: {v}" for k, v in row.items()
                         if v is not None and str(v).strip() not in ("", "null", "{}")]
                text = f"[supabase:{table_slug}] " + " | ".join(parts)
                meta = {
                    "source": "supabase",
                    "table":  table_slug,
                    "row":    i,
                    **{k: str(v)[:80] for k, v in list(row.items())[:8]},
                }
                passages.append({"text": text[:1800], "meta": meta})
        except Exception as e:
            print(f"    [warn] {table_slug}: {e}")

    cur.close()
    conn.close()
    return passages


# ─── Embed + write JSONL ──────────────────────────────────────────────────────

def embed_passages(passages: list, model: str, label: str, out_file: Path) -> int:
    """Embed a list of {text, meta} dicts, write JSONL, return vector count."""
    if not passages:
        print(f"  {label}: 0 passages — skip")
        return 0

    print(f"  {label}: {len(passages)} passages", end="", flush=True)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    vec_id_base = label.replace("/", "_").replace(".", "_")

    for i in range(0, len(passages), EMBED_BATCH):
        batch = passages[i : i + EMBED_BATCH]
        texts = [p["text"] for p in batch]
        vecs  = embed_batch(model, texts)

        for j, vec in enumerate(vecs):
            if not vec or len(vec) < 64:
                continue
            lines.append(json.dumps({
                "id":       f"{vec_id_base}:{i+j}",
                "values":   vec,
                "metadata": batch[j]["meta"],
            }, ensure_ascii=False))
        print(".", end="", flush=True)

    out_file.write_text("\n".join(lines), encoding="utf-8")
    print(f" → {len(lines)} vectors")
    return len(lines)


# ─── Push to Vectorize ────────────────────────────────────────────────────────

def push_to_vectorize(jsonl_path: Path, index: str, toml: str):
    if not jsonl_path.exists() or jsonl_path.stat().st_size == 0:
        print(f"  [skip] {jsonl_path.name} is empty")
        return
    print(f"\n  Pushing {jsonl_path.name} ({jsonl_path.stat().st_size // 1024}KB) → {index} …")
    result = subprocess.run([
        "npx", "wrangler", "vectorize", "insert", index,
        "--file", str(jsonl_path),
        "-c", toml,
    ])
    if result.returncode != 0:
        print(f"  [warn] wrangler exited {result.returncode}")


def merge_jsonl(files: list, dest: Path):
    lines = []
    for f in files:
        if f.exists():
            lines.extend(f.read_text().splitlines())
    dest.write_text("\n".join(l for l in lines if l.strip()), encoding="utf-8")
    return len(lines)


# ─── D1 source ────────────────────────────────────────────────────────────────

def query_d1(sql: str, toml: str) -> list:
    """Run a D1 query via wrangler --json and return rows as dicts."""
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "inneranimalmedia-business",
         "--remote", "-c", toml, "--json", "--command", sql],
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        print(f"    [warn] D1 query failed: {result.stderr[:200]}")
        return []
    try:
        data = json.loads(result.stdout)
        # wrangler --json returns [{results: [...], ...}]
        if isinstance(data, list) and data:
            return data[0].get("results", [])
        return []
    except Exception as e:
        print(f"    [warn] D1 JSON parse failed: {e}")
        return []


def build_d1_passages(table_def: dict, rows: list) -> list:
    """Convert D1 rows into (text, metadata) passages for embedding."""
    passages = []
    source   = table_def["source"]
    slug     = table_def["slug"]
    label_col = table_def.get("label_col", "id")

    for i, row in enumerate(rows):
        # Build natural-language passage
        parts = []
        for k, v in row.items():
            if v is None or str(v).strip() in ("", "null", "NULL", "{}", "[]"):
                continue
            parts.append(f"{k}: {v}")
        if not parts:
            continue

        label = str(row.get(label_col, slug))
        text  = f"[{slug}] {label} — " + " | ".join(parts)

        meta = {
            "source":  source,
            "slug":    slug,
            "row_id":  str(row.get("id", i)),
            "label":   label[:80],
        }
        # Carry key routing fields into metadata for zero-D1-roundtrip injection
        for carry in ("task_type", "trigger_pattern", "name", "route_key",
                      "handler_key", "workflow_key", "category", "scope"):
            if row.get(carry):
                meta[carry] = str(row[carry])[:80]

        passages.append({"text": text[:1800], "meta": meta})
    return passages


def embed_d1_tables(out_dir: Path, model: str, toml: str, push: bool,
                    index: str, wrangler_toml: str) -> int:
    print(f"\n── D1 priority tables ──")
    embed_dir = out_dir / "embeddings"
    embed_dir.mkdir(parents=True, exist_ok=True)

    all_lines  = []
    total_vecs = 0

    for tdef in D1_TABLES:
        slug = tdef["slug"]
        print(f"  querying {slug} …", end="", flush=True)
        rows = query_d1(tdef["sql"], toml)
        print(f" {len(rows)} rows")

        if not rows:
            continue

        passages = build_d1_passages(tdef, rows)
        if not passages:
            continue

        table_lines = []
        print(f"  embedding {slug}: {len(passages)} passages", end="", flush=True)

        for i in range(0, len(passages), EMBED_BATCH):
            batch = passages[i : i + EMBED_BATCH]
            vecs  = embed_batch(model, [p["text"] for p in batch])
            for j, vec in enumerate(vecs):
                if not vec or len(vec) < 64:
                    continue
                entry = json.dumps({
                    "id":       f"{slug}:{i+j}",
                    "values":   vec,
                    "metadata": batch[j]["meta"],
                }, ensure_ascii=False)
                table_lines.append(entry)
                all_lines.append(entry)
            print(".", end="", flush=True)

        print(f" → {len(table_lines)} vectors")
        (embed_dir / f"d1_{slug}.jsonl").write_text(
            "\n".join(table_lines), encoding="utf-8"
        )
        total_vecs += len(table_lines)

    # Write combined D1 jsonl
    combined = embed_dir / "d1_combined.jsonl"
    combined.write_text("\n".join(all_lines), encoding="utf-8")
    print(f"\n  d1_combined.jsonl → {len(all_lines)} vectors")

    if push and all_lines:
        push_to_vectorize(combined, index, wrangler_toml)

    return total_vecs


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Multi-source batch embed → Vectorize")
    ap.add_argument("--all",      action="store_true", help="All sources (no push)")
    ap.add_argument("--source",   action="store_true", help="Embed repo source files")
    ap.add_argument("--docs",     action="store_true", help="Embed .md/.sql/.cursorrules")
    ap.add_argument("--supabase", action="store_true", help="Embed Supabase table rows")
    ap.add_argument("--push",     action="store_true", help="Push to Vectorize after embedding")
    ap.add_argument("--db-url",   default=os.getenv("SUPABASE_DB_URL"), help="Postgres connection string")
    ap.add_argument("--index",    default=VECTORIZE_INDEX)
    ap.add_argument("--toml",     default=WRANGLER_TOML)
    ap.add_argument("--model",    default=PREFERRED_MODEL)
    ap.add_argument("--root",     default=".", help="Repo root")
    args = ap.parse_args()

    if args.all:
        args.source = args.docs = args.supabase = args.d1 = True

    if not any([args.source, args.docs, args.supabase, args.d1]):
        ap.print_help()
        sys.exit(0)

    root  = Path(args.root).resolve()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\nDetecting Ollama model …")
    model = detect_model(args.model)
    print(f"  Warm-up …", end="", flush=True)
    test  = embed_batch(model, ["warm-up"])
    dim   = len(test[0]) if test and test[0] else 0
    print(f" dim={dim}")
    if dim != 1024:
        print(f"  [warn] Expected 1024-dim, got {dim}")

    produced: list[Path] = []
    total_vectors = 0

    # ── 1. Source code ─────────────────────────────────────────────────────────
    if args.source:
        print(f"\n── Source code ──")
        src_passages = []
        file_count   = 0
        for p, kind in iter_source_files(root):
            chunks = chunk_source_file(p, kind)
            src_passages.extend(chunks)
            file_count += 1
        print(f"  {file_count} files → {len(src_passages)} passages")
        out = OUT_DIR / "source_code.jsonl"
        n = embed_passages(src_passages, model, "source_code", out)
        total_vectors += n
        produced.append(out)

    # ── 2. Docs / rules ────────────────────────────────────────────────────────
    if args.docs:
        print(f"\n── Docs & rules ──")
        doc_passages = []
        for p, kind in iter_doc_files(root):
            doc_passages.extend(chunk_doc_file(p, kind))
        out = OUT_DIR / "docs.jsonl"
        n = embed_passages(doc_passages, model, "docs", out)
        total_vectors += n
        produced.append(out)

    # ── 2b. D1 priority tables ───────────────────────────────────────────────
    if args.d1:
        n = embed_d1_tables(OUT_DIR, model, args.toml, False, args.index, args.toml)
        total_vectors += n
        produced.append(OUT_DIR / "embeddings" / "d1_combined.jsonl")

    # ── 3. Supabase ────────────────────────────────────────────────────────────
    if args.supabase:
        print(f"\n── Supabase ──")
        if not args.db_url:
            print("  [skip] --db-url / SUPABASE_DB_URL not set")
        else:
            sb_passages = fetch_supabase_passages(args.db_url)
            out = OUT_DIR / "supabase.jsonl"
            n = embed_passages(sb_passages, model, "supabase", out)
            total_vectors += n
            produced.append(out)

    # ── Merge all into combined.jsonl ──────────────────────────────────────────
    combined = OUT_DIR / "combined.jsonl"
    count    = merge_jsonl(produced, combined)
    print(f"\n  combined.jsonl → {count} vectors total")

    if args.push:
        push_to_vectorize(combined, args.index, args.toml)
        print(f"\n  All vectors live in {args.index}")
    else:
        print(f"\n  To push:  npx wrangler vectorize insert {args.index} --file {combined} -c {args.toml}")


if __name__ == "__main__":
    main()
