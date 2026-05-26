-- Design Studio stock GLBs: same-origin /assets/glb/* (Worker → ASSETS, CORS-safe for Three.js).
-- Retire duplicate footer row from migration 420; keep asset_iam_footer_glb (canonical).

UPDATE cms_assets
SET is_live = 0,
    updated_at = datetime('now')
WHERE id = 'ds_stock_iam_footer';

UPDATE cms_assets
SET
  public_url = 'https://inneranimalmedia.com/assets/glb/inneranimalmediafooterglb.glb',
  r2_key = 'glb/inneranimalmediafooterglb.glb',
  path = '/assets/glb/inneranimalmediafooterglb.glb',
  updated_at = datetime('now')
WHERE id = 'asset_iam_footer_glb';

UPDATE cms_assets
SET
  public_url = 'https://inneranimalmedia.com/assets/glb/Kinetic_Symmetry_0831084700_generate%20(1).glb',
  r2_key = 'glb/Kinetic_Symmetry_0831084700_generate (1).glb',
  path = '/assets/glb/Kinetic_Symmetry_0831084700_generate (1).glb',
  updated_at = datetime('now')
WHERE id = 'ds_stock_kinetic_symmetry';

UPDATE cms_assets
SET
  public_url = 'https://inneranimalmedia.com/assets/glb/Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
  r2_key = 'glb/Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
  path = '/assets/glb/Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
  updated_at = datetime('now')
WHERE id = 'ds_stock_meshy_jet';
