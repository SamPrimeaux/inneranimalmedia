-- Idempotent: two database tool surfaces (D1 lane vs Supabase lane).
-- Canonical row: agentsam_rules_document.id = rule_database_tool_surfaces_d1_supabase

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
  'rule_database_tool_surfaces_d1_supabase',
  '',
  'ws_inneranimalmedia',
  'Two database tool surfaces — D1 lane vs Supabase lane',
  '## RULE: Two database tool surfaces — D1 lane vs Supabase lane
**ID:** rule_database_tool_surfaces_d1_supabase | **Priority:** ALWAYS

Agent Sam has **two distinct database tool surfaces**, not three. Supabase Postgres (via Hyperdrive)
is the **supabase_* surface**. Cloudflare D1 (`env.DB`) is the **d1_* surface**.

### Surface 1 — D1 (operational / agentsam_* canonical)

| Tool | Purpose |
|------|---------|
| `d1_query` | SELECT against D1, including **agentsam_*** operational tables |
| `d1_write` | INSERT / UPDATE / DELETE / DDL against D1 (approval-gated) |
| `d1_schema` | PRAGMA, schema introspection, migration dry-run |

Workflow: `agentsam_workflow_handlers.executor_kind = ''d1_sql''` → D1 only.
Catalog: `agentsam_tools.tool_category` prefix `database.d1.*`
Routes: `agentsam_route_requirements` capabilities `d1.read`, `d1.schema`, `d1.write`

Runtime aliases (same surface until catalog rename): `d1_schema_introspect`, `d1_explain`.

### Surface 2 — Supabase Postgres (mirror / observability / pgvector)

| Tool | Purpose |
|------|---------|
| `supabase_query` | SELECT against Supabase Postgres (via Hyperdrive) |
| `supabase_write` | INSERT / UPDATE / DELETE against Supabase (approval-gated) |
| `supabase_schema` | pg_catalog introspection, table/index inspection |
| `supabase_vector` | pgvector upsert / similarity search / embedding query |

Workflow: use `hyperdrive_sql` / `supabase_sql` executor_kind — not `d1_sql`.
Catalog: `database.hyperdrive.*` (migrate display names to supabase_*).
Routes: `hyperdrive.read`, `hyperdrive.schema`, `supabase.vector` in `agentsam_route_requirements`.

Runtime aliases (same surface): `hyperdrive_query` → supabase_query lane,
`hyperdrive_schema` → supabase_schema lane, RAG/pgvector → supabase_vector lane.

### Routing law

- `agentsam_route_requirements` picks the lane before tools reach the model.
- `d1_sql` is D1-only — not generic SQL across both stores.
- Mirror tables (`public.agentsam_*`) and `agent_memory` use the supabase_* surface.

Synced from repo: `.cursorrules` (rule_database_tool_surfaces_d1_supabase).',
  1,
  1,
  unixepoch(),
  unixepoch(),
  '',
  'always',
  'src/core/**,src/tools/**,src/api/agent.js,migrations/**',
  'any',
  'manual',
  '{}',
  13,
  '{}',
  '',
  'instruction',
  'Defines canonical d1_* vs supabase_* tool surfaces; Hyperdrive is transport for Supabase lane, not a third surface.',
  'd1:agentsam_rules_document:rule_database_tool_surfaces_d1_supabase',
  ''
);

UPDATE agentsam_rules_document
SET
  title = 'Two database tool surfaces — D1 lane vs Supabase lane',
  body_markdown = '## RULE: Two database tool surfaces — D1 lane vs Supabase lane
**ID:** rule_database_tool_surfaces_d1_supabase | **Priority:** ALWAYS

Agent Sam has **two distinct database tool surfaces**, not three. Supabase Postgres (via Hyperdrive)
is the **supabase_* surface**. Cloudflare D1 (`env.DB`) is the **d1_* surface**.

### Surface 1 — D1 (operational / agentsam_* canonical)

| Tool | Purpose |
|------|---------|
| `d1_query` | SELECT against D1, including **agentsam_*** operational tables |
| `d1_write` | INSERT / UPDATE / DELETE / DDL against D1 (approval-gated) |
| `d1_schema` | PRAGMA, schema introspection, migration dry-run |

Workflow: `agentsam_workflow_handlers.executor_kind = ''d1_sql''` → D1 only.
Catalog: `agentsam_tools.tool_category` prefix `database.d1.*`
Routes: `agentsam_route_requirements` capabilities `d1.read`, `d1.schema`, `d1.write`

Runtime aliases (same surface until catalog rename): `d1_schema_introspect`, `d1_explain`.

### Surface 2 — Supabase Postgres (mirror / observability / pgvector)

| Tool | Purpose |
|------|---------|
| `supabase_query` | SELECT against Supabase Postgres (via Hyperdrive) |
| `supabase_write` | INSERT / UPDATE / DELETE against Supabase (approval-gated) |
| `supabase_schema` | pg_catalog introspection, table/index inspection |
| `supabase_vector` | pgvector upsert / similarity search / embedding query |

Workflow: use `hyperdrive_sql` / `supabase_sql` executor_kind — not `d1_sql`.
Catalog: `database.hyperdrive.*` (migrate display names to supabase_*).
Routes: `hyperdrive.read`, `hyperdrive.schema`, `supabase.vector` in `agentsam_route_requirements`.

Runtime aliases (same surface): `hyperdrive_query` → supabase_query lane,
`hyperdrive_schema` → supabase_schema lane, RAG/pgvector → supabase_vector lane.

### Routing law

- `agentsam_route_requirements` picks the lane before tools reach the model.
- `d1_sql` is D1-only — not generic SQL across both stores.
- Mirror tables (`public.agentsam_*`) and `agent_memory` use the supabase_* surface.

Synced from repo: `.cursorrules` (rule_database_tool_surfaces_d1_supabase).',
  version = version + 1,
  is_active = 1,
  apply_mode = 'always',
  globs = 'src/core/**,src/tools/**,src/api/agent.js,migrations/**',
  rule_type = 'instruction',
  notes = 'Defines canonical d1_* vs supabase_* tool surfaces; Hyperdrive is transport for Supabase lane, not a third surface.',
  source_stored = 'd1:agentsam_rules_document:rule_database_tool_surfaces_d1_supabase',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_database_tool_surfaces_d1_supabase';
