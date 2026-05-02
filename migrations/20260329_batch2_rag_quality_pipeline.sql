-- Batch 2: AutoRAG quality pipeline — rag_query_log columns, classifier intent patterns, RAG routing rules
-- Apply once: wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/20260329_batch2_rag_quality_pipeline.sql
-- Re-run: may fail on duplicate COLUMN (safe to ignore those lines)

ALTER TABLE rag_query_log ADD COLUMN inject_chars INTEGER DEFAULT 0;
ALTER TABLE rag_query_log ADD COLUMN intent TEXT;
ALTER TABLE rag_query_log ADD COLUMN source TEXT;
ALTER TABLE rag_query_log ADD COLUMN was_capped INTEGER DEFAULT 0;
ALTER TABLE rag_query_log ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE rag_query_log ADD COLUMN rerank_used INTEGER DEFAULT 0;

INSERT OR IGNORE INTO agent_intent_patterns (intent_slug, display_name, triggers_json) VALUES
('mixed', 'Classifier mixed', '[]'),
('sql', 'Classifier sql', '[]'),
('shell', 'Classifier shell', '[]'),
('question', 'Classifier question', '[]');

INSERT OR REPLACE INTO ai_routing_rules (id, rule_name, priority, match_type, match_value, target_model_key, target_provider, fallback_model_key, fallback_provider, reason, is_active, updated_at)
VALUES
('route_batch2_rag_mixed', 'rag-synthesis-default', 10, 'intent', 'mixed', 'gemini-3.1-flash-lite-preview', 'google', 'gemini-3-flash-preview', 'google', 'RAG synthesis — escalate on retry', 1, unixepoch()),
('route_batch2_rag_sql', 'rag-synthesis-sql', 20, 'intent', 'sql', 'gpt-4.1-nano', 'openai', 'gpt-4.1-mini', 'openai', 'SQL RAG synthesis fallback', 1, unixepoch());
