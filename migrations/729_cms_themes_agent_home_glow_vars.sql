-- 729: Agent home input glow tokens per theme (Settings → Themes live color pickers).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/729_cms_themes_agent_home_glow_vars.sql

UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#4F8CFF","--agent-home-glow-secondary":"#8FD7FF"}') WHERE slug = 'moon-glass';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#8B5CF6","--agent-home-glow-secondary":"#38BDF8"}') WHERE slug = 'iam-starfield';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#7c3aed","--agent-home-glow-secondary":"#9565e6"}') WHERE slug = 'meaux-clay-dark';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#A7B0BE","--agent-home-glow-secondary":"#5090C0"}') WHERE slug = 'iam-ghost-classic';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#29D3F2","--agent-home-glow-secondary":"#1D4ED8"}') WHERE slug = 'iam-engineer-blue';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#C49A5A","--agent-home-glow-secondary":"#D4A017"}') WHERE slug = 'iam-desert-ops';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#C2A35E","--agent-home-glow-secondary":"#A99B78"}') WHERE slug = 'iam-desert-field';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#7EA36B","--agent-home-glow-secondary":"#5A9A4A"}') WHERE slug = 'iam-forest-classic';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#00FF66","--agent-home-glow-secondary":"#00CCFF"}') WHERE slug = 'iam-green-terminal';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#268bd2","--agent-home-glow-secondary":"#2aa198"}') WHERE slug = 'iam-tide-dark';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#3b82f6","--agent-home-glow-secondary":"#60a5fa"}') WHERE slug = 'iam-night-strike';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#3a8fd4","--agent-home-glow-secondary":"#00c8d4"}') WHERE slug = 'iam-arctic-command';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#bd93f9","--agent-home-glow-secondary":"#6272a4"}') WHERE slug = 'iam-violet-nocturne';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#2EC4D6","--agent-home-glow-secondary":"#F59E0B"}') WHERE slug = 'iam-antiocean-full';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#4a90b8","--agent-home-glow-secondary":"#4a9eff"}') WHERE slug = 'meaux-ocean-soft-dark';
UPDATE cms_themes SET css_vars_json = json_patch(css_vars_json, '{"--agent-home-glow-primary":"#2F80FF","--agent-home-glow-secondary":"#67B7FF"}') WHERE slug = 'iam-storm-white';
