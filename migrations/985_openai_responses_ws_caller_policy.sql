-- 985: OpenAI Responses WebSocket flag + agentsam_tools.caller_policy (fail-closed for PTC)
-- caller_policy TEXT: JSON array e.g. '["direct"]' | '["programmatic"]' | '["direct","programmatic"]'
-- NULL / missing ⇒ treat as ["direct"] only (never open-default to programmatic).

ALTER TABLE agentsam_tools ADD COLUMN caller_policy TEXT;

INSERT OR IGNORE INTO agentsam_feature_flag (
  flag_key,
  description,
  enabled_globally,
  enabled_for_users,
  rollout_pct,
  environment,
  flag_type,
  created_by,
  is_archived,
  config_json
) VALUES (
  'openai_responses_ws',
  'OpenAI Responses API WebSocket transport via OPENAI_RESPONSES_WS DO (HTTP fallback on failure)',
  0,
  '["au_871d920d1233cbd1"]',
  0,
  'all',
  'boolean',
  'sam_primeaux',
  0,
  '{"transport":"websocket","fallback":"http","do_binding":"OPENAI_RESPONSES_WS"}'
);

INSERT OR IGNORE INTO agentsam_feature_flag (
  flag_key,
  description,
  enabled_globally,
  enabled_for_users,
  rollout_pct,
  environment,
  flag_type,
  created_by,
  is_archived,
  config_json
) VALUES (
  'openai_ptc',
  'Programmatic Tool Calling — gated; do not enable until tkt_oai_ws_do_holder dual-pass clears',
  0,
  '[]',
  0,
  'all',
  'boolean',
  'sam_primeaux',
  0,
  '{"depends_on":["openai_responses_ws","tkt_oai_ws_do_holder"],"execution_locus":"openai_hosted_v8"}'
);
