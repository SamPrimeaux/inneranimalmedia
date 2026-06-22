-- Design Studio: index R2 glb/* stock assets in cms_assets (category 3d_studio).
-- Same-origin public_url via Worker /assets/glb/* proxy (migration 421 pattern).
-- Idempotent: INSERT OR IGNORE per asset id.

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_game_robot',
  t.id,
  'game-character-robot.glb',
  'game-character-robot.glb',
  '/assets/glb/game_assets/game-character-robot.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,game',
  'glb/game_assets/game-character-robot.glb',
  'https://inneranimalmedia.com/assets/glb/game_assets/game-character-robot.glb',
  '{"label":"Game Robot","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_game_collectible',
  t.id,
  'game-collectible.glb',
  'game-collectible.glb',
  '/assets/glb/game_assets/game-collectible.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,game',
  'glb/game_assets/game-collectible.glb',
  'https://inneranimalmedia.com/assets/glb/game_assets/game-collectible.glb',
  '{"label":"Game Collectible","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_game_platform',
  t.id,
  'game-platform.glb',
  'game-platform.glb',
  '/assets/glb/game_assets/game-platform.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,game',
  'glb/game_assets/game-platform.glb',
  'https://inneranimalmedia.com/assets/glb/game_assets/game-platform.glb',
  '{"label":"Game Platform","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_game_powerup',
  t.id,
  'game-power-up.glb',
  'game-power-up.glb',
  '/assets/glb/game_assets/game-power-up.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,game',
  'glb/game_assets/game-power-up.glb',
  'https://inneranimalmedia.com/assets/glb/game_assets/game-power-up.glb',
  '{"label":"Game Power-Up","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_astronaut',
  t.id,
  'Astronaut_0815114721_texture.glb',
  'Astronaut_0815114721_texture.glb',
  '/assets/glb/astronaut/Astronaut_0815114721_texture.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,character',
  'glb/astronaut/Astronaut_0815114721_texture.glb',
  'https://inneranimalmedia.com/assets/glb/astronaut/Astronaut_0815114721_texture.glb',
  '{"label":"Astronaut","icon":"user","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_anim_walk',
  t.id,
  'Animation_Walking_withSkin.glb',
  'Animation_Walking_withSkin.glb',
  '/assets/glb/astronaut/Animation_Walking_withSkin.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,animate',
  'glb/astronaut/Animation_Walking_withSkin.glb',
  'https://inneranimalmedia.com/assets/glb/astronaut/Animation_Walking_withSkin.glb',
  '{"label":"Anim Walk","icon":"activity","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_anim_run',
  t.id,
  'Animation_Running_withSkin.glb',
  'Animation_Running_withSkin.glb',
  '/assets/glb/astronaut/Animation_Running_withSkin.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,animate',
  'glb/astronaut/Animation_Running_withSkin.glb',
  'https://inneranimalmedia.com/assets/glb/astronaut/Animation_Running_withSkin.glb',
  '{"label":"Anim Run","icon":"activity","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_meshy_rook',
  t.id,
  'Meshy_rook.glb',
  'Meshy_rook.glb',
  '/assets/glb/misc/Meshy_rook.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,chess',
  'glb/misc/Meshy_rook.glb',
  'https://inneranimalmedia.com/assets/glb/misc/Meshy_rook.glb',
  '{"label":"Chess Rook","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_rocket_chart',
  t.id,
  'Rocket_Growth_Chart.glb',
  'Rocket_Growth_Chart.glb',
  '/assets/glb/misc/Rocket_Growth_Chart.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock',
  'glb/misc/Rocket_Growth_Chart.glb',
  'https://inneranimalmedia.com/assets/glb/misc/Rocket_Growth_Chart.glb',
  '{"label":"Rocket Chart","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

-- Chess set (glb/chess/)
INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_king',
  t.id,
  'chess_king_white_opt.glb',
  'chess_king_white_opt.glb',
  '/assets/glb/chess/chess_king_white_opt.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,chess',
  'glb/chess/chess_king_white_opt.glb',
  'https://inneranimalmedia.com/assets/glb/chess/chess_king_white_opt.glb',
  '{"label":"Chess King","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_queen',
  t.id,
  'chess_queen_white_opt.glb',
  'chess_queen_white_opt.glb',
  '/assets/glb/chess/chess_queen_white_opt.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,chess',
  'glb/chess/chess_queen_white_opt.glb',
  'https://inneranimalmedia.com/assets/glb/chess/chess_queen_white_opt.glb',
  '{"label":"Chess Queen","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_bishop',
  t.id,
  'chess_bishop_white_opt.glb',
  'chess_bishop_white_opt.glb',
  '/assets/glb/chess/chess_bishop_white_opt.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,chess',
  'glb/chess/chess_bishop_white_opt.glb',
  'https://inneranimalmedia.com/assets/glb/chess/chess_bishop_white_opt.glb',
  '{"label":"Chess Bishop","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_knight',
  t.id,
  'chess_knight_white_opt.glb',
  'chess_knight_white_opt.glb',
  '/assets/glb/chess/chess_knight_white_opt.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,chess',
  'glb/chess/chess_knight_white_opt.glb',
  'https://inneranimalmedia.com/assets/glb/chess/chess_knight_white_opt.glb',
  '{"label":"Chess Knight","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_rook',
  t.id,
  'chess_rook_white_opt.glb',
  'chess_rook_white_opt.glb',
  '/assets/glb/chess/chess_rook_white_opt.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,chess',
  'glb/chess/chess_rook_white_opt.glb',
  'https://inneranimalmedia.com/assets/glb/chess/chess_rook_white_opt.glb',
  '{"label":"Chess Rook Opt","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_chess_pawn',
  t.id,
  'chess_pawn_white_opt.glb',
  'chess_pawn_white_opt.glb',
  '/assets/glb/chess/chess_pawn_white_opt.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,chess',
  'glb/chess/chess_pawn_white_opt.glb',
  'https://inneranimalmedia.com/assets/glb/chess/chess_pawn_white_opt.glb',
  '{"label":"Chess Pawn","icon":"box","scale":1}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;
