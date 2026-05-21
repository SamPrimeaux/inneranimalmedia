-- =============================================================================
-- MANUAL ONLY — run statements ONE AT A TIME in Supabase SQL Editor.
-- CONCURRENTLY and some REVOKE batches cannot run inside a transaction.
-- STATUS: PENDING manual apply (production hardening sprint remainder).
-- =============================================================================

-- ── 1) Function execute revokes ─────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.has_tenant_access(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_workspace_access(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_identity_profile_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_rag_ingest() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_agent_memory_sync() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.iam_context_reindex_webhook() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_codebase_chunks(vector, text, text, double precision, integer, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.search_codebase_symbols(text, text, text, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_codebase_chunk_embed() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_read_identity_profile(uuid, text, text, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_plan_alignment_snapshot(text, text, text, text, text, text, jsonb, jsonb, jsonb, text, jsonb) FROM anon, authenticated;

-- ── 2) FK indexes (CONCURRENTLY — one statement per run) ───────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agentsam_plans_carry_over_from
  ON public.agentsam_plans (carry_over_from);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agentsam_prompt_runs_supabase_user_id
  ON public.agentsam_prompt_runs (supabase_user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agentsam_workflow_runs_task_id
  ON public.agentsam_workflow_runs (task_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_symbols_snapshot_id
  ON public.codebase_symbols (snapshot_id);

DROP INDEX CONCURRENTLY IF EXISTS public.idx_agent_memory_workspace_id;

-- ── 3) app_private lockdown (confirm after P2 migration) ─────────────────────
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA app_api FROM PUBLIC, anon;
