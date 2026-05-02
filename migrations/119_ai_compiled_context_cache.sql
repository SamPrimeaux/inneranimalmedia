-- 119: ai_compiled_context_cache — cache for Agent Sam system context (memory + kb + mcp + schema)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/119_ai_compiled_context_cache.sql
-- Purpose: Avoid repeated agent_memory_index + ai_knowledge_base + mcp_services queries on every chat; 30min TTL.

CREATE TABLE IF NOT EXISTS ai_compiled_context_cache (
  id TEXT PRIMARY KEY,
  context_hash TEXT NOT NULL UNIQUE,
  context_type TEXT NOT NULL DEFAULT 'agent_sam_system',
  compiled_context TEXT NOT NULL,
  source_context_ids_json TEXT DEFAULT '[]',
  token_count INTEGER DEFAULT 0,
  tenant_id TEXT NOT NULL DEFAULT 'system',
  created_at INTEGER,
  last_accessed_at INTEGER,
  expires_at INTEGER,
  access_count INTEGER DEFAULT 0,
  cache_hit_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ai_compiled_context_cache_hash_expires
  ON ai_compiled_context_cache(context_hash, expires_at);
