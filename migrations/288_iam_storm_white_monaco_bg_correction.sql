-- Correct IAM Storm White “Deep Storm” editor hue to #2C4259 (aligned with branded shell/editor).
-- Safe to re-run.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/288_iam_storm_white_monaco_bg_correction.sql

UPDATE cms_themes
SET
  monaco_bg = '#2C4259',
  config = '{"bg":"#E8EDF3","surface":"#F6F8FB","nav":"#1B2A3A","text":"#1A2433","textSecondary":"#5A6B7F","border":"#C7D2DE","primary":"#2F80FF","primaryHover":"#67B7FF","radius":"8px","monaco_bg":"#2C4259","is_dark":false,"cssVars":{"--bg-canvas":"#E8EDF3","--bg-panel":"#FFFFFF","--bg-nav":"#1B2A3A","--bg-shell":"#243447","--text-primary":"#1A2433","--color-primary":"#2F80FF","--accent-hover":"#67B7FF","--editor-bg":"#2C4259","--editor-panel":"#243447","--editor-gutter":"#1B2A3A","--editor-border":"#3A536C","--editor-text":"#E8EEF5","--editor-muted":"#A7B6C6","--editor-accent":"#67B7FF"}}',
  monaco_theme_data = '{"base":"vs","inherit":true,"rules":[],"colors":{"editor.background":"#2C4259","editor.foreground":"#E8EEF5","editorLineNumber.foreground":"#67B7FF","focusBorder":"#2F80FF"}}',
  tokens_json = '{"palette":{"canvas":"#E8EDF3","panel":"#FFFFFF","panelAlt":"#F6F8FB","shell":"#243447","nav":"#1B2A3A","accent":"#2F80FF","accentSoft":"#67B7FF"},"preview":{"label":"IAM Storm White","base":"#E8EDF3","monaco":"#2C4259"}}',
  css_vars_json = '{"--bg-shell":"#243447","--bg-nav":"#1B2A3A","--editor-bg":"#2C4259","--editor-gutter":"#1B2A3A","--editor-panel":"#243447"}',
  updated_at = unixepoch()
WHERE slug = 'iam-storm-white';
