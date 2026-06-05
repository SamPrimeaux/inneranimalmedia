-- 565: Repair invalid route_key FK on agentsam_commands + agentsam_route_requirements.
--
-- Root cause:
--   Child columns reference agentsam_prompt_routes(route_key), but route_key is NOT
--   uniquely indexed alone — canonical uniqueness is (route_key, tenant_id) on
--   uq_agentsam_prompt_routes_key_tenant. Platform rows use tenant_id NULL; tenants
--   may override the same route_key (e.g. plan + tenant_connor_mcneely).
--   SQLite rejects the FK definition ("foreign key mismatch") and blocks INSERTs.
--
-- Fix:
--   Rebuild both tables with route_key as optional TEXT (no REFERENCES).
--   Runtime resolves prompt routes via resolveRuntimeProfile / route resolver using
--   tenant context — not a single-column FK.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/565_fix_agentsam_commands_route_key_fk.sql

PRAGMA foreign_keys = OFF;

DROP VIEW IF EXISTS v_agentsam_route_capability_tool_matches_deduped;
DROP VIEW IF EXISTS v_agentsam_route_capability_tool_matches;

-- ── agentsam_commands ────────────────────────────────────────────────────────

DROP TABLE IF EXISTS agentsam_commands__fk565_new;

CREATE TABLE agentsam_commands__fk565_new (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL,
  slug                TEXT,
  display_name        TEXT NOT NULL,
  description         TEXT,
  pattern             TEXT,
  pattern_type        TEXT DEFAULT 'exact',
  mapped_command      TEXT NOT NULL,
  command_args        TEXT,
  category            TEXT DEFAULT 'misc',
  subcategory         TEXT,
  risk_level          TEXT DEFAULT 'low',
  requires_confirmation INTEGER DEFAULT 0,
  show_in_slash       INTEGER DEFAULT 1,
  show_in_allowlist   INTEGER DEFAULT 1,
  show_in_palette     INTEGER DEFAULT 1,
  modes_json          TEXT DEFAULT '["agent","auto","debug"]',
  sort_order          INTEGER DEFAULT 50,
  use_count           INTEGER DEFAULT 0,
  last_used_at        TEXT,
  is_active           INTEGER DEFAULT 1,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now')),
  internal_seo        TEXT DEFAULT '',
  task_type           TEXT DEFAULT 'tool_use',
  timeout_seconds     INTEGER DEFAULT 120,
  estimated_cost_usd  REAL DEFAULT 0.0,
  allowed_models_json TEXT DEFAULT '[]',
  output_schema       TEXT DEFAULT '{}',
  retry_policy        TEXT DEFAULT 'once',
  requires_approval   INTEGER DEFAULT 0,
  tenant_id           TEXT,
  success_count       INTEGER DEFAULT 0,
  failure_count       INTEGER DEFAULT 0,
  avg_duration_ms     REAL DEFAULT 0,
  router_type         TEXT DEFAULT 'tool',
  tool_key            TEXT,
  workflow_key        TEXT,
  subagent_slug       TEXT,
  server_key          TEXT,
  execution_mode      TEXT DEFAULT 'agent',
  is_global           INTEGER DEFAULT 1,
  route_key           TEXT DEFAULT NULL,
  created_at_unix     INTEGER,
  UNIQUE(workspace_id, slug)
);

INSERT INTO agentsam_commands__fk565_new
SELECT * FROM agentsam_commands;

DROP TABLE agentsam_commands;

ALTER TABLE agentsam_commands__fk565_new RENAME TO agentsam_commands;

CREATE INDEX IF NOT EXISTS idx_agentsam_commands_active
  ON agentsam_commands(is_active);

CREATE INDEX IF NOT EXISTS idx_agentsam_commands_category
  ON agentsam_commands(category);

CREATE INDEX IF NOT EXISTS idx_agentsam_commands_slug
  ON agentsam_commands(slug);

CREATE INDEX IF NOT EXISTS idx_commands_route
  ON agentsam_commands(route_key);

CREATE INDEX IF NOT EXISTS idx_commands_workspace_slug
  ON agentsam_commands(workspace_id, slug, is_active);

CREATE INDEX IF NOT EXISTS idx_commands_platform_active
  ON agentsam_commands(slug, is_active) WHERE workspace_id = 'platform';

CREATE INDEX IF NOT EXISTS idx_agentsam_commands_router
  ON agentsam_commands(workspace_id, is_active, router_type, route_key, task_type, risk_level);

CREATE INDEX IF NOT EXISTS idx_agentsam_commands_tool_key
  ON agentsam_commands(workspace_id, tool_key);

CREATE INDEX IF NOT EXISTS idx_agentsam_commands_workflow_key
  ON agentsam_commands(workspace_id, workflow_key);

CREATE INDEX IF NOT EXISTS idx_agentsam_commands_internal_seo
  ON agentsam_commands(workspace_id, internal_seo);

-- ── agentsam_route_requirements ──────────────────────────────────────────────

DROP TABLE IF EXISTS agentsam_route_requirements__fk565_new;

CREATE TABLE agentsam_route_requirements__fk565_new (
  id                    TEXT PRIMARY KEY DEFAULT ('req_' || lower(hex(randomblob(6)))),
  route_key             TEXT NOT NULL,
  task_type             TEXT DEFAULT NULL,
  min_context_window    INTEGER DEFAULT NULL,
  min_output_tokens     INTEGER DEFAULT NULL,
  requires_tools        INTEGER DEFAULT 0,
  requires_vision       INTEGER DEFAULT 0,
  requires_json_mode    INTEGER DEFAULT 0,
  requires_reasoning    INTEGER DEFAULT 0,
  requires_streaming    INTEGER DEFAULT 1,
  max_cost_per_1k_in    REAL DEFAULT NULL,
  max_cost_per_1k_out   REAL DEFAULT NULL,
  max_cost_per_call     REAL DEFAULT NULL,
  max_latency_p50_ms    INTEGER DEFAULT NULL,
  min_quality_score     REAL DEFAULT NULL,
  preferred_tier        TEXT DEFAULT NULL
                        CHECK(preferred_tier IN ('micro','flash','standard','power','reasoning',NULL)),
  max_tier              TEXT DEFAULT NULL
                        CHECK(max_tier IN ('micro','flash','standard','power','reasoning',NULL)),
  budget_priority       TEXT NOT NULL DEFAULT 'balanced'
                        CHECK(budget_priority IN ('cost','quality','speed','balanced')),
  preferred_providers   TEXT DEFAULT '[]',
  blocked_providers     TEXT DEFAULT '[]',
  is_active             INTEGER DEFAULT 1,
  mode                  TEXT DEFAULT 'default',
  allowed_lanes_json    TEXT DEFAULT '[]',
  required_capability_keys_json TEXT DEFAULT '[]',
  optional_capability_keys_json TEXT DEFAULT '[]',
  blocked_capability_keys_json TEXT DEFAULT '[]',
  approval_policy_json  TEXT DEFAULT '{}',
  max_tools             INTEGER,
  UNIQUE(route_key)
);

INSERT INTO agentsam_route_requirements__fk565_new
SELECT * FROM agentsam_route_requirements;

DROP TABLE agentsam_route_requirements;

ALTER TABLE agentsam_route_requirements__fk565_new RENAME TO agentsam_route_requirements;

CREATE INDEX IF NOT EXISTS idx_agentsam_route_requirements_key
  ON agentsam_route_requirements(route_key);

-- Restore views (from migrations/502_agentsam_tools_refactor.sql)
CREATE VIEW v_agentsam_route_capability_tool_matches AS
WITH route_caps AS (
  SELECT
    rr.route_key,
    rr.mode,
    'required' AS cap_source,
    lower(replace(json_each.value, '_', '.')) AS normalized_capability,
    json_each.value AS original_capability
  FROM agentsam_route_requirements rr, json_each(rr.required_capability_keys_json)
  UNION ALL
  SELECT
    rr.route_key,
    rr.mode,
    'optional' AS cap_source,
    lower(replace(json_each.value, '_', '.')) AS normalized_capability,
    json_each.value AS original_capability
  FROM agentsam_route_requirements rr, json_each(rr.optional_capability_keys_json)
  UNION ALL
  SELECT
    rr.route_key,
    rr.mode,
    'blocked' AS cap_source,
    lower(replace(json_each.value, '_', '.')) AS normalized_capability,
    json_each.value AS original_capability
  FROM agentsam_route_requirements rr, json_each(rr.blocked_capability_keys_json)
),
alias_matches AS (
  SELECT
    rc.route_key,
    rc.mode,
    rc.cap_source,
    rc.original_capability,
    rc.normalized_capability,
    a.abstract_capability,
    a.match_kind,
    a.match_value,
    a.priority AS alias_priority,
    a.requires_approval AS alias_requires_approval,
    a.is_mutation AS alias_is_mutation,
    a.rationale
  FROM route_caps rc
  JOIN agentsam_capability_aliases a
    ON a.is_active = 1
   AND lower(a.abstract_capability) = rc.normalized_capability
)
SELECT DISTINCT
  am.route_key,
  am.mode,
  am.cap_source,
  am.original_capability,
  am.normalized_capability,
  am.abstract_capability,
  am.match_kind,
  am.match_value,
  am.alias_priority,
  am.alias_requires_approval,
  am.alias_is_mutation,
  v.id AS tool_id,
  v.tool_name,
  v.tool_key,
  v.tool_category,
  v.handler_brand,
  v.capability_lane,
  v.capability_key,
  v.risk_level,
  v.requires_approval AS tool_requires_approval,
  v.sort_priority,
  am.rationale
FROM alias_matches am
JOIN v_agentsam_mcp_tools_branded v
  ON (
    (am.match_kind = 'tool_key' AND lower(v.tool_key) = lower(am.match_value))
    OR (am.match_kind = 'capability_key' AND lower(v.capability_key) = lower(am.match_value))
    OR (am.match_kind = 'tool_name' AND lower(v.tool_name) = lower(am.match_value))
    OR (am.match_kind = 'capability_lane' AND lower(v.capability_lane) = lower(am.match_value))
    OR (am.match_kind = 'tool_category' AND lower(v.tool_category) = lower(am.match_value))
    OR (am.match_kind = 'handler_brand' AND lower(v.handler_brand) = lower(am.match_value))
  )
WHERE COALESCE(v.enabled, 0) = 1;

CREATE VIEW v_agentsam_route_capability_tool_matches_deduped AS
WITH ranked AS (
  SELECT
    m.*,
    ROW_NUMBER() OVER (
      PARTITION BY route_key, mode, cap_source, original_capability, tool_key
      ORDER BY alias_priority ASC, sort_priority ASC, tool_id ASC
    ) AS rn
  FROM v_agentsam_route_capability_tool_matches m
)
SELECT
  route_key, mode, cap_source, original_capability, normalized_capability,
  abstract_capability, match_kind, match_value, alias_priority,
  alias_requires_approval, alias_is_mutation, tool_id, tool_name, tool_key,
  tool_category, handler_brand, capability_lane, capability_key, risk_level,
  tool_requires_approval, sort_priority, rationale
FROM ranked
WHERE rn = 1;

PRAGMA foreign_keys = ON;
