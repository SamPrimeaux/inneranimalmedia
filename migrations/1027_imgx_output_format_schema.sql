-- imgx_generate_image / imgx_edit_image: default delivery format png; optional format param.
-- Supported: png (default), jpg/jpeg, webp, gif, svg (raster embedded in SVG wrapper).

UPDATE agentsam_tools
SET
  input_schema = json_set(
    COALESCE(input_schema, '{}'),
    '$.properties.format',
    json('{"type":"string","enum":["png","jpg","jpeg","webp","gif","svg"],"description":"Delivery file format. Default png (re-encoded via Cloudflare Images when the model returns JPEG/WebP). jpg/jpeg, webp, gif also supported. svg wraps the raster in an SVG container — true vector art uses illustration_create."}')
  ),
  updated_at = unixepoch()
WHERE tool_key IN ('imgx_generate_image', 'imgx_edit_image')
   OR tool_name IN ('imgx_generate_image', 'imgx_edit_image');
