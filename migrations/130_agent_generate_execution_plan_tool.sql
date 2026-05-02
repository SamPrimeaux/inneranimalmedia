-- 130: Register generate_execution_plan tool for Agent Sam (Phase 2)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/130_agent_generate_execution_plan_tool.sql
-- Purpose: Model can call generate_execution_plan to create a plan; UI shows ExecutionPlanCard and user can approve/reject.

INSERT OR IGNORE INTO mcp_registered_tools (
  id,
  tool_name,
  tool_category,
  mcp_service_url,
  description,
  input_schema,
  requires_approval,
  enabled,
  created_at,
  updated_at
) VALUES (
  'tool_generate_execution_plan',
  'generate_execution_plan',
  'execute',
  'builtin',
  'Generate a step-by-step execution plan for the user to approve before running. Use when the user asks for multi-step actions, deployments, or risky operations. Input: summary (string), steps (array of { title, description, optional payload }). Returns plan_id for the UI to show approve/reject.',
  '{"type":"object","properties":{"summary":{"type":"string","description":"Short summary of the plan"},"steps":{"type":"array","description":"Ordered list of steps","items":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"payload":{"type":"object"}}}},"required":["summary","steps"]}',
  0,
  1,
  unixepoch(),
  unixepoch()
);
