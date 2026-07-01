-- 745: Archive Spline source scenes (boxes_hover, 3_d_diagram) as CMS component templates.

INSERT INTO cms_component_templates (
  id, template_name, template_type, category,
  is_system, slug, source_html_r2_key,
  template_data, preview_image_url, source_liquid_file
) VALUES
(
  'tpl_spline_boxes_hover',
  'Boxes Hover',
  'spline_scene',
  'Interactive',
  1,
  'spline-boxes-hover',
  'pages/marketing/boxes-hover/index.html',
  '{"title":"Boxes Hover","description":"Interactive box grid with mouse hover rotate and pan.","stack":["Spline","@splinetool/runtime"],"source_file":"scenes/_source/boxes_hover.spline","source_filename":"boxes_hover.spline","spline_scene_url":null,"publish_status":"source_only","runtime_js":"scenes/boxes-hover/spline.js","scene_css":"scenes/boxes-hover/scene.css","window_api":"BoxesHoverScene","cms_section":"spline-boxes-hover"}',
  NULL,
  NULL
),
(
  'tpl_spline_3d_diagram',
  '3D Workflow Diagram',
  'spline_scene',
  'Interactive',
  1,
  'spline-3d-diagram',
  'pages/marketing/3d-diagram/index.html',
  '{"title":"3D Workflow Diagram","description":"Interactive 3D workflow diagram with nodes, paths, and colored lighting.","stack":["Spline","@splinetool/runtime"],"source_file":"scenes/_source/3_d_diagram.spline","source_filename":"3_d_diagram.spline","spline_scene_url":null,"publish_status":"source_only","runtime_js":"scenes/3d-diagram/spline.js","scene_css":"scenes/3d-diagram/scene.css","window_api":"Diagram3dScene","cms_section":"spline-3d-diagram"}',
  NULL,
  NULL
)
ON CONFLICT(id) DO UPDATE SET
  template_name = excluded.template_name,
  template_type = excluded.template_type,
  category = excluded.category,
  slug = excluded.slug,
  source_html_r2_key = excluded.source_html_r2_key,
  template_data = excluded.template_data,
  updated_at = datetime('now');
