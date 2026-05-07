-- Mock edges for dashboard/overview demos. FK targets agentsam_tool_chain(id).
PRAGMA foreign_keys = OFF;

INSERT OR IGNORE INTO agentsam_execution_dependency_graph (
  id,
  tenant_id,
  chain_id,
  depends_on_chain_id,
  dependency_type,
  condition_expression,
  compensation_chain_id,
  created_at
) VALUES
  ('edg_01','tenant_sam_primeaux','exec_deploy_001','exec_test_001','sequential',NULL,NULL,(unixepoch())),
  ('edg_02','tenant_sam_primeaux','exec_promote_001','exec_deploy_001','sequential',NULL,NULL,(unixepoch())),
  ('edg_03','tenant_sam_primeaux','exec_notify_001','exec_promote_001','sequential',NULL,NULL,(unixepoch())),
  ('edg_04','tenant_sam_primeaux','exec_rollback_001','exec_promote_001','conditional','status=failed','exec_restore_001',(unixepoch())),
  ('edg_05','tenant_sam_primeaux','exec_parallel_a','exec_test_001','parallel_allowed',NULL,NULL,(unixepoch())),
  ('edg_06','tenant_sam_primeaux','exec_parallel_b','exec_test_001','parallel_allowed',NULL,NULL,(unixepoch()));

PRAGMA foreign_keys = ON;
