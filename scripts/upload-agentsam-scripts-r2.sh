#!/usr/bin/env bash
# Upload repo scripts → R2 inneranimalmedia-autorag/scripts/ (AutoRAG-indexed lane).
# Writes sidecar *.meta.md, scripts/README.md, _index/inventory.json; updates D1 via migration or manual hash sync.
#
# Usage:
#   ./scripts/upload-agentsam-scripts-r2.sh              # tier-1 manifest + index
#   ./scripts/upload-agentsam-scripts-r2.sh scripts/foo.sh:maintenance/foo.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TOML="wrangler.production.toml"
BUCKET="inneranimalmedia-autorag"
R2_PREFIX="scripts"
STAGING="${REPO_ROOT}/.scratch/autorag-scripts-upload"
INDEX_JSON="${STAGING}/_index/inventory.json"

# repo_path|lane/file|slug|purpose|risk|description (one line, pipe-delimited)
TIER1_MANIFEST=(
  "scripts/deploy-gate.sh|deploy/deploy-gate.sh|deploy_gate|deploy|high|Pre-deploy gate checks before worker ship"
  "scripts/deploy-full.sh|deploy/deploy-full.sh|deploy_full|deploy|high|Full prod pipeline (frontend R2 + worker wrangler deploy)"
  "scripts/deploy-with-record.sh|deploy/deploy-with-record.sh|deploy_with_record|deploy|high|Deploy with D1 deployment ledger record"
  "scripts/deploy-gate.sh|deploy/deploy-gate.sh|deploy_gate|deploy|high|Pre-deploy audit / production gate (npm run deploy:full)"
  "scripts/deploy-frontend.sh|deploy/deploy-frontend.sh|deploy_frontend|deploy|high|Vite build + R2 dashboard sync + worker deploy"
  "scripts/deploy-cf-builds-prod.sh|deploy/deploy-cf-builds-prod.sh|deploy_cf_builds|deploy|high|Cloudflare Builds production deploy hook"
  "scripts/deploy-test-promote.sh|deploy/deploy-test-promote.sh|deploy_test_promote|deploy|high|Test-to-prod promote script"
  "scripts/post-deploy-record.sh|deploy/post-deploy-record.sh|post_deploy_record|deploy|medium|Write post-deploy row to D1 ledger"
  "scripts/upload-auth-pages.sh|deploy/upload-auth-pages.sh|upload_auth_pages|deploy|medium|Upload static auth HTML to R2 (no worker redeploy)"
  "scripts/deploy-stack.sh|deploy/deploy-stack.sh|deploy_stack|deploy|high|Stack deploy orchestrator"
  "scripts/rotate-supabase-db-password.sh|maintenance/rotate-supabase-db-password.sh|rotate_supabase_db_password|infra|high|Rotate Supabase DB password and sync Hyperdrive"
  "scripts/sync-supabase-db-password.sh|maintenance/sync-supabase-db-password.sh|sync_supabase_db_password|infra|high|Sync existing Supabase DB password to env + Hyperdrive"
  "scripts/verify-supabase-pg.mjs|maintenance/verify-supabase-pg.mjs|verify_supabase_pg|audit|low|Verify Supabase Postgres + agentsam RAG tables"
  "scripts/verify-supabase-documents.mjs|maintenance/verify-supabase-documents.mjs|verify_supabase_documents|audit|low|Verify Supabase documents REST lane"
  "scripts/d1_bloat_audit.py|maintenance/d1_bloat_audit.py|d1_bloat_audit|maintenance|low|D1 size audit — table row counts and bloat signals"
  "scripts/populate-autorag.sh|maintenance/populate-autorag.sh|populate_autorag|maintenance|low|Seed autorag R2 knowledge stubs"
  "scripts/upload-agentsam-scripts-r2.sh|maintenance/upload-agentsam-scripts-r2.sh|upload_agentsam_scripts_r2|maintenance|low|Push canonical scripts to inneranimalmedia-autorag/scripts/"
  "scripts/upload-iam-skills-autorag.sh|maintenance/upload-iam-skills-autorag.sh|upload_iam_skills_autorag|maintenance|low|Upload skills/*/SKILL.md to autorag bucket"
  "scripts/with-cloudflare-env.sh|maintenance/with-cloudflare-env.sh|with_cloudflare_env|maintenance|low|Load .env.cloudflare for wrangler and node scripts"
  "scripts/validate_agentsam_ops_ledger.sh|maintenance/validate_agentsam_ops_ledger.sh|validate_agentsam_ops_ledger|maintenance|low|Validate agentsam ops ledger tables"
  "scripts/d1-dump-deploy-metrics-last2.sh|maintenance/d1-dump-deploy-metrics-last2.sh|d1_dump_deploy_metrics_last2|maintenance|low|Snapshot deploy metrics tables from D1"
  "scripts/install-terminal-tunnel-env.sh|infra/install-terminal-tunnel-env.sh|install_terminal_tunnel_env|infra|high|Install terminal tunnel env on operator VM"
  "scripts/sync-vm-env-cloudflare.sh|infra/sync-vm-env-cloudflare.sh|sync_vm_env_cloudflare|infra|high|Sync VM env from Cloudflare secrets pattern"
  "scripts/sync-cloudflare-env-from-zshrc.sh|infra/sync-cloudflare-env-from-zshrc.sh|sync_cloudflare_env_from_zshrc|infra|medium|Pull Cloudflare tokens from zshrc into .env.cloudflare"
  "scripts/d1-apply-pending.mjs|cicd/d1-apply-pending.mjs|d1_apply_pending|cicd|high|Apply pending D1 migrations from migrations/"
  "scripts/verify-wrangler-production.sh|cicd/verify-wrangler-production.sh|verify_wrangler_production|cicd|low|Verify wrangler.production.toml bindings vs prod"
  "scripts/guard-no-hardcoded-identity.sh|cicd/guard-no-hardcoded-identity.sh|guard_no_hardcoded_identity|cicd|low|Fail CI if hardcoded tenant/ws ids in hot paths"
  "scripts/agentsam-tools-catalog-smoke.mjs|test/agentsam-tools-catalog-smoke.mjs|agentsam_tools_catalog_smoke|test|low|Smoke agentsam_tools catalog resolution"
  "scripts/mcp-smoke.mjs|test/mcp-smoke.mjs|smoke_mcp|test|low|MCP OAuth + tools smoke"
  "scripts/reindex_codebase_dashboard_agent.mjs|ingest/reindex_codebase_dashboard_agent.mjs|reindex_codebase_dashboard_agent|ingest|medium|Reindex dashboard/agent source into Supabase + Vectorize codebase index"
  "scripts/ingest_r2_to_rag.mjs|ingest/ingest_r2_to_rag.mjs|ingest_r2_to_rag|ingest|medium|Ingest autorag R2 knowledge/recipes/skills into documents Vectorize index"
  "scripts/lib/pwa-sw-manifest-tiers.mjs|deploy/pwa-sw-manifest-tiers.mjs|pwa_sw_manifest_tiers|deploy|low|Build tiered PWA precache manifest from dashboard/dist at deploy time"
  "scripts/test/smoke-execos-chain.sh|test/smoke-execos-chain.sh|smoke_execos_chain|test|low|Smoke execos health, /run gcp chain, demo models gate"
  "scripts/test/smoke-workers-ai-catalog.mjs|test/smoke-workers-ai-catalog.mjs|smoke_workers_ai_catalog|test|low|Smoke execos WAI probe + D1 active picker count"
  "scripts/audit/audit-workers-ai-inventory.mjs|audit/audit-workers-ai-inventory.mjs|audit_workers_ai_inventory|audit|low|Audit agentsam_model_catalog vs agentsam_ai Workers AI inventory"
)

content_type_for() {
  case "$1" in
    *.sh) echo "text/x-shellscript; charset=utf-8" ;;
    *.mjs|*.js) echo "text/javascript; charset=utf-8" ;;
    *.py) echo "text/x-python; charset=utf-8" ;;
    *.md) echo "text/markdown; charset=utf-8" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *) echo "text/plain; charset=utf-8" ;;
  esac
}

r2_put() {
  local key="$1"
  local file="$2"
  local ct
  ct="$(content_type_for "$(basename "$file")")"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${key}" \
    --file="$file" \
    --content-type="$ct" \
    --remote \
    -c "$TOML"
}

write_meta_sidecar() {
  local repo_rel="$1"
  local r2_sub="$2"
  local slug="$3"
  local purpose="$4"
  local risk="$5"
  local desc="$6"
  local abs="${REPO_ROOT}/${repo_rel}"
  local base
  base="$(basename "$r2_sub")"
  local meta_base="${base}.meta.md"
  local meta_path="${STAGING}/${purpose}/${meta_base}"
  local hash
  hash="$(shasum -a 256 "$abs" | awk '{print $1}')"
  local inv="./${repo_rel}"
  mkdir -p "$(dirname "$meta_path")"
  cat >"$meta_path" <<EOF
---
lane: ${purpose}
slug: ${slug}
risk: ${risk}
status: canonical
canonical_repo: ${repo_rel}
r2_key: ${R2_PREFIX}/${r2_sub}
sha256: ${hash}
invocation: ./${repo_rel}
updated: $(date -u +%Y-%m-%d)
---

# ${base}

${desc}

Run from repo root: \`${inv}\`

Registry: \`agentsam_scripts.slug=${slug}\` · \`source_stored=r2:${BUCKET}/${R2_PREFIX}/${r2_sub}\`
EOF
  echo "$meta_path"
}

upload_script_entry() {
  local repo_rel="$1"
  local r2_sub="$2"
  local slug="$3"
  local purpose="$4"
  local risk="$5"
  local desc="$6"
  local abs="${REPO_ROOT}/${repo_rel}"
  if [[ ! -f "$abs" ]]; then
    echo "⊘ Skip missing: $repo_rel" >&2
    return 0
  fi
  local key="${R2_PREFIX}/${r2_sub}"
  local hash
  hash="$(shasum -a 256 "$abs" | awk '{print $1}')"

  echo "→ R2 ${BUCKET}/${key}  slug=${slug}  sha256=${hash:0:12}…"
  r2_put "$key" "$abs"

  local meta_path
  meta_path="$(write_meta_sidecar "$repo_rel" "$r2_sub" "$slug" "$purpose" "$risk" "$desc")"
  local meta_key="${R2_PREFIX}/${purpose}/$(basename "$meta_path")"
  echo "→ R2 ${BUCKET}/${meta_key}  (sidecar)"
  r2_put "$meta_key" "$meta_path"

  INVENTORY_ENTRIES+=("$(jq -nc \
    --arg slug "$slug" \
    --arg lane "$purpose" \
    --arg repo "$repo_rel" \
    --arg r2_key "${R2_PREFIX}/${r2_sub}" \
    --arg meta_key "$meta_key" \
    --arg sha256 "$hash" \
    --arg risk "$risk" \
    --arg status "canonical" \
    '{slug:$slug,lane:$lane,repo:$repo,r2_key:$r2_key,meta_key:$meta_key,sha256:$sha256,risk:$risk,status:$status}')")
}

build_inventory() {
  local lanes_json
  lanes_json="$(printf '%s\n' "${INVENTORY_ENTRIES[@]}" | jq -s '
    group_by(.lane) |
    map({key: .[0].lane, value: .}) |
    from_entries
  ')"
  jq -nc \
    --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson lanes "$lanes_json" \
    --argjson count "${#INVENTORY_ENTRIES[@]}" \
    '{
      schema: "iam-autorag-scripts-inventory/v1",
      bucket: "inneranimalmedia-autorag",
      prefix: "scripts",
      generated_at: $generated_at,
      canonical_count: $count,
      lanes: $lanes
    }' >"$INDEX_JSON"
}

upload_readme() {
  local readme_src="${REPO_ROOT}/scripts/autorag-scripts/README.md"
  if [[ ! -f "$readme_src" ]]; then
    echo "✗ Missing $readme_src" >&2
    exit 1
  fi
  echo "→ R2 ${BUCKET}/${R2_PREFIX}/README.md"
  r2_put "${R2_PREFIX}/README.md" "$readme_src"
}

sync_script_hashes_d1() {
  local sql_file="${STAGING}/_index/script_hashes.sql"
  {
    echo "-- generated by upload-agentsam-scripts-r2.sh $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    for entry in "${INVENTORY_ENTRIES[@]}"; do
      local slug sha
      slug="$(echo "$entry" | jq -r '.slug')"
      sha="$(echo "$entry" | jq -r '.sha256')"
      printf "UPDATE agentsam_scripts SET script_hash = '%s', updated_at_epoch = unixepoch() WHERE slug = '%s';\n" "$sha" "$slug"
    done
  } >"$sql_file"
  if ((${#INVENTORY_ENTRIES[@]})); then
    echo "→ D1 script_hash sync (${#INVENTORY_ENTRIES[@]} slugs)"
    ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
      --remote -c "$TOML" --file="$sql_file" >/dev/null
  fi
}

# ── Parse CLI args or default tier-1 ─────────────────────────────────────────
declare -a ENTRIES=()
if (($#)); then
  for arg in "$@"; do
    if [[ "$arg" == *"|"* ]]; then
      ENTRIES+=("$arg")
    elif [[ "$arg" == *:* ]]; then
      repo_rel="${arg%%:*}"
      r2_sub="${arg#*:}"
      base="$(basename "$repo_rel")"
      slug="${base//-/_}"
      slug="${slug//./_}"
      lane="${r2_sub%%/*}"
      ENTRIES+=("${repo_rel}|${r2_sub}|${slug}|${lane}|low|Uploaded ad hoc")
    else
      echo "Usage: $0 [repo/path:lane/file.sh] or full manifest line" >&2
      exit 1
    fi
  done
else
  ENTRIES=("${TIER1_MANIFEST[@]}")
fi

mkdir -p "${STAGING}/_index"
declare -a INVENTORY_ENTRIES=()

echo "Uploading ${#ENTRIES[@]} script(s) to R2 ${BUCKET}/${R2_PREFIX}/"
for entry in "${ENTRIES[@]}"; do
  IFS='|' read -r repo_rel r2_sub slug purpose risk desc <<<"$entry"
  upload_script_entry "$repo_rel" "$r2_sub" "$slug" "$purpose" "$risk" "$desc"
done

build_inventory
echo "→ R2 ${BUCKET}/${R2_PREFIX}/_index/inventory.json"
r2_put "${R2_PREFIX}/_index/inventory.json" "$INDEX_JSON"

upload_readme

sync_script_hashes_d1

echo "✓ Done. ${#INVENTORY_ENTRIES[@]} canonical script(s)."
echo "  Inventory: r2://${BUCKET}/${R2_PREFIX}/_index/inventory.json"
echo "  Apply D1: migrations/560_autorag_scripts_tier1_purpose_lanes.sql"
