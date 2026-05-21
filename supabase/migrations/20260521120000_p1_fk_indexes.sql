-- =============================================================================
-- P1: FK / lookup indexes (non-concurrent — for local/supabase db push only)
-- STATUS: MOSTLY APPLIED in production via MCP.
-- For production: prefer MANUAL_APPLY_20260521_concurrent.sql (CONCURRENTLY).
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_agentsam_plans_carry_over_from
  ON public.agentsam_plans (carry_over_from);

CREATE INDEX IF NOT EXISTS idx_agentsam_prompt_runs_supabase_user_id
  ON public.agentsam_prompt_runs (supabase_user_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_workflow_runs_task_id
  ON public.agentsam_workflow_runs (task_id);

CREATE INDEX IF NOT EXISTS idx_codebase_symbols_snapshot_id
  ON public.codebase_symbols (snapshot_id);

-- Duplicate superseded by tenant/workspace scoped indexes — drop if present
DROP INDEX IF EXISTS public.idx_agent_memory_workspace_id;
