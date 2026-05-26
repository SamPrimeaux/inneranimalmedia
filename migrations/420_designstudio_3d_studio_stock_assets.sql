-- Design Studio stock GLB presets (cms_assets.category = 3d_studio).
-- Idempotent: safe to re-run; new presets are added via D1 INSERT only.

INSERT OR IGNORE INTO cms_assets (
  id,
  tenant_id,
  filename,
  original_filename,
  path,
  size,
  mime_type,
  category,
  tags,
  r2_key,
  public_url,
  metadata,
  is_live,
  created_at,
  updated_at
)
SELECT
  'ds_stock_iam_footer',
  t.id,
  'inneranimalmediafooterglb.glb',
  'inneranimalmediafooterglb.glb',
  '/inneranimalmediafooterglb.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock',
  'inneranimalmediafooterglb.glb',
  'https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/inneranimalmediafooterglb.glb',
  '{"label":"IAM Footer","icon":"shield","scale":1.5}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t
WHERE t.id IS NOT NULL
LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id,
  tenant_id,
  filename,
  original_filename,
  path,
  size,
  mime_type,
  category,
  tags,
  r2_key,
  public_url,
  metadata,
  is_live,
  created_at,
  updated_at
)
SELECT
  'ds_stock_kinetic_symmetry',
  t.id,
  'Kinetic_Symmetry_0831084700_generate (1).glb',
  'Kinetic_Symmetry_0831084700_generate (1).glb',
  '/Kinetic_Symmetry_0831084700_generate (1).glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock',
  'Kinetic_Symmetry_0831084700_generate (1).glb',
  'https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/Kinetic_Symmetry_0831084700_generate%20(1).glb',
  '{"label":"Kinetic Symmetry","icon":"activity","scale":2}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t
WHERE t.id IS NOT NULL
LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id,
  tenant_id,
  filename,
  original_filename,
  path,
  size,
  mime_type,
  category,
  tags,
  r2_key,
  public_url,
  metadata,
  is_live,
  created_at,
  updated_at
)
SELECT
  'ds_stock_meshy_jet',
  t.id,
  'Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
  'Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
  '/Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
  0,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock',
  'Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
  'https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
  '{"label":"Meshy Jet","icon":"plane","scale":1.2}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t
WHERE t.id IS NOT NULL
LIMIT 1;
