/**
 * Branded MCP catalog + lane inference for Agent Sam chat and GET /api/mcp/tools/catalog.
 *
 * Reads v_agentsam_mcp_tools_branded when present; falls back to agentsam_mcp_tools list queries.
 * See agentsam-mcp-tools.js for scoped workspace matching on the base table.
 */

import { selectAgentsamMcpToolsList } from './agentsam-mcp-tools.js';

/** @typedef {{ userId?: string|null, tenantId?: string|null, workspaceId?: string|null, personUuid?: string|null }} McpRuntimeScope */

const LANES = new Set([
  'design',
  'develop',
  'inspect',
  'research',
  'think',
  'integrate',
  'operate',
  'admin',
  'observe',
  'general',
]);

/**
 * Map user message + routing hints to a single capability_lane for catalog filtering.
 * @param {string} [message]
 * @param {string} [intentSlug]
 * @param {string} [taskType]
 * @param {string} [modeSlug]
 */
export function inferMcpCapabilityLane(message, intentSlug, taskType, modeSlug) {
  const m = String(message || '').toLowerCase();
  const intent = String(intentSlug || '').toLowerCase();
  const tt = String(taskType || '').toLowerCase();
  const mode = String(modeSlug || '').toLowerCase();

  if (/\b(bill|invoice|subscription|stripe|tenant admin|workspace admin)\b/i.test(m)) return 'admin';
  if (/\b(metric|log|trace|datadog|sentry|telemetry|health)\b/i.test(m)) return 'observe';
  if (/\b(workflow|orchestrat|cron|queue|deploy prod|promote)\b/i.test(m)) return 'operate';
  if (/\b(webhook|integration|slack|zapier|api key|oauth)\b/i.test(m)) return 'integrate';
  if (/\b(figma|cms|theme|layout|brand|draw|excalidraw|design)\b/i.test(m) || tt === 'cms_edit') return 'design';
  if (
    /\b(browser|playwright|screenshot|inspect dom|devtools|lighthouse)\b/i.test(m) ||
    tt === 'debug' ||
    intent === 'debug'
  ) {
    return 'inspect';
  }
  if (/\b(remember|recall|rag|search docs|embedding|context)\b/i.test(m) || tt === 'summary') return 'research';
  if (
    /\b(sql|d1|database|github|terminal|wrangler|npm|code|diff|patch|refactor)\b/i.test(m) ||
    ['code', 'sql_d1_generation', 'terminal_execution', 'deploy', 'tool_use'].includes(tt)
  ) {
    return 'develop';
  }
  if (mode === 'ask' || tt === 'chat' || tt === 'plan') return 'think';
  return 'develop';
}

/**
 * Max tools passed to the model after family/capability filters (not DB fetch limit).
 * @param {string} [taskType]
 * @param {string} [modeSlug]
 */
export function maxModelToolsForAgentTask(taskType, modeSlug) {
  const tt = String(taskType || '').toLowerCase();
  const mode = String(modeSlug || '').toLowerCase();
  if (mode === 'ask' && (tt === 'chat' || tt === 'summary' || !tt)) return 4;
  if (tt === 'debug' || tt === 'tool_use') return 8;
  if (tt === 'mcp_panel') return 24;
  if (['code', 'sql_d1_generation', 'terminal_execution', 'deploy', 'cms_edit'].includes(tt)) return 12;
  if (tt === 'plan') return 6;
  return 8;
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ lane?: string|null, limit?: number, includeSchema?: boolean }} opts
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function queryBrandedMcpCatalog(db, opts = {}) {
  if (!db) return [];
  const laneRaw = opts.lane != null ? String(opts.lane).trim().toLowerCase() : '';
  const lane = LANES.has(laneRaw) ? laneRaw : '';
  const lim = Math.max(1, Math.min(200, Number(opts.limit) || 48));
  const includeSchema = opts.includeSchema !== false;

  const schemaCol = includeSchema ? 'input_schema,' : '';
  const sql = `
SELECT
  id,
  tool_name,
  tool_category,
  handler_type,
  handler_brand,
  capability_lane,
  safety_badge,
  description,
  ${schemaCol}
  risk_level,
  requires_approval,
  enabled,
  sort_priority,
  schema_hint,
  avg_latency_ms,
  failure_rate
FROM v_agentsam_mcp_tools_branded
WHERE enabled = 1
  AND (? = '' OR capability_lane = ?)
ORDER BY capability_lane, handler_brand, requires_approval ASC, sort_priority ASC, tool_name ASC
LIMIT ?`;

  try {
    const { results } = await db.prepare(sql).bind(lane, lane, lim).all();
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[mcp-tools-branded] v_agentsam_mcp_tools_branded', e?.message ?? e);
    return [];
  }
}

/**
 * Scoped tool names enabled for this workspace (for intersecting branded catalog).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {McpRuntimeScope} runtimeCtx
 * @param {number} [limit]
 */
export async function selectScopedMcpToolNames(db, runtimeCtx, limit = 500) {
  if (!db) return [];
  const lim = Math.max(1, Math.min(800, Number(limit) || 500));
  const userId = runtimeCtx?.userId != null ? String(runtimeCtx.userId).trim() : '';
  const personUuid = runtimeCtx?.personUuid != null ? String(runtimeCtx.personUuid).trim() : '';
  const tenantId = runtimeCtx?.tenantId != null ? String(runtimeCtx.tenantId).trim() : '';
  const workspaceId = runtimeCtx?.workspaceId != null ? String(runtimeCtx.workspaceId).trim() : '';

  const sql = `
SELECT DISTINCT tool_name
FROM agentsam_mcp_tools
WHERE COALESCE(enabled, 0) = 1
  AND COALESCE(is_active, 0) = 1
  AND COALESCE(is_degraded, 0) = 0
  AND (
    (?1 != '' AND user_id = ?1)
    OR (?2 != '' AND person_uuid = ?2)
    OR (?3 != '' AND tenant_id = ?3)
    OR (?4 != '' AND workspace_id = ?4)
    OR (?5 != '' AND instr(COALESCE(workspace_scope, ''), ?5) > 0)
    OR (
      trim(COALESCE(user_id, '')) = ''
      AND trim(COALESCE(person_uuid, '')) = ''
      AND trim(COALESCE(tenant_id, '')) = ''
      AND trim(COALESCE(workspace_id, '')) = ''
    )
  )
ORDER BY tool_name ASC
LIMIT ?6`;

  try {
    const { results } = await db
      .prepare(sql)
      .bind(userId, personUuid, tenantId, workspaceId, workspaceId, lim)
      .all();
    const names = (results || []).map((r) => String(r.tool_name || '').trim()).filter(Boolean);
    return names;
  } catch (e) {
    console.warn('[mcp-tools-branded] selectScopedMcpToolNames', e?.message ?? e);
    return [];
  }
}

/**
 * Optional union of allowed tool names from active mcp_workspace_tokens rows.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} workspaceId
 * @param {string} tenantId
 * @returns {Promise<Set<string>|null>} null = no restriction
 */
export async function loadWorkspaceTokenAllowedToolNames(db, workspaceId, tenantId) {
  const ws = String(workspaceId || '').trim();
  const tn = String(tenantId || '').trim();
  if (!db || !ws || !tn) return null;
  try {
    const { results } = await db
      .prepare(
        `SELECT allowed_tools FROM mcp_workspace_tokens
         WHERE workspace_id = ? AND tenant_id = ? AND COALESCE(is_active, 0) = 1
           AND allowed_tools IS NOT NULL AND trim(allowed_tools) != ''
         LIMIT 20`,
      )
      .bind(ws, tn)
      .all();
    const out = new Set();
    for (const r of results || []) {
      const raw = r?.allowed_tools;
      if (raw == null || raw === '') continue;
      let arr = [];
      try {
        const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
        arr = Array.isArray(j) ? j : [];
      } catch {
        continue;
      }
      for (const x of arr) {
        const n = String(x || '').trim();
        if (n) out.add(n);
      }
    }
    return out.size ? out : null;
  } catch (e) {
    console.warn('[mcp-tools-branded] workspace token allowed_tools', e?.message ?? e);
    return null;
  }
}

/**
 * Merge branded view rows + workspace scope + token policy into chat tool rows
 * (same shape as selectAgentsamMcpToolsList).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {McpRuntimeScope} runtimeCtx
 * @param {{ lane?: string, catalogLimit?: number, outputLimit?: number, message?: string, intentSlug?: string, taskType?: string, modeSlug?: string }} opts
 */
export async function selectMcpToolsForChatRuntime(db, runtimeCtx, opts = {}) {
  const outputLimit = Math.max(1, Math.min(200, Number(opts.outputLimit) || 20));
  const catalogLimit = Math.max(outputLimit, Math.min(200, Number(opts.catalogLimit) || 48));
  const lane =
    opts.lane ||
    inferMcpCapabilityLane(opts.message, opts.intentSlug, opts.taskType, opts.modeSlug);

  const branded = await queryBrandedMcpCatalog(db, {
    lane,
    limit: catalogLimit,
    includeSchema: true,
  });

  const scopedNames = await selectScopedMcpToolNames(db, runtimeCtx, 600);
  const scoped = new Set(scopedNames);
  const ws = runtimeCtx?.workspaceId != null ? String(runtimeCtx.workspaceId).trim() : '';
  const tn = runtimeCtx?.tenantId != null ? String(runtimeCtx.tenantId).trim() : '';
  const tokenAllow = await loadWorkspaceTokenAllowedToolNames(db, ws, tn);

  const toRow = (r) => ({
    tool_name: String(r.tool_name || '').trim(),
    description: String(r.description || ''),
    input_schema: r.input_schema,
    tool_category: String(r.tool_category || 'mcp'),
    requires_approval: Number(r.requires_approval || 0) === 1 ? 1 : 0,
  });

  let candidates = [];
  if (branded.length) {
    for (const r of branded) {
      const name = String(r.tool_name || '').trim();
      if (!name) continue;
      if (scoped.size && !scoped.has(name)) continue;
      if (tokenAllow && !tokenAllow.has(name)) continue;
      candidates.push(toRow(r));
    }
  }

  if (!candidates.length) {
    return selectAgentsamMcpToolsList(db, runtimeCtx, outputLimit);
  }

  candidates = candidates.slice(0, outputLimit);
  return candidates;
}
