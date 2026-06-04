#!/usr/bin/env python3
"""
embed_deep_archive_golden.py — 3072-dim golden deep archive ingest
==================================================================
Upserts section-chunked architecture docs to:
  agentsam.agentsam_deep_archive_oai3large_3072

Chunking: one row per H2 (##) section — NOT fixed 300-token splits.
Embedding: OpenAI text-embedding-3-large at FULL 3072 dims (no dimensions= param).

Prefer the canonical orchestrator:
  ./scripts/embed-golden-and-skills.sh
  ./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane deep_archive

Usage:
  ./scripts/with-cloudflare-env.sh python3 scripts/embed_deep_archive_golden.py --dry-run
  ./scripts/with-cloudflare-env.sh python3 scripts/embed_deep_archive_golden.py
  ./scripts/with-cloudflare-env.sh python3 scripts/embed_deep_archive_golden.py --only platform-wiring,browserview-wiring

Required env:
  OPENAI_API_KEY
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ID = "fa1f12a8-c841-4b79-a26c-d53a78b17dac"
TABLE = "agentsam_deep_archive_oai3large_3072"
EMBED_MODEL = "text-embedding-3-large"
EMBED_DIMS = 3072
BATCH_SIZE = 8

# Canonical golden docs — doc 27 / doc 26 map to these repo paths
GOLDEN_SOURCES: list[dict[str, Any]] = [
    {
        "key": "platform-wiring",
        "doc_id": "doc-27",
        "title": "Platform Wiring Map",
        "path": "docs/platform/iam-runtime-architecture-2026-06.md",
        "source_type": "architecture",
        "archive_tier": "golden",
        "source_ref": "platform-wiring-map-doc-27",
    },
    {
        "key": "platform-baseline",
        "doc_id": "platform-baseline-2026-06-03",
        "title": "IAM Platform Baseline",
        "path": "docs/platform/platform-baseline-2026-06-03.md",
        "source_type": "architecture",
        "archive_tier": "golden",
        "source_ref": "platform-baseline-2026-06-03",
    },
    {
        "key": "agent-layer-snapshot",
        "doc_id": "agent-layer-snapshot-p0-rag",
        "title": "Agent Layer Snapshot P0 RAG",
        "path": "docs/platform/agent-layer-snapshot-p0-rag-2026-06.md",
        "source_type": "architecture",
        "archive_tier": "golden",
        "source_ref": "agent-layer-snapshot-p0-rag-2026-06",
    },
    {
        "key": "bindings-vectorize-api-map",
        "doc_id": "bindings-vectorize-api-map",
        "title": "Bindings Vectorize API Map",
        "path": "docs/platform/bindings-vectorize-api-map-2026-06.md",
        "source_type": "architecture",
        "archive_tier": "golden",
        "source_ref": "bindings-vectorize-api-map-2026-06",
    },
    {
        "key": "browserview-wiring",
        "doc_id": "doc-26",
        "title": "BrowserView / MYBROWSER Wiring",
        "path": "docs/platform/browserview-mybrowser-wiring-2026-06.md",
        "source_type": "architecture",
        "archive_tier": "golden",
        "source_ref": "browserview-mybrowser-wiring-doc-26",
    },
    {
        "key": "tenant-credential-lanes",
        "doc_id": "tier3-credential-lanes",
        "title": "Tenant Credential Lanes",
        "path": "docs/platform/tenant-credential-lanes-2026-06.md",
        "source_type": "architecture",
        "archive_tier": "golden",
        "source_ref": "tenant-credential-lanes-2026-06",
    },
    {
        "key": "autorag-runtime-contract",
        "doc_id": "tier3-autorag-contract",
        "title": "AutoRAG Knowledge Retrieval Runtime Contract",
        "path": "docs/autorag/AUTORAG_KNOWLEDGE_RETRIEVAL_RUNTIME_CONTRACT.md",
        "source_type": "architecture",
        "archive_tier": "golden",
        "source_ref": "inneranimalmedia.autorag.runtime_contract.v1",
    },
]


def http_json(method: str, url: str, headers: dict[str, str], body: Any | None = None, timeout: int = 90) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code} {method} {url}: {err[:800]}") from e


def supabase_headers() -> dict[str, str]:
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE")
        or ""
    ).strip()
    if not key:
        raise RuntimeError("Missing SUPABASE_SERVICE_ROLE_KEY")
    base = os.environ["SUPABASE_URL"].rstrip("/")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
        "Accept-Profile": "agentsam",
        "Content-Profile": "agentsam",
    }, base


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def split_by_h2(markdown: str) -> list[dict[str, str]]:
    """Chunk by ## headings; include doc preamble before first H2 as its own chunk."""
    lines = markdown.replace("\r\n", "\n").split("\n")
    chunks: list[dict[str, str]] = []
    current_title = "Overview"
    current_lines: list[str] = []

    def flush() -> None:
        body = "\n".join(current_lines).strip()
        if len(body) < 40:
            return
        chunks.append({"section": current_title, "content": body})

    for line in lines:
        if line.startswith("## "):
            flush()
            current_title = line[3:].strip()
            current_lines = [line]
        else:
            current_lines.append(line)
    flush()
    return chunks


def embed_batch(texts: list[str], api_key: str) -> list[list[float]]:
    """Full 3072-dim embeddings — omit dimensions param."""
    r = http_json(
        "POST",
        "https://api.openai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        body={"model": EMBED_MODEL, "input": texts},
    )
    data = sorted(r.get("data", []), key=lambda d: d.get("index", 0))
    vecs = [d["embedding"] for d in data]
    for v in vecs:
        if len(v) != EMBED_DIMS:
            raise RuntimeError(f"Expected {EMBED_DIMS} dims, got {len(v)}")
    return vecs


def build_rows(source: dict[str, Any], sections: list[dict[str, str]], git_sha: str) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows: list[dict[str, Any]] = []
    for i, sec in enumerate(sections):
        title = f"{source['title']} — {sec['section']}"
        body = sec["content"]
        h = content_hash(f"{source['source_ref']}:{i}:{body}")
        rows.append(
            {
                "workspace_id": WORKSPACE_ID,
                "title": title,
                "content": body,
                "content_hash": h,
                "source_type": source["source_type"],
                "archive_tier": source["archive_tier"],
                "source_path": source["path"],
                "source_ref": f"{source['source_ref']}#{i}",
                "source_url": f"https://github.com/SamPrimeaux/inneranimalmedia/blob/main/{source['path']}#section-{i}",
                "embedding_model": EMBED_MODEL,
                "embedding_dims": EMBED_DIMS,
                "embedded_at": now,
                "metadata": {
                    "doc_id": source.get("doc_id"),
                    "doc_key": source["key"],
                    "section": sec["section"],
                    "section_index": i,
                    "git_sha": git_sha,
                    "chunk_strategy": "h2_section",
                },
            }
        )
    return rows


def git_head_sha() -> str:
    import subprocess

    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return "unknown"


def upsert_rows(base: str, headers: dict[str, str], rows: list[dict[str, Any]]) -> None:
    # Unique index: (workspace_id, source_type, source_ref, content_hash)
    url = f"{base}/rest/v1/{TABLE}?on_conflict=workspace_id,source_type,source_ref,content_hash"
    http_json("POST", url, headers, rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Embed golden docs into 3072 deep archive")
    parser.add_argument("--dry-run", action="store_true", help="Print chunks only, no API writes")
    parser.add_argument(
        "--only",
        default="",
        help="Comma-separated source keys (platform-wiring,browserview-wiring,...)",
    )
    args = parser.parse_args()

    only = {k.strip() for k in args.only.split(",") if k.strip()} if args.only else None
    sources = [s for s in GOLDEN_SOURCES if not only or s["key"] in only]
    if not sources:
        print("No matching sources.", file=sys.stderr)
        return 1

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not args.dry_run and not api_key:
        print("OPENAI_API_KEY required unless --dry-run", file=sys.stderr)
        return 1

    sha = git_head_sha()
    pending_rows: list[dict[str, Any]] = []

    for source in sources:
        path = ROOT / source["path"]
        if not path.is_file():
            print(f"SKIP missing file: {source['path']}", file=sys.stderr)
            continue
        md = path.read_text(encoding="utf-8")
        sections = split_by_h2(md)
        rows = build_rows(source, sections, sha)
        print(f"\n── {source['key']} ({source['doc_id']}) → {len(rows)} H2 sections")
        for r in rows:
            tokens_est = max(1, len(r["content"]) // 4)
            print(f"   • {r['metadata']['section'][:60]} (~{tokens_est} tok, hash={r['content_hash'][:12]}…)")
        pending_rows.extend(rows)

    if args.dry_run:
        print(f"\n[dry-run] would upsert {len(pending_rows)} rows → {TABLE}")
        return 0

    headers, base = supabase_headers()
    wrote = 0
    for i in range(0, len(pending_rows), BATCH_SIZE):
        batch = pending_rows[i : i + BATCH_SIZE]
        vecs = embed_batch([r["content"] for r in batch], api_key)
        for row, vec in zip(batch, vecs):
            row["embedding"] = vec
        upsert_rows(base, headers, batch)
        wrote += len(batch)
        print(f"  ✓ upserted {len(batch)} rows ({wrote}/{len(pending_rows)})")

    print(f"\nDone — {wrote} golden chunks in {TABLE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
