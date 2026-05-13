CREATE TABLE IF NOT EXISTS agentsam_capability_aliases (
  id TEXT PRIMARY KEY DEFAULT ('capalias_' || lower(hex(randomblob(8)))),
  abstract_capability TEXT NOT NULL,
  match_kind TEXT NOT NULL DEFAULT 'tool_key',
  match_value TEXT NOT NULL,
  capability_lane TEXT,
  priority INTEGER NOT NULL DEFAULT 50,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  is_mutation INTEGER NOT NULL DEFAULT 0,
  rationale TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_agentsam_capability_aliases_key
ON agentsam_capability_aliases (
  abstract_capability,
  match_kind,
  match_value
);

INSERT INTO agentsam_capability_aliases (
  abstract_capability,
  match_kind,
  match_value,
  capability_lane,
  priority,
  requires_approval,
  is_mutation,
  rationale
)
VALUES
  -- Code / file search
  ('code.search', 'tool_key', 'workspace_search', 'develop', 10, 0, 0, 'Search workspace/files before shell grep.'),
  ('code.search', 'tool_key', 'github_file', 'develop', 20, 0, 0, 'Read/search code via GitHub file tool.'),
  ('code.search', 'tool_key', 'fs_read_file', 'develop', 30, 0, 0, 'Read files as safer alternative to terminal grep.'),
  ('code.search', 'tool_key', 'r2_search', 'develop', 40, 0, 0, 'Search R2-backed workspace artifacts.'),

  ('file.read', 'tool_key', 'fs_read_file', 'develop', 10, 0, 0, 'Read filesystem file safely.'),
  ('file.read', 'tool_key', 'r2_read', 'develop', 20, 0, 0, 'Read R2 object safely.'),
  ('file.read', 'tool_key', 'github_file', 'develop', 30, 0, 0, 'Read GitHub file safely.'),

  ('file.write', 'tool_key', 'fs_write_file', 'develop', 10, 1, 1, 'Write filesystem file with approval.'),
  ('file.write', 'tool_key', 'fs_edit_file', 'develop', 20, 1, 1, 'Edit filesystem file with approval.'),
  ('file.write', 'tool_key', 'r2_write', 'develop', 30, 1, 1, 'Write R2 object with approval.'),
  ('file.write', 'tool_key', 'github_update_file', 'develop', 40, 1, 1, 'Update GitHub file with approval.'),
  ('file.write', 'tool_key', 'github_create_file', 'develop', 50, 1, 1, 'Create GitHub file with approval.'),

  -- D1 / database
  ('d1.read', 'tool_key', 'd1_query', 'develop', 10, 0, 0, 'Read/query D1.'),
  ('d1.read', 'tool_key', 'd1_schema_introspect', 'develop', 20, 0, 0, 'Inspect D1 schema.'),
  ('d1.read', 'tool_key', 'd1_explain', 'develop', 30, 0, 0, 'Explain D1 query.'),
  ('database.query', 'tool_key', 'd1_query', 'develop', 10, 0, 0, 'Database query maps to D1 query.'),
  ('database.query', 'tool_key', 'd1_schema_introspect', 'develop', 20, 0, 0, 'Database query can inspect schema.'),
  ('schema.inspect', 'tool_key', 'd1_schema_introspect', 'develop', 10, 0, 0, 'Schema inspection maps to D1 schema introspection.'),
  ('schema.inspect', 'tool_key', 'd1_explain', 'develop', 20, 0, 0, 'Schema/query inspection can use D1 explain.'),

  ('d1.write', 'tool_key', 'd1_write', 'develop', 10, 1, 1, 'D1 write requires approval.'),
  ('d1.write', 'tool_key', 'd1_migrations_draft', 'develop', 20, 1, 1, 'D1 migration drafting is mutation-adjacent.'),
  ('d1.batch_write', 'tool_key', 'd1_write', 'develop', 10, 1, 1, 'Batch write maps to approved D1 write.'),
  ('database.write', 'tool_key', 'd1_write', 'develop', 10, 1, 1, 'Database write maps to approved D1 write.'),

  -- Terminal
  ('terminal.execute', 'tool_key', 'terminal_execute', 'develop', 10, 1, 1, 'Terminal execution is powerful and approval-gated.'),

  -- Workers / deploy
  ('worker.preview', 'tool_key', 'get_deploy_command', 'develop', 10, 0, 0, 'Preview/prepare deploy command before mutation.'),
  ('worker.preview', 'tool_key', 'deploy_status', 'develop', 20, 0, 0, 'Read deploy status safely.'),
  ('worker.preview', 'tool_key', 'get_worker_services', 'develop', 30, 0, 0, 'Inspect Worker services safely.'),
  ('worker.preview', 'tool_key', 'list_workers', 'develop', 40, 0, 0, 'List Workers safely.'),

  ('worker.deploy', 'tool_key', 'worker_deploy', 'develop', 10, 1, 1, 'Worker deploy requires approval.'),
  ('worker.deploy', 'tool_key', 'workflow_run_pipeline', 'develop', 20, 1, 1, 'Pipeline run may deploy and requires approval when mutating.'),

  -- Logs / observe
  ('logs.read', 'tool_key', 'deploy_status', 'observe', 10, 0, 0, 'Deploy status is safe operational visibility.'),
  ('logs.read', 'tool_key', 'workflow_run_pipeline', 'observe', 20, 0, 0, 'Workflow pipeline can surface operational state.'),

  -- MCP catalog / tool inspection
  ('mcp.catalog.read', 'tool_key', 'get_worker_services', 'operate', 10, 0, 0, 'Catalog/service discovery.'),
  ('mcp.catalog.read', 'tool_key', 'list_workers', 'operate', 20, 0, 0, 'Catalog/service discovery.'),
  ('mcp.tool.inspect', 'tool_key', 'get_worker_services', 'operate', 10, 0, 0, 'Tool/service inspection.'),
  ('mcp.tool.inspect', 'tool_key', 'list_workers', 'operate', 20, 0, 0, 'Tool/service inspection.'),

  -- Browser / inspect
  ('browser.inspect', 'capability_lane', 'inspect', 'inspect', 10, 0, 0, 'Browser/devtools/a11y/inspect tools are grouped by inspect lane.'),

  -- Context / memory
  ('context.search', 'tool_key', 'knowledge_search', 'research', 10, 0, 0, 'Search knowledge/context.'),
  ('context.search', 'tool_key', 'workspace_search', 'research', 20, 0, 0, 'Search workspace context.'),
  ('context.search', 'tool_key', 'human_context_list', 'research', 30, 0, 0, 'List human/project context.'),
  ('memory.read', 'tool_key', 'knowledge_search', 'research', 10, 0, 0, 'Memory read maps to knowledge search.'),
  ('memory.read', 'tool_key', 'human_context_list', 'research', 20, 0, 0, 'Memory/context listing.'),

  -- GitHub
  ('github.read', 'tool_key', 'github_repos', 'develop', 10, 0, 0, 'Read GitHub repos.'),
  ('github.read', 'tool_key', 'github_file', 'develop', 20, 0, 0, 'Read GitHub files.'),
  ('github.write', 'tool_key', 'github_create_branch', 'develop', 10, 1, 1, 'Create branch with approval.'),
  ('github.write', 'tool_key', 'github_create_file', 'develop', 20, 1, 1, 'Create file with approval.'),
  ('github.write', 'tool_key', 'github_update_file', 'develop', 30, 1, 1, 'Update file with approval.'),
  ('github.write', 'tool_key', 'github_create_pr', 'develop', 40, 1, 1, 'Create PR with approval.'),
  ('github.write', 'tool_key', 'github_merge_pr', 'develop', 50, 1, 1, 'Merge PR with approval.'),

  -- R2 / storage
  ('r2.read', 'tool_key', 'r2_list', 'develop', 10, 0, 0, 'List R2 objects.'),
  ('r2.read', 'tool_key', 'r2_read', 'develop', 20, 0, 0, 'Read R2 object.'),
  ('r2.read', 'tool_key', 'r2_search', 'develop', 30, 0, 0, 'Search R2 objects.'),
  ('r2.write', 'tool_key', 'r2_write', 'develop', 10, 1, 1, 'Write R2 object with approval.'),

  -- Workflow / agent orchestration
  ('workflow.run', 'tool_key', 'workflow_run_pipeline', 'operate', 10, 1, 1, 'Run workflow pipeline.'),
  ('workflow.run', 'tool_key', 'generate_execution_plan', 'operate', 20, 0, 0, 'Generate execution plan.'),
  ('agent.run', 'tool_key', 'generate_execution_plan', 'operate', 10, 0, 0, 'Agent run planning maps to execution planning.'),

  -- CMS live editor capabilities
  ('cms.template.read', 'tool_key', 'r2_read', 'develop', 10, 0, 0, 'CMS template read can read R2 artifact.'),
  ('cms.template.read', 'tool_key', 'r2_search', 'develop', 20, 0, 0, 'CMS template search can search R2 artifacts.'),
  ('cms.schema.read', 'tool_key', 'd1_schema_introspect', 'develop', 10, 0, 0, 'CMS schema read maps to D1 schema introspection.'),
  ('cms.schema.read', 'tool_key', 'd1_query', 'develop', 20, 0, 0, 'CMS schema read may query D1 metadata.'),
  ('cms.manifest.write', 'tool_key', 'r2_write', 'develop', 10, 1, 1, 'CMS manifest write maps to R2 write.'),
  ('cms.artifact.write', 'tool_key', 'r2_write', 'develop', 10, 1, 1, 'CMS artifact write maps to R2 write.'),
  ('approval.request', 'tool_key', 'generate_execution_plan', 'operate', 10, 0, 0, 'Approval request is represented as planning/approval workflow context.')
ON CONFLICT (abstract_capability, match_kind, match_value)
DO UPDATE SET
  capability_lane = excluded.capability_lane,
  priority = excluded.priority,
  requires_approval = excluded.requires_approval,
  is_mutation = excluded.is_mutation,
  rationale = excluded.rationale,
  is_active = 1,
  updated_at = datetime('now');

DROP VIEW IF EXISTS v_agentsam_route_capability_tool_matches;

CREATE VIEW v_agentsam_route_capability_tool_matches AS
WITH route_caps AS (
  SELECT
    rr.route_key,
    rr.mode,
    'required' AS cap_source,
    lower(replace(json_each.value, '_', '.')) AS normalized_capability,
    json_each.value AS original_capability
  FROM agentsam_route_requirements rr, json_each(rr.required_capability_keys_json)

  UNION ALL

  SELECT
    rr.route_key,
    rr.mode,
    'optional' AS cap_source,
    lower(replace(json_each.value, '_', '.')) AS normalized_capability,
    json_each.value AS original_capability
  FROM agentsam_route_requirements rr, json_each(rr.optional_capability_keys_json)

  UNION ALL

  SELECT
    rr.route_key,
    rr.mode,
    'blocked' AS cap_source,
    lower(replace(json_each.value, '_', '.')) AS normalized_capability,
    json_each.value AS original_capability
  FROM agentsam_route_requirements rr, json_each(rr.blocked_capability_keys_json)
),
alias_matches AS (
  SELECT
    rc.route_key,
    rc.mode,
    rc.cap_source,
    rc.original_capability,
    rc.normalized_capability,
    a.abstract_capability,
    a.match_kind,
    a.match_value,
    a.priority AS alias_priority,
    a.requires_approval AS alias_requires_approval,
    a.is_mutation AS alias_is_mutation,
    a.rationale
  FROM route_caps rc
  JOIN agentsam_capability_aliases a
    ON a.is_active = 1
   AND lower(a.abstract_capability) = rc.normalized_capability
)
SELECT DISTINCT
  am.route_key,
  am.mode,
  am.cap_source,
  am.original_capability,
  am.normalized_capability,
  am.abstract_capability,
  am.match_kind,
  am.match_value,
  am.alias_priority,
  am.alias_requires_approval,
  am.alias_is_mutation,
  v.id AS tool_id,
  v.tool_name,
  v.tool_key,
  v.tool_category,
  v.handler_brand,
  v.capability_lane,
  v.capability_key,
  v.risk_level,
  v.requires_approval AS tool_requires_approval,
  v.sort_priority,
  am.rationale
FROM alias_matches am
JOIN v_agentsam_mcp_tools_branded v
  ON (
    (am.match_kind = 'tool_key' AND lower(v.tool_key) = lower(am.match_value))
    OR (am.match_kind = 'capability_key' AND lower(v.capability_key) = lower(am.match_value))
    OR (am.match_kind = 'tool_name' AND lower(v.tool_name) = lower(am.match_value))
    OR (am.match_kind = 'capability_lane' AND lower(v.capability_lane) = lower(am.match_value))
    OR (am.match_kind = 'tool_category' AND lower(v.tool_category) = lower(am.match_value))
    OR (am.match_kind = 'handler_brand' AND lower(v.handler_brand) = lower(am.match_value))
  )
WHERE COALESCE(v.enabled, 0) = 1;
