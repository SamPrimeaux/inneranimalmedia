-- 620: Client / customer / project questions → composite docs + memory lane.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/620_agentsam_rag_client_project_intent.sql

INSERT OR IGNORE INTO agentsam_rag_intent_routes (id, intent_key, lane_order_json, description, is_active, updated_at)
VALUES (
  'rag_intent_client_project',
  'client_project_question',
  '["client_project_semantic_search","memory_semantic_search","docs_knowledge_search"]',
  'Customer, client, tenant, and project onboarding / scope questions',
  1,
  unixepoch()
);

UPDATE agentsam_rag_intent_routes
SET
  lane_order_json = '["client_project_semantic_search","memory_semantic_search","docs_knowledge_search"]',
  description = 'Customer, client, tenant, and project onboarding / scope questions',
  is_active = 1,
  updated_at = unixepoch()
WHERE intent_key = 'client_project_question';
