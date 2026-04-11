/**
 * Core Layer: Durable Objects
 * Stateful collaborative sessions, SQL-backed agent chat + RAG cache,
 * and legacy migration stubs.
 *
 * Classes exported here must match wrangler.jsonc / wrangler.production.toml
 * durable_objects bindings exactly.
 */
import { DurableObject } from 'cloudflare:workers';

// ─── IAMCollaborationSession ──────────────────────────────────────────────────
// Realtime broadcast room for workflow step events and shared canvas state.
// Handles WebSocket clients and POST /broadcast from Worker.

export class IAMCollaborationSession extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this._state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // POST /broadcast — send raw text to all connected WebSocket clients
    if (request.method === 'POST' && (url.pathname === '/broadcast' || url.pathname.endsWith('/broadcast'))) {
      const text = await request.text();
      const sockets = this.ctx.getWebSockets();
      let delivered = 0;
      for (const ws of sockets) {
        try { ws.send(text); delivered++; } catch (e) {
          console.warn('[IAM_COLLAB] broadcast send error', e?.message ?? e);
        }
      }
      return new Response(JSON.stringify({ ok: true, delivered, queued: delivered === 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /canvas/state — return persisted canvas elements + active theme slug
    if (request.method === 'GET' && url.pathname === '/canvas/state') {
      const elements    = (await this.ctx.storage.get('canvas_elements'))    ?? [];
      const activeTheme = (await this.ctx.storage.get('canvas_active_theme')) ?? null;
      return new Response(JSON.stringify({ canvasElements: elements, activeTheme }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /canvas/elements — persist elements + broadcast canvas_update event
    if (request.method === 'POST' && url.pathname === '/canvas/elements') {
      const { elements } = await request.json();
      await this.ctx.storage.put('canvas_elements', elements);
      const msg = JSON.stringify({ type: 'canvas_update', elements });
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(msg); } catch (_) {}
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /canvas/theme — validate slug against cms_themes, persist, broadcast theme_update
    if (request.method === 'POST' && url.pathname === '/canvas/theme') {
      const { theme_slug } = await request.json();
      if (!theme_slug) {
        return new Response(JSON.stringify({ error: 'theme_slug required' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!this.env.DB) {
        return new Response(JSON.stringify({ error: 'DB unavailable' }), {
          status: 503, headers: { 'Content-Type': 'application/json' },
        });
      }

      const row = await this.env.DB.prepare(
        `SELECT id, name, slug, config, theme_family, monaco_theme, monaco_bg
         FROM cms_themes WHERE slug = ? LIMIT 1`
      ).bind(theme_slug).first();

      if (!row) {
        return new Response(JSON.stringify({ error: 'unknown theme_slug' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }

      let cssVars = {};
      try { cssVars = JSON.parse(row.config).cssVars ?? {}; } catch (_) {}

      await this.ctx.storage.put('canvas_active_theme', theme_slug);

      const msg = JSON.stringify({
        type: 'theme_update',
        theme_slug,
        cssVars,
        monaco_theme: row.monaco_theme,
        monaco_bg:    row.monaco_bg,
      });

      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(msg); } catch (_) {}
      }

      return new Response(JSON.stringify({ ok: true, theme_slug }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // Info endpoint
    return new Response(JSON.stringify({ do: 'IAMCollaborationSession', ok: true, room: url.pathname }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async webSocketMessage(ws, message) {
    try {
      if (typeof message === 'string' && message === 'ping') ws.send('pong');
    } catch (_) {}
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'done'); } catch (_) {}
  }
}

// ─── AgentChatSqlV1 ───────────────────────────────────────────────────────────
// SQLite-backed message persistence + RAG context cache for agent chat loops.

export class AgentChatSqlV1 extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.env   = env;
    this.sql   = state.storage.sql;

    // Core message history
    this.sql.exec(`CREATE TABLE IF NOT EXISTS session_messages (
      id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      role                 TEXT NOT NULL,
      content              TEXT NOT NULL,
      model_used           TEXT,
      input_tokens         INTEGER DEFAULT 0,
      output_tokens        INTEGER DEFAULT 0,
      rag_chunks_injected  INTEGER DEFAULT 0,
      top_rag_score        REAL    DEFAULT 0,
      created_at           INTEGER DEFAULT (unixepoch())
    )`);

    // RAG query result cache — 1-hour TTL enforced at read time
    this.sql.exec(`CREATE TABLE IF NOT EXISTS session_rag_cache (
      query_hash  TEXT PRIMARY KEY,
      chunk_ids   TEXT,
      context     TEXT,
      top_score   REAL,
      cached_at   INTEGER DEFAULT (unixepoch())
    )`);
  }

  async fetch(request) {
    const url = new URL(request.url);

    // GET /health
    if (url.pathname === '/health') {
      return Response.json({ ok: true, class: 'AgentChatSqlV1' });
    }

    // GET /history?limit=50
    if (url.pathname === '/history') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
      const rows = [...this.sql.exec(
        `SELECT id, role, content, model_used, input_tokens, output_tokens,
                rag_chunks_injected, top_rag_score, created_at
         FROM session_messages ORDER BY created_at DESC LIMIT ?`,
        limit
      )];
      return Response.json({ messages: rows.reverse() });
    }

    // POST /message
    if (url.pathname === '/message' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const {
        role, content, model_used,
        input_tokens, output_tokens,
        rag_chunks_injected, top_rag_score,
      } = body;

      this.sql.exec(
        `INSERT INTO session_messages
         (role, content, model_used, input_tokens, output_tokens, rag_chunks_injected, top_rag_score)
         VALUES (?,?,?,?,?,?,?)`,
        role,
        content,
        model_used          ?? null,
        input_tokens        ?? 0,
        output_tokens       ?? 0,
        rag_chunks_injected ?? 0,
        top_rag_score       ?? 0,
      );

      return Response.json({ ok: true });
    }

    // GET /rag-cache?hash=<sha256>
    if (url.pathname === '/rag-cache' && request.method === 'GET') {
      const hash = url.searchParams.get('hash');
      if (!hash) return Response.json({ hit: false });

      const cutoff = Math.floor(Date.now() / 1000) - 3600; // 1-hour TTL
      const rows = [...this.sql.exec(
        `SELECT query_hash, chunk_ids, context, top_score, cached_at
         FROM session_rag_cache WHERE query_hash = ? AND cached_at > ?`,
        hash, cutoff
      )];

      if (!rows.length) return Response.json({ hit: false });

      const row = rows[0];
      return Response.json({
        hit:        true,
        query_hash: row.query_hash,
        chunk_ids:  row.chunk_ids,
        context:    row.context,
        top_score:  row.top_score,
        cached_at:  row.cached_at,
      });
    }

    // POST /rag-cache
    if (url.pathname === '/rag-cache' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { query_hash, chunk_ids, context, top_score } = body;

      this.sql.exec(
        `INSERT OR REPLACE INTO session_rag_cache (query_hash, chunk_ids, context, top_score)
         VALUES (?,?,?,?)`,
        query_hash,
        chunk_ids,
        context,
        top_score ?? 0,
      );

      return Response.json({ ok: true });
    }

    return new Response('AgentChatSqlV1', { status: 200 });
  }
}

// ─── ChessRoom ────────────────────────────────────────────────────────────────
// Realtime Chess game session. Game logic implemented in src/do/ChessRoom.js.
// This stub satisfies the DO binding — replace body when Phase 1 ships.

export class ChessRoom extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response(JSON.stringify({ do: 'ChessRoom', ok: true, room: url.pathname }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async webSocketMessage(ws, message) {
    // Full game logic routes to src/do/ChessRoom.js — stub echoes for now
    try { ws.send(JSON.stringify({ type: 'ack', received: message })); } catch (_) {}
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'done'); } catch (_) {}
  }
}

// ─── Legacy migration stubs ───────────────────────────────────────────────────
// These classes must remain exported to satisfy Cloudflare's DO persistence
// migration requirements. They handle no real logic.

export class IAMSession extends DurableObject {
  async fetch() {
    return new Response(JSON.stringify({ do: 'IAMSession', ok: true, legacy: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export class IAMAgentSession extends DurableObject {
  async fetch() {
    return new Response(JSON.stringify({ do: 'IAMAgentSession', ok: true, legacy: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
