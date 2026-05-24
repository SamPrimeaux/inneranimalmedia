-- 388: web_search route — browser intent label + navigate tools when URL classified as web_search
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/388_web_search_browser_intent_labels.sql

UPDATE agentsam_prompt_routes
SET
  intent_labels = CASE
    WHEN COALESCE(trim(intent_labels), '') IN ('', '[]')
      THEN '["web_search","browser"]'
    WHEN intent_labels NOT LIKE '%"browser"%'
      THEN replace(intent_labels, ']', ',"browser"]')
    ELSE intent_labels
  END,
  tool_keys = CASE
    WHEN COALESCE(trim(tool_keys), '') IN ('', '[]')
      THEN '["browser_navigate","browser_content","cdt_take_snapshot"]'
    WHEN tool_keys NOT LIKE '%browser_navigate%'
      THEN replace(tool_keys, ']', ',"browser_navigate"]')
    ELSE tool_keys
  END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE route_key = 'web_search'
  AND is_active = 1;
