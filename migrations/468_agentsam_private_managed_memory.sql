-- 468: Private managed memory — D1 schema (policy/state + mirror columns) + catalog routing hint.
-- PG canonical table: supabase/migrations/20260529120000_agentsam_private_managed_memory.sql
-- Apply D1:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/468_agentsam_private_managed_memory.sql

PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_memory_v468 (
  id               TEXT    PRIMARY KEY,
  tenant_id        TEXT    NOT NULL,
  user_id          TEXT    NOT NULL,
  workspace_id     TEXT,
  memory_type      TEXT    DEFAULT 'fact'
                           CHECK (memory_type IN (
                             'fact','preference','project','skill','error','decision','policy','state'
                           )),
  key              TEXT    NOT NULL,
  value            TEXT    NOT NULL,
  title            TEXT,
  summary          TEXT,
  source           TEXT,
  confidence       REAL    DEFAULT 1.0,
  decay_score      REAL    DEFAULT 1.0,
  recall_count     INTEGER DEFAULT 0,
  last_recalled_at INTEGER,
  expires_at       INTEGER,
  importance       INTEGER DEFAULT 5,
  is_pinned        INTEGER DEFAULT 0,
  is_archived      INTEGER DEFAULT 0,
  sync_key         TEXT,
  created_at       INTEGER DEFAULT (unixepoch()),
  updated_at       INTEGER DEFAULT (unixepoch()),
  agent_id         TEXT,
  session_id       TEXT,
  tags             TEXT    DEFAULT '[]',
  embedding_id     TEXT,
  plan_id          TEXT,
  task_id          TEXT,
  UNIQUE(tenant_id, user_id, key)
);

INSERT INTO agentsam_memory_v468 (
  id, tenant_id, user_id, workspace_id, memory_type, key, value,
  title, summary, source, confidence, decay_score, recall_count, last_recalled_at,
  expires_at, importance, is_pinned, is_archived, sync_key,
  created_at, updated_at, agent_id, session_id, tags, embedding_id, plan_id, task_id
)
SELECT
  id, tenant_id, user_id, workspace_id, memory_type, key, value,
  NULL, NULL, source, confidence, decay_score, recall_count, last_recalled_at,
  expires_at, 5, 0, 0,
  tenant_id || ':' || user_id || ':' || key,
  created_at, updated_at, agent_id, session_id, tags, embedding_id, plan_id, task_id
FROM agentsam_memory;

DROP TABLE agentsam_memory;
ALTER TABLE agentsam_memory_v468 RENAME TO agentsam_memory;

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_tenant_user_type
  ON agentsam_memory(tenant_id, user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_agentsam_memory_sync_key ON agentsam_memory(sync_key);
CREATE INDEX IF NOT EXISTS idx_agentsam_memory_ws_updated
  ON agentsam_memory(workspace_id, updated_at DESC);

PRAGMA foreign_keys = ON;

-- Seed private error memory (D1 cache; PG mirror via Worker on next upsert or backfill job)
INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_error_mcp_memory_save_401_reauth',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'error',
  'error:mcp_memory_save_401_reauth',
  'ChatGPT attempted agentsam_memory_save but IAM MCP returned 401 reauthentication required. Re-auth MCP connector before external AI memory writes. Do not claim memory saved when auth failed.',
  'MCP memory save failed due to reauthentication required',
  'MCP 401 on agentsam_memory_save — reauth IAM connector; use D1/private PG fallback until restored.',
  'chatgpt_observed_failure',
  '["mcp","memory","auth","external-ai","repair"]',
  1.0,
  8,
  1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:error:mcp_memory_save_401_reauth',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  title = excluded.title,
  summary = excluded.summary,
  source = excluded.source,
  tags = excluded.tags,
  importance = excluded.importance,
  is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key,
  updated_at = unixepoch();

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_milestone_20260529_runtime_security_r2',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'project',
  'milestone:20260529_runtime_security_public_learning_r2',
  '{"head":"56b4a7e","themes":["data_plane_security","r2_get_put_delete","lane_spine","cursor_worker"]}',
  'May 29 2026 runtime security + R2 + lane spine',
  'Shipped customer data plane isolation, R2 agent CRUD-only, lane-aware retrieval, Cursor/Worker infra.',
  'cursor_session_sync',
  '["may29","milestone","security","r2"]',
  1.0,
  7,
  0,
  'tenant_sam_primeaux:au_871d920d1233cbd1:milestone:20260529_runtime_security_public_learning_r2',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  title = excluded.title,
  summary = excluded.summary,
  updated_at = unixepoch();

UPDATE agentsam_tools
SET handler_config = json_patch(
  COALESCE(NULLIF(trim(handler_config), ''), '{}'),
  '{"module":"memory","operation":"memory_write","auth_source":"platform","private_pg_mirror":true}'
),
description = COALESCE(description, '') || ' Writes D1 agentsam_memory + mirrors to private agentsam.agentsam_memory (no public.agent_memory).',
updated_at = unixepoch()
WHERE tool_key IN ('agentsam_memory_save', 'agentsam_memory_write')
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_tools
SET handler_config = json_patch(
  COALESCE(NULLIF(trim(handler_config), ''), '{}'),
  '{"module":"memory","operation":"memory_search","auth_source":"platform","private_pg_search":true}'
),
updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_search'
  AND COALESCE(is_active, 1) = 1;
