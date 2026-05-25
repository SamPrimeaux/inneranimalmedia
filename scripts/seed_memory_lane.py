#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ENV_FILES = [
    ROOT / ".env.cloudflare",
    ROOT / "agentsam.local.env",
    ROOT / ".env",
]

WORKSPACE_KEY = "ws_inneranimalmedia"
SUPABASE_TABLE = "agentsam_memory_oai3large_1536"
VECTORIZE_INDEX = "agentsam-memory-oai3large-1536"
OPENAI_EMBED_MODEL = "text-embedding-3-large"
OPENAI_EMBED_DIMS = 1536

FACTS = [
    ("runtime", "D1 is runtime source of truth — sessions, routing, workspace state"),
    ("supabase", "Supabase schema agentsam is private — service_role only via Hyperdrive"),
    ("browser", "Browser never queries raw Supabase tables"),
    ("rag", "Vectorize 1536 lanes: courses, code, schema, memory"),
    ("rag", "Deep archive 3072 is Supabase pgvector only — not Vectorize"),
    ("deploy", "npm run deploy:full is the only valid deploy command"),
    ("routing", "No hardcoded model strings in src/ — catalog and arms are authority"),
    ("routing", "5 canonical task_types: agent, ask, multitask, plan, debug"),
    ("routing", "agentsam_routing_arms is the Thompson bandit — recordArmOutcome closes loop"),
    ("providers", "Ollama arms are local_first only — cloud requests use cloud providers"),
]


def load_env() -> None:
    for env_file in ENV_FILES:
        if not env_file.exists():
            continue
        for raw in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required env var: {name}")
    return value


def env_config() -> dict[str, str]:
    load_env()
    return {
        "openai_key": require_env("OPENAI_API_KEY"),
        "supabase_url": require_env("SUPABASE_URL").rstrip("/"),
        "supabase_key": require_env("SUPABASE_SERVICE_ROLE_KEY"),
        "cf_token": require_env("CLOUDFLARE_API_TOKEN"),
        "cf_account_id": (
            os.environ.get("CF_ACCOUNT_ID")
            or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
            or ""
        ).strip(),
    }


def json_request(method: str, url: str, *, headers: dict[str, str], payload: Any = None,
                 timeout: int = 60) -> tuple[int, Any]:
    data = None
    req_headers = dict(headers)
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return resp.status, json.loads(raw) if raw else None


def supabase_headers(key: str, *, prefer: str | None = None, write: bool = False) -> dict[str, str]:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Accept-Profile": "agentsam",
    }
    if write:
        headers["Content-Profile"] = "agentsam"
    if prefer:
        headers["Prefer"] = prefer
    return headers


def supabase_get(path: str, config: dict[str, str]) -> Any:
    url = f"{config['supabase_url']}{path}"
    _, data = json_request("GET", url, headers=supabase_headers(config["supabase_key"]))
    return data


def supabase_post(path: str, payload: Any, config: dict[str, str]) -> Any:
    url = f"{config['supabase_url']}{path}"
    _, data = json_request(
        "POST",
        url,
        headers=supabase_headers(
            config["supabase_key"],
            prefer="resolution=merge-duplicates,return=representation",
            write=True,
        ),
        payload=payload,
    )
    return data


def supabase_patch(path: str, payload: Any, config: dict[str, str]) -> Any:
    url = f"{config['supabase_url']}{path}"
    _, data = json_request(
        "PATCH",
        url,
        headers=supabase_headers(
            config["supabase_key"],
            prefer="return=representation",
            write=True,
        ),
        payload=payload,
    )
    return data


def resolve_workspace_uuid(config: dict[str, str]) -> str:
    query = urllib.parse.urlencode({
        "select": "id",
        "workspace_key": f"eq.{WORKSPACE_KEY}",
        "limit": "1",
    })
    rows = supabase_get(f"/rest/v1/agentsam_workspaces?{query}", config) or []
    if not rows:
        raise SystemExit(f"Workspace not found in Supabase: {WORKSPACE_KEY}")
    return str(rows[0]["id"])


def probe_table_or_die(config: dict[str, str], table: str) -> None:
    query = urllib.parse.urlencode({
        "select": "id",
        "id": "is.null",
        "limit": "1",
    })
    url = f"{config['supabase_url']}/rest/v1/{table}?{query}"
    try:
        status, data = json_request("GET", url, headers=supabase_headers(config["supabase_key"]))
        if status == 200 and (data == [] or isinstance(data, list)):
            return
        print(f"[probe] unexpected response for {table}: {status} {data}")
        raise SystemExit(1)
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")
        except Exception:
            body = ""
        print(f"[probe] {table} unreachable: HTTP {e.code} {body}")
        raise SystemExit(1)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(str(x) for x in embedding) + "]"


def openai_embed(text: str, config: dict[str, str]) -> list[float]:
    status, data = json_request(
        "POST",
        "https://api.openai.com/v1/embeddings",
        headers={
            "Authorization": f"Bearer {config['openai_key']}",
            "Content-Type": "application/json",
        },
        payload={
            "model": OPENAI_EMBED_MODEL,
            "input": text,
            "dimensions": OPENAI_EMBED_DIMS,
        },
        timeout=120,
    )
    if status < 200 or status >= 300:
        raise RuntimeError(f"OpenAI embeddings failed with status {status}")
    embedding = data["data"][0]["embedding"]
    if not isinstance(embedding, list) or len(embedding) != OPENAI_EMBED_DIMS:
        raise RuntimeError(f"Expected {OPENAI_EMBED_DIMS}-dim embedding")
    return embedding


def existing_memory_row(config: dict[str, str], workspace_uuid: str, content_hash: str) -> dict[str, Any] | None:
    query = urllib.parse.urlencode({
        "select": "id,content_hash",
        "workspace_id": f"eq.{workspace_uuid}",
        "content_hash": f"eq.{content_hash}",
        "limit": "1",
    })
    rows = supabase_get(f"/rest/v1/{SUPABASE_TABLE}?{query}", config) or []
    return rows[0] if rows else None


def save_memory_row(config: dict[str, str], row: dict[str, Any], existing_id: str | None) -> dict[str, Any]:
    if existing_id:
        data = supabase_patch(f"/rest/v1/{SUPABASE_TABLE}?id=eq.{existing_id}", row, config)
        if not isinstance(data, list) or not data:
            raise RuntimeError("Supabase patch returned no row")
        return data[0]
    data = supabase_post(f"/rest/v1/{SUPABASE_TABLE}", [row], config)
    if not isinstance(data, list) or not data:
        raise RuntimeError("Supabase insert returned no row")
    return data[0]


def vectorize_upsert(config: dict[str, str], row_id: str, embedding: list[float], metadata: dict[str, Any]) -> None:
    url = (
        "https://api.cloudflare.com/client/v4/accounts/"
        f"{config['cf_account_id']}/vectorize/v2/indexes/{VECTORIZE_INDEX}/upsert"
    )
    ndjson = json.dumps({
        "id": row_id,
        "values": embedding,
        "metadata": metadata,
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=ndjson,
        headers={
            "Authorization": f"Bearer {config['cf_token']}",
            "Content-Type": "application/x-ndjson",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status < 200 or resp.status >= 300:
            raise RuntimeError(f"Vectorize upsert failed for {row_id}")


def build_payload(workspace_uuid: str, row_id: str, title: str, memory_key: str,
                  content: str, content_hash: str, embedding: list[float], metadata: dict[str, Any]) -> dict[str, Any]:
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "id": row_id,
        "workspace_id": workspace_uuid,
        "title": title,
        "memory_key": memory_key,
        "content": content,
        "source": "system_seed",
        "source_type": "system_seed",
        "source_ref": f"seed.{memory_key}",
        "metadata": metadata,
        "content_hash": content_hash,
        "embedding": vector_literal(embedding),
        "embedding_model": OPENAI_EMBED_MODEL,
        "embedding_dims": OPENAI_EMBED_DIMS,
        "vectorize_binding": "AGENTSAM_VECTORIZE_MEMORY",
        "vectorize_index": VECTORIZE_INDEX,
        "vectorize_id": row_id,
        "embedded_at": now_iso,
        "updated_at": now_iso,
    }


def main() -> int:
    config = env_config()
    probe_table_or_die(config, SUPABASE_TABLE)
    workspace_uuid = resolve_workspace_uuid(config)

    count = 0
    for idx, (area, content) in enumerate(FACTS, start=1):
        memory_key = f"system.seed.{idx:02d}"
        title = f"Golden Memory {idx:02d}"
        content_hash = sha256_text(content)
        existing = existing_memory_row(config, workspace_uuid, content_hash)
        if existing:
            print(f"SKIP {memory_key} unchanged")
            continue

        metadata = {"confidence": "golden", "area": area, "expires": None}
        embedding = openai_embed(content, config)
        row_id = str(existing.get("id")) if existing and existing.get("id") else str(uuid.uuid4())
        payload = build_payload(
            workspace_uuid,
            row_id,
            title,
            memory_key,
            content,
            content_hash,
            embedding,
            metadata,
        )
        saved = save_memory_row(
            config,
            payload,
            str(existing.get("id")) if existing and existing.get("id") else None,
        )
        vectorize_upsert(
            config,
            str(saved.get("id") or row_id),
            embedding,
            {
                "workspace_id": WORKSPACE_KEY,
                "memory_key": memory_key,
                "source_ref": f"seed.{memory_key}",
                "title": title,
                "source_type": "system_seed",
            },
        )
        print(f"UPSERT {memory_key}")
        count += 1

    print(f"DONE {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
