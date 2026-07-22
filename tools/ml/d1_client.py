"""
d1_client.py — Cloudflare D1 HTTP API wrapper (tools/ml inside inneranimalmedia).

No hardcoded D1 UUIDs. Bootstrap:
  1. List D1 databases; resolve PLATFORM_D1_NAME → uuid
  2. Query client_apps (SSOT) for per-app d1_databases JSON
  3. Downstream code only ever sees database_id via resolve_* helpers

Matches Workers normalizeD1Databases() shapes:
  - '["uuid"]'
  - '[{"binding":"DB","database_name":"...","database_id":"..."}]'
  - '[{"role":"primary","binding":"DB","database_name":"...","database_id":"..."}]'
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from dotenv import load_dotenv

_ML_ROOT = Path(__file__).resolve().parent
_REPO_ROOT = _ML_ROOT.parent.parent  # tools/ml → repo root
load_dotenv(_ML_ROOT / ".env")
_IAM_ENV = _REPO_ROOT / ".env.cloudflare"
if _IAM_ENV.is_file():
    load_dotenv(_IAM_ENV, override=False)

CF_API_BASE = "https://api.cloudflare.com/client/v4"


class D1Error(RuntimeError):
    pass


def _token() -> str:
    t = (
        os.environ.get("CLOUDFLARE_API_TOKEN")
        or os.environ.get("CF_API_TOKEN")
        or ""
    ).strip()
    if not t:
        raise D1Error("CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) is required")
    return t


def _account_id() -> str:
    a = (
        os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        or os.environ.get("CF_ACCOUNT_ID")
        or ""
    ).strip()
    if not a:
        raise D1Error("CLOUDFLARE_ACCOUNT_ID (or CF_ACCOUNT_ID) is required")
    return a


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Content-Type": "application/json",
    }


# ── D1 list / name resolve (bootstrap, no UUID in code) ─────────────────────

_d1_list_cache: list[dict[str, Any]] | None = None
_d1_list_at = 0.0


def list_d1_databases(*, force: bool = False) -> list[dict[str, Any]]:
    """GET /accounts/{account}/d1/database — cached ~5 min."""
    global _d1_list_cache, _d1_list_at
    if not force and _d1_list_cache is not None and (time.time() - _d1_list_at) < 300:
        return _d1_list_cache

    account = _account_id()
    url = f"{CF_API_BASE}/accounts/{account}/d1/database"
    out: list[dict[str, Any]] = []
    page = 1
    while True:
        r = requests.get(
            url,
            headers=_headers(),
            params={"per_page": 100, "page": page},
            timeout=60,
        )
        data = r.json()
        if not r.ok or data.get("success") is False:
            msg = (data.get("errors") or [{}])[0].get("message") or f"http_{r.status_code}"
            raise D1Error(f"list_d1_databases: {msg}")
        batch = data.get("result") or []
        out.extend(batch)
        info = data.get("result_info") or {}
        total = int(info.get("total_count") or len(out))
        if len(out) >= total or not batch:
            break
        page += 1

    _d1_list_cache = out
    _d1_list_at = time.time()
    return out


def resolve_database_id_by_name(database_name: str) -> str:
    name = (database_name or "").strip()
    if not name:
        raise D1Error("database_name is required")
    for row in list_d1_databases():
        if str(row.get("name") or "").strip() == name:
            uid = str(row.get("uuid") or "").strip()
            if uid:
                return uid
    raise D1Error(f"D1 database not found by name: {name!r}")


def platform_database_id() -> str:
    """Bootstrap DB that holds client_apps (PLATFORM_D1_NAME)."""
    name = (os.environ.get("PLATFORM_D1_NAME") or "inneranimalmedia-business").strip()
    return resolve_database_id_by_name(name)


# ── client_apps SSOT ────────────────────────────────────────────────────────

def normalize_d1_databases(raw: Any) -> list[dict[str, Any]]:
    """Mirror src/core/cms-client-app-resolve.js normalizeD1Databases."""
    if raw is None or raw == "":
        return []
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
    else:
        parsed = raw
    if not isinstance(parsed, list):
        return []

    out: list[dict[str, Any]] = []
    for item in parsed:
        if isinstance(item, str):
            uid = item.strip()
            if uid:
                out.append(
                    {
                        "role": "primary",
                        "binding": "DB",
                        "database_name": None,
                        "database_id": uid,
                    }
                )
            continue
        if not isinstance(item, dict):
            continue
        database_id = str(item.get("database_id") or item.get("id") or "").strip() or None
        database_name = str(item.get("database_name") or item.get("name") or "").strip() or None
        if not database_id and not database_name:
            continue
        out.append(
            {
                "role": str(item.get("role") or "primary").strip() or "primary",
                "binding": str(item.get("binding") or "DB").strip() or "DB",
                "database_name": database_name,
                "database_id": database_id,
            }
        )
    return out


def get_client_app(app_key: str, *, database_id: str | None = None) -> dict[str, Any] | None:
    key = (app_key or "").strip()
    if not key:
        return None
    db_id = database_id or platform_database_id()
    df = query_d1(
        db_id,
        """
        SELECT id, client_id, app_key, display_name, status, d1_databases,
               r2_buckets, github_repository, metadata_json, tenant_id
          FROM client_apps
         WHERE app_key = ? AND COALESCE(status, 'active') = 'active'
         LIMIT 1
        """,
        [key],
    )
    if df.empty:
        return None
    row = df.iloc[0].to_dict()
    row["d1_databases"] = normalize_d1_databases(row.get("d1_databases"))
    return row


def resolve_app_database_id(
    app_key: str,
    *,
    role: str = "primary",
    platform_db_id: str | None = None,
) -> str:
    """Resolve a client app's D1 uuid from client_apps (SSOT)."""
    app = get_client_app(app_key, database_id=platform_db_id)
    if not app:
        raise D1Error(f"No active client_apps row for app_key={app_key!r}")

    dbs = app.get("d1_databases") or []
    if not dbs:
        raise D1Error(f"client_apps.app_key={app_key!r} has empty d1_databases")

    want = (role or "primary").strip() or "primary"
    pick = next((d for d in dbs if (d.get("role") or "primary") == want), None) or dbs[0]

    uid = (pick.get("database_id") or "").strip()
    if uid:
        return uid
    name = (pick.get("database_name") or "").strip()
    if name:
        return resolve_database_id_by_name(name)
    raise D1Error(f"Could not resolve D1 id for app_key={app_key!r}")


def list_active_apps_with_d1(*, platform_db_id: str | None = None) -> list[dict[str, Any]]:
    db_id = platform_db_id or platform_database_id()
    df = query_d1(
        db_id,
        """
        SELECT app_key, display_name, d1_databases, client_id
          FROM client_apps
         WHERE COALESCE(status, 'active') = 'active'
           AND d1_databases IS NOT NULL
           AND TRIM(d1_databases) NOT IN ('', '[]', 'null')
         ORDER BY app_key
        """,
    )
    rows: list[dict[str, Any]] = []
    for _, r in df.iterrows():
        dbs = normalize_d1_databases(r.get("d1_databases"))
        if not dbs:
            continue
        rows.append(
            {
                "app_key": r["app_key"],
                "display_name": r["display_name"],
                "client_id": r.get("client_id"),
                "d1_databases": dbs,
            }
        )
    return rows


# ── Query ───────────────────────────────────────────────────────────────────

def query_d1(
    database_id: str,
    sql: str,
    params: list[Any] | None = None,
) -> pd.DataFrame:
    """
    POST .../d1/database/{database_id}/query → DataFrame of result rows.
    Single place to fix if the API shape changes.
    """
    uid = (database_id or "").strip()
    if not uid:
        raise D1Error("database_id is required")

    account = _account_id()
    url = f"{CF_API_BASE}/accounts/{account}/d1/database/{uid}/query"
    body: dict[str, Any] = {"sql": str(sql or "")}
    if params is not None:
        body["params"] = list(params)

    r = requests.post(url, headers=_headers(), json=body, timeout=120)
    data = r.json()
    if not r.ok or data.get("success") is False:
        msg = (data.get("errors") or [{}])[0].get("message") or f"http_{r.status_code}"
        raise D1Error(f"query_d1: {msg}")

    batch = data.get("result")
    if isinstance(batch, list):
        batch = batch[0] if batch else {}
    rows = (batch or {}).get("results") or (batch or {}).get("rows") or []
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


def execute_d1(
    database_id: str,
    sql: str,
    params: list[Any] | None = None,
) -> dict[str, Any]:
    """Run a statement; return Cloudflare result meta (for INSERT/CREATE)."""
    uid = (database_id or "").strip()
    if not uid:
        raise D1Error("database_id is required")

    account = _account_id()
    url = f"{CF_API_BASE}/accounts/{account}/d1/database/{uid}/query"
    body: dict[str, Any] = {"sql": str(sql or "")}
    if params is not None:
        body["params"] = list(params)

    r = requests.post(url, headers=_headers(), json=body, timeout=120)
    data = r.json()
    if not r.ok or data.get("success") is False:
        msg = (data.get("errors") or [{}])[0].get("message") or f"http_{r.status_code}"
        raise D1Error(f"execute_d1: {msg}")

    batch = data.get("result")
    if isinstance(batch, list):
        batch = batch[0] if batch else {}
    return batch or {}
