#!/usr/bin/env python3
"""
PY1 — webhook_endpoints -> agentsam_webhooks migration helper

Purpose:
- Pull existing rows from old webhook_endpoints
- Convert them into new agentsam_webhooks registry rows
- Write JSON + SQL artifacts for review
- Optionally apply UPSERTs with --apply

Safe by default:
- Dry run unless --apply is passed
- Does NOT drop old table
- Does NOT delete old rows
- Does NOT modify webhook_endpoints

Expected target table:
agentsam_webhooks = registry/config only:
descriptions, URLs, subscribed events, workflow mapping, provider metadata.
"""

import argparse
import datetime
import json
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_NAME = "inneranimalmedia-business"
WRANGLER_CONFIG = "wrangler.production.toml"

DEFAULT_WORKSPACE_ID = "ws_inneranimalmedia"
DEFAULT_USER_ID = "au_871d920d1233cbd1"

OUT_DIR = Path("artifacts/migrations")
OUT_DIR.mkdir(parents=True, exist_ok=True)

STAMP = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d_%H%M%S")
JSON_OUT = OUT_DIR / f"webhook_endpoints_to_agentsam_webhooks_{STAMP}.json"
SQL_OUT = OUT_DIR / f"webhook_endpoints_to_agentsam_webhooks_{STAMP}.sql"


PROVIDER_MAP = {
    "github": "github",
    "stripe": "stripe",
    "cursor": "cursor",
    "cloudflare": "cloudflare",
    "resend": "resend",
    "supabase": "supabase",
    "vercel": "vercel",
    "custom": "custom",
    "internal": "internal",
    # helpful inferred values if they appear in older rows later
    "anthropic": "anthropic",
    "openai": "openai",
    "google": "google",
    "notion": "notion",
    "figma": "figma",
}


def run_d1(command: str) -> Dict[str, Any]:
    cmd = [
        "npx", "wrangler", "d1", "execute", DB_NAME,
        "--remote",
        "-c", WRANGLER_CONFIG,
        "--json",
        "--command", command,
    ]

    proc = subprocess.run(cmd, capture_output=True, text=True)

    if proc.returncode != 0:
        return {
            "ok": False,
            "command": command,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "data": [],
        }

    try:
        payload = json.loads(proc.stdout)
        rows = []
        for item in payload:
            rows.extend(item.get("results", []))
        return {
            "ok": True,
            "command": command,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "data": rows,
        }
    except Exception as exc:
        return {
            "ok": False,
            "command": command,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "error": str(exc),
            "data": [],
        }


def sql_quote(value: Optional[Any]) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int) or isinstance(value, float):
        return str(value)
    s = str(value)
    return "'" + s.replace("'", "''") + "'"


def table_exists(table: str) -> bool:
    res = run_d1(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name = {sql_quote(table)} LIMIT 1;"
    )
    return bool(res["ok"] and res["data"])


def fetch_table_info(table: str) -> List[Dict[str, Any]]:
    res = run_d1(f"PRAGMA table_info({table});")
    if not res["ok"]:
        raise RuntimeError(f"Failed PRAGMA table_info({table}): {res.get('stderr') or res.get('error')}")
    return res["data"]


def fetch_old_rows() -> List[Dict[str, Any]]:
    res = run_d1("""
      SELECT
        id,
        tenant_id,
        name,
        slug,
        source,
        description,
        endpoint_path,
        secret_hash,
        signature_header,
        signature_algo,
        is_active,
        allowed_events,
        created_at,
        updated_at
      FROM webhook_endpoints
      ORDER BY created_at ASC, slug ASC;
    """)
    if not res["ok"]:
        raise RuntimeError(f"Failed reading webhook_endpoints: {res.get('stderr') or res.get('error')}")
    return res["data"]


def normalize_slug(slug: str) -> str:
    raw = slug or ""
    raw = raw.strip().lower()
    raw = re.sub(r"[^a-z0-9_-]+", "-", raw)
    raw = re.sub(r"-+", "-", raw).strip("-")
    return raw or "legacy-webhook"


def infer_provider(row: Dict[str, Any]) -> str:
    source = str(row.get("source") or "").strip().lower()
    text_blob = " ".join([
        str(row.get("name") or ""),
        str(row.get("slug") or ""),
        str(row.get("description") or ""),
        str(row.get("endpoint_path") or ""),
    ]).lower()

    if "anthropic" in text_blob:
        return "anthropic"
    if "openai" in text_blob:
        return "openai"
    if "github" in text_blob:
        return "github"
    if "stripe" in text_blob:
        return "stripe"
    if "cloudflare" in text_blob:
        return "cloudflare"
    if "supabase" in text_blob:
        return "supabase"
    if "resend" in text_blob:
        return "resend"
    if "cursor" in text_blob:
        return "cursor"
    if "vercel" in text_blob:
        return "vercel"

    return PROVIDER_MAP.get(source, "custom")


def endpoint_to_url(endpoint_path: str) -> str:
    endpoint_path = (endpoint_path or "").strip()

    if endpoint_path.startswith("http://") or endpoint_path.startswith("https://"):
        return endpoint_path

    if not endpoint_path.startswith("/"):
        endpoint_path = "/" + endpoint_path

    return "https://inneranimalmedia.com" + endpoint_path


def safe_json_text(value: Optional[str], fallback: str) -> str:
    if value is None or str(value).strip() == "":
        return fallback

    raw = str(value).strip()

    try:
        parsed = json.loads(raw)
        return json.dumps(parsed, separators=(",", ":"))
    except Exception:
        # preserve unknown legacy value inside metadata-safe wrapper
        return fallback


def infer_workflow_key(provider: str, slug: str, row: Dict[str, Any]) -> Optional[str]:
    text_blob = " ".join([
        provider,
        slug,
        str(row.get("name") or ""),
        str(row.get("description") or ""),
        str(row.get("endpoint_path") or ""),
    ]).lower()

    if provider == "anthropic":
        return "anthropic_managed_agents"
    if provider == "github":
        return "github_webhook_ingest"
    if provider == "stripe":
        return "stripe_webhook_ingest"
    if provider == "cloudflare":
        return "cloudflare_webhook_ingest"
    if provider == "openai":
        return "openai_webhook_ingest"
    if "workflow" in text_blob:
        return "webhook_workflow_ingest"

    return None


def map_row(row: Dict[str, Any]) -> Dict[str, Any]:
    provider = infer_provider(row)
    old_slug = str(row.get("slug") or row.get("name") or row.get("id") or "legacy-webhook")
    slug = normalize_slug(old_slug)

    allowed_events = safe_json_text(row.get("allowed_events"), "[]")

    metadata = {
        "migrated_from": "webhook_endpoints",
        "legacy_id": row.get("id"),
        "legacy_source": row.get("source"),
        "legacy_endpoint_path": row.get("endpoint_path"),
        "legacy_secret_hash_present": bool(row.get("secret_hash")),
        "legacy_created_at": row.get("created_at"),
        "legacy_updated_at": row.get("updated_at"),
        "migration_note": "agentsam_webhooks is registry/config only. Runtime event data belongs in agentsam_webhook_events and rollup tables.",
    }

    provider_webhook_id = None
    desc = str(row.get("description") or "")
    match = re.search(r"\bwep_[A-Za-z0-9]+", desc)
    if match:
        provider_webhook_id = match.group(0)

    mapped = {
        "tenant_id": row.get("tenant_id") or "tenant_sam_primeaux",
        "workspace_id": DEFAULT_WORKSPACE_ID,
        "user_id": DEFAULT_USER_ID,
        "provider": provider,
        "provider_webhook_id": provider_webhook_id,
        "name": row.get("name") or slug,
        "slug": slug,
        "description": row.get("description"),
        "endpoint_url": endpoint_to_url(str(row.get("endpoint_path") or "")),
        "signature_header": row.get("signature_header") or default_signature_header(provider),
        "signature_algo": row.get("signature_algo") or "sha256",
        "is_active": 1 if row.get("is_active") in (1, "1", True, None) else 0,
        "allowed_events": allowed_events,
        "workflow_key": infer_workflow_key(provider, slug, row),
        "metadata_json": json.dumps(metadata, separators=(",", ":")),
    }

    return mapped


def default_signature_header(provider: str) -> str:
    if provider == "anthropic":
        return "anthropic-signature"
    if provider == "stripe":
        return "Stripe-Signature"
    if provider == "github":
        return "X-Hub-Signature-256"
    if provider == "openai":
        return "webhook-signature"
    return "X-Hub-Signature-256"


def build_upsert(row: Dict[str, Any]) -> str:
    cols = [
        "tenant_id",
        "workspace_id",
        "user_id",
        "provider",
        "provider_webhook_id",
        "name",
        "slug",
        "description",
        "endpoint_url",
        "signature_header",
        "signature_algo",
        "is_active",
        "allowed_events",
        "workflow_key",
        "metadata_json",
    ]

    values = ",\n    ".join(sql_quote(row.get(c)) for c in cols)

    updates = [
        "tenant_id = excluded.tenant_id",
        "workspace_id = excluded.workspace_id",
        "user_id = excluded.user_id",
        "provider = excluded.provider",
        "provider_webhook_id = excluded.provider_webhook_id",
        "name = excluded.name",
        "description = excluded.description",
        "endpoint_url = excluded.endpoint_url",
        "signature_header = excluded.signature_header",
        "signature_algo = excluded.signature_algo",
        "is_active = excluded.is_active",
        "allowed_events = excluded.allowed_events",
        "workflow_key = excluded.workflow_key",
        "metadata_json = excluded.metadata_json",
        "updated_at = datetime('now')",
    ]

    return f"""
INSERT INTO agentsam_webhooks (
  {", ".join(cols)}
)
VALUES (
    {values}
)
ON CONFLICT(slug) DO UPDATE SET
  {", ".join(updates)};
""".strip()


def validate_target_table():
    if not table_exists("webhook_endpoints"):
        raise RuntimeError("Missing source table: webhook_endpoints")

    if not table_exists("agentsam_webhooks"):
        raise RuntimeError("Missing target table: agentsam_webhooks")

    target_cols = {row["name"] for row in fetch_table_info("agentsam_webhooks")}
    required = {
        "tenant_id",
        "workspace_id",
        "user_id",
        "provider",
        "provider_webhook_id",
        "name",
        "slug",
        "description",
        "endpoint_url",
        "signature_header",
        "signature_algo",
        "is_active",
        "allowed_events",
        "workflow_key",
        "metadata_json",
    }
    missing = sorted(required - target_cols)
    if missing:
        raise RuntimeError(f"agentsam_webhooks missing expected columns: {', '.join(missing)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually UPSERT rows into agentsam_webhooks.")
    args = parser.parse_args()

    validate_target_table()

    old_rows = fetch_old_rows()
    mapped_rows = [map_row(row) for row in old_rows]
    sql_statements = [build_upsert(row) for row in mapped_rows]

    artifact = {
        "generated_at_utc": datetime.datetime.now(datetime.UTC).isoformat(),
        "mode": "apply" if args.apply else "dry_run",
        "source_table": "webhook_endpoints",
        "target_table": "agentsam_webhooks",
        "row_count": len(mapped_rows),
        "default_workspace_id": DEFAULT_WORKSPACE_ID,
        "default_user_id": DEFAULT_USER_ID,
        "mapped_rows": mapped_rows,
    }

    JSON_OUT.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    SQL_OUT.write_text("\n\n".join(sql_statements) + "\n", encoding="utf-8")

    print(f"Found {len(old_rows)} webhook_endpoints rows.")
    print(f"Wrote JSON review artifact: {JSON_OUT}")
    print(f"Wrote SQL review artifact:  {SQL_OUT}")

    if not args.apply:
        print("")
        print("Dry run only. Review the SQL artifact, then run with --apply to insert/update agentsam_webhooks.")
        return

    applied = 0
    failed = 0

    for stmt in sql_statements:
        res = run_d1(stmt)
        if res["ok"]:
            applied += 1
        else:
            failed += 1
            print("")
            print("FAILED STATEMENT:")
            print(stmt)
            print("STDERR:")
            print(res.get("stderr") or res.get("error"))

    print("")
    print(f"Apply complete. Applied: {applied}. Failed: {failed}.")

    verify = run_d1("""
      SELECT
        provider,
        COUNT(*) AS count
      FROM agentsam_webhooks
      GROUP BY provider
      ORDER BY count DESC, provider ASC;
    """)

    if verify["ok"]:
        print("")
        print("agentsam_webhooks provider counts:")
        for row in verify["data"]:
            print(f"- {row.get('provider')}: {row.get('count')}")


if __name__ == "__main__":
    main()
