#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path.cwd()
INDEX_NAME = "ai-search-inneranimalmedia-autorag"

DEFAULT_SOURCES = [
    "docs/agentsam_knowledge/dashboard_r2_asset_deploy_tactics.md",
    "docs/agentsam_knowledge/cursor_gap_pack_pipeline.md",
    "artifacts/dashboard_overview_data_mapping/NEXT_PATCH.md",
    "artifacts/read_before_edit_enforcement/NEXT_PATCH.md",
]

EXCLUDE_IF_MISSING_OK = True


def utc_slug() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def sha(s: str, n: int = 40) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:n]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def chunk_text(source: str, text: str, target: int, overlap: int) -> list[dict]:
    text = clean_text(text)
    if not text:
        return []

    chunks = []
    start = 0
    idx = 0
    n = len(text)

    while start < n:
        end = min(n, start + target)

        if end < n:
            # Prefer breaking near a markdown heading, paragraph, or line boundary.
            window = text[start:end]
            cut = max(
                window.rfind("\n## "),
                window.rfind("\n### "),
                window.rfind("\n\n"),
                window.rfind("\n"),
            )
            if cut > target * 0.45:
                end = start + cut

        chunk = text[start:end].strip()
        if chunk:
            base = f"{source}:{idx}:{sha(chunk, 16)}"
            chunks.append({
                "id": f"ops_{sha(base, 40)}",
                "source": source,
                "chunk_index": idx,
                "chars": len(chunk),
                "text": chunk,
            })
            idx += 1

        if end >= n:
            break
        start = max(0, end - overlap)

    return chunks


def post_json(url: str, payload: dict, headers: dict | None = None, timeout: int = 300) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            **(headers or {}),
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def embed_openai(texts: list[str], model: str, dimensions: int, timeout: int) -> list[list[float]]:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise SystemExit("OPENAI_API_KEY is not set")

    payload = {
        "model": model,
        "input": texts,
        "dimensions": dimensions,
    }
    out = post_json(
        "https://api.openai.com/v1/embeddings",
        payload,
        headers={"Authorization": f"Bearer {key}"},
        timeout=timeout,
    )
    rows = sorted(out["data"], key=lambda x: x["index"])
    return [r["embedding"] for r in rows]


def embed_ollama(text: str, model: str, base_url: str, timeout: int) -> list[float]:
    url = base_url.rstrip("/") + "/api/embed"
    out = post_json(url, {"model": model, "input": text}, timeout=timeout)
    if "embeddings" in out and out["embeddings"]:
        return out["embeddings"][0]
    if "embedding" in out:
        return out["embedding"]
    raise RuntimeError(f"Unexpected Ollama response keys: {sorted(out.keys())}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["openai", "ollama"], required=True)
    ap.add_argument("--openai-model", default="text-embedding-3-large")
    ap.add_argument("--ollama-model", default="mxbai-embed-large:latest")
    ap.add_argument("--ollama-base-url", default="http://127.0.0.1:11434")
    ap.add_argument("--dimensions", type=int, default=1024)
    ap.add_argument("--chunk-target-chars", type=int, default=2200)
    ap.add_argument("--chunk-overlap-chars", type=int, default=250)
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    batch_id = f"ops_knowledge_{utc_slug()}"
    out_dir = Path(args.out) if args.out else ROOT / "artifacts" / batch_id
    out_dir.mkdir(parents=True, exist_ok=True)

    sources = []
    missing = []
    for rel in DEFAULT_SOURCES:
        p = ROOT / rel
        if p.exists():
            sources.append(rel)
        else:
            missing.append(rel)

    chunks = []
    for rel in sources:
        chunks.extend(chunk_text(rel, read_text(ROOT / rel), args.chunk_target_chars, args.chunk_overlap_chars))

    if not chunks:
        raise SystemExit("No chunks were produced. Check source files.")

    chunks_path = out_dir / "chunks.jsonl"
    with chunks_path.open("w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    local_path = out_dir / f"embeddings_{args.provider}.local.jsonl"
    vector_path = out_dir / f"embeddings_{args.provider}.vectorize.ndjson"

    embedded = 0
    failed = 0
    dims = {}

    with local_path.open("w", encoding="utf-8") as local_f, vector_path.open("w", encoding="utf-8") as vector_f:
        if args.provider == "openai":
            batch_size = 32
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i + batch_size]
                last_err = None
                vectors = None

                for attempt in range(1, args.retries + 1):
                    try:
                        vectors = embed_openai(
                            [c["text"] for c in batch],
                            args.openai_model,
                            args.dimensions,
                            args.timeout,
                        )
                        break
                    except Exception as e:
                        last_err = e
                        time.sleep(min(2 * attempt, 10))

                if vectors is None:
                    failed += len(batch)
                    print(f"[fail] openai batch {i}-{i+len(batch)-1}: {last_err}")
                    continue

                for c, vec in zip(batch, vectors):
                    dim = len(vec)
                    dims[dim] = dims.get(dim, 0) + 1
                    row = {
                        "id": c["id"],
                        "source": c["source"],
                        "chunk_index": c["chunk_index"],
                        "dimension": dim,
                        "text": c["text"],
                        "embedding": vec,
                        "metadata": {
                            "pack_id": batch_id,
                            "kind": "ops_knowledge",
                            "source": c["source"],
                            "chunk_index": c["chunk_index"],
                            "embedding_provider": "openai",
                            "embedding_model": args.openai_model,
                            "purpose": "Agent Sam deployment tactics and operational alignment",
                        },
                    }
                    local_f.write(json.dumps(row, ensure_ascii=False) + "\n")
                    vector_f.write(json.dumps({
                        "id": c["id"],
                        "values": vec,
                        "metadata": row["metadata"],
                    }, ensure_ascii=False) + "\n")
                    embedded += 1
                    print(f"[ok] {embedded} dim={dim} {c['source']}")

        else:
            for c in chunks:
                last_err = None
                vec = None
                for attempt in range(1, args.retries + 1):
                    try:
                        vec = embed_ollama(c["text"], args.ollama_model, args.ollama_base_url, args.timeout)
                        break
                    except Exception as e:
                        last_err = e
                        time.sleep(min(2 * attempt, 10))

                if vec is None:
                    failed += 1
                    print(f"[fail] {c['source']} {c['id']}: {last_err}")
                    continue

                dim = len(vec)
                dims[dim] = dims.get(dim, 0) + 1
                row = {
                    "id": c["id"],
                    "source": c["source"],
                    "chunk_index": c["chunk_index"],
                    "dimension": dim,
                    "text": c["text"],
                    "embedding": vec,
                    "metadata": {
                        "pack_id": batch_id,
                        "kind": "ops_knowledge",
                        "source": c["source"],
                        "chunk_index": c["chunk_index"],
                        "embedding_provider": "ollama",
                        "embedding_model": args.ollama_model,
                        "purpose": "Agent Sam deployment tactics and operational alignment",
                    },
                }
                local_f.write(json.dumps(row, ensure_ascii=False) + "\n")
                vector_f.write(json.dumps({
                    "id": c["id"],
                    "values": vec,
                    "metadata": row["metadata"],
                }, ensure_ascii=False) + "\n")
                embedded += 1
                print(f"[ok] {embedded} dim={dim} {c['source']}")

    manifest = {
        "batch_id": batch_id,
        "index": INDEX_NAME,
        "provider": args.provider,
        "sources": sources,
        "missing_sources": missing,
        "chunks": len(chunks),
        "embedded": embedded,
        "failed": failed,
        "dimensions": dims,
        "chunks_file": str(chunks_path),
        "local_file": str(local_path),
        "vectorize_file": str(vector_path),
        "upload_command": f"./scripts/with-cloudflare-env.sh npx wrangler vectorize insert {INDEX_NAME} --file {vector_path}",
    }

    (out_dir / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (out_dir / "VECTORIZE_UPLOAD.md").write_text(
        "# Ops Knowledge Vectorize Upload\n\n"
        f"Batch: `{batch_id}`\n"
        f"Provider: `{args.provider}`\n"
        f"Chunks: `{len(chunks)}`\n"
        f"Embedded: `{embedded}`\n"
        f"Failed: `{failed}`\n"
        f"Dimensions: `{json.dumps(dims)}`\n\n"
        "## Upload command\n\n"
        "```bash\n"
        f"./scripts/with-cloudflare-env.sh npx wrangler vectorize insert {INDEX_NAME} --file {vector_path}\n"
        "```\n",
        encoding="utf-8",
    )

    print("")
    print(f"Done: {out_dir}")
    print(f"Manifest: {out_dir / 'MANIFEST.json'}")
    print(f"Vectorize: {vector_path}")
    print(f"embedded={embedded} failed={failed} dims={dims}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
