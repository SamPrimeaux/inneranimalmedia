#!/usr/bin/env python3
"""
Rotate platform secrets across Wrangler workers + local .env.cloudflare.

Targets:
  - AGENTSAM_BRIDGE_KEY (iam_bk_* + mcp_workspace_tokens hash row)
  - AGENT_SESSION_MINT_SECRET (iam_agent_mint_* + secret_audit_log hash only)

Safety:
- stdlib only
- never print full raw keys after generation
- abort D1 writes unless both Wrangler secret puts succeed for that target
- D1 writes via Cloudflare REST API only
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


CLOUDFLARE_ACCOUNT_ID_DEFAULT = "ede6590ac0d2fb7daf155b35653457b2"
D1_DATABASE_ID_DEFAULT = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"

BRIDGE_TOKEN_LABEL = "Agent Sam Bridge"
REVOKED_BY = "rotate_bridge_key.py"
CREATED_BY = "rotate_bridge_key.py"
BRIDGE_SCOPES_JSON = '["internal","deploy","post_deploy","bridge"]'
BRIDGE_AUDIENCE = "https://inneranimalmedia.com"

EMAIL_SEND_URL = "https://inneranimalmedia.com/api/email/send"
EMAIL_TO = "sam@inneranimalmedia.com"
SECURITY_INCIDENT_HTML = (
    '<p style="color:red;font-weight:bold;">'
    "If you did not trigger this rotation — treat as a "
    "security incident immediately."
    "</p>"
)

# Ops script only — not hot-path identity literals in Worker code.
OPS_TENANT_ID = "tenant_sam_primeaux"
OPS_WORKSPACE_ID = "ws_inneranimalmedia"


def _mask_key(k: str) -> str:
    k = str(k or "")
    if len(k) <= 8:
        return "****"
    return f"{k[:24]}****{k[-8:]}"


def _last4(k: str) -> str:
    k = str(k or "")
    return k[-4:] if len(k) >= 4 else "****"


def _repo_root_guard(repo_root: Path) -> None:
    if not (repo_root / "wrangler.production.toml").exists():
        raise SystemExit("Repo root guard failed: wrangler.production.toml not found (run from repo root).")


def _load_env_file(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}
    out: Dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip("'").strip('"')
        if k:
            out[k] = v
    return out


def _env_get(name: str, fallback: Optional[str], envfile: Dict[str, str]) -> Optional[str]:
    v = os.environ.get(name)
    if v is not None and str(v).strip() != "":
        return str(v).strip()
    if envfile.get(name) is not None and str(envfile[name]).strip() != "":
        return str(envfile[name]).strip()
    return fallback


def _require_env(name: str, value: Optional[str]) -> str:
    if value is None or str(value).strip() == "":
        raise SystemExit(f"Missing required env var: {name}")
    return str(value).strip()


def _run_wrangler_secret_put(
    *,
    cwd: Path,
    config_path: Path,
    secret_name: str,
    new_key: str,
    dry_run: bool,
) -> Tuple[bool, str]:
    cmd = ["npx", "wrangler", "secret", "put", secret_name, "-c", str(config_path)]
    if dry_run:
        return True, f"[dry-run] would run: (in {cwd}) {' '.join(cmd)}"

    try:
        p = subprocess.run(
            cmd,
            input=new_key.encode("utf-8"),
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except FileNotFoundError as e:
        return False, f"wrangler failed to start: {e}"

    if p.returncode != 0:
        return False, f"wrangler exited {p.returncode}: {p.stderr.decode('utf-8', errors='replace')[:2000]}"
    return True, p.stdout.decode("utf-8", errors="replace")[:2000]


def _discover_mcp_repo_config(mcp_repo: Path) -> Path:
    if not mcp_repo.exists() or not mcp_repo.is_dir():
        raise SystemExit(f"MCP repo guard failed: {mcp_repo} not found.")
    for candidate in ("wrangler.toml", "wrangler.jsonc", "wrangler.json"):
        p = mcp_repo / candidate
        if p.exists():
            return p
    raise SystemExit("MCP repo guard failed: no wrangler.toml/jsonc/json found in ~/inneranimalmedia-mcp-server.")


def _cf_d1_query(
    *,
    account_id: str,
    database_id: str,
    api_token: str,
    sql: str,
    params: Optional[List[Any]] = None,
) -> Dict[str, Any]:
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/d1/database/{database_id}/query"
    )
    payload: Dict[str, Any] = {"sql": sql}
    if params is not None:
        payload["params"] = params
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        method="POST",
        data=data,
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else str(e)
        raise SystemExit(f"D1 API HTTP error: {e.code} {e.reason}: {body[:2000]}")
    except Exception as e:
        raise SystemExit(f"D1 API request failed: {e}")

    try:
        j = json.loads(body)
    except Exception:
        raise SystemExit(f"D1 API returned non-JSON: {body[:2000]}")

    if not isinstance(j, dict) or j.get("success") is not True:
        raise SystemExit(f"D1 API returned success=false: {body[:2000]}")
    return j


def _d1_changes_count(d1_json: Dict[str, Any]) -> int:
    meta = d1_json.get("result", [{}])
    if not isinstance(meta, list) or not meta:
        return 0
    first = meta[0]
    if not isinstance(first, dict):
        return 0
    m = first.get("meta")
    if not isinstance(m, dict):
        return 0
    try:
        return int(m.get("changes") or 0)
    except (TypeError, ValueError):
        return 0


def _iso_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _cleanup_nonfatal(
    *,
    account_id: str,
    database_id: str,
    api_token: str,
    sql: str,
    ok_message: str,
    warn_label: str,
) -> int:
    """Run a DELETE cleanup; warn on failure, never abort rotation. Returns rows deleted."""
    try:
        j = _cf_d1_query(
            account_id=account_id,
            database_id=database_id,
            api_token=api_token,
            sql=sql,
        )
        if j.get("success") is not True:
            print(f"⚠ Cleanup ({warn_label}): D1 returned success=false (non-fatal)")
            return 0
        n = _d1_changes_count(j)
        print(ok_message.format(n=n))
        return n
    except SystemExit:
        print(f"⚠ Cleanup ({warn_label}): failed (non-fatal)")
        return 0
    except Exception as e:
        print(f"⚠ Cleanup ({warn_label}): {e} (non-fatal)")
        return 0


def _send_rotation_email(*, internal_secret: Optional[str], subject: str, html_body: str) -> None:
    if not internal_secret or str(internal_secret).strip() == "":
        print("⚠ Email skipped: INTERNAL_API_SECRET not set")
        return
    payload = json.dumps(
        {"to": EMAIL_TO, "subject": subject, "html": html_body},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        EMAIL_SEND_URL,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {str(internal_secret).strip()}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = getattr(resp, "status", 200)
            body = resp.read().decode("utf-8", errors="replace")
            if 200 <= int(status) < 300:
                print(f"✓ Email notification sent → {EMAIL_TO}")
                return
            print(f"⚠ Email notification failed: HTTP {status} {body[:500]}")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else str(e)
        print(f"⚠ Email notification failed: HTTP {e.code} {err_body[:500]}")
    except Exception as e:
        print(f"⚠ Email notification failed: {e}")


def _html_bridge_rotation_email(
    *,
    new_token_id: str,
    old_token_id: str,
    cleanup_count: int,
    iso_timestamp: str,
) -> str:
    return f"""<h2>Bridge Key Rotated</h2>
<table>
  <tr><td>Key</td><td>AGENTSAM_BRIDGE_KEY</td></tr>
  <tr><td>New token ID</td><td>{html.escape(new_token_id)}</td></tr>
  <tr><td>Rotated from</td><td>{html.escape(old_token_id)}</td></tr>
  <tr><td>Workers updated</td><td>inneranimalmedia, inneranimalmedia-mcp-server</td></tr>
  <tr><td>D1 rows cleaned</td><td>{cleanup_count} expired tokens deleted</td></tr>
  <tr><td>Timestamp</td><td>{html.escape(iso_timestamp)}</td></tr>
</table>
{SECURITY_INCIDENT_HTML}"""


def _html_agent_mint_rotation_email(*, cleanup_count: int, iso_timestamp: str) -> str:
    return f"""<h2>Agent Mint Secret Rotated</h2>
<table>
  <tr><td>Key</td><td>AGENT_SESSION_MINT_SECRET</td></tr>
  <tr><td>Agent identity</td><td>ai@inneranimalmedia.com</td></tr>
  <tr><td>Workers updated</td><td>inneranimalmedia, inneranimalmedia-mcp-server</td></tr>
  <tr><td>Audit rows cleaned</td><td>{cleanup_count} expired rows deleted</td></tr>
  <tr><td>Timestamp</td><td>{html.escape(iso_timestamp)}</td></tr>
</table>
{SECURITY_INCIDENT_HTML}"""


def _html_full_rotation_email(
    *,
    bridge: Dict[str, Any],
    agent_mint: Dict[str, Any],
    iso_timestamp: str,
) -> str:
    return f"""<h2>Full Secret Rotation Complete</h2>
<h3>AGENTSAM_BRIDGE_KEY</h3>
<table>
  <tr><td>Key</td><td>AGENTSAM_BRIDGE_KEY</td></tr>
  <tr><td>New token ID</td><td>{html.escape(str(bridge.get("new_token_id") or ""))}</td></tr>
  <tr><td>Rotated from</td><td>{html.escape(str(bridge.get("old_token_id") or ""))}</td></tr>
  <tr><td>Workers updated</td><td>inneranimalmedia, inneranimalmedia-mcp-server</td></tr>
  <tr><td>D1 rows cleaned</td><td>{int(bridge.get("cleanup_count") or 0)} expired tokens deleted</td></tr>
</table>
<h3>AGENT_SESSION_MINT_SECRET</h3>
<table>
  <tr><td>Key</td><td>AGENT_SESSION_MINT_SECRET</td></tr>
  <tr><td>Agent identity</td><td>ai@inneranimalmedia.com</td></tr>
  <tr><td>Workers updated</td><td>inneranimalmedia, inneranimalmedia-mcp-server</td></tr>
  <tr><td>Audit rows cleaned</td><td>{int(agent_mint.get("cleanup_count") or 0)} expired rows deleted</td></tr>
</table>
<p><strong>Timestamp:</strong> {html.escape(iso_timestamp)}</p>
{SECURITY_INCIDENT_HTML}"""


def _cleanup_expired_revoked_tokens(
    *, account_id: str, database_id: str, api_token: str
) -> int:
    return _cleanup_nonfatal(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token,
        sql="""
DELETE FROM mcp_workspace_tokens
WHERE is_active = 0
  AND revoked_at IS NOT NULL
  AND revoked_at < unixepoch() - 7776000
  AND token_type IN ('service', 'agent')
""".strip(),
        ok_message="✓ Cleanup: {n} expired revoked tokens hard deleted",
        warn_label="mcp_workspace_tokens",
    )


def _cleanup_expired_secret_audit_rotations(
    *, account_id: str, database_id: str, api_token: str
) -> int:
    # D1 column is secret_id (not key_name).
    return _cleanup_nonfatal(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token,
        sql="""
DELETE FROM secret_audit_log
WHERE created_at < unixepoch() - 7776000
  AND secret_id = 'AGENT_SESSION_MINT_SECRET'
""".strip(),
        ok_message="✓ Cleanup: {n} expired AGENT_SESSION_MINT_SECRET audit rows hard deleted",
        warn_label="secret_audit_log",
    )


def _pick_first_result_rows(d1_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    r = d1_json.get("result")
    if not isinstance(r, list) or not r:
        return []
    first = r[0]
    if not isinstance(first, dict):
        return []
    rows = first.get("results")
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def _push_both_workers(
    *,
    repo_root: Path,
    mcp_repo: Path,
    mcp_cfg: Path,
    secret_name: str,
    new_key: str,
    dry_run: bool,
) -> Tuple[bool, bool]:
    main_cfg = repo_root / "wrangler.production.toml"
    ok_main, _ = _run_wrangler_secret_put(
        cwd=repo_root, config_path=main_cfg, secret_name=secret_name, new_key=new_key, dry_run=dry_run
    )
    ok_mcp, _ = _run_wrangler_secret_put(
        cwd=mcp_repo, config_path=mcp_cfg, secret_name=secret_name, new_key=new_key, dry_run=dry_run
    )
    return ok_main, ok_mcp


def _update_env_line(env_path: Path, env_key: str, new_value: str, dry_run: bool) -> None:
    line_re = re.compile(rf"^\s*{re.escape(env_key)}\s*=")
    if dry_run:
        return
    existing = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
    lines = existing.splitlines()
    replaced = False
    out_lines: List[str] = []
    for line in lines:
        if line_re.match(line):
            out_lines.append(f"{env_key}={new_value}")
            replaced = True
        else:
            out_lines.append(line)
    if not replaced:
        if out_lines and out_lines[-1].strip() != "":
            out_lines.append("")
        out_lines.append(f"{env_key}={new_value}")
    env_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")


def _select_old_bridge_token(
    *, account_id: str, database_id: str, api_token: str
) -> Optional[Dict[str, str]]:
    sql = """
SELECT id, token_hash, label
FROM mcp_workspace_tokens
WHERE label = ? AND is_active = 1
ORDER BY created_at DESC
LIMIT 1
""".strip()
    j = _cf_d1_query(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token,
        sql=sql,
        params=[BRIDGE_TOKEN_LABEL],
    )
    rows = _pick_first_result_rows(j)
    if not rows:
        return None
    row = rows[0]
    return {
        "id": str(row.get("id") or "").strip(),
        "token_hash": str(row.get("token_hash") or "").strip(),
        "label": str(row.get("label") or "").strip(),
    }


def _rotate_bridge_tokens_transaction(
    *,
    account_id: str,
    database_id: str,
    api_token: str,
    new_hash: str,
    old_id: Optional[str],
) -> str:
    if old_id:
        sql = f"""
BEGIN IMMEDIATE;
UPDATE mcp_workspace_tokens
SET is_active = 0,
    revoked_at = unixepoch(),
    revoked_by = '{REVOKED_BY}'
WHERE id = ?;

INSERT INTO mcp_workspace_tokens (
  id,
  workspace_id,
  tenant_id,
  label,
  token_hash,
  token_type,
  is_active,
  rotated_from,
  created_by,
  scopes_json,
  audience,
  created_at
) VALUES (
  'tok_iam_bridge_' || substr(hex(randomblob(6)),1,12),
  ?,
  ?,
  '{BRIDGE_TOKEN_LABEL}',
  ?,
  'service',
  1,
  ?,
  '{CREATED_BY}',
  '{BRIDGE_SCOPES_JSON}',
  '{BRIDGE_AUDIENCE}',
  unixepoch()
)
RETURNING id;
COMMIT;
""".strip()
        params: List[Any] = [old_id, OPS_WORKSPACE_ID, OPS_TENANT_ID, new_hash, old_id]
    else:
        sql = f"""
BEGIN IMMEDIATE;
INSERT INTO mcp_workspace_tokens (
  id,
  workspace_id,
  tenant_id,
  label,
  token_hash,
  token_type,
  is_active,
  rotated_from,
  created_by,
  scopes_json,
  audience,
  created_at
) VALUES (
  'tok_iam_bridge_' || substr(hex(randomblob(6)),1,12),
  ?,
  ?,
  '{BRIDGE_TOKEN_LABEL}',
  ?,
  'service',
  1,
  NULL,
  '{CREATED_BY}',
  '{BRIDGE_SCOPES_JSON}',
  '{BRIDGE_AUDIENCE}',
  unixepoch()
)
RETURNING id;
COMMIT;
""".strip()
        params = [OPS_WORKSPACE_ID, OPS_TENANT_ID, new_hash]

    j = _cf_d1_query(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token,
        sql=sql,
        params=params,
    )
    rows = _pick_first_result_rows(j)
    if not rows or not rows[0].get("id"):
        raise SystemExit("D1 bridge rotation failed: INSERT did not return id.")
    return str(rows[0]["id"]).strip()


def _log_agent_mint_rotation_audit(
    *,
    account_id: str,
    database_id: str,
    api_token: str,
    new_hash: str,
    new_last4: str,
    previous_hash: Optional[str],
    previous_last4: Optional[str],
) -> str:
    audit_id = f"saudit_rot_{secrets.token_hex(6)}"
    notes = json.dumps(
        {
            "secret": "AGENT_SESSION_MINT_SECRET",
            "key_hash_sha256": new_hash,
            "previous_key_hash_sha256": previous_hash,
            "rotated_by": REVOKED_BY,
            "timestamp_ms": int(time.time() * 1000),
        },
        separators=(",", ":"),
    )
    sql = """
INSERT INTO secret_audit_log (
  id,
  secret_id,
  secret_source,
  tenant_id,
  user_id,
  event_type,
  triggered_by,
  previous_last4,
  new_last4,
  notes,
  created_at
) VALUES (
  ?,
  'AGENT_SESSION_MINT_SECRET',
  'wrangler_secret',
  ?,
  NULL,
  'rotation',
  ?,
  ?,
  ?,
  ?,
  unixepoch()
);
""".strip()
    _cf_d1_query(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token,
        sql=sql,
        params=[
            audit_id,
            OPS_TENANT_ID,
            CREATED_BY,
            previous_last4,
            new_last4,
            notes,
        ],
    )
    return audit_id


def _fetch_previous_mint_hash(
    *, account_id: str, database_id: str, api_token: str
) -> Tuple[Optional[str], Optional[str]]:
    sql = """
SELECT notes, new_last4
FROM secret_audit_log
WHERE secret_id = 'AGENT_SESSION_MINT_SECRET'
  AND event_type = 'rotation'
ORDER BY created_at DESC
LIMIT 1
""".strip()
    j = _cf_d1_query(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token,
        sql=sql,
    )
    rows = _pick_first_result_rows(j)
    if not rows:
        return None, None
    notes_raw = rows[0].get("notes")
    prev_hash = None
    if notes_raw:
        try:
            parsed = json.loads(str(notes_raw))
            if isinstance(parsed, dict):
                prev_hash = str(parsed.get("key_hash_sha256") or "").strip() or None
        except json.JSONDecodeError:
            pass
    prev_last4 = str(rows[0].get("new_last4") or "").strip() or None
    return prev_hash, prev_last4


def _generate_key(prefix: str) -> Tuple[str, str]:
    timestamp_ms = int(time.time() * 1000)
    random_hex_32 = secrets.token_hex(16)
    new_key = f"{prefix}_{timestamp_ms}_{random_hex_32}"
    new_hash = hashlib.sha256(new_key.encode("utf-8")).hexdigest()
    return new_key, new_hash


def _rotate_bridge(
    *,
    repo_root: Path,
    mcp_repo: Path,
    mcp_cfg: Path,
    env_path: Path,
    account_id: str,
    database_id: str,
    api_token: str,
    dry_run: bool,
) -> Tuple[int, Optional[Dict[str, Any]]]:
    new_key, new_hash = _generate_key("iam_bk")
    ok_main, ok_mcp = _push_both_workers(
        repo_root=repo_root,
        mcp_repo=mcp_repo,
        mcp_cfg=mcp_cfg,
        secret_name="AGENTSAM_BRIDGE_KEY",
        new_key=new_key,
        dry_run=dry_run,
    )
    if not ok_main:
        print("✗ AGENTSAM_BRIDGE_KEY — inneranimalmedia worker failed")
        return 1, None
    if not ok_mcp:
        print("✓ AGENTSAM_BRIDGE_KEY — inneranimalmedia worker — ok")
        print("✗ AGENTSAM_BRIDGE_KEY — inneranimalmedia-mcp-server — failed")
        return 1, None

    if dry_run:
        print(f"✓ AGENTSAM_BRIDGE_KEY generated: {_mask_key(new_key)}")
        print("✓ Wrangler secret:   inneranimalmedia worker — ok")
        print("✓ Wrangler secret:   inneranimalmedia-mcp-server — ok")
        print("✓ D1 old token:      [dry-run] would select + deactivate if present")
        print("✓ D1 new token:      [dry-run] would insert new row (hash only)")
        print("✓ Cleanup:           [dry-run] would hard-delete revoked tokens older than 90 days")
        print("✓ .env.cloudflare:   [dry-run] would update AGENTSAM_BRIDGE_KEY")
        return 0, None

    old_row = _select_old_bridge_token(
        account_id=account_id, database_id=database_id, api_token=api_token
    )
    old_id = old_row["id"] if old_row and old_row.get("id") else None
    new_id = _rotate_bridge_tokens_transaction(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token,
        new_hash=new_hash,
        old_id=old_id,
    )
    cleanup_count = _cleanup_expired_revoked_tokens(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token,
    )
    _update_env_line(env_path, "AGENTSAM_BRIDGE_KEY", new_key, dry_run=False)

    print(f"✓ AGENTSAM_BRIDGE_KEY generated: {_mask_key(new_key)}")
    print("✓ Wrangler secret:   inneranimalmedia worker — ok")
    print("✓ Wrangler secret:   inneranimalmedia-mcp-server — ok")
    if old_row and old_row.get("id"):
        print(f"✓ D1 old token:      {old_row['id']} deactivated, rotated_from set")
    else:
        print("✓ D1 old token:      (none) — inserted new active token")
    print(f"✓ D1 new token:      {new_id} inserted, hash stored")
    print("✓ .env.cloudflare:   AGENTSAM_BRIDGE_KEY updated")
    return 0, {
        "new_token_id": new_id,
        "old_token_id": old_id or "(none)",
        "cleanup_count": cleanup_count,
    }


def _rotate_agent_mint(
    *,
    repo_root: Path,
    mcp_repo: Path,
    mcp_cfg: Path,
    env_path: Path,
    account_id: str,
    database_id: str,
    api_token: str,
    dry_run: bool,
) -> Tuple[int, Optional[Dict[str, Any]]]:
    new_key, new_hash = _generate_key("iam_agent_mint")
    ok_main, ok_mcp = _push_both_workers(
        repo_root=repo_root,
        mcp_repo=mcp_repo,
        mcp_cfg=mcp_cfg,
        secret_name="AGENT_SESSION_MINT_SECRET",
        new_key=new_key,
        dry_run=dry_run,
    )
    if not ok_main:
        print("✗ AGENT_SESSION_MINT_SECRET — inneranimalmedia worker failed")
        return 1, None
    if not ok_mcp:
        print("✓ AGENT_SESSION_MINT_SECRET — inneranimalmedia worker — ok")
        print("✗ AGENT_SESSION_MINT_SECRET — inneranimalmedia-mcp-server — failed")
        return 1, None

    if dry_run:
        print(f"✓ AGENT_SESSION_MINT_SECRET generated: {_mask_key(new_key)}")
        print("✓ Wrangler secret:   inneranimalmedia worker — ok")
        print("✓ Wrangler secret:   inneranimalmedia-mcp-server — ok")
        print("✓ D1 audit:          [dry-run] would insert secret_audit_log (hash only)")
        print("✓ Cleanup:           [dry-run] would purge AGENT_SESSION_MINT_SECRET audit rows >90 days")
        print("✓ .env.cloudflare:   [dry-run] would update AGENT_SESSION_MINT_SECRET")
        return 0, None

    prev_hash, prev_last4 = _fetch_previous_mint_hash(
        account_id=account_id, database_id=database_id, api_token=api_token
    )
    audit_id = _log_agent_mint_rotation_audit(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token,
        new_hash=new_hash,
        new_last4=_last4(new_key),
        previous_hash=prev_hash,
        previous_last4=prev_last4,
    )
    cleanup_count = _cleanup_expired_secret_audit_rotations(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token,
    )
    _update_env_line(env_path, "AGENT_SESSION_MINT_SECRET", new_key, dry_run=False)

    print(f"✓ AGENT_SESSION_MINT_SECRET generated: {_mask_key(new_key)}")
    print("✓ Wrangler secret:   inneranimalmedia worker — ok")
    print("✓ Wrangler secret:   inneranimalmedia-mcp-server — ok")
    print(f"✓ D1 audit:          secret_audit_log {audit_id} (hash only, no mcp_workspace_tokens row)")
    print("✓ .env.cloudflare:   AGENT_SESSION_MINT_SECRET updated")
    return 0, {"cleanup_count": cleanup_count, "audit_id": audit_id}


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Rotate AGENTSAM_BRIDGE_KEY and/or AGENT_SESSION_MINT_SECRET."
    )
    ap.add_argument("--dry-run", action="store_true", help="Print what would happen, no writes.")
    ap.add_argument("--force", action="store_true", help="Skip confirmation prompt.")
    target = ap.add_mutually_exclusive_group()
    target.add_argument(
        "--bridge-only",
        action="store_true",
        help="Rotate AGENTSAM_BRIDGE_KEY only (default).",
    )
    target.add_argument(
        "--agent-mint-only",
        action="store_true",
        help="Rotate AGENT_SESSION_MINT_SECRET only.",
    )
    target.add_argument(
        "--all",
        action="store_true",
        help="Rotate both secrets in one run.",
    )
    args = ap.parse_args()

    rotate_bridge = args.all or args.bridge_only or (not args.agent_mint_only and not args.all)
    rotate_agent_mint = args.all or args.agent_mint_only

    if args.agent_mint_only:
        rotate_bridge = False
        rotate_agent_mint = True

    repo_root = Path.cwd()
    _repo_root_guard(repo_root)

    env_path = repo_root / ".env.cloudflare"
    envfile = _load_env_file(env_path)

    api_token = _require_env("CLOUDFLARE_API_TOKEN", _env_get("CLOUDFLARE_API_TOKEN", None, envfile))
    account_id = _require_env(
        "CLOUDFLARE_ACCOUNT_ID",
        _env_get("CLOUDFLARE_ACCOUNT_ID", CLOUDFLARE_ACCOUNT_ID_DEFAULT, envfile),
    )
    database_id = _require_env(
        "D1_DATABASE_ID",
        _env_get("D1_DATABASE_ID", D1_DATABASE_ID_DEFAULT, envfile),
    )

    targets = []
    if rotate_bridge:
        targets.append("AGENTSAM_BRIDGE_KEY")
    if rotate_agent_mint:
        targets.append("AGENT_SESSION_MINT_SECRET")

    if not targets:
        raise SystemExit("No rotation target selected.")

    if not args.dry_run and not args.force:
        print("About to rotate: " + ", ".join(targets))
        print("Wrangler secrets on inneranimalmedia + inneranimalmedia-mcp-server; then D1; then .env.cloudflare.")
        resp = input("Proceed? [y/N] ").strip().lower()
        if resp not in ("y", "yes"):
            print("Aborted.")
            return 2

    mcp_repo = Path.home() / "inneranimalmedia-mcp-server"
    mcp_cfg = _discover_mcp_repo_config(mcp_repo)

    internal_secret = _env_get("INTERNAL_API_SECRET", None, envfile)
    bridge_email_info: Optional[Dict[str, Any]] = None
    agent_mint_email_info: Optional[Dict[str, Any]] = None

    if rotate_bridge:
        print("\n--- AGENTSAM_BRIDGE_KEY ---")
        rc, bridge_email_info = _rotate_bridge(
            repo_root=repo_root,
            mcp_repo=mcp_repo,
            mcp_cfg=mcp_cfg,
            env_path=env_path,
            account_id=account_id,
            database_id=database_id,
            api_token=api_token,
            dry_run=args.dry_run,
        )
        if rc != 0:
            return rc

    if rotate_agent_mint:
        print("\n--- AGENT_SESSION_MINT_SECRET ---")
        rc, agent_mint_email_info = _rotate_agent_mint(
            repo_root=repo_root,
            mcp_repo=mcp_repo,
            mcp_cfg=mcp_cfg,
            env_path=env_path,
            account_id=account_id,
            database_id=database_id,
            api_token=api_token,
            dry_run=args.dry_run,
        )
        if rc != 0:
            return rc

    if not args.dry_run:
        iso_ts = _iso_timestamp()
        if args.all and bridge_email_info and agent_mint_email_info:
            _send_rotation_email(
                internal_secret=internal_secret,
                subject=f"[IAM] Full Secret Rotation Complete — {iso_ts}",
                html_body=_html_full_rotation_email(
                    bridge=bridge_email_info,
                    agent_mint=agent_mint_email_info,
                    iso_timestamp=iso_ts,
                ),
            )
        elif bridge_email_info and not args.agent_mint_only:
            _send_rotation_email(
                internal_secret=internal_secret,
                subject=f"[IAM] AGENTSAM_BRIDGE_KEY Rotated — {iso_ts}",
                html_body=_html_bridge_rotation_email(
                    new_token_id=str(bridge_email_info["new_token_id"]),
                    old_token_id=str(bridge_email_info["old_token_id"]),
                    cleanup_count=int(bridge_email_info.get("cleanup_count") or 0),
                    iso_timestamp=iso_ts,
                ),
            )
        elif agent_mint_email_info:
            _send_rotation_email(
                internal_secret=internal_secret,
                subject=f"[IAM] AGENT_SESSION_MINT_SECRET Rotated — {iso_ts}",
                html_body=_html_agent_mint_rotation_email(
                    cleanup_count=int(agent_mint_email_info.get("cleanup_count") or 0),
                    iso_timestamp=iso_ts,
                ),
            )

    print("\n⚠  Run deploy:full to activate post-deploy hooks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nAborted.")
        raise SystemExit(2)
