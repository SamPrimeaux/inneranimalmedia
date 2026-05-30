#!/usr/bin/env zsh
# Prepend MCP OAuth WAF custom rule to zone ruleset (log or skip phase).
# Usage: ./scripts/cloudflare/apply-waf-oauth-login-rule.sh [log|skip]
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PHASE="${1:-log}"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"
PAYLOAD="${REPO_ROOT}/scripts/cloudflare/waf-oauth-login-rule-payload.json"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi
set -a
source "$ENV_FILE"
set +a

TOKEN="${CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  echo "CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN not set" >&2
  exit 1
fi

ZONE_ID="$(node -e "
const p=require('${PAYLOAD}');
process.stdout.write(p._meta.zone_id);
")"
RULESET_ID="$(node -e "
const p=require('${PAYLOAD}');
process.stdout.write(p._meta.ruleset_id);
")"

NEW_RULE="$(node -e "
const p=require('${PAYLOAD}');
const phase='${PHASE}'==='skip'?'new_rule_skip_phase':'new_rule_log_phase';
process.stdout.write(JSON.stringify(p[phase]));
")"

echo "Fetching current ruleset ${RULESET_ID}..."
CURRENT="$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/rulesets/${RULESET_ID}")"

BODY="$(node -e "
const current=JSON.parse(process.argv[1]);
const newRule=JSON.parse(process.argv[2]);
if(!current.success){console.error(JSON.stringify(current,null,2));process.exit(1);}
const rules=[newRule, ...(current.result.rules||[])];
process.stdout.write(JSON.stringify({ rules }));
" "$CURRENT" "$NEW_RULE")"

echo "Applying ${PHASE} rule to zone ${ZONE_ID} ruleset ${RULESET_ID}..."
RESP="$(curl -sS -X PUT \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/rulesets/${RULESET_ID}" \
  --data "$BODY")"

node -e "
const r=JSON.parse(process.argv[1]);
if(!r.success){console.error(JSON.stringify(r,null,2));process.exit(1);}
console.log('OK ruleset version', r.result.version);
console.log('First rule:', r.result.rules?.[0]?.description, '- action:', r.result.rules?.[0]?.action);
" "$RESP"
