#!/usr/bin/env bash
# Sync MovieMode lane from inneranimalmedia monorepo into this product repo.
set -euo pipefail
IAM_ROOT="${IAM_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)/../inneranimalmedia}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -d "$IAM_ROOT/src/api/moviemode-api.js" && ! -f "$IAM_ROOT/src/api/moviemode-api.js" ]]; then
  IAM_ROOT="${IAM_ROOT:-$HOME/inneranimalmedia}"
fi
if [[ ! -f "$IAM_ROOT/src/api/moviemode-api.js" ]]; then
  echo "Set IAM_ROOT to inneranimalmedia checkout" >&2
  exit 1
fi

echo "Syncing from $IAM_ROOT → $ROOT"

# Worker API + core
mkdir -p "$ROOT/worker/src/api/webhooks" "$ROOT/worker/src/core"
for f in \
  moviemode-api.js cloudconvert-api.js \
  webhooks/cloudconvert.js webhooks/stream.js; do
  cp "$IAM_ROOT/src/api/$f" "$ROOT/worker/src/api/$f"
done
for f in \
  moviemode-conversions.js moviemode-cloudconvert-webhook.js moviemode-live-inputs.js \
  moviemode-media-vectorize.js moviemode-persistence.js moviemode-projects.js \
  moviemode-templates.js moviemode-whisper.js moviemode-veo-poll.js \
  cloudconvert-api.js cloudconvert-workflows.js cloudconvert-webhook-verify.js \
  stream-api.js stream-webhook-verify.js; do
  cp "$IAM_ROOT/src/core/$f" "$ROOT/worker/src/core/$f"
done
cp "$IAM_ROOT/src/tools/builtin/moviemode.js" "$ROOT/worker/src/core/moviemode-tools.js"

# Studio (dashboard MovieMode)
mkdir -p "$ROOT/studio/src/features/moviemode" "$ROOT/studio/src/pages/moviemode" \
  "$ROOT/studio/src/hooks" "$ROOT/studio/src/types" "$ROOT/studio/src/lib"
cp -R "$IAM_ROOT/dashboard/features/moviemode/." "$ROOT/studio/src/features/moviemode/"
cp "$IAM_ROOT/dashboard/pages/moviemode/MovieModePage.tsx" "$ROOT/studio/src/pages/moviemode/"
cp "$IAM_ROOT/dashboard/hooks/useMovieModeProject.ts" "$ROOT/studio/src/hooks/"
cp "$IAM_ROOT/dashboard/src/types/moviemode.ts" "$ROOT/studio/src/types/"
cp "$IAM_ROOT/dashboard/src/lib/moviemodeStudioEvents.ts" "$ROOT/studio/src/lib/"
cp "$IAM_ROOT/dashboard/src/lib/fileKind.ts" "$ROOT/studio/src/lib/"
cp "$IAM_ROOT/dashboard/src/lib/r2MultipartUpload.ts" "$ROOT/studio/src/lib/" 2>/dev/null || true

# Migrations + docs + scripts
mkdir -p "$ROOT/migrations" "$ROOT/docs" "$ROOT/scripts"
for m in \
  341_moviemode_media_backend.sql \
  342_moviemode_edit_sessions.sql \
  568_moviemode_multimodal_vectorize.sql \
  581_project_ds_moviemode_align.sql \
  615_moviemode_artifact_link_and_tools.sql \
  617_moviemode_templates_conversions.sql \
  618_moviemode_live_inputs_stream_webhooks.sql \
  619_cloudconvert_webhook_registry.sql; do
  [[ -f "$IAM_ROOT/migrations/$m" ]] && cp "$IAM_ROOT/migrations/$m" "$ROOT/migrations/"
done
cp "$IAM_ROOT/docs/MOVIEMODE.md" "$ROOT/docs/"
cp "$IAM_ROOT/scripts/moviemode-remotion-render.mjs" "$ROOT/scripts/" 2>/dev/null || true
cp "$IAM_ROOT/scripts/cloudconvert-sync-webhook-secret.mjs" "$ROOT/scripts/" 2>/dev/null || true

echo "Sync complete."
