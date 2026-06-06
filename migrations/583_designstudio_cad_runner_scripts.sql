-- 583: Design Studio CAD runner — R2 autorag scripts/designstudio/* + agentsam_scripts registry.
-- Upload first:
--   ./scripts/upload-agentsam-scripts-r2.sh \
--     scripts/designstudio/cad-job-runner.mjs:designstudio/cad-job-runner.mjs \
--     scripts/designstudio/lib.sh:designstudio/lib.sh \
--     scripts/designstudio/run-openscad.sh:designstudio/run-openscad.sh \
--     scripts/designstudio/run-blender-glb.sh:designstudio/run-blender-glb.sh \
--     scripts/designstudio/stl-to-glb.py:designstudio/stl-to-glb.py \
--     scripts/designstudio/pipeline-smoke.sh:designstudio/pipeline-smoke.sh
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/583_designstudio_cad_runner_scripts.sql

INSERT OR IGNORE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes, source_stored,
  created_at_epoch, updated_at_epoch
) VALUES
(
  'script_cad_job_runner',
  'tenant_sam_primeaux',
  'ws_designstudio',
  'cad_job_runner',
  'Design Studio CAD job runner',
  'scripts/designstudio/cad-job-runner.mjs',
  '',
  'Poll D1 agentsam_cad_jobs (pending) and execute OpenSCAD/Blender locally; upload GLB to R2; callback POST /api/internal/cad/job-complete. Requires OPENSCAD_BIN, BLENDER_BIN, INTERNAL_API_SECRET on operator Mac.',
  'cicd',
  'node',
  'javascript',
  'a7d8a587738b6686d6484a56be24be69691b0b3473615cb6e479eca8f21a2e8d',
  0,
  1,
  1,
  1,
  0,
  0,
  'medium',
  'designstudio,cad,openscad,blender,meshy,runner',
  'Long-running: npm run designstudio:runner. Single pass: npm run designstudio:runner:once. Pair with Worker POST /api/cad/jobs/:id/execute.',
  'r2:inneranimalmedia-autorag/scripts/designstudio/cad-job-runner.mjs',
  unixepoch(),
  unixepoch()
),
(
  'script_designstudio_pipeline_smoke',
  'tenant_sam_primeaux',
  'ws_designstudio',
  'designstudio_pipeline_smoke',
  'Design Studio OpenSCAD→GLB smoke',
  'scripts/designstudio/pipeline-smoke.sh',
  '',
  'Local proof: OpenSCAD → STL → Blender GLB in temp dir. Run before shipping CAD runner changes.',
  'test',
  'bash',
  'bash',
  '94f89ba53caff692fbeff8e400b1457f157c404284812afe95e9616ffe7f9ae8',
  0,
  1,
  1,
  1,
  1,
  0,
  'low',
  'designstudio,cad,smoke',
  'npm run designstudio:smoke',
  'r2:inneranimalmedia-autorag/scripts/designstudio/pipeline-smoke.sh',
  unixepoch(),
  unixepoch()
),
(
  'script_designstudio_lib',
  'tenant_sam_primeaux',
  'ws_designstudio',
  'designstudio_lib',
  'Design Studio script helpers (lib.sh)',
  'scripts/designstudio/lib.sh',
  '',
  'Shared OPENSCAD_BIN / BLENDER_BIN resolution for designstudio shell scripts.',
  'maintenance',
  'bash',
  'bash',
  '0f47b86f44951e6009cb996c9edad86b491f595aac2e580aa0c9d4cce7d3620b',
  0,
  1,
  0,
  1,
  1,
  0,
  'low',
  'designstudio,cad',
  'Sourced by run-openscad.sh and pipeline-smoke.sh',
  'r2:inneranimalmedia-autorag/scripts/designstudio/lib.sh',
  unixepoch(),
  unixepoch()
);

-- Refresh hashes after R2 upload (upload-agentsam-scripts-r2.sh sync_script_hashes_d1 also updates these)
UPDATE agentsam_scripts SET
  script_hash = 'a7d8a587738b6686d6484a56be24be69691b0b3473615cb6e479eca8f21a2e8d',
  path = 'scripts/designstudio/cad-job-runner.mjs',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/designstudio/cad-job-runner.mjs',
  body = '',
  updated_at_epoch = unixepoch()
WHERE slug = 'cad_job_runner';

UPDATE agentsam_scripts SET
  script_hash = '94f89ba53caff692fbeff8e400b1457f157c404284812afe95e9616ffe7f9ae8',
  path = 'scripts/designstudio/pipeline-smoke.sh',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/designstudio/pipeline-smoke.sh',
  body = '',
  updated_at_epoch = unixepoch()
WHERE slug = 'designstudio_pipeline_smoke';

UPDATE agentsam_scripts SET
  script_hash = '0f47b86f44951e6009cb996c9edad86b491f595aac2e580aa0c9d4cce7d3620b',
  path = 'scripts/designstudio/lib.sh',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/designstudio/lib.sh',
  body = '',
  updated_at_epoch = unixepoch()
WHERE slug = 'designstudio_lib';
