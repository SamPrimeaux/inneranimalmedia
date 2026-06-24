-- 701: Design Studio astronaut GLB pack (meshopt + merged rig clips)
-- Worker passthrough: /assets/glb/astronaut/* → R2 glb/astronaut/*

UPDATE cms_assets SET
  filename = 'astronaut_texture_opt.glb',
  original_filename = 'astronaut_texture_opt.glb',
  path = '/assets/glb/astronaut/astronaut_texture_opt.glb',
  size = 3209496,
  r2_key = 'glb/astronaut/astronaut_texture_opt.glb',
  public_url = 'https://inneranimalmedia.com/assets/glb/astronaut/astronaut_texture_opt.glb',
  tags = 'designstudio,stock,character,astronaut',
  metadata = '{"label":"Astronaut (texture)","icon":"user","scale":1}',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_astronaut';

UPDATE cms_assets SET
  filename = 'Animation_Walking_withSkin_opt.glb',
  original_filename = 'Animation_Walking_withSkin_opt.glb',
  path = '/assets/glb/astronaut/Animation_Walking_withSkin_opt.glb',
  size = 4729280,
  r2_key = 'glb/astronaut/Animation_Walking_withSkin_opt.glb',
  public_url = 'https://inneranimalmedia.com/assets/glb/astronaut/Animation_Walking_withSkin_opt.glb',
  tags = 'designstudio,stock,animate,astronaut',
  metadata = '{"label":"Astronaut — Walk","icon":"activity","scale":1,"clip":"walking"}',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_anim_walk';

UPDATE cms_assets SET
  filename = 'Animation_Running_withSkin_opt.glb',
  original_filename = 'Animation_Running_withSkin_opt.glb',
  path = '/assets/glb/astronaut/Animation_Running_withSkin_opt.glb',
  size = 4726136,
  r2_key = 'glb/astronaut/Animation_Running_withSkin_opt.glb',
  public_url = 'https://inneranimalmedia.com/assets/glb/astronaut/Animation_Running_withSkin_opt.glb',
  tags = 'designstudio,stock,animate,astronaut',
  metadata = '{"label":"Astronaut — Run","icon":"activity","scale":1,"clip":"running"}',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_anim_run';

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_astronaut_rig',
  t.id,
  'astronaut_rig_animations_opt.glb',
  'astronaut_rig_animations_opt.glb',
  '/assets/glb/astronaut/astronaut_rig_animations_opt.glb',
  4913960,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,animate,astronaut',
  'glb/astronaut/astronaut_rig_animations_opt.glb',
  'https://inneranimalmedia.com/assets/glb/astronaut/astronaut_rig_animations_opt.glb',
  '{"label":"Astronaut — All Clips (rig)","icon":"activity","scale":1,"clips":["walking","running","boxing","climb_fall","fall"]}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_anim_boxing_opt',
  t.id,
  'Animation_Boxing_Practice_withSkin_opt.glb',
  'Animation_Boxing_Practice_withSkin_opt.glb',
  '/assets/glb/astronaut/Animation_Boxing_Practice_withSkin_opt.glb',
  4778044,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,animate,astronaut',
  'glb/astronaut/Animation_Boxing_Practice_withSkin_opt.glb',
  'https://inneranimalmedia.com/assets/glb/astronaut/Animation_Boxing_Practice_withSkin_opt.glb',
  '{"label":"Astronaut — Boxing","icon":"activity","scale":1,"clip":"boxing"}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_anim_climb_opt',
  t.id,
  'Animation_Climb_Attempt_and_Fall_3_withSkin_opt.glb',
  'Animation_Climb_Attempt_and_Fall_3_withSkin_opt.glb',
  '/assets/glb/astronaut/Animation_Climb_Attempt_and_Fall_3_withSkin_opt.glb',
  4757744,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,animate,astronaut',
  'glb/astronaut/Animation_Climb_Attempt_and_Fall_3_withSkin_opt.glb',
  'https://inneranimalmedia.com/assets/glb/astronaut/Animation_Climb_Attempt_and_Fall_3_withSkin_opt.glb',
  '{"label":"Astronaut — Climb & Fall","icon":"activity","scale":1,"clip":"climb_fall"}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;

INSERT OR IGNORE INTO cms_assets (
  id, tenant_id, filename, original_filename, path, size, mime_type, category, tags,
  r2_key, public_url, metadata, is_live, created_at, updated_at
)
SELECT
  'ds_stock_anim_fall_opt',
  t.id,
  'Animation_Fall4_withSkin_opt.glb',
  'Animation_Fall4_withSkin_opt.glb',
  '/assets/glb/astronaut/Animation_Fall4_withSkin_opt.glb',
  4760168,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,animate,astronaut',
  'glb/astronaut/Animation_Fall4_withSkin_opt.glb',
  'https://inneranimalmedia.com/assets/glb/astronaut/Animation_Fall4_withSkin_opt.glb',
  '{"label":"Astronaut — Fall","icon":"activity","scale":1,"clip":"fall"}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;
