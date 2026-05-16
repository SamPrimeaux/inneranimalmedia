#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_OLLAMA_HOST = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "mxbai-embed-large:latest"
DEFAULT_INDEX = "ai-search-inneranimalmedia-autorag"
DEFAULT_TARGET_TOKENS = 1024
DEFAULT_OVERLAP_TOKENS = 96
DEFAULT_MIN_SCORE = 0.70


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def approx_tokens(text: str) -> int:
    return max(1, round(len(text) / 4))


def sha(text: str, n: int = 12) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:n]


def slug(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip().lower()).strip("_")
    return s or "knowledge"

def make_vector_id(prefix: str, chunk_index: int, content_hash: str, max_bytes: int = 64) -> str:
    """Cloudflare Vectorize ids must be <=64 bytes."""
    suffix = f"_c{chunk_index:04d}_{content_hash[:12]}"
    room = max_bytes - len(suffix.encode("utf-8"))

    safe_prefix = slug(prefix)
    trimmed = ""
    for ch in safe_prefix:
        candidate = trimmed + ch
        if len(candidate.encode("utf-8")) > room:
            break
        trimmed = candidate

    trimmed = trimmed.rstrip("_") or "vec"
    vector_id = f"{trimmed}{suffix}"

    if len(vector_id.encode("utf-8")) > max_bytes:
        raise ValueError(f"Vector id too long after truncation: {vector_id}")

    return vector_id


def normalize_ollama_host(host: str) -> str:
    host = (host or DEFAULT_OLLAMA_HOST).strip().rstrip("/")
    if host.startswith("0.0.0.0:"):
        host = "localhost:" + host.split(":", 1)[1]
    if host == "0.0.0.0":
        host = "localhost"
    if not host.startswith(("http://", "https://")):
        host = "http://" + host
    return host


def http_json(
    url: str,
    method: str = "GET",
    payload: Any | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 180,
) -> Any:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    final_headers = {"Content-Type": "application/json"}
    if headers:
        final_headers.update(headers)

    req = urllib.request.Request(url, data=body, headers=final_headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {url}\n{raw}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Connection error: {url}\n{e}") from e


def read_input(path: str | None) -> tuple[str, str]:
    if path:
        p = Path(path).expanduser().resolve()
        return p.read_text(encoding="utf-8"), str(p)
    return sys.stdin.read(), "stdin"


def split_blocks(text: str) -> list[str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")

    blocks: list[str] = []
    buf: list[str] = []
    in_code = False

    def flush() -> None:
        nonlocal buf
        out = "\n".join(buf).strip()
        if out:
            blocks.append(out)
        buf = []

    for line in lines:
        stripped = line.strip()

        if stripped.startswith("```"):
            buf.append(line)
            in_code = not in_code
            if not in_code:
                flush()
            continue

        if in_code:
            buf.append(line)
            continue

        if re.match(r"^#{1,6}\s+", stripped):
            flush()
            buf.append(line)
            continue

        if stripped == "":
            flush()
            continue

        buf.append(line)

    flush()
    return blocks


def hard_split(text: str, target_tokens: int) -> list[str]:
    max_chars = target_tokens * 4
    if len(text) <= max_chars:
        return [text]

    parts = re.split(r"(?<=[.!?])\s+", text)
    out: list[str] = []
    buf: list[str] = []

    for part in parts:
        candidate = " ".join(buf + [part]).strip()
        if buf and len(candidate) > max_chars:
            out.append(" ".join(buf).strip())
            buf = [part]
        else:
            buf.append(part)

    if buf:
        out.append(" ".join(buf).strip())

    final: list[str] = []
    for item in out:
        if len(item) <= max_chars:
            final.append(item)
        else:
            for i in range(0, len(item), max_chars):
                final.append(item[i : i + max_chars].strip())
    return [x for x in final if x]


def chunk_text(text: str, target_tokens: int, overlap_tokens: int) -> list[dict[str, Any]]:
    blocks = split_blocks(text)
    chunks: list[dict[str, Any]] = []

    cur: list[str] = []
    cur_tokens = 0

    def emit() -> str:
        nonlocal cur, cur_tokens
        body = "\n\n".join(cur).strip()
        if body:
            chunks.append(
                {
                    "text": body,
                    "approx_tokens": approx_tokens(body),
                    "chars": len(body),
                    "hash": sha(body),
                }
            )
        cur = []
        cur_tokens = 0
        return body

    for block in blocks:
        bt = approx_tokens(block)

        if bt > target_tokens:
            prev = emit()
            for piece in hard_split(block, target_tokens):
                chunks.append(
                    {
                        "text": piece,
                        "approx_tokens": approx_tokens(piece),
                        "chars": len(piece),
                        "hash": sha(piece),
                    }
                )
            continue

        if cur and cur_tokens + bt > target_tokens:
            prev = emit()
            overlap = prev[-overlap_tokens * 4 :].strip() if prev else ""
            cur = [f"[overlap]\n{overlap}", block] if overlap else [block]
            cur_tokens = approx_tokens("\n\n".join(cur))
        else:
            cur.append(block)
            cur_tokens += bt

    emit()
    return chunks


def check_ollama(host: str, model: str) -> None:
    data = http_json(host.rstrip("/") + "/api/tags")
    models = [m.get("name") for m in data.get("models", [])]
    if model not in models:
        raise RuntimeError(
            f"Ollama is running, but model is missing: {model}\n"
            f"Installed models: {models}\n"
            f"Run: ollama pull {model}"
        )


def embed(host: str, model: str, text: str) -> list[float]:
    data = http_json(
        host.rstrip("/") + "/api/embeddings",
        method="POST",
        payload={"model": model, "prompt": text},
    )
    vec = data.get("embedding")
    if not isinstance(vec, list) or not vec:
        raise RuntimeError("Ollama returned no embedding.")
    return [float(x) for x in vec]


def cf_url(account_id: str, index: str, action: str) -> str:
    return (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/vectorize/v2/indexes/{index}/{action}"
    )


def cf_upsert(account_id: str, token: str, index: str, vectors: list[dict[str, Any]], batch_size: int) -> list[Any]:
    headers = {"Authorization": f"Bearer {token}"}
    results: list[Any] = []

    for i in range(0, len(vectors), batch_size):
        batch = vectors[i : i + batch_size]
        print(f"[{now()}] Upsert batch {i // batch_size + 1}: {len(batch)} vectors")
        res = http_json(
            cf_url(account_id, index, "upsert"),
            method="POST",
            payload={"vectors": batch},
            headers=headers,
        )
        results.append(res)
        mid = res.get("result", {}).get("mutationId") or res.get("result", {}).get("mutation_id")
        if mid:
            print(f"[{now()}] mutation_id: {mid}")

    return results


def cf_query(
    account_id: str,
    token: str,
    index: str,
    vector: list[float],
    top_k: int,
    metadata_filter: dict[str, Any] | None,
) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {token}"}
    payload: dict[str, Any] = {
        "vector": vector,
        "topK": top_k,
        "returnMetadata": "all",
    }
    if metadata_filter:
        payload["filter"] = metadata_filter

    return http_json(
        cf_url(account_id, index, "query"),
        method="POST",
        payload=payload,
        headers=headers,
    )


def parse_meta(items: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"Invalid --meta value: {item}. Use key=value.")
        k, v = item.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def write_ndjson(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="Chunk docs, embed with Ollama mxbai, and optionally upsert to Cloudflare Vectorize.")

    ap.add_argument("--input", help="Input markdown/text file. Omit to read stdin.")
    ap.add_argument("--title", default="Self Evolving Agent Sam Knowledge")
    ap.add_argument("--doc-id")
    ap.add_argument("--category", default="agentsam_knowledge")
    ap.add_argument("--label", action="append", default=[])
    ap.add_argument("--meta", action="append", default=[])

    ap.add_argument("--workspace-id", default=os.getenv("WORKSPACE_ID"))
    ap.add_argument("--tenant-id", default=os.getenv("TENANT_ID"))

    ap.add_argument("--ollama-host", default=os.getenv("OLLAMA_HOST", DEFAULT_OLLAMA_HOST))
    ap.add_argument("--ollama-model", default=os.getenv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL))

    ap.add_argument("--index", default=os.getenv("VECTORIZE_INDEX", DEFAULT_INDEX))
    ap.add_argument("--target-tokens", type=int, default=DEFAULT_TARGET_TOKENS)
    ap.add_argument("--overlap-tokens", type=int, default=DEFAULT_OVERLAP_TOKENS)
    ap.add_argument("--batch-size", type=int, default=100)

    ap.add_argument("--outdir", default="artifacts/rag_vectorize")
    ap.add_argument("--upsert", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--verify-only", action="store_true")
    ap.add_argument("--verify-text", default="Agent Sam tools backups rollback MCP model token limits self optimizing autonomous work")
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--min-score", type=float, default=DEFAULT_MIN_SCORE)
    ap.add_argument("--filter-workspace", action="store_true")
    ap.add_argument("--no-text-metadata", action="store_true")

    args = ap.parse_args()
    args.ollama_host = normalize_ollama_host(args.ollama_host)

    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    token = os.getenv("CLOUDFLARE_API_TOKEN")

    if args.upsert or args.verify or args.verify_only:
        if not account_id or not token:
            raise RuntimeError("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN.")

    print(f"[{now()}] Checking Ollama at {args.ollama_host}...")
    check_ollama(args.ollama_host, args.ollama_model)
    print(f"[{now()}] Ollama OK — {args.ollama_model}")

    if args.verify_only:
        print(f"[{now()}] Verify-only mode...")
        qvec = embed(args.ollama_host, args.ollama_model, args.verify_text)
        filt = {"workspace_id": args.workspace_id} if args.filter_workspace and args.workspace_id else None
        res = cf_query(account_id, token, args.index, qvec, args.top_k, filt)
        matches = res.get("result", {}).get("matches", [])
        print(json.dumps(matches, indent=2, ensure_ascii=False))

        if not matches:
            print(f"[{now()}] FAIL — no matches")
            return 1

        top = matches[0]
        score = float(top.get("score", 0))
        status = "PASS" if score >= args.min_score else "DEGRADED"
        print(f"[{now()}] {status} — {top.get('id')} score={score:.4f}")
        return 0 if score >= args.min_score else 1

    text, source = read_input(args.input)
    if not text.strip():
        raise RuntimeError("No input text received.")

    outroot = Path(args.outdir).resolve()
    rundir = outroot / time.strftime("%Y%m%d_%H%M%S")
    rundir.mkdir(parents=True, exist_ok=True)

    doc_id = args.doc_id or f"{slug(args.title)}_{sha(source + text[:500])}"
    prefix = slug(doc_id)

    print(f"[{now()}] Chunking...")
    chunks = chunk_text(text, args.target_tokens, args.overlap_tokens)
    avg = sum(c["approx_tokens"] for c in chunks) / max(1, len(chunks))
    print(f"[{now()}] {len(chunks)} chunks, avg ~{avg:.0f} tokens each")

    extra = parse_meta(args.meta)
    extra["title"] = args.title

    vectors: list[dict[str, Any]] = []
    for i, ch in enumerate(chunks):
        vid = make_vector_id(prefix, i, ch['hash'])
        print(f"[{now()}] [{i + 1}/{len(chunks)}] {vid} ~{ch['approx_tokens']} tokens")
        t0 = time.time()
        values = embed(args.ollama_host, args.ollama_model, ch["text"])
        elapsed = round((time.time() - t0) * 1000)

        metadata: dict[str, Any] = {
            "doc_id": doc_id,
            "title": args.title,
            "source": source,
            "category": args.category,
            "labels": args.label,
            "chunk_index": i,
            "chunk_count": len(chunks),
            "approx_tokens": ch["approx_tokens"],
            "chars": ch["chars"],
            "hash": ch["hash"],
            "embedding_model": args.ollama_model,
            "embedding_dim": len(values),
            "created_at": now(),
            "text": ch["text"],
        }

        if args.workspace_id:
            metadata["workspace_id"] = args.workspace_id
        if args.tenant_id:
            metadata["tenant_id"] = args.tenant_id

        metadata.update(extra)

        if args.no_text_metadata:
            metadata.pop("text", None)

        vectors.append({"id": vid, "values": values, "metadata": metadata})
        print(f"[{now()}]     dim={len(values)} elapsed={elapsed}ms")

    if vectors and len(vectors[0]["values"]) != 1024:
        print(f"[{now()}] WARNING — embedding dimension is {len(vectors[0]['values'])}, expected 1024.")

    chunks_path = rundir / "chunks.json"
    full_path = rundir / "vectors.full.json"
    ndjson_path = rundir / "vectors.vectorize.ndjson"
    manifest_path = rundir / "manifest.json"

    chunks_path.write_text(json.dumps(chunks, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    full_path.write_text(json.dumps(vectors, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_ndjson(ndjson_path, vectors)

    manifest: dict[str, Any] = {
        "created_at": now(),
        "doc_id": doc_id,
        "title": args.title,
        "source": source,
        "index": args.index,
        "workspace_id": args.workspace_id,
        "tenant_id": args.tenant_id,
        "category": args.category,
        "labels": args.label,
        "ollama_model": args.ollama_model,
        "target_tokens": args.target_tokens,
        "overlap_tokens": args.overlap_tokens,
        "chunk_count": len(chunks),
        "avg_approx_tokens": avg,
        "embedding_dim": len(vectors[0]["values"]) if vectors else None,
        "upserted": False,
        "status": "DRY_RUN",
        "artifacts": {
            "chunks": str(chunks_path),
            "vectors_full": str(full_path),
            "vectorize_ndjson": str(ndjson_path),
        },
    }

    if args.upsert:
        print(f"[{now()}] Upserting to Vectorize index={args.index}...")
        manifest["mutations"] = cf_upsert(account_id, token, args.index, vectors, args.batch_size)
        manifest["upserted"] = True
        print(f"[{now()}] Waiting 5s for index settle...")
        time.sleep(5)
    else:
        print(f"[{now()}] Dry run only — add --upsert to write remote vectors.")

    if args.verify or args.upsert:
        print(f"[{now()}] Running verification query...")
        qvec = embed(args.ollama_host, args.ollama_model, args.verify_text)
        filt = {"workspace_id": args.workspace_id} if args.filter_workspace and args.workspace_id else None
        res = cf_query(account_id, token, args.index, qvec, args.top_k, filt)
        matches = res.get("result", {}).get("matches", [])
        manifest["verification"] = {
            "verify_text": args.verify_text,
            "filter": filt,
            "matches": matches,
        }

        print(f"[{now()}] Results:")
        for m in matches:
            print(f"[{now()}]   {float(m.get('score', 0)):.4f}  {m.get('id')}")

        if matches:
            top_score = float(matches[0].get("score", 0))
            manifest["top_score"] = top_score
            manifest["status"] = "PASS" if top_score >= args.min_score else "DEGRADED"
        else:
            manifest["top_score"] = None
            manifest["status"] = "FAIL"

        print(f"[{now()}] Status: {manifest['status']}")

    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    index_md = f"""# RAG Vectorize Run

- Created: `{manifest["created_at"]}`
- Doc ID: `{doc_id}`
- Source: `{source}`
- Index: `{args.index}`
- Chunks: `{len(chunks)}`
- Avg approx tokens: `{avg:.0f}`
- Embedding model: `{args.ollama_model}`
- Embedding dim: `{manifest["embedding_dim"]}`
- Status: `{manifest["status"]}`

## Artifacts

- `chunks.json`
- `vectors.full.json`
- `vectors.vectorize.ndjson`
- `manifest.json`
"""
    (rundir / "INDEX.md").write_text(index_md, encoding="utf-8")

    print()
    print(f"Done: {rundir}")
    print(f"Chunks : {len(chunks)}")
    print(f"Index  : {args.index}")
    print(f"Status : {manifest['status']}")

    return 0 if manifest["status"] in {"PASS", "DRY_RUN"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
