import { parseRange, analyticsResponse } from './sources/normalize.js';
import { pragmaTableInfo, tableExists } from '../../core/retention.js';

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function d1All(db, label, sql, binds, warnings) {
  if (!db) return [];
  try {
    const { results } = await db.prepare(sql).bind(...binds).all();
    return results || [];
  } catch (e) {
    warnings.push({ code: 'D1_QUERY_ERROR', message: `${label}: ${String(e?.message || e)}`, severity: 'warn' });
    return [];
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function d1First(db, label, sql, binds, warnings) {
  if (!db) return null;
  try {
    return await db.prepare(sql).bind(...binds).first();
  } catch (e) {
    warnings.push({ code: 'D1_QUERY_ERROR', message: `${label}: ${String(e?.message || e)}`, severity: 'warn' });
    return null;
  }
}

function depRangeClause(range, col = 'created_at') {
  if (range === '24h') return `${col} >= unixepoch('now', '-24 hours')`;
  if (range === '30d') return `${col} >= unixepoch('now', '-30 days')`;
  if (range === 'all') return `${col} >= unixepoch('now', '-3650 days')`;
  return `${col} >= unixepoch('now', '-7 days')`;
}

/**
 * GET /api/analytics/agent/graph — workflow nodes + edges (D1).
 * Optional: ?workflow_id= — otherwise picks the active workflow with the most nodes in tenant scope.
 */
export async function handleAgentAnalyticsGraph(request, url, env, { tenantId, workspaceId }) {
  void request;
  const range = parseRange(url);
  const warnings = [];
  const db = env?.DB || null;
  const tid = tenantId && String(tenantId).trim() ? String(tenantId).trim() : null;
  const wid = workspaceId && String(workspaceId).trim() ? String(workspaceId).trim() : null;
  const workflowIdParam = (url.searchParams.get('workflow_id') || '').trim() || null;

  if (!db) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[analytics.agent.graph] no D1 binding on env (expected DB in production)');
    }
    return analyticsResponse({
      ok: true,
      backend: 'd1',
      range,
      summary: { state: 'EMPTY', workflow: null, nodes: [], edges: [], node_count: 0, edge_count: 0 },
      rows: [],
      warnings,
    });
  }

  const wfMetaCols = await pragmaTableInfo(db, 'agentsam_workflows');
  const hasNodes = await tableExists(db, 'agentsam_workflow_nodes');
  const hasEdges = await tableExists(db, 'agentsam_workflow_edges');
  if (!hasNodes || !hasEdges) {
    return analyticsResponse({
      ok: true,
      backend: 'd1',
      range,
      summary: { state: 'EMPTY', workflow: null, nodes: [], edges: [], node_count: 0, edge_count: 0 },
      rows: [],
      warnings,
    });
  }

  const wfWhere = [`COALESCE(w.is_active, 1) = 1`];
  const wfBinds = [];
  if (tid && wfMetaCols.has('tenant_id')) {
    if (wfMetaCols.has('is_platform_global')) {
      wfWhere.push(`(w.tenant_id = ? OR COALESCE(w.is_platform_global, 0) = 1)`);
      wfBinds.push(tid);
    } else {
      wfWhere.push(`(w.tenant_id = ? OR w.tenant_id IS NULL)`);
      wfBinds.push(tid);
    }
  }
  if (wid && wfMetaCols.has('workspace_id')) {
    wfWhere.push(`(w.workspace_id = ? OR w.workspace_id IS NULL)`);
    wfBinds.push(wid);
  }
  const wfWhereSql = wfWhere.join(' AND ');

  let selectedId = workflowIdParam;
  if (!selectedId) {
    const pick = await d1First(
      db,
      'graph_pick',
      `SELECT w.id AS workflow_id
       FROM agentsam_workflows w
       LEFT JOIN agentsam_workflow_nodes n ON n.workflow_id = w.id AND COALESCE(n.is_active, 1) = 1
       WHERE ${wfWhereSql}
       GROUP BY w.id
       ORDER BY COUNT(DISTINCT n.id) DESC, w.display_name ASC
       LIMIT 1`,
      wfBinds,
      warnings,
    );
    selectedId = pick?.workflow_id ? String(pick.workflow_id) : null;
  }

  if (!selectedId) {
    return analyticsResponse({
      ok: true,
      backend: 'd1',
      range,
      summary: {
        state: 'EMPTY',
        workflow: null,
        nodes: [],
        edges: [],
        meta: { tenantId: tid, workspaceId: wid, requestedWorkflowId: workflowIdParam },
      },
      rows: [],
      warnings,
    });
  }

  const workflow = await d1First(
    db,
    'graph_wf',
    `SELECT * FROM agentsam_workflows WHERE id = ? LIMIT 1`,
    [selectedId],
    warnings,
  );

  const nodes = await d1All(
    db,
    'graph_nodes',
    `SELECT * FROM agentsam_workflow_nodes
     WHERE workflow_id = ? AND COALESCE(is_active, 1) = 1
     ORDER BY sort_order ASC, node_key ASC`,
    [selectedId],
    warnings,
  );

  const edges = await d1All(
    db,
    'graph_edges',
    `SELECT * FROM agentsam_workflow_edges
     WHERE workflow_id = ?
     ORDER BY priority ASC, from_node_key ASC, to_node_key ASC`,
    [selectedId],
    warnings,
  );

  const rowEdges = edges.map((e) => ({
    from: e.from_node_key,
    to: e.to_node_key,
    condition_type: e.condition_type,
    priority: e.priority,
    label: e.label,
  }));

  return analyticsResponse({
    ok: true,
    backend: 'd1',
    range,
    summary: {
      state: 'LIVE',
      workflow: workflow || { id: selectedId },
      nodes,
      edges,
      node_count: nodes.length,
      edge_count: edges.length,
      meta: { tenantId: tid, workspaceId: wid },
    },
    rows: rowEdges,
    warnings,
  });
}

/**
 * GET /api/analytics/agent/dependencies — agentsam_execution_dependency_graph (D1).
 */
export async function handleAgentAnalyticsDependencies(request, url, env, { tenantId, workspaceId }) {
  void request;
  const range = parseRange(url);
  const warnings = [];
  const db = env?.DB || null;
  const tid = tenantId && String(tenantId).trim() ? String(tenantId).trim() : null;
  const wid = workspaceId && String(workspaceId).trim() ? String(workspaceId).trim() : null;

  if (!db) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[analytics.agent.dependencies] no D1 binding on env (expected DB in production)');
    }
    return analyticsResponse({
      ok: true,
      backend: 'd1',
      range,
      summary: { state: 'EMPTY', row_count: 0 },
      rows: [],
      warnings,
    });
  }

  if (!(await tableExists(db, 'agentsam_execution_dependency_graph'))) {
    return analyticsResponse({
      ok: true,
      backend: 'd1',
      range,
      summary: { state: 'EMPTY', row_count: 0 },
      rows: [],
      warnings,
    });
  }

  const depCols = await pragmaTableInfo(db, 'agentsam_execution_dependency_graph');
  const timeCol = depCols.has('created_at') ? 'created_at' : null;
  const where = [];
  const binds = [];
  if (timeCol) {
    where.push(depRangeClause(range, timeCol));
  } else {
    where.push('1=1');
  }
  if (tid && depCols.has('tenant_id')) {
    where.push('tenant_id = ?');
    binds.push(tid);
  }
  if (wid && depCols.has('workspace_id')) {
    where.push('workspace_id = ?');
    binds.push(wid);
  }
  const whereSql = where.join(' AND ');

  const rows = await d1All(
    db,
    'dep_graph',
    `SELECT * FROM agentsam_execution_dependency_graph
     WHERE ${whereSql}
     ORDER BY rowid DESC
     LIMIT 200`,
    binds,
    warnings,
  );

  return analyticsResponse({
    ok: true,
    backend: 'd1',
    range,
    summary: {
      state: rows.length ? 'LIVE' : 'EMPTY',
      row_count: rows.length,
      meta: { tenantId: tid, workspaceId: wid },
    },
    rows,
    warnings,
  });
}
