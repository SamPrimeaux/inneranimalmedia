-- 172: Cursor-backed models — picker + secret_key_name CURSOR_API_KEY (Worker secret inneranimalmedia).
-- Run from repo root (use absolute --file if wrangler cannot resolve relative path):
-- ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/172_ai_models_cursor_secret_and_picker.sql

UPDATE ai_models SET
  is_active = 1,
  show_in_picker = 1,
  secret_key_name = 'CURSOR_API_KEY'
WHERE id IN (
  'cursor:anthropic_claude_opus_4_6',
  'cursor:openai_gpt_5_codex',
  'cursor:openai_gpt_5',
  'cursor:google_gemini_3_pro',
  'cursor:openai_gpt_5_2_codex'
);
