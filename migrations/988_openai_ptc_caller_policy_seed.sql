-- 988: Seed agentsam_tools.caller_policy for OpenAI PTC (tkt_oai_ptc_schemas)
-- Fail-closed: NULL remains ["direct"] only at runtime.
-- Programmatic opt-in is explicit read/search tools only.
-- Writes / approvals / terminal / deploy stay direct-only.

-- Core read / search tools eligible for programmatic callers (and still direct).
UPDATE agentsam_tools
SET caller_policy = '["direct","programmatic"]',
    updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_d1_query',
  'agentsam_memory_search',
  'agentsam_codebase_retrieve',
  'fs_read_file',
  'fs_search_files',
  'search_web',
  'agentsam_github_grep',
  'agentsam_github_read',
  'agentsam_github_search',
  'agentsam_github_list_commits',
  'agentsam_github_tree',
  'agentsam_grep',
  'agentsam_workspace_search',
  'agentsam_supabase_query',
  'agentsam_r2_get',
  'agentsam_r2_list',
  'agentsam_cf_d1_list',
  'agentsam_cf_kv_list',
  'agentsam_cf_r2_buckets',
  'agentsam_autorag',
  'agentsam_ticket_get',
  'agentsam_ticket_list'
);

-- Explicit direct-only for mutating / approval / terminal lanes (document in D1).
UPDATE agentsam_tools
SET caller_policy = '["direct"]',
    updated_at = unixepoch()
WHERE COALESCE(caller_policy, '') = ''
  AND (
    COALESCE(requires_approval, 0) = 1
    OR lower(COALESCE(capability_key, '')) LIKE '%.write%'
    OR lower(COALESCE(capability_key, '')) LIKE '%.delete%'
    OR lower(COALESCE(capability_key, '')) LIKE '%.deploy%'
    OR lower(COALESCE(capability_key, '')) LIKE '%execute%'
    OR lower(COALESCE(capability_key, '')) LIKE '%.publish%'
    OR lower(tool_key) LIKE '%terminal%'
    OR lower(tool_key) LIKE '%_write%'
    OR lower(tool_key) LIKE '%_delete%'
    OR lower(tool_key) LIKE '%commit%'
    OR lower(tool_key) LIKE '%deploy%'
  );

-- Flag note: openai_ptc stays off until tkt_oai_ptc runtime dual-pass.
UPDATE agentsam_feature_flag
SET description = 'Programmatic Tool Calling — gated; schemas (caller_policy→allowed_callers) shipped; enable only after tkt_oai_ptc dual-pass',
    config_json = '{"depends_on":["openai_responses_ws","tkt_oai_ws_do_holder","tkt_oai_ptc_schemas"],"execution_locus":"openai_hosted_v8","defer_loading_law":"no_defer_for_programmatic"}'
WHERE flag_key = 'openai_ptc';
