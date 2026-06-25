-- MeauxChess Baroque set — board + per-side piece meshes (meshopt + WebP textures).
-- Replaces legacy chess_king_white_opt / shared-mesh glass/amber runtime materials.

-- Board
INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_board',
  t.id,
  'baroque_board_opt.glb',
  'baroque_board_opt.glb',
  '/assets/glb/chess/baroque/baroque_board_opt.glb',
  7738496,
  'model/gltf-binary',
  'chess',
  'chess,stock,board,baroque',
  'glb/chess/baroque/baroque_board_opt.glb',
  'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_board_opt.glb',
  '{"label":"Baroque Board","piece_type":"board","set":"baroque","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

UPDATE cms_assets
SET
  filename = 'baroque_board_opt.glb',
  original_filename = 'baroque_board_opt.glb',
  path = '/assets/glb/chess/baroque/baroque_board_opt.glb',
  r2_key = 'glb/chess/baroque/baroque_board_opt.glb',
  public_url = 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_board_opt.glb',
  category = 'chess',
  tags = 'chess,stock,board,baroque,3d_studio',
  metadata = '{"label":"Baroque Board","piece_type":"board","set":"baroque","icon":"box","scale":1}',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_chess_board';

-- White pieces (update existing stock ids)
UPDATE cms_assets
SET
  filename = 'baroque_king_white_opt.glb',
  original_filename = 'baroque_king_white_opt.glb',
  path = '/assets/glb/chess/baroque/baroque_king_white_opt.glb',
  size = 2228224,
  r2_key = 'glb/chess/baroque/baroque_king_white_opt.glb',
  public_url = 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_king_white_opt.glb',
  category = 'chess',
  tags = 'chess,stock,baroque,3d_studio',
  metadata = '{"label":"Baroque King (White)","piece_type":"king","side":"white","set":"baroque","icon":"box","scale":1}',
  thumbnail_url = '/assets/glb/posters/ds_stock_chess_king.webp',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_chess_king';

UPDATE cms_assets
SET
  filename = 'baroque_queen_white_opt.glb',
  original_filename = 'baroque_queen_white_opt.glb',
  path = '/assets/glb/chess/baroque/baroque_queen_white_opt.glb',
  size = 2228224,
  r2_key = 'glb/chess/baroque/baroque_queen_white_opt.glb',
  public_url = 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_queen_white_opt.glb',
  category = 'chess',
  tags = 'chess,stock,baroque,3d_studio',
  metadata = '{"label":"Baroque Queen (White)","piece_type":"queen","side":"white","set":"baroque","icon":"box","scale":1}',
  thumbnail_url = '/assets/glb/posters/ds_stock_chess_queen.webp',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_chess_queen';

UPDATE cms_assets
SET
  filename = 'baroque_bishop_white_opt.glb',
  original_filename = 'baroque_bishop_white_opt.glb',
  path = '/assets/glb/chess/baroque/baroque_bishop_white_opt.glb',
  size = 2146304,
  r2_key = 'glb/chess/baroque/baroque_bishop_white_opt.glb',
  public_url = 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_bishop_white_opt.glb',
  category = 'chess',
  tags = 'chess,stock,baroque,3d_studio',
  metadata = '{"label":"Baroque Bishop (White)","piece_type":"bishop","side":"white","set":"baroque","icon":"box","scale":1}',
  thumbnail_url = '/assets/glb/posters/ds_stock_chess_bishop.webp',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_chess_bishop';

UPDATE cms_assets
SET
  filename = 'baroque_knight_white_opt.glb',
  original_filename = 'baroque_knight_white_opt.glb',
  path = '/assets/glb/chess/baroque/baroque_knight_white_opt.glb',
  size = 3407872,
  r2_key = 'glb/chess/baroque/baroque_knight_white_opt.glb',
  public_url = 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_knight_white_opt.glb',
  category = 'chess',
  tags = 'chess,stock,baroque,3d_studio',
  metadata = '{"label":"Baroque Knight (White)","piece_type":"knight","side":"white","set":"baroque","icon":"box","scale":1}',
  thumbnail_url = '/assets/glb/posters/ds_stock_chess_knight.webp',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_chess_knight';

UPDATE cms_assets
SET
  filename = 'baroque_rook_white_opt.glb',
  original_filename = 'baroque_rook_white_opt.glb',
  path = '/assets/glb/chess/baroque/baroque_rook_white_opt.glb',
  size = 4435472,
  r2_key = 'glb/chess/baroque/baroque_rook_white_opt.glb',
  public_url = 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_rook_white_opt.glb',
  category = 'chess',
  tags = 'chess,stock,baroque,3d_studio',
  metadata = '{"label":"Baroque Rook (White)","piece_type":"rook","side":"white","set":"baroque","icon":"box","scale":1}',
  thumbnail_url = '/assets/glb/posters/ds_stock_chess_rook.webp',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_chess_rook';

UPDATE cms_assets
SET
  filename = 'baroque_pawn_white_opt.glb',
  original_filename = 'baroque_pawn_white_opt.glb',
  path = '/assets/glb/chess/baroque/baroque_pawn_white_opt.glb',
  size = 2162688,
  r2_key = 'glb/chess/baroque/baroque_pawn_white_opt.glb',
  public_url = 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_pawn_white_opt.glb',
  category = 'chess',
  tags = 'chess,stock,baroque,3d_studio',
  metadata = '{"label":"Baroque Pawn (White)","piece_type":"pawn","side":"white","set":"baroque","icon":"box","scale":1}',
  thumbnail_url = '/assets/glb/posters/ds_stock_chess_pawn.webp',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_chess_pawn';

-- Black pieces (new stock rows)
INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_king_black',
  t.id,
  'baroque_king_black_opt.glb',
  'baroque_king_black_opt.glb',
  '/assets/glb/chess/baroque/baroque_king_black_opt.glb',
  2600468,
  'model/gltf-binary',
  'chess',
  'chess,stock,baroque,3d_studio',
  'glb/chess/baroque/baroque_king_black_opt.glb',
  'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_king_black_opt.glb',
  '{"label":"Baroque King (Black)","piece_type":"king","side":"black","set":"baroque","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_queen_black',
  t.id,
  'baroque_queen_black_opt.glb',
  'baroque_queen_black_opt.glb',
  '/assets/glb/chess/baroque/baroque_queen_black_opt.glb',
  2411724,
  'model/gltf-binary',
  'chess',
  'chess,stock,baroque,3d_studio',
  'glb/chess/baroque/baroque_queen_black_opt.glb',
  'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_queen_black_opt.glb',
  '{"label":"Baroque Queen (Black)","piece_type":"queen","side":"black","set":"baroque","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_bishop_black',
  t.id,
  'baroque_bishop_black_opt.glb',
  'baroque_bishop_black_opt.glb',
  '/assets/glb/chess/baroque/baroque_bishop_black_opt.glb',
  2495616,
  'model/gltf-binary',
  'chess',
  'chess,stock,baroque,3d_studio',
  'glb/chess/baroque/baroque_bishop_black_opt.glb',
  'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_bishop_black_opt.glb',
  '{"label":"Baroque Bishop (Black)","piece_type":"bishop","side":"black","set":"baroque","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_knight_black',
  t.id,
  'baroque_knight_black_opt.glb',
  'baroque_knight_black_opt.glb',
  '/assets/glb/chess/baroque/baroque_knight_black_opt.glb',
  3250584,
  'model/gltf-binary',
  'chess',
  'chess,stock,baroque,3d_studio',
  'glb/chess/baroque/baroque_knight_black_opt.glb',
  'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_knight_black_opt.glb',
  '{"label":"Baroque Knight (Black)","piece_type":"knight","side":"black","set":"baroque","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_rook_black',
  t.id,
  'baroque_rook_black_opt.glb',
  'baroque_rook_black_opt.glb',
  '/assets/glb/chess/baroque/baroque_rook_black_opt.glb',
  4152360,
  'model/gltf-binary',
  'chess',
  'chess,stock,baroque,3d_studio',
  'glb/chess/baroque/baroque_rook_black_opt.glb',
  'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_rook_black_opt.glb',
  '{"label":"Baroque Rook (Black)","piece_type":"rook","side":"black","set":"baroque","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_pawn_black',
  t.id,
  'baroque_pawn_black_opt.glb',
  'baroque_pawn_black_opt.glb',
  '/assets/glb/chess/baroque/baroque_pawn_black_opt.glb',
  2285896,
  'model/gltf-binary',
  'chess',
  'chess,stock,baroque,3d_studio',
  'glb/chess/baroque/baroque_pawn_black_opt.glb',
  'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_pawn_black_opt.glb',
  '{"label":"Baroque Pawn (Black)","piece_type":"pawn","side":"black","set":"baroque","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

-- Deprecate legacy single-mesh chess GLBs in Design Studio stock (still on R2 for rollback)
UPDATE cms_assets
SET is_live = 0, updated_at = datetime('now')
WHERE id IN ('ds_stock_meshy_rook')
  AND tags LIKE '%chess%';
