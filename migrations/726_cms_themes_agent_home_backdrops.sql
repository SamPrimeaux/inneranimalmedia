-- 726: Seed cms_themes.components_json.agent_home with gradient backdrops (Settings → Themes live tweaks).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/726_cms_themes_agent_home_backdrops.sql

UPDATE cms_themes
SET components_json = json_set(
  COALESCE(NULLIF(trim(components_json), ''), '{}'),
  '$.agent_home',
  json('{
    "version": 1,
    "mode": "auto-time",
    "atmosphere": { "vignette": 0.38, "grain": 0.035, "glowAccent": "var(--color-primary)" },
    "ui": { "greetingStyle": "serif", "glassOpacity": 0.18 },
    "backdrops": {
      "dawn": { "layers": [{ "type": "gradient", "angle": 165, "stops": ["#0c1220 0%", "#1e2840 38%", "#5a4870 62%", "#c9a090 88%", "#8aa8b8 100%"] }] },
      "day": { "layers": [{ "type": "gradient", "angle": 175, "stops": ["#071018 0%", "#0f2840 35%", "#1a5070 58%", "#3a8aab 78%", "#0a2030 100%"] }] },
      "dusk": { "layers": [{ "type": "gradient", "angle": 180, "stops": ["#0a0612 0%", "#241530 40%", "#5a2848 68%", "#1a2838 100%"] }] },
      "night": { "layers": [
        { "type": "gradient", "angle": 180, "stops": ["#020810 0%", "#0a1c2c 42%", "#0e2c3c 68%", "#051018 100%"] },
        { "type": "gradient", "angle": 135, "stops": ["transparent 0%", "rgba(167,219,230,0.06) 42%", "rgba(220,242,246,0.14) 52%", "rgba(167,219,230,0.05) 62%", "transparent 100%"] }
      ] },
      "minimal-dark": { "layers": [{ "type": "gradient", "angle": 180, "stops": ["#050b12 0%", "#050b12 100%"] }] }
    }
  }')
),
updated_at = unixepoch()
WHERE status = 'active'
  AND (is_system = 1 OR slug IN ('dark', 'iam-code-dark', 'iam-cloud-navy', 'iam-crimson-deep', 'iam-crimson-night'));
