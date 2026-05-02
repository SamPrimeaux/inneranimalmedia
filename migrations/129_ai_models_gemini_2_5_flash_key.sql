-- 129: Remove preview Gemini row so display "Gemini 2.5 Flash" maps to gemini-2.5-flash (existing row kept)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/129_ai_models_gemini_2_5_flash_key.sql

DELETE FROM ai_models
WHERE model_key = 'gemini-2.5-flash-preview-04-17';
