-- 806: Mail triage route — Gmail read/write tools + subagent tool globs (in-app Agent Sam on /dashboard/mail).

UPDATE agentsam_subagent_profile
SET
  allowed_tool_globs = '["gmail_*","agentsam_gmail_mcp_*"]',
  instructions_markdown = 'You are Agent Sam mail triage. The user is on Collaborate Mail — live inbox snapshot may appear in ## Mail context. ALWAYS call gmail_list_inbox or agentsam_gmail_mcp_search_threads before saying you cannot read their inbox. Summarize from tool results + context; never invent messages. For triage_inbox return compact JSON: {items:[{id,urgency,category,suggested_action}]}. No emojis.',
  updated_at = datetime('now')
WHERE slug = 'mail_triage' AND is_active = 1;

INSERT INTO agentsam_prompt_routes (
  id,
  route_key,
  display_name,
  intent_labels,
  command_categories,
  trigger_keywords,
  prompt_layer_keys,
  tool_categories,
  tool_keys,
  max_tools,
  preferred_model,
  fallback_model,
  include_rag,
  include_active_plan,
  include_recent_memory,
  memory_limit,
  include_workspace_ctx,
  token_budget,
  is_active,
  priority,
  tenant_id,
  created_at,
  updated_at
)
SELECT
  'route_mail_triage_platform',
  'mail_triage',
  'Mail Triage',
  '["mail","inbox","gmail","triage","summarize","reply"]',
  '["gmail","collaborate"]',
  '["mail","inbox","gmail","triage","summarize","notifications","deploy"]',
  '["core_identity","workspace_context"]',
  '["gmail"]',
  '["gmail_list_inbox","gmail_modify_message","gmail_send","agentsam_gmail_mcp_search_threads","agentsam_gmail_mcp_get_thread"]',
  6,
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  0,
  0,
  1,
  3,
  1,
  2400,
  1,
  18,
  NULL,
  unixepoch(),
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'mail_triage' AND tenant_id IS NULL
);

UPDATE agentsam_prompt_routes
SET
  display_name = 'Mail Triage',
  tool_keys = '["gmail_list_inbox","gmail_modify_message","gmail_send","agentsam_gmail_mcp_search_threads","agentsam_gmail_mcp_get_thread"]',
  tool_categories = '["gmail"]',
  max_tools = 6,
  include_workspace_ctx = 1,
  include_recent_memory = 1,
  memory_limit = 3,
  include_rag = 0,
  is_active = 1,
  updated_at = unixepoch()
WHERE route_key = 'mail_triage' AND tenant_id IS NULL;
