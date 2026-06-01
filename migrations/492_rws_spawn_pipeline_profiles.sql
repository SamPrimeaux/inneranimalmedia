-- RWS spawn pipeline: plain-English summarizer profile + enable fanout execution.
-- Pipeline: read (deep-researcher) → write (code-editor) → summarize (plain-summarizer).

INSERT INTO agentsam_subagent_profile (
  id,
  user_id,
  workspace_id,
  tenant_id,
  slug,
  display_name,
  description,
  instructions_markdown,
  allowed_tool_globs,
  is_active,
  is_platform_global,
  sort_order,
  agent_type,
  created_at,
  updated_at
) VALUES (
  'qs_tpl_plain_summarizer',
  'platform',
  '',
  '',
  'plain-summarizer',
  'Plain English summarizer',
  'User-facing voice of the RWS pipeline — explains outcomes in simple language.',
  'You are the summarizer subagent. Never use jargon or internal tool names. Explain what was read, what was changed, and what the user should do next in short plain English.',
  '["read"]',
  1,
  1,
  8,
  'summarize',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = 1,
  sort_order = excluded.sort_order,
  updated_at = datetime('now');

-- Deep researcher: D1 read for evidence gathering in RWS read step.
UPDATE agentsam_subagent_profile
SET
  allowed_tool_globs = '["read","glob","grep","web","d1","sql"]',
  updated_at = datetime('now')
WHERE slug = 'deep-researcher'
  AND allowed_tool_globs NOT LIKE '%"d1"%';

-- Enable fanout execution for users who may already spawn subagents.
UPDATE agentsam_user_policy
SET allow_fanout_execution = 1
WHERE COALESCE(allow_subagent_spawn, 1) = 1
  AND COALESCE(allow_fanout_execution, 0) = 0;
