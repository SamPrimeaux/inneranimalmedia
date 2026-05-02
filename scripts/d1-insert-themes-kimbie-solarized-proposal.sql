-- PROPOSAL ONLY — do not execute until Sam approves (see docs/plans/plan_iam_dashboard_v2.md).
-- Adds three themes to cms_themes matching docs/theme-presets/iam-v2-kimbie-solarized.css slugs.
-- Pattern matches theme-migration.sql: top-level bg/surface/text + config.cssVars for shell injection.
--
-- Optional schema refinement (run as separate migration after design review):
--   ALTER TABLE cms_themes ADD COLUMN theme_family TEXT DEFAULT 'custom';
--     -- values: 'dark' | 'light' | 'high_contrast_dark' | 'high_contrast_light'
--   ALTER TABLE cms_themes ADD COLUMN sort_order INTEGER DEFAULT 100;
--   CREATE INDEX IF NOT EXISTS idx_cms_themes_family_sort ON cms_themes(theme_family, sort_order);
--
-- Then: UPDATE cms_themes SET theme_family='dark', sort_order=10 WHERE slug IN ('kimbie-dark','solarized-dark');
--       UPDATE cms_themes SET theme_family='light', sort_order=20 WHERE slug='solarized-light';

INSERT OR REPLACE INTO cms_themes (id, name, slug, is_system, config) VALUES
(
  'theme-kimbie-dark',
  'Kimbie Dark',
  'kimbie-dark',
  1,
  '{"bg":"#221a0f","surface":"#362712","text":"#d3af86","textSecondary":"#84613d","border":"rgba(211,175,134,0.18)","primary":"#f06431","primaryHover":"#ff7a45","radius":"6px","cssVars":{"--bg-canvas":"#221a0f","--bg-surface":"#2a1f14","--bg-elevated":"#362712","--bg-panel":"#362712","--bg-nav":"rgba(240, 100, 49, 0.92)","--bg-input":"#51412c","--bg-status":"#423523","--color-text":"#d3af86","--text-primary":"#d3af86","--text-secondary":"#c3a67c","--text-muted":"#84613d","--color-border":"rgba(211, 175, 134, 0.18)","--border":"rgba(211, 175, 134, 0.18)","--color-primary":"#f06431","--color-primary-hover":"#ff7a45","--color-success":"#889b4a","--color-danger":"#dc322f","--radius":"6px","--popover-bg":"rgba(54, 39, 18, 0.94)","--popover-border":"rgba(211, 175, 134, 0.22)","--popover-row-hover":"rgba(136, 155, 74, 0.12)","--popover-row-active":"rgba(240, 100, 49, 0.18)"}}'
),
(
  'theme-solarized-dark',
  'Solarized Dark',
  'solarized-dark',
  1,
  '{"bg":"#002b36","surface":"#073642","text":"#839496","textSecondary":"#586e75","border":"rgba(88,110,117,0.35)","primary":"#268bd2","primaryHover":"#2aa198","radius":"6px","cssVars":{"--bg-canvas":"#002b36","--bg-surface":"#073642","--bg-elevated":"#073642","--bg-panel":"#073642","--bg-nav":"rgba(38, 139, 210, 0.9)","--bg-input":"#073642","--bg-status":"#073642","--color-text":"#839496","--text-primary":"#839496","--text-secondary":"#93a1a1","--text-muted":"#586e75","--color-border":"rgba(88, 110, 117, 0.35)","--border":"rgba(88, 110, 117, 0.35)","--color-primary":"#268bd2","--color-primary-hover":"#2aa198","--color-success":"#859900","--color-danger":"#dc322f","--radius":"6px","--popover-bg":"rgba(7, 54, 66, 0.96)","--popover-border":"rgba(88, 110, 117, 0.4)","--popover-row-hover":"rgba(42, 161, 152, 0.12)","--popover-row-active":"rgba(38, 139, 210, 0.2)"}}'
),
(
  'theme-solarized-light',
  'Solarized Light',
  'solarized-light',
  1,
  '{"bg":"#fdf6e3","surface":"#eee8d5","text":"#657b83","textSecondary":"#93a1a1","border":"rgba(88,110,117,0.25)","primary":"#268bd2","primaryHover":"#2075b5","radius":"6px","cssVars":{"--bg-canvas":"#fdf6e3","--bg-surface":"#eee8d5","--bg-elevated":"#eee8d5","--bg-panel":"#eee8d5","--bg-nav":"rgba(38, 139, 210, 0.88)","--bg-input":"#fdf6e3","--bg-status":"#eee8d5","--color-text":"#657b83","--text-primary":"#657b83","--text-secondary":"#586e75","--text-muted":"#93a1a1","--color-border":"rgba(88, 110, 117, 0.25)","--border":"rgba(88, 110, 117, 0.25)","--color-primary":"#268bd2","--color-primary-hover":"#2075b5","--color-success":"#859900","--color-danger":"#dc322f","--radius":"6px","--popover-bg":"rgba(253, 246, 227, 0.97)","--popover-border":"rgba(88, 110, 117, 0.3)","--popover-row-hover":"rgba(38, 139, 210, 0.1)","--popover-row-active":"rgba(38, 139, 210, 0.16)"}}'
);
