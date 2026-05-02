-- 221: agent_commands — sync session/deploy docs to autorag R2 (slash command hint for Agent Sam)
-- Run when ready:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/221_agent_command_sync_session_autorag.sql

INSERT OR REPLACE INTO agent_commands (
  id,
  tenant_id,
  name,
  slug,
  description,
  category,
  command_text,
  parameters_json,
  implementation_type,
  implementation_ref,
  status,
  is_public,
  usage_count,
  last_used_at,
  created_at,
  updated_at,
  use_count,
  context_tags
) VALUES (
  'cmd_sync_session_autorag',
  'tenant_sam_primeaux',
  'Sync session log to autorag R2',
  'sync-session-autorag',
  'Uploads RAG-sized deploy/session docs to the autorag bucket: knowledge/workflows/iam-deploy-promote-and-session-log-rag.md plus context/cursor-session-log-recent.md (tail of docs/cursor-session-log.md). Run from repo root after updating the session log. Then run RAG ingest if applicable.',
  'deployment',
  './scripts/upload-session-docs-to-autorag.sh',
  '[]',
  'builtin',
  NULL,
  'active',
  0,
  0,
  NULL,
  unixepoch(),
  unixepoch(),
  0,
  'rag,deploy,autorag,session-log'
);
