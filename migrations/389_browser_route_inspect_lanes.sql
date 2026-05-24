-- 389: browser prompt route — inspect lane so browser_navigate appears in tool manifest
--
-- Root cause: allowed_lanes_json [] → effectiveLanes ['general'] only; browser_navigate is inspect lane.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/389_browser_route_inspect_lanes.sql

UPDATE agentsam_route_requirements
SET
  allowed_lanes_json = '["inspect","develop","research"]',
  optional_capability_keys_json = '["browser.navigate","browser.inspect","browser_navigate","browser_content","cdt_take_snapshot","context.search"]'
WHERE route_key = 'browser'
  AND is_active = 1;
