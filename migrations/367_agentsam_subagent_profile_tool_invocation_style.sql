-- GET /api/agent/subagent-profiles selects tool_invocation_style (parity with agentsam_ai).
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/367_agentsam_subagent_profile_tool_invocation_style.sql

ALTER TABLE agentsam_subagent_profile ADD COLUMN tool_invocation_style TEXT
  DEFAULT 'balanced'
  CHECK(tool_invocation_style IN ('aggressive', 'balanced', 'conservative'));
