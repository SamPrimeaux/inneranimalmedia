-- 235: OpenAI GPT-4.1 / GPT-5.1 family in ai_models (picker + routing via api_platform=openai).
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/235_ai_models_openai_gpt_4_1_gpt_5_1_family.sql

-- gpt-4.1 — 1M context, best for long docs
INSERT OR REPLACE INTO ai_models (
  id, model_key, display_name, provider, api_platform,
  secret_key_name, input_rate_per_mtok, output_rate_per_mtok,
  context_max_tokens, supports_tools, supports_vision,
  show_in_picker, is_active, size_class
) VALUES (
  'gpt-4.1', 'gpt-4.1', 'GPT-4.1', 'openai', 'openai',
  'OPENAI_API_KEY', 2.00, 8.00,
  1000000, 1, 1, 1, 1, 'large'
);

-- gpt-4.1-mini
INSERT OR REPLACE INTO ai_models (
  id, model_key, display_name, provider, api_platform,
  secret_key_name, input_rate_per_mtok, output_rate_per_mtok,
  context_max_tokens, supports_tools, supports_vision,
  show_in_picker, is_active, size_class
) VALUES (
  'gpt-4.1-mini', 'gpt-4.1-mini', 'GPT-4.1 Mini', 'openai', 'openai',
  'OPENAI_API_KEY', 0.40, 1.60,
  1000000, 1, 1, 1, 1, 'small'
);

-- gpt-4.1-nano — cheapest, high volume routing
INSERT OR REPLACE INTO ai_models (
  id, model_key, display_name, provider, api_platform,
  secret_key_name, input_rate_per_mtok, output_rate_per_mtok,
  context_max_tokens, supports_tools, supports_vision,
  show_in_picker, is_active, size_class
) VALUES (
  'gpt-4.1-nano', 'gpt-4.1-nano', 'GPT-4.1 Nano', 'openai', 'openai',
  'OPENAI_API_KEY', 0.10, 0.40,
  1000000, 1, 0, 1, 1, 'nano'
);

-- gpt-5.1 — flagship
INSERT OR REPLACE INTO ai_models (
  id, model_key, display_name, provider, api_platform,
  secret_key_name, input_rate_per_mtok, output_rate_per_mtok,
  context_max_tokens, supports_tools, supports_vision,
  show_in_picker, is_active, size_class
) VALUES (
  'gpt-5.1', 'gpt-5.1', 'GPT-5.1', 'openai', 'openai',
  'OPENAI_API_KEY', 2.50, 10.00,
  270000, 1, 1, 1, 1, 'large'
);

-- gpt-5-mini
INSERT OR REPLACE INTO ai_models (
  id, model_key, display_name, provider, api_platform,
  secret_key_name, input_rate_per_mtok, output_rate_per_mtok,
  context_max_tokens, supports_tools, supports_vision,
  show_in_picker, is_active, size_class
) VALUES (
  'gpt-5-mini', 'gpt-5-mini', 'GPT-5 Mini', 'openai', 'openai',
  'OPENAI_API_KEY', 0.75, 4.50,
  270000, 1, 1, 1, 1, 'small'
);

-- gpt-5-nano
INSERT OR REPLACE INTO ai_models (
  id, model_key, display_name, provider, api_platform,
  secret_key_name, input_rate_per_mtok, output_rate_per_mtok,
  context_max_tokens, supports_tools, supports_vision,
  show_in_picker, is_active, size_class
) VALUES (
  'gpt-5-nano', 'gpt-5-nano', 'GPT-5 Nano', 'openai', 'openai',
  'OPENAI_API_KEY', 0.20, 1.25,
  270000, 1, 0, 1, 1, 'nano'
);
