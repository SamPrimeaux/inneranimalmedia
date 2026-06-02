#!/usr/bin/env bash
# Upload Cloudflare Cursor plugin SKILL.md files → R2 inneranimalmedia-autorag/skills/
# Default: only 9 top-level SKILL.md files (~9 objects). Use --full only if you want the entire
# references/ tree (~300+ files under skills/cloudflare/references/…).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOML="${REPO_ROOT}/wrangler.production.toml"
BUCKET="inneranimalmedia-autorag"
PREFIX="skills"
SOURCE="${CF_PLUGIN_SKILLS_ROOT:-${HOME}/.cursor/plugins/cache/cursor-public/cloudflare/fe4f2e9999991b36568e3d81a13de06a2b26bb20/skills}"
MODE="skill-md-only"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) MODE="full" ;;
    --skill-md-only) MODE="skill-md-only" ;;
    -h|--help)
      sed -n '2,6p' "$0"
      echo "  --full           Upload every file under the plugin skills tree (~337 objects)"
      echo "  --skill-md-only  Upload only */SKILL.md (default, 9 objects)"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

if [[ ! -d "$SOURCE" ]]; then
  echo "✗ Cloudflare skills source not found: $SOURCE" >&2
  exit 1
fi

FIND_ARGS=(-type f ! -name '.DS_Store')
if [[ "$MODE" == "skill-md-only" ]]; then
  FIND_ARGS=(-type f -name 'SKILL.md')
fi

echo "→ Mode: $MODE"
echo "  From: $SOURCE"
echo "  To:   ${BUCKET}/${PREFIX}/"
echo ""

count=0
while IFS= read -r -d '' file; do
  rel="${file#"${SOURCE}/"}"
  key="${PREFIX}/${rel}"
  "${REPO_ROOT}/scripts/with-cloudflare-env.sh" npx wrangler r2 object put "${BUCKET}/${key}" \
    --file="$file" \
    --content-type="text/markdown; charset=utf-8" \
    --remote \
    -c "$TOML" \
    >/dev/null
  count=$((count + 1))
  echo "  ${key}"
done < <(find "$SOURCE" "${FIND_ARGS[@]}" -print0)

MANIFEST="$(mktemp)"
trap 'rm -f "$MANIFEST"' EXIT
cat >"$MANIFEST" <<EOF
{
  "mode": "${MODE}",
  "source": "cursor-plugin-cloudflare",
  "uploaded_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "object_count": ${count},
  "r2_bucket": "${BUCKET}",
  "r2_prefix": "${PREFIX}/"
}
EOF

"${REPO_ROOT}/scripts/with-cloudflare-env.sh" npx wrangler r2 object put "${BUCKET}/${PREFIX}/manifest.json" \
  --file="$MANIFEST" \
  --content-type="application/json; charset=utf-8" \
  --remote \
  -c "$TOML" \
  >/dev/null

echo "✓ Done — ${count} object(s) (+ manifest.json). Not uploading more unless you re-run this script."
