-- 702: Astronaut asset policy — single runtime rig in repo; R2 canonical; clip metadata in DB

UPDATE cms_assets SET
  is_live = 0,
  updated_at = datetime('now')
WHERE id IN (
  'ds_stock_astronaut',
  'ds_stock_anim_walk',
  'ds_stock_anim_run',
  'ds_stock_anim_boxing_opt',
  'ds_stock_anim_climb_opt',
  'ds_stock_anim_fall_opt'
);

UPDATE cms_assets SET
  filename = 'astronaut_rig_animations_opt.glb',
  original_filename = 'astronaut_rig_animations_opt.glb',
  path = '/assets/glb/astronaut/astronaut_rig_animations_opt.glb',
  size = 4913960,
  mime_type = 'model/gltf-binary',
  category = '3d_studio',
  tags = 'designstudio,stock,animate,astronaut,runtime',
  r2_key = 'glb/astronaut/astronaut_rig_animations_opt.glb',
  public_url = 'https://inneranimalmedia.com/assets/glb/astronaut/astronaut_rig_animations_opt.glb',
  metadata = '{"label":"Astronaut","icon":"activity","scale":1,"clips":["walking","running","boxing","climb_fall","fall"],"source_provider":"archive_expansion","source_archive":"astronaut!-glb-scenes/Archive","compress":"meshopt","skinned":true,"bytes_in":4954700,"bytes_out":4913960,"canonical_host":"r2","repo_runtime":true}',
  is_live = 1,
  updated_at = datetime('now')
WHERE id = 'ds_stock_astronaut_rig';

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
  'designstudio,stock,animate,astronaut,runtime',
  'glb/astronaut/astronaut_rig_animations_opt.glb',
  'https://inneranimalmedia.com/assets/glb/astronaut/astronaut_rig_animations_opt.glb',
  '{"label":"Astronaut","icon":"activity","scale":1,"clips":["walking","running","boxing","climb_fall","fall"],"source_provider":"archive_expansion","source_archive":"astronaut!-glb-scenes/Archive","compress":"meshopt","skinned":true,"bytes_in":4954700,"bytes_out":4913960,"canonical_host":"r2","repo_runtime":true}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t WHERE t.id IS NOT NULL LIMIT 1;
