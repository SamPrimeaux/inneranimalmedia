/**
 * Canonical Agent Sam repo paths for priority codebase ingestion (chunks + knowledge graph seeds).
 * Used by build-index-priority-files.mjs and index-codebase-snapshot.mjs — keep in sync.
 */
import { existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/** Exact repo-relative paths (forward slashes). */
export const PRIORITY_EXACT_REL_PATHS = [
  'src/api/agent.js',
  'src/api/rag.js',
  'src/core/agentsam-supabase-sync.js',
  'src/core/memory.js',
  'src/tools/ai-dispatch.js',
  'src/core/workflow-executor.js',
  'dashboard/components/DatabaseAgentChat.tsx',
  'dashboard/components/analytics/tabs/AgentTab.tsx',
  'dashboard/components/overview/index.tsx',
  'dashboard/components/overview/panels/WorkflowPanel.tsx',
  'dashboard/components/overview/panels/ErrorInbox.tsx',
  'dashboard/components/overview/panels/RagHealth.tsx',
  'dashboard/components/overview/constants.ts',
];

/** Curated triples for `public.knowledge_edges` (repo-specific, not third-party seed data). */
export const AGENT_SAM_CANONICAL_KNOWLEDGE_EDGES = [
  { entity_a: 'Agent Sam', relation: 'uses', entity_b: 'd1_query', source_type: 'architecture' },
  { entity_a: 'd1_query', relation: 'requires', entity_b: 'sql argument', source_type: 'architecture' },
  {
    entity_a: 'agentChatSseHandler',
    relation: 'filters tools through',
    entity_b: 'filterAgentToolsForRequest',
    source_type: 'architecture',
  },
  {
    entity_a: 'alignment-sync',
    relation: 'writes',
    entity_b: 'agentsam_workflow_runs',
    source_type: 'architecture',
  },
  {
    entity_a: 'syncWorkflowRunToSupabase',
    relation: 'mirrors',
    entity_b: 'agentsam_workflow_runs',
    source_type: 'architecture',
  },
  {
    entity_a: 'agent_memory',
    relation: 'stores',
    entity_b: 'durable curated recall',
    source_type: 'architecture',
  },
  {
    entity_a: 'codebase_chunks',
    relation: 'powers',
    entity_b: 'code semantic search',
    source_type: 'architecture',
  },
  {
    entity_a: 'unified_rag_search',
    relation: 'reads',
    entity_b: 'search_all_context',
    source_type: 'architecture',
  },
  {
    entity_a: 'loadAgentMemoryForPrompt',
    relation: 'may call',
    entity_b: 'searchAgentMemoryHybrid',
    source_type: 'architecture',
  },
];

/**
 * @param {string} repoRoot
 * @param {{ migrationsMax?: number, scriptsSqlMax?: number }} [opts]
 * @returns {string[]} repo-relative paths
 */
export function collectSqlPriorityRelPaths(repoRoot, opts = {}) {
  const migrationsMax = opts.migrationsMax ?? 40;
  const scriptsSqlMax = opts.scriptsSqlMax ?? 30;
  const out = [];

  const pushDir = (absDir, max) => {
    if (!existsSync(absDir)) return;
    const files = readdirSync(absDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => join(absDir, f))
      .filter((p) => {
        try {
          return statSync(p).isFile();
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .reverse()
      .slice(0, max);
    for (const p of files) {
      out.push(relative(repoRoot, p).replace(/\\/g, '/'));
    }
  };

  pushDir(join(repoRoot, 'migrations'), migrationsMax);
  pushDir(join(repoRoot, 'scripts/sql'), scriptsSqlMax);
  return out;
}

/**
 * Priority paths for RAG (source only — no migrations/scripts SQL).
 * @param {string} repoRoot
 */
export function collectAllPriorityRelPaths(repoRoot) {
  return PRIORITY_EXACT_REL_PATHS.filter((rel) => {
    const p = join(repoRoot, rel);
    return existsSync(p);
  });
}
