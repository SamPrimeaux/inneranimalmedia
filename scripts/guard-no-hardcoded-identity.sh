#!/usr/bin/env bash
# Fail if live code contains hardcoded operator/workspace/tenant identity literals.
# See: .cursor/rules/no-hardcoded-identity-auth-protocol.mdc
#      agentsam_rules_document.id = rule_no_hardcoded_identity_auth_protocol
#
# Usage:
#   ./scripts/guard-no-hardcoded-identity.sh           # OAuth/auth tier (CI gate — must pass)
#   ./scripts/guard-no-hardcoded-identity.sh --tier all  # Full audit (legacy debt may fail)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TIER="${GUARD_IDENTITY_TIER:-oauth}"
for arg in "$@"; do
  case "$arg" in
    --tier=*) TIER="${arg#--tier=}" ;;
    --tier) shift; TIER="${1:-oauth}" ;;
    all|oauth) TIER="$arg" ;;
  esac
done

if [[ "$(basename "$ROOT")" != "inneranimalmedia" ]]; then
  echo "guard-no-hardcoded-identity: must run from inneranimalmedia repo root" >&2
  exit 2
fi

MCP_SRC="${MCP_SRC:-$ROOT/../inneranimalmedia-mcp-server/src}"

# OAuth client_id literal allowed only in canonical constant modules
ALLOW_OAUTH_CLIENT_FILES="mcp-oauth-shared.js|mcp-oauth-external-clients.js|mcp-oauth-constants.js"

violations=0
report() {
  echo "$1" >&2
  violations=$((violations + 1))
}

is_comment_line() {
  local content="$1"
  [[ "$content" =~ ^[[:space:]]*(\*|//|#) ]] && return 0
  [[ "$content" =~ ^[[:space:]]*\* ]] && return 0
  return 1
}

should_scan_file() {
  local file="$1"
  case "$file" in
    *".test."*|*".spec."*|*"/test/"*|*"/tests/"*|*e2e*|*".bak"|*"/.scratch/"*|*schema.json)
      return 1
      ;;
  esac
  if [[ "$TIER" == "oauth" ]]; then
    case "$file" in
      */src/api/oauth.js|*/src/api/mcp-oauth*.js|*/src/core/mcp-oauth*.js|*/src/api/settings.js)
        return 0
        ;;
      */migrations/41*mcp*oauth*.sql|*/migrations/41*rule_no_hardcoded*.sql)
        return 0
        ;;
      */inneranimalmedia-mcp-server/src/mcp-oauth*.js|*/inneranimalmedia-mcp-server/src/index.js)
        return 0
        ;;
      *)
        return 1
        ;;
    esac
  fi
  return 0
}

scan_dirs() {
  if [[ "$TIER" == "oauth" ]]; then
    printf '%s\0' \
      "$ROOT/src/api/oauth.js" \
      $(printf '%s\0' "$ROOT"/src/api/mcp-oauth*.js 2>/dev/null || true) \
      $(printf '%s\0' "$ROOT"/src/core/mcp-oauth*.js 2>/dev/null || true) \
      "$ROOT/src/api/settings.js"
    for f in "$ROOT"/migrations/41*mcp*oauth*.sql "$ROOT"/migrations/41*rule_no_hardcoded*.sql; do
      [[ -f "$f" ]] && printf '%s\0' "$f"
    done
    if [[ -d "$MCP_SRC" ]]; then
      printf '%s\0' \
        $(printf '%s\0' "$MCP_SRC"/mcp-oauth*.js 2>/dev/null || true) \
        "$MCP_SRC/index.js"
    fi
  else
    printf '%s\0' "$ROOT/src" "$ROOT/dashboard"
    [[ -d "$MCP_SRC" ]] && printf '%s\0' "$MCP_SRC"
  fi
}

rg_one() {
  local label="$1"
  local pattern="$2"
  local target="$3"
  [[ -e "$target" ]] || return 0
  while IFS= read -r line; do
    local file="${line%%:*}"
    local rest="${line#*:}"
    local lineno="${rest%%:*}"
    local content="${rest#*:}"

    should_scan_file "$file" || continue
    is_comment_line "$content" && continue

    if [[ "$label" == "oauth_client_id" ]] && echo "$file" | rg -q "$ALLOW_OAUTH_CLIENT_FILES"; then
      continue
    fi

    report "[$label] $file:$lineno: $content"
  done < <(rg -n --no-heading "$pattern" "$target" \
    -g '!**/*.bak' -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/build/**' 2>/dev/null || true)
}

echo "guard-no-hardcoded-identity: tier=$TIER …"

while IFS= read -r -d '' target; do
  [[ -e "$target" ]] || continue
  rg_one "user_id_au" 'au_[0-9a-f]{12,}' "$target"
  if [[ "$TIER" == "oauth" ]]; then
    rg_one "workspace_ws" "ws_inneranimalmedia|['\"\`]ws_inneranimalmedia['\"\`]" "$target"
    rg_one "tenant_literal" "tenant_sam_primeaux|tenant_inneranimalmedia|['\"\`]tenant_sam_primeaux['\"\`]|['\"\`]tenant_inneranimalmedia['\"\`]" "$target"
  else
    rg_one "workspace_ws" "ws_inneranimalmedia|['\"\`]ws_[a-z0-9_]{8,}['\"\`]" "$target"
    rg_one "tenant_literal" "tenant_sam_primeaux|tenant_inneranimal|['\"\`]tenant_[a-z0-9_]{8,}['\"\`]" "$target"
  fi
  rg_one "oauth_client_id" "iam_mcp_inneranimalmedia" "$target"
done < <(scan_dirs)

if rg -n --no-heading "INSERT.*agentsam_mcp_oauth_user_client_allowlist" "$ROOT/migrations" 2>/dev/null | rg -q "au_"; then
  report "[migration_seed] migrations/*: INSERT into agentsam_mcp_oauth_user_client_allowlist contains au_* — use consent runtime only"
fi

if [[ "$violations" -gt 0 ]]; then
  echo "" >&2
  echo "FAILED: $violations hardcoded identity violation(s) (tier=$TIER). See .cursor/rules/no-hardcoded-identity-auth-protocol.mdc" >&2
  exit 1
fi

echo "OK: no hardcoded identity violations (tier=$TIER)."
