/**
 * API: Model Context Protocol (MCP)
 * Manages agent sessions, tool listings, audit logs, and intent-based dispatch.
 * Routes: /api/mcp/*
 *
 * Public:  GET  /api/mcp/status
 * Auth:    all other routes require getAuthUser
 */

import { getAuthUser, tenantIdFromEnv } from '../core/auth.js';
import { jsonResponse } from '../core/responses.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function handleMcpApi(request, url, env, ctx) {
  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const path   = url.pathname.toLowerCase().replace(/\/$/, '');
  const method = request.method.toUpperCase();

  // ── Public: status ────────────────────────────────────────────────────────
  if (path === '/api/mcp/status' && method === 'GET') {
    return jsonResponse({ ok: true, service: 'mcp', status: 'connected' });
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  try {

    // ── GET /api/mcp/server-allowlist ───────────────────────────────────────
    if (path === '/api/mcp/server-allowlist' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM mcp_server_allowlist ORDER BY server_name ASC LIMIT 500`
      ).all();
      return jsonResponse({ allowlist: results || [] });
    }

    // ── GET /api/mcp/credentials ────────────────────────────────────────────
    if (path === '/api/mcp/credentials' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM mcp_service_credentials ORDER BY service_name ASC LIMIT 200`
      ).all();
      return jsonResponse({ credentials: results || [] });
    }

    // ── GET /api/mcp/audit ──────────────────────────────────────────────────
    if (path === '/api/mcp/audit' && method === 'GET') {
      const limit = clampLimit(url.searchParams.get('limit'), 200, 500);
      const { results } = await env.DB.prepare(
        `SELECT * FROM mcp_audit_log ORDER BY created_at DESC LIMIT ?`
      ).bind(limit).all();
      return jsonResponse({ audit: results || [] });
    }

    // ── GET /api/mcp/stats ──────────────────────────────────────────────────
    if (path === '/api/mcp/stats' && method === 'GET') {
      const limit = clampLimit(url.searchParams.get('limit'), 200, 500);
      const { results } = await env.DB.prepare(
        `SELECT * FROM mcp_tool_call_stats ORDER BY date DESC, call_count DESC LIMIT ?`
      ).bind(limit).all();
      return jsonResponse({ stats: results || [] });
    }

    // ── GET /api/mcp/agents ─────────────────────────────────────────────────
    // Reads all active agents from agentsam_ai — no hardcoded IDs.
    if (path === '/api/mcp/agents' && method === 'GET') {
      const { results: agents } = await env.DB.prepare(
        `SELECT a.id, a.name, a.role_name, a.tool_permissions_json, a.model_policy_json,
                s.status, s.current_task, s.progress_pct, s.stage,
                s.logs_json, s.active_tools_json, s.cost_usd
         FROM agentsam_ai a
         LEFT JOIN mcp_agent_sessions s ON s.agent_id = a.id
           AND s.id = (
             SELECT id FROM mcp_agent_sessions
             WHERE agent_id = a.id
             ORDER BY created_at DESC LIMIT 1
           )
         WHERE a.is_active = 1
         ORDER BY a.sort_order ASC, a.name ASC`
      ).all();

      return jsonResponse({
        agents: (agents || []).map(a => ({
          ...a,
          status:           a.status           || 'idle',
          current_task:     a.current_task     || null,
          progress_pct:     a.progress_pct     || 0,
          stage:            a.stage            || null,
          logs_json:        a.logs_json        || '[]',
          active_tools_json: a.active_tools_json || '[]',
          cost_usd:         a.cost_usd         || 0,
        })),
      });
    }

    // ── GET /api/mcp/tools ──────────────────────────────────────────────────
    if (path === '/api/mcp/tools' && method === 'GET') {
      const agentId = url.searchParams.get('agent_id') || null;

      let query = `SELECT tool_name, description, tool_category
                   FROM mcp_registered_tools
                   WHERE enabled = 1`;
      const binds = [];

      // If agent_id provided, filter to tools that agent is allowed to use
      // via agentsam_subagent_profile.allowed_tool_globs (stored in agentsam_ai)
      if (agentId) {
        const agentRow = await env.DB.prepare(
          `SELECT tool_permissions_json FROM agentsam_ai WHERE id = ? AND is_active = 1 LIMIT 1`
        ).bind(agentId).first().catch(() => null);

        if (agentRow?.tool_permissions_json) {
          let allowed = [];
          try { allowed = JSON.parse(agentRow.tool_permissions_json); } catch {}
          if (Array.isArray(allowed) && allowed.length > 0) {
            const placeholders = allowed.map(() => '?').join(',');
            query += ` AND tool_name IN (${placeholders})`;
            binds.push(...allowed);
          }
        }
      }

      query += ` ORDER BY tool_name`;

      const stmt     = env.DB.prepare(query);
      const { results } = binds.length > 0
        ? await stmt.bind(...binds).all()
        : await stmt.all();

      return jsonResponse({
        tools: (results || []).map(t => ({
          tool_name:   t.tool_name,
          description: t.description || '',
          category:    t.tool_category || 'execute',
        })),
      });
    }

    // ── GET /api/mcp/commands ───────────────────────────────────────────────
    if (path === '/api/mcp/commands' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM mcp_command_suggestions
         ORDER BY is_pinned DESC, sort_order ASC`
      ).all().catch(() => ({ results: [] }));
      return jsonResponse({ suggestions: results || [] });
    }

    // ── POST /api/mcp/dispatch ──────────────────────────────────────────────
    // Routes a prompt to the correct agent based on intent patterns in D1.
    if (path === '/api/mcp/dispatch' && method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}

      const prompt = String(body.prompt || '').trim();
      if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400);

      // Intent routing — reads patterns from agent_intent_patterns table
      let agentId  = null;
      let routedBy = 'default';

      const { results: patterns } = await env.DB.prepare(
        `SELECT workflow_agent AS agent_id, triggers_json
         FROM agent_intent_patterns
         WHERE is_active = 1`
      ).all().catch(() => ({ results: [] }));

      const lower = prompt.toLowerCase();
      for (const pattern of patterns || []) {
        let triggers = [];
        try { triggers = JSON.parse(pattern.triggers_json || '[]'); } catch {}
        if (triggers.some(t => lower.includes(String(t).toLowerCase()))) {
          agentId  = pattern.agent_id;
          routedBy = 'intent_pattern';
          break;
        }
      }

      // Fall back to default agent from DB if no pattern matched
      if (!agentId) {
        const defaultAgent = await env.DB.prepare(
          `SELECT id FROM agentsam_ai WHERE is_active = 1 AND is_default = 1 LIMIT 1`
        ).first().catch(() => null);
        agentId = defaultAgent?.id || null;
      }

      if (!agentId) return jsonResponse({ error: 'No active agent found' }, 503);

      const agentRow = await env.DB.prepare(
        `SELECT id, name FROM agentsam_ai WHERE id = ? LIMIT 1`
      ).bind(agentId).first().catch(() => null);

      const sessionId    = crypto.randomUUID();
      const now          = Math.floor(Date.now() / 1000);
      const messagesJson = JSON.stringify([{ role: 'user', content: prompt }]);

      await env.DB.prepare(
        `INSERT INTO mcp_agent_sessions
           (id, agent_id, tenant_id, status, current_task, progress_pct,
            stage, logs_json, active_tools_json, cost_usd, messages_json,
            created_at, updated_at)
         VALUES (?, ?, ?, 'running', ?, 0, 'queued', '[]', '[]', 0, ?, ?, ?)`
      ).bind(
        sessionId, agentId,
        tenantIdFromEnv(env) || 'iam',
        prompt, messagesJson, now, now
      ).run();

      return jsonResponse({
        ok:         true,
        session_id: sessionId,
        agent_id:   agentId,
        agent_name: agentRow?.name || agentId,
        routed_by:  routedBy,
      });
    }

    // ── POST /api/mcp/invoke ────────────────────────────────────────────────
    if (path === '/api/mcp/invoke' && method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}

      const toolName = body.tool_name;
      const params   = body.params || {};

      if (!toolName) return jsonResponse({ error: 'tool_name is required' }, 400);

      // Verify tool is registered and enabled
      const tool = await env.DB.prepare(
        `SELECT * FROM mcp_registered_tools WHERE tool_name = ? AND enabled = 1 LIMIT 1`
      ).bind(toolName).first().catch(() => null);

      if (!tool) return jsonResponse({ error: `Tool not found or disabled: ${toolName}` }, 404);

      // Audit log
      const auditId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO mcp_audit_log
           (id, tool_name, user_id, params_json, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind(auditId, toolName, authUser.id, JSON.stringify(params))
        .run().catch(() => {});

      // Route to internal tool handler
      const origin = (env.IAM_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');
      const resp   = await fetch(`${origin}/api/tools/${toolName}`, {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'X-Internal-Secret': env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({ params, user_id: authUser.id }),
      });

      const result = await resp.json().catch(() => ({ error: 'Tool handler returned invalid JSON' }));
      return jsonResponse({ ok: resp.ok, tool_name: toolName, result });
    }

    return jsonResponse({ error: 'MCP route not found' }, 404);

  } catch (err) {
    console.error('[handleMcpApi]', err.message);
    return jsonResponse({ error: err.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampLimit(raw, defaultVal, max) {
  const n = parseInt(raw || String(defaultVal), 10);
  return Math.min(max, Math.max(1, isNaN(n) ? defaultVal : n));
}
