-- =============================================================================
-- P1: RLS on high-risk tables (audit-first — do NOT blanket-rewrite all policies)
-- STATUS: PARTIAL — run policy audit in SQL editor before applying new policies:
--
--   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
--
-- Consolidate to ONE policy per (table, role, cmd) where duplicates exist.
-- Wrap auth.* and JWT helpers in (select ...) so initplan runs once per query.
-- =============================================================================

-- ── agent_memory ─────────────────────────────────────────────────────────────
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_agent_memory" ON public.agent_memory;
CREATE POLICY "tenant_read_agent_memory"
  ON public.agent_memory
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND length(btrim(tenant_id)) > 0
    AND public.has_tenant_access(tenant_id)
  );

-- ── documents ────────────────────────────────────────────────────────────────
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_documents" ON public.documents;
CREATE POLICY "tenant_read_documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND length(btrim(tenant_id)) > 0
    AND public.has_tenant_access(tenant_id)
  );

-- ── codebase_chunks ──────────────────────────────────────────────────────────
ALTER TABLE public.codebase_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_codebase_chunks" ON public.codebase_chunks;
CREATE POLICY "tenant_read_codebase_chunks"
  ON public.codebase_chunks
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND length(btrim(tenant_id)) > 0
    AND public.has_tenant_access(tenant_id)
  );

-- ── agentsam_plan_tasks (plan board — Worker API preferred; RLS for defense) ─
ALTER TABLE public.agentsam_plan_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_agentsam_plan_tasks" ON public.agentsam_plan_tasks;
CREATE POLICY "tenant_read_agentsam_plan_tasks"
  ON public.agentsam_plan_tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agentsam_plans p
      WHERE p.id = agentsam_plan_tasks.plan_id
        AND p.tenant_id IS NOT NULL
        AND public.has_tenant_access(p.tenant_id)
    )
  );

-- RLS requires table-level GRANT in addition to policies (P0 revoked ALL).
GRANT SELECT ON public.agent_memory TO authenticated;
GRANT SELECT ON public.documents TO authenticated;
GRANT SELECT ON public.codebase_chunks TO authenticated;
GRANT SELECT ON public.agentsam_plan_tasks TO authenticated;

-- agentsam_workflow_runs / agentsam_error_events / agentsam_stream_events:
-- Worker-only after P0. Overview uses webhooks → KV dirty → dashboard-bundle.
