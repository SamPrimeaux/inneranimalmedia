-- Idempotent: natural-language keyword triggers + system rules for buildSystemPrompt injection.
-- Canonical: agentsam_rules_document (D1). Worker: appendTriggeredRulesToSystemPrompt in src/api/agent.js.

UPDATE agentsam_rules_document
SET trigger_type = 'system', trigger_condition_json = '{}', updated_at_epoch = unixepoch()
WHERE id IN ('iam_webhook_infrastructure', 'rule_agentsam_table_namespace');

UPDATE agentsam_rules_document
SET
  trigger_type = 'keyword',
  trigger_condition_json = '{"keywords":["component","tsx","import","hook","barrel","index.ts","re-export","new file","create component"],"match":"any","min_matches":1}',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_cursor_new_component_checklist';

UPDATE agentsam_rules_document
SET
  trigger_type = 'keyword',
  trigger_condition_json = '{"keywords":["terminal","PTY","iam-tunnel","deploy","wrangler","infrastructure","tunnel","GCP","PM2","ecosystem.config"],"match":"any","min_matches":1}',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_infrastructure_terminal_arch';

UPDATE agentsam_rules_document
SET
  trigger_type = 'keyword',
  trigger_condition_json = '{"keywords":["import","barrel","cn(","formatDate","helpers","utils","from @/","index"],"match":"any","min_matches":1}',
  updated_at_epoch = unixepoch()
WHERE id IN ('rule_no_barrel_imports_for_utils', 'rule_no_barrel_utility_imports');

UPDATE agentsam_rules_document
SET
  trigger_type = 'keyword',
  trigger_condition_json = '{"keywords":["useState","useMemo","useCallback","useEffect","hook","component","const [","React"],"match":"any","min_matches":1}',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_usestate_before_usememo';

UPDATE agentsam_rules_document
SET
  trigger_type = 'keyword',
  trigger_condition_json = '{"keywords":["database","D1","Supabase","query","SQL","schema","table","SELECT","INSERT","UPDATE","pgvector"],"match":"any","min_matches":1}',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_database_tool_surfaces_d1_supabase';
