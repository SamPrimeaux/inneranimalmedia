#!/usr/bin/env python3
"""
embed-codebase.py — chunk IAM repo, embed with index-matched model, upsert AGENTSAMVECTORIZE.

Smoke-validates Vectorize dimensions via REST before any embedding spend.
One index (inneranimalmedia-vectors), one dimension, one model — indexing and query must match.

Usage:
  python3 scripts/embed-codebase.py --describe-only
  python3 scripts/embed-codebase.py --dry-run
  python3 scripts/embed-codebase.py --priority-snapshot
  python3 scripts/embed-codebase.py --file src/core/agentsam-vectorize.js
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO / "scripts"))

from lib.vectorize_index_config import (  # noqa: E402
    VECTORIZE_INDEX_NAME,
    embed_probe_openai,
    load_env_files,
    resolve_embedding_spec,
    smoke_validate_index,
)

WORKSPACE_ID = "ws_inneranimalmedia"
TENANT_ID = "tenant_sam_primeaux"
SOURCE_TABLE = "codebase"
CHUNK_LINES = 80
CHUNK_OVERLAP = 10
BATCH_SIZE = 20
MAX_CHUNK_CHARS = 6000

PRIORITY_REL_PATHS = [
    "src/api/agent.js",
    "src/api/rag.js",
    "src/core/agentsam-vectorize.js",
    "src/core/agentsam-vectorize-index.js",
    "src/core/codebase-search.js",
    "src/core/agentsam-supabase-sync.js",
    "src/core/memory.js",
    "src/tools/ai-dispatch.js",
    "src/core/workflow-executor.js",
    "scripts/embed-codebase.py",
    "scripts/index-codebase-live.py",
]

INDEX_DIRS = [
    "src",
    "scripts",
    "migrations",
    "dashboard/features",
    "dashboard/components",
    "dashboard/src",
    "docs",
]
INCLUDE_EXTS = {".js", ".ts", ".tsx", ".jsx", ".mjs", ".py", ".sql", ".md", ".toml"}
SKIP_PATTERNS = [
    "node_modules",
    ".wrangler",
    "dist",
    ".git",
    ".bak",
    ".scratch",
    "vendor-react",
]

CACHE_DIR = Path("/tmp/iam-embed-cache")
CACHE_DIR.mkdir(exist_ok=True)


def should_skip(path: Path) -> bool:
    s = str(path)
    return any(p in s for p in SKIP_PATTERNS)


def collect_files(target_file: str | None, priority_only: bool) -> list[Path]:
    if target_file:
        p = _REPO / target_file
        return [p] if p.exists() else []
    if priority_only:
        return [(_REPO / rel) for rel in PRIORITY_REL_PATHS if (_REPO / rel).is_file()]
    files: list[Path] = []
    for d in INDEX_DIRS:
        base = _REPO / d
        if not base.exists():
            continue
        for f in sorted(base.rglob("*")):
            if f.suffix not in INCLUDE_EXTS or should_skip(f):
                continue
            if f.stat().st_size > 500_000:
                continue
            files.append(f)
    return files


def chunk_file(path: Path) -> list[dict]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    lines = text.splitlines()
    rel = str(path.relative_to(_REPO))
    chunks: list[dict] = []
    i = 0
    chunk_idx = 0
    while i < len(lines):
        end = min(i + CHUNK_LINES, len(lines))
        chunk_text = "\n".join(lines[i:end])
        if len(chunk_text) > MAX_CHUNK_CHARS:
            chunk_text = chunk_text[:MAX_CHUNK_CHARS]
        if chunk_text.strip():
            content_hash = hashlib.sha256(chunk_text.encode()).hexdigest()[:16]
            chunk_id = f"{rel}::{chunk_idx}"
            chunks.append(
                {
                    "chunk_id": chunk_id,
                    "content_hash": content_hash,
                    "chunk_text": chunk_text,
                    "file_path": rel,
                    "start_line": i + 1,
                    "end_line": end,
                    "chunk_index": chunk_idx,
                    "metadata": {
                        "file_path": rel,
                        "start_line": i + 1,
                        "end_line": end,
                        "chunk_index": chunk_idx,
                        "source": "codebase",
                        "workspace_id": WORKSPACE_ID,
                    },
                }
            )
            chunk_idx += 1
        i = end - CHUNK_OVERLAP if end < len(lines) else end
    return chunks


def embed_batch(texts: list[str], api_key: str, spec: dict) -> list[list[float]]:
    body = {"model": spec["model"], "input": texts}
    if spec.get("openai_dimensions_param"):
        body["dimensions"] = spec["openai_dimensions_param"]
    payload = json.dumps(body).encode()
    req = Request(
        "https://api.openai.com/v1/embeddings",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    vecs = [item["embedding"] for item in data["data"]]
    dim = spec["dimensions"]
    for v in vecs:
        if len(v) != dim:
            raise RuntimeError(f"OpenAI returned {len(v)} dims, index requires {dim}")
    return vecs


def vectorize_upsert(vectors: list[dict], account_id: str, cf_token: str, index_name: str) -> dict:
    ndjson = "\n".join(json.dumps(v) for v in vectors).encode()
    req = Request(
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/vectorize/v2/indexes/{index_name}/upsert",
        data=ndjson,
        headers={
            "Content-Type": "application/x-ndjson",
            "Authorization": f"Bearer {cf_token}",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        return {"success": False, "error": e.read().decode(errors="replace")[:300]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--describe-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--file", type=str, default=None)
    parser.add_argument("--priority-snapshot", action="store_true")
    parser.add_argument("--all", action="store_true", help="Full repo dirs (not priority-only)")
    args = parser.parse_args()

    env = load_env_files(str(_REPO))
    smoke = smoke_validate_index(env, repo_root=str(_REPO))
    if args.describe_only:
        return

    index = smoke["index"]
    spec = smoke["spec"]
    dimensions = index["dimensions"]
    index_name = index["index_name"]

    openai_key = env.get("OPENAI_API_KEY", "")
    cf_token = env.get("CLOUDFLARE_API_TOKEN", "")
    account_id = env.get("CLOUDFLARE_ACCOUNT_ID", "")

    if not args.dry_run:
        if spec["provider"] != "openai":
            print("ERROR: non-OpenAI index requires Worker-side embedding", file=sys.stderr)
            sys.exit(1)
        missing = [
            k
            for k, v in {
                "OPENAI_API_KEY": openai_key,
                "CLOUDFLARE_API_TOKEN": cf_token,
                "CLOUDFLARE_ACCOUNT_ID": account_id,
            }.items()
            if not v
        ]
        if missing:
            print(f"ERROR: missing env: {missing}", file=sys.stderr)
            sys.exit(1)

    priority_only = args.priority_snapshot or (not args.all and not args.file)
    print(f"\n{'═' * 60}")
    print("  IAM CODEBASE → AGENTSAMVECTORIZE")
    print(f"  Index: {index_name} | dimensions={dimensions} | metric={index['metric']}")
    print(f"  Model: {spec['model']} ({spec['provider']})")
    print(f"  Mode: {'DRY RUN' if args.dry_run else 'LIVE'} | scope={'priority' if priority_only else 'full'}")
    print(f"{'═' * 60}\n")

    files = collect_files(args.file, priority_only)
    print(f"▶ {len(files)} files")
    all_chunks: list[dict] = []
    for f in files:
        all_chunks.extend(chunk_file(f))
    print(f"▶ {len(all_chunks)} chunks\n")
    if not all_chunks:
        print("Nothing to embed.")
        return

    if args.dry_run:
        for c in all_chunks[:3]:
            print(f"  {c['file_path']} L{c['start_line']}-{c['end_line']} id={c['chunk_id']}")
        print(f"\n  Total chunks: {len(all_chunks)}")
        return

    upserted = 0
    for i in range(0, len(all_chunks), BATCH_SIZE):
        batch = all_chunks[i : i + BATCH_SIZE]
        texts = [c["chunk_text"] for c in batch]
        vecs = embed_batch(texts, openai_key, spec)
        vectors = []
        for c, vec in zip(batch, vecs):
            vid = f"codebase:{c['chunk_id']}"
            vectors.append(
                {
                    "id": vid,
                    "values": vec,
                    "metadata": {
                        **c["metadata"],
                        "chunk_id": c["chunk_id"],
                        "content_hash": c["content_hash"],
                        "tenant_id": TENANT_ID,
                    },
                }
            )
        out = vectorize_upsert(vectors, account_id, cf_token, index_name)
        if not out.get("success", True) and out.get("errors"):
            print(f"  batch {i // BATCH_SIZE + 1} FAILED: {out}", file=sys.stderr)
            sys.exit(1)
        upserted += len(vectors)
        print(f"  batch {i // BATCH_SIZE + 1}: upserted {len(vectors)} vectors")
        time.sleep(0.25)

    print(f"\nDONE — {upserted} vectors → {index_name} ({dimensions}-dim, {spec['model']})")


if __name__ == "__main__":
    main()
