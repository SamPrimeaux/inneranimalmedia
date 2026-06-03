/**
 * AgentBrowserLiveV1 — one Browser Run CDP session per agent_run_id.
 * Single writer for live browser session truth: Live View URL, HITL, events, cleanup.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  applyBrowserRunLiveViewMode,
  createBrowserRunSession,
  navigateBrowserRunTab,
  refreshBrowserRunLiveView,
  deleteBrowserRunSession,
} from '../integrations/browser-run-session.js';

export const LIVE_VIEW_URL_TTL_MS = 5 * 60 * 1000;
export const LIVE_VIEW_REFRESH_MS = 4 * 60 * 1000;
export const DEFAULT_AGENT_KEEP_ALIVE_MS = 600_000;
const CLASS_NAME = 'AgentBrowserLiveV1';

/** @param {unknown} v */
function normalizeStatus(v) {
  const s = String(v || 'active').toLowerCase();
  if (['starting', 'active', 'needs_human', 'paused', 'resuming', 'closed'].includes(s)) return s;
  return 'active';
}

/** @param {unknown} v */
function normalizeResumeWhen(v) {
  const s = String(v || 'manual').toLowerCase();
  if (s === 'navigation' || s === 'selector') return s;
  return 'manual';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** @param {string|null|undefined} url @param {string|null|undefined} mode */
function embedLiveViewUrl(url, mode) {
  const m = String(mode || 'tab').toLowerCase() === 'devtools' ? 'devtools' : 'tab';
  return applyBrowserRunLiveViewMode(url, m);
}

export class AgentBrowserLiveV1 extends DurableObject {
  /**
   * @param {import('@cloudflare/workers-types').DurableObjectState} state
   * @param {Record<string, unknown>} env
   */
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.env = env;
    /** @type {import('@cloudflare/workers-types').SqlStorage} */
    this.sql = state.storage.sql;
    /** @type {(() => void)|null} */
    this._hitlResolve = null;
    /** @type {((err: Error) => void)|null} */
    this._hitlReject = null;

    state.blockConcurrencyWhile(async () => {
      this.initSchema();
    });
  }

  initSchema() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS live_browser_session (
      agent_run_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      target_id TEXT,
      current_url TEXT,
      title TEXT,
      devtools_frontend_url TEXT,
      web_socket_debugger_url TEXT,
      live_view_mode TEXT DEFAULT 'tab',
      status TEXT DEFAULT 'starting',
      devtools_url_expires_at INTEGER,
      keep_alive_ms INTEGER DEFAULT 600000,
      human_input_reason TEXT,
      resume_when TEXT,
      resume_selector TEXT,
      user_id TEXT,
      workspace_id TEXT,
      updated_at INTEGER DEFAULT (unixepoch())
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS live_browser_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    )`);
  }

  /** @returns {Record<string, unknown>|null} */
  getSessionRow() {
    const rows = this.sql.exec('SELECT * FROM live_browser_session LIMIT 1').toArray();
    return rows[0] ?? null;
  }

  /** @param {string} agentRunId */
  ensureAgentRunId(agentRunId) {
    const row = this.getSessionRow();
    if (row?.agent_run_id) return String(row.agent_run_id);
    return String(agentRunId || '').trim();
  }

  /** @param {Record<string, unknown>} row */
  rowToLiveSession(row) {
    if (!row) return null;
    const expiresAt = row.devtools_url_expires_at
      ? new Date(Number(row.devtools_url_expires_at)).toISOString()
      : null;
    return {
      agent_run_id: row.agent_run_id,
      session_id: row.session_id,
      target_id: row.target_id,
      url: row.current_url,
      title: row.title,
      devtools_frontend_url: row.devtools_frontend_url,
      web_socket_debugger_url: row.web_socket_debugger_url,
      live_view_mode: row.live_view_mode || 'tab',
      status: row.status,
      expires_at: expiresAt,
      keep_alive_ms: row.keep_alive_ms,
      human_input_reason: row.human_input_reason,
      resume_when: row.resume_when,
      resume_selector: row.resume_selector,
      user_id: row.user_id,
      workspace_id: row.workspace_id,
    };
  }

  /**
   * @param {string} eventType
   * @param {Record<string, unknown>} payload
   */
  emitEvent(eventType, payload = {}) {
    this.sql.exec(
      'INSERT INTO live_browser_events (event_type, payload_json) VALUES (?, ?)',
      eventType,
      JSON.stringify(payload),
    );
    this.broadcastWs({
      type: eventType,
      event_type: eventType,
      ...payload,
      created_at: new Date().toISOString(),
    });
  }

  /** @param {Record<string, unknown>|string} message */
  broadcastWs(message) {
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch (e) {
        console.warn('[AgentBrowserLiveV1] ws broadcast', e?.message ?? e);
      }
    }
  }

  /** @param {number|null} expiresAtMs */
  async scheduleRefreshAlarm(expiresAtMs) {
    const exp = expiresAtMs || Date.now() + LIVE_VIEW_URL_TTL_MS;
    const when = Math.max(Date.now() + 5_000, exp - 60_000);
    await this.state.storage.setAlarm(when);
  }

  /** @param {Record<string, unknown>} fields */
  upsertSession(fields) {
    const now = Math.floor(Date.now() / 1000);
    const row = this.getSessionRow();
    if (!row) {
      this.sql.exec(
        `INSERT INTO live_browser_session (
          agent_run_id, session_id, target_id, current_url, title,
          devtools_frontend_url, web_socket_debugger_url, live_view_mode, status,
          devtools_url_expires_at, keep_alive_ms, human_input_reason, resume_when,
          resume_selector, user_id, workspace_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        fields.agent_run_id,
        fields.session_id,
        fields.target_id ?? null,
        fields.current_url ?? null,
        fields.title ?? null,
        fields.devtools_frontend_url ?? null,
        fields.web_socket_debugger_url ?? null,
        fields.live_view_mode ?? 'tab',
        fields.status ?? 'starting',
        fields.devtools_url_expires_at ?? Date.now() + LIVE_VIEW_URL_TTL_MS,
        fields.keep_alive_ms ?? DEFAULT_AGENT_KEEP_ALIVE_MS,
        fields.human_input_reason ?? null,
        fields.resume_when ?? null,
        fields.resume_selector ?? null,
        fields.user_id ?? null,
        fields.workspace_id ?? null,
        now,
      );
      return;
    }
    const merged = { ...row, ...fields, updated_at: now };
    this.sql.exec(
      `UPDATE live_browser_session SET
        session_id = ?, target_id = ?, current_url = ?, title = ?,
        devtools_frontend_url = ?, web_socket_debugger_url = ?, live_view_mode = ?,
        status = ?, devtools_url_expires_at = ?, keep_alive_ms = ?,
        human_input_reason = ?, resume_when = ?, resume_selector = ?,
        user_id = COALESCE(?, user_id), workspace_id = COALESCE(?, workspace_id),
        updated_at = ?
      WHERE agent_run_id = ?`,
      merged.session_id,
      merged.target_id ?? null,
      merged.current_url ?? null,
      merged.title ?? null,
      merged.devtools_frontend_url ?? null,
      merged.web_socket_debugger_url ?? null,
      merged.live_view_mode ?? 'tab',
      merged.status ?? 'active',
      merged.devtools_url_expires_at ?? Date.now() + LIVE_VIEW_URL_TTL_MS,
      merged.keep_alive_ms ?? DEFAULT_AGENT_KEEP_ALIVE_MS,
      merged.human_input_reason ?? null,
      merged.resume_when ?? null,
      merged.resume_selector ?? null,
      fields.user_id ?? null,
      fields.workspace_id ?? null,
      now,
      merged.agent_run_id,
    );
  }

  /** @param {Request} request */
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();

    if (request.headers.get('Upgrade') === 'websocket' && path === '/ws') {
      return this.handleWebSocketUpgrade();
    }

    if (method === 'GET' && path === '/health') {
      const row = this.getSessionRow();
      return json({
        ok: true,
        class: CLASS_NAME,
        agent_run_id: row?.agent_run_id ?? null,
        status: row?.status ?? 'idle',
      });
    }

    if (method === 'GET' && path === '/session') {
      const row = this.getSessionRow();
      if (!row) return json({ ok: false, error: 'no session' }, 404);
      return json({ ok: true, live_session: this.rowToLiveSession(row), session: row });
    }

    if (method === 'POST' && path === '/session/ensure') {
      return this.handleEnsure(request);
    }

    if (method === 'GET' && path === '/session/live-url') {
      return this.handleLiveUrlRefresh();
    }

    if (method === 'DELETE' && path === '/session/close') {
      return this.handleClose();
    }

    if (method === 'POST' && path === '/human-input/request') {
      return this.handleHumanInputRequest(request);
    }

    if (method === 'POST' && path === '/human-input/resume') {
      return this.handleHumanInputResume();
    }

    if (method === 'POST' && path === '/human-input/cancel') {
      return this.handleHumanInputCancel();
    }

    if (method === 'POST' && path === '/session/patch') {
      return this.handleSessionPatch(request);
    }

    if (method === 'GET' && path === '/events') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const rows = this.sql
        .exec('SELECT * FROM live_browser_events ORDER BY id DESC LIMIT ?', limit)
        .toArray();
      return json({ ok: true, events: rows });
    }

    return json({ error: 'Not found', path }, 404);
  }

  handleWebSocketUpgrade() {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);

    const row = this.getSessionRow();
    const liveSession = this.rowToLiveSession(row);
    try {
      server.send(
        JSON.stringify({
          type: 'session_snapshot',
          live_session: liveSession,
          status: row?.status ?? 'idle',
        }),
      );
    } catch {
      /* non-fatal */
    }

    try {
      const rows = this.sql
        .exec('SELECT id, event_type, payload_json, created_at FROM live_browser_events ORDER BY id DESC LIMIT 30')
        .toArray()
        .reverse();
      server.send(JSON.stringify({ type: 'events_bootstrap', events: rows }));
    } catch {
      /* non-fatal */
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  /** @param {import('@cloudflare/workers-types').WebSocket} ws */
  async webSocketMessage(ws, message) {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    if (text === 'ping') {
      try {
        ws.send('pong');
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed?.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch {
      /* ignore */
    }
  }

  /** @param {Request} request */
  async handleSessionPatch(request) {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const row = this.getSessionRow();
    if (!row) return json({ ok: false, error: 'no session' }, 404);

    const toolName = body.tool_name != null ? String(body.tool_name) : '';
    const actionPhase = String(body.action_phase || body.phase || 'done').toLowerCase();
    const requestedUrl =
      body.requested_url != null
        ? String(body.requested_url)
        : body.requestedUrl != null
          ? String(body.requestedUrl)
          : null;
    const scrollDirection =
      body.scroll_direction != null
        ? String(body.scroll_direction)
        : body.direction != null
          ? String(body.direction)
          : null;

    const patch = {
      agent_run_id: row.agent_run_id,
      session_id: row.session_id,
      current_url: body.url ?? body.current_url ?? row.current_url,
      title: body.title ?? row.title,
      status: body.status ?? row.status,
    };

    if (toolName && actionPhase === 'start') {
      this.emitEvent('browser_action_started', {
        tool_name: toolName,
        url: patch.current_url,
        title: patch.title,
        requested_url: requestedUrl,
      });
      this.upsertSession(patch);
      const updated = this.getSessionRow();
      return json({
        ok: true,
        live_session: updated ? this.rowToLiveSession(updated) : null,
      });
    }

    let liveSession = null;
    const urlCommitTools = new Set([
      'browser_navigate',
      'cdt_navigate_page',
      'browser_verify_current_page',
    ]);
    const urlVerified =
      body.verified === true ||
      body.url_verified === true ||
      (!urlCommitTools.has(toolName) && body.verified !== false);

    if (actionPhase === 'done' && patch.current_url && toolName !== 'browser_scroll' && urlVerified) {
      const refreshed = await refreshBrowserRunLiveView(this.env, {
        sessionId: String(row.session_id),
        targetId: row.target_id != null ? String(row.target_id) : null,
      });
      if (refreshed.ok) {
        const viewMode = row.live_view_mode ?? 'tab';
        const embedUrl = embedLiveViewUrl(refreshed.devtoolsFrontendUrl, viewMode);
        const expiresAt = Date.now() + LIVE_VIEW_URL_TTL_MS;
        this.upsertSession({
          agent_run_id: row.agent_run_id,
          session_id: row.session_id,
          target_id: refreshed.targetId ?? row.target_id,
          current_url: refreshed.url ?? patch.current_url,
          title: refreshed.title ?? patch.title,
          devtools_frontend_url: embedUrl,
          web_socket_debugger_url: refreshed.webSocketDebuggerUrl ?? row.web_socket_debugger_url,
          devtools_url_expires_at: expiresAt,
        });
        await this.scheduleRefreshAlarm(expiresAt);
        const updated = this.getSessionRow();
        liveSession = updated ? this.rowToLiveSession(updated) : null;

        const commitPayload = {
          agent_run_id: row.agent_run_id,
          browser_do_id: this.ctx.id.toString(),
          session_id: row.session_id,
          target_id: liveSession?.target_id ?? row.target_id,
          url: liveSession?.url ?? patch.current_url,
          title: liveSession?.title ?? patch.title,
          requested_url: requestedUrl,
          verified: true,
          live_view_url: liveSession?.devtools_frontend_url ?? embedUrl,
          live_view_mode: liveSession?.live_view_mode ?? viewMode,
          same_session_reused: true,
          tool_name: toolName,
        };
        this.emitEvent('browser_url_committed', commitPayload);
        if (toolName === 'browser_navigate' || toolName === 'cdt_navigate_page') {
          this.emitEvent('browser_navigated', {
            url: commitPayload.url,
            title: commitPayload.title,
            tool_name: toolName,
            verified: true,
          });
        }
        if (refreshed.devtoolsFrontendUrl && liveSession?.devtools_frontend_url) {
          this.emitEvent('browser_live_view_refresh', {
            devtools_frontend_url: liveSession.devtools_frontend_url,
            live_view_url: liveSession.devtools_frontend_url,
            url: liveSession.url,
            expires_at: liveSession.expires_at,
            live_view_mode: liveSession.live_view_mode,
          });
        }
      } else {
        this.upsertSession(patch);
        liveSession = this.rowToLiveSession(this.getSessionRow());
      }
    } else if (
      actionPhase === 'done' &&
      urlCommitTools.has(toolName) &&
      (body.verified === false || body.url_verified === false)
    ) {
      this.emitEvent('browser_verification_failed', {
        agent_run_id: row.agent_run_id,
        browser_do_id: this.ctx.id.toString(),
        session_id: row.session_id,
        target_id: row.target_id,
        requested_url: requestedUrl,
        url: patch.current_url,
        verified: false,
        tool_name: toolName,
      });
      liveSession = this.rowToLiveSession(this.getSessionRow());
    } else {
      this.upsertSession(patch);
      liveSession = this.rowToLiveSession(this.getSessionRow());
    }

    if (toolName && actionPhase === 'done') {
      const actionOk =
        body.ok === false
          ? false
          : urlCommitTools.has(toolName)
            ? urlVerified
            : body.verified !== false;
      this.emitEvent('browser_action_done', {
        tool_name: toolName,
        url: liveSession?.url ?? patch.current_url,
        title: liveSession?.title ?? patch.title,
        ok: actionOk,
        verified: urlCommitTools.has(toolName) ? urlVerified : body.verified !== false,
      });
      if (toolName === 'browser_scroll' && scrollDirection) {
        this.emitEvent('browser_scrolled', {
          tool_name: toolName,
          direction: scrollDirection,
          url: liveSession?.url ?? patch.current_url,
        });
      }
    }

    return json({
      ok: true,
      live_session: liveSession,
      browser_url_committed:
        actionPhase === 'done' &&
        patch.current_url &&
        toolName !== 'browser_scroll' &&
        urlVerified
          ? {
              url: liveSession?.url ?? patch.current_url,
              title: liveSession?.title ?? patch.title,
              verified: true,
              session_id: row.session_id,
              agent_run_id: row.agent_run_id,
            }
          : null,
    });
  }

  async handleHumanInputCancel() {
    const row = this.getSessionRow();
    if (row) {
      this.upsertSession({
        agent_run_id: row.agent_run_id,
        session_id: row.session_id,
        status: 'active',
        human_input_reason: null,
      });
    }
    if (this._hitlReject) {
      this._hitlReject(new Error('human input cancelled by user'));
      this._hitlResolve = null;
      this._hitlReject = null;
    } else if (this._hitlResolve) {
      this._hitlResolve();
      this._hitlResolve = null;
    }
    this.emitEvent('browser_human_input_cancelled', { agent_run_id: row?.agent_run_id ?? null });
    return json({ ok: true, cancelled: true });
  }

  /** @param {Request} request */
  async handleEnsure(request) {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const agentRunId = this.ensureAgentRunId(body.agent_run_id ?? body.agentRunId);
    if (!agentRunId) return json({ ok: false, error: 'agent_run_id required' }, 400);

    const keepAliveMs = Math.min(
      600_000,
      Math.max(60_000, Number(body.keep_alive_ms ?? body.keepAliveMs) || DEFAULT_AGENT_KEEP_ALIVE_MS),
    );
    const targetUrl = body.url != null ? String(body.url).trim() : '';
    const liveViewMode = body.live_view_mode === 'devtools' || body.liveViewMode === 'devtools' ? 'devtools' : 'tab';

    let row = this.getSessionRow();
    let sessionId = row?.session_id ? String(row.session_id) : '';
    const wasClosed = row?.status === 'closed';

    if (!sessionId || wasClosed) {
      await this.emitEvent('browser_session_starting', { agent_run_id: agentRunId, url: targetUrl || null });
      const created = await createBrowserRunSession(this.env, { keepAliveMs, targets: true });
      if (!created.ok) return json(created, 502);
      sessionId = created.sessionId;
      const expiresAt = Date.now() + LIVE_VIEW_URL_TTL_MS;
      this.upsertSession({
        agent_run_id: agentRunId,
        session_id: sessionId,
        target_id: created.targetId ?? null,
        current_url: created.url ?? null,
        title: created.title ?? null,
        devtools_frontend_url: embedLiveViewUrl(created.devtoolsFrontendUrl ?? null, liveViewMode),
        web_socket_debugger_url: created.webSocketDebuggerUrl ?? null,
        live_view_mode: liveViewMode,
        status: 'starting',
        devtools_url_expires_at: expiresAt,
        keep_alive_ms: keepAliveMs,
        user_id: body.user_id ?? body.userId ?? null,
        workspace_id: body.workspace_id ?? body.workspaceId ?? null,
      });
      row = this.getSessionRow();
    }

    const deferHttpNav =
      body.defer_http_navigate === true || body.deferHttpNavigate === true;

    if (targetUrl && !(deferHttpNav && sessionId && !wasClosed)) {
      const navigated = await navigateBrowserRunTab(this.env, { sessionId, url: targetUrl });
      if (!navigated.ok) {
        const created = await createBrowserRunSession(this.env, { keepAliveMs, targets: true });
        if (!created.ok) return json(created, 502);
        sessionId = created.sessionId;
        const retry = await navigateBrowserRunTab(this.env, { sessionId, url: targetUrl });
        if (!retry.ok) return json(retry, 502);
        const expiresAt = Date.now() + LIVE_VIEW_URL_TTL_MS;
        this.upsertSession({
          agent_run_id: agentRunId,
          session_id: sessionId,
          target_id: retry.targetId ?? created.targetId ?? null,
          current_url: retry.url ?? targetUrl,
          title: retry.title ?? null,
          devtools_frontend_url: embedLiveViewUrl(
            retry.devtoolsFrontendUrl ?? created.devtoolsFrontendUrl ?? null,
            liveViewMode,
          ),
          web_socket_debugger_url: retry.webSocketDebuggerUrl ?? created.webSocketDebuggerUrl ?? null,
          live_view_mode: liveViewMode,
          status: 'active',
          devtools_url_expires_at: expiresAt,
          keep_alive_ms: keepAliveMs,
        });
      } else {
        const expiresAt = Date.now() + LIVE_VIEW_URL_TTL_MS;
        this.upsertSession({
          agent_run_id: agentRunId,
          session_id: sessionId,
          target_id: navigated.targetId ?? row?.target_id ?? null,
          current_url: navigated.url ?? targetUrl,
          title: navigated.title ?? row?.title ?? null,
          devtools_frontend_url: embedLiveViewUrl(
            navigated.devtoolsFrontendUrl ?? row?.devtools_frontend_url ?? null,
            liveViewMode,
          ),
          web_socket_debugger_url: navigated.webSocketDebuggerUrl ?? row?.web_socket_debugger_url ?? null,
          live_view_mode: liveViewMode,
          status: 'active',
          devtools_url_expires_at: expiresAt,
          keep_alive_ms: keepAliveMs,
        });
      }
    } else if (row && sessionId) {
      const refreshed = await refreshBrowserRunLiveView(this.env, {
        sessionId,
        targetId: row.target_id != null ? String(row.target_id) : null,
      });
      if (refreshed.ok) {
        const expiresAt = Date.now() + LIVE_VIEW_URL_TTL_MS;
        this.upsertSession({
          agent_run_id: agentRunId,
          session_id: sessionId,
          target_id: refreshed.targetId ?? row.target_id,
          current_url: refreshed.url ?? row.current_url,
          title: refreshed.title ?? row.title,
          devtools_frontend_url: embedLiveViewUrl(refreshed.devtoolsFrontendUrl, row.live_view_mode ?? liveViewMode),
          web_socket_debugger_url: refreshed.webSocketDebuggerUrl ?? row.web_socket_debugger_url,
          status: row.status === 'starting' ? 'active' : row.status,
          devtools_url_expires_at: expiresAt,
          keep_alive_ms: keepAliveMs,
        });
      }
    }

    row = this.getSessionRow();
    if (!row) return json({ ok: false, error: 'Failed to establish live browser session' }, 500);

    const liveSession = this.rowToLiveSession(row);
    await this.emitEvent('browser_session_ready', liveSession ?? {});
    if (liveSession?.devtools_frontend_url) {
      await this.emitEvent('browser_live_view_ready', {
        session_id: liveSession.session_id,
        target_id: liveSession.target_id,
        live_view_url: liveSession.devtools_frontend_url,
        url: liveSession.url,
        title: liveSession.title,
        expires_at: liveSession.expires_at,
        live_view_mode: liveSession.live_view_mode,
      });
    }

    await this.scheduleRefreshAlarm(Number(row.devtools_url_expires_at));

    return json({
      ok: true,
      live_session: liveSession,
      session_id: row.session_id,
      browser_session: {
        scope_id: agentRunId,
        session_id: row.session_id,
        target_id: row.target_id,
        web_socket_debugger_url: row.web_socket_debugger_url,
        devtools_frontend_url: row.devtools_frontend_url,
      },
    });
  }

  async handleLiveUrlRefresh() {
    const row = this.getSessionRow();
    if (!row?.session_id) return json({ ok: false, error: 'no session' }, 404);
    if (row.status === 'closed') return json({ ok: false, error: 'session closed' }, 410);

    const refreshed = await refreshBrowserRunLiveView(this.env, {
      sessionId: String(row.session_id),
      targetId: row.target_id != null ? String(row.target_id) : null,
    });
    if (!refreshed.ok) {
      await this.emitEvent('browser_live_view_refresh_failed', { error: refreshed.error });
      return json(refreshed, 502);
    }

    const viewMode = row.live_view_mode ?? 'tab';
    const embedUrl = embedLiveViewUrl(refreshed.devtoolsFrontendUrl, viewMode);
    const expiresAt = Date.now() + LIVE_VIEW_URL_TTL_MS;
    this.upsertSession({
      agent_run_id: row.agent_run_id,
      session_id: row.session_id,
      target_id: refreshed.targetId ?? row.target_id,
      current_url: refreshed.url ?? row.current_url,
      title: refreshed.title ?? row.title,
      devtools_frontend_url: embedUrl,
      web_socket_debugger_url: refreshed.webSocketDebuggerUrl ?? row.web_socket_debugger_url,
      devtools_url_expires_at: expiresAt,
    });

    await this.emitEvent('browser_live_view_refresh', {
      devtools_frontend_url: embedUrl,
      url: refreshed.url,
      expires_at: new Date(expiresAt).toISOString(),
      live_view_mode: viewMode,
    });
    await this.scheduleRefreshAlarm(expiresAt);

    return json({
      ok: true,
      session_id: row.session_id,
      target_id: refreshed.targetId,
      devtools_frontend_url: embedUrl,
      web_socket_debugger_url: refreshed.webSocketDebuggerUrl,
      url: refreshed.url,
      title: refreshed.title,
      expires_at: new Date(expiresAt).toISOString(),
    });
  }

  async handleClose() {
    const row = this.getSessionRow();
    if (row?.session_id) {
      await deleteBrowserRunSession(this.env, { sessionId: String(row.session_id) }).catch(() => {});
    }
    if (row) {
      this.upsertSession({
        agent_run_id: row.agent_run_id,
        session_id: row.session_id,
        status: 'closed',
        human_input_reason: null,
      });
      await this.emitEvent('browser_session_closed', { agent_run_id: row.agent_run_id });
    }
    await this.state.storage.deleteAlarm();
    if (this._hitlResolve) {
      this._hitlResolve();
      this._hitlResolve = null;
      this._hitlReject = null;
    }
    return json({ ok: true, status: 'closed' });
  }

  /** @param {Request} request */
  async handleHumanInputRequest(request) {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const reason = String(body.reason || '').trim();
    if (!reason) return json({ ok: false, error: 'reason required' }, 400);

    const ensureRes = await this.handleEnsure(
      new Request('https://do/session/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    if (!ensureRes.ok) {
      const errBody = await ensureRes.json().catch(() => ({}));
      return json(errBody, ensureRes.status);
    }

    const row = this.getSessionRow();
    const resumeWhen = normalizeResumeWhen(body.resume_when ?? body.resumeWhen);
    this.upsertSession({
      agent_run_id: row?.agent_run_id,
      session_id: row?.session_id,
      status: 'needs_human',
      human_input_reason: reason,
      resume_when: resumeWhen,
      resume_selector: body.selector != null ? String(body.selector) : null,
    });

    await this.emitEvent('browser_human_input_required', {
      reason,
      resume_when: resumeWhen,
      live_view_url: row?.devtools_frontend_url ?? null,
      url: row?.current_url ?? null,
    });

    const timeoutMs = Math.min(
      600_000,
      Math.max(5_000, Number(body.timeout_ms ?? body.timeoutMs) || 300_000),
    );

    try {
      await this.waitForHumanResume(timeoutMs, resumeWhen, row);
      const after = this.getSessionRow();
      if (after) {
        this.upsertSession({
          agent_run_id: after.agent_run_id,
          session_id: after.session_id,
          status: 'active',
          human_input_reason: null,
        });
      }
      await this.emitEvent('browser_human_input_resumed', { agent_run_id: after?.agent_run_id });
      return json({
        ok: true,
        human_input_required: true,
        resumed: true,
        reason,
        resume_when: resumeWhen,
        live_session: after ? this.rowToLiveSession(after) : null,
      });
    } catch (e) {
      return json({
        ok: false,
        human_input_required: true,
        resumed: false,
        error: String(e?.message || e),
      }, 408);
    }
  }

  /**
   * @param {number} timeoutMs
   * @param {string} resumeWhen
   * @param {Record<string, unknown>|null} row
   */
  waitForHumanResume(timeoutMs, resumeWhen, row) {
    return new Promise((resolve, reject) => {
      this._hitlResolve = resolve;
      this._hitlReject = reject;
      const timer = setTimeout(() => {
        if (this._hitlReject) {
          this._hitlReject(new Error('human input resume timed out'));
          this._hitlResolve = null;
          this._hitlReject = null;
        }
      }, timeoutMs);

      const origResolve = this._hitlResolve;
      this._hitlResolve = () => {
        clearTimeout(timer);
        origResolve?.();
        this._hitlResolve = null;
        this._hitlReject = null;
      };

      if (resumeWhen === 'navigation' && row?.session_id) {
        const startUrl = row.current_url != null ? String(row.current_url) : '';
        const poll = async () => {
          while (this._hitlResolve) {
            const refreshed = await refreshBrowserRunLiveView(this.env, {
              sessionId: String(row.session_id),
            }).catch(() => null);
            if (refreshed?.ok && refreshed.url && startUrl && refreshed.url !== startUrl) {
              this._hitlResolve?.();
              return;
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
        };
        poll().catch(() => {});
      }
    });
  }

  async handleHumanInputResume() {
    const row = this.getSessionRow();
    if (!row) return json({ ok: false, error: 'no session' }, 404);
    this.upsertSession({
      agent_run_id: row.agent_run_id,
      session_id: row.session_id,
      status: 'resuming',
      human_input_reason: null,
    });
    if (this._hitlResolve) {
      this._hitlResolve();
      this._hitlResolve = null;
      this._hitlReject = null;
    }
    await this.emitEvent('browser_human_input_resumed', { agent_run_id: row.agent_run_id });
    const updated = this.getSessionRow();
    return json({
      ok: true,
      agent_run_id: row.agent_run_id,
      session_id: row.session_id,
      live_session: updated ? this.rowToLiveSession(updated) : null,
    });
  }

  async alarm() {
    const row = this.getSessionRow();
    if (!row || row.status === 'closed') return;
    if (row.status !== 'active' && row.status !== 'needs_human') return;

    const expiresAt = Number(row.devtools_url_expires_at) || 0;
    if (expiresAt && Date.now() < expiresAt - 30_000) {
      await this.scheduleRefreshAlarm(expiresAt);
      return;
    }

    await this.handleLiveUrlRefresh();
  }
}
