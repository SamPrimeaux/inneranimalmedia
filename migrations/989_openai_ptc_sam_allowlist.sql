-- 989: Allowlist Sam for openai_ptc soak (runtime shipped with tkt_oai_ptc)
UPDATE agentsam_feature_flag
SET enabled_for_users = '["au_871d920d1233cbd1"]',
    description = 'Programmatic Tool Calling — Sam soak; store:false exact-order replay + caller verbatim',
    config_json = '{"depends_on":["openai_responses_ws","tkt_oai_ws_do_holder","tkt_oai_ptc_schemas"],"execution_locus":"openai_hosted_v8","store":false,"defer_loading_law":"no_defer_for_programmatic"}'
WHERE flag_key = 'openai_ptc';
