#!/usr/bin/env python3
"""
Chunk + embed + upsert docs/dashboard-agent-audit/ using PRODUCTION vector lanes (not Ollama).

Default lane: memory → OpenAI text-embedding-3-large @ 1536 → agentsam-memory-oai3large-1536

Workflow
--------
1. Chunk only (review artifacts):

     python3 scripts/ingest_dashboard_agent_audit_vectorize.py

2. Approve quality:

     python3 scripts/ingest_dashboard_agent_audit_vectorize.py --write-approval

3. Embed + upsert + verify:

     OPENAI_API_KEY=... CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \\
     python3 scripts/ingest_dashboard_agent_audit_vectorize.py --embed --upsert --approve --verify

Lanes: see docs/dashboard-agent-audit/26-vector-lanes-reference.md
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_AUDIT_DIR = REPO_ROOT / "docs" / "dashboard-agent-audit"
DEFAULT_OUTROOT = REPO_ROOT / "artifacts" / "dashboard-agent-audit-vectorize"
APPROVAL_FILE = DEFAULT_OUTROOT / "APPROVED"
SOURCE_PREFIX = "dag_audit"
R2_KEY_PREFIX = "knowledge/agentsam/dashboard-agent-audit/"

# Production lane map (must match src/core/rag-lanes.js + wrangler.production.toml)
LANES: dict[str, dict[str, str]] = {
    "memory": {
        "vectorize_index": "agentsam-memory-oai3large-1536",
        "embed_model": "text-embedding-3-large",
        "dimensions": "1536",
    },
    "code": {
        "vectorize_index": "agentsam-codebase-oai3large-1536",
        "embed_model": "text-embedding-3-large",
        "dimensions": "1536",
    },
    "docs": {
        "vectorize_index": "agentsam-courses-oai3large-1536",
        "embed_model": "text-embedding-3-large",
        "dimensions": "1536",
    },
    "schema": {
        "vectorize_index": "agentsam-schema-oai3large-1536",
        "embed_model": "text-embedding-3-large",
        "dimensions": "1536",
    },
    "autorag": {
        "vectorize_index": "ai-search-inneranimalmedia-autorag",
        "embed_model": "@cf/baai/bge-m3",
        "dimensions": "1024",
        "note": "Query path in agent.js uses Workers AI bge-m3 — do not ingest with OpenAI/Ollama unless you change query embedder",
    },
}

DEEP_STEMS = {
    "00-series-conventions", "01-dashboard-agent-shell", "02-dashboard-agent-deploy-and-r2-assets",
    "03-dashboard-agent-mobile-operator-ux", "07-dashboard-agent-monaco-and-save-matrix",
    "09-dashboard-agent-chat-sse-stream", "10-dashboard-agent-surface-routing",
    "12-dashboard-agent-approvals-and-tool-runs", "13-dashboard-agent-browser-tools-backend",
    "14-dashboard-agent-terminal-and-pty", "16-dashboard-agent-mcp-and-integrations",
    "21-dashboard-agent-model-routing-and-costs", "22-dashboard-agent-memory-and-indexing",
    "23-dashboard-agent-automation-workflows", "24-dashboard-agent-e2e-validation",
    "25-dashboard-agent-master-backlog",
}

SKIP_NAMES = {"r2-upload-manifest.json", "r2-upload-notes.md", "26-vector-lanes-reference.md"}


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha(text: str, n: int = 12) -> str:
    import hashlib
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:n]


def slug(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip().lower()).strip("_")
    return s or "audit"


def make_vector_id(prefix: str, chunk_index: int, content_hash: str, max_bytes: int = 64) -> str:
    suffix = f"_c{chunk_index:04d}_{content_hash[:12]}"
    room = max_bytes - len(suffix.encode("utf-8"))
    trimmed = ""
    for ch in slug(prefix):
        if len((trimmed + ch).encode("utf-8")) > room:
            break
        trimmed += ch
    trimmed = trimmed.rstrip("_") or "dag"
    vid = f"{trimmed}{suffix}"
    if len(vid.encode("utf-8")) > max_bytes:
        raise ValueError(f"vector id too long: {vid}")
    return vid


def load_env() -> None:
    for name in (".env.cloudflare", ".env"):
        path = REPO_ROOT / name
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def http_json(url: str, method: str = "GET", payload: Any | None = None, headers: dict | None = None) -> Any:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=180) as res:
        raw = res.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {}


def openai_embed(text: str, model: str, dimensions: int, api_key: str) -> list[float]:
    body: dict[str, Any] = {"model": model, "input": text}
    if dimensions == 1536 and "embedding-3" in model:
        body["dimensions"] = 1536
    elif dimensions == 1024 and "embedding-3" in model:
        body["dimensions"] = 1024
    data = http_json(
        "https://api.openai.com/v1/embeddings",
        method="POST",
        payload=body,
        headers={"Authorization": f"Bearer {api_key}"},
    )
    emb = data["data"][0]["embedding"]
    if len(emb) != dimensions:
        raise RuntimeError(f"OpenAI returned {len(emb)} dims, expected {dimensions}")
    return [float(x) for x in emb]


def workers_ai_embed_bge_m3(account_id: str, token: str, text: str) -> list[float]:
    """Cloudflare Workers AI REST — matches agent.js VECTORIZE pre-context."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/baai/bge-m3"
    data = http_json(
        url,
        method="POST",
        payload={"text": [text]},
        headers={"Authorization": f"Bearer {token}"},
    )
    result = data.get("result") or {}
    vecs = result.get("data") or result.get("result") or []
    emb = vecs[0] if vecs else None
    if not isinstance(emb, list) or len(emb) != 1024:
        raise RuntimeError(f"Workers AI bge-m3: expected 1024 dims, got {len(emb) if isinstance(emb, list) else 0}")
    return [float(x) for x in emb]


def cf_upsert(account_id: str, token: str, index: str, vectors: list[dict], batch_size: int) -> list[Any]:
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/vectorize/v2/indexes/{index}/upsert"
    )
    results = []
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i : i + batch_size]
        res = http_json(url, method="POST", payload={"vectors": batch}, headers={"Authorization": f"Bearer {token}"})
        results.append(res)
    return results


def cf_query(account_id: str, token: str, index: str, vector: list[float], top_k: int) -> list[dict]:
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/vectorize/v2/indexes/{index}/query"
    )
    res = http_json(
        url,
        method="POST",
        payload={"vector": vector, "topK": top_k, "returnMetadata": "all"},
        headers={"Authorization": f"Bearer {token}"},
    )
    return res.get("result", {}).get("matches", [])


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not m:
        return {}, text
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip().strip('"')
    return meta, text[m.end() :]


def split_blocks(text: str) -> list[str]:
    """Markdown-aware blocks (headings / paragraphs) — no external deps."""
    lines = text.replace("\r\n", "\n").split("\n")
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
        if line.strip().startswith("```"):
            buf.append(line)
            in_code = not in_code
            if not in_code:
                flush()
            continue
        if in_code:
            buf.append(line)
            continue
        if re.match(r"^#{1,6}\s+", line.strip()):
            flush()
            buf.append(line)
            continue
        if line.strip() == "":
            flush()
            continue
        buf.append(line)
    flush()
    return blocks


def chunk_text(body: str, target_tokens: int = 400, overlap_tokens: int = 50) -> list[dict[str, Any]]:
    max_chars = target_tokens * 4
    overlap_chars = overlap_tokens * 4
    blocks = split_blocks(body)
    chunks: list[str] = []
    cur: list[str] = []
    cur_len = 0

    def emit() -> None:
        nonlocal cur, cur_len
        t = "\n\n".join(cur).strip()
        if t:
            chunks.append(t)
        cur = []
        cur_len = 0

    for block in blocks:
        bl = len(block)
        if bl > max_chars:
            emit()
            for i in range(0, len(block), max_chars - overlap_chars):
                chunks.append(block[i : i + max_chars].strip())
            continue
        if cur and cur_len + bl > max_chars:
            emit()
        cur.append(block)
        cur_len += bl
    emit()
    return [{"text": c, "approx_tokens": max(1, len(c) // 4), "chars": len(c), "hash": sha(c)} for c in chunks if len(c) > 60]


def list_audit_files(audit_dir: Path) -> list[Path]:
    return sorted(
        p for p in audit_dir.glob("*.md")
        if p.name not in SKIP_NAMES and re.match(r"^\d{2}-", p.name)
    )


def require_approval(approve: bool) -> None:
    if not approve:
        return
    if os.environ.get("IAM_AUDIT_VECTORIZE_APPROVED") == "1" or APPROVAL_FILE.is_file():
        return
    raise RuntimeError(
        f"Upsert requires approval. Run --write-approval or set IAM_AUDIT_VECTORIZE_APPROVED=1\n"
        f"Expected file: {APPROVAL_FILE}"
    )


def embed_chunk(
    text: str,
    lane_cfg: dict[str, str],
    *,
    openai_key: str,
    account_id: str,
    cf_token: str,
) -> list[float]:
    model = lane_cfg["embed_model"]
    dim = int(lane_cfg["dimensions"])
    if model.startswith("@cf/"):
        if lane_cfg.get("note"):
            print(f"[{now()}] WARN: {lane_cfg['note']}")
        return workers_ai_embed_bge_m3(account_id, cf_token, text)
    return openai_embed(text, model, dim, openai_key)


def main() -> int:
    load_env()
    ap = argparse.ArgumentParser(description="Ingest dashboard-agent-audit into production Vectorize lanes.")
    ap.add_argument("--audit-dir", type=Path, default=DEFAULT_AUDIT_DIR)
    ap.add_argument("--outdir", type=Path, default=DEFAULT_OUTROOT)
    ap.add_argument("--lane", choices=list(LANES.keys()), default="memory", help="Production RAG lane (default: memory)")
    ap.add_argument("--target-tokens", type=int, default=400)
    ap.add_argument("--overlap-tokens", type=int, default=50)
    ap.add_argument("--batch-size", type=int, default=100)
    ap.add_argument("--workspace-id", default=os.getenv("WORKSPACE_ID", ""))
    ap.add_argument("--tenant-id", default=os.getenv("TENANT_ID", ""))
    ap.add_argument("--embed", action="store_true")
    ap.add_argument("--upsert", action="store_true")
    ap.add_argument("--approve", action="store_true")
    ap.add_argument("--write-approval", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--no-text-metadata", action="store_true")
    args = ap.parse_args()

    if args.write_approval:
        APPROVAL_FILE.parent.mkdir(parents=True, exist_ok=True)
        APPROVAL_FILE.write_text(
            json.dumps({"approved_at": now(), "lane": args.lane, "note": "dashboard-agent-audit QA"}, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {APPROVAL_FILE}")
        return 0

    lane_cfg = LANES[args.lane]
    index_name = lane_cfg["vectorize_index"]
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
    cf_token = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    audit_dir = args.audit_dir.resolve()
    files = list_audit_files(audit_dir)
    if not files:
        raise RuntimeError(f"No audit files in {audit_dir}")

    rundir = args.outdir.resolve() / time.strftime("%Y%m%d_%H%M%S")
    rundir.mkdir(parents=True, exist_ok=True)

    if args.embed and lane_cfg["embed_model"].startswith("text-embedding") and not openai_key:
        raise RuntimeError("OPENAI_API_KEY required for OpenAI embedding lanes")
    if (args.embed or args.upsert) and lane_cfg["embed_model"].startswith("@cf/"):
        if not account_id or not cf_token:
            raise RuntimeError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required for Workers AI embed")

    all_vectors: list[dict] = []

    for path in files:
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        stem = path.stem
        title = meta.get("title") or stem
        prefix = slug(f"{SOURCE_PREFIX}_{stem}")[:32]
        ctx = (
            f"Agent Sam /dashboard/agent production audit. {title}. "
            f"File: {stem}.md. Lane: {args.lane}. "
        )
        for i, ch in enumerate(chunk_text(body, args.target_tokens, args.overlap_tokens)):
            vid = make_vector_id(prefix, i, ch["hash"])
            text_embed = ctx + ch["text"]
            md: dict[str, Any] = {
                "doc_id": f"{SOURCE_PREFIX}_{slug(stem)}",
                "title": title[:200],
                "source": str(path.relative_to(REPO_ROOT)),
                "r2_key": f"{R2_KEY_PREFIX}{path.name}",
                "category": "dashboard_agent_audit",
                "surface": "/dashboard/agent",
                "rag_lane": args.lane,
                "audit_stem": stem,
                "chunk_index": i,
                "hash": ch["hash"],
                "embedding_model": lane_cfg["embed_model"],
                "vectorize_index": index_name,
            }
            if args.workspace_id:
                md["workspace_id"] = args.workspace_id
            if args.tenant_id:
                md["tenant_id"] = args.tenant_id
            if not args.no_text_metadata:
                md["text"] = text_embed[:2000]

            row: dict[str, Any] = {"id": vid, "metadata": md}
            if args.embed:
                row["values"] = embed_chunk(
                    text_embed, lane_cfg, openai_key=openai_key, account_id=account_id, cf_token=cf_token
                )
            all_vectors.append(row)
        print(f"{path.name}: {len(file_chunks)} chunks")

    (rundir / "chunks.preview.json").write_text(
        json.dumps(
            [{"id": v["id"], "meta": v["metadata"], "dims": len(v.get("values", []))} for v in all_vectors],
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    manifest: dict[str, Any] = {
        "created_at": now(),
        "lane": args.lane,
        "vectorize_index": index_name,
        "embed_model": lane_cfg["embed_model"],
        "dimensions": lane_cfg["dimensions"],
        "chunk_count": len(all_vectors),
        "status": "CHUNK_ONLY" if not args.embed else "EMBEDDED",
    }

    if args.embed:
        with (rundir / "vectors.vectorize.ndjson").open("w", encoding="utf-8") as f:
            for v in all_vectors:
                f.write(json.dumps(v, ensure_ascii=False) + "\n")

    if args.upsert:
        require_approval(args.approve)
        if not args.embed:
            raise RuntimeError("--upsert requires --embed")
        if not account_id or not cf_token:
            raise RuntimeError("Missing Cloudflare credentials for upsert")
        print(f"Upserting {len(all_vectors)} vectors → {index_name}")
        manifest["mutations"] = cf_upsert(account_id, cf_token, index_name, all_vectors, args.batch_size)
        manifest["status"] = "UPSERTED"
        time.sleep(5)

    if args.verify and args.embed:
        q = "Agent Sam dashboard agent chat SSE approval tool_start Monaco save"
        if lane_cfg["embed_model"].startswith("@cf/"):
            qvec = workers_ai_embed_bge_m3(account_id, cf_token, q)
        else:
            qvec = openai_embed(q, lane_cfg["embed_model"], int(lane_cfg["dimensions"]), openai_key)
        matches = cf_query(account_id, cf_token, index_name, qvec, 5)
        manifest["verification"] = matches[:5]
        manifest["status"] = "VERIFIED" if any(str(m.get("id", "")).startswith("dag") for m in matches) else "VERIFY_MISS"

    (rundir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
