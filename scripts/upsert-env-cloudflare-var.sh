#!/usr/bin/env bash
# Upsert one KEY= value in .env.cloudflare (gitignored).
#
# Usage:
#   ./scripts/upsert-env-cloudflare-var.sh ANTHROPIC_API_KEY
#     → visible paste prompt (recommended)
#   ./scripts/upsert-env-cloudflare-var.sh ANTHROPIC_API_KEY --paste
#   printf '%s' 'sk-...' | ./scripts/upsert-env-cloudflare-var.sh ANTHROPIC_API_KEY --stdin
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.cloudflare"
KEY=""
MODE="visible"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --paste) MODE="paste"; shift ;;
    --stdin) MODE="stdin"; shift ;;
    --hidden) MODE="hidden"; shift ;;
    --visible) MODE="visible"; shift ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Unknown option: $1 (try --visible, --paste, --stdin)" >&2
      exit 1
      ;;
    *)
      if [[ -z "$KEY" ]]; then
        KEY="$1"
        shift
      else
        echo "Unexpected argument: $1" >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$KEY" ]]; then
  echo "usage: upsert-env-cloudflare-var.sh VAR_NAME [--visible|--paste|--stdin|--hidden]" >&2
  exit 1
fi

# shellcheck source=scripts/lib/read-secret-prompt.sh
source "$REPO_ROOT/scripts/lib/read-secret-prompt.sh"

if [[ -p /dev/stdin ]] && [[ ! -t 0 ]] && [[ "$MODE" == "visible" ]]; then
  MODE="stdin"
fi

READ_SECRET_MODE="$MODE"
VAL="$(read_secret_interactive "$KEY")"

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
