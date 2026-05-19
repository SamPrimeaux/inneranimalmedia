#!/usr/bin/env python3
"""
audit_auth_oauth_platform_alignment.py

Read-only D1 audit for auth_users + auth_sessions + user_oauth_tokens + integration_registry.

Goals:
- Verify Sam/info@inneranimals.com identity alignment.
- Find Connor by email/name/display/user_key containing "connor".
- Check platform-wide sustainability for many users/workspaces.
- Avoid assuming optional columns exist.
- Mask secrets/tokens/encrypted values.

No writes. No mutations.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from datetime import datetime, timezone

DB = "inneranimalmedia-business"
CONFIG = "wrangler.production.toml"
OUT_DIR = Path("artifacts/auth_identity_alignment")
OUT_DIR.mkdir(parents=True, exist_ok=True)

TARGET_EMAILS = ["info@inneranimals.com"]
TARGET_NAME_PATTERNS = ["connor"]

SENSITIVE_RE = re.compile(r"(token|secret|password|key|private|encrypted|hash)", re.I)

def run_sql(sql: str):
    cmd = [
        "./scripts/with-cloudflare-env.sh",
        "npx", "wrangler", "d1", "execute", DB,
        "--remote",
        "-c", CONFIG,
        "--json",
        "--command", sql,
    ]
    p = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        return {"ok": False, "sql": sql, "stderr": p.stderr, "stdout": p.stdout}
    try:
        return {"ok": True, "data": json.loads(p.stdout)}
    except Exception as e:
        return {"ok": False, "sql": sql, "stderr": f"json parse failed: {e}", "stdout": p.stdout}

def results(resp):
    if not resp.get("ok"):
        return []
    data = resp.get("data")
    if isinstance(data, list) and data:
        return data[0].get("results") or []
    return []

def q(s: str) -> str:
    return "'" + str(s).replace("'", "''") + "'"

def table_exists(name: str) -> bool:
    return bool(results(run_sql(f"SELECT name FROM sqlite_master WHERE type='table' AND name={q(name)} LIMIT 1;")))

def columns(table: str) -> list[str]:
    if not table_exists(table):
        return []
    return [r["name"] for r in results(run_sql(f"PRAGMA table_info({table});")) if "name" in r]

def mask_row(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if SENSITIVE_RE.search(k):
            out[k] = None if v in (None, "") else "[PRESENT_MASKED]"
        else:
            out[k] = v
    return out

def select_existing(table: str, wanted_cols: list[str], where_sql: str, limit: int = 100):
    if not table_exists(table):
        return {"table": table, "exists": False, "rows": []}

    cols = columns(table)
    selected = [c for c in wanted_cols if c in cols]
    if not selected:
        selected = cols[:25]

    sql = f"""
SELECT {", ".join(selected)}
FROM {table}
WHERE {where_sql}
LIMIT {limit};
"""
    resp = run_sql(sql)
    return {
        "table": table,
        "exists": True,
        "selected_columns": selected,
        "columns": cols,
        "ok": resp.get("ok"),
        "error": None if resp.get("ok") else resp,
        "rows": [mask_row(r) for r in results(resp)],
    }

def in_list(values: list[str]) -> str:
    vals = [v for v in values if v]
    return "(" + ",".join(q(v) for v in vals) + ")" if vals else "('__NO_MATCH__')"

def first_existing(cols: list[str], options: list[str]) -> list[str]:
    return [c for c in options if c in cols]

def discover_target_users():
    auth_cols = columns("auth_users")
    if not auth_cols:
        return []

    clauses = []
    if "email" in auth_cols:
        for email in TARGET_EMAILS:
            clauses.append(f"LOWER(COALESCE(email,'')) = LOWER({q(email)})")

    for pat in TARGET_NAME_PATTERNS:
        like = q(f"%{pat}%")
        for col in ["email", "name", "display_name", "user_key", "id"]:
            if col in auth_cols:
                clauses.append(f"LOWER(COALESCE({col},'')) LIKE LOWER({like})")

    wanted = first_existing(auth_cols, [
        "id", "email", "name", "display_name", "user_key",
        "tenant_id", "active_tenant_id", "active_workspace_id", "default_workspace_id",
        "person_uuid", "supabase_user_id", "status", "is_superadmin",
        "last_login_at", "login_count", "created_at", "updated_at"
    ])

    sql = f"""
SELECT {", ".join(wanted)}
FROM auth_users
WHERE {" OR ".join(clauses) if clauses else "0"}
ORDER BY email, created_at DESC;
"""
    return [mask_row(r) for r in results(run_sql(sql))]

target_users = discover_target_users()
target_user_ids = sorted({str(r.get("id")) for r in target_users if r.get("id")})
target_emails = sorted({str(r.get("email")).lower() for r in target_users if r.get("email")})
target_person_uuids = sorted({str(r.get("person_uuid")) for r in target_users if r.get("person_uuid")})
target_supabase_ids = sorted({str(r.get("supabase_user_id")) for r in target_users if r.get("supabase_user_id")})
target_tenants = sorted({str(r.get("active_tenant_id") or r.get("tenant_id")) for r in target_users if r.get("active_tenant_id") or r.get("tenant_id")})
target_workspaces = sorted({str(r.get("active_workspace_id") or r.get("default_workspace_id")) for r in target_users if r.get("active_workspace_id") or r.get("default_workspace_id")})

uid_in = in_list(target_user_ids)
email_in = in_list(target_emails)
person_in = in_list(target_person_uuids)
supabase_in = in_list(target_supabase_ids)
tenant_in = in_list(target_tenants)
workspace_in = in_list(target_workspaces)

known_sections = []

known_sections.append({
    "table": "auth_users",
    "exists": table_exists("auth_users"),
    "rows": target_users,
})

known_specs = [
    ("auth_sessions", [
        "id", "user_id", "email", "tenant_id", "workspace_id", "person_uuid",
        "supabase_user_id", "provider", "provider_subject", "display_name",
        "avatar_url", "work_session_id", "expires_at", "created_at",
        "last_active_at", "revoked_at", "revoke_reason"
    ], f"user_id IN {uid_in} OR LOWER(COALESCE(email,'')) IN {email_in} OR person_uuid IN {person_in} OR supabase_user_id IN {supabase_in}"),

    ("user_oauth_tokens", [
        "user_id", "tenant_id", "workspace_id", "person_uuid", "provider",
        "account_identifier", "account_email", "account_display", "scope", "scopes",
        "expires_at", "created_at", "updated_at",
        "access_token", "refresh_token", "access_token_encrypted", "refresh_token_encrypted",
        "vault_access_token_id", "vault_refresh_token_id"
    ], f"user_id IN {uid_in} OR person_uuid IN {person_in} OR LOWER(COALESCE(account_email,'')) IN {email_in} OR LOWER(COALESCE(account_identifier,'')) IN {email_in}"),

    ("integration_registry", [
        "id", "tenant_id", "workspace_id", "user_id", "provider_key", "provider",
        "status", "connected", "account_identifier", "account_email", "account_display",
        "created_at", "updated_at", "last_checked_at"
    ], f"tenant_id IN {tenant_in} OR workspace_id IN {workspace_in} OR user_id IN {uid_in}"),

    ("workspace_members", [
        "id", "user_id", "tenant_id", "workspace_id", "person_uuid", "role", "status",
        "created_at", "updated_at"
    ], f"user_id IN {uid_in} OR person_uuid IN {person_in}"),

    ("workspaces", [
        "id", "tenant_id", "name", "slug", "status", "created_at", "updated_at"
    ], f"id IN {workspace_in} OR tenant_id IN {tenant_in}"),

    ("user_api_keys", [
        "id", "user_id", "tenant_id", "workspace_id", "person_uuid", "provider",
        "key_name", "status", "created_at", "updated_at", "last_used_at"
    ], f"user_id IN {uid_in} OR person_uuid IN {person_in} OR tenant_id IN {tenant_in}"),

    ("user_secrets", [
        "id", "user_id", "tenant_id", "workspace_id", "person_uuid", "provider",
        "secret_name", "created_at", "updated_at", "secret_value", "secret_value_encrypted"
    ], f"user_id IN {uid_in} OR person_uuid IN {person_in} OR tenant_id IN {tenant_in}"),

    ("auth_user_identities", [
        "id", "user_id", "provider", "provider_subject", "email", "created_at", "updated_at"
    ], f"user_id IN {uid_in} OR LOWER(COALESCE(email,'')) IN {email_in} OR provider_subject IN {supabase_in}"),

    ("work_sessions", [
        "session_id", "user_id", "tenant_id", "workspace_id", "person_uuid",
        "started_at", "last_activity_at", "project_context", "page_context"
    ], f"user_id IN {uid_in} OR person_uuid IN {person_in} OR tenant_id IN {tenant_in}"),
]

for table, wanted, where in known_specs:
    known_sections.append(select_existing(table, wanted, where, 200))

# Platform-wide summaries with schema checks.
platform = {}

def add_summary(name, sql):
    platform[name] = {
        "ok": None,
        "rows": [],
        "error": None,
    }
    resp = run_sql(sql)
    platform[name]["ok"] = resp.get("ok")
    if resp.get("ok"):
        platform[name]["rows"] = [mask_row(r) for r in results(resp)]
    else:
        platform[name]["error"] = resp

if table_exists("auth_users"):
    add_summary("auth_users_health", """
SELECT
  COUNT(*) AS total_users,
  SUM(CASE WHEN id NOT LIKE 'au_%' THEN 1 ELSE 0 END) AS non_au_ids,
  SUM(CASE WHEN email IS NULL OR TRIM(COALESCE(email,''))='' THEN 1 ELSE 0 END) AS missing_email,
  SUM(CASE WHEN tenant_id IS NULL OR TRIM(COALESCE(tenant_id,''))='' THEN 1 ELSE 0 END) AS missing_tenant,
  SUM(CASE WHEN person_uuid IS NULL OR TRIM(COALESCE(person_uuid,''))='' THEN 1 ELSE 0 END) AS missing_person_uuid,
  SUM(CASE WHEN status IS NOT NULL AND status != 'active' THEN 1 ELSE 0 END) AS non_active_users
FROM auth_users;
""")

if table_exists("auth_sessions"):
    add_summary("auth_sessions_health", """
SELECT
  COUNT(*) AS total_sessions,
  SUM(CASE WHEN revoked_at IS NULL OR TRIM(COALESCE(revoked_at,''))='' THEN 1 ELSE 0 END) AS active_sessions,
  SUM(CASE WHEN user_id IS NULL OR TRIM(COALESCE(user_id,''))='' THEN 1 ELSE 0 END) AS missing_user_id,
  SUM(CASE WHEN user_id NOT LIKE 'au_%' THEN 1 ELSE 0 END) AS non_au_user_id,
  SUM(CASE WHEN tenant_id IS NULL OR TRIM(COALESCE(tenant_id,''))='' THEN 1 ELSE 0 END) AS missing_tenant,
  SUM(CASE WHEN person_uuid IS NULL OR TRIM(COALESCE(person_uuid,''))='' THEN 1 ELSE 0 END) AS missing_person_uuid,
  SUM(CASE WHEN email IS NULL OR TRIM(COALESCE(email,''))='' THEN 1 ELSE 0 END) AS missing_email
FROM auth_sessions;
""")
    add_summary("active_auth_sessions_health", """
SELECT
  COUNT(*) AS active_sessions,
  SUM(CASE WHEN user_id IS NULL OR TRIM(COALESCE(user_id,''))='' THEN 1 ELSE 0 END) AS missing_user_id,
  SUM(CASE WHEN user_id NOT LIKE 'au_%' THEN 1 ELSE 0 END) AS non_au_user_id,
  SUM(CASE WHEN tenant_id IS NULL OR TRIM(COALESCE(tenant_id,''))='' THEN 1 ELSE 0 END) AS missing_tenant,
  SUM(CASE WHEN person_uuid IS NULL OR TRIM(COALESCE(person_uuid,''))='' THEN 1 ELSE 0 END) AS missing_person_uuid,
  SUM(CASE WHEN email IS NULL OR TRIM(COALESCE(email,''))='' THEN 1 ELSE 0 END) AS missing_email,
  SUM(CASE WHEN workspace_id IS NULL OR TRIM(COALESCE(workspace_id,''))='' THEN 1 ELSE 0 END) AS missing_workspace
FROM auth_sessions
WHERE revoked_at IS NULL OR TRIM(COALESCE(revoked_at,''))='';
""")

if table_exists("user_oauth_tokens"):
    add_summary("user_oauth_tokens_health", """
SELECT
  COUNT(*) AS total_tokens,
  SUM(CASE WHEN user_id IS NULL OR TRIM(COALESCE(user_id,''))='' THEN 1 ELSE 0 END) AS missing_user_id,
  SUM(CASE WHEN user_id NOT LIKE 'au_%' THEN 1 ELSE 0 END) AS non_au_user_id,
  SUM(CASE WHEN tenant_id IS NULL OR TRIM(COALESCE(tenant_id,''))='' THEN 1 ELSE 0 END) AS missing_tenant,
  SUM(CASE WHEN person_uuid IS NULL OR TRIM(COALESCE(person_uuid,''))='' THEN 1 ELSE 0 END) AS missing_person_uuid,
  SUM(CASE WHEN provider IS NULL OR TRIM(COALESCE(provider,''))='' THEN 1 ELSE 0 END) AS missing_provider,
  SUM(CASE WHEN (access_token IS NULL OR TRIM(COALESCE(access_token,''))='')
            AND (access_token_encrypted IS NULL OR TRIM(COALESCE(access_token_encrypted,''))='')
            AND (vault_access_token_id IS NULL OR TRIM(COALESCE(vault_access_token_id,''))='')
           THEN 1 ELSE 0 END) AS missing_access_material
FROM user_oauth_tokens;
""")
    add_summary("oauth_tokens_by_provider", """
SELECT
  provider,
  COUNT(*) AS rows,
  SUM(CASE WHEN user_id LIKE 'au_%' THEN 1 ELSE 0 END) AS au_owned,
  SUM(CASE WHEN user_id NOT LIKE 'au_%' THEN 1 ELSE 0 END) AS non_au_owned,
  SUM(CASE WHEN access_token_encrypted IS NOT NULL AND TRIM(COALESCE(access_token_encrypted,''))!='' THEN 1 ELSE 0 END) AS encrypted_rows,
  SUM(CASE WHEN access_token IS NOT NULL AND TRIM(COALESCE(access_token,''))!='' THEN 1 ELSE 0 END) AS plaintext_rows
FROM user_oauth_tokens
GROUP BY provider
ORDER BY rows DESC;
""")

if table_exists("integration_registry"):
    add_summary("integration_registry_by_provider", """
SELECT
  provider_key,
  COUNT(*) AS rows,
  COUNT(DISTINCT tenant_id) AS tenants,
  COUNT(DISTINCT workspace_id) AS workspaces
FROM integration_registry
GROUP BY provider_key
ORDER BY rows DESC;
""")

# Broad identity matches for target users.
all_tables = [r["name"] for r in results(run_sql("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"))]
identity_cols = {
    "user_id", "auth_user_id", "owner_user_id", "created_by", "updated_by",
    "email", "account_email", "account_identifier", "person_uuid",
    "supabase_user_id", "provider_subject", "tenant_id", "workspace_id"
}
broad_matches = []

for table in all_tables:
    cols = columns(table)
    relevant = [c for c in cols if c in identity_cols]
    if not relevant:
        continue

    conditions = []
    for col in ["user_id", "auth_user_id", "owner_user_id", "created_by", "updated_by"]:
        if col in cols and target_user_ids:
            conditions.append(f"{col} IN {uid_in}")
    for col in ["email", "account_email", "account_identifier"]:
        if col in cols and target_emails:
            conditions.append(f"LOWER(COALESCE({col},'')) IN {email_in}")
    if "person_uuid" in cols and target_person_uuids:
        conditions.append(f"person_uuid IN {person_in}")
    if "supabase_user_id" in cols and target_supabase_ids:
        conditions.append(f"supabase_user_id IN {supabase_in}")
    if "provider_subject" in cols and target_supabase_ids:
        conditions.append(f"provider_subject IN {supabase_in}")

    if not conditions:
        continue

    selected = [c for c in [
        "id", "session_id", "user_id", "auth_user_id", "owner_user_id",
        "email", "account_email", "account_identifier",
        "tenant_id", "workspace_id", "person_uuid", "supabase_user_id",
        "provider", "provider_key", "provider_subject", "status",
        "created_at", "updated_at", "last_active_at", "revoked_at"
    ] if c in cols]

    if not selected:
        continue

    sql = f"SELECT {', '.join(selected)} FROM {table} WHERE {' OR '.join(conditions)} LIMIT 50;"
    resp = run_sql(sql)
    rows = [mask_row(r) for r in results(resp)]
    if rows:
        broad_matches.append({
            "table": table,
            "matched_columns": relevant,
            "selected_columns": selected,
            "rows": rows,
        })

report = {
    "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "target_emails": TARGET_EMAILS,
    "target_name_patterns": TARGET_NAME_PATTERNS,
    "target_user_ids": target_user_ids,
    "target_emails_found": target_emails,
    "target_person_uuids": target_person_uuids,
    "target_supabase_ids": target_supabase_ids,
    "target_tenants": target_tenants,
    "target_workspaces": target_workspaces,
    "known_sections": known_sections,
    "platform": platform,
    "broad_identity_matches": broad_matches,
}

json_path = OUT_DIR / "platform_auth_oauth_alignment.json"
md_path = OUT_DIR / "platform_auth_oauth_alignment.md"

json_path.write_text(json.dumps(report, indent=2))

lines = []
lines.append("# Platform Auth/OAuth Alignment Audit")
lines.append("")
lines.append(f"Generated: {report['generated_at']}")
lines.append("")
lines.append("## Target Users")
lines.append("")
lines.append(f"- target_user_ids: `{', '.join(target_user_ids) or 'NONE'}`")
lines.append(f"- target_emails_found: `{', '.join(target_emails) or 'NONE'}`")
lines.append(f"- target_person_uuids: `{', '.join(target_person_uuids) or 'NONE'}`")
lines.append(f"- target_tenants: `{', '.join(target_tenants) or 'NONE'}`")
lines.append("")
lines.append("## Platform Health")
for name, sec in platform.items():
    lines.append(f"\n### {name}")
    lines.append("```json")
    lines.append(json.dumps(sec.get("rows", sec), indent=2))
    lines.append("```")
lines.append("\n## Known Sections")
for sec in known_sections:
    lines.append(f"\n### {sec['table']}")
    lines.append(f"- exists: `{sec.get('exists')}`")
    lines.append(f"- rows: `{len(sec.get('rows', []))}`")
    lines.append("```json")
    lines.append(json.dumps(sec.get("rows", []), indent=2))
    lines.append("```")
lines.append("\n## Broad Identity Matches")
for sec in broad_matches:
    lines.append(f"\n### {sec['table']}")
    lines.append(f"- matched_columns: `{', '.join(sec.get('matched_columns', []))}`")
    lines.append(f"- rows: `{len(sec.get('rows', []))}`")
    lines.append("```json")
    lines.append(json.dumps(sec.get("rows", []), indent=2))
    lines.append("```")

md_path.write_text("\n".join(lines))

print(f"wrote {json_path}")
print(f"wrote {md_path}")
