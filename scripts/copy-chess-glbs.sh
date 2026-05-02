#!/bin/bash
# copy-chess-glbs.sh
# Copies chess GLBs from inneranimalmedia-assets to inneranimalmedia/glb/chess/v1/
# Run from: /Users/samprimeaux/inneranimalmedia

set -e

SRC_BASE="https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/chess/v1"
DEST_BUCKET="inneranimalmedia"
DEST_PREFIX="glb/chess/v1"
TMP_DIR="/tmp/chess-glb-transfer"

mkdir -p "$TMP_DIR"

FILES=(
  "board/board_main.glb"
  "pieces/black/bishop.glb"
  "pieces/black/king.glb"
  "pieces/black/knight.glb"
  "pieces/black/pawn.glb"
  "pieces/black/queen.glb"
  "pieces/black/rook.glb"
  "pieces/white/bishop.glb"
  "pieces/white/king.glb"
  "pieces/white/knight.glb"
  "pieces/white/pawn.glb"
  "pieces/white/queen.glb"
  "pieces/white/rook.glb"
)

echo "Starting chess GLB transfer..."
echo "Source: inneranimalmedia-assets"
echo "Destination: $DEST_BUCKET/$DEST_PREFIX"
echo ""

for FILE in "${FILES[@]}"; do
  SRC_URL="$SRC_BASE/$FILE"
  DEST_KEY="$DEST_PREFIX/$FILE"
  LOCAL_PATH="$TMP_DIR/$(echo $FILE | tr '/' '_')"

  echo "Downloading: $FILE"
  curl -sf -o "$LOCAL_PATH" "$SRC_URL"

  echo "Uploading to: $DEST_KEY"
  wrangler r2 object put "$DEST_BUCKET/$DEST_KEY" \
    --file "$LOCAL_PATH" \
    --content-type "model/gltf-binary" \
    --remote

  rm "$LOCAL_PATH"
  echo "Done: $FILE"
  echo ""
done

echo "Transfer complete. 13 GLBs uploaded to $DEST_BUCKET/$DEST_PREFIX"
rm -rf "$TMP_DIR"
