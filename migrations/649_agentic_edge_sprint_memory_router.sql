-- 649: Pinned Agentic Edge sprint router.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/649_agentic_edge_sprint_memory_router.sql

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_agentic_edge_sprint_router_v1',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', 'ws_inneranimalmedia',
  'decision', 'agentic_edge_sprint_router_v1',
  'START HERE for Agentic Edge sprint (2026-06-20). Cloudflare parity with Google Next 26 AI infra. Dashboard: /dashboard/agent. Sprint 1A: context tier (R2/KV). Sprint 1B: TTFT-aware inference gateway. Sprint 1C: MCP EXECOS binding-only.',
  'Agentic Edge sprint context router',
  'Router: Google agentic infra audit → 3-repo sprint (context, TTFT routing, ExecOS fabric).',
  'migration_649_agentic_edge_sprint_router',
  '["inneranimalmedia","agentic_edge","agentsam","execos","mcp","sprint","router"]',
  1.0, 9, 1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:agentic_edge_sprint_router_v1',
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  value = excluded.value, title = excluded.title, summary = excluded.summary,
  workspace_id = excluded.workspace_id, memory_type = excluded.memory_type,
  source = excluded.source, tags = excluded.tags, confidence = excluded.confidence,
  importance = excluded.importance, is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key, updated_at = unixepoch();

UPDATE agentsam_project_context
SET notes = COALESCE(notes, '') || ' Agentic Edge sprint: agentsam_memory.key=agentic_edge_sprint_router_v1.',
    updated_at = unixepoch()
WHERE id = 'ctx_inneranimalmedia'
  AND COALESCE(notes, '') NOT LIKE '%agentic_edge_sprint_router_v1%';
