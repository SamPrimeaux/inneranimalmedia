-- 173: Gemini Cursor row — not present on GET https://api.cursor.com/v0/models (2026-03-25 list); hide from picker.
-- Other cursor:* rows keep existing model_key; worker maps id -> API slug to avoid UNIQUE(provider, model_key) clashes with direct API rows.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/173_ai_models_cursor_model_keys_from_v0_models.sql

UPDATE ai_models SET is_active = 0, show_in_picker = 0 WHERE id = 'cursor:google_gemini_3_pro';
