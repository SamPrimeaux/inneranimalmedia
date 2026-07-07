-- Mail subagent profiles + retire gemini-3.1-pro-preview from generic routing arms.
-- classify/triage → gemini-3.1-flash-lite (stable, not preview)
-- compose/draft → gemini-3.5-flash (agentic synthesis)

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, default_model_id, is_active, is_platform_global,
  sort_order, agent_type, created_at, updated_at
) VALUES
(
  'asp_mail_triage',
  'platform', '', '',
  'mail_triage',
  'Mail Triage',
  'Classify urgency, summarize threads, and triage inbox batches with cheap stable Gemini.',
  'You are Agent Sam mail triage. Return compact JSON: summary, urgency (critical|high|normal|low|fyi), type, action_items[]. For triage_inbox return {items:[{id,urgency,category,suggested_action}]}. No emojis.',
  '[]',
  'gemini-3.1-flash-lite',
  1, 1, 20, 'scout',
  datetime('now'), datetime('now')
),
(
  'asp_mail_compose',
  'platform', '', '',
  'mail_compose',
  'Mail Compose',
  'Draft replies and new mail with gemini-3.5-flash synthesis quality.',
  'You are Agent Sam mail composer. Return JSON: subject, body_text, body_html (optional). Match sender tone. Professional, concise. No emojis unless user asks.',
  '[]',
  'gemini-3.5-flash',
  1, 1, 21, 'builder',
  datetime('now'), datetime('now')
),
(
  'asp_mail_sweep',
  'platform', '', '',
  'mail_sweep',
  'Mail Sweep',
  'Bulk classify inbox for cleanup — flash-lite for volume.',
  'You are Agent Sam inbox sweeper. Input: email list. Output JSON: {items:[{id,urgency,category,archive_candidate,delete_candidate,reason}]}. Prefer archive over delete. No emojis.',
  '[]',
  'gemini-3.1-flash-lite',
  1, 1, 22, 'scout',
  datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  default_model_id = excluded.default_model_id,
  is_active = 1,
  is_platform_global = 1,
  updated_at = datetime('now');

-- Redirect generic 3.1 Pro Preview arms to 3.5 Flash (keep customtools lane).
UPDATE agentsam_routing_arms
SET model_key = 'gemini-3.5-flash',
    updated_at = unixepoch()
WHERE model_key = 'gemini-3.1-pro-preview'
  AND is_active = 1;

UPDATE agentsam_model_catalog
SET is_active = 0,
    degraded_reason = 'superseded_by_gemini-3.5-flash_for_agentic_lanes',
    updated_at = unixepoch()
WHERE model_key = 'gemini-3.1-pro-preview'
  AND is_active = 1;
