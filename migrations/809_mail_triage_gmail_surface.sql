-- 809: Mail triage — surface gmail_list_inbox under OAuth parity + catch sender-count intents.
--
-- Live diagnosis (2026-07-10):
--   gmail_list_inbox is_active=1 but oauth_visible=0 → excluded from in-app OAuth-parity
--   tool manifest (default Agent Sam path). Model fell back to agentsam_d1_query (oauth_visible=1).
--   agentsam_subagent_profile slug=mail_triage was missing (786 seed gone; 806/807 UPDATEs no-op).
--
-- Apply:
--   node scripts/d1-apply-pending.mjs --apply --from 809 --to 809
--   OR: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--         --remote -c wrangler.production.toml --file=./migrations/809_mail_triage_gmail_surface.sql

-- 1) Make Gmail read tools visible on the OAuth-parity / in-app manifest + Auto mode.
UPDATE agentsam_tools
SET
  oauth_visible = 1,
  modes_json = '["auto","ask","plan","debug","agent","multitask"]',
  is_active = 1,
  updated_at = unixepoch()
WHERE tool_key IN ('gmail_list_inbox', 'gmail_get_message');

UPDATE agentsam_tools
SET
  modes_json = '["auto","ask","plan","debug","agent","multitask"]',
  updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_gmail_mcp_search_threads',
  'agentsam_gmail_mcp_get_thread'
);

-- 2) OAuth allowlist so call-time parity gate accepts gmail_* (same client as MCP).
INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist
  (client_id, tool_key, access_class, sort_order, is_active)
VALUES
  ('iam_mcp_inneranimalmedia', 'gmail_list_inbox', 'read', 198, 1),
  ('iam_mcp_inneranimalmedia', 'gmail_get_message', 'read', 199, 1);

-- 3) Re-seed mail_triage profile (missing in prod) + compose/sweep companions.
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
  'Classify urgency, summarize threads, and answer inbox count/search questions via Gmail tools.',
  'You are Agent Sam mail triage. Live ## Mail context may list inbox metadata only.
ALWAYS call gmail_list_inbox (or agentsam_gmail_mcp_search_threads) before saying you cannot read the inbox.
If asked about count or search by sender (e.g. how many from X, notifications@…): call gmail_list_inbox with no filters first (or a sender query if the tool supports it), then count/filter from results.
NEVER use agentsam_d1_query, d1_query, or schema discovery for inbox / Gmail questions — D1 is not the user mailbox.
Before classifying Stripe/Google/security items: gmail_list_inbox then gmail_get_message on each candidate id. Never guess from subject alone. No emojis.',
  '["gmail_*","agentsam_gmail_mcp_*"]',
  'gemini-3.1-flash-lite',
  1, 1, 20, 'scout',
  datetime('now'), datetime('now')
),
(
  'asp_mail_compose',
  'platform', '', '',
  'mail_compose',
  'Mail Compose',
  'Draft replies and new mail.',
  'You are Agent Sam mail composer. Return JSON: subject, body_text, body_html (optional). Match sender tone. Professional, concise. No emojis unless user asks.',
  '["gmail_*","agentsam_gmail_mcp_*"]',
  'gemini-3.5-flash',
  1, 1, 21, 'builder',
  datetime('now'), datetime('now')
),
(
  'asp_mail_sweep',
  'platform', '', '',
  'mail_sweep',
  'Mail Sweep',
  'Bulk classify inbox for cleanup.',
  'You are Agent Sam inbox sweeper. Input: email list. Output JSON: {items:[{id,urgency,category,archive_candidate,delete_candidate,reason}]}. Prefer archive over delete. No emojis.',
  '["gmail_*","agentsam_gmail_mcp_*"]',
  'gemini-3.1-flash-lite',
  1, 1, 22, 'scout',
  datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  default_model_id = excluded.default_model_id,
  is_active = 1,
  is_platform_global = 1,
  updated_at = datetime('now');

-- 4) Expand mail_triage route keywords for sender-count / search intents.
UPDATE agentsam_prompt_routes
SET
  trigger_keywords = '["mail","inbox","gmail","triage","summarize","notifications","deploy","how many","sender","from","unread","email","emails","message","messages"]',
  intent_labels = '["mail","inbox","gmail","triage","summarize","reply","count","search","sender"]',
  tool_keys = '["gmail_list_inbox","gmail_get_message","gmail_modify_message","gmail_send","agentsam_gmail_mcp_search_threads","agentsam_gmail_mcp_get_thread"]',
  max_tools = 8,
  is_active = 1,
  updated_at = unixepoch()
WHERE route_key = 'mail_triage' AND tenant_id IS NULL;
