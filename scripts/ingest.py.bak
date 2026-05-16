#!/usr/bin/env python3
"""
ingest.py — Reusable RAG ingestion pipeline for IAM
Chunks a document, embeds via local Ollama (mxbai-embed-large:latest),
upserts to Cloudflare Vectorize v2, and verifies retrieval.

Usage:
    python scripts/ingest.py --source-id <id> --file <path/to/doc.txt>
    python scripts/ingest.py --source-id <id> --file <path/to/doc.txt> --verify
    python scripts/ingest.py --source-id <id> --file <path/to/doc.txt> --dry-run

Env (from .env.cloudflare):
    CLOUDFLARE_ACCOUNT_ID
    CLOUDFLARE_API_TOKEN
    OLLAMA_BASE_URL          (default: http://localhost:11434)
    OLLAMA_EMBEDDING_MODEL   (default: mxbai-embed-large:latest)
"""

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

# ── Config ────────────────────────────────────────────────────
ACCOUNT_ID   = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
API_TOKEN    = os.environ.get("CLOUDFLARE_API_TOKEN")
OLLAMA_HOST  = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
EMBED_MODEL  = os.environ.get("OLLAMA_EMBEDDING_MODEL", "mxbai-embed-large:latest")
INDEX        = "ai-search-inneranimalmedia-autorag"
WORKSPACE_ID = "ws_sam_primeaux"
TENANT_ID    = "sam_primeaux"
DIMS         = 1024
CHUNK_CHARS  = 900    # ~225 tokens — safe under Ollama mxbai 512 token cap
OVERLAP_CHARS = 100   # ~25 tokens
BATCH_SIZE   = 100
MIN_SCORE    = 0.70
PREFIX       = "This chunk is from the IAM knowledge base for Agent Sam. "
VERIFY_QUERY_PREFIX = "Represent this sentence for searching: "

# ── Logging ───────────────────────────────────────────────────
def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    print(f"[{ts}] {msg}", flush=True)

# ── Chunker ───────────────────────────────────────────────────
SEPARATORS = ["\n\n", "\n", ". ", " "]

def _split(text, sep_idx, max_chars):
    if len(text) <= max_chars:
        return [text.strip()]
    if sep_idx >= len(SEPARATORS):
        # Hard split
        out = []
        step = max_chars - OVERLAP_CHARS
        for i in range(0, len(text), step):
            out.append(text[i:i + max_chars].strip())
        return [c for c in out if c]
    sep = SEPARATORS[sep_idx]
    pieces = text.split(sep)
    out = []
    cur = ""
    for p in pieces:
        candidate = cur + sep + p if cur else p
        if len(candidate) <= max_chars:
            cur = candidate
        else:
            if cur.strip():
                out.append(cur.strip())
            if len(p) > max_chars:
                out.extend(_split(p, sep_idx + 1, max_chars))
                cur = ""
            else:
                cur = p
    if cur.strip():
        out.append(cur.strip())
    return out

def make_chunks(text, max_chars=CHUNK_CHARS, overlap=OVERLAP_CHARS):
    raw = _split(text.strip(), 0, max_chars)
    result = []
    for i, chunk in enumerate(raw):
        if i == 0:
            result.append(chunk)
        else:
            tail = raw[i - 1][-overlap:].strip()
            result.append((tail + " " + chunk).strip())
    return [c for c in result if len(c) > 40]

def detect_section(text):
    first_line = text.split("\n")[0].strip()
    if first_line.upper().startswith("SECTION"):
        return first_line[:80]
    if first_line.upper().startswith("KNOWLEDGE DOMAIN"):
        return "overview"
    return "general"

def sha256(text):
    return hashlib.sha256(text.encode()).hexdigest()

def estimate_tokens(text):
    return len(text) // 4

# ── Ollama ────────────────────────────────────────────────────
def preflight():
    if not ACCOUNT_ID:
        raise RuntimeError("CLOUDFLARE_ACCOUNT_ID not set")
    if not API_TOKEN:
        raise RuntimeError("CLOUDFLARE_API_TOKEN not set")
    log(f"Checking Ollama at {OLLAMA_HOST}...")
    r = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=5)
    r.raise_for_status()
    models = [m["name"] for m in r.json().get("models", [])]
    if EMBED_MODEL not in models:
        raise RuntimeError(f"Model {EMBED_MODEL} not found. Available: {models}\nRun: ollama pull mxbai-embed-large")
    log(f"Ollama OK — {EMBED_MODEL} ready")

def embed(text):
    r = requests.post(
        f"{OLLAMA_HOST}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": text},
        timeout=60,
    )
    if not r.ok:
        raise RuntimeError(f"Ollama {r.status_code}: {r.text}")
    vec = r.json().get("embedding", [])
    if len(vec) != DIMS:
        raise RuntimeError(f"Bad dims: got {len(vec)}, expected {DIMS}")
    return vec

# ── Vectorize ─────────────────────────────────────────────────
def cf_url(path):
    return f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/vectorize/v2/indexes/{INDEX}/{path}"

CF_HEADERS_NDJSON = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/x-ndjson",
}
CF_HEADERS_JSON = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json",
}

def vectorize_upsert(records):
    body = "\n".join(json.dumps(r) for r in records)
    r = requests.post(cf_url("upsert"), headers=CF_HEADERS_NDJSON, data=body.encode(), timeout=30)
    data = r.json()
    if not r.ok or not data.get("success"):
        raise RuntimeError(f"Upsert failed: {data.get('errors')}")
    return data.get("result", {})

def vectorize_query(vector, top_k=5):
    r = requests.post(
        cf_url("query"),
        headers=CF_HEADERS_JSON,
        json={"vector": vector, "topK": top_k, "returnMetadata": "all"},
        timeout=15,
    )
    data = r.json()
    if not r.ok or not data.get("success"):
        raise RuntimeError(f"Query failed: {data.get('errors')}")
    return data.get("result", {}).get("matches", [])

# ── Main ──────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="IAM RAG ingest pipeline")
    parser.add_argument("--source-id",  required=True, help="Unique source ID (e.g. iam_cms_knowledge_001)")
    parser.add_argument("--file",       required=True, help="Path to the text document to ingest")
    parser.add_argument("--verify",     action="store_true", help="Verify-only mode (no embed/upsert)")
    parser.add_argument("--dry-run",    action="store_true", help="Chunk and embed only, no upsert")
    parser.add_argument("--top-k",      type=int, default=5, help="topK for verification query")
    parser.add_argument("--verify-query", default=None, help="Custom verification query string")
    args = parser.parse_args()

    source_id = args.source_id

    preflight()

    # Load doc
    with open(args.file, "r", encoding="utf-8") as f:
        doc = f.read().strip()
    log(f"Loaded {len(doc)} chars from {args.file}")

    # Default verify query uses source_id words as keywords
    verify_query = args.verify_query or source_id.replace("_", " ")

    if args.verify:
        log("Verify-only mode...")
        qv = embed(VERIFY_QUERY_PREFIX + verify_query)
        matches = vectorize_query(qv, args.top_k)
        log(f"Results (topK={args.top_k}):")
        for m in matches:
            log(f"  {m['score']:.4f}  {m['id']}")
        hit = next((m for m in matches if m["id"].startswith(source_id)), None)
        if hit:
            log(f"PASS — {hit['id']} score={hit['score']:.4f}")
        else:
            log("MISS — no chunks from this source in top results")
        return

    # Chunk
    log("Chunking...")
    raw_chunks = make_chunks(doc)
    chunks = []
    for i, text in enumerate(raw_chunks):
        chunks.append({
            "i": i,
            "id": f"{source_id}_chunk_{str(i).zfill(3)}",
            "text": text,
            "prefixed": PREFIX + text,
            "section": detect_section(text),
            "tokens": estimate_tokens(text),
            "hash": sha256(text),
        })
    avg_tokens = sum(c["tokens"] for c in chunks) // len(chunks)
    log(f"{len(chunks)} chunks, avg ~{avg_tokens} tokens each")

    # Embed
    log(f"Embedding via Ollama — {EMBED_MODEL}...")
    records = []
    for c in chunks:
        print(f"  [{c['i']+1}/{len(chunks)}] {c['id']} ... ", end="", flush=True)
        t0 = time.time()
        vec = embed(c["prefixed"])
        ms = int((time.time() - t0) * 1000)
        print(f"{ms}ms")
        records.append({
            "id": c["id"],
            "values": vec,
            "metadata": {
                "source_id":       source_id,
                "workspace_id":    WORKSPACE_ID,
                "tenant_id":       TENANT_ID,
                "chunk_index":     c["i"],
                "section":         c["section"][:100],
                "token_estimate":  c["tokens"],
                "content_hash":    c["hash"],
                "created_at_unix": int(time.time()),
            },
        })
    log(f"All {len(records)} chunks embedded")

    if args.dry_run:
        log("Dry-run mode — skipping upsert")
        return

    # Upsert
    log("Upserting to Vectorize...")
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        log(f"  Batch {i // BATCH_SIZE + 1}: {len(batch)} vectors")
        result = vectorize_upsert(batch)
        log(f"  mutation_id: {result.get('mutationId', 'n/a')}")

    # Settle
    log("Waiting 5s for index to settle...")
    time.sleep(5)

    # Verify
    log("Running verification query...")
    qv = embed(VERIFY_QUERY_PREFIX + verify_query)
    matches = vectorize_query(qv, args.top_k)
    log(f"Results (topK={args.top_k}):")
    for m in matches:
        log(f"  {m['score']:.4f}  {m['id']}")

    hit = next((m for m in matches if m["id"].startswith(source_id)), None)
    top_score = hit["score"] if hit else 0.0
    passed = top_score >= MIN_SCORE

    log(f"\nSource    : {source_id}")
    log(f"Chunks    : {len(chunks)}")
    log(f"Index     : {INDEX}")
    log(f"Top score : {top_score:.4f}")
    log(f"Status    : {'SUCCESS ✓' if passed else 'DEGRADED — score below threshold'}")

    if not passed:
        sys.exit(1)

if __name__ == "__main__":
    main()
