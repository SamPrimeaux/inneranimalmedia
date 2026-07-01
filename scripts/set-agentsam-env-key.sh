#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${AGENTSAM_ENV_FILE:-$HOME/inneranimalmedia/.env.agentsam.local}"

KEY="${1:-}"
VALUE="${2:-}"

if [ -z "$KEY" ]; then
  echo "Usage: $0 KEY [VALUE]"
  echo "If VALUE is omitted, you will be prompted securely."
  exit 2
fi

case "$KEY" in
  SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|SUPABASE_URL|SUPABASE_PROJECT_REF|GOOGLE_AI_API_KEY|GEMINI_API_KEY|OLLAMA_BASE_URL|OLLAMA_DEFAULT_MODEL|AGENTSAM_LOCAL_MODEL_ENABLED|IAM_IDENTITY_PROFILE_ID|IAM_SUPABASE_USER_ID|IAM_SUPABASE_WORKSPACE_ID|IAM_D1_AUTH_USER_ID|D1_AUTH_USER_ID|IAM_USER_EMAIL|IAM_PERSON_UUID|IAM_SUPERADMIN_UUID|AGENTSAM_SUPABASE_STRICT)
    ;;
  *)
    echo "Refusing unknown key: $KEY"
    echo "Edit allowlist in this script if you intentionally need more keys."
    exit 2
    ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

if [ -z "$VALUE" ]; then
  printf "Enter value for %s: " "$KEY" >&2
  stty -echo
  IFS= read -r VALUE
  stty echo
  printf "\n" >&2
fi

BACKUP="$ENV_FILE.bak.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP"

python3 - "$ENV_FILE" "$KEY" "$VALUE" <<'PY'
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]

lines = env_path.read_text().splitlines()
new_line = f'{key}="{value}"'

found = False
out = []

for line in lines:
    stripped = line.strip()
    if stripped.startswith(f"{key}="):
        if not found:
            out.append(new_line)
            found = True
        # skip duplicate occurrences
    else:
        out.append(line)

if not found:
    out.append(new_line)

env_path.write_text("\n".join(out) + "\n")
PY

echo "Saved: $ENV_FILE"
echo "Backup: $BACKUP"

# Verify without exposing value.
set +u
source "$ENV_FILE"
set -u

VALUE_NOW="${!KEY:-}"
LEN="${#VALUE_NOW}"

if [ "$LEN" -eq 0 ]; then
  echo "VERIFY: $KEY=<missing>"
  exit 1
fi

if [ "$LEN" -le 12 ]; then
  MASK="<set:${LEN}chars>"
else
  START="$(printf "%s" "$VALUE_NOW" | cut -c 1-8)"
  END="$(printf "%s" "$VALUE_NOW" | rev | cut -c 1-4 | rev)"
  MASK="${START}...${END}"
fi

echo "VERIFY: $KEY=$MASK"
echo "SOURCE: $ENV_FILE"
