-- Phase 2–3: MCP catalog vs graph — clear false graph_mode flags, then enable graph_mode
-- only when a normalized DAG exists for the MCP row and a matching agentsam_workflows registry row exists.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/314_agentsam_mcp_workflow_graph_mode_normalize.sql

-- Demote: graph_mode was on but there is no executable graph tied to this MCP row + registry.
UPDATE agentsam_mcp_workflows AS m
SET graph_mode = 0,
    updated_at = datetime('now')
WHERE m.graph_mode = 1
  AND NOT (
    EXISTS (
      SELECT 1 FROM agentsam_workflow_nodes n
      WHERE n.workflow_id = m.id
    )
    AND EXISTS (
      SELECT 1 FROM agentsam_workflows w
      WHERE w.workflow_key = m.workflow_key
        AND COALESCE(w.is_active, 1) = 1
    )
  );

-- Promote: MCP catalog rows that have DAG nodes + workflow registry (MCP catalog-only until then).
UPDATE agentsam_mcp_workflows AS m
SET graph_mode = 1,
    updated_at = datetime('now')
WHERE COALESCE(m.is_active, 1) = 1
  AND m.graph_mode = 0
  AND EXISTS (
    SELECT 1 FROM agentsam_workflow_nodes n
    WHERE n.workflow_id = m.id
  )
  AND EXISTS (
    SELECT 1 FROM agentsam_workflows w
    WHERE w.workflow_key = m.workflow_key
      AND COALESCE(w.is_active, 1) = 1
  );
