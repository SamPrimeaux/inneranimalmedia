#!/usr/bin/env python3
"""
embed_audit_artifacts.py
========================
Chunks markdown audit artifacts → embeds via Ollama mxbai-embed-large (1024d)
→ upserts into Cloudflare Vectorize index: ai-search-inneranimalmedia-autorag

Usage:
    python3 scripts/embed_audit_artifacts.py
    python3 scripts/embed_audit_artifacts.py --dry-run        # chunk/embed only, no upsert
    python3 scripts/embed_audit_artifacts.py --source path/to/file.md   # single file

Requirements:
    pip3 install requests  (stdlib + requests only)
    ollama running locally: ollama serve
    wrangler authenticated + with-cloudflare-env.sh present
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

# ── CONFIG ────────────────────────────────────────────────────────────────────
REPO_ROOT        = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR    = REPO_ROOT / "artifacts"
VECTORIZE_INDEX  = "ai-search-inneranimalmedia-autorag"
ACCOUNT_ID       = "ede6590ac0d2fb7daf155b35653457b2"
WRANGLER_CONFIG  = "wrangler.production.toml"
OLLAMA_URL       = "http://localhost:11434/api/embeddings"
OLLAMA_MODEL     = "mxbai-embed-large"
EMBED_DIMENSIONS = 1024
CHUNK_MIN_CHARS  = 80    # skip tiny sections
CHUNK_MAX_CHARS  = 800  # truncate very large sections
UPSERT_BATCH     = 50    # vectors per wrangler call

# Which markdown files to ingest (glob patterns under artifacts/)
SOURCE_GLOBS = [
    "agentsam_table_usage_audit/LATEST_*.md",
    "plan_audits/**/LATEST_*.md",
]

# Also ingest docs knowledge files if present
DOCS_GLOBS = [
    "docs/agentsam_knowledge/*.md",
]

# ── CHUNKING ──────────────────────────────────────────────────────────────────

def chunk_markdown(text: str, source_path: str) -> list[dict[str, Any]]:
    """Split on ## headers. Each chunk = one section."""
    sections = re.split(r"^(#{1,3} .+)$", text, flags=re.MULTILINE)
    chunks: list[dict[str, Any]] = []
    current_title = "preamble"
    current_body  = ""

    def flush(title: str, body: str) -> None:
        combined = f"{title}\n{body}".strip()
        if len(combined) < CHUNK_MIN_CHARS:
            return
        combined = combined[:CHUNK_MAX_CHARS]
        chunk_id = hashlib.sha256(f"{source_path}:{title}".encode()).hexdigest()[:32]
        chunks.append({
            "id":       chunk_id,
            "text":     combined,
            "metadata": {
                "source": source_path,
                "title":  title.lstrip("#").strip()[:120],
                "chars":  len(combined),
                "type":   _classify_source(source_path),
            },
        })

    for part in sections:
        if re.match(r"^#{1,3} ", part):
            flush(current_title, current_body)
            current_title = part.strip()
            current_body  = ""
        else:
            current_body += part

    flush(current_title, current_body)
    return chunks


def _classify_source(path: str) -> str:
    if "table_usage" in path:
        return "schema_audit"
    if "plan01" in path or "chat_run_spine" in path:
        return "plan01_spine"
    if "plan02" in path or "routing" in path:
        return "plan02_routing"
    if "plan03" in path or "prompt" in path:
        return "plan03_prompt"
    if "plan04" in path or "tool_loop" in path:
        return "plan04_tools"
    if "plan05" in path or "context_budget" in path:
        return "plan05_context"
    if "plan06" in path or "eval_drift" in path:
        return "plan06_eval"
    if "plan07" in path or "validation" in path:
        return "plan07_validation"
    if "agentsam_knowledge" in path:
        return "knowledge_doc"
    return "audit"

# ── EMBEDDING ─────────────────────────────────────────────────────────────────

def embed_ollama(text: str) -> list[float]:
    try:
        import urllib.request
        payload = json.dumps({"model": OLLAMA_MODEL, "prompt": text}).encode()
        req = urllib.request.Request(
            OLLAMA_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        vec = data.get("embedding") or []
        if len(vec) != EMBED_DIMENSIONS:
            raise ValueError(f"Expected {EMBED_DIMENSIONS} dims, got {len(vec)}")
        return vec
    except Exception as e:
        raise RuntimeError(f"Ollama embed failed: {e}") from e

# ── VECTORIZE UPSERT ──────────────────────────────────────────────────────────

def wrangler_upsert(vectors: list[dict[str, Any]], *, root: Path) -> bool:
    """Write NDJSON tmp file and call wrangler vectorize insert."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".ndjson", delete=False, encoding="utf-8"
    ) as f:
        tmp = f.name
        for v in vectors:
            f.write(json.dumps({
                "id":       v["id"],
                "values":   v["values"],
                "metadata": v["metadata"],
            }) + "\n")

    wrapper = root / "scripts" / "with-cloudflare-env.sh"
    cmd: list[str] = []
    if wrapper.is_file():
        cmd.append(str(wrapper))
    cmd += [
        "npx", "wrangler", "vectorize", "insert", VECTORIZE_INDEX,
        "--file", tmp,
        "-c", WRANGLER_CONFIG,
    ]
    print(f"  → wrangler upsert {len(vectors)} vectors …")
    proc = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True, timeout=120)
    os.unlink(tmp)
    if proc.returncode != 0:
        print(f"  [ERR] wrangler:\n{proc.stderr[:1000]}")
        return False
    print(f"  ✓  upserted ({proc.stdout.strip()[:120]})")
    return True

# ── MAIN ──────────────────────────────────────────────────────────────────────

def collect_files(extra: list[str]) -> list[Path]:
    files: list[Path] = []
    for glob in SOURCE_GLOBS:
        files.extend(ARTIFACTS_DIR.glob(glob))
    for glob in DOCS_GLOBS:
        files.extend(REPO_ROOT.glob(glob))
    for p in extra:
        fp = Path(p)
        if fp.exists():
            files.append(fp)
    seen: set[str] = set()
    out: list[Path] = []
    for f in files:
        k = str(f.resolve())
        if k not in seen:
            seen.add(k)
            out.append(f)
    return sorted(out)


def main() -> None:
    ap = argparse.ArgumentParser(description="Embed audit MD → Cloudflare Vectorize")
    ap.add_argument("--dry-run", action="store_true", help="Chunk+embed only, skip upsert")
    ap.add_argument("--source", nargs="*", default=[], help="Extra markdown files to ingest")
    ap.add_argument("--no-embed", action="store_true", help="Chunk only, no Ollama call (fast test)")
    args = ap.parse_args()

    files = collect_files(args.source or [])
    if not files:
        print("[warn] No source files found. Run plan audits first:")
        print("       python3 scripts/plan_audits_run_all.py")
        sys.exit(0)

    print(f"\n{'─'*60}")
    print(f"  embed_audit_artifacts.py")
    print(f"  index : {VECTORIZE_INDEX}")
    print(f"  model : {OLLAMA_MODEL} ({EMBED_DIMENSIONS}d)")
    print(f"  files : {len(files)}")
    print(f"{'─'*60}\n")

    all_vectors: list[dict[str, Any]] = []
    total_chunks = 0
    embed_errors = 0

    for fpath in files:
        rel = str(fpath.relative_to(REPO_ROOT) if fpath.is_relative_to(REPO_ROOT) else fpath)
        print(f"[file] {rel}")
        text = fpath.read_text(encoding="utf-8", errors="ignore")
        chunks = chunk_markdown(text, rel)
        print(f"       {len(chunks)} chunks")
        total_chunks += len(chunks)

        for i, chunk in enumerate(chunks):
            if args.no_embed:
                print(f"  [{i+1:03d}] {chunk['metadata']['title'][:60]}  ({chunk['metadata']['chars']}c)  [no-embed]")
                continue

            try:
                vec = embed_ollama(chunk["text"])
                print(f"  [{i+1:03d}] {chunk['metadata']['title'][:60]}  ({chunk['metadata']['chars']}c)  ✓")
                all_vectors.append({**chunk, "values": vec})
                time.sleep(0.05)  # be nice to local Ollama
            except Exception as e:
                print(f"  [{i+1:03d}] EMBED ERR: {e}")
                embed_errors += 1

    print(f"\n{'─'*60}")
    print(f"  chunks  : {total_chunks}")
    print(f"  vectors : {len(all_vectors)}")
    print(f"  errors  : {embed_errors}")
    print(f"{'─'*60}\n")

    if args.dry_run or args.no_embed:
        print("[dry-run] Skipping vectorize upsert.")
        return

    if not all_vectors:
        print("[skip] Nothing to upsert.")
        return

    # Batch upsert
    ok_count = 0
    for i in range(0, len(all_vectors), UPSERT_BATCH):
        batch = all_vectors[i : i + UPSERT_BATCH]
        success = wrangler_upsert(batch, root=REPO_ROOT)
        if success:
            ok_count += len(batch)

    print(f"\n✅  Done — {ok_count}/{len(all_vectors)} vectors upserted into {VECTORIZE_INDEX}")


if __name__ == "__main__":
    main()
