-- Seed / upsert IAM Storm White — tokenized palette (light-D1): canvas #E8EDF3, panels, storm shell/nav, Monaco #2C4259 (Deep Storm), accents #2F80FF / #67B7FF.
-- Safe to re-run (REPLACE by id).
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/287_seed_iam_storm_white_cms_theme.sql

INSERT OR REPLACE INTO cms_themes (
  id,
  tenant_id,
  name,
  slug,
  config,
  theme_family,
  sort_order,
  monaco_theme,
  monaco_bg,
  monaco_theme_data,
  tokens_json,
  css_vars_json,
  brand_json,
  layout_json,
  typography_json,
  components_json,
  motion_json,
  status,
  visibility,
  is_system,
  updated_at
) VALUES (
  'theme-iam-storm-white',
  NULL,
  'IAM Storm White',
  'iam-storm-white',
  '{"bg":"#E8EDF3","surface":"#F6F8FB","nav":"#1B2A3A","text":"#1A2433","textSecondary":"#5A6B7F","border":"#C7D2DE","primary":"#2F80FF","primaryHover":"#67B7FF","radius":"8px","monaco_bg":"#2C4259","is_dark":false,"cssVars":{"--bg-canvas":"#E8EDF3","--bg-panel":"#FFFFFF","--bg-nav":"#1B2A3A","--bg-shell":"#243447","--text-primary":"#1A2433","--color-primary":"#2F80FF","--accent-hover":"#67B7FF","--editor-bg":"#2C4259","--editor-panel":"#243447","--editor-gutter":"#1B2A3A","--editor-border":"#3A536C","--editor-text":"#E8EEF5","--editor-muted":"#A7B6C6","--editor-accent":"#67B7FF"}}',
  'light',
  4,
  'iam-storm-white-monaco',
  '#2C4259',
  '{"base":"vs","inherit":true,"rules":[],"colors":{"editor.background":"#2C4259","editor.foreground":"#E8EEF5","editorLineNumber.foreground":"#67B7FF","focusBorder":"#2F80FF"}}',
  '{"palette":{"canvas":"#E8EDF3","panel":"#FFFFFF","panelAlt":"#F6F8FB","shell":"#243447","nav":"#1B2A3A","accent":"#2F80FF","accentSoft":"#67B7FF"},"preview":{"label":"IAM Storm White","base":"#E8EDF3","monaco":"#2C4259"}}',
  '{"--bg-shell":"#243447","--bg-nav":"#1B2A3A","--editor-bg":"#2C4259","--editor-gutter":"#1B2A3A","--editor-panel":"#243447"}',
  '{}',
  '{}',
  '{}',
  '{}',
  '{}',
  'active',
  'public',
  0,
  unixepoch()
);
