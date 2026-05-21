-- =============================================================================
-- P0: Revoke direct PostgREST exposure on sensitive public tables
-- STATUS: APPLIED in production Supabase via MCP (2026-05-21). Kept in repo for
--         idempotent re-apply and drift recovery. Safe to re-run.
-- =============================================================================
-- Browser clients must use Worker /api/* (Hyperdrive + service role), not
-- supabase-js .from() on these tables after hardening.
-- Edge functions (embed-on-ingest, backfill-embeddings) use service_role.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'agent_memory',
    'agent_context_snapshots',
    'agent_decisions',
    'agentsam_debug_snapshots',
    'agentsam_error_events',
    'agentsam_eval_runs',
    'agentsam_plan_tasks',
    'agentsam_plans',
    'agentsam_prompt_runs',
    'agentsam_routing_decisions',
    'agentsam_stream_events',
    'agentsam_tool_call_events',
    'agentsam_workflow_runs',
    'build_deploy_events',
    'codebase_chunks',
    'codebase_files',
    'codebase_snapshots',
    'codebase_symbols',
    'cost_forecasts',
    'documents',
    'session_summaries',
    'tenant_memberships',
    'webhook_secrets',
    'workspace_memberships'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

-- Tables that retain authenticated SELECT under RLS (see 20260521110000):
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.semantic_search_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.knowledge_edges FROM anon, authenticated;

GRANT SELECT ON public.semantic_search_log TO authenticated;
GRANT SELECT ON public.knowledge_edges TO authenticated;
GRANT ALL ON public.semantic_search_log TO service_role;
GRANT ALL ON public.knowledge_edges TO service_role;
