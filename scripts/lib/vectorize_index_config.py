#!/usr/bin/env python3
"""AGENTSAMVECTORIZE index describe + embedding model resolution (REST source of truth)."""

from __future__ import annotations

import json
import os
import sys
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

VECTORIZE_INDEX_NAME = "inneranimalmedia-vectors"


def load_env_files(repo_root: str) -> dict[str, str]:
    env: dict[str, str] = {}
    for name in ("agentsam.local.env", ".env.cloudflare", ".env.agentsam.local", ".env"):
        path = os.path.join(repo_root, name)
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in env:
                    env[k] = v
    env.update(os.environ)
    return env


def describe_vectorize_index(
    account_id: str,
    cf_token: str,
    index_name: str = VECTORIZE_INDEX_NAME,
) -> dict[str, Any]:
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/vectorize/v2/indexes/{index_name}"
    )
    req = Request(
        url,
        headers={"Authorization": f"Bearer {cf_token}"},
        method="GET",
    )
    with urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    if not data.get("success"):
        raise RuntimeError(f"Vectorize describe failed: {data.get('errors')}")
    result = data.get("result") or {}
    cfg = result.get("config") or {}
    dimensions = int(cfg.get("dimensions") or 0)
    metric = str(cfg.get("metric") or "cosine")
    if dimensions <= 0:
        raise RuntimeError("Invalid dimensions from Vectorize describe")
    return {
        "index_name": result.get("name") or index_name,
        "dimensions": dimensions,
        "metric": metric,
    }


def resolve_embedding_spec(dimensions: int) -> dict[str, Any]:
    dim = int(dimensions)
    if dim == 1536:
        return {
            "provider": "openai",
            "model": "text-embedding-3-large",
            "dimensions": 1536,
            "openai_dimensions_param": 1536,
        }
    if dim == 768:
        return {
            "provider": "workers_ai",
            "model": "@cf/baai/bge-large-en-v1.5",
            "dimensions": 768,
            "openai_dimensions_param": None,
        }
    if dim == 1024:
        return {
            "provider": "workers_ai",
            "model": "@cf/baai/bge-large-en-v1.5",
            "dimensions": 1024,
            "openai_dimensions_param": None,
        }
    raise RuntimeError(
        f"No embedding model for index dimension {dim}. One index, one dimension, one model."
    )


def embed_probe_openai(text: str, api_key: str, spec: dict[str, Any]) -> list[float]:
    body: dict[str, Any] = {"model": spec["model"], "input": text}
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
    with urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    emb = data["data"][0]["embedding"]
    return emb


def smoke_validate_index(
    env: dict[str, str] | None = None,
    *,
    repo_root: str | None = None,
    probe_text: str = "dimension probe — Agent Sam codebase index",
) -> dict[str, Any]:
    root = repo_root or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env = env or load_env_files(root)
    account_id = env.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    cf_token = env.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not account_id or not cf_token:
        print("ERROR: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required", file=sys.stderr)
        sys.exit(1)

    index = describe_vectorize_index(account_id, cf_token)
    dimensions = index["dimensions"]
    metric = index["metric"]
    print(
        f"Index: {index['index_name']} | dimensions={dimensions} | metric={metric}",
        flush=True,
    )

    spec = resolve_embedding_spec(dimensions)
    print(
        f"Embedding: provider={spec['provider']} model={spec['model']} (must match at query time)",
        flush=True,
    )

    if spec["provider"] == "openai":
        api_key = env.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            print("ERROR: OPENAI_API_KEY required for 1536-dim index", file=sys.stderr)
            sys.exit(1)
        vec = embed_probe_openai(probe_text, api_key, spec)
    else:
        print(
            f"ERROR: workers_ai embeddings ({spec['model']}) must run via Worker for dim {dimensions}. "
            "Use GET /api/internal/agentsam-vectorize/describe on deployed Worker.",
            file=sys.stderr,
        )
        sys.exit(1)

    if len(vec) != dimensions:
        print(
            f"FATAL: model produced {len(vec)} floats, index requires {dimensions}. "
            "Do not embed — fix model/index mismatch.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Probe OK: {len(vec)}-dim vector validated.", flush=True)
    return {"index": index, "spec": spec, "probe_dims": len(vec)}
