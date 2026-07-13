-- 855: Wet Dog Competition fundraising section templates (Companions / nonprofit)

INSERT OR IGNORE INTO cms_component_templates (
  id, template_name, template_type, category,
  iam_category, iam_label, iam_build, iam_status,
  iam_tags, is_system, sort_order, source_html_r2_key,
  template_data, created_at, updated_at
) VALUES
('tpl_wetdog_3col',
 'Competition Entry — 3 Column Cards', 'section', 'fundraising',
 'section', 'Competition Entry — 3 Column Cards',
 'inneranimalmedia', 'active',
 '["fundraising","competition","cards","nonprofit"]',
 0, 40,
 'static/templates/sections/fundraising/wet-dog-3col/index.html',
 '{"layout":"3-column","categories":3}',
 datetime('now'), datetime('now')),

('tpl_wetdog_4col',
 'Competition Entry — 4 Column Shelf', 'section', 'fundraising',
 'section', 'Competition Entry — 4 Column Shelf',
 'inneranimalmedia', 'active',
 '["fundraising","competition","cards","nonprofit"]',
 0, 41,
 'static/templates/sections/fundraising/wet-dog-4col/index.html',
 '{"layout":"4-column","categories":4}',
 datetime('now'), datetime('now')),

('tpl_wetdog_2x2',
 'Competition Entry — 2x2 Grid', 'section', 'fundraising',
 'section', 'Competition Entry — 2x2 Grid',
 'inneranimalmedia', 'active',
 '["fundraising","competition","cards","nonprofit"]',
 0, 42,
 'static/templates/sections/fundraising/wet-dog-2x2/index.html',
 '{"layout":"2x2","categories":4}',
 datetime('now'), datetime('now')),

('tpl_wetdog_hero3',
 'Competition Entry — Hero + 3', 'section', 'fundraising',
 'section', 'Competition Entry — Hero + 3',
 'inneranimalmedia', 'active',
 '["fundraising","competition","cards","nonprofit"]',
 0, 43,
 'static/templates/sections/fundraising/wet-dog-hero3/index.html',
 '{"layout":"hero-3","categories":4}',
 datetime('now'), datetime('now'));
