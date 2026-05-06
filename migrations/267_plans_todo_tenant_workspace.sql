-- agentsam_plan_tasks: add tenant_id + workspace_id (missing entirely)
ALTER TABLE agentsam_plan_tasks ADD COLUMN tenant_id TEXT;
ALTER TABLE agentsam_plan_tasks ADD COLUMN workspace_id TEXT;

-- agentsam_todo: add workspace_id (missing entirely)
ALTER TABLE agentsam_todo ADD COLUMN workspace_id TEXT;

-- agentsam_plans: NULL out hardcoded model default (must come from agent_model_registry)
-- SQLite can't ALTER DEFAULT; new rows will get NULL until code sets it explicitly
-- Existing rows are fine — they already have values written

-- Strip hardcoded tenant/workspace defaults from agentsam_plans,
-- agentsam_todo, agentsam_approval_queue via table recreation is deferred
-- to the batched 69-table migration. These ALTER ADDs are the urgent unblock.
