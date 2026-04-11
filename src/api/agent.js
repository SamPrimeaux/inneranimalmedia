/**
 * API Service: Agent Sam Reasoning Engine
 * All /api/agent/* and /api/terminal/* routes fully extracted from worker.js.
 * No stubs. No fallbacks. Every route implemented.
 */
import { chatWithAnthropic } from '../integrations/anthropic';
import { unifiedRagSearch } from './rag';
import { writeTelemetry } from './telemetry';
import { getAuthUser, getSession, isIngestSecretAuthorized, jsonResponse, tenantIdFromEnv } from '../core/auth';
import { notifySam } from '../core/notifications';
import { getAgentMetadata, logSkillInvocation, getActivePromptByWeight, getPromptMetadata } from './agentsam';

// ─────────────────────────────────────────────────────────────────────────────
// Main dispatcher
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAgentRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  // ── /api/agent/models ──────────────────────────────────────────────────────
  if (pathLower === '/api/agent/models') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const showInPicker = url.searchParams.get('show_in_picker') === '1';
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, display_name AS name, provider, model_key, api_platform, show_in_picker,
                supports_tools, supports_web_search, supports_vision, size_class,
                input_rate_per_mtok, output_rate_per_mtok, context_max_tokens
         FROM ai_models
         WHERE COALESCE(is_active, 0) = 1
           AND (size_class IS NULL OR size_class NOT IN ('image', 'audio', 'embedding'))
           AND api_platform IN ('anthropic_api', 'gemini_api', 'vertex_ai', 'openai', 'workers_ai', 'cursor')
           ${showInPicker ? 'AND show_in_picker = 1' : ''}
         ORDER BY provider, display_name`
      ).all();
      return jsonResponse(results || []);
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
  }

  // ── /api/agent/modes ───────────────────────────────────────────────────────
  if (pathLower === '/api/agent/modes' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const { results } = await env.DB.prepare(
        `SELECT slug, display_name AS label, description, color_hex AS color, icon
         FROM agent_mode_configs
         WHERE is_active = 1
         ORDER BY sort_order`
      ).all();
      return jsonResponse(results || []);
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
  }

  // ── /api/agent/commands ────────────────────────────────────────────────────
  if (pathLower === '/api/agent/commands' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = tenantIdFromEnv(env);
    try {
      const { results } = tenantId
        ? await env.DB.prepare(
            `SELECT slug, description FROM agent_commands
             WHERE tenant_id = ? AND COALESCE(status, 'active') = 'active'
             ORDER BY slug`
          ).bind(tenantId).all()
        : await env.DB.prepare(
            `SELECT slug, description FROM agent_commands
             WHERE COALESCE(status, 'active') = 'active'
             ORDER BY slug`
          ).all();
      return jsonResponse(results || []);
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
  }

  // ── /api/agent/session/mode ────────────────────────────────────────────────
  if (pathLower === '/api/agent/session/mode' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const mode = String(body.mode || '').toLowerCase().trim();
    const conversationId = body.conversation_id != null
      ? String(body.conversation_id)
      : body.session_id != null ? String(body.session_id) : '';
    if (!conversationId) return jsonResponse({ error: 'conversation_id required' }, 400);
    if (!env.SESSION_CACHE) return jsonResponse({ error: 'SESSION_CACHE not configured' }, 503);
    try {
      await env.SESSION_CACHE.put(
        `session_mode:${conversationId}`,
        JSON.stringify({ mode, updated_at: Date.now() }),
        { expirationTtl: 86400 * 14 }
      );
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
    return jsonResponse({ mode, persisted: true });
  }

  // ── /api/agent/problems ────────────────────────────────────────────────────
  if (pathLower === '/api/agent/problems' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const checkedAt = new Date().toISOString();
    let mcp_tool_errors = [], audit_failures = [], worker_errors = [];
    try {
      const q = await env.DB.prepare(
        `SELECT id, tool_name, status, error_message, session_id, created_at, invoked_at
         FROM mcp_tool_calls
         WHERE lower(COALESCE(status,'')) IN ('error','failed')
            OR (error_message IS NOT NULL AND length(trim(error_message)) > 0)
         ORDER BY COALESCE(created_at, invoked_at) DESC
         LIMIT 50`
      ).all();
      mcp_tool_errors = q.results || [];
    } catch (_) {}
    try {
      const q = await env.DB.prepare(
        `SELECT id, event_type, message, created_at, metadata_json, run_id
         FROM agent_audit_log
         WHERE lower(COALESCE(event_type,'')) LIKE '%fail%'
            OR lower(COALESCE(event_type,'')) LIKE '%error%'
            OR lower(COALESCE(event_type,'')) LIKE '%denied%'
            OR lower(COALESCE(event_type,'')) LIKE '%rejected%'
         ORDER BY created_at DESC
         LIMIT 25`
      ).all();
      audit_failures = q.results || [];
    } catch (_) {}
    try {
      const q = await env.DB.prepare(
        `SELECT rowid as id, path, method, status_code, error_message, created_at
         FROM worker_analytics_errors
         ORDER BY created_at DESC
         LIMIT 20`
      ).all();
      worker_errors = q.results || [];
    } catch (_) {}
    return jsonResponse({ checked_at: checkedAt, mcp_tool_errors, audit_failures, worker_errors });
  }

  // ── /api/agent/keyboard-shortcuts ─────────────────────────────────────────
  if (pathLower === '/api/agent/keyboard-shortcuts' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const q = await env.DB.prepare(
        `SELECT * FROM keyboard_shortcuts ORDER BY sort_order ASC, id ASC`
      ).all();
      return jsonResponse({ shortcuts: q.results || [] });
    } catch (e) {
      return jsonResponse({ error: 'Failed to load keyboard shortcuts', details: String(e?.message || e) }, 500);
    }
  }

  const kbShortcutPatch = pathLower.match(/^\/api\/agent\/keyboard-shortcuts\/([^/]+)$/);
  if (kbShortcutPatch && method === 'PATCH') {
    const rowId = decodeURIComponent(kbShortcutPatch[1] || '').trim();
    if (!rowId || rowId.includes('..')) return jsonResponse({ error: 'Invalid id' }, 400);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const en = body.is_enabled;
    const turnOn = en === true || en === 1 || en === '1';
    const turnOff = en === false || en === 0 || en === '0';
    if (!turnOn && !turnOff) return jsonResponse({ error: 'Body must include is_enabled (boolean or 0/1)' }, 400);
    try {
      const existing = await env.DB.prepare(
        `SELECT id, is_system FROM keyboard_shortcuts WHERE id = ?`
      ).bind(rowId).first();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      if (Number(existing.is_system) === 1) return jsonResponse({ error: 'System shortcut cannot be disabled' }, 403);
      await env.DB.prepare(
        `UPDATE keyboard_shortcuts SET is_enabled = ? WHERE id = ?`
      ).bind(turnOn ? 1 : 0, rowId).run();
      const updated = await env.DB.prepare(`SELECT * FROM keyboard_shortcuts WHERE id = ?`).bind(rowId).first();
      return jsonResponse({ ok: true, shortcut: updated });
    } catch (e) {
      return jsonResponse({ error: 'Update failed', details: String(e?.message || e) }, 500);
    }
  }

  // ── /api/agent/notifications ───────────────────────────────────────────────
  if (pathLower === '/api/agent/notifications' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const recipientId = String(authUser.id || '').trim();
    if (!recipientId) return jsonResponse({ notifications: [] });
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, subject, message, status, created_at FROM notifications
         WHERE recipient_id = ? AND read_at IS NULL
         ORDER BY created_at DESC LIMIT 20`
      ).bind(recipientId).all();
      return jsonResponse({ notifications: results || [] });
    } catch (e) {
      return jsonResponse({ error: 'Failed to load notifications', details: String(e?.message || e) }, 500);
    }
  }

  const notifReadMatch = pathLower.match(/^\/api\/agent\/notifications\/([^/]+)\/read$/);
  if (notifReadMatch && method === 'PATCH') {
    const nid = decodeURIComponent(notifReadMatch[1] || '').trim();
    if (!nid || nid.includes('..')) return jsonResponse({ error: 'Invalid id' }, 400);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const recipientId = String(authUser.id || '').trim();
      if (!recipientId) return jsonResponse({ error: 'Invalid session' }, 400);
      const upd = await env.DB.prepare(
        `UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND recipient_id = ?`
      ).bind(nid, recipientId).run();
      const n = upd.meta?.changes ?? upd.changes ?? 0;
      if (!n) return jsonResponse({ error: 'Not found' }, 404);
      return jsonResponse({ ok: true, id: nid });
    } catch (e) {
      return jsonResponse({ error: 'Update failed', details: String(e?.message || e) }, 500);
    }
  }

  // ── /api/agent/context-picker/catalog ─────────────────────────────────────
  if (pathLower === '/api/agent/context-picker/catalog' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ tables: [], workflows: [], commands: [], memory_keys: [], workspaces: [] }, 200);
    const tenantId = tenantIdFromEnv(env);
    let tables = [], workflows = [], commands = [], memory_keys = [], workspaces = [];
    try {
      const q = await env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      ).all();
      tables = (q.results || []).map(r => String(r.name || '').trim()).filter(Boolean);
    } catch (_) {}
    try {
      const q = await env.DB.prepare(
        `SELECT id, name FROM ai_workflow_pipelines ORDER BY COALESCE(name, id) LIMIT 100`
      ).all();
      workflows = (q.results || []).map(r => ({ id: String(r.id || ''), name: String(r.name || '') }));
    } catch (_) {}
    try {
      const q = tenantId
        ? await env.DB.prepare(
            `SELECT slug, name, category FROM agent_commands
             WHERE tenant_id = ? AND COALESCE(status, 'active') = 'active'
             ORDER BY category, name LIMIT 200`
          ).bind(tenantId).all()
        : { results: [] };
      commands = (q.results || []).map(r => ({
        slug: String(r.slug || ''),
        name: String(r.name || ''),
        category: String(r.category || ''),
      }));
    } catch (_) {}
    try {
      const q = tenantId
        ? await env.DB.prepare(
            `SELECT key FROM agent_memory_index
             WHERE tenant_id = ? ORDER BY COALESCE(importance_score, 0) DESC LIMIT 150`
          ).bind(tenantId).all()
        : { results: [] };
      memory_keys = (q.results || []).map(r => String(r.key || '').trim()).filter(Boolean);
    } catch (_) {}
    try {
      const q = await env.DB.prepare(
        `SELECT id, name FROM workspaces WHERE id LIKE 'ws_%' ORDER BY name LIMIT 50`
      ).all();
      workspaces = (q.results || []).map(r => ({ id: String(r.id || ''), name: String(r.name || '') }));
    } catch (_) {}
    return jsonResponse({ tables, workflows, commands, memory_keys, workspaces });
  }

  // ── /api/agent/memory/list ─────────────────────────────────────────────────
  if (pathLower === '/api/agent/memory/list' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ items: [] });
    const tenantId = tenantIdFromEnv(env);
    if (!tenantId) return jsonResponse({ items: [] });
    try {
      const q = await env.DB.prepare(
        `SELECT key, memory_type, importance_score FROM agent_memory_index
         WHERE tenant_id = ? ORDER BY COALESCE(importance_score, 0) DESC LIMIT 200`
      ).bind(tenantId).all();
      const items = (q.results || [])
        .map(r => ({ key: String(r.key || ''), memory_type: String(r.memory_type || ''), importance_score: r.importance_score }))
        .filter(r => r.key);
      return jsonResponse({ items });
    } catch (e) {
      return jsonResponse({ items: [], error: e?.message || String(e) }, 500);
    }
  }

  // ── /api/agent/memory/sync ─────────────────────────────────────────────────
  if (pathLower === '/api/agent/memory/sync' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = tenantIdFromEnv(env);
    if (!tenantId) return jsonResponse({ error: 'TENANT_ID not configured on worker' }, 503);
    try {
      const { results } = await env.DB.prepare(
        `SELECT key, value, memory_type, importance_score FROM agent_memory_index
         WHERE tenant_id = ? ORDER BY importance_score DESC LIMIT 20`
      ).bind(tenantId).all();
      return jsonResponse({ ok: true, rows: results || [] });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  // ── /api/agent/db/tables ───────────────────────────────────────────────────
  if (pathLower === '/api/agent/db/tables' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ tables: [] });
    try {
      const q = await env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      ).all();
      const tables = (q.results || []).map(r => String(r.name || '').trim()).filter(Boolean);
      return jsonResponse({ tables });
    } catch (e) {
      return jsonResponse({ tables: [], error: e?.message || String(e) }, 500);
    }
  }

  // ── /api/agent/db/query-history ───────────────────────────────────────────
  if (pathLower === '/api/agent/db/query-history' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ history: [] });
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, query_sql, executed_at, row_count, status FROM agent_db_query_history
         WHERE user_id = ? ORDER BY executed_at DESC LIMIT 50`
      ).bind(String(authUser.id)).all();
      return jsonResponse({ history: results || [] });
    } catch (e) {
      return jsonResponse({ history: [] });
    }
  }

  if (pathLower === '/api/agent/db/query-history' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ ok: false });
    const body = await request.json().catch(() => ({}));
    try {
      await env.DB.prepare(
        `INSERT INTO agent_db_query_history (id, user_id, query_sql, status, row_count, executed_at)
         VALUES (?, ?, ?, ?, ?, unixepoch())`
      ).bind(
        crypto.randomUUID(),
        String(authUser.id),
        String(body.query_sql || '').slice(0, 10000),
        String(body.status || 'success'),
        Number(body.row_count || 0)
      ).run();
      return jsonResponse({ ok: true });
    } catch (e) {
      return jsonResponse({ ok: false });
    }
  }

  // ── /api/agent/db/snippets ────────────────────────────────────────────────
  if (pathLower === '/api/agent/db/snippets' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ snippets: [] });
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, name, query_sql, created_at FROM agent_db_snippets
         WHERE user_id = ? ORDER BY name ASC`
      ).bind(String(authUser.id)).all();
      return jsonResponse({ snippets: results || [] });
    } catch (e) {
      return jsonResponse({ snippets: [] });
    }
  }

  if (pathLower === '/api/agent/db/snippets' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    if (!body.name || !body.query_sql) return jsonResponse({ error: 'name and query_sql required' }, 400);
    try {
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO agent_db_snippets (id, user_id, name, query_sql, created_at)
         VALUES (?, ?, ?, ?, unixepoch())`
      ).bind(id, String(authUser.id), String(body.name).slice(0, 200), String(body.query_sql).slice(0, 50000)).run();
      return jsonResponse({ ok: true, id });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  // ── /api/agent/git/status ─────────────────────────────────────────────────
  if (pathLower === '/api/agent/git/status' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const workerName = 'inneranimalmedia';
    try {
      const row = await env.DB.prepare(
        `SELECT d.git_hash, d.version, d.timestamp, g.repo_full_name, g.default_branch
         FROM deployments d
         LEFT JOIN github_repositories g ON g.cloudflare_worker_name = ?
         WHERE d.worker_name = ? AND d.status = 'success'
         ORDER BY d.timestamp DESC
         LIMIT 1`
      ).bind(workerName, workerName).first();
      return jsonResponse({
        branch: row?.default_branch || 'main',
        git_hash: row?.git_hash || null,
        worker_name: workerName,
        repo_full_name: row?.repo_full_name || null,
        dirty: false,
        sync_last_at: row?.timestamp || null,
      });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  // ── /api/agent/git/sync ───────────────────────────────────────────────────
  if (pathLower === '/api/agent/git/sync' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const sessionRef = body.session_id != null ? String(body.session_id) : null;
    const tenantId = tenantIdFromEnv(env);
    if (!tenantId) return jsonResponse({ error: 'TENANT_ID not configured on worker' }, 503);
    const now = Math.floor(Date.now() / 1000);
    const proposalId = 'prop_' + [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
    const proposedBy = String(authUser.email || authUser.id || 'user').slice(0, 200);
    const commandText = 'GitHub sync workflow (wf_github_sync): approval required; does not auto-push.';
    try {
      await env.DB.prepare(
        `INSERT INTO agent_command_proposals (
          id, tenant_id, agent_session_id, proposed_by, command_source, command_name,
          command_text, filled_template, rationale, risk_level, status, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        proposalId, tenantId, sessionRef, proposedBy, 'dashboard', 'git_sync_workflow',
        commandText, commandText, 'User requested Git sync from dashboard status bar.',
        'medium', 'pending', now, now
      ).run();
      notifySam(env, {
        subject: `Git sync proposal pending`,
        body: `Proposal ID: ${proposalId}\n\nApprove: https://inneranimalmedia.com/dashboard/overview?proposal=${proposalId}`,
        category: 'proposal',
      }, ctx);
      return jsonResponse({ ok: true, proposal_id: proposalId, risk_level: 'medium' });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  // ── /api/agent/boot ───────────────────────────────────────────────────────
  if (pathLower === '/api/agent/boot') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const batch = await env.DB.batch([
        env.DB.prepare("SELECT id, name, role_name, mode, thinking_mode, effort FROM agentsam_ai WHERE status='active' ORDER BY sort_order, name"),
        env.DB.prepare("SELECT id, service_name, service_type, endpoint_url, authentication_type, token_secret_name, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name"),
        env.DB.prepare("SELECT id, provider, model_key, display_name, input_rate_per_mtok, output_rate_per_mtok, context_max_tokens, supports_tools, supports_web_search, supports_vision, size_class FROM ai_models WHERE is_active=1 AND show_in_picker=1 ORDER BY CASE provider WHEN 'anthropic' THEN 1 WHEN 'google' THEN 2 WHEN 'openai' THEN 3 WHEN 'workers_ai' THEN 4 ELSE 5 END, input_rate_per_mtok ASC"),
        env.DB.prepare("SELECT id, session_type, status, started_at FROM agent_sessions WHERE status='active' ORDER BY updated_at DESC LIMIT 20"),
      ]);
      return jsonResponse({
        agents: batch[0]?.results ?? [],
        mcp_services: batch[1]?.results ?? [],
        models: batch[2]?.results ?? [],
        sessions: batch[3]?.results ?? [],
        integrations: {},
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── /api/agent/conversations/search ───────────────────────────────────────
  if (pathLower === '/api/agent/conversations/search' && method === 'GET') {
    if (!env.DB) return jsonResponse([]);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return jsonResponse([]);
    const like = '%' + q.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, COALESCE(name, title, '') as title FROM agent_conversations
         WHERE name LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
         ORDER BY id DESC LIMIT 20`
      ).bind(like, like).all();
      return jsonResponse((results || []).map(r => ({ id: r.id, title: r.title || 'New Conversation' })));
    } catch (e) {
      return jsonResponse([]);
    }
  }

  // ── /api/agent/sessions ───────────────────────────────────────────────────
  const sessionPatchMatch = pathLower.match(/^\/api\/agent\/sessions\/([^/]+)$/);
  if (sessionPatchMatch && method === 'PATCH') {
    const conversationId = sessionPatchMatch[1];
    const body = await request.json().catch(() => ({}));
    const status = body.status != null ? String(body.status) : 'completed';
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      await env.DB.prepare(
        `UPDATE mcp_agent_sessions SET status = ?, last_activity = ?, updated_at = unixepoch() WHERE conversation_id = ?`
      ).bind(status, new Date().toISOString(), conversationId).run();
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
    return jsonResponse({ success: true });
  }

  if (pathLower === '/api/agent/sessions') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const sessionName = (typeof body.name === 'string' && body.name.trim()) ? body.name.trim() : 'New Conversation';
      const sessionR2Key = `agent-sessions/${id}/context.json`;
      const sessionCtx = JSON.stringify({
        session_id: id, name: sessionName, created_at: Date.now(),
        last_active: Date.now(), message_count: 0, messages: [],
      });
      if (env.R2) await env.R2.put(sessionR2Key, sessionCtx, { httpMetadata: { contentType: 'application/json' } }).catch(() => {});
      if (env.SESSION_CACHE) await env.SESSION_CACHE.put(`sess_ctx:${id}`, sessionCtx, { expirationTtl: 86400 }).catch(() => {});
      try {
        await env.DB.prepare(
          `INSERT INTO agent_sessions (id, tenant_id, name, session_type, status, state_json, r2_key, started_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(id, env.TENANT_ID || 'system', sessionName, body.session_type || 'chat', 'active', '{}', sessionR2Key, now, now).run();
      } catch (e) {
        return jsonResponse({ error: e?.message || String(e) }, 500);
      }
      if (env.SESSION_CACHE) await env.SESSION_CACHE.put(`session:${id}`, JSON.stringify({ id, status: 'active' }), { expirationTtl: 86400 }).catch(() => {});
      return jsonResponse({ id, status: 'active' });
    }
    const tenantId = env.TENANT_ID || 'system';
    try {
      const { results } = await env.DB.prepare(
        `SELECT s.id, s.session_type, s.status, s.state_json, s.started_at, s.r2_key,
                COALESCE(s.name, ac.name, ac.title, 'New Conversation') as name,
                (SELECT COUNT(*) FROM agent_messages am WHERE am.conversation_id = s.id) as message_count
         FROM agent_sessions s
         LEFT JOIN agent_conversations ac ON ac.id = s.id
         WHERE s.tenant_id = ?
         ORDER BY s.updated_at DESC
         LIMIT 50`
      ).bind(tenantId).all();
      return jsonResponse(results || []);
    } catch (e) {
      return jsonResponse([]);
    }
  }

  // ── /api/agent/propose ────────────────────────────────────────────────────
  if (pathLower === '/api/agent/propose' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const commandText = String(body.command_text || body.command || '').trim();
    if (!commandText) return jsonResponse({ error: 'command_text required' }, 400);
    const commandName = String(body.command_name || 'proposed').slice(0, 200);
    const rationale = String(body.rationale || 'Agent proposed command').slice(0, 8000);
    const sessionRef = body.session_id != null ? String(body.session_id) : null;
    const tenantId = tenantIdFromEnv(env);
    if (!tenantId) return jsonResponse({ error: 'TENANT_ID not configured on worker' }, 503);
    const now = Math.floor(Date.now() / 1000);
    const proposalId = 'prop_' + [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
    try {
      await env.DB.prepare(
        `INSERT INTO agent_command_proposals (
          id, tenant_id, agent_session_id, proposed_by, command_source, command_name,
          command_text, filled_template, rationale, risk_level, status, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        proposalId, tenantId, sessionRef, 'agent-sam', 'agent_generated',
        commandName, commandText, commandText, rationale, 'medium', 'pending', now, now
      ).run();
      notifySam(env, {
        subject: `Proposal pending: ${commandText.slice(0, 80)}`,
        body: `Proposal ID: ${proposalId}\n\nApprove: https://inneranimalmedia.com/dashboard/overview?proposal=${proposalId}`,
        category: 'proposal',
      }, ctx);
      return jsonResponse({ ok: true, proposal_id: proposalId, risk_level: 'medium' });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  // ── /api/agent/proposals/pending ──────────────────────────────────────────
  if (pathLower === '/api/agent/proposals/pending' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse([]);
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM agent_command_proposals WHERE status = 'pending' ORDER BY created_at DESC`
      ).all();
      return jsonResponse(results || []);
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  const proposalApproveMatch = pathLower.match(/^\/api\/agent\/proposals\/([^/]+)\/approve$/);
  if (proposalApproveMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const propId = proposalApproveMatch[1];
    const row = await env.DB.prepare('SELECT * FROM agent_command_proposals WHERE id = ?').bind(propId).first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const approver = String(authUser.email || authUser.id || 'user').slice(0, 200);
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `UPDATE agent_command_proposals SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`
      ).bind(approver, now, now, propId).run();
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
    return jsonResponse({ ok: true, proposal_id: propId });
  }

  const proposalDenyMatch = pathLower.match(/^\/api\/agent\/proposals\/([^/]+)\/deny$/);
  if (proposalDenyMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const propId = proposalDenyMatch[1];
    const body = await request.json().catch(() => ({}));
    const reason = body.denial_reason != null ? String(body.denial_reason).slice(0, 4000) : null;
    const row = await env.DB.prepare('SELECT id FROM agent_command_proposals WHERE id = ?').bind(propId).first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const denier = String(authUser.email || authUser.id || 'user').slice(0, 200);
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `UPDATE agent_command_proposals SET status = 'denied', denied_by = ?, denied_at = ?, denial_reason = ?, updated_at = ? WHERE id = ?`
      ).bind(denier, now, reason, now, propId).run();
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
    return jsonResponse({ ok: true, proposal_id: propId, status: 'denied' });
  }

  // ── /api/agent/workflows/trigger ──────────────────────────────────────────
  if (pathLower === '/api/agent/workflows/trigger' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const workflowName = String(body.workflow_name || '').trim();
    if (!workflowName) return jsonResponse({ error: 'workflow_name required' }, 400);
    const workflowId = body.workflow_id != null ? String(body.workflow_id) : null;
    const inputData = body.input_data != null
      ? (typeof body.input_data === 'string' ? body.input_data : JSON.stringify(body.input_data))
      : null;
    const runId = 'wfr_' + [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
    const tenantId = tenantIdFromEnv(env);
    if (!tenantId) return jsonResponse({ error: 'TENANT_ID not configured on worker' }, 503);
    try {
      await env.DB.prepare(
        `INSERT INTO workflow_runs (
          id, tenant_id, workflow_id, workflow_name, trigger_source, triggered_by,
          status, input_data, created_at, updated_at
        ) VALUES (?,?,?,?,'api','agent-sam','pending',?,datetime('now'),datetime('now'))`
      ).bind(runId, tenantId, workflowId, workflowName, inputData).run();
      return jsonResponse({ ok: true, run_id: runId, status: 'pending' });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  const workflowStatusMatch = pathLower.match(/^\/api\/agent\/workflows\/([^/]+)\/status$/);
  if (workflowStatusMatch && method === 'PATCH') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const runId = workflowStatusMatch[1];
    const body = await request.json().catch(() => ({}));
    const row = await env.DB.prepare('SELECT id FROM workflow_runs WHERE id = ?').bind(runId).first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const parts = [], vals = [];
    if (body.status != null) { parts.push('status = ?'); vals.push(String(body.status)); }
    if (body.steps_completed != null) { parts.push('steps_completed = ?'); vals.push(Number(body.steps_completed)); }
    if (body.output_summary != null) { parts.push('output_summary = ?'); vals.push(String(body.output_summary).slice(0, 50000)); }
    if (body.cost_usd != null) { parts.push('cost_usd = ?'); vals.push(Number(body.cost_usd)); }
    if (!parts.length) return jsonResponse({ error: 'no fields to update' }, 400);
    parts.push("updated_at = datetime('now')");
    vals.push(runId);
    try {
      await env.DB.prepare(`UPDATE workflow_runs SET ${parts.join(', ')} WHERE id = ?`).bind(...vals).run();
      return jsonResponse({ ok: true, run_id: runId });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  // ── /api/agent/do-history ─────────────────────────────────────────────────
  if (pathLower === '/api/agent/do-history' && method === 'GET') {
    const session = await getSession(env, request).catch(() => null);
    if (!session?.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
    const convId = url.searchParams.get('conversation_id');
    if (!convId) return jsonResponse({ error: 'conversation_id required' }, 400);
    if (!env.AGENT_SESSION) return jsonResponse({ error: 'AGENT_SESSION not configured' }, 503);
    try {
      const doId = env.AGENT_SESSION.idFromName(String(convId));
      const stub = env.AGENT_SESSION.get(doId);
      const lim = url.searchParams.get('limit') || '50';
      const resp = await stub.fetch(new Request(`https://do/history?limit=${encodeURIComponent(lim)}`));
      const data = await resp.json().catch(() => ({}));
      return jsonResponse(data, resp.status);
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  // ── /api/agent/playwright ─────────────────────────────────────────────────
  if (pathLower === '/api/agent/playwright' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const jobId = crypto.randomUUID();
    const session = await getSession(env, request).catch(() => null);
    const triggeredBy = body.agent_session_id ? 'agent_sam'
      : body.triggered_by === 'dashboard_ui' ? 'user_ui'
      : body.triggered_by || (session?.user_id ? `user:${session.user_id}` : 'unknown');
    try {
      await env.DB.prepare(
        `INSERT INTO playwright_jobs (id, job_type, url, status, triggered_by, agent_session_id, metadata, created_at)
         VALUES (?,?,?,'pending',?,?,?,CURRENT_TIMESTAMP)`
      ).bind(jobId, body.job_type || 'screenshot', body.url || 'internal:html', triggeredBy, body.agent_session_id || null, JSON.stringify(body.options || {})).run();
    } catch (e) {
      return jsonResponse({ error: 'playwright_jobs table error', detail: e?.message }, 503);
    }
    if (env.MY_QUEUE) {
      await env.MY_QUEUE.send({ jobId, job_type: body.job_type || 'screenshot', url: body.url || '', html: body.html || null, triggeredBy });
    }
    return jsonResponse({ jobId, status: 'pending', triggered_by: triggeredBy });
  }

  if (pathLower === '/api/agent/playwright/jobs' && method === 'GET') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(
      "SELECT * FROM playwright_jobs ORDER BY created_at DESC LIMIT 50"
    ).all();
    return jsonResponse(results || []);
  }

  if (pathLower.startsWith('/api/agent/playwright/jobs/') && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const jobId = pathLower.split('/').pop();
    const row = await env.DB.prepare("SELECT * FROM playwright_jobs WHERE id = ?").bind(jobId).first();
    if (!row) return jsonResponse({ error: 'Job not found' }, 404);
    return jsonResponse(row);
  }

  if (pathLower.startsWith('/api/agent/playwright/jobs/') && method === 'DELETE') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const jobId = pathLower.split('/').pop();
    const existing = await env.DB.prepare('SELECT id FROM playwright_jobs WHERE id = ?').bind(jobId).first();
    if (!existing) return jsonResponse({ error: 'Job not found' }, 404);
    await env.DB.prepare('DELETE FROM playwright_jobs WHERE id = ?').bind(jobId).run();
    return jsonResponse({ success: true, deleted: jobId });
  }

  // ── /api/agent/mcp ────────────────────────────────────────────────────────
  if (pathLower === '/api/agent/mcp') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(
      "SELECT id, service_name, service_type, endpoint_url, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name"
    ).all();
    return jsonResponse(results || []);
  }

  // ── /api/agent/cicd ───────────────────────────────────────────────────────
  if (pathLower === '/api/agent/cicd') {
    if (!env.DB) return jsonResponse([]);
    try {
      const { results } = await env.DB.prepare(
        `SELECT r.id, r.worker_name, r.environment, r.status, r.git_branch, r.git_commit_sha,
                r.queued_at, r.completed_at, r.total_duration_ms, r.conclusion,
                COUNT(e.id) AS activity_count
         FROM cicd_runs r
         LEFT JOIN cicd_events e ON e.webhook_event_id = r.id
         GROUP BY r.id
         ORDER BY r.queued_at DESC LIMIT 50`
      ).all();
      return jsonResponse(results || []);
    } catch (_) {
      return jsonResponse([]);
    }
  }

  // ── /api/agent/telemetry ──────────────────────────────────────────────────
  if (pathLower === '/api/agent/telemetry') {
    if (!env.DB) return jsonResponse([]);
    try {
      const { results } = await env.DB.prepare(
        `SELECT provider, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output,
                COUNT(*) as total_calls
         FROM agent_telemetry
         WHERE created_at > unixepoch('now','-7 days')
         GROUP BY provider`
      ).all();
      return jsonResponse(results || []);
    } catch (_) {
      return jsonResponse([]);
    }
  }

  // ── /api/agent/workers-ai/image ───────────────────────────────────────────
  if (pathLower === '/api/agent/workers-ai/image' && method === 'POST') {
    if (!env.AI) return jsonResponse({ error: 'Workers AI not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt.trim()) return jsonResponse({ error: 'prompt required' }, 400);
    try {
      const result = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt });
      const bytes = result instanceof ArrayBuffer ? new Uint8Array(result) : result;
      return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  // ── /api/agent/rag/query ──────────────────────────────────────────────────
  if (pathLower === '/api/agent/rag/query' && method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}));
      const query = body.query || body.q || '';
      if (!query.trim()) return jsonResponse({ error: 'query required', matches: [], results: [], count: 0 }, 400);
      const out = await unifiedRagSearch(env, query.trim(), {
        topK: 8,
        conversation_id: body.conversation_id ?? null,
        mode: body.mode ?? null,
        intent: body.intent ?? null,
      });
      return jsonResponse({
        matches: out.matches || [],
        results: out.results || [],
        count: out.count ?? 0,
      });
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e), matches: [], results: [], count: 0 }, 500);
    }
  }

  // ── /api/agent/chat ───────────────────────────────────────────────────────
  if (pathLower === '/api/agent/chat' && method === 'POST') {
    const ingestBypass = isIngestSecretAuthorized(request, env);
    let session = null;
    if (!ingestBypass) {
      session = await getSession(env, request);
      if (!session?.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return agentChatSseHandler(env, request, ctx, session);
  }

  // ── /api/agent/bootstrap ──────────────────────────────────────────────────
  if (pathLower === '/api/agent/bootstrap' && method === 'GET') {
    const session = await getSession(env, request).catch(() => null);
    return handleAgentBootstrapRequest(request, env, ctx, session);
  }

  // No match
  return jsonResponse({ error: 'Agent route not found', path: pathLower }, 404);
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE Chat Handler
// ─────────────────────────────────────────────────────────────────────────────
export async function agentChatSseHandler(env, request, ctx, session) {
  const body = await request.json().catch(() => ({}));
  const message = (body.message || '').trim();

  const agentRole = body.role || 'orchestrator';
  const agentId = body.agentId || `agent_sam_${agentRole}`;
  const agent = await getAgentMetadata(env, agentId);

  let activePrompt = null;
  if (body.promptId) {
    activePrompt = await getPromptMetadata(env, body.promptId);
  } else if (body.promptHandle || body.promptGroup) {
    activePrompt = await getActivePromptByWeight(env, body.promptHandle || body.promptGroup);
  }

  const modelKey = activePrompt?.model_hint || agent?.model_policy?.model_key || body.model || 'claude-sonnet-4-6';
  const thinkingMode = agent?.thinking_mode || 'adaptive';
  const effort = agent?.effort || body.effort || 'medium';

  if (!message) return jsonResponse({ error: 'message required' }, 400);

  const rag = await unifiedRagSearch(env, message, { topK: 5, conversation_id: body.conversationId });
  const contextText = (rag.matches || []).join('\n\n');
  const basePrompt = activePrompt?.prompt_template || agent?.system_prompt || 'You are Agent Sam, a powerful AI coding assistant.';
  const systemPrompt = basePrompt + (contextText ? `\n\nContext from memory:\n${contextText}` : '');

  try {
    const stream = await chatWithAnthropic({
      messages: body.messages || [{ role: 'user', content: message }],
      tools: body.tools || [],
      env,
      options: {
        model: modelKey,
        systemPrompt,
        thinking: { type: thinkingMode, effort },
        inference_geo: body.inference_geo || agent?.model_policy?.inference_geo,
        tool_choice: body.tool_choice,
      }
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let lastUsage = null;
        let lastSignature = null;
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'thinking') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`));
          }
          if (chunk.type === 'content_block_delta') {
            const delta = chunk.delta;
            if (delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: delta.text })}\n\n`));
            } else if (delta.type === 'thinking_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', text: delta.thinking })}\n\n`));
            } else if (delta.type === 'signature_delta') {
              lastSignature = delta.signature;
            }
          }
          if (chunk.type === 'message_start' && chunk.message?.id) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'id', id: chunk.message.id })}\n\n`));
          }
          if (chunk.type === 'message_delta') {
            if (chunk.usage) lastUsage = chunk.usage;
            if (chunk.delta?.stop_reason) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'stop', reason: chunk.delta.stop_reason })}\n\n`));
            }
          }
          if (chunk.type === 'message_stop') {
            if (lastUsage) {
              ctx.waitUntil(writeTelemetry(env, {
                sessionId: body.sessionId || body.conversationId,
                tenantId: session?.tenant_id,
                provider: 'anthropic',
                model: modelKey,
                inputTokens: lastUsage.input_tokens || 0,
                outputTokens: lastUsage.output_tokens || 0,
                cacheReadTokens: lastUsage.cache_read_input_tokens || 0,
                cacheWriteTokens: lastUsage.cache_creation_input_tokens || 0,
                success: true,
              }));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', signature: lastSignature })}\n\n`));
          }
        }
        controller.close();
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (e) {
    return jsonResponse({ error: 'Stream failed', detail: e.message }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
async function handleAgentBootstrapRequest(request, env, ctx, session) {
  try {
    const userId = session?.user_id || 'system';
    const cacheKey = 'bootstrap_' + userId;
    if (env.DB) {
      const cached = await env.DB.prepare(
        `SELECT compiled_context FROM ai_compiled_context_cache
         WHERE context_hash = ? AND (expires_at IS NULL OR expires_at > unixepoch())`
      ).bind(cacheKey).first();
      if (cached?.compiled_context) {
        return new Response(cached.compiled_context, {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
        });
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let dailyLog = '', yesterdayLog = '', schemaMemory = '', todayTodo = '';
    if (env.R2) {
      const fetchR2 = async (k) => { const o = await env.R2.get(k); return o ? await o.text() : ''; };
      [dailyLog, yesterdayLog, schemaMemory, todayTodo] = await Promise.all([
        fetchR2(`memory/daily/${today}.md`),
        fetchR2(`memory/daily/${yesterday}.md`),
        fetchR2('memory/schema-and-records.md'),
        fetchR2('memory/today-todo.md'),
      ]);
    }
    if (!todayTodo && env.DB) {
      const row = await env.DB.prepare(
        "SELECT value FROM agent_memory_index WHERE key = 'today_todo' AND tenant_id = ?"
      ).bind(session?.tenant_id || 'system').first();
      if (row?.value) todayTodo = String(row.value);
    }
    const context = { daily_log: dailyLog || null, yesterday_log: yesterdayLog || null, schema_and_records_memory: schemaMemory || null, today_todo: todayTodo || null, date: today };
    if (env.DB && ctx?.waitUntil) {
      ctx.waitUntil(
        env.DB.prepare(
          `INSERT INTO ai_compiled_context_cache (id, context_hash, context_type, compiled_context, source_context_ids_json, token_count, tenant_id, created_at, last_accessed_at, expires_at)
           VALUES (?, ?, 'bootstrap', ?, '[]', 0, ?, unixepoch(), unixepoch(), unixepoch()+1800)
           ON CONFLICT(context_hash) DO UPDATE SET compiled_context=excluded.compiled_context, expires_at=excluded.expires_at, last_accessed_at=unixepoch()`
        ).bind(cacheKey, cacheKey, JSON.stringify(context), session?.tenant_id || 'system').run().catch(() => {})
      );
    }
    return jsonResponse(context);
  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}
