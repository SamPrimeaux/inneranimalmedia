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
  ('d1.batch.write', 'tool_key', 'd1_write', 'develop', 10, 1, 1, 'Normalized alias for d1.batch_write route requirement.'),
  ('d1.batch.write', 'tool_key', 'd1_migrations_draft', 'develop', 20, 1, 1, 'Normalized alias for D1 batch/migration write planning.'),

  ('d1.query', 'tool_key', 'd1_query', 'develop', 10, 0, 0, 'Normalized alias for d1_query route requirement.'),
  ('d1.query', 'tool_key', 'd1_schema_introspect', 'develop', 20, 0, 0, 'D1 query workflows often need schema introspection.'),
  ('d1.query', 'tool_key', 'd1_explain', 'develop', 30, 0, 0, 'D1 query workflows can use explain.'),

  ('excalidraw.open', 'tool_key', 'excalidraw_open', 'inspect', 10, 0, 0, 'Normalized alias for excalidraw_open planning/design tool.'),
  ('knowledge.search', 'tool_key', 'knowledge_search', 'research', 10, 0, 0, 'Normalized alias for knowledge_search.'),
  ('workspace.read', 'tool_key', 'fs_read_file', 'develop', 10, 0, 0, 'Workspace read maps to safe file read.'),
  ('workspace.read', 'tool_key', 'workspace_search', 'develop', 20, 0, 0, 'Workspace read can use workspace search.'),
  ('workspace.read', 'tool_key', 'r2_read', 'develop', 30, 0, 0, 'Workspace read can use R2 read when artifacts live in R2.')
ON CONFLICT (abstract_capability, match_kind, match_value)
DO UPDATE SET
  capability_lane = excluded.capability_lane,
  priority = excluded.priority,
  requires_approval = excluded.requires_approval,
  is_mutation = excluded.is_mutation,
  rationale = excluded.rationale,
  is_active = 1,
  updated_at = datetime('now');

DROP VIEW IF EXISTS v_agentsam_route_capability_tool_matches_deduped;

CREATE VIEW v_agentsam_route_capability_tool_matches_deduped AS
WITH ranked AS (
  SELECT
    m.*,
    ROW_NUMBER() OVER (
      PARTITION BY
        route_key,
        mode,
        cap_source,
        original_capability,
        tool_key
      ORDER BY
        alias_priority ASC,
        sort_priority ASC,
        tool_id ASC
    ) AS rn
  FROM v_agentsam_route_capability_tool_matches m
)
SELECT
  route_key,
  mode,
  cap_source,
  original_capability,
  normalized_capability,
  abstract_capability,
  match_kind,
  match_value,
  alias_priority,
  alias_requires_approval,
  alias_is_mutation,
  tool_id,
  tool_name,
  tool_key,
  tool_category,
  handler_brand,
  capability_lane,
  capability_key,
  risk_level,
  tool_requires_approval,
  sort_priority,
  rationale
FROM ranked
WHERE rn = 1;
