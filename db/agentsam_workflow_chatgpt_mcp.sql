INSERT OR REPLACE INTO agentsam_mcp_workflows
(id, workflow_key, display_name, description, status, priority, steps_json, tools_json, acceptance_criteria_json, created_at, updated_at)
VALUES
(
  'wf_chatgpt_mcp_server',
  'inneranimalmedia.chatgpt_mcp_server.build',
  'Build ChatGPT-Compatible AgentSam MCP Server',
  'Build a production-ready remote MCP server for ChatGPT Apps/API integrations using read-only search/fetch tools over AgentSam R2, D1, docs, and Vectorize knowledge.',
  'ready',
  'critical',
  '["Inspect current MCP Worker","Implement /health","Implement /sse","Implement search","Implement fetch","Use R2/D1/Vectorize sources","Add auth gate","Test with curl","Document ChatGPT connection"]',
  '["terminal","wrangler","r2","d1","vectorize","openai_api","mcp","qa"]',
  '["/health returns ok","/sse exists","search returns MCP content array","fetch returns MCP content array","read-only by default","no secrets exposed","skills searchable from R2"]',
  datetime('now'),
  datetime('now')
);
