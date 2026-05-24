#!/usr/bin/env python3
"""
embed_codebase_vectorize.py
---------------------------
Chunks the IAM codebase, embeds with text-embedding-3-large (1536 dims),
and dual-writes to:
  1. Cloudflare Vectorize  — AGENTSAMVECTORIZE (fast ANN)
  2. Supabase pgvector     — agentsam_memory_embeddings_1536 (filtered search)
  3. D1 audit log          — agentsam_vectorize_sync_log

Usage:
    cd /Users/samprimeaux/inneranimalmedia
    python3 scripts/embed_codebase_vectorize.py

    # Dry run — chunk + print, no API calls
    python3 scripts/embed_codebase_vectorize.py --dry-run

    # Single file
    python3 scripts/embed_codebase_vectorize.py --file src/core/resolveModel.js

    # Re-embed changed files only (default — uses content hash)
    python3 scripts/embed_codebase_vectorize.py --changed-only

Reads from: agentsam.local.env / .env.cloudflare / .env
Requires: OPENAI_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)
"""

import os, sys, re, json, hashlib, time, argparse, textwrap
from pathlib import Path

CACHE_DIR = Path("/tmp/iam-embed-cache")
CACHE_DIR.mkdir(exist_ok=True)

def cache_path(content_hash: str) -> Path:
    return CACHE_DIR / f"{content_hash}.json"

def load_cached(content_hash: str):
    p = cache_path(content_hash)
    if p.exists():
        return json.loads(p.read_text())
    return None

def save_cache(content_hash: str, embedding: list):
    cache_path(content_hash).write_text(json.dumps(embedding))
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

# ── Config ────────────────────────────────────────────────────────────────────

REPO          = Path("/Users/samprimeaux/inneranimalmedia")
WORKSPACE_ID  = "ws_inneranimalmedia"
TENANT_ID     = "tenant_sam_primeaux"
SOURCE_TABLE  = "codebase"
VECTORIZE_IDX = "inneranimalmedia-vectors"
EMBED_MODEL   = "text-embedding-3-large"
EMBED_DIMS    = 1536
CHUNK_LINES   = 80       # target lines per chunk
CHUNK_OVERLAP = 10       # overlap lines between chunks
BATCH_SIZE    = 20       # embeddings per OpenAI request
MAX_CHUNK_CHARS = 6000   # hard cap — skip chunks over this

# Dirs to index
INDEX_DIRS = [
    "src",
    "scripts",
    "migrations",
    "dashboard/features",
    "dashboard/components",
    "dashboard/src",
    "dashboard/pages",
    "docs",
]

# Extensions to include
INCLUDE_EXTS = {
    ".js", ".ts", ".tsx", ".jsx", ".mjs",
    ".py", ".sql", ".md", ".toml",
}

# Files/dirs to skip
SKIP_PATTERNS = [
    "node_modules", ".wrangler", "dist", ".git",
    ".bak", ".save", "tmp/", ".scratch",
    "vendor-react", "dashboard.js.map",
]

ENV_FILES = [
    REPO / "agentsam.local.env",
    REPO / ".env.cloudflare",
    REPO / ".env",
]

# ── Env loader ────────────────────────────────────────────────────────────────

def load_env() -> dict:
    env = {}
    for f in ENV_FILES:
        if not f.exists():
            continue
        for line in f.read_text(errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in env:
                env[k] = v
    for k, v in os.environ.items():
        env[k] = v
    return env


# ── File collection ───────────────────────────────────────────────────────────

def should_skip(path: Path) -> bool:
    s = str(path)
    return any(pat in s for pat in SKIP_PATTERNS)


def collect_files(target_file: str | None = None) -> list[Path]:
    if target_file:
        p = REPO / target_file
        return [p] if p.exists() else []
    files = []
    for d in INDEX_DIRS:
        base = REPO / d
        if not base.exists():
            continue
        for f in sorted(base.rglob("*")):
            if f.suffix not in INCLUDE_EXTS:
                continue
            if should_skip(f):
                continue
            if f.stat().st_size > 500_000:  # skip files > 500KB
                continue
            files.append(f)
    return files


# ── Chunker ───────────────────────────────────────────────────────────────────

def chunk_file(path: Path) -> list[dict]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []

    lines = text.splitlines()
    rel = str(path.relative_to(REPO))
    chunks = []
    i = 0
    chunk_idx = 0

    while i < len(lines):
        end = min(i + CHUNK_LINES, len(lines))
        chunk_lines = lines[i:end]
        chunk_text = "\n".join(chunk_lines)

        if len(chunk_text) > MAX_CHUNK_CHARS:
            # Hard truncate oversized chunks
            chunk_text = chunk_text[:MAX_CHUNK_CHARS]

        if chunk_text.strip():
            chunk_id = f"{rel}::{chunk_idx}"
            content_hash = hashlib.sha256(chunk_text.encode()).hexdigest()[:16]
            chunks.append({
                "chunk_id":     chunk_id,
                "content_hash": content_hash,
                "chunk_text":   chunk_text,
                "file_path":    rel,
                "start_line":   i + 1,
                "end_line":     end,
                "chunk_index":  chunk_idx,
                "ext":          path.suffix,
                "metadata": {
                    "file_path":   rel,
                    "start_line":  i + 1,
                    "end_line":    end,
                    "chunk_index": chunk_idx,
                    "source":      "codebase",
                    "workspace_id": WORKSPACE_ID,
                }
            })
            chunk_idx += 1

        i = end - CHUNK_OVERLAP if end < len(lines) else end

    return chunks


# ── OpenAI embeddings ─────────────────────────────────────────────────────────

def embed_batch(texts: list[str], api_key: str) -> list[list[float]]:
    payload = json.dumps({
        "model": EMBED_MODEL,
        "input": texts,
        "dimensions": EMBED_DIMS,
    }).encode()
    req = Request(
        "https://api.openai.com/v1/embeddings",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    return [item["embedding"] for item in data["data"]]


# ── Cloudflare Vectorize ──────────────────────────────────────────────────────

def vectorize_upsert(vectors: list[dict], account_id: str, cf_token: str) -> dict:
    """
    vectors: [{id, values:[float...], metadata:{...}}]
    """
    # Vectorize uses NDJSON for bulk upsert
    ndjson = "\n".join(json.dumps(v) for v in vectors)
    payload = ndjson.encode()
    req = Request(
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/vectorize/v2/indexes/{VECTORIZE_IDX}/upsert",
        data=payload,
        headers={
            "Content-Type":  "application/x-ndjson",
            "Authorization": f"Bearer {cf_token}",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        body = e.read().decode(errors="replace")[:200]
        return {"success": False, "error": f"HTTP {e.code}: {body}"}


# ── Supabase pgvector ─────────────────────────────────────────────────────────

def supabase_upsert(rows: list[dict], supabase_url: str, supabase_key: str) -> dict:
    """
    rows: [{workspace_id, source_table, source_id, chunk_id, content_hash,
            chunk_text, embedding_model, embedding_dimensions, embedding, metadata,
            vectorize_id, vectorize_index, vectorize_sync_status}]
    """
    payload = json.dumps(rows).encode()
    url = f"{supabase_url}/rest/v1/agentsam_memory_embeddings_1536"
    req = Request(
        url,
        data=payload,
        headers={
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {supabase_key}",
            "apikey":        supabase_key,
            "Prefer":        "resolution=merge-duplicates,return=minimal",
            "On-Conflict": "chunk_id",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=30) as resp:
            body = resp.read()
            return {"success": True, "rows": len(rows)}
    except HTTPError as e:
        body = e.read().decode(errors="replace")[:300]
        return {"success": False, "error": f"HTTP {e.code}: {body}"}


# ── D1 sync log via Cloudflare API ────────────────────────────────────────────

def d1_log_batch(log_rows: list[dict], account_id: str, cf_token: str):
    DB_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
    for row in log_rows:
        sql = """
        INSERT OR IGNORE INTO agentsam_vectorize_sync_log
          (vectorize_index, vectorize_id, source_table, source_id,
           workspace_id, tenant_id, operation, dimensions,
           embedding_model, content_hash, status, latency_ms)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """
        params = [
            VECTORIZE_IDX, row["vectorize_id"], SOURCE_TABLE,
            row["chunk_id"], WORKSPACE_ID, TENANT_ID, "upsert",
            EMBED_DIMS, EMBED_MODEL, row["content_hash"],
            row.get("status", "ok"), row.get("latency_ms", 0)
        ]
        payload = json.dumps({"sql": sql, "params": params}).encode()
        req = Request(
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{DB_ID}/query",
            data=payload,
            headers={
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {cf_token}",
            },
            method="POST",
        )
        try:
            with urlopen(req, timeout=15) as resp:
                pass
        except Exception:
            pass  # non-fatal


# ── Changed-only check via Supabase ──────────────────────────────────────────

def get_known_hashes(chunk_ids: list[str], supabase_url: str, supabase_key: str) -> set[str]:
    if not chunk_ids:
        return set()
    # Query by chunk_id list — fetch known content_hashes
    ids_param = ",".join(f'"{c}"' for c in chunk_ids[:500])
    url = f"{supabase_url}/rest/v1/agentsam_memory_embeddings_1536?select=chunk_id,content_hash&chunk_id=in.({ids_param})"
    req = Request(url, headers={
        "Authorization": f"Bearer {supabase_key}",
        "apikey": supabase_key,
    })
    try:
        with urlopen(req, timeout=20) as resp:
            rows = json.loads(resp.read())
        return {r["chunk_id"] + ":" + r["content_hash"] for r in rows}
    except Exception:
        return set()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--file", type=str, default=None)
    parser.add_argument("--changed-only", action="store_true", default=True)
    parser.add_argument("--all", action="store_true", help="Re-embed everything")
    args = parser.parse_args()

    if args.all:
        args.changed_only = False

    env = load_env()
    openai_key  = env.get("OPENAI_API_KEY", "")
    cf_token    = env.get("CLOUDFLARE_API_TOKEN", "")
    account_id  = env.get("CLOUDFLARE_ACCOUNT_ID", "ede6590ac0d2fb7daf155b35653457b2")
    supa_url    = env.get("SUPABASE_URL", "")
    supa_key    = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_ANON_KEY", "")

    if not args.dry_run:
        missing = [k for k, v in {
            "OPENAI_API_KEY": openai_key,
            "CLOUDFLARE_API_TOKEN": cf_token,
            "SUPABASE_URL": supa_url,
            "SUPABASE_SERVICE_ROLE_KEY": supa_key,
        }.items() if not v]
        if missing:
            print(f"ERROR: missing env vars: {missing}", file=sys.stderr)
            sys.exit(1)

    print(f"\n{'═'*60}")
    print(f"  IAM CODEBASE VECTORIZE PIPELINE")
    print(f"  Model: {EMBED_MODEL} {EMBED_DIMS}-dim")
    print(f"  Index: {VECTORIZE_IDX}")
    print(f"  Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"{'═'*60}\n")

    # ── Collect files ──────────────────────────────────────────────────────
    print("▶ Collecting files...")
    files = collect_files(args.file)
    print(f"  {len(files)} files found\n")

    # ── Chunk all files ────────────────────────────────────────────────────
    print("▶ Chunking...")
    all_chunks = []
    for f in files:
        chunks = chunk_file(f)
        all_chunks.extend(chunks)
    print(f"  {len(all_chunks)} chunks total\n")

    if not all_chunks:
        print("No chunks to process.")
        return

    # ── Changed-only filter ────────────────────────────────────────────────
    if args.changed_only and not args.dry_run:
        print("▶ Checking known hashes (changed-only mode)...")
        chunk_ids = [c["chunk_id"] for c in all_chunks]
        known = get_known_hashes(chunk_ids, supa_url, supa_key)
        before = len(all_chunks)
        all_chunks = [
            c for c in all_chunks
            if (c["chunk_id"] + ":" + c["content_hash"]) not in known
        ]
        print(f"  {before - len(all_chunks)} unchanged skipped")
        print(f"  {len(all_chunks)} new/changed chunks to embed\n")

    if not all_chunks:
        print("Everything up to date — nothing to embed.")
        return

    if args.dry_run:
        print("▶ DRY RUN — first 3 chunks:")
        for c in all_chunks[:3]:
            print(f"  {c['file_path']} lines {c['start_line']}–{c['end_line']} hash={c['content_hash']}")
            print(f"  text preview: {c['chunk_text'][:120].replace(chr(10),' ')}")
            print()
        print(f"  Total chunks: {len(all_chunks)}")
        print(f"  Estimated OpenAI calls: {len(all_chunks) // BATCH_SIZE + 1}")
        return

    # ── Embed in batches ───────────────────────────────────────────────────
    print("▶ Embedding...")
    embeddings = []
    for i in range(0, len(all_chunks), BATCH_SIZE):
        batch = all_chunks[i:i + BATCH_SIZE]
        texts = [c["chunk_text"] for c in batch]
        t0 = time.time()
        # Check cache first
        cached_vecs = [load_cached(c["content_hash"]) for c in batch]
        uncached_idx = [j for j, v in enumerate(cached_vecs) if v is None]

        if uncached_idx:
            uncached_texts = [texts[j] for j in uncached_idx]
            try:
                new_vecs = embed_batch(uncached_texts, openai_key)
                for j, vec in zip(uncached_idx, new_vecs):
                    save_cache(batch[j]["content_hash"], vec)
                    cached_vecs[j] = vec
                ms = int((time.time() - t0) * 1000)
                print(f"  batch {i//BATCH_SIZE + 1}: {len(uncached_idx)} embedded {len(batch)-len(uncached_idx)} cached ({ms}ms)")
            except HTTPError as e:
                print(f"  [ERROR] embed batch {i//BATCH_SIZE + 1}: HTTP {e.code}")
                sys.exit(1)
        else:
            print(f"  batch {i//BATCH_SIZE + 1}: {len(batch)} all cached ✓")

        vecs = cached_vecs
        time.sleep(0.3)  # rate limit buffer

    print(f"  {len(embeddings)} embeddings ready\n")

    # ── Dual write ─────────────────────────────────────────────────────────
    print("▶ Writing to Vectorize + Supabase...")
    log_rows = []
    vectorize_batch = []
    supabase_batch  = []

    for chunk, embedding in zip(all_chunks, embeddings):
        vectorize_id = f"codebase::{chunk['chunk_id'].replace('/', '_').replace('::', '__')}"

        vectorize_batch.append({
            "id":       vectorize_id,
            "values":   embedding,
            "metadata": chunk["metadata"],
        })
        supabase_batch.append({
            "workspace_id":          WORKSPACE_ID,
            "source_table":          SOURCE_TABLE,
            "source_id":             chunk["file_path"],
            "chunk_id":              chunk["chunk_id"],
            "content_hash":          chunk["content_hash"],
            "chunk_text":            chunk["chunk_text"],
            "embedding_model":       EMBED_MODEL,
            "embedding_dimensions":  EMBED_DIMS,
            "embedding":             f"[{','.join(str(x) for x in embedding)}]",
            "metadata":              chunk["metadata"],
            "vectorize_id":          vectorize_id,
            "vectorize_index":       VECTORIZE_IDX,
            "vectorize_sync_status": "synced",
            "vectorize_synced_at":   time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        log_rows.append({
            "vectorize_id":  vectorize_id,
            "chunk_id":      chunk["chunk_id"],
            "content_hash":  chunk["content_hash"],
            "status":        "ok",
            "latency_ms":    0,
        })

    # Write Vectorize in batches of 100 (CF limit)
    cf_ok = 0
    for i in range(0, len(vectorize_batch), 100):
        batch = vectorize_batch[i:i+100]
        result = vectorize_upsert(batch, account_id, cf_token)
        if result.get("success"):
            cf_ok += len(batch)
            print(f"  Vectorize: {cf_ok}/{len(vectorize_batch)} upserted")
        else:
            print(f"  [WARN] Vectorize batch {i//100+1}: {result.get('error','unknown')}")
        time.sleep(0.2)

    # Write Supabase in batches of 50
    supa_ok = 0
    for i in range(0, len(supabase_batch), 50):
        batch = supabase_batch[i:i+50]
        result = supabase_upsert(batch, supa_url, supa_key)
        if result.get("success"):
            supa_ok += result["rows"]
            print(f"  Supabase:  {supa_ok}/{len(supabase_batch)} upserted")
        else:
            print(f"  [WARN] Supabase batch {i//50+1}: {result.get('error','unknown')}")
        time.sleep(0.1)

    # D1 audit log
    print("  Logging to D1...")
    d1_log_batch(log_rows, account_id, cf_token)

    print(f"\n{'═'*60}")
    print(f"  DONE")
    print(f"  Vectorize: {cf_ok}/{len(vectorize_batch)}")
    print(f"  Supabase:  {supa_ok}/{len(supabase_batch)}")
    print(f"  D1 log:    {len(log_rows)} rows")
    print(f"{'═'*60}\n")


if __name__ == "__main__":
    main()
