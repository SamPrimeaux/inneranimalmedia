-- 649: Pinned Agentic Edge sprint router — Google Next '26 parity on Cloudflare stack.
-- Pairs with docs/platform/agentic-edge-sprint*.md vector chunks + ctx_inneranimalmedia.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/649_agentic_edge_sprint_memory_router.sql

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_agentic_edge_sprint_router_v1',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'decision',
  'agentic_edge_sprint_router_v1',
  'START HERE for Agentic Edge sprint (2026-06-20). Inspired by Google Cloud Next 26 AI infrastructure — Cloudflare parity, not GCP silicon. Dashboard: /dashboard/agent. (1) Semantic: docs_knowledge_search "Agentic Edge sprint plan" OR source_ref platform/inneranimalmedia/agentic-edge-sprint-plan#*; git SSOT docs/platform/agentic-edge-sprint-plan.md; re-ingest npm run run:ingest_agentic_edge_sprint_plan; sync npm run run:sync_agentic_edge_sprint_memory_vector. (2) Sprint 1A context tier: agentic-edge-sprint-1a-context-tier.md — R2 context/{tenant}/{user}/exec/{session}/ hot KV warm R2 cold digest. (3) Sprint 1B inference gateway: agentic-edge-sprint-1b-inference-gateway.md — agentsam_model_health migration 650, TTFT-aware routing in agent-model-resolver.js. (4) Sprint 1C exec fabric: agentic-edge-sprint-1c-exec-fabric.md — MCP EXECOS binding-only, deprecate bridge path. (5) Repos: inneranimalmedia CORE, ExecOS PTY/dispatcher, inneranimalmedia-mcp-server OAuth MCP. (6) Verify: curl mcp/execos/terminal health; node scripts/mcp-smoke.mjs.',
  'Agentic Edge sprint context router',
  'Router: Google agentic infra audit → 3-repo sprint (context, TTFT routing, ExecOS fabric).',
  'migration_649_agentic_edge_sprint_router',
  '["inneranimalmedia","agentic_edge","agentsam","execos","mcp","ttft","kv_cache","sprint","router","google_next26"]',
  1.0,
  9,
  1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:agentic_edge_sprint_router_v1',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  title = excluded.title,
  summary = excluded.summary,
  workspace_id = excluded.workspace_id,
  memory_type = excluded.memory_type,
  source = excluded.source,
  tags = excluded.tags,
  confidence = excluded.confidence,
  importance = excluded.importance,
  is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key,
  updated_at = unixepoch();

UPDATE agentsam_project_context
SET
  notes = COALESCE(notes, '') || ' Agentic Edge sprint: agentsam_memory.key=agentic_edge_sprint_router_v1; docs/platform/agentic-edge-sprint-plan.md; npm run run:ingest_agentic_edge_sprint_plan.',
  updated_at = unixepoch()
WHERE id = 'ctx_inneranimalmedia'
  AND COALESCE(notes, '') NOT LIKE '%agentic_edge_sprint_router_v1%';
