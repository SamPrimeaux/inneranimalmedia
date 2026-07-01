#!/usr/bin/env bash
# Build + push iam-sandbox-go container to Cloudflare Registry.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon not running. Start Docker Desktop, then re-run:" >&2
  echo "  $0" >&2
  exit 1
fi

TAG="${1:-sandbox-go-v1}"
IMAGE="inneranimalmedia:${TAG}"

echo "Building and pushing ${IMAGE} from containers/iam-sandbox-go ..."
npx wrangler containers build containers/iam-sandbox-go -t "${IMAGE}" -p

echo "Done. Registry tag: registry.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2/${IMAGE}"
echo "Deploy worker: npm run deploy:full"
