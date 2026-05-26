#!/usr/bin/env python3
"""
Ingest large D1 agentsam_skill rows into the schema RAG lane (1536).

Threshold: LENGTH(content_markdown) > 4000 (~1000 tokens) — smaller skills stay in D1.

Usage:
  python3 scripts/ingest_skills_to_vectorize.py --dry-run
  python3 scripts/ingest_skills_to_vectorize.py --dry-run --limit 5
  python3 scripts/ingest_skills_to_vectorize.py --skill-id skill_mcp_oauth_field_guide

Requires env (see agentsam.local.env / .env.cloudflare):
  OPENAI_API_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN,
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, D1_DATABASE_ID,
  INGEST_WORKSPACE_KEY, INGEST_TENANT_ID
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any
from urllib.error import URLError

ROOT = Path(__file__).resolve().parents[1]
ENV_FILES = [
    ROOT / ".env.cloudflare",
    ROOT / ".env.agentsam.local",
    ROOT / "agentsam.local.env",
    ROOT / ".env",
]

DEFAULT_D1_DATABASE_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"

CONTENT_THRESHOLD = 4000
CHUNK_TARGET_TOKENS = 512
CHUNK_OVERLAP_TOKENS = 64
CHUNK_TARGET_CHARS = CHUNK_TARGET_TOKENS * 4
CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * 4
OPENAI_EMBED_MODEL = "text-embedding-3-large"
OPENAI_EMBED_DIMS = 1536
EMBED_BATCH = 100
VECTORIZE_BATCH = 100
EMBED_COST_PER_M = 0.02

SUPABASE_TABLE = "agentsam_schema_oai3large_1536"
VECTORIZE_INDEX = "agentsam-schema-oai3large-1536"
VECTORIZE_BINDING = "AGENTSAM_VECTORIZE_SCHEMA"
R2_BUCKET = "inneranimalmedia-autorag"
R2_FOLDER = "knowledge/skills"

SKILLS_SQL = """
SELECT id, name, content_markdown, token_estimate,
       task_types_json, route_keys_json, slash_trigger
FROM agentsam_skill
WHERE is_active = 1
  AND always_apply = 0
  AND LENGTH(content_markdown) > ?
  AND retrieval_strategy = 'db'
ORDER BY LENGTH(content_markdown) DESC
"""


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


def env_config(*, require_all: bool) -> dict[str, str]:
    load_env()
    cfg = {
        "openai_key": os.environ.get("OPENAI_API_KEY", "").strip(),
        "cf_token": os.environ.get("CLOUDFLARE_API_TOKEN", "").strip(),
        "cf_account_id": (
            os.environ.get("CLOUDFLARE_ACCOUNT_ID")
            or os.environ.get("CF_ACCOUNT_ID")
            or ""
        ).strip(),
        "d1_database_id": (
            os.environ.get("D1_DATABASE_ID")
            or os.environ.get("CLOUDFLARE_D1_DATABASE_ID")
            or DEFAULT_D1_DATABASE_ID
        ).strip(),
        "supabase_url": os.environ.get("SUPABASE_URL", "").rstrip("/"),
        "supabase_key": os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
        "workspace_key": os.environ.get("INGEST_WORKSPACE_KEY", "").strip(),
        "tenant_id": os.environ.get("INGEST_TENANT_ID", "").strip(),
    }
    if require_all:
        for key in (
            "openai_key",
            "cf_token",
            "cf_account_id",
            "d1_database_id",
            "supabase_url",
            "supabase_key",
            "workspace_key",
            "tenant_id",
        ):
            if not cfg[key]:
                raise SystemExit(f"Missing required env var (see script header): {key}")
    return cfg


def assert_repo_root() -> None:
    if Path.cwd().resolve() != ROOT.resolve():
        raise SystemExit(f"Run from repo root: {ROOT}")
    if Path.cwd().name != "inneranimalmedia":
        raise SystemExit("Repo root guard failed: cwd must be inneranimalmedia")


def json_request(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    payload: Any = None,
    raw_body: bytes | None = None,
    timeout: int = 120,
) -> tuple[int, Any]:
    data = raw_body
    req_headers = dict(headers)
    if payload is not None and raw_body is None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8")
                return resp.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {e.code} {url}: {body[:500]}") from e
        except URLError as e:
            # Transient DNS / network hiccups are common; retry a couple times.
            last_err = e
            time.sleep(1.0 + attempt * 1.5)
    raise last_err or RuntimeError("network error")


def d1_query(config: dict[str, str], sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{config['cf_account_id']}"
        f"/d1/database/{config['d1_database_id']}/query"
    )
    payload: dict[str, Any] = {"sql": sql}
    if params:
        payload["params"] = params
    status, data = json_request(
        "POST",
        url,
        headers={"Authorization": f"Bearer {config['cf_token']}"},
        payload=payload,
        timeout=90,
    )
    if not data or not data.get("success"):
        raise RuntimeError(f"D1 query failed: {data}")
    rows: list[dict[str, Any]] = []
    for result in data.get("result") or []:
        rows.extend(result.get("results") or [])
    return rows


def d1_execute(config: dict[str, str], sql: str, params: list[Any]) -> None:
    d1_query(config, sql, params)


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
        "workspace_key": f"eq.{config['workspace_key']}",
        "limit": "1",
    })
    rows = supabase_get(f"/rest/v1/agentsam_workspaces?{query}", config) or []
    if not rows:
        raise SystemExit(f"Workspace not found in Supabase: {config['workspace_key']}")
    return str(rows[0]["id"])


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def estimate_tokens(text: str) -> int:
    return max(1, (len(text) + 3) // 4)


def split_semantic_blocks(text: str) -> list[str]:
    text = text.replace("\r\n", "\n").strip()
    if not text:
        return []
    parts = re.split(r"\n(?=#{1,6}\s)", text)
    blocks: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if len(part) <= CHUNK_TARGET_CHARS:
            blocks.append(part)
            continue
        paras = [p.strip() for p in re.split(r"\n\s*\n", part) if p.strip()]
        buf = ""
        for para in paras:
            candidate = f"{buf}\n\n{para}".strip() if buf else para
            if len(candidate) <= CHUNK_TARGET_CHARS:
                buf = candidate
            else:
                if buf:
                    blocks.append(buf)
                if len(para) <= CHUNK_TARGET_CHARS:
                    buf = para
                else:
                    lines = para.split("\n")
                    line_buf = ""
                    for line in lines:
                        cand = f"{line_buf}\n{line}".strip() if line_buf else line
                        if len(cand) <= CHUNK_TARGET_CHARS:
                            line_buf = cand
                        else:
                            if line_buf:
                                blocks.append(line_buf)
                            line_buf = line
                    buf = line_buf
        if buf:
            blocks.append(buf)
    return blocks


def chunk_markdown(text: str) -> list[str]:
    blocks = split_semantic_blocks(text)
    if not blocks:
        return []
    chunks: list[str] = []
    current = ""
    for block in blocks:
        if not current:
            current = block
            continue
        merged = f"{current}\n\n{block}"
        if len(merged) <= CHUNK_TARGET_CHARS:
            current = merged
        else:
            chunks.append(current)
            current = block
    if current:
        chunks.append(current)

    if len(chunks) <= 1:
        return chunks

    overlapped: list[str] = []
    prev_tail = ""
    for i, chunk in enumerate(chunks):
        body = chunk
        if i > 0 and prev_tail:
            body = f"{prev_tail}\n\n{chunk}".strip()
        overlapped.append(body)
        if len(chunk) > CHUNK_OVERLAP_CHARS:
            prev_tail = chunk[-CHUNK_OVERLAP_CHARS:]
        else:
            prev_tail = chunk
    return overlapped


def openai_embed_batch(texts: list[str], config: dict[str, str]) -> list[list[float]]:
    status, data = json_request(
        "POST",
        "https://api.openai.com/v1/embeddings",
        headers={
            "Authorization": f"Bearer {config['openai_key']}",
            "Content-Type": "application/json",
        },
        payload={
            "model": OPENAI_EMBED_MODEL,
            "input": texts,
            "dimensions": OPENAI_EMBED_DIMS,
        },
        timeout=180,
    )
    if status < 200 or status >= 300:
        raise RuntimeError(f"OpenAI embeddings failed with status {status}")
    items = sorted(data["data"], key=lambda x: x["index"])
    out: list[list[float]] = []
    for item in items:
        emb = item["embedding"]
        if not isinstance(emb, list) or len(emb) != OPENAI_EMBED_DIMS:
            raise RuntimeError(f"Expected {OPENAI_EMBED_DIMS}-dim embedding")
        out.append(emb)
    return out


def vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(str(x) for x in embedding) + "]"


def supabase_hash_exists(config: dict[str, str], workspace_uuid: str, content_hash: str) -> bool:
    query = urllib.parse.urlencode({
        "select": "id",
        "workspace_id": f"eq.{workspace_uuid}",
        "content_hash": f"eq.{content_hash}",
        "limit": "1",
    })
    rows = supabase_get(f"/rest/v1/{SUPABASE_TABLE}?{query}", config) or []
    return bool(rows)


def save_schema_row(
    config: dict[str, str],
    workspace_uuid: str,
    row: dict[str, Any],
    existing_id: str | None,
) -> dict[str, Any]:
    if existing_id:
        data = supabase_patch(f"/rest/v1/{SUPABASE_TABLE}?id=eq.{existing_id}", row, config)
    else:
        data = supabase_post(f"/rest/v1/{SUPABASE_TABLE}", [row], config)
    if not isinstance(data, list) or not data:
        raise RuntimeError(f"Supabase upsert returned no row for {row.get('source_ref')}")
    return data[0]


def existing_schema_by_ref(
    config: dict[str, str],
    workspace_uuid: str,
    source_ref: str,
) -> dict[str, Any] | None:
    query = urllib.parse.urlencode({
        "select": "id,content_hash",
        "workspace_id": f"eq.{workspace_uuid}",
        "source_ref": f"eq.{source_ref}",
        "limit": "1",
    })
    rows = supabase_get(f"/rest/v1/{SUPABASE_TABLE}?{query}", config) or []
    return rows[0] if rows else None


def vectorize_upsert_batch(config: dict[str, str], vectors: list[dict[str, Any]]) -> None:
    url = (
        "https://api.cloudflare.com/client/v4/accounts/"
        f"{config['cf_account_id']}/vectorize/v2/indexes/{VECTORIZE_INDEX}/upsert"
    )
    ndjson = "\n".join(json.dumps(v, separators=(",", ":")) for v in vectors).encode("utf-8")
    status, data = json_request(
        "POST",
        url,
        headers={
            "Authorization": f"Bearer {config['cf_token']}",
            "Content-Type": "application/x-ndjson",
        },
        raw_body=ndjson,
        timeout=120,
    )
    if status < 200 or status >= 300 or not (data or {}).get("success", True):
        raise RuntimeError(f"Vectorize upsert failed: {data}")


def r2_put_object(config: dict[str, str], object_key: str, body: bytes, content_type: str) -> None:
    encoded_key = urllib.parse.quote(object_key, safe="/")
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{config['cf_account_id']}"
        f"/r2/buckets/{R2_BUCKET}/objects/{encoded_key}"
    )
    json_request(
        "PUT",
        url,
        headers={
            "Authorization": f"Bearer {config['cf_token']}",
            "Content-Type": content_type,
        },
        raw_body=body,
        timeout=120,
    )


def log_vectorize_sync(
    config: dict[str, str],
    *,
    file_key: str,
    chunk_count: int,
    token_count: int,
    status: str,
) -> None:
    try:
        cols = d1_query(config, "PRAGMA table_info(vectorize_sync_log)") or []
        colset = {str(c.get("name") or "") for c in cols}
        ordered: list[tuple[str, Any]] = []

        # This log table was originally for the legacy AutoRAG pipeline; some deployments
        # use chunk_id as the primary key (not id). Prefer chunk_id when present.
        if "chunk_id" in colset:
            ordered.append(("chunk_id", f"skill:{file_key}:{int(time.time())}:{uuid.uuid4().hex[:8]}"))
        elif "id" in colset:
            ordered.append(("id", f"vlog_skill_{int(time.time())}_{uuid.uuid4().hex[:8]}"))

        # Always override the legacy default index name if the column exists.
        if "vectorize_index" in colset:
            ordered.append(("vectorize_index", VECTORIZE_INDEX))
        if "r2_folder" in colset:
            ordered.append(("r2_folder", R2_FOLDER))
        if "file_key" in colset:
            ordered.append(("file_key", file_key))
        if "vectorize_binding" in colset:
            ordered.append(("vectorize_binding", VECTORIZE_BINDING))
        if "supabase_table" in colset:
            ordered.append(("supabase_table", SUPABASE_TABLE))
        if "chunk_count" in colset:
            ordered.append(("chunk_count", int(chunk_count)))
        if "token_count" in colset:
            ordered.append(("token_count", int(token_count)))
        if "status" in colset:
            ordered.append(("status", status))

        if "created_at" in colset:
            # D1 table may default this; if it exists we can set it explicitly.
            ordered.append(("created_at", time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())))

        if not ordered:
            return

        colnames = ", ".join(k for k, _ in ordered)
        placeholders = ", ".join("?" for _ in ordered)
        params = [v for _, v in ordered]
        d1_execute(config, f"INSERT INTO vectorize_sync_log ({colnames}) VALUES ({placeholders})", params)
    except Exception as e:
        print(f"  [warn] vectorize_sync_log insert failed (non-fatal): {e}")


def fetch_skills(
    config: dict[str, str],
    *,
    skill_id: str | None,
    limit: int | None,
) -> list[dict[str, Any]]:
    base = SKILLS_SQL.strip()
    params: list[Any] = [CONTENT_THRESHOLD]

    where_extra = ""
    if skill_id:
        where_extra += " AND id = ?"
        params.append(skill_id)

    sql = base.replace("ORDER BY LENGTH(content_markdown) DESC", f"{where_extra}\nORDER BY LENGTH(content_markdown) DESC")
    if limit is not None:
        sql = f"{sql}\nLIMIT {int(limit)}"
    return d1_query(config, sql, params)


def plan_skill(skill: dict[str, Any]) -> dict[str, Any]:
    content = str(skill.get("content_markdown") or "")
    chunks = chunk_markdown(content)
    tokens = sum(estimate_tokens(c) for c in chunks)
    return {
        "skill": skill,
        "chunks": chunks,
        "chunk_count": len(chunks),
        "content_chars": len(content),
        "token_estimate": tokens,
    }


def process_skill(
    config: dict[str, str],
    workspace_uuid: str,
    plan: dict[str, Any],
    *,
    dry_run: bool,
) -> dict[str, Any]:
    skill = plan["skill"]
    skill_id = str(skill["id"])
    name = str(skill.get("name") or skill_id)
    content = str(skill.get("content_markdown") or "")
    chunks: list[str] = plan["chunks"]
    source_base = f"skill/{skill_id}"
    r2_key = f"{R2_FOLDER}/{skill_id}.md"
    file_path = f"skills/{skill_id}.md"

    if not chunks:
        return {"skill_id": skill_id, "status": "skipped", "reason": "no_chunks"}

    if dry_run:
        return {
            "skill_id": skill_id,
            "status": "planned",
            "chunks": len(chunks),
            "tokens": plan["token_estimate"],
            "r2_key": r2_key,
        }

    r2_put_object(config, r2_key, content.encode("utf-8"), "text/markdown; charset=utf-8")
    print(f"  R2 stored s3://{R2_BUCKET}/{r2_key}")

    pending: list[dict[str, Any]] = []
    for idx, chunk_text in enumerate(chunks):
        chunk_hash = sha256_text(chunk_text)
        if supabase_hash_exists(config, workspace_uuid, chunk_hash):
            print(f"  chunk {idx}: SKIP hash exists")
            continue
        source_ref = f"{source_base}#chunk{idx:04d}"
        pending.append({
            "idx": idx,
            "chunk_text": chunk_text,
            "chunk_hash": chunk_hash,
            "source_ref": source_ref,
        })

    if not pending and len(chunks) > 0:
        print(f"  all chunks already in Supabase for {skill_id}")

    vectorize_rows: list[dict[str, Any]] = []
    for batch_start in range(0, len(pending), EMBED_BATCH):
        batch = pending[batch_start : batch_start + EMBED_BATCH]
        embeddings = openai_embed_batch([b["chunk_text"] for b in batch], config)
        for item, embedding in zip(batch, embeddings):
            idx = item["idx"]
            chunk_text = item["chunk_text"]
            chunk_hash = item["chunk_hash"]
            source_ref = item["source_ref"]
            existing = existing_schema_by_ref(config, workspace_uuid, source_ref)
            row_id = str(existing["id"]) if existing and existing.get("id") else str(uuid.uuid4())
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            metadata = {
                "skill_id": skill_id,
                "chunk_index": idx,
                "slash_trigger": str(skill.get("slash_trigger") or ""),
                "task_types_json": str(skill.get("task_types_json") or "[]"),
                "route_keys_json": str(skill.get("route_keys_json") or "[]"),
            }
            payload = {
                "id": row_id,
                "workspace_id": workspace_uuid,
                "database_kind": "workers_ai",
                "database_name": "agentsam_skill",
                "schema_name": "agentsam",
                "object_name": skill_id,
                "object_type": "query_pattern",
                "title": f"{name} (chunk {idx + 1}/{len(chunks)})",
                "content": chunk_text,
                "source_ref": source_ref,
                "metadata": metadata,
                "content_hash": chunk_hash,
                "embedding": vector_literal(embedding),
                "vectorize_binding": VECTORIZE_BINDING,
                "vectorize_index": VECTORIZE_INDEX,
                "vectorize_id": row_id,
                "embedded_at": now_iso,
                "updated_at": now_iso,
            }
            saved = save_schema_row(
                config,
                workspace_uuid,
                payload,
                str(existing["id"]) if existing and existing.get("id") else None,
            )
            vid = str(saved.get("id") or row_id)
            vectorize_rows.append({
                "id": vid,
                "values": embedding,
                "metadata": {
                    "workspace_id": config["workspace_key"],
                    "source_ref": source_ref,
                    "skill_id": skill_id,
                    "chunk_index": str(idx),
                    "title": name[:200],
                },
            })
            print(f"  chunk {idx}: Supabase upsert {vid[:8]}…")

    for batch_start in range(0, len(vectorize_rows), VECTORIZE_BATCH):
        batch = vectorize_rows[batch_start : batch_start + VECTORIZE_BATCH]
        vectorize_upsert_batch(config, batch)
        print(f"  Vectorize upserted {len(batch)} vectors")

    d1_execute(
        config,
        """
        UPDATE agentsam_skill
        SET retrieval_strategy = 'vectorize',
            content_markdown = '',
            file_path = ?,
            updated_at = datetime('now')
        WHERE id = ?
          AND retrieval_strategy = 'db'
        """,
        [file_path, skill_id],
    )
    log_vectorize_sync(
        config,
        file_key=r2_key,
        chunk_count=len(chunks),
        token_count=plan["token_estimate"],
        status="ok",
    )
    return {
        "skill_id": skill_id,
        "status": "ok",
        "chunks": len(chunks),
        "tokens": plan["token_estimate"],
        "r2_key": r2_key,
    }


def print_dry_run_summary(plans: list[dict[str, Any]]) -> None:
    total_chunks = sum(p["chunk_count"] for p in plans)
    total_tokens = sum(p["token_estimate"] for p in plans)
    cost_usd = (total_tokens / 1_000_000) * EMBED_COST_PER_M
    print("\n=== DRY RUN — skills to vectorize ===")
    print(f"Threshold: content_markdown > {CONTENT_THRESHOLD} chars")
    print(f"Skills matched: {len(plans)}")
    print(f"Estimated chunks: {total_chunks}")
    print(f"Estimated embed tokens: {total_tokens:,}")
    print(f"Estimated OpenAI embed cost @ ${EMBED_COST_PER_M}/1M: ${cost_usd:.4f}")
    print(f"Supabase table: agentsam.{SUPABASE_TABLE}")
    print(f"Vectorize index: {VECTORIZE_INDEX} ({VECTORIZE_BINDING})")
    print(f"R2 prefix: s3://{R2_BUCKET}/{R2_FOLDER}/")
    print("")
    for p in plans:
        skill = p["skill"]
        sid = skill["id"]
        chars = p["content_chars"]
        te = skill.get("token_estimate")
        print(
            f"  - {sid}: {skill.get('name', sid)!r} | "
            f"{chars:,} chars | ~{p['token_estimate']:,} embed tokens | "
            f"{p['chunk_count']} chunks"
            + (f" | D1 token_estimate={te}" if te else "")
        )
    print("\nNo writes performed (--dry-run).")


def main() -> int:
    parser = argparse.ArgumentParser(description="Vectorize large D1 skills into schema RAG lane")
    parser.add_argument("--dry-run", action="store_true", help="Plan only; no API writes")
    parser.add_argument("--limit", type=int, default=None, help="Process at most N skills")
    parser.add_argument("--skill-id", type=str, default=None, help="Process one skill id")
    args = parser.parse_args()

    assert_repo_root()
    config = env_config(require_all=not args.dry_run)

    if args.dry_run:
        missing = [
            k
            for k, v in {
                "CLOUDFLARE_API_TOKEN": config["cf_token"],
                "CLOUDFLARE_ACCOUNT_ID": config["cf_account_id"],
                "D1_DATABASE_ID": config["d1_database_id"],
            }.items()
            if not v
        ]
        if missing:
            raise SystemExit(f"--dry-run still needs D1 query env: {', '.join(missing)}")
    else:
        if not config["d1_database_id"]:
            raise SystemExit("D1_DATABASE_ID must be set before any write")

    skills = fetch_skills(config, skill_id=args.skill_id, limit=args.limit)
    if not skills:
        print("No skills matched threshold + retrieval_strategy='db'.")
        return 0

    plans = [plan_skill(s) for s in skills]

    if args.dry_run:
        print_dry_run_summary(plans)
        return 0

    workspace_uuid = resolve_workspace_uuid(config)
    ok = 0
    failed = 0
    for plan in plans:
        skill_id = str(plan["skill"]["id"])
        print(f"\n▶ {skill_id} ({plan['chunk_count']} chunks)")
        try:
            result = process_skill(config, workspace_uuid, plan, dry_run=False)
            print(f"  DONE {result['status']} chunks={result.get('chunks')}")
            ok += 1
        except Exception as e:
            failed += 1
            print(f"  ERROR {skill_id}: {e}")
            try:
                log_vectorize_sync(
                    config,
                    file_key=f"{R2_FOLDER}/{skill_id}.md",
                    chunk_count=plan["chunk_count"],
                    token_count=plan["token_estimate"],
                    status=f"error:{str(e)[:120]}",
                )
            except Exception:
                pass

    print(f"\nFinished: ok={ok} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
