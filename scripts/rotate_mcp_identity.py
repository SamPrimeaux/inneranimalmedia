#!/usr/bin/env python3
"""
Rotate MCP bearer + bridge secrets, store SHA-256 in mcp_workspace_tokens, sync Wrangler secrets.

Generates:
  - i-am-mcp_*   → MCP_AUTH_TOKEN (hashed in D1)
  - i-am-bridge_* → AGENTSAM_BRIDGE_KEY

Writes repo-local .mcp_exports.sh — before curl tests run:
  source ~/inneranimalmedia/.mcp_exports.sh
  (or: source <repo>/.mcp_exports.sh if the repo is not under $HOME/inneranimalmedia)
"""
import argparse
import hashlib
import os
import secrets
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone

REPO_ROOT = Path(__file__).resolve().parent.parent
IAM_DIR = Path(os.environ.get("INNERANIMALMEDIA_ROOT", str(REPO_ROOT)))
MCP_DIR = Path(os.environ.get("MCP_SERVER_ROOT", str(REPO_ROOT.parent / "inneranimalmedia-mcp-server")))
DB_NAME = "inneranimalmedia-business"

DEFAULT_ALLOWED_TOOLS = [
    "d1_query",
    "d1_write",
    "r2_get",
    "r2_put",
    "web_fetch",
    "github_repo_read",
    "github_file_read",
    "github_file_write",
    "browser_snapshot",
    "browser_navigate",
    "terminal_status",
]

def run(cmd, cwd=None, input_text=None):
    print(f"\n$ {' '.join(cmd)}")
    p = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        input=input_text,
        text=True,
    )
    if p.returncode != 0:
        raise SystemExit(p.returncode)

def sql_escape(s: str) -> str:
    return s.replace("'", "''")

def make_token(prefix: str) -> str:
    # 48 random bytes → url-safe segment; prefixes i-am-mcp_ / i-am-bridge_
    return f"{prefix}_{secrets.token_urlsafe(48)}"


def resolve_wrangler_config(mcp_dir: Path) -> list:
    """Return extra argv for wrangler -c <file> when a config exists in mcp_dir."""
    for name in ("wrangler.toml", "wrangler.jsonc", "wrangler.json"):
        p = mcp_dir / name
        if p.is_file():
            return ["-c", str(p)]
    return []

def main():
    parser = argparse.ArgumentParser(description="Rotate MCP/Agent Sam identity tokens safely.")
    parser.add_argument("--workspace-id", default="ws_inneranimalmedia")
    parser.add_argument("--tenant-id", default="tenant_sam_primeaux")
    parser.add_argument("--label", default="i-am-master")
    parser.add_argument("--repo", default="SamPrimeaux/inneranimalmedia")
    parser.add_argument("--repo-path", default=str(IAM_DIR), help="Stored on token row (repo_path / PTY cwd hint)")
    parser.add_argument("--rate-limit", type=int, default=1000)
    parser.add_argument("--expires-at", default="NULL", help="unix timestamp or NULL")
    parser.add_argument("--all-tools", action="store_true", help="Store allowed_tools as NULL master access.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    mcp_token = make_token("i-am-mcp")
    bridge_key = make_token("i-am-bridge")
    token_hash = hashlib.sha256(mcp_token.encode("utf-8")).hexdigest()

    allowed_tools_sql = "NULL" if args.all_tools else "'" + sql_escape(__import__("json").dumps(DEFAULT_ALLOWED_TOOLS)) + "'"
    expires_sql = "NULL" if str(args.expires_at).upper() == "NULL" else str(int(args.expires_at))

    sql = f"""
UPDATE mcp_workspace_tokens
SET is_active = 0
WHERE label = '{sql_escape(args.label)}'
  AND workspace_id = '{sql_escape(args.workspace_id)}'
  AND is_active = 1;

INSERT INTO mcp_workspace_tokens
  (workspace_id, tenant_id, label, token_hash,
   allowed_tools, github_repo, repo_path,
   rate_limit_per_hour, expires_at)
VALUES
  ('{sql_escape(args.workspace_id)}',
   '{sql_escape(args.tenant_id)}',
   '{sql_escape(args.label)}',
   '{token_hash}',
   {allowed_tools_sql},
   '{sql_escape(args.repo)}',
   '{sql_escape(args.repo_path)}',
   {int(args.rate_limit)},
   {expires_sql});
""".strip()

    shell_file = IAM_DIR / ".env.mcp.local"
    export_file = IAM_DIR / ".mcp_exports.sh"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    shell_body = f"""# Generated {now}
# DO NOT COMMIT
export MCP_AUTH_TOKEN='{mcp_token}'
export AGENTSAM_BRIDGE_KEY='{bridge_key}'
export MCP_TOKEN_HASH='{token_hash}'
export MCP_WORKSPACE_ID='{args.workspace_id}'
export MCP_TENANT_ID='{args.tenant_id}'
"""

    print("\nGenerated:")
    print(f"  MCP_AUTH_TOKEN:      {mcp_token[:16]}...{mcp_token[-8:]}")
    print(f"  AGENTSAM_BRIDGE_KEY: {bridge_key[:16]}...{bridge_key[-8:]}")
    print(f"  TOKEN_HASH:          {token_hash[:16]}...")

    if args.dry_run:
        print("\n--- SQL DRY RUN ---")
        print(sql)
        print("\n--- SHELL EXPORTS DRY RUN ---")
        print(shell_body)
        return

    # Ensure local files are ignored.
    gitignore = IAM_DIR / ".gitignore"
    if gitignore.exists():
        existing = gitignore.read_text()
        additions = []
        for line in [".env.mcp.local", ".mcp_exports.sh"]:
            if line not in existing:
                additions.append(line)
        if additions:
            with gitignore.open("a") as f:
                f.write("\n" + "\n".join(additions) + "\n")

    # 1. Save local shell exports.
    shell_file.write_text(shell_body)
    export_file.write_text(shell_body)
    print(f"\nWrote local shell files:")
    print(f"  {shell_file}")
    print(f"  {export_file}")

    # 2. Upload secrets to both Workers (main + MCP server).
    run(
        ["npx", "wrangler", "secret", "put", "MCP_AUTH_TOKEN", "-c", "wrangler.production.toml", "--name", "inneranimalmedia"],
        cwd=IAM_DIR,
        input_text=mcp_token,
    )
    run(
        ["npx", "wrangler", "secret", "put", "AGENTSAM_BRIDGE_KEY", "-c", "wrangler.production.toml", "--name", "inneranimalmedia"],
        cwd=IAM_DIR,
        input_text=bridge_key,
    )

    mcp_cfg = resolve_wrangler_config(MCP_DIR)
    if MCP_DIR.is_dir():
        run(["npx", "wrangler", "secret", "put", "MCP_AUTH_TOKEN", *mcp_cfg], cwd=MCP_DIR, input_text=mcp_token)
        run(["npx", "wrangler", "secret", "put", "AGENTSAM_BRIDGE_KEY", *mcp_cfg], cwd=MCP_DIR, input_text=bridge_key)
    else:
        print(f"\nWARNING: MCP server directory not found ({MCP_DIR}); skipped MCP worker secrets.")
        print("Set MCP_SERVER_ROOT or clone inneranimalmedia-mcp-server next to this repo, then re-run.")

    # 3. Roll D1 token hash.
    run(["npx", "wrangler", "d1", "execute", DB_NAME, "--remote", "--command", sql], cwd=IAM_DIR)

    print("\nRotation complete.")
    print("\nTo set this token in your current terminal, run:")
    print(f"  source {export_file}")
    home_hint = Path.home() / "inneranimalmedia" / ".mcp_exports.sh"
    if export_file.resolve() != home_hint.resolve():
        print(f"  (If this repo lives at ~/inneranimalmedia, that is: source {home_hint})")
    print("\nThen test:")
    print("""  curl -s -X POST https://mcp.inneranimalmedia.com/mcp \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer $MCP_AUTH_TOKEN" \\
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"d1_query","arguments":{"sql":"SELECT 1 as ping"}}}' | jq .""")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
