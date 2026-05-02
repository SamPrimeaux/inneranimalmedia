/**
 * API Service: Model Context Protocol (MCP) Manager
 * Handles agent session tracking, tool registration listings, and intent-based routing.
 */
import { getAuthUser, jsonResponse, fetchAuthUserTenantId } from '../core/auth.js';
import { maxAgentsamWorkflowTimeoutSeconds } from '../core/agentsam-workflows.js';
import { AGENTSAM_WORKFLOW_RUNS_TABLE } from '../core/agentsam-supabase-sync.js';

const MCP_CARD_AGENT_IDS = [
  'mcp_agent_architect',
  'mcp_agent_builder',
  'mcp_agent_inspector',
  'mcp_agent_operator',
];

function normalizeMcpAgentId(agentId) {
  const s = String(agentId || '').trim();
  if (s === 'mcp_agent_tester') return 'mcp_agent_inspector';
  return s;
}

function resolveMcpTenantId(authUser, _env) {
  if (authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  return 'iam';
}

async function resolveWorkflowTimeoutSeconds(env, tenantId) {
  const fallback = 300;
  if (!env.DB) return fallback;
  try {
    return await maxAgentsamWorkflowTimeoutSeconds(env.DB, fallback, tenantId);
  } catch (_) {
    return fallback;
  }
}

function filterToolRowsByPanel(requestAgentId, rows) {
  if (!requestAgentId) return rows;
  const agent = String(requestAgentId).toLowerCase();
  if (agent === 'mcp_agent_architect') {
    return rows.filter((r) => ['github_repos', 'github_get_file', 'mcp_status'].includes(r.tool_name));
  }
  if (agent === 'mcp_agent_tester' || agent === 'mcp_agent_inspector') {
    return rows.filter((r) => ['playwright_run', 'cicd_status', 'mcp_status'].includes(r.tool_name));
  }
  return rows;
}

function parseLogsJson(raw) {
  if (raw == null || raw === '') return [];
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(j)) return j.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
    return [];
  } catch (_) {
    return [];
  }
}

function isSessionStale(row, timeoutSec) {
  const st = String(row?.status || '').toLowerCase();
  if (st !== 'running' && st !== 'active') return false;
  const la = row?.last_activity;
  const noActivity = la == null || String(la).trim() === '';
  const updatedAt = Number(row?.updated_at) || 0;
  const age = Math.floor(Date.now() / 1000) - updatedAt;
  const timedOut = updatedAt > 0 && age > timeoutSec;
  return noActivity || timedOut;
}

async function resolveAgentIdFromIntent(env, prompt) {
  let agentId = 'mcp_agent_builder';
  let routedBy = 'default';
  try {
    let patterns = { results: [] };
    try {
      patterns = await env.DB.prepare(
        'SELECT workflow_agent AS agent_id, triggers_json FROM agent_intent_patterns WHERE is_active=1'
      ).all();
    } catch (_) {
      patterns = await env.DB.prepare(
        'SELECT agent_id, triggers_json FROM agent_intent_patterns WHERE is_active=1'
      ).all();
    }
    const low = String(prompt || '').toLowerCase();
    outer: for (const p of patterns.results || []) {
      let triggers = [];
      try {
        triggers = JSON.parse(p.triggers_json || '[]');
      } catch (_) {}
      for (const t of triggers) {
        if (low.includes(String(t).toLowerCase())) {
          const rawAid = String(p.agent_id || '').trim();
          agentId = normalizeMcpAgentId(rawAid);
          if (!MCP_CARD_AGENT_IDS.includes(agentId)) agentId = 'mcp_agent_builder';
          routedBy = 'intent_pattern';
          break outer;
        }
      }
    }
  } catch (_) {}
  return { agentId, routedBy };
}

/**
 * Main dispatcher for MCP-related API routes (/api/mcp/*).
 */
export async function handleMcpApi(request, url, env, ctx) {
  const pathLower = url.pathname.replace(/\/$/, '').toLowerCase();
  const method = (request.method || 'GET').toUpperCase();

  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  try {
    if (pathLower === '/api/mcp/status' && method === 'GET') {
      return jsonResponse({ ok: true, service: 'mcp', status: 'connected' }, 200);
    }

    // ── Public-ish list of MCP servers (auth required, per sprint spec) ──────
    if (pathLower === '/api/mcp/servers' && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      try {
        const { results } = await env.DB.prepare(
          `SELECT id, service_name AS name, service_url AS url,
                  COALESCE(health_status, status, 'unknown') AS status,
                  COALESCE(tool_count, 0) AS tool_count
           FROM mcp_services
           ORDER BY COALESCE(updated_at, created_at) DESC
           LIMIT 200`,
        ).all().catch(() => ({ results: [] }));
        return jsonResponse({ servers: results || [] });
      } catch (_) {
        return jsonResponse({ servers: [] });
      }
    }

    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const tenantId = resolveMcpTenantId(authUser, env);

    // ── POST /api/mcp/invoke — dashboard proxy (session auth in, MCP token out)
    if (pathLower === '/api/mcp/invoke' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const toolName = String(body.tool_name || body.tool || '').trim();
      const args = body.arguments && typeof body.arguments === 'object' ? body.arguments : (body.params && typeof body.params === 'object' ? body.params : {});
      if (!toolName) return jsonResponse({ error: 'tool_name required' }, 400);

      const endpoint = String(env.MCP_SERVICE_URL || 'https://mcp.inneranimalmedia.com/mcp').trim();
      const token = env.MCP_AUTH_TOKEN ? String(env.MCP_AUTH_TOKEN).trim() : '';
      if (!token) return jsonResponse({ error: 'MCP_AUTH_TOKEN not configured' }, 503);

      // MCP JSON-RPC (tools/call)
      const rpcBody = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(rpcBody),
      });

      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        return jsonResponse({ error: out?.error || out?.message || res.statusText, status: res.status, raw: out }, 502);
      }
      if (out && out.error) return jsonResponse({ error: out.error }, 502);
      return jsonResponse(out?.result ?? out);
    }

    if (pathLower === '/api/mcp/server-allowlist' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM mcp_server_allowlist ORDER BY server_name ASC LIMIT 500'
      ).all();
      return jsonResponse({ allowlist: results || [] });
    }

    if (pathLower === '/api/mcp/credentials' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM mcp_service_credentials ORDER BY service_name ASC LIMIT 200'
      ).all();
      return jsonResponse({ credentials: results || [] });
    }

    if (pathLower === '/api/mcp/audit' && method === 'GET') {
      const lim = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10) || 200));
      const { results } = await env.DB.prepare(
        'SELECT * FROM mcp_audit_log ORDER BY created_at DESC LIMIT ?'
      ).bind(lim).all();
      return jsonResponse({ audit: results || [] });
    }

    if (pathLower === '/api/mcp/stats' && method === 'GET') {
      const lim = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10) || 200));
      const { results } = await env.DB.prepare(
        'SELECT * FROM mcp_tool_call_stats ORDER BY date DESC, call_count DESC LIMIT ?'
      ).bind(lim).all();
      return jsonResponse({ stats: results || [] });
    }

    // ── D1-driven agent status (latest row per agent_id for tenant) ─────────
    if (pathLower === '/api/mcp/agents/status' && method === 'GET') {
      const timeoutSec = await resolveWorkflowTimeoutSeconds(env, tenantId);
      let rows = [];
      try {
        const r = await env.DB.prepare(
          `SELECT id, agent_id, status, current_task, progress_pct, stage,
                  cost_usd, tool_calls_count, last_activity, updated_at, logs_json
             FROM mcp_agent_sessions
            WHERE tenant_id = ?
            ORDER BY updated_at DESC`
        ).bind(tenantId).all();
        rows = r.results || [];
      } catch (e) {
        return jsonResponse({ error: 'mcp_agent_sessions query failed', detail: String(e?.message || e) }, 500);
      }

      const latestByRaw = new Map();
      for (const row of rows) {
        const aid = String(row.agent_id || '');
        if (!aid || latestByRaw.has(aid)) continue;
        latestByRaw.set(aid, row);
      }

      const agents = MCP_CARD_AGENT_IDS.map((canonicalId) => {
        const row =
          latestByRaw.get(canonicalId) ||
          (canonicalId === 'mcp_agent_inspector' ? latestByRaw.get('mcp_agent_tester') : undefined);
        if (!row) {
          return {
            agent_id: canonicalId,
            session_id: null,
            status: 'idle',
            current_task: null,
            progress_pct: 0,
            stage: null,
            cost_usd: 0,
            tool_calls_count: 0,
            last_activity: null,
            updated_at: null,
            logs_json: [],
            is_stale: false,
          };
        }
        const mappedRow =
          canonicalId === 'mcp_agent_inspector' && String(row.agent_id) === 'mcp_agent_tester'
            ? { ...row, agent_id: 'mcp_agent_inspector' }
            : row;
        const isStale = isSessionStale(mappedRow, timeoutSec);
        return {
          agent_id: canonicalId,
          session_id: mappedRow.id,
          status: mappedRow.status ?? 'idle',
          current_task: mappedRow.current_task ?? null,
          progress_pct: Number(mappedRow.progress_pct) || 0,
          stage: mappedRow.stage ?? null,
          cost_usd: Number(mappedRow.cost_usd) || 0,
          tool_calls_count: Number(mappedRow.tool_calls_count) || 0,
          last_activity: mappedRow.last_activity ?? null,
          updated_at: mappedRow.updated_at != null ? Number(mappedRow.updated_at) : null,
          logs_json: parseLogsJson(mappedRow.logs_json),
          is_stale: isStale,
        };
      });

      return jsonResponse({ agents, timeout_seconds: timeoutSec });
    }

    if (pathLower === '/api/mcp/agents/reset' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const sessionId = String(body.id || body.session_id || '').trim();
      if (!sessionId) return jsonResponse({ error: 'id or session_id required' }, 400);
      try {
        const res = await env.DB.prepare(
          `UPDATE mcp_agent_sessions
              SET status = 'idle', current_task = NULL, stage = NULL, progress_pct = 0, updated_at = unixepoch()
            WHERE id = ? AND tenant_id = ?`
        ).bind(sessionId, tenantId).run();
        const changes = res?.meta?.changes ?? 0;
        return jsonResponse({ ok: true, updated: changes > 0 });
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
    }

    if (pathLower === '/api/mcp/agents/reset-all' && method === 'POST') {
      try {
        await env.DB.prepare(
          `UPDATE mcp_agent_sessions
              SET status = 'idle', current_task = NULL, stage = NULL, progress_pct = 0, updated_at = unixepoch()
            WHERE tenant_id = ?`
        ).bind(tenantId).run();
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
      try {
        await env.DB.prepare(
          `UPDATE ${AGENTSAM_WORKFLOW_RUNS_TABLE}
              SET status = 'cancelled', completed_at = unixepoch()
            WHERE tenant_id = ? AND status = 'running'`
        ).bind(tenantId).run();
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
      return jsonResponse({ ok: true });
    }

    if (pathLower === '/api/mcp/agents/dispatch' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const task = String(body.task || body.prompt || '').trim();
      if (!task) return jsonResponse({ error: 'task required' }, 400);
      let agentId = normalizeMcpAgentId(body.agent_id);
      if (!agentId || !MCP_CARD_AGENT_IDS.includes(agentId)) {
        const r = await resolveAgentIdFromIntent(env, task);
        agentId = r.agentId;
      }

      const sessionId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const nowIso = new Date().toISOString();
      const messagesJson = JSON.stringify([{ role: 'user', content: task }]);

      try {
        await env.DB.prepare(
          `INSERT INTO mcp_agent_sessions (id, agent_id, tenant_id, status, current_task, progress_pct, stage, logs_json, active_tools_json, cost_usd, messages_json, tool_calls_count, last_activity, created_at, updated_at)
               VALUES (?, ?, ?, 'running', ?, 0, 'queued', '[]', '[]', 0, ?, 1, ?, ?, ?)`
        ).bind(sessionId, agentId, tenantId, task, messagesJson, String(now), now, now).run();
      } catch (err) {
        return jsonResponse(
          { error: 'mcp_agent_sessions table missing or insert failed', detail: String(err?.message || err) },
          503
        );
      }

      try {
        await env.DB.prepare(
          `INSERT INTO mcp_tool_calls (id, tenant_id, session_id, tool_name, tool_category, input_schema, output, status, invoked_by, invoked_at, completed_at, created_at, updated_at, error_message, cost_usd, input_tokens, output_tokens)
               VALUES (?, ?, ?, 'mcp_dispatch', 'orchestration', '{}', '', 'pending', 'dashboard', ?, ?, ?, ?, NULL, 0, 0, 0)`
        ).bind(toolCallId, tenantId, sessionId, nowIso, nowIso, nowIso, nowIso).run();
      } catch (err) {
        console.warn('[mcp/agents/dispatch] mcp_tool_calls insert failed', err?.message ?? err);
      }

      return jsonResponse({ ok: true, session_id: sessionId, tool_call_id: toolCallId, agent_id: agentId });
    }

    if (pathLower === '/api/mcp/agents' && method === 'GET') {
      let rows = [];
      try {
        const stmt = env.DB.prepare(
          `SELECT a.id, a.name, a.role_name, a.tool_permissions_json, a.model_policy_json,
                  s.status, s.current_task, s.progress_pct, s.stage, s.logs_json, s.active_tools_json, s.cost_usd
                 FROM agentsam_ai a
                 LEFT JOIN mcp_agent_sessions s ON s.agent_id = a.id AND s.id = (
                   SELECT id FROM mcp_agent_sessions WHERE agent_id = a.id ORDER BY created_at DESC LIMIT 1
                 )
                 WHERE a.id IN ('mcp_agent_architect','mcp_agent_builder','mcp_agent_tester','mcp_agent_operator')
                 ORDER BY CASE a.id WHEN 'mcp_agent_architect' THEN 1 WHEN 'mcp_agent_builder' THEN 2 WHEN 'mcp_agent_tester' THEN 3 WHEN 'mcp_agent_operator' THEN 4 END`
        );
        const r = await stmt.all();
        rows = r.results || [];
      } catch (_) {
        const fallback = await env.DB.prepare(
          "SELECT id, name, role_name, tool_permissions_json, model_policy_json FROM agentsam_ai WHERE id IN ('mcp_agent_architect','mcp_agent_builder','mcp_agent_tester','mcp_agent_operator') ORDER BY CASE id WHEN 'mcp_agent_architect' THEN 1 WHEN 'mcp_agent_builder' THEN 2 WHEN 'mcp_agent_tester' THEN 3 WHEN 'mcp_agent_operator' THEN 4 END"
        )
          .all()
          .catch(() => ({ results: [] }));
        rows = (fallback.results || []).map((a) => ({
          ...a,
          status: 'idle',
          current_task: null,
          progress_pct: 0,
          stage: null,
          logs_json: '[]',
          active_tools_json: '[]',
          cost_usd: 0,
        }));
      }
      return jsonResponse({ agents: rows });
    }

    if (pathLower === '/api/mcp/tools' && method === 'GET') {
      const panelAgent = url.searchParams.get('agent_id');
      let tools = [];
      try {
        const r = await env.DB.prepare(
          'SELECT tool_name, description, tool_category FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name'
        ).all();
        const filtered = filterToolRowsByPanel(panelAgent, r.results || []);
        tools = filtered.map((t) => ({
          tool_name: t.tool_name,
          description: t.description || '',
          category: t.tool_category || 'execute',
        }));
      } catch (_) {
        try {
          const r = await env.DB.prepare(
            'SELECT tool_name, tool_category FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name'
          ).all();
          const filtered = filterToolRowsByPanel(panelAgent, r.results || []);
          tools = filtered.map((t) => ({
            tool_name: t.tool_name,
            description: '',
            category: t.tool_category || 'execute',
          }));
        } catch (__) {}
      }
      return jsonResponse({ tools });
    }

    const toolDetailMatch = pathLower.match(/^\/api\/mcp\/tools\/([^/]+)$/);
    if (toolDetailMatch && method === 'GET') {
      const toolName = decodeURIComponent(toolDetailMatch[1] || '').trim();
      if (!toolName) return jsonResponse({ error: 'tool_name required' }, 400);
      let row = null;
      try {
        row = await env.DB.prepare(`SELECT * FROM mcp_registered_tools WHERE tool_name = ? LIMIT 1`)
          .bind(toolName)
          .first();
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
      if (!row) return jsonResponse({ error: 'Tool not found' }, 404);
      return jsonResponse(row);
    }

    const toolConfigMatch = pathLower.match(/^\/api\/mcp\/tools\/([^/]+)\/config$/);
    if (toolConfigMatch && method === 'POST') {
      let tid = authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
      if (!tid) tid = await fetchAuthUserTenantId(env, authUser.id);
      const isSuper = Number(authUser.is_superadmin) === 1;
      if (!tid && !isSuper) return jsonResponse({ error: 'Tenant required' }, 403);

      const toolName = decodeURIComponent(toolConfigMatch[1] || '').trim();
      if (!toolName) return jsonResponse({ error: 'tool_name required' }, 400);
      const body = await request.json().catch(() => ({}));
      if (!body || typeof body !== 'object') return jsonResponse({ error: 'JSON body required' }, 400);

      const existing = await env.DB.prepare(
        `SELECT tool_name FROM mcp_registered_tools WHERE tool_name = ? LIMIT 1`,
      )
        .bind(toolName)
        .first();
      if (!existing) return jsonResponse({ error: 'Tool not found' }, 404);

      const sets = [];
      const binds = [];
      const push = (col, val) => {
        sets.push(`${col} = ?`);
        binds.push(val);
      };
      if (body.tool_category != null) push('tool_category', String(body.tool_category));
      if (body.mcp_service_url != null) push('mcp_service_url', String(body.mcp_service_url));
      if (body.description != null) push('description', String(body.description));
      if (body.input_schema != null) {
        const s =
          typeof body.input_schema === 'string'
            ? body.input_schema
            : JSON.stringify(body.input_schema);
        push('input_schema', s);
      }
      if (body.requires_approval != null) {
        const n = Number(body.requires_approval);
        push('requires_approval', Number.isFinite(n) ? n : body.requires_approval ? 1 : 0);
      }
      if (body.enabled != null) {
        const n = Number(body.enabled);
        push('enabled', Number.isFinite(n) ? n : body.enabled ? 1 : 0);
      }

      if (sets.length === 0) return jsonResponse({ error: 'No allowed fields to update' }, 400);
      sets.push('updated_at = unixepoch()');
      binds.push(toolName);
      try {
        await env.DB.prepare(
          `UPDATE mcp_registered_tools SET ${sets.join(', ')} WHERE tool_name = ?`,
        )
          .bind(...binds)
          .run();
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
      const updated = await env.DB.prepare(`SELECT * FROM mcp_registered_tools WHERE tool_name = ? LIMIT 1`)
        .bind(toolName)
        .first();
      return jsonResponse({ ok: true, tool: updated });
    }

    if (pathLower === '/api/mcp/commands' && method === 'GET') {
      let rows = [];
      try {
        const r = await env.DB.prepare(
          'SELECT * FROM mcp_command_suggestions ORDER BY is_pinned DESC, sort_order ASC'
        ).all();
        rows = r.results || [];
      } catch (_) {}
      return jsonResponse({ suggestions: rows });
    }

    if (pathLower === '/api/mcp/dispatch' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const prompt = String(body.prompt || '').trim();
      if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

      const { agentId: resolvedId, routedBy } = await resolveAgentIdFromIntent(env, prompt);
      let agentId = normalizeMcpAgentId(resolvedId);
      if (!MCP_CARD_AGENT_IDS.includes(agentId)) agentId = 'mcp_agent_builder';
      const names = {
        mcp_agent_architect: 'Architect',
        mcp_agent_builder: 'Builder',
        mcp_agent_tester: 'Inspector',
        mcp_agent_inspector: 'Inspector',
        mcp_agent_operator: 'Operator',
      };
      const agentName = names[agentId] || 'Builder';

      const sessionId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const nowIso = new Date().toISOString();
      const messagesJson = JSON.stringify([{ role: 'user', content: prompt }]);
      try {
        await env.DB.prepare(
          `INSERT INTO mcp_agent_sessions (id, agent_id, tenant_id, status, current_task, progress_pct, stage, logs_json, active_tools_json, cost_usd, messages_json, tool_calls_count, last_activity, created_at, updated_at)
               VALUES (?, ?, ?, 'running', ?, 0, 'queued', '[]', '[]', 0, ?, 1, ?, ?, ?)`
        ).bind(sessionId, agentId, tenantId, prompt, messagesJson, String(now), now, now).run();
      } catch (err) {
        return jsonResponse(
          { error: 'mcp_agent_sessions table missing or insert failed', detail: String(err?.message || err) },
          503
        );
      }
      try {
        await env.DB.prepare(
          `INSERT INTO mcp_tool_calls (id, tenant_id, session_id, tool_name, tool_category, input_schema, output, status, invoked_by, invoked_at, completed_at, created_at, updated_at, error_message, cost_usd, input_tokens, output_tokens)
               VALUES (?, ?, ?, 'mcp_dispatch', 'orchestration', '{}', '', 'pending', 'dashboard', ?, ?, ?, ?, NULL, 0, 0, 0)`
        ).bind(toolCallId, tenantId, sessionId, nowIso, nowIso, nowIso, nowIso).run();
      } catch (err) {
        console.warn('[mcp/dispatch] mcp_tool_calls insert failed', err?.message ?? err);
      }
      return jsonResponse({
        ok: true,
        session_id: sessionId,
        agent_id: agentId,
        agent_name: agentName,
        routed_by: routedBy,
      });
    }

    return jsonResponse({ error: 'MCP route not found' }, 404);
  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}
