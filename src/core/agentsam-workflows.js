/**
 * Canonical MCP workflow definitions live in agentsam_mcp_workflows (not mcp_workflows).
 */

export const AGENTSAM_MCP_WORKFLOWS = 'agentsam_mcp_workflows';

/** Runnable workflows: active flag + non-terminal statuses. */
export const AGENTSAM_WORKFLOW_ACTIVE_SQL = `is_active = 1 AND status NOT IN ('archived','deprecated','failed')`;

/**
 * Map a D1 row to the shape legacy handlers expect (name, estimated_cost_usd).
 * @param {Record<string, unknown>|null|undefined} row
 */
export function normalizeAgentSamWorkflowRow(row) {
  if (!row || typeof row !== 'object') return row;
  const o = { ...row };
  if (o.name == null && o.display_name != null) o.name = o.display_name;
  if (o.estimated_cost_usd == null && o.total_cost_usd != null) o.estimated_cost_usd = o.total_cost_usd;
  return o;
}

/** SELECT list for GET /api/mcp/workflows (legacy JSON uses `name`, `estimated_cost_usd`). */
export function buildAgentSamWorkflowListSelect() {
  return `SELECT id,
       display_name AS name,
       description,
       category,
       trigger_type,
       status,
       run_count,
       success_count,
       last_run_at,
       total_cost_usd AS estimated_cost_usd,
       created_at
     FROM ${AGENTSAM_MCP_WORKFLOWS}
     WHERE tenant_id = ?
     ORDER BY updated_at DESC`;
}

/**
 * @param {any} db D1Database
 * @param {number} fallback
 * @param {string} tenantId
 */
export async function maxAgentsamWorkflowTimeoutSeconds(db, fallback, tenantId) {
  const row = await db
    .prepare(
      `SELECT COALESCE(MAX(timeout_seconds), ?) AS t FROM ${AGENTSAM_MCP_WORKFLOWS} WHERE tenant_id = ?`,
    )
    .bind(fallback, tenantId)
    .first();
  const t = row?.t != null ? Number(row.t) : fallback;
  return Number.isFinite(t) && t > 0 ? t : fallback;
}

/**
 * @param {any} db D1Database
 * @param {string} keyOrId workflow id (primary key) or workflow_key
 * @param {string} tenantId
 */
export async function getAgentSamWorkflow(db, keyOrId, tenantId) {
  const k = String(keyOrId || '').trim();
  if (!k) return null;
  const byId = await db
    .prepare(
      `SELECT * FROM ${AGENTSAM_MCP_WORKFLOWS} WHERE id = ? AND tenant_id = ? AND ${AGENTSAM_WORKFLOW_ACTIVE_SQL} LIMIT 1`,
    )
    .bind(k, tenantId)
    .first();
  if (byId) return normalizeAgentSamWorkflowRow(byId);
  const byKey = await db
    .prepare(
      `SELECT * FROM ${AGENTSAM_MCP_WORKFLOWS} WHERE workflow_key = ? AND tenant_id = ? AND ${AGENTSAM_WORKFLOW_ACTIVE_SQL} LIMIT 1`,
    )
    .bind(k, tenantId)
    .first();
  return normalizeAgentSamWorkflowRow(byKey);
}

/**
 * @param {any} db D1Database
 * @param {{ tenantId: string }} opts
 */
export async function listAgentSamWorkflows(db, opts) {
  const { results } = await db
    .prepare(buildAgentSamWorkflowListSelect())
    .bind(opts.tenantId)
    .all();
  return results || [];
}

const STAT_PATCH_NUMS = new Set(['run_count', 'success_count', 'avg_duration_ms', 'total_cost_usd']);

/**
 * @param {any} db D1Database
 * @param {string} workflowId
 * @param {string} tenantId
 * @param {Record<string, unknown>} patch
 */
export async function updateAgentSamWorkflowStats(db, workflowId, tenantId, patch) {
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    fields.push(`${k} = ?`);
    vals.push(STAT_PATCH_NUMS.has(k) ? Number(v) || 0 : v);
  }
  if (!fields.length) return;
  fields.push(`updated_at = datetime('now')`);
  vals.push(workflowId, tenantId);
  await db
    .prepare(
      `UPDATE ${AGENTSAM_MCP_WORKFLOWS} SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
    )
    .bind(...vals)
    .run();
}
