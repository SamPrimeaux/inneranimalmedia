-- Align commerce theme nav + shell; switch accent to blue palette.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/676_iam_commerce_themes_nav_blue.sql

UPDATE cms_themes SET
  config = '{"bg":"#F4F4F5","surface":"#FFFFFF","nav":"#202223","text":"#202223","textSecondary":"#616161","border":"#E1E3E5","primary":"#2563EB","primaryHover":"#1D4ED8","radius":"10px","monaco_bg":"#F6F6F7","is_dark":false,"cssVars":{"--bg-canvas":"#F4F4F5","--bg-app":"#F4F4F5","--bg-panel":"#FFFFFF","--bg-elevated":"#FAFAFA","--bg-shell":"#202223","--bg-nav":"#202223","--bg-hover":"rgba(32,34,35,0.06)","--text-primary":"#202223","--text-main":"#202223","--text-muted":"#616161","--text-nav":"#F4F4F5","--text-nav-muted":"#B5B5B5","--text-sidebar":"#F4F4F5","--text-sidebar-muted":"#B5B5B5","--color-primary":"#2563EB","--accent-hover":"#1D4ED8","--border":"#E1E3E5","--border-subtle":"#E1E3E5","--editor-bg":"#F6F6F7","--editor-panel":"#FFFFFF","--editor-gutter":"#EBEBEB","--editor-border":"#E1E3E5","--editor-text":"#202223","--editor-muted":"#616161","--editor-accent":"#2563EB"}}',
  tokens_json = '{"palette":{"canvas":"#F4F4F5","panel":"#FFFFFF","panelAlt":"#FAFAFA","shell":"#202223","nav":"#202223","accent":"#2563EB","accentSoft":"#1D4ED8"},"preview":{"label":"Commerce Light","base":"#F4F4F5","monaco":"#F6F6F7","topbar":"#202223","sidebar":"#202223"}}',
  css_vars_json = '{"--bg-shell":"#202223","--bg-nav":"#202223","--text-nav":"#F4F4F5","--text-sidebar":"#F4F4F5","--color-primary":"#2563EB","--accent-hover":"#1D4ED8"}',
  updated_at = unixepoch()
WHERE slug = 'iam-commerce-light';

UPDATE cms_themes SET
  config = '{"bg":"#141414","surface":"#1E1E1E","nav":"#FFFFFF","text":"#F4F4F5","textSecondary":"#A1A1AA","border":"#2E2E32","primary":"#3B82F6","primaryHover":"#2563EB","radius":"10px","monaco_bg":"#1A1A1A","is_dark":true,"cssVars":{"--bg-canvas":"#141414","--bg-app":"#141414","--bg-panel":"#1E1E1E","--bg-elevated":"#242424","--bg-shell":"#FFFFFF","--bg-nav":"#FFFFFF","--bg-hover":"rgba(255,255,255,0.06)","--text-primary":"#F4F4F5","--text-main":"#F4F4F5","--text-muted":"#A1A1AA","--text-nav":"#202223","--text-nav-muted":"#616161","--text-sidebar":"#202223","--text-sidebar-muted":"#616161","--color-primary":"#3B82F6","--accent-hover":"#2563EB","--border":"#2E2E32","--border-subtle":"#2E2E32","--editor-bg":"#1A1A1A","--editor-panel":"#242424","--editor-gutter":"#141414","--editor-border":"#2E2E32","--editor-text":"#F4F4F5","--editor-muted":"#A1A1AA","--editor-accent":"#3B82F6"}}',
  tokens_json = '{"palette":{"canvas":"#141414","panel":"#1E1E1E","panelAlt":"#242424","shell":"#FFFFFF","nav":"#FFFFFF","accent":"#3B82F6","accentSoft":"#2563EB"},"preview":{"label":"Commerce Inverted","base":"#141414","monaco":"#1A1A1A","topbar":"#FFFFFF","sidebar":"#FFFFFF"}}',
  css_vars_json = '{"--bg-shell":"#FFFFFF","--bg-nav":"#FFFFFF","--text-nav":"#202223","--text-sidebar":"#202223","--color-primary":"#3B82F6","--accent-hover":"#2563EB"}',
  updated_at = unixepoch()
WHERE slug = 'iam-commerce-inverted';
