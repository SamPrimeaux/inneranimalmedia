-- 849: Official platform ticket — Dream Home Artifact Engine (Sam Sketch proj_mrb5shkc_3kos2c)
-- SSOT prose: plans/active/DESIGNSTUDIO-002-dream-home-artifact-engine.md
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/849_dream_home_artifact_engine_ticket.sql

INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, dedup_key, required_pass_count,
  created_at, updated_at, closed_at
) VALUES (
  'tkt_designstudio_002',
  'DESIGNSTUDIO-002 Dream Home Artifact Engine (FreeCAD master + OpenSCAD smoke)',
  'backlog',
  'Sam Sketch barndominium — replace operator script injection with real CAD executors, artifact graph, human GUI. OpenSCAD smoke then FreeCAD MVP on proj_mrb5shkc_3kos2c.',
  'proj_mrb5shkc_3kos2c',
  'designstudio',
  '["design","freecad","openscad","blender","artifact-engine","sam-sketch","dream-home","house-plan"]',
  'P1',
  'plans/active/DESIGNSTUDIO-002-dream-home-artifact-engine.md',
  '[]',
  '["tkt_designstudio_001","tkt_routing_tool_ssot"]',
  NULL,
  'designstudio-002-dream-home-artifact-engine',
  2,
  unixepoch(),
  unixepoch(),
  NULL
);

-- Link Sam Sketch project metadata to active engineering ticket
UPDATE projects
SET metadata_json = json_set(
      COALESCE(NULLIF(metadata_json, ''), '{}'),
      '$.designstudio.active_ticket_id', 'tkt_designstudio_002',
      '$.designstudio.active_plan', 'DESIGNSTUDIO-002-dream-home-artifact-engine.md',
      '$.designstudio.tool_hierarchy', json('{"master":"freecad","components":"openscad","visualization":"blender","concept_mesh":"meshy","sketch":"visual_canvas"}'),
      '$.designstudio.integration_order', json('["openscad_smoke","freecad_mvp","blender_derivative"]')
    ),
    updated_at = datetime('now')
WHERE id = 'proj_mrb5shkc_3kos2c';
