-- 730: Agent home flat canvas — theme glow replaces scenic gradient mid-sections.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/730_cms_themes_agent_home_flat_canvas.sql

UPDATE cms_themes
SET components_json = json_set(
  COALESCE(NULLIF(trim(components_json), ''), '{}'),
  '$.agent_home',
  json('{
    "version": 1,
    "mode": "fixed",
    "fixedPreset": "minimal-dark",
    "atmosphere": { "vignette": 0.38, "grain": 0.035, "glowAccent": "var(--color-primary)" },
    "ui": { "greetingStyle": "serif", "glassOpacity": 0.18 },
    "backdrops": {
      "dawn": { "layers": [{ "type": "gradient", "angle": 180, "stops": ["var(--bg-canvas) 0%", "var(--bg-canvas) 100%"] }] },
      "day": { "layers": [{ "type": "gradient", "angle": 180, "stops": ["var(--bg-canvas) 0%", "var(--bg-canvas) 100%"] }] },
      "dusk": { "layers": [{ "type": "gradient", "angle": 180, "stops": ["var(--bg-canvas) 0%", "var(--bg-canvas) 100%"] }] },
      "night": { "layers": [{ "type": "gradient", "angle": 180, "stops": ["var(--bg-canvas) 0%", "var(--bg-canvas) 100%"] }] },
      "minimal-dark": { "layers": [{ "type": "gradient", "angle": 180, "stops": ["var(--bg-canvas) 0%", "var(--bg-canvas) 100%"] }] }
    }
  }')
),
updated_at = unixepoch()
WHERE status = 'active';
