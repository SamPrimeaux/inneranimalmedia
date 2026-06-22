#!/usr/bin/env bash
# chess_pipeline.sh
# End-to-end chess set: procedural Three.js board + 5 Meshy pieces → optimize → R2
# Usage: cd ~/inneranimalmedia && bash scripts/chess_pipeline.sh
#        bash scripts/chess_pipeline.sh --board-only   # board GLB only (no Meshy credits)

set -e

BOARD_ONLY=0
if [[ "${1:-}" == "--board-only" ]]; then
  BOARD_ONLY=1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

MESHYAI_API_KEY=$(grep '^MESHYAI_API_KEY=' .env.cloudflare | cut -d= -f2- | tr -d '"')
DOWNLOAD_DIR=~/Downloads/chess_pieces
ASSETS_BASE="https://assets.inneranimalmedia.com/chess-pieces"
R2_BUCKET="inneranimalmedia"
R2_PREFIX="chess-pieces"

mkdir -p "$DOWNLOAD_DIR"

r2_put() {
  local key="$1"
  local file="$2"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "$R2_BUCKET/$key" \
    --file "$file" \
    --content-type "model/gltf-binary" \
    --remote -c wrangler.production.toml
}

echo "=== STEP 0: Procedural chess board (Three.js — no Meshy credits) ==="
if [[ ! -d "$REPO_ROOT/dashboard/node_modules/three" ]]; then
  echo "  Installing dashboard deps (three.js)..."
  npm install --prefix "$REPO_ROOT/dashboard" --no-audit --no-fund
fi
node scripts/chess/createChessBoard.mjs "$DOWNLOAD_DIR/chess_board_opt.glb"
echo "  Uploading chess_board_opt.glb..."
r2_put "$R2_PREFIX/chess_board_opt.glb" "$DOWNLOAD_DIR/chess_board_opt.glb"
BOARD_CODE=$(curl -so /dev/null -w "%{http_code}" "$ASSETS_BASE/chess_board_opt.glb")
echo "  chess_board_opt.glb: HTTP $BOARD_CODE"

if [[ "$BOARD_ONLY" -eq 1 ]]; then
  echo ""
  echo "=== Board-only complete ==="
  echo "  $ASSETS_BASE/chess_board_opt.glb"
  exit 0
fi

echo ""
echo "=== STEP 1: Fire all 5 previews simultaneously ==="

fire_preview() {
  local piece=$1
  local prompt=$2
  local id=$(curl -s -X POST https://api.meshy.ai/openapi/v2/text-to-3d \
    -H "Authorization: Bearer $MESHYAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"mode\": \"preview\",
      \"prompt\": \"$prompt\",
      \"ai_model\": \"latest\",
      \"should_remesh\": true,
      \"topology\": \"quad\",
      \"target_polycount\": 5000,
      \"auto_size\": true,
      \"origin_at\": \"center\",
      \"target_formats\": [\"glb\"],
      \"alpha_thumbnail\": true
    }" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
  echo "$id"
}

QUEEN_PREVIEW=$(fire_preview "queen" "A chess queen piece, tall spiked crown with five points, hourglass body, ornate carved lattice collar, deeply carved surface details, wide weighted base with stepped rings, ultra high detail, quad topology, pure white flat neutral surface, no baked shadows, no color variation, clean PBR base")
echo "QUEEN preview: $QUEEN_PREVIEW"

BISHOP_PREVIEW=$(fire_preview "bishop" "A chess bishop piece, tall tapered body, deep diagonal mitre slot at tip, ornate carved collar ring, gothic carved surface, wide weighted base with stepped rings, ultra high detail, quad topology, pure white flat neutral surface, no baked shadows, no color variation, clean PBR base")
echo "BISHOP preview: $BISHOP_PREVIEW"

KNIGHT_PREVIEW=$(fire_preview "knight" "A chess knight piece, stylized horse head on ornate pedestal, flowing carved mane, gothic armored details, wide weighted base with stepped rings, ultra high detail, quad topology, facing left, pure white flat neutral surface, no baked shadows, no color variation, clean PBR base")
echo "KNIGHT preview: $KNIGHT_PREVIEW"

ROOK_PREVIEW=$(fire_preview "rook" "A chess rook piece, fortified castle tower, four deep battlements at top, arrow slit details on body, ornate carved band, wide weighted base with stepped rings, ultra high detail, quad topology, pure white flat neutral surface, no baked shadows, no color variation, clean PBR base")
echo "ROOK preview: $ROOK_PREVIEW"

PAWN_PREVIEW=$(fire_preview "pawn" "A chess pawn piece, round sphere head, elegant tapered neck with carved collar ring, ornate flared base with stepped rings, ultra high detail, quad topology, pure white flat neutral surface, no baked shadows, no color variation, clean PBR base")
echo "PAWN preview: $PAWN_PREVIEW"

echo ""
echo "=== STEP 2: Poll previews until all SUCCEEDED ==="

poll_task() {
  local id=$1
  local piece=$2
  while true; do
    local result=$(curl -s "https://api.meshy.ai/openapi/v2/text-to-3d/$id" \
      -H "Authorization: Bearer $MESHYAI_API_KEY")
    local status=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    local progress=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['progress'])")
    echo "  [$piece] $status $progress%"
    if [ "$status" = "SUCCEEDED" ]; then break; fi
    if [ "$status" = "FAILED" ]; then echo "FAILED: $piece preview"; exit 1; fi
    sleep 10
  done
}

poll_task "$QUEEN_PREVIEW" "queen" &
poll_task "$BISHOP_PREVIEW" "bishop" &
poll_task "$KNIGHT_PREVIEW" "knight" &
poll_task "$ROOK_PREVIEW" "rook" &
poll_task "$PAWN_PREVIEW" "pawn" &
wait
echo "All previews done."

echo ""
echo "=== STEP 3: Fire all 5 refines simultaneously ==="

fire_refine() {
  local preview_id=$1
  local id=$(curl -s -X POST https://api.meshy.ai/openapi/v2/text-to-3d \
    -H "Authorization: Bearer $MESHYAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"mode\": \"refine\",
      \"preview_task_id\": \"$preview_id\",
      \"ai_model\": \"latest\",
      \"enable_pbr\": true,
      \"hd_texture\": true,
      \"remove_lighting\": true,
      \"texture_prompt\": \"pure white flat neutral surface, no baked shadows, no color variation, clean PBR base\",
      \"target_formats\": [\"glb\"],
      \"alpha_thumbnail\": true
    }" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
  echo "$id"
}

QUEEN_REFINE=$(fire_refine "$QUEEN_PREVIEW") && echo "QUEEN refine: $QUEEN_REFINE"
BISHOP_REFINE=$(fire_refine "$BISHOP_PREVIEW") && echo "BISHOP refine: $BISHOP_REFINE"
KNIGHT_REFINE=$(fire_refine "$KNIGHT_PREVIEW") && echo "KNIGHT refine: $KNIGHT_REFINE"
ROOK_REFINE=$(fire_refine "$ROOK_PREVIEW") && echo "ROOK refine: $ROOK_REFINE"
PAWN_REFINE=$(fire_refine "$PAWN_PREVIEW") && echo "PAWN refine: $PAWN_REFINE"

echo ""
echo "=== STEP 4: Poll refines + download GLBs when done ==="

poll_and_download() {
  local id=$1
  local piece=$2
  while true; do
    local result=$(curl -s "https://api.meshy.ai/openapi/v2/text-to-3d/$id" \
      -H "Authorization: Bearer $MESHYAI_API_KEY")
    local status=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    local progress=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['progress'])")
    echo "  [$piece refine] $status $progress%"
    if [ "$status" = "SUCCEEDED" ]; then
      local glb_url=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['model_urls']['glb'])")
      echo "  [$piece] Downloading GLB..."
      curl -sL "$glb_url" -o "$DOWNLOAD_DIR/chess_${piece}_white.glb"
      echo "  [$piece] Downloaded: chess_${piece}_white.glb"
      break
    fi
    if [ "$status" = "FAILED" ]; then echo "FAILED: $piece refine"; exit 1; fi
    sleep 10
  done
}

poll_and_download "$QUEEN_REFINE" "queen" &
poll_and_download "$BISHOP_REFINE" "bishop" &
poll_and_download "$KNIGHT_REFINE" "knight" &
poll_and_download "$ROOK_REFINE" "rook" &
poll_and_download "$PAWN_REFINE" "pawn" &
wait
echo "All refines done and downloaded."

echo ""
echo "=== STEP 5: Compress all 5 with gltf-transform ==="

for piece in queen bishop knight rook pawn; do
  echo "  Compressing chess_${piece}_white.glb..."
  gltf-transform optimize \
    "$DOWNLOAD_DIR/chess_${piece}_white.glb" \
    "$DOWNLOAD_DIR/chess_${piece}_white_opt.glb" \
    --texture-compress webp
  SIZE=$(ls -lh "$DOWNLOAD_DIR/chess_${piece}_white_opt.glb" | awk '{print $5}')
  echo "  chess_${piece}_white_opt.glb: $SIZE"
done

echo ""
echo "=== STEP 6: Upload all pieces to R2 (board uploaded in STEP 0) ==="

for piece in queen bishop knight rook pawn; do
  echo "  Uploading chess_${piece}_white_opt.glb..."
  r2_put "$R2_PREFIX/chess_${piece}_white_opt.glb" "$DOWNLOAD_DIR/chess_${piece}_white_opt.glb"
done

echo ""
echo "=== STEP 7: Verify board + all 6 pieces live ==="

for asset in board king queen bishop knight rook pawn; do
  CODE=$(curl -so /dev/null -w "%{http_code}" \
    "$ASSETS_BASE/chess_${asset}_white_opt.glb")
  echo "  chess_${asset}_white_opt.glb: $CODE"
done

echo ""
echo "=== All done. Chess set live at: ==="
echo "  $ASSETS_BASE/chess_board_opt.glb"
echo "  $ASSETS_BASE/chess_king_white_opt.glb"
echo "  $ASSETS_BASE/chess_queen_white_opt.glb"
echo "  $ASSETS_BASE/chess_bishop_white_opt.glb"
echo "  $ASSETS_BASE/chess_knight_white_opt.glb"
echo "  $ASSETS_BASE/chess_rook_white_opt.glb"
echo "  $ASSETS_BASE/chess_pawn_white_opt.glb"
