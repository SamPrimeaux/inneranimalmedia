/**
 * Reject D1 tools when SQL targets known Supabase/Postgres-only agentsam tables.
 * Fixes in-app hallucinated "SELECT … FROM agentsam_search_log" on D1.
 */
const POSTGRES_ONLY_TABLES = Object.freeze([
  'agentsam_search_log',
  'agentsam_usage_events',
  'agentsam_workflow_runs',
  'agentsam_workflow_steps',
  'agentsam_tool_call_events',
  'agentsam_error_events',
  'agentsam_worker_events',
  'agentsam_deploy_events',
  'agentsam_memory_oai3large_1536',
  'agentsam_deep_archive_oai3large_3072',
  'agentsam_documents_oai3large_1536',
  'agentsam_codebase_chunks_oai3large_1536',
  'agentsam_database_schema_oai3large_1536',
  'agentsam_vector_sync_outbox',
  'agentsam_plans',
  'agentsam_projects',
  'agentsam_plan_tasks',
]);

const TABLE_RE = /\b(?:from|join|into|update|table)\s+(?:agentsam\.)?([a-z_][a-z0-9_]*)\b/gi;

/**
 * @param {string} sql
 * @returns {{ blocked: boolean, table?: string, error?: string, user_message?: string }}
 */
export function assertD1SqlNotPostgresOnly(sql) {
  const text = String(sql || '');
  if (!text.trim()) return { blocked: false };

  const found = new Set();
  let m;
  TABLE_RE.lastIndex = 0;
  while ((m = TABLE_RE.exec(text)) !== null) {
    const name = String(m[1] || '').toLowerCase();
    if (POSTGRES_ONLY_TABLES.includes(name)) found.add(name);
  }

  // Bare schema-qualified refs without FROM (e.g. agentsam.agentsam_search_log)
  for (const t of POSTGRES_ONLY_TABLES) {
    if (new RegExp(`\\bagentsam\\.${t}\\b`, 'i').test(text) || new RegExp(`\\b${t}\\b`, 'i').test(text)) {
      // Avoid false positives on short names only when clearly table-contexted
      if (new RegExp(`\\bagentsam\\.${t}\\b`, 'i').test(text)) found.add(t);
      else if (new RegExp(`\\b(?:from|join|into|update)\\s+${t}\\b`, 'i').test(text)) found.add(t);
    }
  }

  if (!found.size) return { blocked: false };

  const table = [...found][0];
  const error =
    `wrong_data_plane: ${table} is Postgres (Supabase agentsam.* via Hyperdrive), not D1. ` +
    `Use a hyperdrive/supabase catalog tool (or POST /api/internal/agent-run-telemetry for run summaries).`;
  return {
    blocked: true,
    table,
    error,
    user_message:
      `${table} lives in Supabase (Hyperdrive), not Cloudflare D1. ` +
      `Do not call d1_query for this table — use the Supabase/Hyperdrive SQL tool instead.`,
  };
}

export { POSTGRES_ONLY_TABLES };
