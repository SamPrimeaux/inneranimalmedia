#!/usr/bin/env python3
import json
import re
import subprocess
from pathlib import Path
from datetime import datetime, timezone

EMAIL = "info@inneranimals.com"
DB = "inneranimalmedia-business"
CONFIG = "wrangler.production.toml"
OUT_DIR = Path("artifacts/auth_identity_alignment")
OUT_DIR.mkdir(parents=True, exist_ok=True)

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
        data = json.loads(p.stdout)
        return {"ok": True, "data": data}
    except Exception as e:
        return {"ok": False, "sql": sql, "stderr": f"json parse failed: {e}", "stdout": p.stdout}

def results(resp):
    if not resp.get("ok"):
        return []
    data = resp.get("data")
    if isinstance(data, list) and data:
        return data[0].get("results") or []
    return []

def q(s):
    return "'" + str(s).replace("'", "''") + "'"

def table_exists(name):
    r = results(run_sql(f"SELECT name FROM sqlite_master WHERE type='table' AND name={q(name)} LIMIT 1;"))
    return bool(r)

def columns(table):
    r = results(run_sql(f"PRAGMA table_info({table});"))
    return [x["name"] for x in r if "name" in x]

def mask_row(row):
    out = {}
    for k, v in row.items():
        if SENSITIVE_RE.search(k):
            if v is None or v == "":
                out[k] = None
            else:
                out[k] = "[PRESENT_MASKED]"
        else:
            out[k] = v
    return out

def select_existing(table, wanted_cols, where_sql, limit=50):
    if not table_exists(table):
        return {"table": table, "exists": False, "rows": []}
    cols = columns(table)
    selected = [c for c in wanted_cols if c in cols]
    if not selected:
        selected = cols[:20]
    sql = f"""
SELECT {", ".join(selected)}
FROM {table}
WHERE {where_sql}
LIMIT {limit};
"""
    r = results(run_sql(sql))
    return {"table": table, "exists": True, "columns": cols, "selected_columns": selected, "rows": [mask_row(x) for x in r]}

# 1. canonical auth user(s)
auth_user_cols = columns("auth_users") if table_exists("auth_users") else []
auth_user_wanted = [
    "id", "email", "tenant_id", "active_workspace_id", "workspace_id",
    "person_uuid", "supabase_user_id", "name", "display_name",
    "is_superadmin", "created_at", "updated_at"
]
auth_users = select_existing(
    "auth_users",
    auth_user_wanted,
    f"LOWER(COALESCE(email,'')) = LOWER({q(EMAIL)})",
    20,
)

user_ids = sorted({str(r.get("id")) for r in auth_users["rows"] if r.get("id")})
person_uuids = sorted({str(r.get("person_uuid")) for r in auth_users["rows"] if r.get("person_uuid")})
supabase_user_ids = sorted({str(r.get("supabase_user_id")) for r in auth_users["rows"] if r.get("supabase_user_id")})
tenant_ids = sorted({str(r.get("tenant_id")) for r in auth_users["rows"] if r.get("tenant_id")})
workspace_ids = sorted({
    str(r.get("active_workspace_id") or r.get("workspace_id"))
    for r in auth_users["rows"]
    if r.get("active_workspace_id") or r.get("workspace_id")
})

def in_list(values):
    return "(" + ",".join(q(v) for v in values) + ")" if values else "('__NO_MATCH__')"

uid_in = in_list(user_ids)
person_in = in_list(person_uuids)
supabase_in = in_list(supabase_user_ids)
email_q = q(EMAIL)

sections = []
sections.append(auth_users)

# 2. high-value known identity tables, schema-aware
known_specs = [
    ("auth_sessions", [
        "id", "user_id", "email", "tenant_id", "workspace_id", "person_uuid",
        "supabase_user_id", "provider", "provider_subject", "work_session_id",
        "expires_at", "created_at", "last_active_at", "revoked_at", "revoke_reason"
    ], f"user_id IN {uid_in} OR LOWER(COALESCE(email,'')) = LOWER({email_q}) OR person_uuid IN {person_in} OR supabase_user_id IN {supabase_in}"),

    ("user_oauth_tokens", [
        "user_id", "tenant_id", "workspace_id", "person_uuid", "provider",
        "account_identifier", "account_email", "account_display", "scope", "scopes",
        "expires_at", "created_at", "updated_at",
        "access_token", "refresh_token", "access_token_encrypted", "refresh_token_encrypted"
    ], f"user_id IN {uid_in} OR person_uuid IN {person_in} OR LOWER(COALESCE(account_email,'')) = LOWER({email_q}) OR LOWER(COALESCE(account_identifier,'')) = LOWER({email_q})"),

    ("workspace_members", [
        "id", "user_id", "tenant_id", "workspace_id", "person_uuid", "role", "created_at", "updated_at"
    ], f"user_id IN {uid_in} OR person_uuid IN {person_in}"),

    ("workspaces", [
        "id", "tenant_id", "name", "slug", "created_at", "updated_at"
    ], "1=1"),

    ("user_api_keys", [
        "id", "user_id", "tenant_id", "workspace_id", "person_uuid", "provider",
        "key_name", "status", "created_at", "updated_at", "last_used_at"
    ], f"user_id IN {uid_in} OR person_uuid IN {person_in}"),

    ("user_secrets", [
        "id", "user_id", "tenant_id", "workspace_id", "person_uuid", "provider",
        "secret_name", "created_at", "updated_at", "secret_value", "secret_value_encrypted"
    ], f"user_id IN {uid_in} OR person_uuid IN {person_in}"),

    ("auth_user_identities", [
        "id", "user_id", "provider", "provider_subject", "email", "created_at", "updated_at"
    ], f"user_id IN {uid_in} OR LOWER(COALESCE(email,'')) = LOWER({email_q}) OR provider_subject IN {supabase_in}"),

    ("work_sessions", [
        "session_id", "user_id", "tenant_id", "workspace_id", "person_uuid",
        "started_at", "last_activity_at", "project_context", "page_context"
    ], f"user_id IN {uid_in} OR person_uuid IN {person_in}"),
]

for table, wanted, where in known_specs:
    if table == "workspaces":
        # only query workspaces through known memberships/active_workspace_id if possible
        ws_ids = set(workspace_ids)
        if table_exists("workspace_members"):
            wm = select_existing("workspace_members", ["workspace_id"], f"user_id IN {uid_in} OR person_uuid IN {person_in}", 100)
            for r in wm.get("rows", []):
                if r.get("workspace_id"):
                    ws_ids.add(str(r["workspace_id"]))
        where = f"id IN {in_list(sorted(ws_ids))}" if ws_ids else "0"
    sections.append(select_existing(table, wanted, where, 100))

# 3. broad scan: any table with identity-ish columns
all_tables = [r["name"] for r in results(run_sql("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"))]
identity_cols = {
    "user_id", "auth_user_id", "owner_user_id", "created_by", "updated_by",
    "email", "account_email", "account_identifier",
    "person_uuid", "supabase_user_id", "provider_subject",
    "tenant_id", "workspace_id"
}

broad_matches = []
for table in all_tables:
    cols = columns(table)
    relevant = [c for c in cols if c in identity_cols]
    if not relevant:
        continue

    conditions = []
    if "user_id" in cols and user_ids:
        conditions.append(f"user_id IN {uid_in}")
    if "auth_user_id" in cols and user_ids:
        conditions.append(f"auth_user_id IN {uid_in}")
    if "owner_user_id" in cols and user_ids:
        conditions.append(f"owner_user_id IN {uid_in}")
    if "created_by" in cols and user_ids:
        conditions.append(f"created_by IN {uid_in}")
    if "updated_by" in cols and user_ids:
        conditions.append(f"updated_by IN {uid_in}")
    if "email" in cols:
        conditions.append(f"LOWER(COALESCE(email,'')) = LOWER({email_q})")
    if "account_email" in cols:
        conditions.append(f"LOWER(COALESCE(account_email,'')) = LOWER({email_q})")
    if "account_identifier" in cols:
        conditions.append(f"LOWER(COALESCE(account_identifier,'')) = LOWER({email_q})")
    if "person_uuid" in cols and person_uuids:
        conditions.append(f"person_uuid IN {person_in}")
    if "supabase_user_id" in cols and supabase_user_ids:
        conditions.append(f"supabase_user_id IN {supabase_in}")
    if "provider_subject" in cols and supabase_user_ids:
        conditions.append(f"provider_subject IN {supabase_in}")

    if not conditions:
        continue

    selected = [c for c in [
        "id", "session_id", "user_id", "auth_user_id", "owner_user_id", "email",
        "account_email", "account_identifier", "tenant_id", "workspace_id",
        "person_uuid", "supabase_user_id", "provider", "provider_subject",
        "created_at", "updated_at", "last_active_at", "revoked_at"
    ] if c in cols]

    sql = f"SELECT {', '.join(selected)} FROM {table} WHERE {' OR '.join(conditions)} LIMIT 25;"
    resp = run_sql(sql)
    rows = [mask_row(x) for x in results(resp)]
    if rows:
        broad_matches.append({
            "table": table,
            "matched_columns": relevant,
            "selected_columns": selected,
            "rows": rows,
        })

report = {
    "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "target_email": EMAIL,
    "canonical_user_ids": user_ids,
    "person_uuids": person_uuids,
    "supabase_user_ids": supabase_user_ids,
    "tenant_ids": tenant_ids,
    "workspace_ids_from_auth_user": workspace_ids,
    "known_sections": sections,
    "broad_identity_matches": broad_matches,
}

json_path = OUT_DIR / "info_inneranimals_identity_alignment.json"
md_path = OUT_DIR / "info_inneranimals_identity_alignment.md"

json_path.write_text(json.dumps(report, indent=2))

lines = []
lines.append("# Identity Alignment Audit: info@inneranimals.com")
lines.append("")
lines.append(f"Generated: {report['generated_at']}")
lines.append("")
lines.append("## Canonical IDs Found")
lines.append("")
lines.append(f"- auth_users.id: `{', '.join(user_ids) or 'NONE'}`")
lines.append(f"- person_uuid: `{', '.join(person_uuids) or 'NONE'}`")
lines.append(f"- supabase_user_id: `{', '.join(supabase_user_ids) or 'NONE'}`")
lines.append(f"- tenant_id: `{', '.join(tenant_ids) or 'NONE'}`")
lines.append("")
lines.append("## Known Sections")
for sec in sections:
    lines.append(f"\n### {sec['table']}")
    lines.append(f"- exists: `{sec.get('exists')}`")
    lines.append(f"- rows: `{len(sec.get('rows', []))}`")
    lines.append("```json")
    lines.append(json.dumps(sec.get("rows", []), indent=2))
    lines.append("```")
lines.append("\n## Broad Identity Matches")
for m in broad_matches:
    lines.append(f"\n### {m['table']}")
    lines.append(f"- matched_columns: `{', '.join(m['matched_columns'])}`")
    lines.append(f"- rows: `{len(m['rows'])}`")
    lines.append("```json")
    lines.append(json.dumps(m["rows"], indent=2))
    lines.append("```")

md_path.write_text("\n".join(lines))

print(f"wrote {json_path}")
print(f"wrote {md_path}")
