-- Design Studio: BIM example stock row — placement sidecar + true-scale spawn profile.
UPDATE cms_assets
SET
  metadata = '{"label":"BIM Example (FreeCAD)","icon":"building","scale":1,"featured":true,"cad_job_id":"cadj_bimexample311065","engine":"freecad","source_fcstd":"BIMExample.FCStd","proof_lane":"bim","spawn_profile":"bim","fit_to_viewport":false,"source_units":"mm","up_axis":"Z","placement_sidecar_url":"/assets/cad/exports/tenant_sam_primeaux/ws_inneranimalmedia/cadj_bimexample311065.placement.json"}',
  updated_at = datetime('now')
WHERE id = 'ds_stock_bim_example';
