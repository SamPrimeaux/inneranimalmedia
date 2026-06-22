#!/usr/bin/env bash
# Build + push iam-cad-worker container to Cloudflare Registry.
# Requires: Docker Desktop running, wrangler logged in.
# NOTE: --platform linux/amd64 required — CF Containers expect amd64.
#       On Apple Silicon this uses QEMU emulation (~15-30 min first build).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon not running. Start Docker Desktop, then re-run:" >&2
  echo "  $0" >&2
  exit 1
fi

PUSH_ONLY=0
TAG="cad-v1"
for arg in "$@"; do
  case "$arg" in
    --push-only) PUSH_ONLY=1 ;;
    -*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *) TAG="$arg" ;;
  esac
done

IMAGE="meauxcontainer-cad-worker:${TAG}"
REGISTRY="registry.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2"
FULL="${REGISTRY}/${IMAGE}"

if [[ "$PUSH_ONLY" -eq 0 ]]; then
  echo "Building ${FULL} for linux/amd64 (repo root context) ..."
  docker build --platform linux/amd64 -f containers/iam-cad-worker/Dockerfile -t "${FULL}" .
else
  if ! docker image inspect "${FULL}" >/dev/null 2>&1; then
    echo "Image not found locally: ${FULL}" >&2
    echo "Run without --push-only first." >&2
    exit 1
  fi
  echo "Skipping build — retrying push for ${FULL} ..."
fi

echo "Pushing to Cloudflare registry (large apt layer ~877MB — flaky networks may need several tries) ..."

# Docker Desktop proxy (3128) and shell HTTP_PROXY often cause broken pipe on big blobs.
push_image() {
  env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
    npx wrangler containers push "${FULL}"
}

if ! push_image; then
  echo "" >&2
  echo "wrangler push failed — retrying push ..." >&2
  if ! push_image; then
    echo "" >&2
    echo "Push failed. Common causes on Cox / bad uplink:" >&2
    echo "  • Docker Desktop → Settings → Proxies → disable manual proxy" >&2
    echo "  • env | grep -i proxy  (unset before retry)" >&2
    echo "  • Retry on phone hotspot or wait for uplink to stabilize" >&2
    echo "" >&2
    echo "Retry without rebuilding:" >&2
    echo "  npm run container:cad-worker:push" >&2
    echo "  $0 --push-only ${TAG}" >&2
    exit 1
  fi
fi

echo "Done. Deploy worker: npm run deploy:full"
echo "Smoke: curl -H \"X-Internal-Secret: \$INTERNAL_API_SECRET\" https://inneranimalmedia.com/api/internal/cad-container/health"
echo "Production CAD traffic stays on GCP until CAD_DISPATCH_TARGET=auto|container"
