PRAGMA foreign_keys = OFF;

-- Step 1: Consolidate legacy user_id formats to canonical au_ format
UPDATE agentsam_memory
SET user_id = 'au_871d920d1233cbd1'
WHERE user_id IN ('sam_primeaux', 'usr_sam_iam', 'usr_sam_primeaux')
  AND tenant_id = 'tenant_sam_primeaux';

-- Step 2: Recreate table — strip hardcoded defaults, fix UNIQUE key
CREATE TABLE agentsam_memory_new (
  id               TEXT    PRIMARY KEY DEFAULT ('mem_' || lower(hex(randomblob(8)))),
  tenant_id        TEXT    NOT NULL,
  user_id          TEXT    NOT NULL,
  workspace_id     TEXT,
  memory_type      TEXT    DEFAULT 'fact'
                           CHECK (memory_type IN ('fact','preference','project','skill','error','decision')),
  key              TEXT    NOT NULL,
  value            TEXT    NOT NULL,
  source           TEXT,
  confidence       REAL    DEFAULT 1.0,
  decay_score      REAL    DEFAULT 1.0,
  recall_count     INTEGER DEFAULT 0,
  last_recalled_at INTEGER,
  expires_at       INTEGER,
  created_at       INTEGER DEFAULT (unixepoch()),
  updated_at       INTEGER DEFAULT (unixepoch()),
  agent_id         TEXT,
  session_id       TEXT,
  tags             TEXT    DEFAULT '[]',
  embedding_id     TEXT,
  UNIQUE(tenant_id, user_id, key)
);

INSERT INTO agentsam_memory_new SELECT
  id, tenant_id, user_id, workspace_id, memory_type,
  key, value, source, confidence, decay_score,
  recall_count, last_recalled_at, expires_at,
  created_at, updated_at, agent_id, session_id, tags, embedding_id
FROM agentsam_memory;

DROP TABLE agentsam_memory;
ALTER TABLE agentsam_memory_new RENAME TO agentsam_memory;

CREATE INDEX idx_mem_tenant_type   ON agentsam_memory(tenant_id, memory_type);
CREATE INDEX idx_mem_tenant_expires ON agentsam_memory(tenant_id, expires_at);
CREATE INDEX idx_mem_decay         ON agentsam_memory(decay_score);
CREATE INDEX idx_mem_agent         ON agentsam_memory(agent_id);
CREATE INDEX idx_mem_user_type     ON agentsam_memory(user_id, memory_type);

PRAGMA foreign_keys = ON;
