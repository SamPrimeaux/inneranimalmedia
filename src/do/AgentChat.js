/**
 * High-performance Agent Chat storage using the native Worker SQL API.
 * Stores session messages and RAG context cache.
 */
import { DurableObject } from "cloudflare:workers";
import {
  getSelectedTerminalConnection,
  resolveConnectionAuthToken,
} from "../core/terminal.js";
import { handleTerminalSlashCommand } from "../core/terminal-slash.js";
import {
  resolveActiveBootstrap,
  WORKSPACE_CONTEXT_MISSING,
} from "../core/bootstrap.js";
import { assertWorkspaceTokenForPty } from "../core/workspace-tokens.js";
import {
  resolveTerminalCwd,
} from "../core/pty-workspace-paths.js";
import { resolveTerminalExecRouting, TERMINAL_GCP_CONNECTION_ID } from "../core/terminal-routing-policy.js";
import { isSamOperatorLaneUserId } from "../core/platform-operator-policy.js";
import {
  computeTerminalSessionAuthTokenHash,
  isShellHistorySeedLine,
  mintSessionToken,
  sha256HexUtf8,
} from "../core/terminal.js";
import {
  checkSudoPermission,
  formatTerminalExec403,
  resolvePrivilegedTargetLookupId,
  resolveTerminalExecIdentity,
  buildExecTransportHeaders,
} from "../core/agentsam-privileged-targets.js";

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

/** @param {string} raw */
function normalizeShellOverride(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const nick = {
    zsh: "/bin/zsh",
    bash: "/bin/bash",
    sh: "/bin/sh",
    powershell: "powershell",
    pwsh: "pwsh",
  };
  if (nick[lower]) return nick[lower];
  if (s.startsWith("/") && /^\/[\w/.-]{1,64}$/.test(s)) return s;
  if (/^(powershell|pwsh)$/i.test(s)) return lower;
  return null;
}

function normalizeWebSocketUrl(raw) {
  let value = String(raw || "").trim().split("?")[0];
  if (!value) return "";
  if (value.startsWith("https://")) return "wss://" + value.slice(8);
  if (value.startsWith("http://")) return "ws://" + value.slice(7);
  if (value.startsWith("wss://") || value.startsWith("ws://")) return value;
  return "wss://" + value.replace(/^\/+/, "");
}

/** Workers outbound WebSocket upgrade uses https:// (or http://), not wss:// — see docs/TERMINAL_KEYS_RESET.md */
function toFetchWebSocketUrl(wsUrl) {
  const u = String(wsUrl || "").trim();
  if (u.startsWith("wss://")) return "https://" + u.slice(6);
  if (u.startsWith("ws://")) return "http://" + u.slice(5);
  return u;
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
    state.blockConcurrencyWhile(async () => {
      this.migrateSessionMessagesSchema();
      this.migrateTurnOutboxSchema();
      this.migrateSessionAgentContextSchema();
    });
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
    /** Set only from explicit request context or platform-only `allowPlatformFallback` loads — never default env for multi-tenant runtime. */
    this.workspaceId = "";
    this.workspaceSettings = {};
    this.workspaceSettingsPromise = null;
    /** Auth user id from /terminal/ws or /terminal/exec (for upstream PTY tenant isolation). */
    this.ptSessionUserId = "";
    this.ptSessionTenantId = "";
    this.ptPersonUuid = "";
    /** PTY cwd — workspace_settings.workspace_root (local) or ExecOS home (GCP remote) */
    this.ptyWorkingDir = null;
    this.historySequence = 0;
    this._ptyOutBuf = "";
    this._ptyOutFlushTimer = null;
    /** @type {string | null} PTY shell from browser query (?shell=); applied on connectPty. */
    this.terminalShellOverride = null;
    /** Target routing from /terminal/ws query params. */
    this.requestedTargetType = "platform_vm";
    this.requestedConnectionId = "";
    this.requestedToolName = "";
    /** Selected terminal_connections row for current session. */
    this.selectedTerminalConnection = null;
    this.selectedTargetType = "platform_vm";
  }

  migrateSessionMessagesSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id            TEXT PRIMARY KEY,
        turn_id       TEXT,
        role          TEXT NOT NULL,
        content       TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'complete',
        error         TEXT,
        model_used    TEXT,
        input_tokens  INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        tool_calls    TEXT,
        created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    const cols = [...this.sql.exec(`PRAGMA table_info(session_messages)`)].map((c) => c.name);
    if (!cols.includes("status")) {
      this.sql.exec(`ALTER TABLE session_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'complete'`);
    }
    if (!cols.includes("error")) {
      this.sql.exec(`ALTER TABLE session_messages ADD COLUMN error TEXT`);
    }
    if (!cols.includes("turn_id")) {
      this.sql.exec(`ALTER TABLE session_messages ADD COLUMN turn_id TEXT`);
    }
    if (!cols.includes("tool_calls")) {
      this.sql.exec(`ALTER TABLE session_messages ADD COLUMN tool_calls TEXT`);
    }
    if (!cols.includes("updated_at")) {
      this.sql.exec(`ALTER TABLE session_messages ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (unixepoch())`);
    }

    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_session_messages_created_at ON session_messages(created_at)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_session_messages_turn_id ON session_messages(turn_id)`);
  }

  migrateTurnOutboxSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS turn_outbox (
        seq         INTEGER PRIMARY KEY AUTOINCREMENT,
        turn_id     TEXT NOT NULL,
        event_type  TEXT NOT NULL,
        payload     TEXT NOT NULL,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_turn_outbox_turn ON turn_outbox(turn_id, seq)`,
    );
  }

  migrateSessionAgentContextSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS session_agent_context (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        mode TEXT,
        tools_json TEXT NOT NULL,
        write_policy_json TEXT NOT NULL,
        roots_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS fsa_fulfill (
        call_id TEXT PRIMARY KEY,
        result_json TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        fulfilled_at INTEGER
      )
    `);
  }

  /**
   * @param {unknown} tools
   * @param {unknown} writePolicy
   * @param {unknown} roots
   */
  async setSessionContext(tools, writePolicy, roots) {
    this.migrateSessionAgentContextSchema();
    const mode =
      roots && typeof roots === 'object' && roots.mode != null
        ? String(roots.mode)
        : writePolicy && typeof writePolicy === 'object' && writePolicy.mode != null
          ? String(writePolicy.mode)
          : null;
    const toolsJson = JSON.stringify(Array.isArray(tools) ? tools : []);
    const wpJson = JSON.stringify(writePolicy && typeof writePolicy === 'object' ? writePolicy : {});
    const rootsObj = roots && typeof roots === 'object' ? { ...roots } : {};
    if (mode) rootsObj.mode = mode;
    const rootsJson = JSON.stringify(rootsObj);
    this.sql.exec(
      `INSERT INTO session_agent_context (id, mode, tools_json, write_policy_json, roots_json, updated_at)
       VALUES (1, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(id) DO UPDATE SET
         mode = excluded.mode,
         tools_json = excluded.tools_json,
         write_policy_json = excluded.write_policy_json,
         roots_json = excluded.roots_json,
         updated_at = unixepoch()`,
      mode,
      toolsJson,
      wpJson,
      rootsJson,
    );
    return { ok: true, tools: Array.isArray(tools) ? tools.length : 0 };
  }

  async getSessionContext() {
    this.migrateSessionAgentContextSchema();
    const rows = [...this.sql.exec(
      `SELECT mode, tools_json, write_policy_json, roots_json, updated_at
       FROM session_agent_context WHERE id = 1 LIMIT 1`,
    )];
    if (!rows.length) return null;
    const row = rows[0];
    let tools = [];
    let writePolicy = {};
    let roots = {};
    try {
      tools = JSON.parse(String(row.tools_json || '[]'));
    } catch {
      tools = [];
    }
    try {
      writePolicy = JSON.parse(String(row.write_policy_json || '{}'));
    } catch {
      writePolicy = {};
    }
    try {
      roots = JSON.parse(String(row.roots_json || '{}'));
    } catch {
      roots = {};
    }
    if (!Array.isArray(tools) || !tools.length) return null;
    return {
      mode: row.mode != null ? String(row.mode) : roots.mode || null,
      tools,
      writePolicy,
      roots,
      updated_at: row.updated_at,
    };
  }

  /**
   * Park until client POSTs fulfill (awaits so other DO requests can interleave).
   * @param {string} callId
   * @param {{ timeoutMs?: number }} [opts]
   */
  async waitForFsaFulfill(callId, opts = {}) {
    this.migrateSessionAgentContextSchema();
    const id = String(callId || '').trim();
    if (!id) throw new Error('fsa_call_id_required');
    const timeoutMs = Math.min(120000, Math.max(5000, Number(opts.timeoutMs) || 90000));
    this.sql.exec(
      `INSERT INTO fsa_fulfill (call_id, result_json, created_at, fulfilled_at)
       VALUES (?, NULL, unixepoch(), NULL)
       ON CONFLICT(call_id) DO UPDATE SET result_json = NULL, fulfilled_at = NULL, created_at = unixepoch()`,
      id,
    );
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = [
        ...this.sql.exec(
          `SELECT result_json, fulfilled_at FROM fsa_fulfill WHERE call_id = ? LIMIT 1`,
          id,
        ),
      ];
      const row = rows[0];
      if (row && row.fulfilled_at != null && row.result_json != null) {
        const raw = String(row.result_json);
        this.sql.exec(`DELETE FROM fsa_fulfill WHERE call_id = ?`, id);
        try {
          return JSON.parse(raw);
        } catch {
          return { ok: true, content: raw };
        }
      }
      await scheduler.wait(150);
    }
    this.sql.exec(`DELETE FROM fsa_fulfill WHERE call_id = ?`, id);
    throw new Error('fsa_fulfill_timeout');
  }

  /**
   * @param {string} callId
   * @param {unknown} result
   */
  async fulfillFsaRequest(callId, result) {
    this.migrateSessionAgentContextSchema();
    const id = String(callId || '').trim();
    if (!id) return { ok: false, error: 'callId required' };
    const resultJson = JSON.stringify(result ?? {});
    this.sql.exec(
      `INSERT INTO fsa_fulfill (call_id, result_json, created_at, fulfilled_at)
       VALUES (?, ?, unixepoch(), unixepoch())
       ON CONFLICT(call_id) DO UPDATE SET
         result_json = excluded.result_json,
         fulfilled_at = unixepoch()`,
      id,
      resultJson,
    );
    return { ok: true, callId: id };
  }

  /** @param {Request} request */
  async handlePostOutbox(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const turnId = String(body?.turn_id || "").trim();
    if (!turnId) {
      return Response.json({ ok: false, error: "missing_turn_id" }, { status: 400 });
    }

    /** @type {Array<{ event_type: string, payload: unknown }>} */
    let events = [];
    if (Array.isArray(body?.events) && body.events.length) {
      events = body.events
        .map((evt) => ({
          event_type: String(evt?.event_type || "").trim(),
          payload: evt?.payload ?? {},
        }))
        .filter((evt) => evt.event_type);
    } else {
      const eventType = String(body?.event_type || "").trim();
      if (!eventType) {
        return Response.json({ ok: false, error: "missing_turn_id_or_event_type" }, { status: 400 });
      }
      events = [{ event_type: eventType, payload: body?.payload ?? {} }];
    }

    let latestSeq = null;
    for (const evt of events) {
      const payloadJson = JSON.stringify(evt.payload ?? {});
      this.sql.exec(
        `INSERT INTO turn_outbox (turn_id, event_type, payload) VALUES (?, ?, ?)`,
        turnId,
        evt.event_type,
        payloadJson,
      );
      const row = [
        ...this.sql.exec(
          `SELECT seq FROM turn_outbox WHERE turn_id = ? ORDER BY seq DESC LIMIT 1`,
          turnId,
        ),
      ][0];
      latestSeq = Number(row?.seq) || latestSeq;
    }

    return Response.json({
      ok: true,
      seq: latestSeq,
      latest_seq: latestSeq,
      turn_id: turnId,
      count: events.length,
    });
  }

  /** @param {URL} url */
  async handleGetOutbox(url) {
    const turnId = (url.searchParams.get("turn_id") || "").trim();
    if (!turnId) {
      return Response.json({ error: "turn_id required" }, { status: 400 });
    }

    const sinceSeq = Math.max(0, Number(url.searchParams.get("since_seq") || 0) || 0);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 500, 1), 1000);

    const rows = [
      ...this.sql.exec(
        `SELECT seq, turn_id, event_type, payload, created_at
         FROM turn_outbox
         WHERE turn_id = ? AND seq > ?
         ORDER BY seq ASC
         LIMIT ?`,
        turnId,
        sinceSeq,
        limit,
      ),
    ];

    const events = rows.map((r) => {
      let payload = {};
      try {
        payload = r.payload ? JSON.parse(r.payload) : {};
      } catch (_) {
        payload = { raw: r.payload };
      }
      return {
        seq: Number(r.seq),
        turn_id: r.turn_id,
        event_type: r.event_type,
        payload,
        created_at: r.created_at,
      };
    });

    const latestSeq = events.length ? events[events.length - 1].seq : sinceSeq;
    return Response.json({ turn_id: turnId, since_seq: sinceSeq, latest_seq: latestSeq, events });
  }

  /** @param {URL} url */
  handleTurnOutboxStream(url) {
    const turnId = (url.searchParams.get("turn_id") || "").trim();
    if (!turnId) {
      return Response.json({ error: "turn_id required" }, { status: 400 });
    }

    let lastSeq = Math.max(0, Number(url.searchParams.get("since_seq") || 0) || 0);
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
              const batch = [
                ...sql.exec(
                  `SELECT seq, turn_id, event_type, payload, created_at
                   FROM turn_outbox
                   WHERE turn_id = ? AND seq > ?
                   ORDER BY seq ASC
                   LIMIT 100`,
                  turnId,
                  lastSeq,
                ),
              ];

              for (const row of batch) {
                const seqNum = Number(row.seq);
                const chunk = `id: ${seqNum}\nevent: chat_outbox\ndata: ${JSON.stringify({
                  seq: seqNum,
                  turn_id: row.turn_id,
                  event_type: row.event_type,
                  payload: (() => {
                    try {
                      return row.payload ? JSON.parse(row.payload) : {};
                    } catch (_) {
                      return { raw: row.payload };
                    }
                  })(),
                  created_at: row.created_at,
                })}\n\n`;
                controller.enqueue(encoder.encode(chunk));
                lastSeq = seqNum;
                if (row.event_type === "done" || row.event_type === "error") {
                  controller.close();
                  return;
                }
              }

              if (Date.now() - lastKeep >= keepaliveMs) {
                controller.enqueue(encoder.encode(": keepalive\n\n"));
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
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  /** @param {Request} request */
  async handlePostMessage(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const {
      id,
      turn_id = null,
      role,
      content,
      status = "complete",
      error = null,
      model_used = null,
      input_tokens = 0,
      output_tokens = 0,
      tool_calls = null,
    } = body || {};

    if (!role || typeof content !== "string") {
      return Response.json({ ok: false, error: "missing_role_or_content" }, { status: 400 });
    }

    const messageId = id || crypto.randomUUID();
    const toolCallsJson = tool_calls ? JSON.stringify(tool_calls) : null;

    this.sql.exec(
      `INSERT INTO session_messages
         (id, turn_id, role, content, status, error, model_used, input_tokens, output_tokens, tool_calls, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
       ON CONFLICT(id) DO UPDATE SET
         content       = excluded.content,
         status        = excluded.status,
         error         = excluded.error,
         model_used    = excluded.model_used,
         input_tokens  = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         tool_calls    = excluded.tool_calls,
         updated_at    = unixepoch()`,
      messageId,
      turn_id,
      role,
      content,
      status,
      error,
      model_used,
      Number(input_tokens) || 0,
      Number(output_tokens) || 0,
      toolCallsJson,
    );

    return Response.json({ ok: true, id: messageId });
  }

  /**
   * @param {string} id
   * @param {Request} request
   */
  async handlePatchMessage(id, request) {
    if (!id) return Response.json({ ok: false, error: "missing_id" }, { status: 400 });
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const { status, error = null, output_tokens, content } = body || {};
    if (!status) return Response.json({ ok: false, error: "missing_status" }, { status: 400 });

    if (typeof content === "string") {
      this.sql.exec(
        `UPDATE session_messages
         SET status = ?, error = ?, content = ?, output_tokens = COALESCE(?, output_tokens), updated_at = unixepoch()
         WHERE id = ?`,
        status,
        error,
        content,
        output_tokens != null ? Number(output_tokens) : null,
        id,
      );
    } else {
      this.sql.exec(
        `UPDATE session_messages
         SET status = ?, error = ?, output_tokens = COALESCE(?, output_tokens), updated_at = unixepoch()
         WHERE id = ?`,
        status,
        error,
        output_tokens != null ? Number(output_tokens) : null,
        id,
      );
    }

    return Response.json({ ok: true });
  }

  /** @param {URL} url */
  async handleGetHistory(url) {
    const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);
    const cursor = url.searchParams.get("before");

    const rows = cursor
      ? [
          ...this.sql.exec(
            `SELECT * FROM session_messages WHERE created_at < ? ORDER BY created_at DESC LIMIT ?`,
            Number(cursor),
            limit,
          ),
        ]
      : [
          ...this.sql.exec(
            `SELECT * FROM session_messages ORDER BY created_at DESC LIMIT ?`,
            limit,
          ),
        ];

    const messages = rows.reverse().map((r) => ({
      ...r,
      tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : null,
    }));

    return Response.json({ messages });
  }

  async resolvePtyTenantForSession(userId) {
    const param = String(this.ptSessionTenantId || "").trim();
    if (param) return param;
    return await resolvePtyTenantIdForUser(this.env, null, userId || this.ptSessionUserId);
  }

  async applyPtyWorkingDir(tenantId, userId, connection = null) {
    const cwdResult = await resolveTerminalCwd(this.env, {
      connection: connection || this.selectedTerminalConnection,
      tenantId,
      userId,
      workspaceId: this.workspaceId,
    });
    this.ptyWorkingDir = cwdResult.cwd;
    return cwdResult.cwd;
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
    let tenantId = String(this.ptSessionTenantId || "").trim();
    if (!tenantId && this.ptSessionUserId) {
      tenantId = String((await this.resolvePtyTenantForSession(this.ptSessionUserId)) || "").trim();
    }
    if (!tenantId) {
      console.warn("[terminal_history] skip: tenant_id unresolved");
      return;
    }
    const truncated = String(content || "").slice(0, 4000);
    // Prevent duplicate sequence after DO restart: initialize from DB max once per session.
    if (!this.historySequence || this.historySequence < 1) {
      try {
        const row = await this.env.DB.prepare(
          "SELECT COALESCE(MAX(sequence), 0) AS m FROM terminal_history WHERE terminal_session_id = ?",
        )
          .bind(this.cachedTerminalSessionId)
          .first();
        const m = Number(row?.m ?? 0);
        this.historySequence = Number.isFinite(m) && m > 0 ? m : 0;
      } catch (_) {
        this.historySequence = 0;
      }
    }
    this.historySequence = this.historySequence + 1;
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
    const wid = String(this.workspaceId || "").trim();
    if (!this.env?.DB || !wid) {
      this.workspaceSettings = {};
      return this.workspaceSettings;
    }
    const row = await this.env.DB.prepare(
      "SELECT settings_json FROM workspace_settings WHERE workspace_id = ?"
    ).bind(wid).first();
    if (String(this.workspaceId || "").trim() !== wid) {
      return this.workspaceSettings;
    }
    try {
      const parsed = row?.settings_json ? JSON.parse(row.settings_json) : {};
      this.workspaceSettings = parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      this.workspaceSettings = {};
    }
    return this.workspaceSettings;
  }

  /**
   * @param {string|null|undefined} workspaceId
   * @param {{ allowPlatformFallback?: boolean }} [opts] — When true only: may load `env.WORKSPACE_ID` and log platform scope. Default false: no env fallback (empty id → empty settings, no D1 row).
   */
  async ensureWorkspaceSettingsLoaded(workspaceId, opts = {}) {
    const allowPlatformFallback = opts.allowPlatformFallback === true;
    const trimmed = String(workspaceId || "").trim();
    let nextWorkspaceId = trimmed;

    if (!nextWorkspaceId && allowPlatformFallback) {
      const plat =
        this.env?.WORKSPACE_ID != null && String(this.env.WORKSPACE_ID).trim() !== ""
          ? String(this.env.WORKSPACE_ID).trim()
          : "";
      if (plat) {
        console.log(
          "[AgentChatSqlV1] platform-scoped workspace settings: using WORKSPACE_ID (allowPlatformFallback=true)",
        );
        nextWorkspaceId = plat;
      }
    }

    if (this.workspaceId !== nextWorkspaceId) {
      this.workspaceId = nextWorkspaceId;
      this.workspaceSettings = {};
    }

    if (!nextWorkspaceId) {
      this.workspaceSettingsPromise = null;
      this.workspaceSettings = {};
      return this.workspaceSettings;
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
      const httpStatus = status?.ok === false ? 400 : 200;
      return Response.json(status, { status: httpStatus });
    }

    if (url.pathname === "/terminal/exec" && request.method === "POST") {
      return this.handleTerminalExec(request, url);
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, class: 'AgentChatSqlV1' });
    }

    if (url.pathname === "/message" && request.method === "POST") {
      return this.handlePostMessage(request);
    }

    if (url.pathname.startsWith("/message/") && request.method === "PATCH") {
      const messageId = url.pathname.split("/")[2] || "";
      return this.handlePatchMessage(messageId, request);
    }

    if (url.pathname === "/history" && request.method === "GET") {
      return this.handleGetHistory(url);
    }

    if (url.pathname === "/wipe" && request.method === "POST") {
      try {
        this.sql.exec('DELETE FROM turn_outbox');
        this.sql.exec('DELETE FROM session_messages');
        this.sql.exec('DELETE FROM session_rag_cache');
      } catch (e) {
        return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
      }
      return Response.json({ ok: true, wiped: true });
    }

    if (url.pathname === "/outbox" && request.method === "POST") {
      return this.handlePostOutbox(request);
    }

    if (url.pathname === "/outbox/stream" && request.method === "GET") {
      return this.handleTurnOutboxStream(url);
    }

    if (url.pathname === "/outbox" && request.method === "GET") {
      return this.handleGetOutbox(url);
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

    if (url.pathname === '/session-context' && request.method === 'GET') {
      const ctx = await this.getSessionContext();
      if (!ctx) return Response.json({ empty: true });
      return Response.json(ctx);
    }

    if (url.pathname === '/session-context' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const out = await this.setSessionContext(body.tools, body.writePolicy, {
        ...(body.roots && typeof body.roots === 'object' ? body.roots : {}),
        mode: body.mode ?? body.roots?.mode,
      });
      return Response.json(out);
    }

    if (url.pathname === '/fsa/wait' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      try {
        const result = await this.waitForFsaFulfill(body.callId, {
          timeoutMs: body.timeoutMs,
        });
        return Response.json(result);
      } catch (e) {
        return Response.json(
          { error: String(e?.message || e || 'fsa_wait_failed') },
          { status: 408 },
        );
      }
    }

    if (url.pathname === '/fsa/fulfill' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const out = await this.fulfillFsaRequest(body.callId, body.result);
      return Response.json(out, { status: out.ok ? 200 : 400 });
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
                         OR (
                           COALESCE(json_extract(envelope_json, '$.type'), '') = 'cad_glb_ready'
                           AND (
                             COALESCE(json_extract(envelope_json, '$.agent_run_id'), '') = ?
                             OR COALESCE(json_extract(envelope_json, '$.agent_run_id'), '') = ''
                           )
                         )
                       )
                     ORDER BY id ASC LIMIT 50`,
                    lastId,
                    runId,
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
                    if (
                      String(o?.payload?.workflow_run_id || '') === runId ||
                      String(o?.workflow_run_id || '') === runId
                    ) {
                      return true;
                    }
                    if (String(o?.type || '') === 'cad_glb_ready') {
                      const evtRun = String(o?.agent_run_id || '').trim();
                      return !evtRun || evtRun === runId;
                    }
                    return false;
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
    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const uidRaw = (url.searchParams.get("user_id") || "").trim();
    if (!uidRaw) {
      return new Response(JSON.stringify({ error: "TERMINAL_USER_ID_REQUIRED", code: "TERMINAL_USER_ID_REQUIRED" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    this.ptSessionUserId = uidRaw;
    const preSessionId = (url.searchParams.get("session_id") || "").trim();
    const preSessionToken = (url.searchParams.get("session_token") || "").trim();
    if (preSessionId) {
      this.cachedTerminalSessionId = preSessionId;
      await this.ctx.storage.put("terminal_session_id", preSessionId);
    }
    if (preSessionToken) {
      this.ptSessionMintedToken = preSessionToken;
    }
    this.ptSessionTenantId = (url.searchParams.get("tenant_id") || "").trim();
    this.ptPersonUuid = (url.searchParams.get("person_uuid") || "").trim();
    this.terminalShellOverride = normalizeShellOverride(url.searchParams.get("shell"));
    this.requestedTargetType = (url.searchParams.get("target_type") || "platform_vm").trim();
    this.requestedConnectionId = (url.searchParams.get("connection_id") || "").trim();
    this.selectedTargetType = this.requestedTargetType || "platform_vm";
    await this.ensureWorkspaceSettingsLoaded(workspaceId, { allowPlatformFallback: false });
    await this.persistPtySessionContext();

    let tenantForRow = await this.resolvePtyTenantForSession(this.ptSessionUserId);
    tenantForRow = tenantForRow != null ? String(tenantForRow).trim() : "";
    if (!tenantForRow) {
      return new Response(JSON.stringify({ error: "TENANT_CONTEXT_REQUIRED", code: "TENANT_CONTEXT_REQUIRED" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    this.ptSessionTenantId = tenantForRow;
    const tokRes = await assertWorkspaceTokenForPty(this.env, workspaceId, tenantForRow);
    if (!tokRes.ok) {
      return new Response(JSON.stringify({ error: "no active workspace token", message: "no active workspace token" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (this.env?.DB) {
      try {
        const sel = await getSelectedTerminalConnection(this.env.DB, {
          userId: this.ptSessionUserId,
          workspaceId,
          tenantId: tenantForRow,
          connectionId: this.requestedConnectionId || null,
          targetType: this.requestedTargetType || null,
          healthAware: true,
        });
        this.selectedTerminalConnection = sel.connection;
        if (sel.connection?.target_type) {
          this.selectedTargetType = String(sel.connection.target_type).trim();
        }
      } catch (_) {}
    }

    await this.applyPtyWorkingDir(tenantForRow, this.ptSessionUserId, this.selectedTerminalConnection);
    await this.persistPtySessionContext();

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server, [TERMINAL_WS_TAG, `mode:${executionMode}`]);
    server.serializeAttachment({ kind: TERMINAL_WS_TAG, execution_mode: executionMode });

    const sid = await this.getOrCreateTerminalSessionId();
    try {
      server.send(JSON.stringify({ type: "session_id", session_id: sid }));
    } catch (_) {}
    let personForRow = this.ptPersonUuid ? String(this.ptPersonUuid).trim() || null : null;
    if (!personForRow) {
      try {
        const ur = await this.env.DB.prepare(`SELECT person_uuid FROM auth_users WHERE id = ? LIMIT 1`)
          .bind(this.ptSessionUserId)
          .first();
        personForRow = ur?.person_uuid ? String(ur.person_uuid).trim() || null : null;
      } catch (_) {}
    }
    if (tenantForRow && workspaceId && this.ptSessionUserId) {
      await this.upsertTerminalSessionRow(sid, {
        tenantId: tenantForRow,
        userId: this.ptSessionUserId,
        workspaceId,
        personUuid: personForRow,
      });
    }

    this.sendStateToWebSocket(server, "connecting");
    try {
      await this.ensureModeReady(executionMode, {
        workspaceId,
        userId: this.ptSessionUserId,
        targetType: this.requestedTargetType,
      });
      if (executionMode === "pty" && this.env?.DB) {
        const doId = this.ctx.id.toString();
        const wid = String(this.workspaceId || workspaceId || "").trim();
        let personUuid = personForRow;
        const tid = tenantForRow ? String(tenantForRow).trim() : null;
        if (!tid) throw new Error("PTY tenant_id missing");
        const boot = await resolveActiveBootstrap(this.env, {
          userId: this.ptSessionUserId,
          personUuid,
          tenantId: tid,
          workspaceId: wid,
        });
        if (boot?.id) {
          await this.env.DB.prepare(
            `UPDATE agentsam_bootstrap SET terminal_session_id = ?, agent_session_id = ?, updated_at = datetime('now') WHERE id = ?`,
          )
            .bind(sid, doId, boot.id)
            .run()
            .catch(() => {});
        }
        if (wid) {
          await this.env.DB.prepare(
            `INSERT INTO agentsam_workspace_state (workspace_id, agent_session_id, workspace_type, updated_at)
             VALUES (?, ?, 'ide', unixepoch())
             ON CONFLICT(workspace_id) DO UPDATE SET
               agent_session_id = excluded.agent_session_id,
               updated_at = excluded.updated_at`,
          ).bind(wid, doId).run().catch(() => {});
        }
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
    if (!workspaceId) {
      return Response.json(
        { ok: false, error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING },
        { status: 400 },
      );
    }
    const uid =
      String(url.searchParams.get("user_id") || body?.user_id || "").trim();
    if (uid) this.ptSessionUserId = uid;
    const tidParam = String(url.searchParams.get("tenant_id") || "").trim();
    if (tidParam) this.ptSessionTenantId = tidParam;
    const pParam = String(url.searchParams.get("person_uuid") || body?.person_uuid || "").trim();
    if (pParam) this.ptPersonUuid = pParam;
    const targetId = String(body?.target_id || body?.ssh_target_id || "").trim() || null;
    const routing = resolveTerminalExecRouting({
      tool_name: body?.tool_name,
      target_id: targetId,
      target_type: body?.target_type || url.searchParams.get("target_type"),
      user_id: uid || this.ptSessionUserId,
    });
    if (routing.target_type) {
      this.requestedTargetType = routing.target_type;
      this.selectedTargetType = routing.target_type;
    }
    const pinnedConnectionId = routing.target_id || targetId;
    this.requestedToolName = String(body?.tool_name || "").trim();
    if (pinnedConnectionId) {
      this.requestedConnectionId = pinnedConnectionId;
      this.selectedTerminalConnection = null;
    }
    await this.ensureWorkspaceSettingsLoaded(workspaceId, { allowPlatformFallback: false });

    const execUidForGate = String(this.ptSessionUserId || url.searchParams.get("user_id") || "").trim();
    const gcpOperatorPtyBypass =
      routing.lane === "gcp_primary" &&
      isSamOperatorLaneUserId(execUidForGate) &&
      (!pinnedConnectionId || pinnedConnectionId === TERMINAL_GCP_CONNECTION_ID);

    if (executionMode === "pty" && this.env?.DB && !gcpOperatorPtyBypass) {
      let tidEx = await this.resolvePtyTenantForSession(this.ptSessionUserId);
      tidEx = tidEx != null ? String(tidEx).trim() : "";
      if (!tidEx) {
        return Response.json({ ok: false, error: "TENANT_CONTEXT_REQUIRED", code: "TENANT_CONTEXT_REQUIRED" }, { status: 403 });
      }
      const tokEx = await assertWorkspaceTokenForPty(this.env, workspaceId, tidEx);
      if (!tokEx.ok) {
        return Response.json(
          { ok: false, error: "no active workspace token", message: "no active workspace token" },
          { status: 403 },
        );
      }
      let connForCwd = this.selectedTerminalConnection;
      if (!connForCwd) {
        try {
          const sel = await getSelectedTerminalConnection(this.env.DB, {
            userId: String(this.ptSessionUserId || "").trim(),
            workspaceId,
            tenantId: tidEx,
            connectionId: pinnedConnectionId,
            targetType: this.requestedTargetType || routing.target_type || "platform_vm",
            healthAware: true,
          });
          connForCwd = sel.connection;
          this.selectedTerminalConnection = connForCwd;
          if (connForCwd?.target_type) {
            this.selectedTargetType = String(connForCwd.target_type).trim();
          }
        } catch (_) {}
      }
      await this.applyPtyWorkingDir(tidEx, this.ptSessionUserId, connForCwd);
    }

    const command = String(body?.command || "").trim();

    if (command) {
      let effectiveTargetId =
        pinnedConnectionId ||
        String(this.requestedConnectionId || "").trim() ||
        String(this.selectedTerminalConnection?.id || "").trim() ||
        null;
      if (!effectiveTargetId && this.env?.DB) {
        try {
          const sel = await getSelectedTerminalConnection(this.env.DB, {
            userId: String(this.ptSessionUserId || "").trim(),
            workspaceId,
            tenantId: String(this.ptSessionTenantId || "").trim() || null,
            connectionId: pinnedConnectionId,
            targetType: this.requestedTargetType || routing.target_type || "platform_vm",
            healthAware: true,
          });
          effectiveTargetId = sel?.connection?.id ? String(sel.connection.id).trim() : null;
          if (sel.connection) {
            this.selectedTerminalConnection = sel.connection;
            this.selectedTargetType = String(sel.connection.target_type || this.selectedTargetType || "platform_vm").trim();
          }
        } catch (_) {}
      }
      const lookupId = await resolvePrivilegedTargetLookupId(this.env?.DB, effectiveTargetId);
      const sudoCheck = await checkSudoPermission(this.env, lookupId || effectiveTargetId, command);
      if (!sudoCheck.allowed) {
        return Response.json(formatTerminalExec403(sudoCheck), { status: 403 });
      }
    }

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
        exec_identity: result?.exec_identity ?? null,
        privileged_target_id: result?.privileged_target_id ?? null,
        error: result?.error ?? null,
      });
    } catch (e) {
      return Response.json({ ok: false, execution_mode: executionMode, error: String(e?.message || e) }, { status: 500 });
    }
  }

  async getTerminalStatus(url) {
    const workspaceId = (url.searchParams.get("workspace_id") || "").trim();
    if (!workspaceId) {
      return {
        ok: false,
        error: WORKSPACE_CONTEXT_MISSING,
        code: WORKSPACE_CONTEXT_MISSING,
      };
    }
    const uid = (url.searchParams.get("user_id") || "").trim();
    if (uid) this.ptSessionUserId = uid;
    const tid = (url.searchParams.get("tenant_id") || "").trim();
    if (tid) this.ptSessionTenantId = tid;
    const pu = (url.searchParams.get("person_uuid") || "").trim();
    if (pu) this.ptPersonUuid = pu;
    await this.ensureWorkspaceSettingsLoaded(workspaceId, { allowPlatformFallback: false });
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

  async upsertTerminalSessionRow(sessionId, opts) {
    const { tenantId, userId, workspaceId, personUuid } = opts;
    if (!this.env?.DB || !sessionId) return;
    const tid = String(tenantId || "").trim();
    const uid = String(userId || "").trim();
    const wid = String(workspaceId || "").trim();
    if (!tid || !uid || !wid) return;
    const now = Math.floor(Date.now() / 1000);
    const pid = personUuid != null && String(personUuid).trim() !== "" ? String(personUuid).trim() : null;
    let authHash = "";
    let _mintedToken = null; // rawToken for token_mint connections
    try {
      // conn resolved below — reorder: get conn first, then decide hash strategy
      authHash = await computeTerminalSessionAuthTokenHash(this.env, sessionId);
    } catch (_) {
      authHash = "";
    }
    let conn = null;
    try {
      const sel = await getSelectedTerminalConnection(this.env.DB, {
        userId: uid,
        workspaceId: wid,
        tenantId: tid,
        connectionId: this.requestedConnectionId || null,
        targetType: this.requestedTargetType || null,
        healthAware: true,
      });
      conn = sel.connection;
      this.selectedTerminalConnection = conn;
      this.selectedTargetType = String(conn?.target_type || this.requestedTargetType || "platform_vm").trim();
    } catch (_) {}
    const shellVal = String(this.terminalShellOverride || conn?.shell || "/bin/zsh").trim() || "/bin/zsh";
    const connectionId = conn?.id != null && String(conn.id).trim() !== "" ? String(conn.id).trim() : null;
    const cwdResult = await resolveTerminalCwd(this.env, {
      connection: conn,
      tenantId: tid,
      userId: uid,
      workspaceId: wid,
    });
    const cwdVal = cwdResult.cwd || "";
    if (conn?.auth_mode === 'token_mint') {
      const existingMint = this.ptSessionMintedToken != null ? String(this.ptSessionMintedToken).trim() : '';
      if (existingMint) {
        try {
          authHash = await sha256HexUtf8(existingMint);
          _mintedToken = existingMint;
        } catch (_) {}
      } else {
        try {
          const { rawToken, tokenHash } = await mintSessionToken();
          authHash = tokenHash;
          _mintedToken = rawToken;
          this.ptSessionMintedToken = rawToken;
        } catch (_) {}
      }
    }
    const agentSessionId = this.state?.id?.toString?.() || this.ctx?.id?.toString?.() || null;
    try {
      await this.env.DB.prepare(
        `INSERT INTO terminal_sessions (id, tenant_id, user_id, workspace_id, person_uuid, tunnel_url, cols, rows, shell, cwd, status, auth_token_hash, prefs_json, created_at, updated_at, connection_id, agent_session_id)
         VALUES (?, ?, ?, ?, ?, '', 220, 50, ?, ?, 'active', ?, '{}', ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           tenant_id = excluded.tenant_id,
           user_id = excluded.user_id,
           workspace_id = excluded.workspace_id,
           person_uuid = excluded.person_uuid,
           auth_token_hash = COALESCE(excluded.auth_token_hash, auth_token_hash),
           shell = COALESCE(excluded.shell, shell),
           cwd = COALESCE(NULLIF(excluded.cwd, ''), cwd),
           connection_id = COALESCE(excluded.connection_id, connection_id),
           agent_session_id = COALESCE(excluded.agent_session_id, agent_session_id),
           status = 'active',
           updated_at = excluded.updated_at`,
      )
        .bind(sessionId, tid, uid, wid, pid, shellVal, cwdVal, authHash || null, now, now, connectionId, agentSessionId)
        .run();
    } catch (e) {
      console.warn("[terminal_sessions upsert]", e?.message);
    }
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

  async ensureModeReady(mode, opts = {}) {
    if (mode === "pty") await this.ensurePtyConnected(opts);
    if (mode === "ssh") {
      if (parseSshTargets(this.env).length === 0) throw new Error("SSH targets are not configured");
    }
    if (mode === "mcp") {
      const token = String(this.env?.MCP_AUTH_TOKEN || "").trim();
      if (!token) throw new Error("MCP_AUTH_TOKEN is not configured");
    }
  }

  /**
   * Persist PTY routing context across Durable Object hibernation.
   * In-memory fields are cleared on wake; without this, keystrokes hit connectPty with empty workspace_id.
   */
  async persistPtySessionContext() {
    try {
      await this.ctx.storage.put("pty_session_ctx", {
        workspaceId: String(this.workspaceId || "").trim(),
        userId: String(this.ptSessionUserId || "").trim(),
        tenantId: String(this.ptSessionTenantId || "").trim(),
        personUuid: String(this.ptPersonUuid || "").trim(),
        targetType: String(this.requestedTargetType || this.selectedTargetType || "").trim(),
        connectionId: String(this.requestedConnectionId || "").trim(),
        shell: String(this.terminalShellOverride || "").trim(),
        updatedAt: Date.now(),
      });
    } catch (_) {}
  }

  async restorePtySessionContext() {
    try {
      const ctx = await this.ctx.storage.get("pty_session_ctx");
      if (!ctx || typeof ctx !== "object") return;
      if (!String(this.workspaceId || "").trim() && ctx.workspaceId) {
        this.workspaceId = String(ctx.workspaceId).trim();
      }
      if (!String(this.ptSessionUserId || "").trim() && ctx.userId) {
        this.ptSessionUserId = String(ctx.userId).trim();
      }
      if (!String(this.ptSessionTenantId || "").trim() && ctx.tenantId) {
        this.ptSessionTenantId = String(ctx.tenantId).trim();
      }
      if (!String(this.ptPersonUuid || "").trim() && ctx.personUuid) {
        this.ptPersonUuid = String(ctx.personUuid).trim();
      }
      if (ctx.targetType && (!this.requestedTargetType || this.requestedTargetType === "platform_vm")) {
        this.requestedTargetType = String(ctx.targetType).trim();
        this.selectedTargetType = this.requestedTargetType;
      }
      if (ctx.connectionId && !String(this.requestedConnectionId || "").trim()) {
        this.requestedConnectionId = String(ctx.connectionId).trim();
      }
      if (ctx.shell && !String(this.terminalShellOverride || "").trim()) {
        this.terminalShellOverride = String(ctx.shell).trim();
      }
    } catch (_) {}
  }

  async ensurePtyConnected(opts = {}) {
    if (opts?.workspaceId) {
      const w = String(opts.workspaceId).trim();
      if (w) this.workspaceId = w;
    }
    if (opts?.userId) {
      const u = String(opts.userId).trim();
      if (u) this.ptSessionUserId = u;
    }
    if (opts?.targetType) {
      const t = String(opts.targetType).trim();
      if (t) {
        this.requestedTargetType = t;
        this.selectedTargetType = t;
      }
    }
    await this.restorePtySessionContext();
    if (this.ptyWs && this.ptyWs.readyState === 1) return;
    if (this.ptyConnectPromise) return this.ptyConnectPromise;
    this.ptyConnectPromise = this.connectPty().finally(() => {
      this.ptyConnectPromise = null;
    });
    return this.ptyConnectPromise;
  }

  async connectPty() {
    await this.restorePtySessionContext();
    const wid = String(this.workspaceId || "").trim();
    if (!wid) throw new Error("PTY workspace_id missing");
    const uid = String(this.ptSessionUserId || "").trim();
    if (!uid) throw new Error("PTY user_id missing");
    let tid = await this.resolvePtyTenantForSession(uid);
    tid = tid != null ? String(tid).trim() : "";
    if (!tid) throw new Error("PTY tenant_id missing");
    this.ptSessionTenantId = tid;
    await this.persistPtySessionContext();

    let conn = null;
    if (this.env?.DB) {
      try {
        const sel = await getSelectedTerminalConnection(this.env.DB, {
          userId: uid,
          workspaceId: wid,
          tenantId: tid,
          connectionId: this.requestedConnectionId || null,
          targetType: this.requestedTargetType || null,
          healthAware: true,
        });
        conn = sel.connection;
        this.selectedTerminalConnection = conn;
        if (sel.error === "connection_forbidden") throw new Error("connection_forbidden");
        if (sel.error === "unsupported_target_type") throw new Error("unsupported_target_type");
      } catch (e) {
        if (e?.message === "connection_forbidden" || e?.message === "unsupported_target_type") throw e;
      }
    }

    const targetType = String(
      this.requestedTargetType || this.selectedTargetType || conn?.target_type || "platform_vm",
    ).trim();

    if (targetType === "ssh_target") throw new Error("ssh_target_not_enabled");

    this.selectedTargetType = targetType;
    await this.applyPtyWorkingDir(tid, uid, conn);

    let resolvedWsUrl = null;
    if (conn?.ws_url?.trim()) resolvedWsUrl = conn.ws_url.trim();
    let token =
      (await resolveConnectionAuthToken(this.env, conn, uid, wid)) ||
      String(this.env?.PTY_AUTH_TOKEN || this.env?.TERMINAL_SECRET || "").trim();

    const shellOpt =
      String(this.terminalShellOverride || conn?.shell || "/bin/zsh").trim() || "/bin/zsh";
    const cwdResult = await resolveTerminalCwd(this.env, {
      connection: conn,
      tenantId: tid,
      userId: uid,
      workspaceId: wid,
    });
    const cwdOpt = cwdResult.cwd != null ? String(cwdResult.cwd).trim() : "";

    const usePtyService = targetType === "platform_vm" && !!this.env?.PTY_SERVICE;

    // VPC Service path — authoritative only for platform_vm
    if (usePtyService) {
      try {
        const vpcUrl = new URL("http://localhost:3099/terminal");
        vpcUrl.searchParams.set("tenant_id", tid);
        vpcUrl.searchParams.set("user_id", uid);
        vpcUrl.searchParams.set("workspace_id", wid);
        vpcUrl.searchParams.set("shell", shellOpt);
        if (cwdOpt) vpcUrl.searchParams.set("cwd", cwdOpt);
        if (conn?.auth_mode === "token_mint") {
          const minted = this.ptSessionMintedToken != null ? String(this.ptSessionMintedToken).trim() : "";
          const sid = await this.getOrCreateTerminalSessionId().catch(() => "");
          if (minted && sid) {
            vpcUrl.searchParams.set("session_id", sid);
            vpcUrl.searchParams.set("session_token", minted);
          }
        }
        const resp = await this.env.PTY_SERVICE.fetch(
          new Request(vpcUrl.toString(), {
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

    // Public tunnel / connection ws_url fallback
    const workspaceUrl =
      targetType === "platform_vm" ? this.workspaceSettings?.terminal_ws_url : null;
    let rawUrl = null;
    if (targetType === "user_hosted_tunnel" || targetType === "sandbox") {
      rawUrl = resolvedWsUrl;
      if (!rawUrl) {
        throw new Error(
          targetType === "sandbox" ? "sandbox_unreachable" : "user_hosted_tunnel_unreachable",
        );
      }
    } else {
      rawUrl = workspaceUrl || resolvedWsUrl || String(this.env?.TERMINAL_WS_URL || "").trim();
    }
    if (!rawUrl || !token) {
      throw new Error(
        targetType === "user_hosted_tunnel"
          ? "user_hosted_tunnel_unreachable"
          : targetType === "sandbox"
            ? "sandbox_unreachable"
            : "PTY backend is not configured — set PTY_SERVICE (vpc_services) or TERMINAL_WS_URL + PTY_AUTH_TOKEN",
      );
    }
    let wsUrl = normalizeWebSocketUrl(rawUrl);
    const sep = wsUrl.includes("?") ? "&" : "?";
    wsUrl = `${wsUrl}${sep}token=${encodeURIComponent(token)}&tenant_id=${encodeURIComponent(tid)}&user_id=${encodeURIComponent(uid)}&workspace_id=${encodeURIComponent(wid)}`;
    const shellSep = wsUrl.includes("?") ? "&" : "?";
    wsUrl = `${wsUrl}${shellSep}shell=${encodeURIComponent(shellOpt)}`;
    if (cwdOpt) {
      const s2 = wsUrl.includes("?") ? "&" : "?";
      wsUrl = `${wsUrl}${s2}cwd=${encodeURIComponent(cwdOpt)}`;
    }
    if (conn?.auth_mode === "token_mint") {
      const minted = this.ptSessionMintedToken != null ? String(this.ptSessionMintedToken).trim() : "";
      const sid = await this.getOrCreateTerminalSessionId().catch(() => "");
      if (minted && sid) {
        const s3 = wsUrl.includes("?") ? "&" : "?";
        wsUrl = `${wsUrl}${s3}session_id=${encodeURIComponent(sid)}&session_token=${encodeURIComponent(minted)}`;
      }
    }
    const wsResp = await fetch(toFetchWebSocketUrl(wsUrl), {
      headers: {
        "Upgrade": "websocket",
        "Connection": "Upgrade",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
      }
    });
    if (wsResp.status !== 101 || !wsResp.webSocket) {
      throw new Error(`websocket_attach_failed: PTY connect failed (${wsResp.status})`);
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

  async _ptyExecPayload(command) {
    const uid = String(this.ptSessionUserId || "").trim();
    const tid = String(this.ptSessionTenantId || "").trim();
    const wid = String(this.workspaceId || "").trim();
    let cwd = String(this.ptyWorkingDir || "").trim();
    const conn = this.selectedTerminalConnection;
    let settings = null;
    if (wid && this.env?.DB) {
      const { loadWorkspaceSettingsJson } = await import("../core/pty-workspace-paths.js");
      settings = await loadWorkspaceSettingsJson(this.env, wid);
    }
    if (!cwd && wid && this.env?.DB) {
      const r = await resolveTerminalCwd(this.env, {
        connection: conn,
        tenantId: tid,
        userId: uid,
        workspaceId: wid,
      });
      cwd = r?.cwd ? String(r.cwd).trim() : "";
      if (cwd) this.ptyWorkingDir = cwd;
    }
    const { normalizeExecCwdForConnection } = await import("../core/host-workspace-paths.js");
    const normalized = normalizeExecCwdForConnection(cwd, conn, settings);
    const payload = { command };
    if (normalized) payload.cwd = normalized;
    return payload;
  }

  async executePtyCommand(command) {
    const execUid = String(this.ptSessionUserId || "").trim();
    const execWid = String(this.workspaceId || "").trim();
    const routing = resolveTerminalExecRouting({
      target_id: this.requestedConnectionId,
      target_type: this.requestedTargetType,
      tool_name: this.requestedToolName || null,
      user_id: execUid,
    });
    const execTarget =
      String(this.selectedTargetType || this.requestedTargetType || routing.target_type || "").trim() ||
      "platform_vm";
    const pinnedId =
      String(this.requestedConnectionId || routing.target_id || "").trim() || null;
    // Always re-resolve for user_hosted_tunnel — DO-cached conn often lacks identity columns.
    let conn = pinnedId || execTarget === "user_hosted_tunnel" ? null : this.selectedTerminalConnection;
    if (!conn && this.env?.DB) {
      try {
        const sel = await getSelectedTerminalConnection(this.env.DB, {
          userId: execUid,
          workspaceId: execWid,
          tenantId: String(this.ptSessionTenantId || "").trim() || null,
          connectionId: pinnedId,
          targetType: execTarget,
          healthAware: true,
        });
        conn = sel.connection;
        if (conn) {
          this.selectedTerminalConnection = conn;
          this.selectedTargetType = String(conn.target_type || execTarget).trim();
        }
      } catch (_) {}
    }
    const execIdentity = await resolveTerminalExecIdentity(this.env?.DB, conn);
    if (
      (execTarget === "user_hosted_tunnel" || String(conn?.target_type || "").trim() === "user_hosted_tunnel") &&
      !execIdentity.execUser
    ) {
      console.warn(
        "[terminal] mac_local_missing_exec_identity",
        JSON.stringify({
          connection_id: conn?.id || null,
          platform: conn?.platform || null,
          remote_exec_user: conn?.remote_exec_user || null,
          username: conn?.username || null,
        }),
      );
      return {
        error:
          "IAM Security: X-IAM-Exec-Identity required (terminal_connections.remote_exec_user/username missing for this Mac tunnel)",
      };
    }
    const execHeaders = buildExecTransportHeaders({
      ...execIdentity,
      userId: execUid,
    });
    const execPayload = await this._ptyExecPayload(command);

    const targetType = String(this.selectedTargetType || "platform_vm").trim();
    const usePtyService = targetType === "platform_vm" && !!this.env?.PTY_SERVICE;
    if (usePtyService) {
      try {
        const res = await this.env.PTY_SERVICE.fetch(
          new Request("http://localhost:3099/exec", {
            method: "POST",
            headers: execHeaders,
            body: JSON.stringify(execPayload),
            signal: AbortSignal.timeout(120_000),
          }),
        );
        const data = await res.json().catch(() => ({}));
      if (!res.ok) {
          const detail =
            (typeof data?.stderr === 'string' && data.stderr.trim()) ||
            (typeof data?.error === 'string' && data.error.trim()) ||
            `PTY command failed (${res.status})`;
          return { error: String(detail) };
        }
        const stdout = typeof data?.stdout === "string" ? data.stdout : "";
        const stderr = typeof data?.stderr === "string" ? data.stderr : "";
        const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim() || "(no output)";
        void this.recordExecTerminalHistory(command, output, data?.exit_code ?? 0);
        return {
          output,
          exit_code: data?.exit_code ?? 0,
          exec_identity: execIdentity.execUser,
          privileged_target_id: execIdentity.privilegedTargetId,
          target_id: conn?.id ? String(conn.id) : pinnedId,
        };
      } catch (e) {
        return { error: e?.message || "PTY VPC exec failed" };
      }
    }

    let execBase = String(this.env?.TERMINAL_WS_URL || "").trim();
    let dbTok = null;
    if (execTarget === "user_hosted_tunnel" || execTarget === "sandbox") {
      execBase = conn?.ws_url?.trim() || "";
      if (!execBase) {
        throw new Error(execTarget === "sandbox" ? "sandbox_unreachable" : "user_hosted_tunnel_unreachable");
      }
    } else if (conn?.ws_url?.trim()) {
      execBase = conn.ws_url.trim();
    }
    if (conn) {
      const resolved = await resolveConnectionAuthToken(
        this.env,
        conn,
        String(this.ptSessionUserId || "").trim() || null,
        execWid,
      );
      if (resolved) dbTok = resolved;
    }
    const execUrl = normalizeExecHttpUrl(execBase);
    if (!execUrl) throw new Error("Terminal /exec endpoint is not configured");
    const tokens = Array.from(
      new Set(
        [
          dbTok,
          String(this.env?.PTY_AUTH_TOKEN || "").trim(),
          String(this.env?.TERMINAL_SECRET || "").trim(),
        ].filter(Boolean),
      ),
    );
    if (tokens.length === 0) throw new Error("No terminal auth token configured");

    let lastStatus = 500;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const res = await fetch(execUrl, {
        method: "POST",
        headers: {
          ...execHeaders,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(execPayload),
        signal: AbortSignal.timeout(120_000),
      });
      lastStatus = res.status;
      if (res.status === 401 && i < tokens.length - 1) continue;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          (typeof data?.stderr === 'string' && data.stderr.trim()) ||
          (typeof data?.error === 'string' && data.error.trim()) ||
          `PTY command failed (${res.status})`;
        return { error: String(detail) };
      }
      const stdout = typeof data?.stdout === "string" ? data.stdout : "";
      const stderr = typeof data?.stderr === "string" ? data.stderr : "";
      const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim() || "(no output)";
      void this.recordExecTerminalHistory(command, output, data?.exit_code ?? 0);
      return {
        output,
        exit_code: data?.exit_code ?? 0,
        exec_identity: execIdentity.execUser,
        privileged_target_id: execIdentity.privilegedTargetId,
        target_id: conn?.id ? String(conn.id) : pinnedId,
      };
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
        const raw = messageToString(message);
        let slashLine = null;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.type === "slash" && typeof parsed?.line === "string") {
            slashLine = parsed.line.trim();
          } else if (
            parsed?.type === "input" &&
            typeof parsed?.data === "string" &&
            /^\/[a-zA-Z]/.test(parsed.data.trim())
          ) {
            slashLine = parsed.data.trim();
          } else if (parsed?.type === "resize") {
            await this.ensurePtyConnected();
            if (this.ptyWs && this.ptyWs.readyState === 1) {
              this.ptyWs.send(JSON.stringify(parsed));
            }
            return;
          }
        } catch (_) {
          if (/^\/[a-zA-Z]/.test(raw.trim())) slashLine = raw.trim();
        }

        if (slashLine) {
          const sid = await this.getOrCreateTerminalSessionId();
          const tenantId = await this.resolvePtyTenantForSession(this.ptSessionUserId);
          await handleTerminalSlashCommand(this.env, {
            line: slashLine,
            userId: this.ptSessionUserId,
            workspaceId: this.workspaceId,
            tenantId,
            sessionId: sid,
            broadcast: (text) => this.broadcastTerminalOutput(text),
          });
          return;
        }

        await this.ensurePtyConnected();
        if (!this.ptyWs || this.ptyWs.readyState !== 1) throw new Error("PTY socket not ready");
        let recordLine = null;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.type === "input" && typeof parsed?.data === "string" && /[\r\n]/.test(parsed.data)) {
            recordLine = parsed.data.replace(/[\r\n]+$/, "").trim();
          }
        } catch (_) {
          if (/[\r\n]/.test(raw)) recordLine = raw.replace(/[\r\n]+$/, "").trim();
        }
        if (recordLine && recordLine.length > 0 && !isShellHistorySeedLine(recordLine)) {
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
