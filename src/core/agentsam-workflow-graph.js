/**
 * Workflow graph load + CRUD helpers (agentsam_workflows registry + DAG on workflow_id).
 */

export async function resolveMcpWorkflowRow(db, workflowKey, tenantId, workspaceId) {
  if (!db) return null;
  const key = String(workflowKey || '').trim();
  if (!key) return null;
  const tid = tenantId != null ? String(tenantId).trim() : '';
  const wid = workspaceId != null ? String(workspaceId).trim() : '';
  const first = async (sql, binds) =>
    db
      .prepare(sql)
      .bind(...binds)
      .first()
      .catch(() => null);
  if (tid && wid) {
    const exact = await first(
      `SELECT id FROM agentsam_mcp_workflows
       WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1
         AND tenant_id = ? AND (workspace_id = ? OR workspace_id IS NULL)
       ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END, updated_at DESC
       LIMIT 1`,
      [key, tid, wid, wid],
    );
    if (exact) return exact;
  }
  if (tid) {
    const tenantRow = await first(
      `SELECT id FROM agentsam_mcp_workflows
       WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1 AND tenant_id = ?
       ORDER BY (workspace_id IS NOT NULL) DESC, updated_at DESC
       LIMIT 1`,
      [key, tid],
    );
    if (tenantRow) return tenantRow;
  }
  return first(
    `SELECT id FROM agentsam_mcp_workflows
     WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1
       AND tenant_id IS NULL AND workspace_id IS NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
    [key],
  );
}

function parseJsonObject(raw, fallback = {}) {
  if (raw == null) return { ...fallback };
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...fallback, ...raw };
  try {
    const o = JSON.parse(String(raw || '{}'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

/**
 * Resolve DAG owner id (MCP catalog id preferred when nodes exist).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Record<string, unknown>} workflow
 * @param {string|null} tenantId
 * @param {string|null} workspaceId
 */
export async function resolveDagWorkflowId(db, workflow, tenantId, workspaceId) {
  if (!db || !workflow) return null;
  const mcpRow = await resolveMcpWorkflowRow(
    db,
    String(workflow.workflow_key || ''),
    tenantId,
    workspaceId,
  );
  const candidates = [mcpRow?.id, workflow.id].filter(Boolean);
  const seen = new Set();
  for (const wid of candidates) {
    if (seen.has(wid)) continue;
    seen.add(wid);
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS c FROM agentsam_workflow_nodes
         WHERE workflow_id = ? AND COALESCE(is_active, 1) = 1`,
      )
      .bind(wid)
      .first()
      .catch(() => null);
    if (Number(row?.c) > 0) return String(wid);
  }
  return String(mcpRow?.id ?? workflow.id ?? '');
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} registryId agentsam_workflows.id
 * @param {string|null} tenantId
 * @param {string|null} workspaceId
 */
export async function loadWorkflowGraphBundle(db, registryId, tenantId, workspaceId) {
  const workflow = await db
    .prepare(`SELECT * FROM agentsam_workflows WHERE id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`)
    .bind(registryId)
    .first();
  if (!workflow) return null;

  const mcpWorkflow = await loadMcpWorkflowFull(
    db,
    String(workflow.workflow_key || ''),
    tenantId,
    workspaceId,
  );
  const dagWorkflowId = await resolveDagWorkflowId(db, workflow, tenantId, workspaceId);
  const nodes =
    (
      await db
        .prepare(
          `SELECT * FROM agentsam_workflow_nodes
           WHERE workflow_id = ? AND COALESCE(is_active, 1) = 1
           ORDER BY sort_order ASC, node_key ASC`,
        )
        .bind(dagWorkflowId)
        .all()
    ).results || [];
  const edges =
    (
      await db
        .prepare(
          `SELECT * FROM agentsam_workflow_edges
           WHERE workflow_id = ?
           ORDER BY priority ASC, from_node_key ASC`,
        )
        .bind(dagWorkflowId)
        .all()
    ).results || [];

  const meta = parseJsonObject(workflow.metadata_json);
  const runsSummary = await loadWorkflowRunsSummary(db, String(workflow.workflow_key || ''));
  return {
    workflow,
    mcp_workflow: mcpWorkflow,
    registry_workflow_id: String(workflow.id ?? ''),
    dag_workflow_id: dagWorkflowId,
    nodes,
    edges,
    canvas_layout: meta.canvas_layout && typeof meta.canvas_layout === 'object' ? meta.canvas_layout : {},
    runs_summary: runsSummary,
  };
}

async function loadMcpWorkflowFull(db, workflowKey, tenantId, workspaceId) {
  const row = await resolveMcpWorkflowRow(db, workflowKey, tenantId, workspaceId);
  if (!row?.id) return null;
  return db
    .prepare(`SELECT * FROM agentsam_mcp_workflows WHERE id = ? LIMIT 1`)
    .bind(row.id)
    .first()
    .catch(() => null);
}

async function loadWorkflowRunsSummary(db, workflowKey) {
  const key = String(workflowKey || '').trim();
  if (!key) return null;
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS run_count,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS success_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS fail_count,
         AVG(COALESCE(cost_usd, 0)) AS avg_cost_usd,
         SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS total_tokens
       FROM agentsam_workflow_runs
       WHERE workflow_key = ?`,
    )
    .bind(key)
    .first()
    .catch(() => null);
  if (!row) return null;
  const runCount = Number(row.run_count ?? 0);
  const successCount = Number(row.success_count ?? 0);
  const failCount = Number(row.fail_count ?? 0);
  return {
    run_count: runCount,
    success_count: successCount,
    fail_count: failCount,
    success_rate: runCount > 0 ? successCount / runCount : null,
    fail_rate: runCount > 0 ? failCount / runCount : null,
    avg_cost_usd: row.avg_cost_usd != null ? Number(row.avg_cost_usd) : null,
    total_tokens: Number(row.total_tokens ?? 0),
  };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} registryId
 * @param {string|null} tenantId
 * @param {string|null} workspaceId
 */
export async function requireWorkflowGraphContext(db, registryId, tenantId, workspaceId) {
  const bundle = await loadWorkflowGraphBundle(db, registryId, tenantId, workspaceId);
  if (!bundle) return { error: 'workflow not found', status: 404 };
  return { bundle };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} registryId
 * @param {Record<string, {x?: number, y?: number}>} positions
 */
export async function saveWorkflowCanvasLayout(
  db,
  registryId,
  positions,
  tenantId = null,
  workspaceId = null,
) {
  const ctx = await requireWorkflowGraphContext(db, registryId, tenantId, workspaceId);
  if (ctx.error) return { error: ctx.error, status: ctx.status };
  const dagId = ctx.bundle.dag_workflow_id;
  const entries = Object.entries(positions && typeof positions === 'object' ? positions : {});
  if (!entries.length) return { ok: true, dag_workflow_id: dagId, updated: 0 };

  let updated = 0;
  let usedNodeColumns = true;
  for (const [nodeKey, pos] of entries) {
    const x = Math.round(Number(pos?.x ?? 0));
    const y = Math.round(Number(pos?.y ?? 0));
    try {
      const res = await db
        .prepare(
          `UPDATE agentsam_workflow_nodes
           SET pos_x = ?, pos_y = ?, updated_at = datetime('now')
           WHERE workflow_id = ? AND node_key = ? AND COALESCE(is_active, 1) = 1`,
        )
        .bind(x, y, dagId, String(nodeKey))
        .run();
      updated += Number(res?.meta?.changes ?? res?.changes ?? 0);
    } catch {
      usedNodeColumns = false;
      break;
    }
  }

  if (!usedNodeColumns) {
    const workflow = await db
      .prepare(`SELECT id, metadata_json FROM agentsam_workflows WHERE id = ? LIMIT 1`)
      .bind(registryId)
      .first();
    if (!workflow) return { error: 'workflow not found', status: 404 };
    const meta = parseJsonObject(workflow.metadata_json);
    meta.canvas_layout = { ...(meta.canvas_layout || {}), ...positions };
    await db
      .prepare(
        `UPDATE agentsam_workflows SET metadata_json = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(JSON.stringify(meta), registryId)
      .run();
    return { ok: true, dag_workflow_id: dagId, canvas_layout: meta.canvas_layout, fallback: 'metadata_json' };
  }

  return { ok: true, dag_workflow_id: dagId, updated };
}

const ALLOWED_NODE_TYPES = new Set([
  'agent',
  'mcp_tool',
  'terminal',
  'db_query',
  'script',
  'eval',
  'branch',
  'approval_gate',
  'webhook',
  'trigger',
  'process',
  'output',
  'join',
  'retry',
  'parallel',
]);

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ registryId: string, dagWorkflowId: string, body: Record<string, unknown> }} opts
 */
export async function createWorkflowNode(db, opts) {
  const { registryId, dagWorkflowId, body } = opts;
  const nodeKey = String(body.node_key || '').trim();
  const title = String(body.title || body.display_name || nodeKey).trim();
  const nodeType = String(body.node_type || 'agent').trim();
  if (!nodeKey) return { error: 'node_key required', status: 400 };
  if (!ALLOWED_NODE_TYPES.has(nodeType)) {
    return { error: `invalid node_type: ${nodeType}`, status: 400 };
  }

  const existing = await db
    .prepare(
      `SELECT id FROM agentsam_workflow_nodes WHERE workflow_id = ? AND node_key = ? LIMIT 1`,
    )
    .bind(dagWorkflowId, nodeKey)
    .first();
  if (existing) return { error: 'node_key already exists', status: 409 };

  const sortRow = await db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order
       FROM agentsam_workflow_nodes WHERE workflow_id = ?`,
    )
    .bind(dagWorkflowId)
    .first();
  const sortOrder = body.sort_order != null ? Number(body.sort_order) : Number(sortRow?.next_order ?? 10);

  await db
    .prepare(
      `INSERT INTO agentsam_workflow_nodes (
        workflow_id, node_key, node_type, title, description, handler_key,
        input_schema_json, output_schema_json, timeout_ms, risk_level,
        requires_approval, is_active, sort_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?, ?, 1, ?, datetime('now'))`,
    )
    .bind(
      dagWorkflowId,
      nodeKey,
      nodeType,
      title || nodeKey,
      body.description != null ? String(body.description) : null,
      body.handler_key != null ? String(body.handler_key) : null,
      body.timeout_ms != null ? Number(body.timeout_ms) : 30000,
      body.risk_level != null ? String(body.risk_level) : 'low',
      body.requires_approval ? 1 : 0,
      sortOrder,
    )
    .run();

  return { ok: true, registry_id: registryId, dag_workflow_id: dagWorkflowId, node_key: nodeKey };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ dagWorkflowId: string, nodeKey: string, body: Record<string, unknown> }} opts
 */
export async function updateWorkflowNode(db, opts) {
  const { dagWorkflowId, nodeKey, body } = opts;
  const row = await db
    .prepare(
      `SELECT id FROM agentsam_workflow_nodes
       WHERE workflow_id = ? AND node_key = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
    )
    .bind(dagWorkflowId, nodeKey)
    .first();
  if (!row) return { error: 'node not found', status: 404 };

  const fields = [];
  const vals = [];
  const set = (col, val) => {
    fields.push(`${col} = ?`);
    vals.push(val);
  };
  if (body.title != null) set('title', String(body.title));
  if (body.description != null) set('description', String(body.description));
  if (body.node_type != null) {
    const nt = String(body.node_type);
    if (!ALLOWED_NODE_TYPES.has(nt)) return { error: `invalid node_type: ${nt}`, status: 400 };
    set('node_type', nt);
  }
  if (body.handler_key !== undefined) set('handler_key', body.handler_key ? String(body.handler_key) : null);
  if (body.sort_order != null) set('sort_order', Number(body.sort_order));
  if (body.risk_level != null) set('risk_level', String(body.risk_level));
  if (body.requires_approval != null) set('requires_approval', body.requires_approval ? 1 : 0);
  if (body.timeout_ms != null) set('timeout_ms', Number(body.timeout_ms));
  if (!fields.length) return { ok: true, node_key: nodeKey, unchanged: true };

  fields.push(`updated_at = datetime('now')`);
  vals.push(dagWorkflowId, nodeKey);
  await db
    .prepare(
      `UPDATE agentsam_workflow_nodes SET ${fields.join(', ')}
       WHERE workflow_id = ? AND node_key = ?`,
    )
    .bind(...vals)
    .run();
  return { ok: true, node_key: nodeKey };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ dagWorkflowId: string, nodeKey: string }} opts
 */
export async function deleteWorkflowNode(db, opts) {
  const { dagWorkflowId, nodeKey } = opts;
  const res = await db
    .prepare(
      `UPDATE agentsam_workflow_nodes SET is_active = 0, updated_at = datetime('now')
       WHERE workflow_id = ? AND node_key = ?`,
    )
    .bind(dagWorkflowId, nodeKey)
    .run();
  const changes = res?.meta?.changes ?? res?.changes ?? 0;
  if (!changes) return { error: 'node not found', status: 404 };
  await db
    .prepare(
      `DELETE FROM agentsam_workflow_edges
       WHERE workflow_id = ? AND (from_node_key = ? OR to_node_key = ?)`,
    )
    .bind(dagWorkflowId, nodeKey, nodeKey)
    .run()
    .catch(() => null);
  return { ok: true, node_key: nodeKey };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ dagWorkflowId: string, body: Record<string, unknown> }} opts
 */
export async function createWorkflowEdge(db, opts) {
  const { dagWorkflowId, body } = opts;
  const from = String(body.from_node_key || body.from || '').trim();
  const to = String(body.to_node_key || body.to || '').trim();
  if (!from || !to) return { error: 'from_node_key and to_node_key required', status: 400 };
  if (from === to) return { error: 'edge cannot loop to same node', status: 400 };

  const edgeId = `wedge_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const priority = body.priority != null ? Number(body.priority) : 0;
  await db
    .prepare(
      `INSERT INTO agentsam_workflow_edges (
        id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, label
      ) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`,
    )
    .bind(
      edgeId,
      dagWorkflowId,
      from,
      to,
      body.condition_type != null ? String(body.condition_type) : 'always',
      priority,
      body.label != null ? String(body.label) : null,
    )
    .run();
  return { ok: true, id: edgeId, from_node_key: from, to_node_key: to };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ dagWorkflowId: string, edgeId: string }} opts
 */
export async function deleteWorkflowEdge(db, opts) {
  const { dagWorkflowId, edgeId } = opts;
  const res = await db
    .prepare(`DELETE FROM agentsam_workflow_edges WHERE id = ? AND workflow_id = ?`)
    .bind(edgeId, dagWorkflowId)
    .run();
  const changes = res?.meta?.changes ?? res?.changes ?? 0;
  if (!changes) return { error: 'edge not found', status: 404 };
  return { ok: true, id: edgeId };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} registryId
 * @param {Record<string, unknown>} body
 */
export async function patchWorkflowRegistry(db, registryId, body) {
  const workflow = await db
    .prepare(`SELECT id FROM agentsam_workflows WHERE id = ? LIMIT 1`)
    .bind(registryId)
    .first();
  if (!workflow) return { error: 'workflow not found', status: 404 };

  const fields = [];
  const vals = [];
  if (body.display_name != null) {
    fields.push('display_name = ?');
    vals.push(String(body.display_name));
  }
  if (body.description !== undefined) {
    fields.push('description = ?');
    vals.push(body.description != null ? String(body.description) : null);
  }
  if (body.risk_level != null) {
    fields.push('risk_level = ?');
    vals.push(String(body.risk_level));
  }
  if (body.requires_approval != null) {
    fields.push('requires_approval = ?');
    vals.push(body.requires_approval ? 1 : 0);
  }
  if (!fields.length) return { ok: true, unchanged: true };
  fields.push(`updated_at = datetime('now')`);
  vals.push(registryId);
  await db
    .prepare(`UPDATE agentsam_workflows SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run();
  return { ok: true, id: registryId };
}
