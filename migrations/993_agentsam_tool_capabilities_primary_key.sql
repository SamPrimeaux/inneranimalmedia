-- 993_agentsam_tool_capabilities_primary_key.sql
--
-- Root cause: agentsam_tool_capabilities has always enforced uniqueness via
-- an unnamed UNIQUE(tool_id, capability_key) constraint, but never had that
-- pair declared as an actual PRIMARY KEY. Flagged by architecture_cartographer.py
-- as the one real NO_PRIMARY_KEY finding in the D1 audit (the other two --
-- r2_objects_fts and security_findings_archive_431 -- are FTS5 shadow-table
-- artifacts and a separate lower-priority case, not touched here).
--
-- Fix: recreate the table with PRIMARY KEY (tool_id, capability_key) --
-- the exact same column pair already unique today, matching the composite
-- natural-key convention already used elsewhere in this schema (cell_values,
-- role_capabilities, etc.). No new surrogate id column, no behavior change
-- for any existing query -- this only formalizes what was already true.
--
-- SQLite cannot ALTER TABLE ... ADD PRIMARY KEY, so this uses the standard
-- recreate-and-swap pattern. Both original foreign keys (including
-- ON DELETE CASCADE on tool_id) are preserved exactly.
--
-- NOTE: no explicit BEGIN TRANSACTION / COMMIT / PRAGMA here -- D1 rejects
-- raw SQL transaction control statements and wraps the whole file in its
-- own atomic transaction automatically (rolls back the entire file on any
-- failure, per wrangler's own execution model). Do not add BEGIN/COMMIT
-- back in if you edit this for D1.
--
-- Table is small (≈207 rows per last audit) -- this is a cheap, low-risk swap.

CREATE TABLE agentsam_tool_capabilities__new (
  tool_id          TEXT NOT NULL REFERENCES agentsam_tools(id) ON DELETE CASCADE,
  capability_key   TEXT NOT NULL REFERENCES agentsam_capabilities(capability_key),
  requirement_type TEXT NOT NULL DEFAULT 'required' CHECK (requirement_type = 'required'),
  is_primary       INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  operations_json  TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (tool_id, capability_key)
);

INSERT INTO agentsam_tool_capabilities__new
  (tool_id, capability_key, requirement_type, is_primary, operations_json, created_at)
SELECT
  tool_id, capability_key, requirement_type, is_primary, operations_json, created_at
FROM agentsam_tool_capabilities;

DROP TABLE agentsam_tool_capabilities;

ALTER TABLE agentsam_tool_capabilities__new RENAME TO agentsam_tool_capabilities;

CREATE INDEX IF NOT EXISTS idx_agentsam_tool_capabilities_capability
  ON agentsam_tool_capabilities (capability_key);

CREATE INDEX IF NOT EXISTS idx_agentsam_tool_capabilities_tool
  ON agentsam_tool_capabilities (tool_id);
