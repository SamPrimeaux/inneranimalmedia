#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_PACK = "artifacts/agentsam_cursor_gap_pack_v2"
DEFAULT_MODEL = "text-embedding-3-large"
DEFAULT_DIMENSIONS = 1024


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
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
    ids: set[str] = set()
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


def openai_embed(text: str, model: str, dimensions: int, api_key: str, timeout: int) -> list[float]:
    payload: dict[str, Any] = {
        "model": model,
        "input": text,
        "dimensions": dimensions,
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))

    embedding = data.get("data", [{}])[0].get("embedding")
    if not isinstance(embedding, list):
        raise RuntimeError(f"No embedding returned. Response keys: {list(data.keys())}")

    return [float(x) for x in embedding]


def write_status(path: Path, stats: dict[str, Any], errors: list[dict[str, Any]]) -> None:
    lines: list[str] = []
    lines.append("# OpenAI Clean Chunk Embedding Status\n")
    lines.append("## Summary\n")
    lines.append("| Metric | Value |")
    lines.append("|---|---:|")
    for key, value in stats.items():
        safe_value = str(value).replace("|", "\\|")
        lines.append(f"| {key} | {safe_value} |")

    lines.append("\n## Recent errors\n")
    if not errors:
        lines.append("_None._")
    else:
        lines.append("| source | id | error |")
        lines.append("|---|---|---|")
        for err in errors[-80:]:
            source = str(err.get("source", "")).replace("|", "\\|")
            cid = str(err.get("id", "")).replace("|", "\\|")
            msg = str(err.get("error", "")).replace("\n", " ").replace("|", "\\|")[:700]
            lines.append(f"| {source} | {cid} | {msg} |")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack", default=DEFAULT_PACK)
    ap.add_argument("--openai-model", default=DEFAULT_MODEL)
    ap.add_argument("--dimensions", type=int, default=DEFAULT_DIMENSIONS)
    ap.add_argument("--embedding-timeout", type=int, default=120)
    ap.add_argument("--embedding-retries", type=int, default=3)
    ap.add_argument("--embedding-start", type=int, default=0)
    ap.add_argument("--embedding-limit", type=int, default=None)
    ap.add_argument("--embed-only-missing", action="store_true")
    ap.add_argument("--with-vectorize-ndjson", action="store_true")
    ap.add_argument("--source-filter", default="")
    ap.add_argument("--strategic-docs-only", action="store_true")
    args = ap.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is not set.")

    pack = Path(args.pack)
    chunks_path = pack / "CLEAN_CHUNKS.jsonl"
    queue_path = pack / "EMBEDDING_QUEUE.jsonl"

    out_path = pack / "embeddings_clean_openai.local.jsonl"
    vec_path = pack / "embeddings_clean_openai.vectorize.ndjson"
    status_path = pack / "EMBEDDING_STATUS_OPENAI.md"
    errors_path = pack / "embedding_errors_clean_openai.jsonl"

    chunks = read_jsonl(chunks_path)
    queue = read_jsonl(queue_path)
    allowed_sources = {row["source"] for row in queue if row.get("exists")}

    selected = [c for c in chunks if c.get("source") in allowed_sources]

    if args.strategic_docs_only:
        selected = [
            c for c in selected
            if str(c.get("source", "")).startswith("artifacts/")
            or str(c.get("source", "")).startswith("virtual/findings/")
        ]

    if args.source_filter:
        selected = [c for c in selected if args.source_filter in str(c.get("source", ""))]

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

    print(f"[openai-embed] pack={pack}")
    print(f"[openai-embed] chunks_total={len(chunks)} queued_sources={len(allowed_sources)} selected={len(selected)}")
    print(f"[openai-embed] model={args.openai_model} dimensions={args.dimensions}")

    for chunk in selected:
        cid = chunk["id"]
        source = str(chunk.get("source", ""))

        if cid in existing_ids:
            skipped_existing += 1
            continue

        attempted += 1
        last_error = None

        for attempt in range(1, args.embedding_retries + 1):
            try:
                emb = openai_embed(
                    chunk["text"],
                    model=args.openai_model,
                    dimensions=args.dimensions,
                    api_key=api_key,
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
                        "embed_model": args.openai_model,
                        "embed_source": "openai",
                        "dimensions_requested": args.dimensions,
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
                            "embed_model": args.openai_model,
                            "embed_source": "openai",
                            "dimensions": dim,
                        },
                    })

                embedded += 1
                print(f"[ok] {embedded} dim={dim} {source} {cid}")
                last_error = None
                break

            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="replace")
                last_error = f"HTTP {e.code}: {body[:1000]}"
                if e.code in {429, 500, 502, 503, 504} and attempt < args.embedding_retries:
                    time.sleep(min(4 * attempt, 20))
                else:
                    break

            except Exception as e:
                last_error = str(e)
                if attempt < args.embedding_retries:
                    time.sleep(min(3 * attempt, 12))

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
                "model": args.openai_model,
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
        "model": args.openai_model,
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
