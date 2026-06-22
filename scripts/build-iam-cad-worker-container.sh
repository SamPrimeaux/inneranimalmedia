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

TAG="${1:-cad-v1}"
IMAGE="meauxcontainer-cad-worker:${TAG}"
REGISTRY="registry.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2"
FULL="${REGISTRY}/${IMAGE}"

echo "Building ${FULL} for linux/amd64 (repo root context) ..."
docker build \
  --platform linux/amd64 \
  -f containers/iam-cad-worker/Dockerfile \
  -t "${FULL}" .

echo "Pushing to Cloudflare registry ..."
npx wrangler containers push "${FULL}"

echo "Done. Deploy worker: npm run deploy:full"
echo "Smoke: curl -H \"X-Internal-Secret: \$INTERNAL_API_SECRET\" https://inneranimalmedia.com/api/internal/cad-container/health"
echo "Production CAD traffic stays on GCP until CAD_DISPATCH_TARGET=auto|container"
