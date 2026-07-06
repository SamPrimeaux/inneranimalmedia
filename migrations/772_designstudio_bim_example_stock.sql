-- Design Studio: BIMExample.FCStd → GLB as platform stock (FreeCAD/BIM proof model).
-- Source job: cadj_bimexample311065 (Phase B import). Visible to all users via category 3d_studio.

INSERT OR REPLACE INTO cms_assets (
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
  'ds_stock_bim_example',
  t.id,
  'BIMExample.glb',
  'BIMExample.FCStd',
  '/assets/cad/exports/tenant_sam_primeaux/ws_inneranimalmedia/cadj_bimexample311065.glb',
  2533324,
  'model/gltf-binary',
  '3d_studio',
  'designstudio,stock,bim,freecad,featured',
  'cad/exports/tenant_sam_primeaux/ws_inneranimalmedia/cadj_bimexample311065.glb',
  'https://inneranimalmedia.com/assets/cad/exports/tenant_sam_primeaux/ws_inneranimalmedia/cadj_bimexample311065.glb',
  '{"label":"BIM Example (FreeCAD)","icon":"building","scale":0,"featured":true,"cad_job_id":"cadj_bimexample311065","engine":"freecad","source_fcstd":"BIMExample.FCStd","proof_lane":"bim"}',
  1,
  datetime('now'),
  datetime('now')
FROM cms_tenants AS t
WHERE t.id IS NOT NULL
LIMIT 1;
