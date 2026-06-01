-- Rebrand platform subagents from vendor-specific names to Agent Sam.
-- Raise audit-friendly profiles in sort_order for multitask fanout defaults.

UPDATE agentsam_subagent_profile
SET
  slug = 'sam-scout',
  display_name = 'Agent Sam Scout',
  description = 'Fast triage, classification, and cheap JSON — protects budget before Builder runs.',
  instructions_markdown = 'You are Agent Sam Scout. Classify task_type, estimate risk, list required tools, and recommend routing lane. Output compact JSON only. Do not implement patches.',
  sort_order = 15,
  updated_at = datetime('now')
WHERE id = 'qs_anthropic_scout';

UPDATE agentsam_subagent_profile
SET
  slug = 'sam-builder',
  display_name = 'Agent Sam Builder',
  description = 'Primary implementation agent for code, Worker debug, D1/Supabase alignment, and tool workflows.',
  instructions_markdown = 'You are Agent Sam Builder. Implement or debug in this repo with full tool access. Capture tokens, latency, and routing_arm_id on completion.',
  sort_order = 16,
  updated_at = datetime('now')
WHERE id = 'qs_anthropic_builder';

UPDATE agentsam_subagent_profile
SET
  slug = 'sam-boss',
  display_name = 'Agent Sam Boss',
  description = 'Owner-gated premium review only. Never used as Auto fallback.',
  instructions_markdown = 'Boss review: compressed facts in, decision + risks + exact next steps out. Require explicit owner approval before running.',
  sort_order = 99,
  updated_at = datetime('now')
WHERE id = 'qs_anthropic_boss';

UPDATE agentsam_subagent_profile
SET
  display_name = 'Agent Sam SQL',
  description = 'Text-to-SQL specialist for D1 audits. Read-only by default; never mutates without approval.',
  sort_order = 12,
  updated_at = datetime('now')
WHERE slug = 'sqlcoder';

UPDATE agentsam_subagent_profile
SET sort_order = 5, updated_at = datetime('now')
WHERE id = 'qs_tpl_code_editor';

UPDATE agentsam_subagent_profile
SET sort_order = 6, updated_at = datetime('now')
WHERE id = 'qs_tpl_deep_researcher';

UPDATE agentsam_subagent_profile
SET sort_order = 7, updated_at = datetime('now')
WHERE id = 'qs_tpl_deploy_validator';
