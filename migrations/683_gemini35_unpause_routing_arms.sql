-- 683: Unpause Gemini arms paused for stale SSE URL bug; fix chat supports_tools.
-- The production bug was malformed `alt=sse?key=...` (fixed in buildGeminiUrl). `alt=sse` itself is valid SSE.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/683_gemini35_unpause_routing_arms.sql

UPDATE agentsam_routing_arms
SET is_paused = 0,
    is_eligible = 1,
    pause_reason = NULL,
    updated_at = unixepoch()
WHERE pause_reason = 'gemini_sse_url_bug_invalid_alt_param';

UPDATE agentsam_routing_arms
SET supports_tools = 1,
    updated_at = unixepoch()
WHERE model_key = 'gemini-3.5-flash'
  AND task_type IN ('chat', 'agent')
  AND COALESCE(supports_tools, 0) = 0;
