#!/usr/bin/env bash
# verify_mcp_toolslist.sh
# ========================
# Verifies the B+ tools/list fix after deploy.
# Usage: OAUTH_TOKEN=your_oauth_access_token bash verify_mcp_toolslist.sh

set -euo pipefail

MCP_URL="${MCP_URL:-https://mcp.inneranimalmedia.com/mcp}"
OAUTH_TOKEN="${OAUTH_TOKEN:-}"   # paste the ChatGPT/Claude OAuth access_token here

if [[ -z "$OAUTH_TOKEN" ]]; then
  echo "❌  Set OAUTH_TOKEN env var first."
  echo "    Export the active OAuth access_token from mcp_workspace_tokens"
  echo "    or from your ChatGPT connector settings."
  exit 1
fi

PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

echo "──────────────────────────────────────────────"
echo "  MCP tools/list  →  $MCP_URL"
echo "──────────────────────────────────────────────"

RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Authorization: Bearer $OAUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "$RESPONSE" | python3 -c "
import sys, json

raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception as e:
    print('❌  Response is not valid JSON:', e)
    print('Raw:', raw[:500])
    sys.exit(1)

if 'error' in data:
    print('❌  JSON-RPC error:', data['error'])
    sys.exit(1)

tools = data.get('result', {}).get('tools', [])
count = len(tools)

print(f'\n✅  tools/list returned {count} tool(s)')
print()

if count == 0:
    print('❌  STILL ZERO — Worker deploy may not have picked up the fix yet.')
    print('   1. Confirm wrangler deploy ran against mcp-server worker')
    print('   2. Run: wrangler tail --format pretty | grep tools/list')
    sys.exit(1)

if count > 40:
    print(f'⚠️   {count} tools — looks like OAuth catalog filter is not applied.')
    print('   Expected ~27-28 for external OAuth clients.')

# Print tool list
for t in sorted(tools, key=lambda x: x.get('name','')):
    name = t.get('name', '?')
    desc = (t.get('description') or '')[:60]
    has_schema = bool(t.get('inputSchema', {}).get('properties'))
    schema_flag = '✅' if has_schema else '⚠️ no schema'
    print(f'   {name:<40} {schema_flag}  {desc}')

print()
print(f'  Target: 27-28 tools.  Got: {count}.')
if 27 <= count <= 30:
    print('✅  Count is in the expected range. B+ is live.')
else:
    print('⚠️   Count outside expected range — review disabled rows.')
"

# ── Deploy checklist (printed for reference) ─────────────────────────────────
cat <<'CHECKLIST'

──────────────────────────────────────────────
  B+ Rollout Checklist
──────────────────────────────────────────────
[ ] 1. Run migration in D1:
        wrangler d1 execute inneranimalmedia-business --remote \
          --file 416_oauth_external_tools_curate_28.sql
        → Expect "active_tool_count: 27"

[ ] 2. Drop mcp-tool-resolve.js into src/core/
        cp mcp-tool-resolve.js /Users/samprimeaux/inneranimalmedia/src/core/

[ ] 3. Update tools/list handler in src/api/mcp.js
        (see example comment at bottom of mcp-tool-resolve.js)

[ ] 4. Deploy MCP worker:
        cd /Users/samprimeaux/inneranimalmedia
        git add src/core/mcp-tool-resolve.js src/api/mcp.js
        git commit -m "fix(mcp): B+ tools/list — resolve via display_name + oauth catalog"
        git push origin main

[ ] 5. Run this verify script:
        OAUTH_TOKEN=xxx bash verify_mcp_toolslist.sh
        → Expect 27-28 tools with inputSchema populated

[ ] 6. Re-open ChatGPT connector settings → Refresh
        Should now see ~27 tools listed in the connector panel.

[ ] 7. Optional — re-enable CMS tools for PM use:
        wrangler d1 execute inneranimalmedia-business --remote --command \
          "UPDATE agentsam_mcp_oauth_tool_allowlist SET is_active=1, updated_at=unixepoch()
           WHERE tool_key IN ('agentsam_cms_read','agentsam_cms_write','agentsam_cms_publish')
           AND client_id='iam_mcp_inneranimalmedia'"
CHECKLIST
