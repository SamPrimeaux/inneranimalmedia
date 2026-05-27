-- 430: Sync D1 catalog to canonical agentsam_plan schema (code source: mcp-plan-schema.js).

UPDATE agentsam_tools
SET
  description = 'Create or read workspace plans. Call with {} to create using the default goal, or read: true to fetch the active plan.',
  input_schema = '{"type":"object","properties":{"goal":{"type":"string","description":"Goal to create a structured execution plan for. Defaults to a general planning goal when omitted."},"context":{"type":"string","description":"Optional extra context."},"read":{"type":"boolean","description":"When true, read the latest active plan and tasks instead of creating a new plan."},"title":{"type":"string","description":"Optional plan title when creating (defaults from goal)."}},"additionalProperties":false}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_plan';
