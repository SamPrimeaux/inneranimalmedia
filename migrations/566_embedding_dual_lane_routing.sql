-- 566: Split embedding routing — OpenAI text-embedding-3-large (text) vs Gemini gemini-embedding-2 (multimodal).
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/566_embedding_dual_lane_routing.sql

-- Multimodal lane (separate index — never mix with OpenAI 1536 vectors).
UPDATE agentsam_routing_arms
SET task_type = 'embeddings_multimodal',
    pause_reason = NULL,
    updated_at = unixepoch()
WHERE id = 'ra_embed_gemini2_ws';

INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  tools_json, workflow_agent, reasoning_effort,
  last_decay_at, updated_at
) VALUES
  ('ra_embed_openai_text_large_ws', 'embeddings', 'auto', 'text-embedding-3-large', 'openai', 'ws_inneranimalmedia',
   2.0, 1.0, 0.80, 1, 0, 1, 0, 0, 90, 0, '[]', 'rag', 'low', unixepoch(), unixepoch());

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, updated_at
)
SELECT 'ai_openai_embed_lg', '', 'OpenAI Text Embedding 3 Large', 'openai_embed_lg',
  'Primary text/code/docs RAG @1536 — do not mix with Gemini multimodal index.', 'active', 'model',
  'text-embedding-3-large', 'openai', 'openai', 'OPENAI_API_KEY', 0, 1, 0, 431, 'OpenAI / Embedding', 1, 0, unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_ai WHERE model_key = 'text-embedding-3-large' AND mode = 'model'
);
