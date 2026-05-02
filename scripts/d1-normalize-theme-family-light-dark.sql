-- Normalize cms_themes.theme_family to only 'dark' | 'light' (concise picker grouping).
-- Rule: WCAG relative luminance of config.bg hex >= 0.45 => light, else dark.
-- Non-#hex bg (e.g. rgba) treated as dark (0.25) — review manually if any.
-- Preserves sort_order column (not touched).
--
-- Regenerate: fetch JSON then
--   node scripts/generate-theme-family-updates.mjs /path/to/wrangler-output.json
--   (strip comments if needed)
--
-- inneranimalmedia-business — run after review:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-normalize-theme-family-light-dark.sql
-- Note: D1 batch execute rejects BEGIN TRANSACTION; statements run as one batch atomically per file.

UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'clay-global-dark';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'dark';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'iam-antiocean';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'iam-aurora';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'iam-forge';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'iam-graphite';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'iam-midnight';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'iam-tokyo-night';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'iam-winter-ops';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'inner-animal-dark';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'inner-animal-fire';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'inner-animal-ocean';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'inner-animal-orange';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'inner-animal-wild';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'inneranimal-slate';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'kimbie-dark';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-browser';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-code-dark';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-command';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-cyber-punk';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-design';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-editor';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-forest-deep';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-galaxy';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-hacker-green';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-ios-dark';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-knowledge';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-launcher';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-matrix-rain';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-midnight-blue';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-mono';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-music';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-neon';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-neon-city';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-ops-dark';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-solar';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-spatial';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-storm-gray';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-sunset-glow';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-synthwave';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-terminal';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-vampire';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-vampire-dark';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'meaux-workflow';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'midnight';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'solarized-dark';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'swampblood-outdoor';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'tactical-concrete';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'tactical-desert-night';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'tactical-graphite';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'tactical-night-ops';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'tactical-ranger';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'tactical-slate-sage';
UPDATE cms_themes SET theme_family = 'dark' WHERE slug = 'tactical-stealth';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'clay';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'clay-global-light';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'google';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'google-light';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'inner-animal-light';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'inner-animal-zen';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'light';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-adaptive';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-arctic';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-blue-steel';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-creative';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-desert-sand';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-glass-blue';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-glass-orange';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-ios-light';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-minimal';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-monochrome';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-productivity';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-system';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'meaux-workspace';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'solarized-light';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'tactical-khaki-glass';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'tactical-olive-note';
UPDATE cms_themes SET theme_family = 'light' WHERE slug = 'tactical-sandstone';
