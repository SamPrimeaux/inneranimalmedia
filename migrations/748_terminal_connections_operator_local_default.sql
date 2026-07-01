-- 748: Operator terminal lane — Mac localpty primary (is_default), GCP VM fallback.
-- Resolution: is_default DESC, target_priority ASC per workspace_id + user_id.

UPDATE terminal_connections
SET is_default = 0, updated_at = datetime('now')
WHERE id = 'conn_op_gcp_cd1d8f'
  AND user_id = 'au_cd1d8f5ccce9e15a';

UPDATE terminal_connections
SET is_default = 1, target_priority = 10, updated_at = datetime('now')
WHERE id = 'conn_op_local_cd1d8f'
  AND user_id = 'au_cd1d8f5ccce9e15a';
