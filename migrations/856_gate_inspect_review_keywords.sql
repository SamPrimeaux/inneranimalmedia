-- 856: Stabilize G-inspect gate — review intent keywords (no LLM escalation on inspect-repo phrasing).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/856_gate_inspect_review_keywords.sql

INSERT OR IGNORE INTO agentsam_classification_keywords (id, purpose, pattern, label, active, notes, created_at, updated_at)
VALUES
  ('ck_cr_inspect_repo', 'chat_intent_review', 'inspect the repo', 'agent', 1, 'G-inspect gate coverage', unixepoch(), unixepoch()),
  ('ck_cr_tool_structure', 'chat_intent_review', 'tool structure', 'agent', 1, 'G-inspect gate coverage', unixepoch(), unixepoch()),
  ('ck_cr_propose_improve', 'chat_intent_review', 'propose how we can improve', 'agent', 1, 'G-inspect gate coverage', unixepoch(), unixepoch()),
  ('ck_cr_agent_to_tool', 'chat_intent_review', 'agent to tool', 'agent', 1, 'G-inspect gate coverage', unixepoch(), unixepoch());
