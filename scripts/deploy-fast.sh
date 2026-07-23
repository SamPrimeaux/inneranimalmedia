#!/usr/bin/env bash
# deploy:fast — critical path only (< ~60–90s typical after first warm R2).
#   1. Vite build + cache bump (unless DEPLOY_FAST_SKIP_BUILD=1)
#   2. Content-hash R2 delta sync (no rclone, no --checksum crawl)
#   3. wrangler deploy worker
#   4. Fire-and-forget D1 deployments row via post-deploy-record.sh (non-blocking)
#
# No blocking post-hooks (email, memory sync, GCP VM sync, games/marketing uploads,
# lane registry, embed-sitemap). Those belong in deploy:full / fire-and-forget.
# Opt out of the async ledger write: SKIP_DEPLOY_RECORD=1
#
# Safe hosts: Mac, Cloudflare Workers Builds, any CI with R2 S3 keys.
# Unsafe: GCP iam-tunnel for Vite — use npm run ship:remote instead (push → CF Builds).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f "$REPO_ROOT/.env.cloudflare" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env.cloudflare"
  set +a
fi

DIST="dashboard/dist"
TOML="${CF_BUILDS_WRANGLER_CONFIG:-wrangler.production.toml}"
BUCKET="inneranimalmedia"
PREFIX="static/dashboard/app"
SKIP_BUILD="${DEPLOY_FAST_SKIP_BUILD:-0}"
SKIP_WORKER="${DEPLOY_FAST_SKIP_WORKER:-0}"
SKIP_R2="${DEPLOY_FAST_SKIP_R2:-0}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[deploy:fast] critical path — vite → R2 delta → wrangler"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# AGENTS.md §9 — refuse ship if trail writers / loader regress
if [[ "${SKIP_ENGINEERING_LAWS_GUARD:-0}" != "1" ]]; then
  node "$REPO_ROOT/scripts/guard-engineering-laws.mjs" || {
    echo "[deploy:fast] FATAL: guard:engineering-laws failed" >&2
    exit 1
  }
fi

FAST_START=$(date +%s)

if [[ "$SKIP_BUILD" != "1" ]]; then
  # shellcheck source=scripts/ensure-iam-npm-deps.sh
  source "$REPO_ROOT/scripts/ensure-iam-npm-deps.sh"
  ensure_iam_npm_deps || {
    echo "✗ ensure-iam-npm-deps failed" >&2
    exit 1
  }
  echo "→ Clean ${DIST}, Vite build + cache bump…"
  rm -rf "$REPO_ROOT/$DIST"
  bash "$REPO_ROOT/scripts/copy-cms-vendor.sh"
  export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-${SUPABASE_URL:-}}"
  export VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}"
  (cd "$REPO_ROOT" && npm run build:vite-only)
  (cd "$REPO_ROOT" && node scripts/bump-cache.js)
else
  echo "→ DEPLOY_FAST_SKIP_BUILD=1 — using existing ${DIST}"
fi

if [[ ! -f "$REPO_ROOT/$DIST/index.html" ]]; then
  echo "✗ Missing $REPO_ROOT/$DIST/index.html — aborting" >&2
  exit 1
fi

if [[ -z "${R2_ACCESS_KEY_ID:-}" || -z "${R2_SECRET_ACCESS_KEY:-}" ]]; then
  if [[ -n "${CLOUDFLARE_API_TOKEN:-}${CF_API_TOKEN:-}" ]]; then
    echo "→ R2 via Cloudflare API token (cf-api backend — parallel, no wrangler-per-file)"
  else
    echo "✗ Need R2 S3 keys or CLOUDFLARE_API_TOKEN for R2 delta sync" >&2
    exit 1
  fi
fi

find "$REPO_ROOT/$DIST" -name "*.map" -delete 2>/dev/null || true

if [[ "$SKIP_R2" != "1" ]]; then
  echo "→ R2 content-hash delta sync (${PREFIX}/ + PWA + canonical)…"
  node "$REPO_ROOT/scripts/r2-dashboard-delta-sync.mjs" \
    --dist "$REPO_ROOT/$DIST" \
    --bucket "$BUCKET" \
    --prefix "$PREFIX"

  # PWA control-plane: services.inneranimalmedia.com must learn new cache_bust or phone SW stays on stale chunks.
  if [[ "${SKIP_SERVICES_SW_INGEST:-}" == "1" ]]; then
    echo "[deploy:fast] SKIP_SERVICES_SW_INGEST=1 — skipping services SW ingest"
  elif [[ -f "$REPO_ROOT/.deploy-sw-tiered-manifest.json" ]]; then
    echo "→ Services SW manifest ingest (PWA control-plane)…"
    if ! node "$REPO_ROOT/scripts/post-services-sw-manifest-ingest.mjs" \
      --manifest="$REPO_ROOT/.deploy-sw-tiered-manifest.json"; then
      if [[ "${STRICT_SERVICES_SW_INGEST:-}" == "1" ]]; then
        echo "✗ Services SW ingest failed (STRICT_SERVICES_SW_INGEST=1)" >&2
        exit 1
      fi
      echo "⚠️  Services SW ingest non-zero — phone PWA may keep stale cache_bust until ingest succeeds" >&2
    fi
  else
    echo "⚠️  Missing .deploy-sw-tiered-manifest.json — services SW ingest skipped" >&2
  fi
else
  echo "→ DEPLOY_FAST_SKIP_R2=1 — skipping R2"
fi

WORKER_VERSION_ID=""
if [[ "$SKIP_WORKER" != "1" ]]; then
  echo "→ Wrangler deploy (-c ${TOML})…"
  # Never use with-cloudflare-env.sh on CF Builds — it requires zsh (missing in build image).
  run_wrangler_deploy() {
    if [[ -n "${CLOUDFLARE_API_TOKEN:-}${CF_API_TOKEN:-}" ]]; then
      export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN}}"
      # Ensure account id for wrangler when not already exported (CF Builds).
      if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
        CLOUDFLARE_ACCOUNT_ID="$(
          grep -E '^\s*account_id\s*=' "$TOML" 2>/dev/null | head -1 | sed -E 's/.*=\s*"([^"]+)".*/\1/' || true
        )"
        if [[ -z "${CLOUDFLARE_ACCOUNT_ID}" ]]; then
          CLOUDFLARE_ACCOUNT_ID="$(
            grep -E '^\s*CLOUDFLARE_ACCOUNT_ID\s*=' "$TOML" 2>/dev/null | head -1 | sed -E 's/.*=\s*"([^"]+)".*/\1/' || true
          )"
        fi
        export CLOUDFLARE_ACCOUNT_ID
      fi
      npx wrangler deploy -c "$TOML"
    elif command -v zsh >/dev/null 2>&1 && [[ -x "$REPO_ROOT/scripts/with-cloudflare-env.sh" ]]; then
      "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler deploy -c "$TOML"
    else
      echo "✗ CLOUDFLARE_API_TOKEN unset and zsh wrapper unavailable" >&2
      return 1
    fi
  }
  DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/iam-deploy-fast.XXXXXX")"
  if ! run_wrangler_deploy 2>&1 | tee "$DEPLOY_LOG"; then
    rm -f "$DEPLOY_LOG"
    echo "✗ Worker deploy failed" >&2
    exit 1
  fi
  WORKER_VERSION_ID="$(grep -E "Current Version ID:|Version ID:" "$DEPLOY_LOG" 2>/dev/null | tail -1 | awk '{print $NF}' || true)"
  rm -f "$DEPLOY_LOG"
else
  echo "→ DEPLOY_FAST_SKIP_WORKER=1 — skipping wrangler"
fi

FAST_END=$(date +%s)
DEPLOY_SECONDS=$((FAST_END - FAST_START))
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
GIT_MSG="$(git -C "$REPO_ROOT" log -1 --pretty=format:'%s' 2>/dev/null || echo '')"
echo ""
echo "[deploy:fast] ✓ done in ${DEPLOY_SECONDS}s sha=${GIT_SHA} worker=${WORKER_VERSION_ID:-n/a}"

# Keep deployments Overview true on the fast path — BLOCKING trail write + hard gate.
# Async was a lie: deploy reported success while changed_files/ship trio could be empty.
if [[ "${SKIP_DEPLOY_RECORD:-0}" == "1" ]]; then
  if [[ "${ALLOW_SKIP_DEPLOY_TRAIL:-0}" == "1" ]]; then
    echo "[deploy:fast] SKIP_DEPLOY_RECORD=1 with ALLOW_SKIP_DEPLOY_TRAIL=1 — trail bypass logged" >&2
    ./scripts/with-cloudflare-env.sh node "$REPO_ROOT/scripts/notify-ops.mjs" \
      --severity=critical \
      --message="deploy:fast SKIP_DEPLOY_RECORD with ALLOW_SKIP_DEPLOY_TRAIL sha=${GIT_SHA}" || true
  else
    echo "[deploy:fast] FATAL: SKIP_DEPLOY_RECORD=1 is a hard failure (set ALLOW_SKIP_DEPLOY_TRAIL=1 to bypass with audit)" >&2
    exit 1
  fi
else
  export CLOUDFLARE_VERSION_ID="${WORKER_VERSION_ID:-}"
  export DEPLOY_SECONDS
  export TRIGGERED_BY="${TRIGGERED_BY:-deploy_fast}"
  export DEPLOYED_BY="${DEPLOYED_BY:-deploy_fast}"
  export DEPLOYMENT_NOTES="${DEPLOYMENT_NOTES:-${GIT_MSG:-deploy:fast sha=${GIT_SHA}}}"
  export BUILD_PIPELINE="${BUILD_PIPELINE:-deploy_fast}"
  if [[ "${SKIP_DASHBOARD_VERSIONS:-0}" == "1" && "${ALLOW_SKIP_DEPLOY_TRAIL:-0}" != "1" ]]; then
    echo "[deploy:fast] FATAL: SKIP_DASHBOARD_VERSIONS=1 is a hard failure without ALLOW_SKIP_DEPLOY_TRAIL=1" >&2
    exit 1
  fi
  echo "[deploy:fast] post-deploy-record (blocking)…"
  if ! bash "$REPO_ROOT/scripts/post-deploy-record.sh"; then
    echo "[deploy:fast] FATAL: post-deploy-record failed — trail incomplete" >&2
    exit 1
  fi
  echo "[deploy:fast] deploy-trail-gate…"
  if ! bash "$REPO_ROOT/scripts/deploy-trail-gate.sh" "$(git -C "$REPO_ROOT" rev-parse HEAD)"; then
    echo "[deploy:fast] FATAL: deploy trail gate failed — NOT shipped" >&2
    exit 1
  fi
fi

echo "[deploy:fast] housekeeping skipped (email / D1 memory / GCP VM) — not required for PWA"
if [[ -z "${PUSH_SERVICE_TOKEN:-}" ]]; then
  echo "[deploy:fast] note: PUSH_SERVICE_TOKEN unset here — SW ingest skipped; set in .env.cloudflare and CF Builds secrets"
else
  echo "[deploy:fast] PUSH_SERVICE_TOKEN present — SW ingest auth available (also keep as CF Builds secret for ship:remote)"
fi
