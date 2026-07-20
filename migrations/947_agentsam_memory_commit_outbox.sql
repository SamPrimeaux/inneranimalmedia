-- 947: Canonical memory commit ledger + D1 projection outbox (additive).
-- Law: D1 agentsam_memory = SSOT. Postgres/Vectorize are rebuildable projections via outbox.
-- Does NOT rewrite existing memory content. Does NOT treat embedded_at as a receipt.

-- Expand memory_type CHECK to include procedure|event while preserving legacy project|skill.
PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_memory_v947 (
  id               TEXT    PRIMARY KEY,
  memory_id        TEXT    NOT NULL,
  tenant_id        TEXT    NOT NULL,
  user_id          TEXT    NOT NULL,
  workspace_id     TEXT,
  scope_type       TEXT    NOT NULL DEFAULT 'user'
                           CHECK (scope_type IN ('user','workspace','tenant','platform')),
  scope_id         TEXT,
  memory_type      TEXT    DEFAULT 'fact'
                           CHECK (memory_type IN (
                             'fact','preference','decision','policy','state','procedure','event','error',
                             'project','skill'
                           )),
  key              TEXT    NOT NULL,
  value            TEXT    NOT NULL,
  title            TEXT,
  summary          TEXT,
  source           TEXT,
  source_type      TEXT,
  source_ref       TEXT,
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
  embedded_at      INTEGER,
  is_resolved      INTEGER DEFAULT 0,
  resolved_at      INTEGER,
  resolved_by      TEXT,
  -- Commit contract (additive)
  revision         INTEGER NOT NULL DEFAULT 1,
  status           TEXT    NOT NULL DEFAULT 'active'
                           CHECK (status IN ('candidate','active','superseded','archived','deleted')),
  content_hash     TEXT,
  sensitivity      TEXT    NOT NULL DEFAULT 'normal'
                           CHECK (sensitivity IN ('normal','internal','confidential','secret')),
  value_json       TEXT,
  supersedes_id    TEXT,
  superseded_by_id TEXT,
  projection_status TEXT   NOT NULL DEFAULT 'pending'
                           CHECK (projection_status IN ('pending','processing','ready','partial','failed','skipped')),
  projection_version INTEGER NOT NULL DEFAULT 0,
  projection_attempts INTEGER NOT NULL DEFAULT 0,
  last_projection_error TEXT,
  idempotency_key  TEXT,
  UNIQUE(memory_id, revision)
);

INSERT INTO agentsam_memory_v947 (
  id, memory_id, tenant_id, user_id, workspace_id, scope_type, scope_id,
  memory_type, key, value, title, summary, source, source_type, source_ref,
  confidence, decay_score, recall_count, last_recalled_at, expires_at,
  importance, is_pinned, is_archived, sync_key, created_at, updated_at,
  agent_id, session_id, tags, embedding_id, plan_id, task_id, embedded_at,
  is_resolved, resolved_at, resolved_by,
  revision, status, content_hash, sensitivity, value_json,
  supersedes_id, superseded_by_id, projection_status, projection_version,
  projection_attempts, last_projection_error, idempotency_key
)
SELECT
  COALESCE(NULLIF(TRIM(id), ''), 'mem_orphan_' || rowid) AS id,
  COALESCE(NULLIF(TRIM(id), ''), 'mem_orphan_' || rowid) AS memory_id,
  COALESCE(NULLIF(TRIM(tenant_id), ''), 'tenant_unknown') AS tenant_id,
  COALESCE(NULLIF(TRIM(user_id), ''), 'au_unknown') AS user_id,
  workspace_id,
  'user' AS scope_type,
  COALESCE(NULLIF(TRIM(user_id), ''), 'au_unknown') AS scope_id,
  COALESCE(memory_type, 'fact') AS memory_type,
  COALESCE(NULLIF(TRIM(key), ''), 'orphan:' || rowid) AS key,
  COALESCE(value, '') AS value,
  title,
  summary,
  source,
  NULL AS source_type,
  NULL AS source_ref,
  confidence,
  decay_score,
  recall_count,
  last_recalled_at,
  expires_at,
  importance,
  is_pinned,
  is_archived,
  CASE
    WHEN sync_key IS NOT NULL AND TRIM(sync_key) != '' THEN sync_key
    ELSE tenant_id || ':' || user_id || ':' || key
  END AS sync_key,
  created_at,
  updated_at,
  agent_id,
  session_id,
  tags,
  embedding_id,
  plan_id,
  task_id,
  embedded_at,
  COALESCE(is_resolved, 0),
  resolved_at,
  resolved_by,
  1 AS revision,
  CASE WHEN COALESCE(is_archived, 0) = 1 THEN 'archived' ELSE 'active' END AS status,
  NULL AS content_hash,
  'normal' AS sensitivity,
  NULL AS value_json,
  NULL AS supersedes_id,
  NULL AS superseded_by_id,
  -- Do NOT trust embedded_at as ready — leave pending for reconciliation/outbox.
  'pending' AS projection_status,
  0 AS projection_version,
  0 AS projection_attempts,
  NULL AS last_projection_error,
  NULL AS idempotency_key
FROM agentsam_memory;

DROP TABLE agentsam_memory;
ALTER TABLE agentsam_memory_v947 RENAME TO agentsam_memory;

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_tenant_user_type
  ON agentsam_memory(tenant_id, user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_agentsam_memory_sync_key ON agentsam_memory(sync_key);
CREATE INDEX IF NOT EXISTS idx_agentsam_memory_ws_updated
  ON agentsam_memory(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agentsam_memory_memory_id ON agentsam_memory(memory_id);
-- One active revision per conceptual slot (tenant+user+key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_memory_active_key
  ON agentsam_memory(tenant_id, user_id, key) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agentsam_memory_projection_status
  ON agentsam_memory(projection_status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_memory_idempotency
  ON agentsam_memory(tenant_id, user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND TRIM(idempotency_key) != '';

-- Projection outbox (same D1 batch as canonical revision)
CREATE TABLE IF NOT EXISTS agentsam_memory_outbox (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert','delete','tombstone')),
  desired_projections_json TEXT NOT NULL DEFAULT '["managed_pg","pgvector_chunk","vectorize"]',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','partial','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  locked_at INTEGER,
  last_error TEXT,
  receipts_json TEXT NOT NULL DEFAULT '{}',
  tenant_id TEXT,
  user_id TEXT,
  workspace_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_outbox_pending
  ON agentsam_memory_outbox(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_agentsam_memory_outbox_memory
  ON agentsam_memory_outbox(memory_id, revision);

-- Verified projection receipts (never use embedded_at alone)
CREATE TABLE IF NOT EXISTS agentsam_memory_projection_receipts (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  projection_key TEXT NOT NULL,
  projection_target TEXT NOT NULL
    CHECK (projection_target IN ('managed_pg','pgvector_chunk','vectorize')),
  status TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok','missing','mismatch','failed')),
  remote_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  verified_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(projection_key, projection_target)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_receipts_memory
  ON agentsam_memory_projection_receipts(memory_id, revision, content_hash);

PRAGMA foreign_keys = ON;

-- Tool registration
INSERT INTO agentsam_tools (
  tool_key, tool_name, display_name, tool_category, description, input_schema,
  handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
  oauth_visible, is_active, is_global, domain, capability_tier, updated_at
)
SELECT
  'agentsam_memory_commit',
  'agentsam_memory_commit',
  'Memory Commit',
  'memory',
  'Canonical D1 memory commit with projection outbox. Eager projection when possible; never treats embedded_at as a receipt.',
  '{"type":"object","additionalProperties":false,"properties":{"raw_text":{"type":"string"},"memory_type":{"type":"string","enum":["fact","preference","decision","policy","state","procedure","event","error"]},"memory_key":{"type":"string"},"title":{"type":"string"},"content":{"type":"string"},"summary":{"type":"string"},"importance":{"type":"integer","minimum":1,"maximum":10},"is_pinned":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"expires_at":{"type":"string"},"sensitivity":{"type":"string","enum":["normal","internal","confidential","secret"]},"supersedes":{"type":"string"},"dry_run":{"type":"boolean"},"eager":{"type":"boolean","default":true},"idempotency_key":{"type":"string"},"long_content_policy":{"type":"string","enum":["extract","document","chunk"]},"workspace_id":{"type":"string"}},"anyOf":[{"required":["raw_text"]},{"required":["content"]},{"required":["memory_key","content"]}]}',
  'memory',
  '{"operation":"memory.commit","auth_source":"token","eager_default":true}',
  'medium', 0, '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, 'memory', 'common', unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'agentsam_memory_commit');

INSERT OR REPLACE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, is_active, notes,
  created_at, updated_at, expose_on_connector, connector_priority
) VALUES (
  'iam_mcp_inneranimalmedia', 'agentsam_memory_commit', 'write', 40, 1,
  'Canonical memory commit + outbox projections',
  unixepoch(), unixepoch(), 1, 40
);

-- Point save at same commit path (eager:false) via handler_config hint
UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.operation', 'memory.commit',
      '$.eager_default', json('false'),
      '$.commit_path', 'agentsam_memory_commit'
    ),
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_save';
