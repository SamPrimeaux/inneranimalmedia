-- Phase 1: document Hyperdrive service_role access (advisor clear). No auth.uid().
-- Applied remotely 2026-07-14 via Supabase MCP. Idempotent mirror in repo.

DROP POLICY IF EXISTS "service_role_full_access" ON agentsam.agentsam_memory;
CREATE POLICY "service_role_full_access" ON agentsam.agentsam_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access" ON agentsam.agentsam_projects;
CREATE POLICY "service_role_full_access" ON agentsam.agentsam_projects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access" ON agentsam.agentsam_plans;
CREATE POLICY "service_role_full_access" ON agentsam.agentsam_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access" ON agentsam.agentsam_plan_tasks;
CREATE POLICY "service_role_full_access" ON agentsam.agentsam_plan_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
