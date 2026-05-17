#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

DEFAULT_PACK = "artifacts/agentsam_cursor_gap_pack_v2"
DEFAULT_MODEL = "mxbai-embed-large:latest"
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_existing_ids(path: Path) -> set[str]:
    ids = set()
    if not path.exists():
        return ids
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            try:
                row = json.loads(line)
                if row.get("id"):
                    ids.add(row["id"])
            except Exception:
                pass
    return ids


def ollama_embed(text: str, model: str, base_url: str, timeout: int) -> list[float]:
    payload = {"model": model, "prompt": text}
    req = urllib.request.Request(
        base_url.rstrip("/") + "/api/embeddings",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))
    emb = data.get("embedding")
    if not isinstance(emb, list):
        raise RuntimeError(f"No embedding returned. Response keys: {list(data.keys())}")
    return [float(x) for x in emb]


def write_status(path: Path, stats: dict[str, Any], errors: list[dict[str, Any]]) -> None:
    body = []
    body.append("# Clean Chunk Embedding Status\n")
    body.append("## Summary\n")
    body.append("| Metric | Value |")
    body.append("|---|---:|")
    for key, value in stats.items():
        body.append(f"| {key} | {value} |")
    body.append("\n## Recent errors\n")
    if not errors:
        body.append("_None._")
    else:
        body.append("| source | id | error |")
        body.append("|---|---|---|")
        for e in errors[-80:]:
            source = str(e.get("source", "")).replace("|", "\\|")
            cid = str(e.get("id", "")).replace("|", "\\|")
            err = str(e.get("error", "")).replace("\n", " ").replace("|", "\\|")[:500]
            body.append(f"| {source} | {cid} | {err} |")
    path.write_text("\n".join(body) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack", default=DEFAULT_PACK)
    ap.add_argument("--ollama-model", default=DEFAULT_MODEL)
    ap.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL)
    ap.add_argument("--embedding-timeout", type=int, default=300)
    ap.add_argument("--embedding-retries", type=int, default=3)
    ap.add_argument("--embedding-start", type=int, default=0)
    ap.add_argument("--embedding-limit", type=int, default=None)
    ap.add_argument("--embed-only-missing", action="store_true")
    ap.add_argument("--with-vectorize-ndjson", action="store_true")
    ap.add_argument("--source-filter", default="")
    args = ap.parse_args()

    pack = Path(args.pack)
    chunks_path = pack / "CLEAN_CHUNKS.jsonl"
    queue_path = pack / "EMBEDDING_QUEUE.jsonl"
    out_path = pack / "embeddings_clean_ollama.local.jsonl"
    vec_path = pack / "embeddings_clean_ollama.vectorize.ndjson"
    status_path = pack / "EMBEDDING_STATUS.md"
    errors_path = pack / "embedding_errors_clean_ollama.jsonl"

    chunks = read_jsonl(chunks_path)
    queue = read_jsonl(queue_path)
    allowed_sources = {row["source"] for row in queue if row.get("exists")}

    selected = [c for c in chunks if c.get("source") in allowed_sources]

    if args.source_filter:
        selected = [c for c in selected if args.source_filter in c.get("source", "")]

    selected = selected[args.embedding_start:]
    if args.embedding_limit is not None:
        selected = selected[:args.embedding_limit]

    existing_ids = load_existing_ids(out_path) if args.embed_only_missing else set()

    attempted = 0
    embedded = 0
    skipped_existing = 0
    failed = 0
    dims: dict[int, int] = {}
    recent_errors: list[dict[str, Any]] = []

    print(f"[embed] pack={pack}")
    print(f"[embed] chunks_total={len(chunks)} queued_sources={len(allowed_sources)} selected={len(selected)}")
    print(f"[embed] model={args.ollama_model} timeout={args.embedding_timeout}s retries={args.embedding_retries}")

    for i, chunk in enumerate(selected, start=1):
        cid = chunk["id"]
        source = chunk.get("source", "")

        if cid in existing_ids:
            skipped_existing += 1
            continue

        attempted += 1
        last_error = None

        for attempt in range(1, args.embedding_retries + 1):
            try:
                emb = ollama_embed(
                    chunk["text"],
                    model=args.ollama_model,
                    base_url=args.ollama_url,
                    timeout=args.embedding_timeout,
                )
                dim = len(emb)
                dims[dim] = dims.get(dim, 0) + 1

                record = {
                    "id": cid,
                    "source": source,
                    "chunk_index": chunk.get("chunk_index"),
                    "chars": chunk.get("chars"),
                    "dimension": dim,
                    "text": chunk["text"],
                    "embedding": emb,
                    "metadata": {
                        **chunk.get("metadata", {}),
                        "embed_model": args.ollama_model,
                        "embed_source": "ollama",
                    },
                }
                append_jsonl(out_path, record)

                if args.with_vectorize_ndjson:
                    append_jsonl(vec_path, {
                        "id": cid,
                        "values": emb,
                        "metadata": {
                            "source": source,
                            "chunk_index": chunk.get("chunk_index"),
                            "chars": chunk.get("chars"),
                            "text": chunk["text"][:3000],
                            "embed_model": args.ollama_model,
                        },
                    })

                embedded += 1
                print(f"[ok] {embedded} dim={dim} {source} {cid}")
                last_error = None
                break

            except Exception as e:
                last_error = str(e)
                if attempt < args.embedding_retries:
                    time.sleep(min(2 * attempt, 8))

        if last_error:
            failed += 1
            err = {"id": cid, "source": source, "error": last_error}
            recent_errors.append(err)
            append_jsonl(errors_path, err)
            print(f"[fail] {source} {cid}: {last_error}")

        if attempted % 25 == 0:
            write_status(status_path, {
                "chunks_total": len(chunks),
                "queued_sources": len(allowed_sources),
                "selected": len(selected),
                "attempted": attempted,
                "embedded": embedded,
                "failed": failed,
                "skipped_existing": skipped_existing,
                "dimensions": json.dumps(dims),
            }, recent_errors)

    write_status(status_path, {
        "chunks_total": len(chunks),
        "queued_sources": len(allowed_sources),
        "selected": len(selected),
        "attempted": attempted,
        "embedded": embedded,
        "failed": failed,
        "skipped_existing": skipped_existing,
        "dimensions": json.dumps(dims),
        "local_jsonl": str(out_path),
        "vectorize_ndjson": str(vec_path) if args.with_vectorize_ndjson else "",
        "errors_jsonl": str(errors_path),
    }, recent_errors)

    print("")
    print(f"Done: {status_path}")
    print(f"Embeddings: {out_path}")
    if args.with_vectorize_ndjson:
        print(f"Vectorize: {vec_path}")
    print(f"embedded={embedded} failed={failed} skipped_existing={skipped_existing} dims={dims}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
