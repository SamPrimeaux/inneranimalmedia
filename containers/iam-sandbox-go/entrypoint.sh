#!/bin/sh
# R2 FUSE mount is optional — never abort container boot on mkdir/mount failure.
set +e

mkdir -p /mnt/workspace /workspace /tmp/workspace /tmp/r2 2>/dev/null || true

R2_MOUNT="/tmp/r2"
if mkdir -p /mnt/r2 2>/dev/null; then
  R2_MOUNT="/mnt/r2"
fi
export R2_MOUNT

# Map IAM worker secrets (R2_ACCESS_KEY_ID) → tigrisfs AWS env (CF R2 FUSE docs).
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ]; then
  export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
fi
if [ -z "${AWS_SECRET_ACCESS_KEY:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]; then
  export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
fi
if [ -z "${R2_ACCOUNT_ID:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  export R2_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID}"
fi

if [ "${IAM_SANDBOX_R2_FUSE:-1}" != "0" ] \
  && [ -n "${R2_BUCKET_NAME:-}" ] \
  && [ -n "${AWS_ACCESS_KEY_ID:-}" ] \
  && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] \
  && [ -n "${R2_ACCOUNT_ID:-}" ] \
  && [ -x /usr/local/bin/tigrisfs ]; then
  R2_ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
  TIGRIS_FLAGS="--endpoint ${R2_ENDPOINT} -f"
  if [ "${IAM_R2_FUSE_READONLY:-0}" = "1" ]; then
    TIGRIS_FLAGS="${TIGRIS_FLAGS} -o ro"
  fi
  echo "[entrypoint] mounting R2 bucket ${R2_BUCKET_NAME} at ${R2_MOUNT}..."
  # shellcheck disable=SC2086
  /usr/local/bin/tigrisfs ${TIGRIS_FLAGS} "${R2_BUCKET_NAME}" "${R2_MOUNT}" 2>/dev/null &
  sleep 3

  if [ -n "${R2_BUCKET_PREFIX:-}" ] && [ -e "${R2_MOUNT}/${R2_BUCKET_PREFIX}" ]; then
    ln -sfn "${R2_MOUNT}/${R2_BUCKET_PREFIX}" /mnt/workspace 2>/dev/null || true
    echo "[entrypoint] workspace → ${R2_MOUNT}/${R2_BUCKET_PREFIX}"
  else
    ln -sfn "${R2_MOUNT}" /mnt/workspace 2>/dev/null || true
  fi
else
  echo "[entrypoint] R2 FUSE skipped (set R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY on worker, IAM_SANDBOX_R2_FUSE=1)"
fi

exec su-exec sandbox /app/iam-sandbox-go
