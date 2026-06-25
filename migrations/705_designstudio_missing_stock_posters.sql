-- Poster thumbnails for legacy stock GLBs missing from migration 703.
-- Posters: R2 glb/posters/{id}.webp → /assets/glb/posters/{id}.webp

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_kinetic_symmetry.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_kinetic_symmetry';

UPDATE cms_assets
SET thumbnail_url = '/assets/glb/posters/ds_stock_meshy_jet.webp',
    updated_at = datetime('now')
WHERE id = 'ds_stock_meshy_jet';

UPDATE cms_assets
SET
  category = '3d_studio',
  is_live = 1,
  thumbnail_url = '/assets/glb/posters/asset_iam_footer_glb.webp',
  updated_at = datetime('now')
WHERE id = 'asset_iam_footer_glb';

-- Retire duplicate footer row if migration 421 was not applied yet.
UPDATE cms_assets
SET is_live = 0,
    updated_at = datetime('now')
WHERE id = 'ds_stock_iam_footer';
