#!/usr/bin/env python3
"""
Ingest D1 + Supabase schema summaries into the schema RAG lane.

Run with:
  ./scripts/with-cloudflare-env.sh python3 scripts/ingest_schema_rag.py
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ENV_FILES = [
    ROOT / ".env.cloudflare",
    ROOT / "agentsam.local.env",
    ROOT / ".env",
]
WORKSPACE_KEY = "ws_inneranimalmedia"
SUPABASE_TABLE = "agentsam_schema_oai3large_1536"
VECTORIZE_INDEX = "agentsam-schema-oai3large-1536"
OPENAI_EMBED_MODEL = "text-embedding-3-large"
OPENAI_EMBED_DIMS = 1536


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


def wrangler_json(sql: str) -> list[dict[str, Any]]:
    cmd = [
        str(ROOT / "scripts" / "with-cloudflare-env.sh"),
        "npx",
        "wrangler",
        "d1",
        "execute",
        "inneranimalmedia-business",
        "--remote",
        "-c",
        "wrangler.production.toml",
        "--json",
        "--command",
        sql,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout or "wrangler d1 execute failed")
    raw = proc.stdout.strip()
    batches = json.loads(raw)
    rows: list[dict[str, Any]] = []
    for batch in batches:
        rows.extend(batch.get("results") or [])
    return rows


def fetch_d1_schema_rows() -> list[dict[str, Any]]:
    sql = (
        "SELECT name, sql FROM sqlite_master "
        "WHERE type='table' AND name LIKE 'agentsam_%' ORDER BY name"
    )
    return wrangler_json(sql)


def fetch_supabase_schema_rows(config: dict[str, str]) -> list[dict[str, Any]]:
    # Repo pattern uses Supabase pg meta endpoints for schema inspection.
    query = urllib.parse.urlencode({
        "schema": "agentsam",
        "limit": "10000",
    })
    rows = supabase_get(f"/pg/columns?{query}", config)
    return rows if isinstance(rows, list) else []


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


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
        raise RuntimeError(f"Expected {OPENAI_EMBED_DIMS}-dim embedding, got {len(embedding) if isinstance(embedding, list) else 'invalid'}")
    return embedding


def vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(str(x) for x in embedding) + "]"


def existing_schema_row(config: dict[str, str], workspace_uuid: str, source_ref: str) -> dict[str, Any] | None:
    query = urllib.parse.urlencode({
        "select": "id,content_hash",
        "workspace_id": f"eq.{workspace_uuid}",
        "source_ref": f"eq.{source_ref}",
        "limit": "1",
    })
    rows = supabase_get(f"/rest/v1/{SUPABASE_TABLE}?{query}", config) or []
    return rows[0] if rows else None


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


def save_supabase_schema_row(config: dict[str, str], row: dict[str, Any], existing_id: str | None) -> dict[str, Any]:
    if existing_id:
        data = supabase_patch(f"/rest/v1/{SUPABASE_TABLE}?id=eq.{existing_id}", row, config)
        if not isinstance(data, list) or not data:
            raise RuntimeError(f"Supabase patch returned no row for {row['source_ref']}")
        return data[0]
    data = supabase_post(f"/rest/v1/{SUPABASE_TABLE}", [row], config)
    if not isinstance(data, list) or not data:
        raise RuntimeError(f"Supabase insert returned no row for {row['source_ref']}")
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


def normalize_nullable(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"yes", "true", "t", "1"}


def build_d1_entries(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries = []
    for row in rows:
        table_name = str(row.get("name") or "").strip()
        sql = str(row.get("sql") or "").strip()
        if not table_name or not sql:
            continue
        entries.append({
            "title": f"D1 Table: {table_name}",
            "content": f"D1 Table: {table_name}\n\nSchema:\n{sql}",
            "source_ref": f"d1.{table_name}",
            "database_kind": "d1",
            "database_name": "inneranimalmedia-business",
            "schema_name": None,
            "object_name": table_name,
            "object_type": "table",
            "metadata": {
                "db": "d1",
                "table_name": table_name,
            },
        })
    return entries


def build_supabase_entries(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        schema_name = str(row.get("schema") or row.get("table_schema") or "").strip()
        if schema_name != "agentsam":
            continue
        table_name = str(row.get("table") or row.get("table_name") or "").strip()
        if not table_name:
            continue
        grouped[table_name].append(row)

    entries = []
    for table_name in sorted(grouped):
        cols = []
        for row in grouped[table_name]:
            col = str(row.get("name") or row.get("column_name") or "").strip()
            dtype = str(row.get("format") or row.get("data_type") or "unknown").strip()
            nullable = "nullable" if normalize_nullable(row.get("is_nullable")) else "required"
            if not col:
                continue
            cols.append(f"  {col} ({dtype}, {nullable})")
        if not cols:
            continue
        entries.append({
            "title": f"Supabase Table: agentsam.{table_name}",
            "content": (
                f"Supabase table: agentsam.{table_name}\nColumns:\n"
                + "\n".join(cols)
            ),
            "source_ref": f"supabase.agentsam.{table_name}",
            "database_kind": "supabase",
            "database_name": "agentsam",
            "schema_name": "agentsam",
            "object_name": table_name,
            "object_type": "table",
            "metadata": {
                "db": "supabase",
                "schema": "agentsam",
                "table_name": table_name,
            },
        })
    return entries


def ingest_entry(config: dict[str, str], workspace_uuid: str, entry: dict[str, Any]) -> bool:
    title = entry["title"]
    content = entry["content"]
    source_ref = entry["source_ref"]
    content_hash = sha256_text(content)
    existing = existing_schema_row(config, workspace_uuid, source_ref)
    if existing and str(existing.get("content_hash") or "") == content_hash:
        print(f"SKIP {source_ref} unchanged")
        return False

    embedding = openai_embed(content, config)
    row_id = str(existing.get("id")) if existing and existing.get("id") else str(uuid.uuid4())
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    payload = {
        "id": row_id,
        "workspace_id": workspace_uuid,
        "database_kind": entry["database_kind"],
        "database_name": entry.get("database_name"),
        "schema_name": entry.get("schema_name"),
        "object_name": entry["object_name"],
        "object_type": entry["object_type"],
        "title": title,
        "content": content,
        "source_ref": source_ref,
        "metadata": entry["metadata"],
        "content_hash": content_hash,
        "embedding": vector_literal(embedding),
        "vectorize_binding": "AGENTSAM_VECTORIZE_SCHEMA",
        "vectorize_index": VECTORIZE_INDEX,
        "vectorize_id": row_id,
        "embedded_at": now_iso,
        "updated_at": now_iso,
    }
    saved = save_supabase_schema_row(
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
            "source_ref": source_ref,
            "source_type": entry["object_type"],
            "title": title,
        },
    )
    print(f"UPSERT {source_ref}")
    return True


def main() -> int:
    config = env_config()
    probe_table_or_die(config, SUPABASE_TABLE)
    if not config["cf_account_id"]:
        raise SystemExit("Missing required env var: CF_ACCOUNT_ID")

    workspace_uuid = resolve_workspace_uuid(config)
    d1_entries = build_d1_entries(fetch_d1_schema_rows())
    supabase_entries = build_supabase_entries(fetch_supabase_schema_rows(config))

    count = 0
    print(f"D1 tables: {len(d1_entries)}")
    for entry in d1_entries:
        if ingest_entry(config, workspace_uuid, entry):
            count += 1

    print(f"Supabase tables: {len(supabase_entries)}")
    for entry in supabase_entries:
        if ingest_entry(config, workspace_uuid, entry):
            count += 1

    print(f"DONE {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
