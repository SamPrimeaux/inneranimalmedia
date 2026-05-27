-- 425: agentsam_memory_save — D1 agentsam_memory KV (not IAM proxy / not Vectorize write).
-- Deactivates alias → agentsam_memory_write (Vectorize) so ChatGPT save hits local D1 path.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/425_fix_agentsam_memory_save_d1.sql

UPDATE agentsam_capability_aliases
SET is_active = 0,
    rationale = COALESCE(rationale, '') || ' | 425: memory_save is D1 kv (not vectorize write)',
    updated_at = unixepoch()
WHERE abstract_capability = 'agentsam_memory_save'
  AND match_kind = 'tool_key';

UPDATE agentsam_tools
SET handler_type = 'mcp',
    description = 'Save a durable key/value memory row in D1 agentsam_memory for this OAuth user/workspace.',
    input_schema = '{"type":"object","properties":{"key":{"type":"string","description":"Stable key e.g. milestone_chatgpt_mcp_20260527"},"value":{"type":"string","description":"Memory body"},"content":{"type":"string","description":"Alias for value"},"memory_type":{"type":"string","enum":["fact","preference","project","skill","error","decision"],"default":"project"},"tags":{"type":"array","items":{"type":"string"}},"source":{"type":"string","default":"mcp_oauth"},"confidence":{"type":"number","default":1.0},"session_id":{"type":"string"}}}',
    handler_config = '{"operation":"memory_d1_write","auth_source":"platform","binding":"local"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_save';

-- Optional: D1 substring search fallback (Vectorize row still exists for internal use).
UPDATE agentsam_tools
SET handler_config = json_patch(
  COALESCE(handler_config, '{}'),
  '{"operation":"memory_d1_search","binding":"local"}'
),
updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_search'
  AND handler_type = 'mcp'
  AND COALESCE(json_extract(handler_config, '$.proxy_tool'), '') = '';
