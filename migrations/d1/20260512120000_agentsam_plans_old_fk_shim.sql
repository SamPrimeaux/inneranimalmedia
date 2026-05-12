-- Legacy prod schemas: agentsam_tool_chain.plan_id FOREIGN KEY still references
-- agentsam_plans_old(id) after the plans table was renamed/rebuilt. SQLite then errors
-- on INSERT into agentsam_tool_chain with: no such table: main.agentsam_plans_old
--
-- Apply (example):
--   npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/d1/20260512120000_agentsam_plans_old_fk_shim.sql
--
-- Safe/idempotent: only creates a minimal id bridge table and mirrors plan PKs.

CREATE TABLE IF NOT EXISTS agentsam_plans_old (
  id TEXT PRIMARY KEY NOT NULL
);

INSERT OR IGNORE INTO agentsam_plans_old(id) SELECT id FROM agentsam_plans;
