-- 195: agentsam_code_index_job — IAM TOOLS agent workspace (R2 tools bucket, shell + Monaco + Excalidraw paths).
-- UNIQUE (user_id, workspace_id): workspace_id must be new per user.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/195_agentsam_code_index_job_iam_tools.sql

INSERT OR IGNORE INTO agentsam_code_index_job (
  id,
  user_id,
  workspace_id,
  status,
  file_count,
  progress_percent,
  last_sync_at,
  last_error,
  vector_backend,
  updated_at
) VALUES (
  'cij_iam_tools_agent_workspace',
  'sam_primeaux',
  'iam_tools_agent_workspace',
  'idle',
  0,
  0,
  NULL,
  'Pending first index: TOOLS env binding (tools.inneranimalmedia.com), prefixes monaco/, excalidraw/, code/iam-workspace-shell.html. Registry vidx_tools_agent_workspace. Not AutoRAG.',
  'd1_cosine',
  datetime('now')
);
