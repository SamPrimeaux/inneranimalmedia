#!/usr/bin/env zsh
# Apply production WAF custom rules: MCP OAuth skip + RAG agent access hardening.
# Usage: ./scripts/cloudflare/apply-waf-production-rules.sh
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
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

ZONE_ID="$(node -e "process.stdout.write(require('${PAYLOAD}')._meta.zone_id)")"
RULESET_ID="$(node -e "process.stdout.write(require('${PAYLOAD}')._meta.ruleset_id)")"
OAUTH_RULE="$(node -e "process.stdout.write(JSON.stringify(require('${PAYLOAD}').new_rule_skip_phase))")"
RAG_RULE_ID="763103cf7f994a2abb90e058fa5cab1c"

echo "Fetching ruleset ${RULESET_ID}..."
CURRENT="$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/rulesets/${RULESET_ID}")"

BODY="$(node -e "
const current = JSON.parse(process.argv[1]);
const oauthRule = JSON.parse(process.argv[2]);
const ragRuleId = process.argv[3];
if (!current.success) {
  console.error(JSON.stringify(current, null, 2));
  process.exit(1);
}
const rules = current.result.rules || [];
const ragIdx = rules.findIndex((r) => r.id === ragRuleId || r.ref === ragRuleId);
if (ragIdx === -1) {
  console.error('RAG rule not found:', ragRuleId);
  process.exit(1);
}
const ragRule = { ...rules[ragIdx] };
ragRule.description = 'Allow RAG domain - AI agents (managed WAF + bot skip)';
ragRule.action = 'skip';
ragRule.action_parameters = {
  phases: ['http_request_sbfm', 'http_request_firewall_managed', 'http_ratelimit'],
  products: ['bic', 'securityLevel', 'uaBlock'],
  ruleset: 'current',
};
ragRule.logging = { enabled: true };
const withoutRag = rules.filter((_, i) => i !== ragIdx);
const withoutExistingOauth = withoutRag.filter(
  (r) => !/Allow MCP OAuth login and authorize paths/i.test(String(r.description || '')),
);
const nextRules = [oauthRule, ragRule, ...withoutExistingOauth];
process.stdout.write(JSON.stringify({ rules: nextRules }));
" "$CURRENT" "$OAUTH_RULE" "$RAG_RULE_ID")"

echo "Applying MCP OAuth skip + RAG agent WAF rules..."
RESP="$(curl -sS -X PUT \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/rulesets/${RULESET_ID}" \
  --data "$BODY")"

node -e "
const r = JSON.parse(process.argv[1]);
if (!r.success) {
  console.error(JSON.stringify(r, null, 2));
  process.exit(1);
}
const rules = r.result.rules || [];
console.log('OK ruleset version', r.result.version);
console.log('Rule 1:', rules[0]?.description, '-', rules[0]?.action);
console.log('Rule 2:', rules[1]?.description, '-', rules[1]?.action);
" "$RESP"
