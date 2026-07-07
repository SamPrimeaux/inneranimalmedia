-- 799: AgentSam CAD Engineering course + BIM glb_up_axis metadata + Sam Sketch design lane tag.
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/799_agentsam_cad_engineering_course.sql

-- ─── BIM stock: document Y-up GLB after Blender export pipeline ───────────────
UPDATE cms_assets
SET
  metadata = '{"label":"BIM Example (FreeCAD)","icon":"building","scale":1,"featured":true,"cad_job_id":"cadj_bimexample311065","engine":"freecad","source_fcstd":"BIMExample.FCStd","proof_lane":"bim","spawn_profile":"bim","fit_to_viewport":false,"source_units":"mm","up_axis":"Z","glb_up_axis":"Y","placement_sidecar_url":"/assets/cad/exports/tenant_sam_primeaux/ws_inneranimalmedia/cadj_bimexample311065.placement.json"}',
  updated_at = datetime('now')
WHERE id = 'ds_stock_bim_example';

-- ─── Sam Sketch project: design lane metadata (preserve existing cover/files) ─
UPDATE projects
SET
  metadata_json = json_set(
    COALESCE(NULLIF(metadata_json, ''), '{}'),
    '$.designstudio',
    json('{"lane":"house_plan","display_name":"Sam Sketch","routes":["/dashboard/designstudio","/dashboard/draw"],"flow":["sketch_excalidraw","massing_freecad","detail_bim","render_glb"]}')
  ),
  updated_at = datetime('now')
WHERE id = 'proj_mrb5shkc_3kos2c';

-- ─── Learn course: AgentSam CAD Engineering ─────────────────────────────────
INSERT OR REPLACE INTO courses (
  id, slug, title, description, level, status, category, published_at, created_at, updated_at
) VALUES (
  'course_agentsam_cad_engineering',
  'agentsam-cad-engineering',
  'AgentSam CAD Engineering',
  'Study course for Draw, Design Studio, OpenSCAD/BOSL2, FreeCAD/BIM, Python CAD, and IAM runner integration.',
  'intermediate',
  'published',
  'design-engineering',
  unixepoch(),
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO course_modules (id, course_id, title, description, order_index, estimated_minutes, is_required, created_at, updated_at) VALUES
  ('module_cad_foundations', 'course_agentsam_cad_engineering', 'IAM CAD foundations', 'Draw vs Design Studio vs illustration_create SSOT.', 1, 45, 1, unixepoch(), unixepoch()),
  ('module_cad_openscad', 'course_agentsam_cad_engineering', 'OpenSCAD generators', 'BOSL2, ecosystem map, Gridfinity, domain templates.', 2, 210, 1, unixepoch(), unixepoch()),
  ('module_cad_freecad', 'course_agentsam_cad_engineering', 'FreeCAD documents', 'Headless FreeCAD, macros, BIM, assemblies.', 3, 195, 1, unixepoch(), unixepoch()),
  ('module_cad_python', 'course_agentsam_cad_engineering', 'Python CAD backends', 'CadQuery, build123d, preview UX patterns.', 4, 120, 1, unixepoch(), unixepoch()),
  ('module_cad_iam', 'course_agentsam_cad_engineering', 'IAM integration', 'Runner, templates, R2 exports, ship gates.', 5, 165, 1, unixepoch(), unixepoch());

INSERT OR REPLACE INTO course_lessons (id, course_id, module_id, title, description, order_index, estimated_minutes, is_required, created_at, updated_at) VALUES
  ('lesson_cad_000_platform_inventory', 'course_agentsam_cad_engineering', 'module_cad_foundations', 'IAM platform inventory', 'What exists vs cosmetic in Draw and Design Studio.', 1, 45, 1, unixepoch(), unixepoch()),
  ('lesson_cad_001_bosl2', 'course_agentsam_cad_engineering', 'module_cad_openscad', 'BOSL2 — default OpenSCAD abstraction', 'Study BelfrySCAD/BOSL2 for agent-generated parts.', 2, 60, 1, unixepoch(), unixepoch()),
  ('lesson_cad_002_ecosystem', 'course_agentsam_cad_engineering', 'module_cad_openscad', 'OpenSCAD ecosystem reference', 'MCAD, OMDL, awesome-openscad map.', 3, 30, 1, unixepoch(), unixepoch()),
  ('lesson_cad_003_gridfinity', 'course_agentsam_cad_engineering', 'module_cad_openscad', 'Gridfinity parametric generators', 'Customizer UX pattern for IAM templates.', 4, 90, 1, unixepoch(), unixepoch()),
  ('lesson_cad_004_domain', 'course_agentsam_cad_engineering', 'module_cad_openscad', 'Domain-specific generators', 'Keyboard_parts pattern; template slugs.', 5, 30, 1, unixepoch(), unixepoch()),
  ('lesson_cad_005_freecad', 'course_agentsam_cad_engineering', 'module_cad_freecad', 'FreeCAD foundation', 'Headless engine, not UI clone.', 6, 45, 1, unixepoch(), unixepoch()),
  ('lesson_cad_006_macros', 'course_agentsam_cad_engineering', 'module_cad_freecad', 'FreeCAD library and macros', 'Parts catalog + macro execution.', 7, 60, 1, unixepoch(), unixepoch()),
  ('lesson_cad_007_bim', 'course_agentsam_cad_engineering', 'module_cad_freecad', 'FreeCAD BIM / architecture', 'Shop-house massing lane.', 8, 45, 1, unixepoch(), unixepoch()),
  ('lesson_cad_008_assemblies', 'course_agentsam_cad_engineering', 'module_cad_freecad', 'FreeCAD assemblies', 'Assembly4 product structure.', 9, 45, 1, unixepoch(), unixepoch()),
  ('lesson_cad_009_python', 'course_agentsam_cad_engineering', 'module_cad_python', 'CadQuery + build123d', 'Python CAD runner spec.', 10, 90, 1, unixepoch(), unixepoch()),
  ('lesson_cad_010_preview_ux', 'course_agentsam_cad_engineering', 'module_cad_python', 'Code preview UX', 'CQ-editor / OCP viewer patterns.', 11, 30, 1, unixepoch(), unixepoch()),
  ('lesson_cad_011_integration', 'course_agentsam_cad_engineering', 'module_cad_iam', 'IAM integration blueprint', 'Engines, R2, D1, ship gates.', 12, 45, 1, unixepoch(), unixepoch()),
  ('lesson_cad_012_clone', 'course_agentsam_cad_engineering', 'module_cad_iam', 'Clone-first checklist', 'Local setup and capstone proof.', 13, 120, 1, unixepoch(), unixepoch());

-- lesson_assets (markdown on R2)
INSERT OR REPLACE INTO lesson_assets (id, lesson_id, asset_type, asset_url, r2_key, r2_bucket, file_name, mime_type, order_index, created_at, updated_at) VALUES
  ('asset_cad_000_md', 'lesson_cad_000_platform_inventory', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/00-iam-platform-inventory.md', 'learn/agentsam-cad-engineering/lessons/00-iam-platform-inventory.md', 'inneranimalmedia', '00-iam-platform-inventory.md', 'text/markdown', 1, unixepoch(), unixepoch()),
  ('asset_cad_001_md', 'lesson_cad_001_bosl2', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/01-openscad-bosl2.md', 'learn/agentsam-cad-engineering/lessons/01-openscad-bosl2.md', 'inneranimalmedia', '01-openscad-bosl2.md', 'text/markdown', 2, unixepoch(), unixepoch()),
  ('asset_cad_002_md', 'lesson_cad_002_ecosystem', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/02-openscad-ecosystem-reference.md', 'learn/agentsam-cad-engineering/lessons/02-openscad-ecosystem-reference.md', 'inneranimalmedia', '02-openscad-ecosystem-reference.md', 'text/markdown', 3, unixepoch(), unixepoch()),
  ('asset_cad_003_md', 'lesson_cad_003_gridfinity', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/03-gridfinity-parametric-generators.md', 'learn/agentsam-cad-engineering/lessons/03-gridfinity-parametric-generators.md', 'inneranimalmedia', '03-gridfinity-parametric-generators.md', 'text/markdown', 4, unixepoch(), unixepoch()),
  ('asset_cad_004_md', 'lesson_cad_004_domain', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/04-domain-specific-generators.md', 'learn/agentsam-cad-engineering/lessons/04-domain-specific-generators.md', 'inneranimalmedia', '04-domain-specific-generators.md', 'text/markdown', 5, unixepoch(), unixepoch()),
  ('asset_cad_005_md', 'lesson_cad_005_freecad', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/05-freecad-foundation.md', 'learn/agentsam-cad-engineering/lessons/05-freecad-foundation.md', 'inneranimalmedia', '05-freecad-foundation.md', 'text/markdown', 6, unixepoch(), unixepoch()),
  ('asset_cad_006_md', 'lesson_cad_006_macros', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/06-freecad-library-and-macros.md', 'learn/agentsam-cad-engineering/lessons/06-freecad-library-and-macros.md', 'inneranimalmedia', '06-freecad-library-and-macros.md', 'text/markdown', 7, unixepoch(), unixepoch()),
  ('asset_cad_007_md', 'lesson_cad_007_bim', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/07-freecad-bim-architecture.md', 'learn/agentsam-cad-engineering/lessons/07-freecad-bim-architecture.md', 'inneranimalmedia', '07-freecad-bim-architecture.md', 'text/markdown', 8, unixepoch(), unixepoch()),
  ('asset_cad_008_md', 'lesson_cad_008_assemblies', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/08-freecad-assemblies.md', 'learn/agentsam-cad-engineering/lessons/08-freecad-assemblies.md', 'inneranimalmedia', '08-freecad-assemblies.md', 'text/markdown', 9, unixepoch(), unixepoch()),
  ('asset_cad_009_md', 'lesson_cad_009_python', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/09-python-cad-cadquery-build123d.md', 'learn/agentsam-cad-engineering/lessons/09-python-cad-cadquery-build123d.md', 'inneranimalmedia', '09-python-cad-cadquery-build123d.md', 'text/markdown', 10, unixepoch(), unixepoch()),
  ('asset_cad_010_md', 'lesson_cad_010_preview_ux', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/10-code-preview-ux.md', 'learn/agentsam-cad-engineering/lessons/10-code-preview-ux.md', 'inneranimalmedia', '10-code-preview-ux.md', 'text/markdown', 11, unixepoch(), unixepoch()),
  ('asset_cad_011_md', 'lesson_cad_011_integration', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/11-iam-integration-blueprint.md', 'learn/agentsam-cad-engineering/lessons/11-iam-integration-blueprint.md', 'inneranimalmedia', '11-iam-integration-blueprint.md', 'text/markdown', 12, unixepoch(), unixepoch()),
  ('asset_cad_012_md', 'lesson_cad_012_clone', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/lessons/12-clone-setup-checklist.md', 'learn/agentsam-cad-engineering/lessons/12-clone-setup-checklist.md', 'inneranimalmedia', '12-clone-setup-checklist.md', 'text/markdown', 13, unixepoch(), unixepoch());
