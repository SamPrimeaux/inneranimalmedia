#!/usr/bin/env python3
"""
setup_mcp_bridge.py — One-shot MCP bridge key pipeline.

Generates a new AGENTSAM_BRIDGE_KEY, hashes it, updates D1,
pushes to wrangler secrets, saves to .env.cloudflare, and
wires Claude Desktop config. stdlib only.

Usage:
  python3 scripts/setup_mcp_bridge.py

Reads from:
  .env.cloudflare  (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)

Writes to:
  .env.cloudflare                                          (AGENTSAM_BRIDGE_KEY)
  ~/Library/Application Support/Claude/claude_desktop_config.json
"""

import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

REPO_ROOT        = Path(__file__).resolve().parent.parent
ENV_FILE         = REPO_ROOT / ".env.cloudflare"
WRANGLER_CONFIG  = REPO_ROOT / "wrangler.production.toml"
CLAUDE_CONFIG    = Path.home() / "Library/Application Support/Claude/claude_desktop_config.json"

D1_DATABASE_ID   = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
TOKEN_ROW_ID     = "tok_0340ca062b13381b"
MCP_URL          = "https://mcp.inneranimalmedia.com/mcp"
SECRET_NAME      = "AGENTSAM_BRIDGE_KEY"
MCP_SERVER_KEY   = "inneranimalmedia"

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_env(path: Path) -> dict:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def save_env_key(path: Path, key: str, value: str):
    """Upsert a key=value line in an env file."""
    text = path.read_text() if path.exists() else ""
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    new_line = f"{key}={value}"
    if pattern.search(text):
        text = pattern.sub(new_line, text)
    else:
        text = text.rstrip("\n") + f"\n{new_line}\n"
    path.write_text(text)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def cf_api(account_id: str, api_token: str, path: str, payload: dict) -> dict:
    url = f"https://api.cloudflare.com/client/v4{path}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"CF API {e.code}: {body[:500]}")


def d1_query(account_id: str, api_token: str, sql: str, params: list = None) -> dict:
    payload = {"sql": sql}
    if params:
        payload["params"] = params
    return cf_api(
        account_id, api_token,
        f"/accounts/{account_id}/d1/database/{D1_DATABASE_ID}/query",
        payload,
    )


def wrangler_secret_put(secret_name: str, value: str, config: Path) -> bool:
    result = subprocess.run(
        ["npx", "wrangler", "secret", "put", secret_name,
         "--config", str(config)],
        input=value,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"  ✗ wrangler error: {result.stderr.strip()}")
        return False
    return True


def update_claude_desktop(config_path: Path, server_key: str, url: str, token: str):
    config = {}
    if config_path.exists():
        try:
            config = json.loads(config_path.read_text())
        except json.JSONDecodeError:
            print("  ⚠ Claude Desktop config malformed — rebuilding")

    config.setdefault("mcpServers", {})[server_key] = {
        "url": url,
        "headers": {
            "Authorization": f"Bearer {token}"
        }
    }

    config_path.parent.mkdir(parents=True, exist_ok=True)
    # backup
    if config_path.exists():
        config_path.rename(config_path.with_suffix(".json.bak"))
    config_path.write_text(json.dumps(config, indent=2))


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("\n🔑  MCP Bridge Key Pipeline\n" + "─" * 40)

    # guard: must be run from repo root
    if not (REPO_ROOT / "src" / "index.js").exists():
        sys.exit("✗ Run from repo root: python3 scripts/setup_mcp_bridge.py")

    # load credentials
    env = load_env(ENV_FILE)
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or env.get("CLOUDFLARE_ACCOUNT_ID")
    api_token  = os.environ.get("CLOUDFLARE_API_TOKEN")  or env.get("CLOUDFLARE_API_TOKEN")

    if not account_id or not api_token:
        sys.exit("✗ Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in .env.cloudflare")

    # ── Step 1: generate key ──────────────────────────────────────────────────
    print("1/5  Generating new bridge key...")
    new_key  = "iam_" + secrets.token_hex(32)
    new_hash = sha256(new_key)
    print(f"     Key prefix : {new_key[:16]}...")
    print(f"     SHA-256    : {new_hash[:16]}...")

    # ── Step 2: update D1 ────────────────────────────────────────────────────
    print("2/5  Updating D1 token hash...")
    result = d1_query(
        account_id, api_token,
        "UPDATE mcp_workspace_tokens SET token_hash = ? WHERE id = ?",
        [new_hash, TOKEN_ROW_ID],
    )
    if not result.get("success"):
        errors = result.get("errors", [])
        sys.exit(f"✗ D1 update failed: {errors}")
    changes = result.get("result", [{}])[0].get("meta", {}).get("changes", 0)
    if changes == 0:
        sys.exit(f"✗ D1 update matched 0 rows — check TOKEN_ROW_ID: {TOKEN_ROW_ID}")
    print(f"     ✓ {changes} row updated")

    # ── Step 3: wrangler secret ───────────────────────────────────────────────
    print(f"3/5  Pushing {SECRET_NAME} to wrangler...")
    ok = wrangler_secret_put(SECRET_NAME, new_key, WRANGLER_CONFIG)
    if not ok:
        # D1 already updated — save key locally before aborting
        save_env_key(ENV_FILE, SECRET_NAME, new_key)
        sys.exit("✗ Wrangler secret push failed. Key saved to .env.cloudflare. Fix manually.")
    print("     ✓ Secret pushed")

    # ── Step 4: save locally ─────────────────────────────────────────────────
    print(f"4/5  Saving key to {ENV_FILE.name}...")
    save_env_key(ENV_FILE, SECRET_NAME, new_key)
    print("     ✓ Saved")

    # ── Step 5: wire Claude Desktop ──────────────────────────────────────────
    print("5/5  Wiring Claude Desktop config...")
    if not CLAUDE_CONFIG.parent.exists():
        print(f"     ⚠ Claude Desktop not found at {CLAUDE_CONFIG.parent} — skipping")
        print(f"     Add manually: Authorization: Bearer {new_key[:16]}...")
    else:
        update_claude_desktop(CLAUDE_CONFIG, MCP_SERVER_KEY, MCP_URL, new_key)
        print(f"     ✓ Written to {CLAUDE_CONFIG}")
        if CLAUDE_CONFIG.with_suffix(".json.bak").exists():
            print("     ✓ Backup saved as claude_desktop_config.json.bak")

    # ── Done ─────────────────────────────────────────────────────────────────
    print("\n" + "─" * 40)
    print("✅  Done. Next steps:")
    print("    1. Cmd+Q Claude Desktop → relaunch")
    print("    2. Look for 🔨 hammer icon in chat input")
    print(f"    3. Verify: curl -s -X POST {MCP_URL} \\")
    print('         -H "Content-Type: application/json" \\')
    print(f'         -H "Authorization: Bearer $({SECRET_NAME} from .env.cloudflare)" \\')
    print("         -d '{\"jsonrpc\":\"2.0\",\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1\"}},\"id\":1}'")
    print()


if __name__ == "__main__":
    main()
