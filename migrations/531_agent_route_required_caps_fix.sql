-- 531: agent/multitask route requirements — required caps were blocking tool selection noise.
-- agent route had required ["d1.read","file.read","terminal","github.read"] but file.read tools are inactive;
-- required caps should be optional hints, not hard gates (matches DEFAULT_ROUTE_TOOL.agent in code).

UPDATE agentsam_route_requirements
SET
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '[
    "workspace_read_file","workspace_search","code.search","file.read","grep",
    "github.read","github.write","github_file","github_repos",
    "d1.read","d1_query","d1.schema","terminal","terminal.execute",
    "context.search","memory.search","knowledge_search"
  ]'
WHERE route_key = 'agent'
  AND is_active = 1;

UPDATE agentsam_route_requirements
SET
  required_capability_keys_json = '[]'
WHERE route_key = 'multitask'
  AND is_active = 1
  AND required_capability_keys_json LIKE '%file.read%';

UPDATE agentsam_route_requirements
SET
  required_capability_keys_json = '[]'
WHERE route_key = 'browser'
  AND is_active = 1
  AND required_capability_keys_json LIKE '%browser.navigate%';
