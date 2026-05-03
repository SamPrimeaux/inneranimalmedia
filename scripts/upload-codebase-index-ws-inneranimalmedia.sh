#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/samprimeaux/Downloads/inneranimalmedia"
WORKSPACE_ID="ws_inneranimalmedia"
BUCKET="inneranimalmedia"

ANALYTICS_DIR="$ROOT/analytics/codebase-index/$WORKSPACE_ID"
DOCS_DIR="$ROOT/docs/codebase-index/$WORKSPACE_ID"
TMP_DIR="$ROOT/tmp/codebase-index/$WORKSPACE_ID"

mkdir -p "$TMP_DIR"

cd "$ROOT"

echo "== Codebase index R2 upload audit =="
echo "root: $ROOT"
echo "workspace_id: $WORKSPACE_ID"
echo "bucket: $BUCKET"
echo

if [ ! -f "$ANALYTICS_DIR/repo-snapshot.json" ]; then
  echo "Missing $ANALYTICS_DIR/repo-snapshot.json"
  exit 1
fi

if [ ! -d "$ANALYTICS_DIR" ] || [ ! -d "$DOCS_DIR" ]; then
  echo "Missing generated index directories:"
  echo "$ANALYTICS_DIR"
  echo "$DOCS_DIR"
  exit 1
fi

GENERATED_AT="$(jq -r '.generated_at' "$ANALYTICS_DIR/repo-snapshot.json")"
COMMIT_SHA="$(jq -r '.commit_sha' "$ANALYTICS_DIR/repo-snapshot.json")"
COMMIT7="$(printf '%s' "$COMMIT_SHA" | cut -c1-7)"
SNAPSHOT_TS="$(printf '%s' "$GENERATED_AT" | sed 's/[-:]//g; s/Z$//')"
SNAPSHOT_ID="${SNAPSHOT_TS}Z-${COMMIT7}"

LATEST_PREFIX="codebase-index/${WORKSPACE_ID}/latest"
SNAPSHOT_PREFIX="codebase-index/${WORKSPACE_ID}/snapshots/${SNAPSHOT_ID}"
MANIFEST_PREFIX="codebase-index/${WORKSPACE_ID}/manifests"

echo "generated_at: $GENERATED_AT"
echo "commit_sha: $COMMIT_SHA"
echo "snapshot_id: $SNAPSHOT_ID"
echo

echo "== Full generated artifact tree with sizes =="
find "$ANALYTICS_DIR" "$DOCS_DIR" -maxdepth 1 -type f -print0 \
  | sort -z \
  | while IFS= read -r -d '' f; do
      size_bytes="$(wc -c < "$f" | tr -d ' ')"
      size_human="$(du -h "$f" | awk '{print $1}')"
      rel="${f#$ROOT/}"
      printf "%12s  %10s bytes  %s\n" "$size_human" "$size_bytes" "$rel"
    done

echo
echo "== Total generated artifact size =="
du -ch "$ANALYTICS_DIR"/* "$DOCS_DIR"/* 2>/dev/null | tail -1
echo

echo "== Upload allowlist =="
ALLOWLIST=(
  "$ANALYTICS_DIR/repo-snapshot.json"
  "$ANALYTICS_DIR/file-inventory.json"
  "$ANALYTICS_DIR/file-inventory.csv"
  "$ANALYTICS_DIR/directory-summary.json"
  "$ANALYTICS_DIR/route-tokens.txt"
  "$ANALYTICS_DIR/package-snapshot.json"
  "$ANALYTICS_DIR/index-priority-files.json"
  "$DOCS_DIR/route-map.md"
  "$DOCS_DIR/file-inventory.md"
  "$DOCS_DIR/directory-summary.md"
  "$DOCS_DIR/index-priority-files.md"
)

for f in "${ALLOWLIST[@]}"; do
  if [ ! -f "$f" ]; then
    echo "Missing allowlisted file: $f"
    exit 1
  fi
  rel="${f#$ROOT/}"
  size_human="$(du -h "$f" | awk '{print $1}')"
  echo "$size_human  $rel"
done

echo
read -r -p "Upload these generated codebase-index artifacts to R2? Type YES: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Aborted."
  exit 0
fi

echo
echo "== Uploading allowlisted artifacts to latest + immutable snapshot =="

uploaded_files_json="$TMP_DIR/uploaded-files.json"
printf '[\n' > "$uploaded_files_json"
first=1

for f in "${ALLOWLIST[@]}"; do
  name="$(basename "$f")"
  size_bytes="$(wc -c < "$f" | tr -d ' ')"
  sha256="$(shasum -a 256 "$f" | awk '{print $1}')"

  latest_key="${LATEST_PREFIX}/${name}"
  snapshot_key="${SNAPSHOT_PREFIX}/${name}"

  echo "Uploading $name"
  echo "  -> r2://$BUCKET/$latest_key"
  npx wrangler r2 object put "$BUCKET/$latest_key" \
    --file "$f" \
    --remote

  echo "  -> r2://$BUCKET/$snapshot_key"
  npx wrangler r2 object put "$BUCKET/$snapshot_key" \
    --file "$f" \
    --remote

  if [ "$first" -eq 0 ]; then
    printf ',\n' >> "$uploaded_files_json"
  fi
  first=0

  cat >> "$uploaded_files_json" <<EOF
  {
    "name": "$name",
    "local_path": "${f#$ROOT/}",
    "size_bytes": $size_bytes,
    "sha256": "$sha256",
    "r2_latest_key": "$latest_key",
    "r2_snapshot_key": "$snapshot_key"
  }
EOF
done

printf '\n]\n' >> "$uploaded_files_json"

MANIFEST="$TMP_DIR/manifest.json"

cat > "$MANIFEST" <<EOF
{
  "workspace_id": "$WORKSPACE_ID",
  "worker_name": "inneranimalmedia",
  "handle": "inneranimalmedia",
  "owner_tenant_id": "tenant_sam_primeaux",
  "app_id": "3236491",
  "github_url": "https://github.com/SamPrimeaux/inneranimalmedia",
  "repo_root": "$ROOT",
  "branch": "$(git branch --show-current)",
  "commit_sha": "$COMMIT_SHA",
  "snapshot_id": "$SNAPSHOT_ID",
  "generated_at": "$GENERATED_AT",
  "uploaded_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "r2_bucket": "$BUCKET",
  "r2_prefix_latest": "$LATEST_PREFIX/",
  "r2_prefix_snapshot": "$SNAPSHOT_PREFIX/",
  "purpose": "Durable generated codebase index artifacts for Supabase normalized code tables, embeddings, Vectorize mirroring, and Agent Sam code retrieval.",
  "upload_policy": {
    "local_is_scratch": true,
    "r2_is_durable_artifact_store": true,
    "supabase_is_normalized_query_store": true,
    "vectorize_is_fast_vector_retrieval_store": true,
    "uploaded_raw_repo_source": false,
    "uploaded_generated_index_artifacts_only": true
  },
  "files": $(cat "$uploaded_files_json")
}
EOF

echo
echo "== Manifest preview =="
cat "$MANIFEST" | jq .

echo
echo "Uploading manifests"
npx wrangler r2 object put "$BUCKET/$MANIFEST_PREFIX/latest.json" \
  --file "$MANIFEST" \
  --remote

npx wrangler r2 object put "$BUCKET/$MANIFEST_PREFIX/${SNAPSHOT_ID}.json" \
  --file "$MANIFEST" \
  --remote

echo
echo "== Verify latest =="
npx wrangler r2 object list "$BUCKET" \
  --prefix "$LATEST_PREFIX/" \
  --remote

echo
echo "== Verify snapshot =="
npx wrangler r2 object list "$BUCKET" \
  --prefix "$SNAPSHOT_PREFIX/" \
  --remote

echo
echo "== Verify manifests =="
npx wrangler r2 object list "$BUCKET" \
  --prefix "$MANIFEST_PREFIX/" \
  --remote

export REPO_ROOT="$ROOT"
export SNAPSHOT_ID="$SNAPSHOT_ID"
export COMMIT_SHA="$COMMIT_SHA"
SUPABASE_URL="${SUPABASE_URL:-https://dpmuvynqixblxsilnlut.supabase.co}"
export SUPABASE_URL

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ -f "${HOME}/.zshrc" ]; then
  _SRK="$(grep -E '^export SUPABASE_SERVICE_ROLE_KEY=' "${HOME}/.zshrc" 2>/dev/null | tail -1 | sed 's/^export SUPABASE_SERVICE_ROLE_KEY=//' | tr -d '"' | tr -d "'")"
  if [ -n "${_SRK}" ]; then
    export SUPABASE_SERVICE_ROLE_KEY="${_SRK}"
  fi
  unset _SRK
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "warn: SUPABASE_SERVICE_ROLE_KEY not set; skipping Supabase codebase_* sync."
else
  echo
  echo "== Register snapshot + ingest Supabase codebase_* tables =="

  echo "Registering snapshot in Supabase..."
  SNAP_RESP="$(curl -sf -X POST "${SUPABASE_URL}/rest/v1/codebase_snapshots" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{
      \"snapshot_id\": \"${SNAPSHOT_ID}\",
      \"workspace_id\": \"ws_inneranimalmedia\",
      \"tenant_id\": \"tenant_sam_primeaux\",
      \"commit_sha\": \"${COMMIT_SHA}\",
      \"branch\": \"main\",
      \"repo_url\": \"https://github.com/SamPrimeaux/inneranimalmedia\",
      \"r2_prefix\": \"analytics/codebase-index/ws_inneranimalmedia\",
      \"upload_status\": \"uploading\"
    }" || echo "warn: snapshot insert failed")"
  echo "${SNAP_RESP}"

  echo "Ingesting priority files as searchable chunks..."
  node <<'NODE_EOF'
const fs = require('fs');
const path = require('path');

(async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dpmuvynqixblxsilnlut.supabase.co';
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SNAPSHOT_ID = process.env.SNAPSHOT_ID;
  const WORKSPACE_ID = 'ws_inneranimalmedia';
  const TENANT_ID = 'tenant_sam_primeaux';
  const CHUNK_LINES = 80;

  const priorityPath = path.join(
    process.env.REPO_ROOT || process.cwd(),
    'analytics/codebase-index/ws_inneranimalmedia/index-priority-files.json',
  );

  if (!KEY || !SNAPSHOT_ID) {
    console.log('Missing SUPABASE_SERVICE_ROLE_KEY or SNAPSHOT_ID, skipping chunk ingest.');
    process.exit(0);
  }

  if (!fs.existsSync(priorityPath)) {
    console.log('No priority files JSON found, skipping chunk ingest.');
    process.exit(0);
  }

  const files = JSON.parse(fs.readFileSync(priorityPath, 'utf8'));
  const entries = Array.isArray(files) ? files : (files.files || []);
  let totalChunks = 0;

  for (const f of entries.slice(0, 50)) {
    const filePath = f.path || f.file_path || f.name;
    const content = f.content || f.source || null;
    if (!content || !filePath) continue;

    const lines = content.split('\n');
    const chunks = [];
    for (let i = 0; i < lines.length; i += CHUNK_LINES) {
      chunks.push({
        snapshot_id: SNAPSHOT_ID,
        workspace_id: WORKSPACE_ID,
        tenant_id: TENANT_ID,
        file_path: filePath,
        chunk_index: chunks.length,
        chunk_type: filePath.match(/\.(ts|js|tsx|jsx)$/)
          ? 'code'
          : filePath.match(/\.md$/)
            ? 'markdown'
            : 'other',
        content: lines.slice(i, i + CHUNK_LINES).join('\n'),
        line_start: i + 1,
        line_end: Math.min(i + CHUNK_LINES, lines.length),
        language: filePath.split('.').pop() || 'text',
      });
    }

    for (const chunk of chunks) {
      await fetch(`${SUPABASE_URL}/rest/v1/codebase_chunks`, {
        method: 'POST',
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(chunk),
      }).catch((e) => console.warn('chunk insert failed:', e.message));
      totalChunks += 1;
    }
  }

  console.log(`Inserted ${totalChunks} chunks for embedding`);
})().catch((e) => {
  console.warn('chunk ingest error:', e.message);
  process.exit(0);
});
NODE_EOF

  echo "Ingesting route symbols from route-tokens.txt..."
  node <<'NODE_EOF'
const fs = require('fs');

(async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dpmuvynqixblxsilnlut.supabase.co';
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SNAPSHOT_ID = process.env.SNAPSHOT_ID;

  const routePath = `${process.env.REPO_ROOT || process.cwd()}/analytics/codebase-index/ws_inneranimalmedia/route-tokens.txt`;
  if (!KEY || !SNAPSHOT_ID) {
    console.log('Missing SUPABASE_SERVICE_ROLE_KEY or SNAPSHOT_ID, skipping symbols.');
    process.exit(0);
  }
  if (!fs.existsSync(routePath)) {
    console.log('No route-tokens.txt, skipping.');
    process.exit(0);
  }

  const routes = fs
    .readFileSync(routePath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('/api/') || l.startsWith('/dashboard/'));

  const symbols = routes.map((r) => ({
    snapshot_id: SNAPSHOT_ID,
    workspace_id: 'ws_inneranimalmedia',
    tenant_id: 'tenant_sam_primeaux',
    file_path: 'src/core/router.js',
    symbol_type: 'route',
    symbol_name: r,
    http_method: null,
  }));

  for (let i = 0; i < symbols.length; i += 100) {
    await fetch(`${SUPABASE_URL}/rest/v1/codebase_symbols`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(symbols.slice(i, i + 100)),
    }).catch((e) => console.warn('symbol insert failed:', e.message));
  }
  console.log(`Inserted ${symbols.length} route symbols`);
})().catch((e) => {
  console.warn('symbol ingest error:', e.message);
  process.exit(0);
});
NODE_EOF

  echo "Marking snapshot complete..."
  curl -sf -X PATCH \
    "${SUPABASE_URL}/rest/v1/codebase_snapshots?snapshot_id=eq.${SNAPSHOT_ID}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"upload_status":"complete"}' || echo "warn: status update failed"

  echo "Supabase codebase index complete."
fi

echo
echo "Done."
echo "Latest prefix: r2://$BUCKET/$LATEST_PREFIX/"
echo "Snapshot prefix: r2://$BUCKET/$SNAPSHOT_PREFIX/"
echo "Manifest: r2://$BUCKET/$MANIFEST_PREFIX/latest.json"
