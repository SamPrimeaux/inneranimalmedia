-- 678: marketing template columns + seed data for london-train and bridge-fly

-- Legacy FK on cms_component_templates.liquid_import_id → cms_liquid_imports_old (missing on some envs)
CREATE TABLE IF NOT EXISTS cms_liquid_imports_old (id TEXT PRIMARY KEY);

ALTER TABLE cms_component_templates ADD COLUMN slug TEXT;
ALTER TABLE cms_component_templates ADD COLUMN source_html_r2_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_component_templates_slug
  ON cms_component_templates(slug) WHERE slug IS NOT NULL;

INSERT INTO cms_component_templates (
  id, template_name, template_type, category,
  is_system, slug, source_html_r2_key,
  template_data, preview_image_url, source_liquid_file
) VALUES
(
  'tpl_london_train_ref',
  'London Dream Railway',
  'marketing_page',
  'Marketing',
  1,
  'marketing-london-dream-railway',
  'static/pages/marketing/london-train/index.html',
  '{"title":"London Dream Railway","description":"Immersive Three.js animated railway marketing page.","stack":["Three.js","Procedural animation","GLSL shaders"],"source_branch":"marketing/london-train-ref","source_url":"https://petergpt.github.io/london-train/"}',
  NULL,
  NULL
),
(
  'tpl_bridge_fly_ref',
  'Golden Gate Fly Scene',
  'marketing_page',
  'Marketing',
  1,
  'marketing-golden-gate-fly',
  'static/pages/marketing/bridge-fly/index.html',
  '{"title":"Golden Gate Fly Scene","description":"Autopilot + manual WASD flight over a procedural bay scene with GLSL water shader.","stack":["Three.js","GLSL water","Pointer Lock API"],"source_branch":"marketing/bridge-fly-ref","source_url":"https://openai-miniapps-examples.vercel.app/bridge-5p5/"}',
  NULL,
  NULL
)
ON CONFLICT(id) DO NOTHING;
