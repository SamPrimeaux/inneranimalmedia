-- 780: Companions project dashboard — AGENTSAM.md instructions + memory for proj_companions_cpas_web.
-- Seeds project_memory keys dashboard.instructions + dashboard.memory (user_preference).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/780_companions_project_dashboard_agentsam_instructions.sql

INSERT INTO project_memory (
  id,
  project_id,
  tenant_id,
  memory_type,
  key,
  value,
  importance_score,
  confidence_score,
  created_by,
  created_at,
  updated_at
) VALUES (
  'pmem_ui_proj_companions_cpas_web_dashboard_instructions',
  'proj_companions_cpas_web',
  'tenant_sam_primeaux',
  'user_preference',
  'dashboard.instructions',
  'AGENTSAM.md required — read before any code, CMS, or deploy work on this project.

1. SSOT files (keep both copies in sync):
   • IAM: docs/clients/companionscpas/AGENTSAM.md
   • Client repo: companionscpas/AGENTSAM.md

2. Worker bindings: document exactly as Cloudflare dashboard Type | Name | Value (DB · CMS_CACHE · WEBSITE_ASSETS · AGENTSAM_WAI). Name = env.* in code.

3. Production URLs only: https://companionsofcaddo.org — no workers.dev.

4. Deploy from companionscpas repo only: npm run deploy:full. Do not patch client runtime from inneranimalmedia Worker.

5. After structural/binding/deploy changes: update both AGENTSAM.md copies, then verify this Instructions block still matches.

Tasks: /dashboard/collaborate?seg=tasks&client=client_companions_cpas',
  1.0,
  1.0,
  'migration_780',
  unixepoch(),
  unixepoch()
)
ON CONFLICT(project_id, memory_type, key) DO UPDATE SET
  value = excluded.value,
  updated_at = unixepoch(),
  created_by = COALESCE(excluded.created_by, project_memory.created_by);

INSERT INTO project_memory (
  id,
  project_id,
  tenant_id,
  memory_type,
  key,
  value,
  importance_score,
  confidence_score,
  created_by,
  created_at,
  updated_at
) VALUES (
  'pmem_ui_proj_companions_cpas_web_dashboard_memory',
  'proj_companions_cpas_web',
  'tenant_sam_primeaux',
  'user_preference',
  'dashboard.memory',
  'Companions of CPAS — nonprofit dog rescue (Caddo Parish LA). Site: companionsofcaddo.org · Worker: companionscpas · client_id: client_companions_cpas · workspace: ws_companionscpas · project: proj_companions_cpas_web. Client D1: companionscpas (not inneranimalmedia-business). IAM docs/RAG only in inneranimalmedia repo.',
  1.0,
  1.0,
  'migration_780',
  unixepoch(),
  unixepoch()
)
ON CONFLICT(project_id, memory_type, key) DO UPDATE SET
  value = excluded.value,
  updated_at = unixepoch(),
  created_by = COALESCE(excluded.created_by, project_memory.created_by);
