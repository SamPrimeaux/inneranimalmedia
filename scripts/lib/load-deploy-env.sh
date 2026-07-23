#!/usr/bin/env bash
# load-deploy-env.sh — hydrate deploy/CI shell env from gitignored files + public wrangler vars.
# Source from deploy-fast / post-deploy-record / trail gate (bash):
#   # shellcheck source=scripts/lib/load-deploy-env.sh
#   source "$REPO_ROOT/scripts/lib/load-deploy-env.sh"
#
# Never echoes secret values. Safe on CF Builds (/opt/buildhome) when Build secrets are set.
# shellcheck shell=bash

_iam_deploy_env_repo_root() {
  if [[ -n "${REPO_ROOT:-}" && -d "${REPO_ROOT}" ]]; then
    printf '%s' "$REPO_ROOT"
    return 0
  fi
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  printf '%s' "$here"
}

# Read KEY = "value" from wrangler.production.toml [vars] (non-secret only).
_iam_toml_var() {
  local key="$1"
  local toml="${2:-}"
  [[ -f "$toml" ]] || return 0
  # Prefer first assignment of KEY = "..."
  sed -nE "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\"([^\"]+)\".*/\\1/p" "$toml" | head -1
}

iam_load_deploy_env() {
  local root toml env_file mcp_exports
  root="$(_iam_deploy_env_repo_root)"
  toml="${CF_BUILDS_WRANGLER_CONFIG:-$root/wrangler.production.toml}"
  [[ "$toml" = /* ]] || toml="$root/$toml"
  env_file="$root/.env.cloudflare"
  mcp_exports="$root/.mcp_exports.sh"

  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
  if [[ -f "$mcp_exports" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$mcp_exports"
    set +a
  fi

  # Public wrangler [vars] fill gaps when CF Builds / thin shells omit them.
  : "${CLOUDFLARE_ACCOUNT_ID:=$(_iam_toml_var CLOUDFLARE_ACCOUNT_ID "$toml")}"
  : "${WORKSPACE_ID:=$(_iam_toml_var WORKSPACE_ID "$toml")}"
  : "${D1_AUTH_USER_ID:=$(_iam_toml_var D1_AUTH_USER_ID "$toml")}"
  : "${IAM_D1_AUTH_USER_ID:=$(_iam_toml_var IAM_D1_AUTH_USER_ID "$toml")}"
  : "${IAM_SUPABASE_USER_ID:=$(_iam_toml_var IAM_SUPABASE_USER_ID "$toml")}"
  : "${IAM_SUPABASE_WORKSPACE_ID:=$(_iam_toml_var IAM_SUPABASE_WORKSPACE_ID "$toml")}"
  : "${OPERATOR_USER_EMAIL:=$(_iam_toml_var OPERATOR_USER_EMAIL "$toml")}"

  export CLOUDFLARE_ACCOUNT_ID WORKSPACE_ID D1_AUTH_USER_ID IAM_D1_AUTH_USER_ID
  export IAM_SUPABASE_USER_ID IAM_SUPABASE_WORKSPACE_ID OPERATOR_USER_EMAIL

  # Prefer bridge from mcp rotation exports when both exist (mcp_exports sourced second above).
  if [[ -z "${AGENTSAM_BRIDGE_KEY:-}" && -n "${INTERNAL_API_SECRET:-}" ]]; then
    :
  fi
}

iam_load_deploy_env
