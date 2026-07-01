# Agent Sam env loader
# Safe to source from zsh or bash.

# Resolve repo root from this file when possible.
if [ -n "${BASH_SOURCE:-}" ]; then
  SCRIPT_PATH="${BASH_SOURCE[0]}"
elif [ -n "${(%):-%N}" ] 2>/dev/null; then
  SCRIPT_PATH="${(%):-%N}"
else
  SCRIPT_PATH="$0"
fi

SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${AGENTSAM_ENV_FILE:-$REPO_ROOT/.env.agentsam.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE"
  echo "Current directory: $(pwd)"
  echo "Repo root guessed: $REPO_ROOT"
  echo "Available env files:"
  ls -la "$REPO_ROOT"/.env* 2>/dev/null || true
  return 1 2>/dev/null || exit 1
fi

# Load simple KEY=value env file.
set -a
. "$ENV_FILE"
set +a

require_nonempty() {
  name="$1"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing $name"
    return 1 2>/dev/null || exit 1
  fi
}

mask_secret() {
  value="${1:-}"
  prefix="${2:-8}"

  if [ -z "$value" ]; then
    echo "<not set>"
    return
  fi

  len=${#value}
  if [ "$len" -le 12 ]; then
    echo "<set:${len}chars>"
    return
  fi

  start="$(printf "%s" "$value" | cut -c 1-"$prefix")"
  end="$(printf "%s" "$value" | rev | cut -c 1-4 | rev)"
  echo "${start}...${end}"
}

warn_missing() {
  echo "  [warn] $1 not set — related smoke workflows may fail"
}

require_nonempty IAM_D1_DB
require_nonempty IAM_WORKSPACE_ID
require_nonempty IAM_TENANT_ID
require_nonempty IAM_USER_ID
require_nonempty OPENAI_API_KEY
require_nonempty ANTHROPIC_API_KEY
require_nonempty CLOUDFLARE_API_TOKEN

[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || warn_missing "CLOUDFLARE_ACCOUNT_ID"
[ -n "${CLOUDFLARE_D1_DATABASE_ID:-}" ] || warn_missing "CLOUDFLARE_D1_DATABASE_ID"
[ -n "${CLOUDFLARE_R2_BUCKET:-}" ] || warn_missing "CLOUDFLARE_R2_BUCKET"
[ -n "${CLOUDFLARE_KV_NAMESPACE_ID:-}" ] || warn_missing "CLOUDFLARE_KV_NAMESPACE_ID"

[ -n "${SUPABASE_URL:-}" ] || warn_missing "SUPABASE_URL"
[ -n "${SUPABASE_PROJECT_REF:-}" ] || warn_missing "SUPABASE_PROJECT_REF"
[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || warn_missing "SUPABASE_SERVICE_ROLE_KEY"
[ -n "${IAM_IDENTITY_PROFILE_ID:-}" ] || warn_missing "IAM_IDENTITY_PROFILE_ID"
[ -n "${IAM_SUPABASE_USER_ID:-}" ] || warn_missing "IAM_SUPABASE_USER_ID"

export AGENTSAM_SMOKE_MODE="${AGENTSAM_SMOKE_MODE:-local_live}"
export AGENTSAM_SMOKE_WRITE_D1="${AGENTSAM_SMOKE_WRITE_D1:-1}"
export AGENTSAM_SMOKE_PROVIDER="${AGENTSAM_SMOKE_PROVIDER:-openai}"
export AGENTSAM_SMOKE_MAX_COST_USD="${AGENTSAM_SMOKE_MAX_COST_USD:-0.05}"
export AGENTSAM_SMOKE_ENVIRONMENT="${AGENTSAM_SMOKE_ENVIRONMENT:-production}"
export AGENTSAM_SMOKE_RUN_PREFIX="${AGENTSAM_SMOKE_RUN_PREFIX:-local_smoke}"

export AGENTSAM_SUPABASE_ENABLED="${AGENTSAM_SUPABASE_ENABLED:-0}"
export AGENTSAM_SUPABASE_OBSERVABILITY_ENABLED="${AGENTSAM_SUPABASE_OBSERVABILITY_ENABLED:-0}"
export AGENTSAM_SUPABASE_STRICT="${AGENTSAM_SUPABASE_STRICT:-0}"
export AGENTSAM_E2E_MODE="${AGENTSAM_E2E_MODE:-local_first}"
export AGENTSAM_E2E_NO_LLM_BY_DEFAULT="${AGENTSAM_E2E_NO_LLM_BY_DEFAULT:-1}"
export AGENTSAM_DEFAULT_CHEAP_PROVIDER="${AGENTSAM_DEFAULT_CHEAP_PROVIDER:-local}"
export AGENTSAM_DEFAULT_CHEAP_MODEL="${AGENTSAM_DEFAULT_CHEAP_MODEL:-terminal_no_llm}"
export AGENTSAM_DISABLE_DEFAULT_ANTHROPIC="${AGENTSAM_DISABLE_DEFAULT_ANTHROPIC:-1}"
export AGENTSAM_ANTHROPIC_ESCALATION_ONLY="${AGENTSAM_ANTHROPIC_ESCALATION_ONLY:-1}"

export IAM_BASE_URL="${IAM_BASE_URL:-https://inneranimalmedia.com}"
export IAM_DASHBOARD_BASE_URL="${IAM_DASHBOARD_BASE_URL:-$IAM_BASE_URL/dashboard}"
export IAM_DASHBOARD_URL="${IAM_DASHBOARD_URL:-$IAM_DASHBOARD_BASE_URL/overview}"
export IAM_AGENT_DASHBOARD_URL="${IAM_AGENT_DASHBOARD_URL:-$IAM_DASHBOARD_BASE_URL/agent}"

export AGENTSAM_R2_BUCKET="${AGENTSAM_R2_BUCKET:-${CLOUDFLARE_R2_BUCKET:-inneranimalmedia}}"
export AGENTSAM_R2_PREFIX="${AGENTSAM_R2_PREFIX:-captures/inneranimalmedia}"
export AGENTSAM_R2_RESULTS_PREFIX="${AGENTSAM_R2_RESULTS_PREFIX:-$AGENTSAM_R2_PREFIX/results}"
export AGENTSAM_R2_EVIDENCE_PREFIX="${AGENTSAM_R2_EVIDENCE_PREFIX:-$AGENTSAM_R2_PREFIX/evidence}"
export AGENTSAM_R2_SCREENSHOTS_PREFIX="${AGENTSAM_R2_SCREENSHOTS_PREFIX:-$AGENTSAM_R2_PREFIX/screenshots}"
export AGENTSAM_R2_REPORT_PREFIX="${AGENTSAM_R2_REPORT_PREFIX:-$AGENTSAM_R2_PREFIX/report}"
export AGENTSAM_R2_RAW_REPORT_PREFIX="${AGENTSAM_R2_RAW_REPORT_PREFIX:-$AGENTSAM_R2_PREFIX/raw-playwright-report}"
export AGENTSAM_R2_QUALITY_PREFIX="${AGENTSAM_R2_QUALITY_PREFIX:-$AGENTSAM_R2_PREFIX/quality-report}"
export AGENTSAM_R2_ANALYTICS_PREFIX="${AGENTSAM_R2_ANALYTICS_PREFIX:-analytics/agentsam}"

echo "Loaded Agent Sam env from $ENV_FILE"
echo ""
echo "  IAM_D1_DB                   = $IAM_D1_DB"
echo "  IAM_WORKSPACE_ID            = $IAM_WORKSPACE_ID"
echo "  IAM_TENANT_ID               = $IAM_TENANT_ID"
echo "  IAM_USER_ID                 = $IAM_USER_ID"
echo ""
echo "  IAM_BASE_URL                = $IAM_BASE_URL"
echo "  IAM_DASHBOARD_BASE_URL      = $IAM_DASHBOARD_BASE_URL"
echo "  IAM_DASHBOARD_URL           = $IAM_DASHBOARD_URL"
echo "  IAM_AGENT_DASHBOARD_URL     = $IAM_AGENT_DASHBOARD_URL"
echo ""
echo "  AGENTSAM_SMOKE_MODE         = $AGENTSAM_SMOKE_MODE"
echo "  AGENTSAM_SMOKE_WRITE_D1     = $AGENTSAM_SMOKE_WRITE_D1"
echo "  AGENTSAM_SMOKE_PROVIDER     = $AGENTSAM_SMOKE_PROVIDER"
echo "  AGENTSAM_SMOKE_MAX_COST_USD = $AGENTSAM_SMOKE_MAX_COST_USD"
echo ""
echo "  OPENAI_API_KEY              = $(mask_secret "$OPENAI_API_KEY" 8)"
echo "  ANTHROPIC_API_KEY           = $(mask_secret "$ANTHROPIC_API_KEY" 15)"
echo "  CLOUDFLARE_API_TOKEN        = $(mask_secret "$CLOUDFLARE_API_TOKEN" 8)"
echo ""
echo "  CLOUDFLARE_ACCOUNT_ID       = ${CLOUDFLARE_ACCOUNT_ID:-<not set>}"
echo "  CLOUDFLARE_D1_DATABASE_ID   = ${CLOUDFLARE_D1_DATABASE_ID:-<not set>}"
echo "  CLOUDFLARE_R2_BUCKET        = ${CLOUDFLARE_R2_BUCKET:-<not set>}"
echo "  CLOUDFLARE_KV_NAMESPACE_ID  = ${CLOUDFLARE_KV_NAMESPACE_ID:-<not set>}"

echo ""
echo "  Supabase Observability"
echo "  SUPABASE_URL                = ${SUPABASE_URL:-<not set>}"
echo "  SUPABASE_PROJECT_REF        = ${SUPABASE_PROJECT_REF:-<not set>}"
echo "  SUPABASE_SERVICE_ROLE_KEY   = $(mask_secret "${SUPABASE_SERVICE_ROLE_KEY:-}" 8)"
echo "  SUPABASE_ANON_KEY           = $(mask_secret "${SUPABASE_ANON_KEY:-}" 8)"
echo "  IAM_IDENTITY_PROFILE_ID     = ${IAM_IDENTITY_PROFILE_ID:-<not set>}"
echo "  IAM_SUPABASE_USER_ID        = ${IAM_SUPABASE_USER_ID:-<not set>}"
echo "  IAM_SUPABASE_WORKSPACE_ID   = ${IAM_SUPABASE_WORKSPACE_ID:-<not set>}"
echo "  IAM_D1_AUTH_USER_ID         = ${IAM_D1_AUTH_USER_ID:-<not set>}"
echo "  D1_AUTH_USER_ID             = ${D1_AUTH_USER_ID:-<not set>}"
echo "  IAM_USER_EMAIL              = ${IAM_USER_EMAIL:-<not set>} (primary login: info@inneranimals.com)"
echo "  IAM_PERSON_UUID             = ${IAM_PERSON_UUID:-<not set>}"
echo "  IAM_SUPERADMIN_UUID         = ${IAM_SUPERADMIN_UUID:-<not set>}"
echo "  AGENTSAM_SUPABASE_ENABLED   = ${AGENTSAM_SUPABASE_ENABLED:-0}"
echo "  AGENTSAM_SUPABASE_STRICT    = ${AGENTSAM_SUPABASE_STRICT:-0}"
echo "  AGENTSAM_E2E_MODE           = ${AGENTSAM_E2E_MODE:-local_first}"
echo "  AGENTSAM_E2E_NO_LLM_BY_DEFAULT = ${AGENTSAM_E2E_NO_LLM_BY_DEFAULT:-1}"

echo ""
echo "  Google AI"
echo "  GOOGLE_AI_API_KEY          = $(mask_secret "${GOOGLE_AI_API_KEY:-}" 8)"
echo "  GEMINI_API_KEY             = $(mask_secret "${GEMINI_API_KEY:-}" 8)"

echo ""
echo "  Local Models"
echo "  OLLAMA_BASE_URL              = ${OLLAMA_BASE_URL:-<not set>}"
echo "  OLLAMA_DEFAULT_MODEL         = ${OLLAMA_DEFAULT_MODEL:-<not set>}"
echo "  AGENTSAM_LOCAL_MODEL_ENABLED = ${AGENTSAM_LOCAL_MODEL_ENABLED:-0}"
