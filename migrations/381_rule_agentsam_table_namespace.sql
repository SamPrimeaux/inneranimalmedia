-- Idempotent: enforce full agentsam_* D1 table names in docs, SQL, and agent output.
-- Canonical row: agentsam_rules_document.id = rule_agentsam_table_namespace

INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  user_id,
  workspace_id,
  title,
  body_markdown,
  version,
  is_active,
  created_at_epoch,
  updated_at_epoch,
  person_uuid,
  apply_mode,
  globs,
  os_platform,
  trigger_type,
  trigger_condition_json,
  sort_order,
  input_prompt_json,
  execution_template,
  rule_type,
  notes,
  source_stored,
  source_url
) VALUES (
  'rule_agentsam_table_namespace',
  '',
  'ws_inneranimalmedia',
  'Always use full agentsam_* D1 table names',
  '## RULE: Always use full agentsam_* D1 table names
**ID:** rule_agentsam_table_namespace | **Priority:** ALWAYS

The `agentsam_` prefix is the intentional namespace for Agent Sam control-plane tables.
Never drop or abbreviate it in docs, SQL, migrations, specs, comments, or agent responses.
Abbreviated names refer to tables that **do not exist** and **will not exist**.

### ❌ NEVER (non-existent tables)
| Wrong | Correct |
|-------|---------|
| `prompt_routes` | `agentsam_prompt_routes` |
| `routing_arms` | `agentsam_routing_arms` |
| `workflow_handlers` | `agentsam_workflow_handlers` |
| `route_requirements` | `agentsam_route_requirements` |
| `approval_queue` | `agentsam_approval_queue` |
| `workflow_runs` | `agentsam_workflow_runs` |

### ✅ ALWAYS (examples)
- `agentsam_prompt_routes`
- `agentsam_routing_arms`
- `agentsam_workflow_handlers`
- `agentsam_route_requirements`
- `agentsam_approval_queue`
- `agentsam_workflows`
- `agentsam_workflow_runs`
- `agentsam_mcp_tools`
- `agentsam_tools`
- `agentsam_rules_document`

### Prose vs SQL
Shorthand like "the prompt routes table" is OK in prose if the full `agentsam_*` name appears
on first mention or in the same paragraph. Every SQL statement, migration, and wrangler command
must use the exact table name.

Code variable names (e.g. `promptRouteRow`) are OK when bound SQL references the real table.

Synced from repo: `.cursorrules` (rule_agentsam_table_namespace).',
  1,
  1,
  unixepoch(),
  unixepoch(),
  '',
  'always',
  '',
  'any',
  'manual',
  '{}',
  12,
  '{}',
  '',
  'instruction',
  'Prevents agents and docs from inventing unprefixed table names (prompt_routes, routing_arms, etc.) that are not part of the Agent Sam schema.',
  'd1:agentsam_rules_document:rule_agentsam_table_namespace',
  ''
);

UPDATE agentsam_rules_document
SET
  title = 'Always use full agentsam_* D1 table names',
  body_markdown = '## RULE: Always use full agentsam_* D1 table names
**ID:** rule_agentsam_table_namespace | **Priority:** ALWAYS

The `agentsam_` prefix is the intentional namespace for Agent Sam control-plane tables.
Never drop or abbreviate it in docs, SQL, migrations, specs, comments, or agent responses.
Abbreviated names refer to tables that **do not exist** and **will not exist**.

### ❌ NEVER (non-existent tables)
| Wrong | Correct |
|-------|---------|
| `prompt_routes` | `agentsam_prompt_routes` |
| `routing_arms` | `agentsam_routing_arms` |
| `workflow_handlers` | `agentsam_workflow_handlers` |
| `route_requirements` | `agentsam_route_requirements` |
| `approval_queue` | `agentsam_approval_queue` |
| `workflow_runs` | `agentsam_workflow_runs` |

### ✅ ALWAYS (examples)
- `agentsam_prompt_routes`
- `agentsam_routing_arms`
- `agentsam_workflow_handlers`
- `agentsam_route_requirements`
- `agentsam_approval_queue`
- `agentsam_workflows`
- `agentsam_workflow_runs`
- `agentsam_mcp_tools`
- `agentsam_tools`
- `agentsam_rules_document`

### Prose vs SQL
Shorthand like "the prompt routes table" is OK in prose if the full `agentsam_*` name appears
on first mention or in the same paragraph. Every SQL statement, migration, and wrangler command
must use the exact table name.

Code variable names (e.g. `promptRouteRow`) are OK when bound SQL references the real table.

Synced from repo: `.cursorrules` (rule_agentsam_table_namespace).',
  version = version + 1,
  is_active = 1,
  apply_mode = 'always',
  rule_type = 'instruction',
  notes = 'Prevents agents and docs from inventing unprefixed table names (prompt_routes, routing_arms, etc.) that are not part of the Agent Sam schema.',
  source_stored = 'd1:agentsam_rules_document:rule_agentsam_table_namespace',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_agentsam_table_namespace';
