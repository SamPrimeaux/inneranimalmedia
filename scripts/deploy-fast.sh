#!/usr/bin/env bash
# deploy:fast — critical path only (< ~60–90s typical after first warm R2).
#   1. Vite build + cache bump (unless DEPLOY_FAST_SKIP_BUILD=1)
#   2. Content-hash R2 delta sync (no rclone, no --checksum crawl)
#   3. wrangler deploy worker
#
# No blocking post-hooks (email, memory sync, GCP VM sync, games/marketing uploads,
# lane registry, embed-sitemap). Those belong in deploy:full / fire-and-forget.
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

if [[ -z "${R2_ACCESS_KEY_ID:-}" || -z "${R2_SECRET_ACCESS_KEY:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  if [[ -n "${CLOUDFLARE_API_TOKEN:-}" || -n "${CF_API_TOKEN:-}" ]]; then
    echo "⚠️  R2 S3 keys unset — r2-dashboard-delta-sync will use wrangler fallback"
  else
    echo "✗ Need R2 S3 keys (.env.cloudflare) or CLOUDFLARE_API_TOKEN for wrangler R2 fallback" >&2
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
else
  echo "→ DEPLOY_FAST_SKIP_R2=1 — skipping R2"
fi

WORKER_VERSION_ID=""
if [[ "$SKIP_WORKER" != "1" ]]; then
  echo "→ Wrangler deploy (-c ${TOML})…"
  DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/iam-deploy-fast.XXXXXX")"
  if ! ./scripts/with-cloudflare-env.sh npx wrangler deploy -c "$TOML" 2>&1 | tee "$DEPLOY_LOG"; then
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
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo ""
echo "[deploy:fast] ✓ done in $((FAST_END - FAST_START))s sha=${GIT_SHA} worker=${WORKER_VERSION_ID:-n/a}"
echo "[deploy:fast] post-hooks skipped — run npm run deploy:full for email/memory/GCP, or ship:remote from VM"
