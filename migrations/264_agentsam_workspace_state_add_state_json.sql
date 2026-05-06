-- 264: Schema-history marker — agentsam_workspace_state.state_json
-- Context:
-- - We saw runtime errors: "D1_ERROR: no such column: state_json" from workspace update paths.
-- - Remote D1 has since been updated and already contains `state_json`.
--
-- IMPORTANT:
-- - Do NOT re-apply an `ALTER TABLE ... ADD COLUMN state_json` on remote D1; it will fail with
--   "duplicate column name".
-- - This migration is intentionally a no-op so it is safe to keep in git history.
--
SELECT 1;

