#!/usr/bin/env bash
# Upsert one KEY= value in .env.cloudflare (gitignored).
#
# Usage:
#   pbpaste | ./scripts/upsert-env-cloudflare-var.sh CLOUDCONVERT_API_KEY
#   printf '%s' 'your-key' | ./scripts/upsert-env-cloudflare-var.sh CLOUDCONVERT_API_KEY
#   ./scripts/upsert-env-cloudflare-var.sh CLOUDCONVERT_API_KEY   # hidden prompt
set -euo pipefail

KEY="${1:?usage: upsert-env-cloudflare-var.sh VAR_NAME}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.cloudflare"

if [[ -t 0 ]]; then
  read -rs VAL
  echo
else
  VAL="$(cat)"
fi
VAL="$(printf '%s' "$VAL" | tr -d '\n\r')"
if [[ -z "$VAL" ]]; then
  echo "ERROR: empty value for $KEY" >&2
  exit 1
fi

python3 - "$ENV_FILE" "$KEY" "$VAL" <<'PY'
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
new_line = f'{key}="{value}"'

lines = env_path.read_text().splitlines() if env_path.exists() else []
out = []
found = False
for line in lines:
    if line.strip().startswith(f"{key}="):
        if not found:
            out.append(new_line)
            found = True
    else:
        out.append(line)
if not found:
    if out and out[-1].strip():
        out.append("")
    out.append(f"# {key} — Worker: wrangler secret put {key} -c wrangler.production.toml")
    out.append(new_line)
env_path.write_text("\n".join(out).rstrip() + "\n")
print(f"✓ {env_path.name}: {key} updated")
PY
