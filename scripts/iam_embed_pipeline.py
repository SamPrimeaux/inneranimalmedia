#!/usr/bin/env python3
"""
Agent Sam Embedding Pipeline — iam_embed_pipeline.py
=====================================================
Governed by: primetech_agentic_flow_protocol
Python output: primetech_primeaux_paste_protocol

Reads four IAM artifacts, chunks them logically by table/section/statement,
embeds via OpenAI text-embedding-3-large (1536 dims), and upserts to:
  1. Cloudflare Vectorize  — inneranimalmedia-vectors (1536-dim cosine)
  2. Supabase code_chunks  — via upsert_code_chunk() RPC

Input files (relative to repo root):
  migrations/agentsam_schema_unify.sql
  artifacts/analytics_consolidation/CONSOLIDATION_PLAN.md
  artifacts/analytics_consolidation/COMPONENT_MAP.md
  artifacts/analytics_consolidation/TABLE_MAP.md

Run:
  python3 scripts/iam_embed_pipeline.py
  python3 scripts/iam_embed_pipeline.py --dry-run       # print chunks, no API calls
  python3 scripts/iam_embed_pipeline.py --skip-vectorize
  python3 scripts/iam_embed_pipeline.py --skip-supabase

Required env:
  OPENAI_API_KEY
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional:
  VECTORIZE_INDEX_NAME  (default: inneranimalmedia-vectors)
  EMBED_BATCH_SIZE      (default: 50 — texts per OpenAI call)
  EMBED_REPO            (default: inneranimalmedia)
  EMBED_GIT_BRANCH      (default: main)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ROOT               = Path.cwd()
OPENAI_KEY         = os.environ.get("OPENAI_API_KEY", "")
CF_ACCOUNT_ID      = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CF_API_TOKEN       = os.environ.get("CLOUDFLARE_API_TOKEN", "")
SUPABASE_URL       = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY       = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
VECTORIZE_INDEX    = os.environ.get("VECTORIZE_INDEX_NAME", "inneranimalmedia-vectors")
BATCH_SIZE         = int(os.environ.get("EMBED_BATCH_SIZE", "50"))
REPO               = os.environ.get("EMBED_REPO", "inneranimalmedia")
GIT_BRANCH         = os.environ.get("EMBED_GIT_BRANCH", "main")
WORKSPACE_ID       = "ws_inneranimalmedia"

EMBED_MODEL        = "text-embedding-3-large"
EMBED_DIMS         = 1536

INPUT_FILES: list[dict[str, Any]] = [
    {
        "path":      "migrations/agentsam_schema_unify.sql",
        "type":      "sql_migration",
        "language":  "sql",
        "strategy":  "by_sql_block",
    },
    {
        "path":      "artifacts/analytics_consolidation/TABLE_MAP.md",
        "type":      "table_map",
        "language":  "markdown",
        "strategy":  "by_table_row",
    },
    {
        "path":      "artifacts/analytics_consolidation/COMPONENT_MAP.md",
        "type":      "component_map",
        "language":  "markdown",
        "strategy":  "by_section",
    },
    {
        "path":      "artifacts/analytics_consolidation/CONSOLIDATION_PLAN.md",
        "type":      "consolidation_plan",
        "language":  "markdown",
        "strategy":  "by_section",
    },
]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def http_post(url: str, payload: dict | bytes | str, headers: dict,
              timeout: int = 60) -> dict[str, Any]:
    if isinstance(payload, dict):
        data = json.dumps(payload).encode()
    elif isinstance(payload, str):
        data = payload.encode()
    else:
        data = payload

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return {"ok": True, "status": resp.status,
                    "body": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        return {"ok": False, "status": e.code, "body": body[:500]}
    except Exception as e:
        return {"ok": False, "status": 0, "error": str(e)}


# ---------------------------------------------------------------------------
# Chunkers
# ---------------------------------------------------------------------------

def stable_id(text: str, source: str, index: int) -> str:
    """Stable deterministic chunk ID from content hash."""
    h = hashlib.sha256(f"{source}:{index}:{text[:200]}".encode()).hexdigest()[:12]
    return f"chunk_{h}"


def chunk_by_sql_block(content: str, file_path: str) -> list[dict[str, Any]]:
    """Split SQL file into logical blocks (one per ALTER TABLE or CREATE TABLE)."""
    chunks: list[dict[str, Any]] = []
    current: list[str] = []
    current_table = None
    chunk_type = "schema"
    line_start = 1

    lines = content.splitlines()
    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # Detect new statement start
        if re.match(r'^(ALTER TABLE|CREATE TABLE|CREATE INDEX|INSERT INTO|UPDATE |DELETE FROM)',
                    stripped, re.I):
            # Flush previous
            if current:
                text = "\n".join(current).strip()
                if len(text) > 20:
                    chunks.append({
                        "content":     text,
                        "chunk_type":  chunk_type,
                        "symbol_name": current_table,
                        "start_line":  line_start,
                        "end_line":    i - 1,
                    })
            current      = [line]
            line_start   = i
            # Extract table name
            m = re.search(r'(?:TABLE|INTO|UPDATE)\s+[`"\[]?(\w+)[`"\]]?', stripped, re.I)
            current_table = m.group(1) if m else None
            # Set chunk type
            if "ALTER TABLE" in stripped.upper():
                chunk_type = "schema_migration"
            elif "CREATE TABLE" in stripped.upper():
                chunk_type = "schema"
            elif "CREATE INDEX" in stripped.upper():
                chunk_type = "schema"
            elif "INSERT INTO" in stripped.upper():
                chunk_type = "query"
            else:
                chunk_type = "query"
        elif stripped.startswith("--") and not current:
            # Standalone comment → treat as new block context
            current = [line]
            line_start = i
            chunk_type = "comment"
        else:
            current.append(line)

    # Flush last
    if current:
        text = "\n".join(current).strip()
        if len(text) > 20:
            chunks.append({
                "content":     text,
                "chunk_type":  chunk_type,
                "symbol_name": current_table,
                "start_line":  line_start,
                "end_line":    len(lines),
            })

    return chunks


def chunk_by_table_row(content: str, file_path: str) -> list[dict[str, Any]]:
    """
    TABLE_MAP.md: one chunk per table row.
    Captures the full context: table name, verdict, endpoints, components.
    """
    chunks: list[dict[str, Any]] = []
    lines   = content.splitlines()
    headers = []
    in_table = False

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # Capture section headers as context
        if stripped.startswith("#"):
            headers = [stripped]
            in_table = False
            continue

        # Detect table header row
        if stripped.startswith("| Table") or stripped.startswith("|----"):
            in_table = True
            continue

        # Table data row
        if in_table and stripped.startswith("|") and not stripped.startswith("|---"):
            cells = [c.strip() for c in stripped.split("|")[1:-1]]
            if len(cells) >= 2:
                # Clean backticks from table name
                table_name = re.sub(r'[`*]', '', cells[0]).strip()
                verdict    = re.sub(r'[*_`]', '', cells[1]).strip() if len(cells) > 1 else ""
                endpoints  = cells[2].strip() if len(cells) > 2 else ""
                components = cells[3].strip() if len(cells) > 3 else ""

                text = (
                    f"Table: {table_name}\n"
                    f"Verdict: {verdict}\n"
                    f"Endpoints: {endpoints}\n"
                    f"Components: {components}\n"
                    f"Context: {' > '.join(headers)}"
                )

                if table_name and len(table_name) > 2:
                    chunks.append({
                        "content":     text,
                        "chunk_type":  "schema",
                        "symbol_name": table_name,
                        "start_line":  i,
                        "end_line":    i,
                    })

    return chunks


def chunk_by_section(content: str, file_path: str,
                     min_chars: int = 100,
                     max_chars: int = 2000) -> list[dict[str, Any]]:
    """
    Generic markdown section chunker.
    Splits on ## or ### headers. Respects max_chars by splitting large sections.
    """
    chunks:   list[dict[str, Any]] = []
    sections: list[tuple[str, str, int]] = []  # (header, body, line_num)

    current_header = "Introduction"
    current_lines:  list[str] = []
    line_start = 1
    lines      = content.splitlines()

    for i, line in enumerate(lines, 1):
        if re.match(r'^#{1,3}\s', line):
            if current_lines:
                body = "\n".join(current_lines).strip()
                if body:
                    sections.append((current_header, body, line_start))
            current_header = line.lstrip("#").strip()
            current_lines  = []
            line_start     = i
        else:
            current_lines.append(line)

    if current_lines:
        body = "\n".join(current_lines).strip()
        if body:
            sections.append((current_header, body, line_start))

    for header, body, start_line in sections:
        if len(body) < min_chars:
            continue

        text = f"{header}\n\n{body}"

        # Split oversized sections into sub-chunks
        if len(text) > max_chars:
            paragraphs = re.split(r'\n{2,}', text)
            buffer     = ""
            buf_start  = start_line
            for para in paragraphs:
                if len(buffer) + len(para) > max_chars and buffer:
                    chunks.append({
                        "content":     buffer.strip(),
                        "chunk_type":  "block",
                        "symbol_name": header[:80],
                        "start_line":  buf_start,
                        "end_line":    buf_start + buffer.count("\n"),
                    })
                    buffer    = para
                    buf_start = buf_start + buffer.count("\n") + 2
                else:
                    buffer = buffer + "\n\n" + para if buffer else para
            if buffer.strip():
                chunks.append({
                    "content":     buffer.strip(),
                    "chunk_type":  "block",
                    "symbol_name": header[:80],
                    "start_line":  buf_start,
                    "end_line":    buf_start + buffer.count("\n"),
                })
        else:
            chunks.append({
                "content":     text,
                "chunk_type":  "block",
                "symbol_name": header[:80],
                "start_line":  start_line,
                "end_line":    start_line + body.count("\n"),
            })

    return chunks


CHUNKERS = {
    "by_sql_block":  chunk_by_sql_block,
    "by_table_row":  chunk_by_table_row,
    "by_section":    chunk_by_section,
}


# ---------------------------------------------------------------------------
# Build full chunk list
# ---------------------------------------------------------------------------

def build_chunks() -> list[dict[str, Any]]:
    all_chunks: list[dict[str, Any]] = []

    for spec in INPUT_FILES:
        path = ROOT / spec["path"]
        if not path.exists():
            print(f"  MISS {spec['path']} — skipping")
            continue

        content    = path.read_text(errors="replace")
        chunker    = CHUNKERS[spec["strategy"]]
        raw_chunks = chunker(content, spec["path"])

        for idx, chunk in enumerate(raw_chunks):
            text = chunk["content"]
            if not text or len(text.strip()) < 30:
                continue

            chunk_id     = stable_id(text, spec["path"], idx)
            content_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
            token_est    = len(text.split())  # rough estimate

            all_chunks.append({
                "id":           chunk_id,
                "file_path":    spec["path"],
                "file_name":    Path(spec["path"]).name,
                "language":     spec["language"],
                "chunk_type":   chunk.get("chunk_type", "block"),
                "symbol_name":  chunk.get("symbol_name"),
                "content":      text,
                "content_hash": content_hash,
                "start_line":   chunk.get("start_line", 0),
                "end_line":     chunk.get("end_line", 0),
                "token_count":  token_est,
                "chunk_index":  idx,
                "source_type":  spec["type"],
            })

        print(f"  OK  {spec['path']} → {len(raw_chunks)} chunks")

    return all_chunks


# ---------------------------------------------------------------------------
# OpenAI embeddings
# ---------------------------------------------------------------------------

def embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    payload = {
        "model":      EMBED_MODEL,
        "input":      texts,
        "dimensions": EMBED_DIMS,
    }
    res = http_post(
        "https://api.openai.com/v1/embeddings",
        payload,
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type":  "application/json",
        },
        timeout=60,
    )
    if not res["ok"]:
        print(f"  [WARN] OpenAI embed error: {res.get('status')} {str(res.get('body',''))[:200]}")
        return [[] for _ in texts]

    data = res["body"].get("data", [])
    data.sort(key=lambda x: x.get("index", 0))
    return [item["embedding"] for item in data]


def embed_all(chunks: list[dict[str, Any]]) -> list[list[float]]:
    embeddings: list[list[float]] = []
    texts = [c["content"] for c in chunks]
    total = len(texts)

    for i in range(0, total, BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        print(f"  Embedding batch {i//BATCH_SIZE + 1}/{(total-1)//BATCH_SIZE + 1} "
              f"({len(batch)} texts)...", end="", flush=True)
        vecs = embed_batch(batch)
        embeddings.extend(vecs)
        print(f" ✓  ({len([v for v in vecs if v])} ok)")
        if i + BATCH_SIZE < total:
            time.sleep(0.3)  # rate limit breathing room

    return embeddings


# ---------------------------------------------------------------------------
# Vectorize upsert
# ---------------------------------------------------------------------------

def upsert_vectorize(chunks: list[dict[str, Any]],
                     embeddings: list[list[float]]) -> dict[str, Any]:
    """
    Upsert to Cloudflare Vectorize via REST API.
    Format: NDJSON, one object per line.
    """
    lines = []
    skipped = 0
    for chunk, vec in zip(chunks, embeddings):
        if not vec or len(vec) != EMBED_DIMS:
            skipped += 1
            continue
        obj = {
            "id":     chunk["id"],
            "values": vec,
            "metadata": {
                "file_path":   chunk["file_path"],
                "file_name":   chunk["file_name"],
                "chunk_type":  chunk["chunk_type"],
                "language":    chunk["language"],
                "symbol_name": chunk["symbol_name"] or "",
                "source_type": chunk["source_type"],
                "workspace_id": WORKSPACE_ID,
                "repo":        REPO,
                "text":        chunk["content"][:500],  # metadata text preview
            },
        }
        lines.append(json.dumps(obj))

    if not lines:
        return {"ok": False, "error": "no valid embeddings to upsert"}

    ndjson_body = "\n".join(lines).encode()
    url = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
           f"/vectorize/v2/indexes/{VECTORIZE_INDEX}/upsert")
    req = urllib.request.Request(
        url, data=ndjson_body, method="POST",
        headers={
            "Authorization": f"Bearer {CF_API_TOKEN}",
            "Content-Type":  "application/x-ndjson",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return {"ok": True, "upserted": len(lines), "skipped": skipped,
                    "response": result}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        return {"ok": False, "status": e.code, "body": body[:300],
                "skipped": skipped}
    except Exception as e:
        return {"ok": False, "error": str(e), "skipped": skipped}


# ---------------------------------------------------------------------------
# Supabase upsert (via RPC upsert_code_chunk)
# ---------------------------------------------------------------------------

def ensure_supabase_file(file_path: str, language: str) -> str | None:
    """
    Insert or return existing code_files row. Returns file_id.
    """
    file_name = Path(file_path).name
    # Try insert, on conflict return existing id
    payload = {
        "file_path":    file_path,
        "file_name":    file_name,
        "extension":    Path(file_path).suffix,
        "language":     language,
        "workspace_id": WORKSPACE_ID,
        "repo":         REPO,
        "git_branch":   GIT_BRANCH,
        "last_indexed_at": "now()",
    }
    res = http_post(
        f"{SUPABASE_URL}/rest/v1/code_files",
        payload,
        headers={
            "Authorization":  f"Bearer {SUPABASE_KEY}",
            "apikey":         SUPABASE_KEY,
            "Content-Type":   "application/json",
            "Prefer":         "resolution=merge-duplicates,return=representation",
        },
    )
    if res["ok"]:
        body = res["body"]
        if isinstance(body, list) and body:
            return body[0].get("id")
    # Fallback: query existing
    url = (f"{SUPABASE_URL}/rest/v1/code_files"
           f"?file_path=eq.{urllib.parse.quote(file_path)}"
           f"&workspace_id=eq.{WORKSPACE_ID}&select=id&limit=1")
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            rows = json.loads(resp.read())
            if rows:
                return rows[0]["id"]
    except Exception:
        pass
    return None


# Need urllib.parse for the fallback query
import urllib.parse


def upsert_supabase_chunks(chunks: list[dict[str, Any]],
                            embeddings: list[list[float]]) -> dict[str, Any]:
    """
    Call Supabase RPC upsert_code_chunk() for each chunk with a valid embedding.
    Batches via individual RPC calls (Supabase doesn't natively batch RPC).
    """
    # Group chunks by file to minimize code_files lookups
    by_file: dict[str, list[tuple[dict, list[float]]]] = {}
    for chunk, vec in zip(chunks, embeddings):
        if not vec or len(vec) != EMBED_DIMS:
            continue
        fp = chunk["file_path"]
        by_file.setdefault(fp, []).append((chunk, vec))

    total_ok    = 0
    total_fail  = 0
    file_id_map: dict[str, str | None] = {}

    for file_path, pairs in by_file.items():
        # Get or create code_files row
        if file_path not in file_id_map:
            lang = pairs[0][0]["language"]
            file_id_map[file_path] = ensure_supabase_file(file_path, lang)

        file_id = file_id_map[file_path]
        if not file_id:
            print(f"  [WARN] Supabase: could not get file_id for {file_path}")
            total_fail += len(pairs)
            continue

        for chunk, vec in pairs:
            rpc_payload = {
                "p_file_id":      file_id,
                "p_workspace_id": WORKSPACE_ID,
                "p_repo":         REPO,
                "p_content":      chunk["content"],
                "p_content_hash": chunk["content_hash"],
                "p_chunk_index":  chunk["chunk_index"],
                "p_chunk_type":   chunk["chunk_type"],
                "p_symbol_name":  chunk["symbol_name"] or "",
                "p_start_line":   chunk["start_line"],
                "p_end_line":     chunk["end_line"],
                "p_token_count":  chunk["token_count"],
                "p_language":     chunk["language"],
                "p_embedding":    vec,
                "p_git_sha":      "",
                "p_git_branch":   GIT_BRANCH,
            }
            res = http_post(
                f"{SUPABASE_URL}/rest/v1/rpc/upsert_code_chunk",
                rpc_payload,
                headers={
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "apikey":        SUPABASE_KEY,
                    "Content-Type":  "application/json",
                },
                timeout=30,
            )
            if res["ok"]:
                total_ok += 1
            else:
                total_fail += 1
                if total_fail <= 3:  # only show first few errors
                    print(f"  [WARN] Supabase upsert fail: {res.get('status')} "
                          f"{str(res.get('body',''))[:150]}")

    return {"ok": True, "upserted": total_ok, "failed": total_fail}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def check_env(args: argparse.Namespace) -> bool:
    missing = []
    if not OPENAI_KEY:
        missing.append("OPENAI_API_KEY")
    if not args.skip_vectorize:
        if not CF_ACCOUNT_ID:
            missing.append("CLOUDFLARE_ACCOUNT_ID")
        if not CF_API_TOKEN:
            missing.append("CLOUDFLARE_API_TOKEN")
    if not args.skip_supabase:
        if not SUPABASE_URL:
            missing.append("SUPABASE_URL")
        if not SUPABASE_KEY:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if missing and not args.dry_run:
        print(f"[FAIL] Missing env: {', '.join(missing)}", file=sys.stderr)
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="IAM Embedding Pipeline")
    parser.add_argument("--dry-run",        action="store_true",
                        help="Chunk and print only — no API calls")
    parser.add_argument("--skip-vectorize", action="store_true",
                        help="Skip Cloudflare Vectorize upsert")
    parser.add_argument("--skip-supabase",  action="store_true",
                        help="Skip Supabase upsert")
    parser.add_argument("--show-chunks",    action="store_true",
                        help="Print each chunk content in dry-run")
    args = parser.parse_args()

    if not check_env(args):
        return 2

    print("IAM Embedding Pipeline")
    print(f"  model      : {EMBED_MODEL} ({EMBED_DIMS} dims)")
    print(f"  vectorize  : {VECTORIZE_INDEX}")
    print(f"  supabase   : {SUPABASE_URL[:40] if SUPABASE_URL else 'skipped'}...")
    print(f"  batch_size : {BATCH_SIZE}")
    print(f"  dry_run    : {args.dry_run}")
    print()

    # Step 1 — Build chunks
    print("[1/4] Building chunks...")
    chunks = build_chunks()
    print(f"  Total chunks: {len(chunks)}")
    print()

    if args.dry_run or args.show_chunks:
        for i, c in enumerate(chunks):
            print(f"  [{i:03d}] {c['source_type']} | {c['chunk_type']} | "
                  f"{c['symbol_name'] or 'anon'} | {len(c['content'])} chars")
            if args.show_chunks:
                print(f"        {c['content'][:120].replace(chr(10), ' ')}")
        if args.dry_run:
            print("\nDRY RUN complete — no embeddings or upserts made.")
            return 0

    if not chunks:
        print("[FAIL] No chunks built. Check file paths.", file=sys.stderr)
        return 1

    # Step 2 — Embed
    print("[2/4] Generating embeddings...")
    t_embed = time.time()
    embeddings = embed_all(chunks)
    valid = sum(1 for v in embeddings if v and len(v) == EMBED_DIMS)
    print(f"  {valid}/{len(chunks)} embeddings valid ({time.time()-t_embed:.1f}s)")
    print()

    results: dict[str, Any] = {"chunks": len(chunks), "valid_embeddings": valid}

    # Step 3 — Vectorize
    if not args.skip_vectorize:
        print(f"[3/4] Upserting to Vectorize ({VECTORIZE_INDEX})...")
        vz_res = upsert_vectorize(chunks, embeddings)
        results["vectorize"] = vz_res
        if vz_res.get("ok"):
            print(f"  OK  {vz_res['upserted']} vectors upserted "
                  f"({vz_res.get('skipped',0)} skipped)")
        else:
            print(f"  [WARN] Vectorize: {vz_res.get('status')} "
                  f"{vz_res.get('body','')[:200]}")
    else:
        print("[3/4] Vectorize skipped")
        results["vectorize"] = {"skipped": True}
    print()

    # Step 4 — Supabase
    if not args.skip_supabase:
        print("[4/4] Upserting to Supabase code_chunks...")
        t_sb = time.time()
        sb_res = upsert_supabase_chunks(chunks, embeddings)
        results["supabase"] = sb_res
        print(f"  OK  {sb_res['upserted']} upserted, "
              f"{sb_res.get('failed',0)} failed ({time.time()-t_sb:.1f}s)")
    else:
        print("[4/4] Supabase skipped")
        results["supabase"] = {"skipped": True}
    print()

    # Summary
    print("="*50)
    print(f"  Chunks         : {results['chunks']}")
    print(f"  Embeddings     : {results['valid_embeddings']}")
    vz = results.get("vectorize", {})
    sb = results.get("supabase", {})
    if not vz.get("skipped"):
        print(f"  Vectorize      : {vz.get('upserted',0)} upserted")
    if not sb.get("skipped"):
        print(f"  Supabase       : {sb.get('upserted',0)} upserted")
    print()
    print("Run semantic_code_search() in Supabase to verify:")
    print("  SELECT * FROM semantic_code_search(")
    print("    '[your query embedding]', match_count => 5);")
    print()
    print("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
