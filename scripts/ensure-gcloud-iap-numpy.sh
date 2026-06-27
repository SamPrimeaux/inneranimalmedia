#!/usr/bin/env bash
# Install NumPy into gcloud's bundled virtenv for faster IAP TCP forwarding.
# https://cloud.google.com/iap/docs/using-tcp-forwarding#increasing_the_tcp_upload_bandwidth
set -euo pipefail

if ! command -v gcloud >/dev/null 2>&1; then
  exit 0
fi

GCLOUD_VENV="${CLOUDSDK_PYTHON_VENV:-${HOME}/.config/gcloud/virtenv}"
PIP="${GCLOUD_VENV}/bin/pip"
PY="${GCLOUD_VENV}/bin/python3"

if [[ ! -x "$PIP" || ! -x "$PY" ]]; then
  exit 0
fi

if "$PY" -c "import numpy" >/dev/null 2>&1; then
  exit 0
fi

echo "[gcp-iap] installing numpy into gcloud virtenv (IAP tunnel throughput)…"
"$PIP" install -q numpy
