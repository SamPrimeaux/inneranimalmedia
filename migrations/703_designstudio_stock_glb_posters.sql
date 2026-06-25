-- Stock GLB poster thumbnails (WebP) — library cards use thumbnail_url only (no GLB preview load).
-- Posters: R2 glb/posters/{cms_assets.id}.webp → /assets/glb/posters/{id}.webp

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_astronaut_rig.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_astronaut_rig';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_game_robot.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_game_robot';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_game_collectible.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_game_collectible';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_game_platform.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_game_platform';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_game_powerup.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_game_powerup';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_chess_king.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_chess_king';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_chess_queen.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_chess_queen';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_chess_bishop.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_chess_bishop';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_chess_knight.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_chess_knight';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_chess_rook.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_chess_rook';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_chess_pawn.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_chess_pawn';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_meshy_rook.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_meshy_rook';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_rocket_chart.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_rocket_chart';
