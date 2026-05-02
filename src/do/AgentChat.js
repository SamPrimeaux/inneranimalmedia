/**
 * High-performance Agent Chat storage using the native Worker SQL API.
 * Stores session messages and RAG context cache.
 */
import { DurableObject } from "cloudflare:workers";
import { getDefaultTerminalConnection } from "../core/terminal.js";

// ACTIVE PATH: AGENT_SESSION DO terminal coordination for /api/agent/terminal/ws.
const TERMINAL_WS_TAG = "terminal";
const DEFAULT_EXECUTION_MODE = "pty";
const DEFAULT_MCP_ENDPOINT = "https://mcp.inneranimalmedia.com/mcp";

function normalizeExecutionMode(value) {
  const raw = String(value || DEFAULT_EXECUTION_MODE).trim().toLowerCase();
  return raw === "ssh" || raw === "mcp" ? raw : "pty";
}

function parseSshTargets(env) {
  try {
    const raw = String(env?.SSH_TARGETS_JSON || "").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.targets) ? parsed.targets : []);
    return list
      .map((row) => ({
        id: String(row?.id || row?.name || "").trim(),
        host: String(row?.host || "").trim(),
        user: String(row?.user || "").trim(),
        port: Number(row?.port || 22) || 22,
      }))
      .filter((row) => row.host && row.user);
  } catch (_) {
    return [];
  }
}

function shellSingleQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeWebSocketUrl(raw) {
  let value = String(raw || "").trim().split("?")[0];
  if (!value) return "";
  if (value.startsWith("https://")) return "wss://" + value.slice(8);
  if (value.startsWith("http://")) return "ws://" + value.slice(7);
  if (value.startsWith("wss://") || value.startsWith("ws://")) return value;
  return "wss://" + value.replace(/^\/+/, "");
}

function normalizeExecHttpUrl(raw) {
  let value = String(raw || "").trim().split("?")[0];
  if (!value) return "";
  if (value.startsWith("wss://")) value = "https://" + value.slice(6);
  else if (value.startsWith("ws://")) value = "http://" + value.slice(5);
  else if (!/^https?:\/\//i.test(value)) value = "https://" + value.replace(/^\/+/, "");
  try {
    return new URL("/exec", new URL(value).origin).href;
  } catch (_) {
    return "";
  }
}

function messageToString(input) {
  if (typeof input === "string") return input;
  if (input instanceof ArrayBuffer) return new TextDecoder().decode(input);
  if (input instanceof Uint8Array) return new TextDecoder().decode(input);
  if (input == null) return "";
  return String(input);
}

export class AgentChatSqlV1 extends DurableObject {
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
    this.sql.exec(`CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model_used TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      rag_chunks_injected INTEGER DEFAULT 0,
      top_rag_score REAL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS session_rag_cache (
      query_hash TEXT PRIMARY KEY,
      chunk_ids TEXT,
      context TEXT,
      top_score REAL,
      cached_at INTEGER DEFAULT (unixepoch())
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS designstudio_event_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      envelope_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`);

    this.ptyWs = null;
    this.ptyConnectPromise = null;
    this.cachedTerminalSessionId = null;
    this.terminalLineBuffers = new Map();
    this.workspaceId = "ws_inneranimalmedia";
    this.workspaceSettings = {};
    this.workspaceSettingsPromise = null;
    this.historySequence = 0;
    this._ptyOutBuf = "";
    this._ptyOutFlushTimer = null;
  }

  closeTerminalSessionInD1() {
    const sid = this.cachedTerminalSessionId;
    if (!sid || !this.env?.DB) return;
    void this.env.DB.prepare(
      `UPDATE terminal_sessions
       SET status = 'closed', closed_at = unixepoch(), updated_at = unixepoch()
       WHERE id = ? AND status != 'closed'`,
    )
      .bind(sid)
      .run()
      .catch((e) => console.warn("[terminal_session close]", e?.message));
  }

  async insertTerminalHistoryRow(direction, content, opts = {}) {
    if (!this.env?.DB || !this.cachedTerminalSessionId) return;
    const tenantId = String(this.env?.TENANT_ID || "system").trim();
    const truncated = String(content || "").slice(0, 4000);
    this.historySequence = (this.historySequence || 0) + 1;
    const seq = this.historySequence;
    const id = "th_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const triggeredBy = opts.triggeredBy || "user";
    const agentSid = this.ctx?.id?.toString?.() || null;
    const exitCode = opts.exitCode != null ? opts.exitCode : null;
    const now = Math.floor(Date.now() / 1000);
    try {
      if (exitCode != null && direction === "output") {
        await this.env.DB.prepare(
          `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, sequence, direction, content, exit_code, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
          .bind(id, this.cachedTerminalSessionId, tenantId, seq, direction, truncated, exitCode, triggeredBy, agentSid, now)
          .run();
      } else {
        await this.env.DB.prepare(
          `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, sequence, direction, content, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
          .bind(id, this.cachedTerminalSessionId, tenantId, seq, direction, truncated, triggeredBy, agentSid, now)
          .run();
      }
    } catch (e) {
      console.warn("[terminal_history]", e?.message);
    }
  }

  async recordExecTerminalHistory(command, outputText, exitCode) {
    const cmd = String(command || "").slice(0, 4000);
    const out = String(outputText || "").slice(0, 4000);
    const ec = exitCode != null && Number.isFinite(Number(exitCode)) ? Number(exitCode) : null;
    await this.insertTerminalHistoryRow("input", cmd, { triggeredBy: "agent" });
    await this.insertTerminalHistoryRow("output", out, { triggeredBy: "agent", exitCode: ec });
  }

  recordPtyOutputChunk(text) {
    if (!text || !this.env?.DB || !this.cachedTerminalSessionId) return;
    this._ptyOutBuf = (this._ptyOutBuf || "") + text;
    if (this._ptyOutFlushTimer) clearTimeout(this._ptyOutFlushTimer);
    this._ptyOutFlushTimer = setTimeout(() => this.flushPtyOutputBuffer(), 900);
    if (this._ptyOutBuf.length >= 4000) this.flushPtyOutputBuffer();
  }

  flushPtyOutputBuffer() {
    if (this._ptyOutFlushTimer) {
      clearTimeout(this._ptyOutFlushTimer);
      this._ptyOutFlushTimer = null;
    }
    const buf = (this._ptyOutBuf || "").trim();
    this._ptyOutBuf = "";
    if (!buf) return;
    void this.insertTerminalHistoryRow("output", buf.slice(0, 4000), { triggeredBy: "user" });
  }

  maybeFinalizeTerminalSession(reason) {
    const n = this.ctx.getWebSockets(TERMINAL_WS_TAG).length;
    if (n > 0) return;
    try {
      this.flushPtyOutputBuffer();
    } catch (_) {}
    void this.insertTerminalHistoryRow("system", reason, { triggeredBy: "system" });
    this.closeTerminalSessionInD1();
  }

  async loadWorkspaceSettings() {
    if (!this.env?.DB || !this.workspaceId) {
      this.workspaceSettings = {};
      return this.workspaceSettings;
    }
    const row = await this.env.DB.prepare(
      "SELECT settings_json FROM workspace_settings WHERE workspace_id = ?"
    ).bind(this.workspaceId).first();
    try {
      const parsed = row?.settings_json ? JSON.parse(row.settings_json) : {};
      this.workspaceSettings = parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      this.workspaceSettings = {};
    }
    return this.workspaceSettings;
  }

  async ensureWorkspaceSettingsLoaded(workspaceId) {
    const nextWorkspaceId = String(workspaceId || "").trim() || "ws_inneranimalmedia";
    if (this.workspaceId !== nextWorkspaceId) {
      this.workspaceId = nextWorkspaceId;
      this.workspaceSettings = {};
    }
    if (this.workspaceSettingsPromise) {
      await this.workspaceSettingsPromise;
      return this.workspaceSettings;
    }
    this.workspaceSettingsPromise = this.loadWorkspaceSettings().finally(() => {
      this.workspaceSettingsPromise = null;
    });
    await this.workspaceSettingsPromise;
    return this.workspaceSettings;
  }

  /** @param {Request} request */
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/terminal/ws") {
      return this.handleTerminalWebSocket(request, url);
    }

    if (url.pathname === "/terminal/status") {
      const status = await this.getTerminalStatus(url);
      return Response.json(status);
    }

    if (url.pathname === "/terminal/exec" && request.method === "POST") {
      return this.handleTerminalExec(request, url);
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, class: 'AgentChatSqlV1' });
    }

    if (url.pathname === '/history') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const rows = [...this.sql.exec(
        'SELECT id, role, content, model_used, input_tokens, output_tokens, created_at FROM session_messages ORDER BY created_at DESC LIMIT ?',
        limit,
      )];
      return Response.json({ messages: rows.reverse() });
    }

    if (url.pathname === '/message' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { role, content, model_used, input_tokens, output_tokens, rag_chunks_injected, top_rag_score } = body;
      this.sql.exec(
        'INSERT INTO session_messages (role,content,model_used,input_tokens,output_tokens,rag_chunks_injected,top_rag_score) VALUES (?,?,?,?,?,?,?)',
        role,
        content,
        model_used ?? null,
        input_tokens ?? 0,
        output_tokens ?? 0,
        rag_chunks_injected ?? 0,
        top_rag_score ?? 0,
      );
      return Response.json({ ok: true });
    }

    if (url.pathname === '/rag-cache' && request.method === 'GET') {
      const hash = url.searchParams.get('hash');
      if (!hash) return Response.json({ hit: false });
      const cutoff = Math.floor(Date.now() / 1000) - 3600;
      const rows = [...this.sql.exec(
        'SELECT query_hash, chunk_ids, context, top_score, cached_at FROM session_rag_cache WHERE query_hash = ? AND cached_at > ?',
        hash,
        cutoff,
      )];
      if (!rows.length) return Response.json({ hit: false });
      const row = rows[0];
      return Response.json({
        hit: true,
        query_hash: row.query_hash,
        chunk_ids: row.chunk_ids,
        context: row.context,
        top_score: row.top_score,
        cached_at: row.cached_at,
      });
    }

    if (url.pathname === '/rag-cache' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { query_hash, chunk_ids, context, top_score } = body;
      this.sql.exec(
        'INSERT OR REPLACE INTO session_rag_cache (query_hash, chunk_ids, context, top_score) VALUES (?,?,?,?)',
        query_hash,
        chunk_ids,
        context,
        top_score ?? 0,
      );
      return Response.json({ ok: true });
    }

    if (url.pathname === '/designstudio/stream-event' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const envelope = body?.envelope;
      if (!envelope || typeof envelope !== 'object') {
        return Response.json({ error: 'envelope required' }, { status: 400 });
      }
      const jsonText = JSON.stringify(envelope);
      this.sql.exec('INSERT INTO designstudio_event_outbox (envelope_json) VALUES (?)', jsonText);
      return Response.json({ ok: true });
    }

    if (url.pathname === '/designstudio/events' && request.method === 'GET') {
      return this.handleDesignStudioEventStream(url);
    }

    return new Response('AgentChatSqlV1 DO', { status: 200 });
  }

  /**
   * SSE fan-out from DO SQLite outbox (live stream). Filter by workflow run id inside envelope JSON.
   * @param {URL} url
   */
  handleDesignStudioEventStream(url) {
    const runId = (url.searchParams.get('run_id') || '').trim();
    if (!runId) {
      return Response.json({ error: 'run_id required' }, { status: 400 });
    }
    let lastId = parseInt(url.searchParams.get('last_id') || '0', 10);
    if (!Number.isFinite(lastId)) lastId = 0;

    const encoder = new TextEncoder();
    const sql = this.sql;
    const startedMs = Date.now();
    const maxMs = 10 * 60 * 1000;
    const keepaliveMs = 15000;
    const pollMs = 100;

    const stream = new ReadableStream({
      start: (controller) => {
        let lastKeep = Date.now();
        const pump = async () => {
          try {
            while (Date.now() - startedMs < maxMs) {
              /** @type {{ id: number, envelope_json: string }[]} */
              let batch;
              try {
                batch = [
                  ...sql.exec(
                    `SELECT id, envelope_json FROM designstudio_event_outbox
                     WHERE id > ?
                       AND (
                         COALESCE(json_extract(envelope_json, '$.payload.workflow_run_id'), '') = ?
                         OR COALESCE(json_extract(envelope_json, '$.workflow_run_id'), '') = ?
                       )
                     ORDER BY id ASC LIMIT 50`,
                    lastId,
                    runId,
                    runId,
                  ),
                ];
              } catch (_) {
                const raw = [
                  ...sql.exec(
                    `SELECT id, envelope_json FROM designstudio_event_outbox WHERE id > ? ORDER BY id ASC LIMIT 200`,
                    lastId,
                  ),
                ];
                batch = raw.filter((row) => {
                  try {
                    const o = JSON.parse(row.envelope_json);
                    return (
                      String(o?.payload?.workflow_run_id || '') === runId ||
                      String(o?.workflow_run_id || '') === runId
                    );
                  } catch {
                    return false;
                  }
                }).slice(0, 50);
              }

              for (const row of batch) {
                const idNum = Number(row.id);
                const chunk = `id: ${idNum}\nevent: designstudio\ndata: ${row.envelope_json}\n\n`;
                controller.enqueue(encoder.encode(chunk));
                lastId = idNum;
                try {
                  const parsed = JSON.parse(row.envelope_json);
                  if (parsed?.event === 'supabase.sync.completed') {
                    controller.close();
                    return;
                  }
                } catch (_) {}
              }

              if (Date.now() - lastKeep >= keepaliveMs) {
                controller.enqueue(encoder.encode(': keepalive\n\n'));
                lastKeep = Date.now();
              }

              await new Promise((r) => setTimeout(r, pollMs));
            }
            controller.close();
          } catch (e) {
            try {
              controller.error(e);
            } catch (_) {}
          }
        };
        void pump();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  async handleTerminalWebSocket(request, url) {
    const upgradeHeader = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgradeHeader !== "websocket") {
      return new Response("Durable Object expected Upgrade: websocket", { status: 426 });
    }

    const executionMode = normalizeExecutionMode(url.searchParams.get("execution_mode"));
    const workspaceId = (url.searchParams.get("workspace_id") || "").trim();
    await this.ensureWorkspaceSettingsLoaded(workspaceId);
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server, [TERMINAL_WS_TAG, `mode:${executionMode}`]);
    server.serializeAttachment({ kind: TERMINAL_WS_TAG, execution_mode: executionMode });

    const sid = await this.getOrCreateTerminalSessionId();
    try {
      server.send(JSON.stringify({ type: "session_id", session_id: sid }));
    } catch (_) {}

    this.sendStateToWebSocket(server, "connecting");
    try {
      await this.ensureModeReady(executionMode);
      if (executionMode === "pty" && this.env?.DB) {
        const doId = this.ctx.id.toString();
        await this.env.DB.prepare(
          `UPDATE agentsam_bootstrap SET terminal_session_id = ?, agent_session_id = ?, updated_at = datetime('now') WHERE id = 'asb_sam_iam_prod_v1'`
        ).bind(sid, doId).run().catch(() => {});
        await this.env.DB.prepare(
          `INSERT INTO agentsam_workspace_state (workspace_id, agent_session_id, workspace_type, updated_at)
           VALUES ('ws_inneranimalmedia', ?, 'ide', unixepoch())
           ON CONFLICT(id) DO UPDATE SET agent_session_id = excluded.agent_session_id, updated_at = excluded.updated_at`
        ).bind(doId).run().catch(() => {});
      }
      this.sendStateToWebSocket(server, "connected");
      void this.insertTerminalHistoryRow("system", "terminal session opened", { triggeredBy: "system" });
    } catch (e) {
      this.sendStateToWebSocket(server, "backend_unavailable", String(e?.message || e));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleTerminalExec(request, url) {
    const body = await request.json().catch(() => ({}));
    const executionMode = normalizeExecutionMode(body?.execution_mode || url.searchParams.get("execution_mode"));
    const workspaceId = String(body?.workspace_id || url.searchParams.get("workspace_id") || "").trim();
    await this.ensureWorkspaceSettingsLoaded(workspaceId);
    const command = String(body?.command || "").trim();

    try {
      let result;
      if (executionMode === "pty") {
        if (!command) return Response.json({ error: "command required" }, { status: 400 });
        result = await this.executePtyCommand(command);
      } else if (executionMode === "ssh") {
        if (!command) return Response.json({ error: "command required" }, { status: 400 });
        result = await this.executeSshCommand(command, body);
      } else {
        result = await this.executeMcpCommand(command, body);
      }

      const out = String(result?.output || "").trim();
      if (out) this.broadcastTerminalOutput(`${out}\r\n`);
      return Response.json({
        ok: !result?.error,
        execution_mode: executionMode,
        output: result?.output || "",
        exit_code: result?.exit_code ?? null,
        tool_name: result?.tool_name ?? null,
        target_id: result?.target_id ?? null,
        error: result?.error ?? null,
      });
    } catch (e) {
      return Response.json({ ok: false, execution_mode: executionMode, error: String(e?.message || e) }, { status: 500 });
    }
  }

  async getTerminalStatus(url) {
    const executionMode = normalizeExecutionMode(url.searchParams.get("execution_mode"));
    const sshTargets = parseSshTargets(this.env);
    const mcpToken = String(this.env?.MCP_AUTH_TOKEN || "").trim();
    const ptyConfigured =
      !!this.env?.PTY_SERVICE ||
      (!!String(this.env?.TERMINAL_WS_URL || "").trim() &&
        !!String(this.env?.PTY_AUTH_TOKEN || this.env?.TERMINAL_SECRET || "").trim());
    return {
      ok: true,
      control_plane: "worker_do",
      execution_mode: executionMode,
      session_id: await this.getOrCreateTerminalSessionId(),
      terminal_clients: this.ctx.getWebSockets(TERMINAL_WS_TAG).length,
      backends: {
        pty: { available: ptyConfigured, connected: !!this.ptyWs && this.ptyWs.readyState === 1 },
        ssh: {
          available: sshTargets.length > 0,
          targets: sshTargets.map((t) => ({ id: t.id, host: t.host, user: t.user, port: t.port })),
        },
        mcp: {
          available: !!mcpToken,
          endpoint: String(this.env?.MCP_SERVER_URL || DEFAULT_MCP_ENDPOINT),
        },
      },
    };
  }

  async getOrCreateTerminalSessionId() {
    if (this.cachedTerminalSessionId) return this.cachedTerminalSessionId;
    const existing = await this.ctx.storage.get("terminal_session_id");
    if (existing && String(existing).trim()) {
      this.cachedTerminalSessionId = String(existing).trim();
      return this.cachedTerminalSessionId;
    }
    const created = `term_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    this.cachedTerminalSessionId = created;
    await this.ctx.storage.put("terminal_session_id", created);
    return created;
  }

  sendStateToWebSocket(ws, status, error = null) {
    try {
      ws.send(JSON.stringify({ type: "state", status, error: error || undefined }));
    } catch (_) {}
  }

  broadcastState(status, error = null) {
    const payload = JSON.stringify({ type: "state", status, error: error || undefined });
    for (const ws of this.ctx.getWebSockets(TERMINAL_WS_TAG)) {
      try { ws.send(payload); } catch (_) {}
    }
  }

  broadcastTerminalOutput(text) {
    const payload = JSON.stringify({ type: "output", data: text });
    for (const ws of this.ctx.getWebSockets(TERMINAL_WS_TAG)) {
      try { ws.send(payload); } catch (_) {}
    }
  }

  getSocketMeta(ws) {
    try {
      return ws.deserializeAttachment() || {};
    } catch (_) {
      return {};
    }
  }

  async ensureModeReady(mode) {
    if (mode === "pty") await this.ensurePtyConnected();
    if (mode === "ssh") {
      if (parseSshTargets(this.env).length === 0) throw new Error("SSH targets are not configured");
    }
    if (mode === "mcp") {
      const token = String(this.env?.MCP_AUTH_TOKEN || "").trim();
      if (!token) throw new Error("MCP_AUTH_TOKEN is not configured");
    }
  }

  async ensurePtyConnected() {
    if (this.ptyWs && this.ptyWs.readyState === 1) return;
    if (this.ptyConnectPromise) return this.ptyConnectPromise;
    this.ptyConnectPromise = this.connectPty().finally(() => {
      this.ptyConnectPromise = null;
    });
    return this.ptyConnectPromise;
  }

  async connectPty() {
    let resolvedWsUrl = null;
    let token = String(this.env?.PTY_AUTH_TOKEN || this.env?.TERMINAL_SECRET || "").trim();
    if (this.env?.DB) {
      try {
        const conn = await getDefaultTerminalConnection(this.env.DB);
        if (conn?.ws_url?.trim()) resolvedWsUrl = conn.ws_url.trim();
        const secretName = String(conn?.auth_token_secret_name || "").trim();
        if (secretName && this.env[secretName] != null) {
          const t = String(this.env[secretName]).trim();
          if (t) token = t;
        }
      } catch (_) {}
    }

    // VPC Service path (private — `PTY_SERVICE` tunnels to localhost:3099; no worker-side auth headers)
    if (this.env?.PTY_SERVICE) {
      try {
        const resp = await this.env.PTY_SERVICE.fetch(
          new Request("http://localhost:3099/terminal", {
            headers: {
              Upgrade: "websocket",
              Connection: "Upgrade",
              "Sec-WebSocket-Key": btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
              "Sec-WebSocket-Version": "13",
            },
          }),
        );
        if (resp.status === 101 && resp.webSocket) {
          const pty = resp.webSocket;
          pty.accept();
          this.ptyWs = pty;
          this.broadcastState("connected");
          pty.addEventListener("message", (evt) => {
            try {
              const t = messageToString(evt.data);
              if (t) this.recordPtyOutputChunk(t);
            } catch (_) {}
            for (const ws of this.ctx.getWebSockets(TERMINAL_WS_TAG)) {
              try {
                ws.send(evt.data);
              } catch (_) {}
            }
          });
          pty.addEventListener("close", () => {
            try {
              this.flushPtyOutputBuffer();
            } catch (_) {}
            for (const ws of this.ctx.getWebSockets(TERMINAL_WS_TAG)) {
              try {
                this.sendStateToWebSocket(ws, "disconnected");
              } catch (_) {}
            }
            if (this.ptyWs === pty) this.ptyWs = null;
          });
          pty.addEventListener("error", () => {
            for (const ws of this.ctx.getWebSockets(TERMINAL_WS_TAG)) {
              try {
                this.sendStateToWebSocket(ws, "backend_unavailable", "PTY connection error");
              } catch (_) {}
            }
            if (this.ptyWs === pty) this.ptyWs = null;
          });
          return;
        }
      } catch (_) {
        /* fall through to public tunnel */
      }
    }

    // Fallback: public tunnel (TERMINAL_WS_URL secret)
    // Per-workspace URL takes priority over global secret; then D1 default connection
    const workspaceUrl = this.workspaceSettings?.terminal_ws_url;
    const rawUrl = workspaceUrl || resolvedWsUrl || String(this.env?.TERMINAL_WS_URL || "").trim();
    if (!rawUrl || !token) {
      throw new Error(
        "PTY backend is not configured — set PTY_SERVICE (vpc_services) or TERMINAL_WS_URL + PTY_AUTH_TOKEN",
      );
    }
    let wsUrl = normalizeWebSocketUrl(rawUrl);
    const sep = wsUrl.includes("?") ? "&" : "?";
    wsUrl = `${wsUrl}${sep}token=${encodeURIComponent(token)}`;
    const wsResp = await fetch(wsUrl, {
      headers: {
        "Upgrade": "websocket",
        "Connection": "Upgrade",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
      }
    });
    if (wsResp.status !== 101 || !wsResp.webSocket) {
      throw new Error(`PTY connect failed: ${wsResp.status}`);
    }
    const pty = wsResp.webSocket;
    pty.accept();
    this.ptyWs = pty;
    this.broadcastState("connected");
    pty.addEventListener("message", (evt) => {
      try {
        const t = messageToString(evt.data);
        if (t) this.recordPtyOutputChunk(t);
      } catch (_) {}
      for (const ws of this.ctx.getWebSockets(TERMINAL_WS_TAG)) {
        try { ws.send(evt.data); } catch (_) {}
      }
    });
    pty.addEventListener("close", () => {
      try {
        this.flushPtyOutputBuffer();
      } catch (_) {}
      for (const ws of this.ctx.getWebSockets(TERMINAL_WS_TAG)) {
        try { this.sendStateToWebSocket(ws, "disconnected"); } catch (_) {}
      }
      if (this.ptyWs === pty) this.ptyWs = null;
    });
    pty.addEventListener("error", () => {
      for (const ws of this.ctx.getWebSockets(TERMINAL_WS_TAG)) {
        try { this.sendStateToWebSocket(ws, "backend_unavailable", "PTY connection error"); } catch (_) {}
      }
      if (this.ptyWs === pty) this.ptyWs = null;
    });
  }

  async executePtyCommand(command) {
    if (this.env?.PTY_SERVICE) {
      try {
        const res = await this.env.PTY_SERVICE.fetch(
          new Request("http://localhost:3099/exec", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command }),
          }),
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { error: String(data?.error || `PTY command failed (${res.status})`) };
        }
        const stdout = typeof data?.stdout === "string" ? data.stdout : "";
        const stderr = typeof data?.stderr === "string" ? data.stderr : "";
        const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim() || "(no output)";
        void this.recordExecTerminalHistory(command, output, data?.exit_code ?? 0);
        return { output, exit_code: data?.exit_code ?? 0 };
      } catch (e) {
        return { error: e?.message || "PTY VPC exec failed" };
      }
    }

    let execBase = String(this.env?.TERMINAL_WS_URL || "").trim();
    let dbTok = null;
    if (this.env?.DB) {
      try {
        const conn = await getDefaultTerminalConnection(this.env.DB);
        if (conn?.ws_url?.trim()) execBase = conn.ws_url.trim();
        const sn = String(conn?.auth_token_secret_name || "").trim();
        if (sn && this.env[sn] != null) dbTok = String(this.env[sn]).trim();
      } catch (_) {}
    }
    const execUrl = normalizeExecHttpUrl(execBase);
    if (!execUrl) throw new Error("Terminal /exec endpoint is not configured");
    const tokens = Array.from(new Set([
      String(this.env?.PTY_AUTH_TOKEN || "").trim(),
      String(this.env?.TERMINAL_SECRET || "").trim(),
      dbTok,
    ].filter(Boolean)));
    if (tokens.length === 0) throw new Error("No terminal auth token configured");

    let lastStatus = 500;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const res = await fetch(execUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ command }),
      });
      lastStatus = res.status;
      if (res.status === 401 && i < tokens.length - 1) continue;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: String(data?.error || `PTY command failed (${res.status})`) };
      }
      const stdout = typeof data?.stdout === "string" ? data.stdout : "";
      const stderr = typeof data?.stderr === "string" ? data.stderr : "";
      const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim() || "(no output)";
      void this.recordExecTerminalHistory(command, output, data?.exit_code ?? 0);
      return { output, exit_code: data?.exit_code ?? 0 };
    }

    return { error: `PTY command unauthorized (${lastStatus})` };
  }

  resolveSshTarget(targetId) {
    const targets = parseSshTargets(this.env);
    if (targets.length === 0) throw new Error("No SSH targets configured");
    let target = targets[0];
    const wanted = String(targetId || "").trim();
    if (wanted) {
      target = targets.find((row) => row.id === wanted || row.host === wanted) || target;
    }
    if (!target.user || target.user.toLowerCase() === "root") {
      throw new Error("SSH target must use a non-root user");
    }
    return target;
  }

  async executeSshCommand(command, body = {}) {
    const target = this.resolveSshTarget(body?.ssh_target_id || body?.ssh_target);
    const sshCommand =
      `ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p ${target.port} ` +
      `${target.user}@${target.host} -- ${shellSingleQuote(command)}`;
    const out = await this.executePtyCommand(sshCommand);
    return { ...out, target_id: target.id || `${target.user}@${target.host}` };
  }

  parseMcpInvocation(command, body = {}) {
    const directTool = String(body?.tool_name || "").trim();
    if (directTool) {
      return {
        tool_name: directTool,
        params: body?.params && typeof body.params === "object" ? body.params : {},
      };
    }
    const raw = String(command || "").trim().replace(/^\/?mcp\s+/i, "");
    const spaceIdx = raw.indexOf(" ");
    if (spaceIdx < 0) return { tool_name: raw, params: {} };
    const toolName = raw.slice(0, spaceIdx).trim();
    const tail = raw.slice(spaceIdx + 1).trim();
    if (!tail) return { tool_name: toolName, params: {} };
    try {
      return { tool_name: toolName, params: JSON.parse(tail) };
    } catch (_) {
      return { tool_name: toolName, params: { input: tail } };
    }
  }

  async executeMcpCommand(command, body = {}) {
    const token = String(this.env?.MCP_AUTH_TOKEN || "").trim();
    if (!token) throw new Error("MCP_AUTH_TOKEN is not configured");

    const endpoint = String(this.env?.MCP_SERVER_URL || DEFAULT_MCP_ENDPOINT).trim();
    const invoke = this.parseMcpInvocation(command, body);
    if (!invoke.tool_name) throw new Error("MCP tool name is required");

    const rpcBody = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: invoke.tool_name,
        arguments: invoke.params || {},
      },
    };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(rpcBody),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.error) {
      const detail = payload?.error?.message || payload?.error || payload?.detail || `HTTP ${res.status}`;
      return { error: `MCP invoke failed: ${String(detail)}` };
    }
    const result = payload?.result ?? payload;
    return {
      tool_name: invoke.tool_name,
      output: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      exit_code: 0,
    };
  }

  async webSocketMessage(ws, message) {
    const meta = this.getSocketMeta(ws);
    if (meta?.kind !== TERMINAL_WS_TAG) return;
    const mode = normalizeExecutionMode(meta?.execution_mode);

    if (mode === "pty") {
      try {
        await this.ensurePtyConnected();
        if (!this.ptyWs || this.ptyWs.readyState !== 1) throw new Error("PTY socket not ready");
        const raw = messageToString(message);
        let recordLine = null;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.type === "input" && typeof parsed?.data === "string" && /[\r\n]/.test(parsed.data)) {
            recordLine = parsed.data.replace(/[\r\n]+$/, "").trim();
          }
        } catch (_) {
          if (/[\r\n]/.test(raw)) recordLine = raw.replace(/[\r\n]+$/, "").trim();
        }
        if (recordLine && recordLine.length > 0) {
          void this.insertTerminalHistoryRow("input", recordLine.slice(0, 4000), { triggeredBy: "user" });
        }
        let outbound = raw;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.type === "input" && typeof parsed?.data === "string") outbound = parsed.data;
          else if (parsed?.type === "resize") outbound = JSON.stringify(parsed);
        } catch (_) {}
        this.ptyWs.send(outbound);
      } catch (e) {
        this.sendStateToWebSocket(ws, "backend_unavailable", String(e?.message || e));
      }
      return;
    }

    const raw = messageToString(message);
    if (!raw) return;
    let input = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.type === "resize") return;
      if (parsed?.type === "input" && typeof parsed?.data === "string") input = parsed.data;
      if (typeof parsed?.command === "string") input = parsed.command;
    } catch (_) {}

    const current = this.terminalLineBuffers.get(ws) || "";
    const merged = `${current}${input}`;
    const lines = merged.split(/\r\n|\n|\r/);
    const pending = lines.pop() || "";
    this.terminalLineBuffers.set(ws, pending);

    for (const line of lines) {
      const command = line.trim();
      if (!command) continue;
      try {
        const result = mode === "ssh"
          ? await this.executeSshCommand(command, {})
          : await this.executeMcpCommand(command, {});
        const out = result?.error ? String(result.error) : String(result?.output || "(no output)");
        this.sendStateToWebSocket(ws, "connected");
        this.broadcastTerminalOutput(`${out}\r\n`);
      } catch (e) {
        this.sendStateToWebSocket(ws, "backend_unavailable", String(e?.message || e));
      }
    }
  }

  async webSocketClose(ws) {
    this.terminalLineBuffers.delete(ws);
    this.maybeFinalizeTerminalSession("terminal session closed");
  }

  async webSocketError(ws) {
    this.terminalLineBuffers.delete(ws);
    this.maybeFinalizeTerminalSession("terminal websocket error");
  }
}
