#!/usr/bin/env bash
# ship:remote — Mac-free production ship from VM / phone / any git host.
#
# Contract (LOCKED):
#   • Never run Vite, rclone, or deploy:full on the GCP iam-tunnel VM (OOM / crash).
#   • Ship = commit (if needed) + push to main → Cloudflare Workers Builds runs
#     smart-build (Vite) + deploy:fast (R2 delta + wrangler) on CF infrastructure.
#   • Optional: fire deploy hook if push alone does not trigger Builds.
#
# Usage (on VM as agentsam, or any remote lane):
#   npm run ship:remote
#   npm run ship:remote -- --worker-only   # emergency: wrangler only, no dashboard
#   npm run ship:remote -- --dry-run
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
WORKER_ONLY=0
NO_PUSH=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --worker-only) WORKER_ONLY=1 ;;
    --no-push) NO_PUSH=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
  esac
done

if [[ -f "$REPO_ROOT/.env.cloudflare" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env.cloudflare"
  set +a
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
DIRTY="$(git status --porcelain 2>/dev/null || true)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[ship:remote] Mac-free ship — push → Cloudflare Builds (not this host)"
echo "[ship:remote] branch=${BRANCH} sha=${SHA} host=$(hostname 2>/dev/null || echo unknown)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -n "$DIRTY" ]]; then
  echo "✗ Working tree dirty — commit (or stash) before ship:remote:" >&2
  echo "$DIRTY" | head -40 >&2
  exit 1
fi

if [[ "$WORKER_ONLY" == "1" ]]; then
  echo "→ --worker-only: wrangler deploy on this host (no Vite / no R2 dashboard)"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] would: IAM_SKIP_GCP_VM_SYNC=1 wrangler deploy -c wrangler.production.toml"
    exit 0
  fi
  export IAM_SKIP_GCP_VM_SYNC=1
  ./scripts/with-cloudflare-env.sh npm exec -- wrangler deploy -c wrangler.production.toml
  echo "[ship:remote] ✓ worker-only deployed. Dashboard assets unchanged."
  echo "  For SPA/PWA: push to main so CF Builds runs deploy:fast, or wake Mac and npm run deploy:fast"
  exit 0
fi

if [[ "$BRANCH" != "main" && "$BRANCH" != "production" ]]; then
  echo "⚠️  Not on main/production (on ${BRANCH}). CF Builds main trigger may not run." >&2
  echo "   Push anyway, or checkout main first." >&2
fi

if [[ "$NO_PUSH" != "1" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] would: git push -u origin HEAD"
  else
    echo "→ git push origin HEAD…"
    git push -u origin HEAD
  fi
else
  echo "→ --no-push: skipping git push"
fi

# Optional explicit deploy-hook kick (when watch paths miss dashboard-only commits, etc.)
trigger_hook() {
  local url="${AGENT_SAM_DEPLOY_HOOK_URL:-${CF_BUILDS_DEPLOY_HOOK_URL:-}}"
  if [[ -z "$url" ]]; then
    if [[ -n "${INTERNAL_API_SECRET:-}${AGENTSAM_BRIDGE_KEY:-}" ]]; then
      echo "→ Trigger Workers Build via /api/internal/trigger-workers-build…"
      if [[ "$DRY_RUN" == "1" ]]; then
        echo "[dry-run] would POST https://inneranimalmedia.com/api/internal/trigger-workers-build"
        return 0
      fi
      local auth_h=()
      if [[ -n "${AGENTSAM_BRIDGE_KEY:-}" ]]; then
        auth_h=(-H "Authorization: Bearer ${AGENTSAM_BRIDGE_KEY}")
      else
        auth_h=(-H "X-Internal-Secret: ${INTERNAL_API_SECRET}")
      fi
      curl -sS -X POST "https://inneranimalmedia.com/api/internal/trigger-workers-build" \
        "${auth_h[@]}" \
        -H "Content-Type: application/json" \
        -d '{}' --max-time 30 || echo "⚠️  trigger-workers-build non-zero (push may still have triggered Builds)" >&2
      return 0
    fi
    echo "→ No deploy hook / INTERNAL_API_SECRET — relying on git push trigger alone"
    return 0
  fi
  echo "→ POST deploy hook…"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] would POST deploy hook"
    return 0
  fi
  curl -sS -X POST "$url" --max-time 30 || echo "⚠️  deploy hook non-zero" >&2
}

# Always kick hook after push so dashboard-only commits still ship even if watch paths are narrow.
trigger_hook

echo ""
echo "[ship:remote] ✓ handed off to Cloudflare Workers Builds"
echo "  Expected CF pipeline: smart-build (Vite) → deploy:fast (R2 delta + wrangler)"
echo "  Do NOT run npm run deploy:full on this VM."
echo "  Proof: Cloudflare dashboard → Workers → inneranimalmedia → Builds"
echo "  Or:    curl -sf https://inneranimalmedia.com/api/health"
