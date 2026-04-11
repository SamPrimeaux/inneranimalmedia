/**
 * Core Layer: Durable Objects
 * Handles stateful collaborative sessions and SQL-backed agent chat history.
 * Deconstructed from legacy worker.js.
 */
import { DurableObject } from 'cloudflare:workers';

/**
 * Realtime broadcast room for workflow step events and shared canvas state.
 */
export class IAMCollaborationSession extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      const text = await request.text();
      const sockets = this.ctx.getWebSockets();
      let delivered = 0;
      for (const ws of sockets) {
        try { ws.send(text); delivered++; } catch (_) {}
      }
      return new Response(JSON.stringify({ ok: true, delivered }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'GET' && url.pathname === '/canvas/state') {
      const elements = (await this.ctx.storage.get('canvas_elements')) ?? [];
      const activeTheme = (await this.ctx.storage.get('canvas_active_theme')) ?? null;
      return new Response(JSON.stringify({ canvasElements: elements, activeTheme }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'POST' && url.pathname === '/canvas/elements') {
      const { elements } = await request.json();
      await this.ctx.storage.put('canvas_elements', elements);
      const msg = JSON.stringify({ type: 'canvas_update', elements });
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(msg); } catch (_) {}
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response(JSON.stringify({ do: 'IAMCollaborationSession', ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Agent Chat Session: SQLite-backed message persistence for RAG loops.
 */
export class AgentChatSqlV1 extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model_used TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )`);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/history') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const rows = [...this.sql.exec(
        'SELECT * FROM session_messages ORDER BY created_at DESC LIMIT ?',
        limit
      )];
      return Response.json({ messages: rows.reverse() });
    }

    if (url.pathname === '/message' && request.method === 'POST') {
      const body = await request.json();
      this.sql.exec(
        'INSERT INTO session_messages (role, content, model_used, input_tokens, output_tokens) VALUES (?,?,?,?,?)',
        body.role, body.content, body.model_used, body.input_tokens || 0, body.output_tokens || 0
      );
      return Response.json({ ok: true });
    }

    return new Response('AgentChatSqlV1 DO', { status: 200 });
  }
}

/**
 * Realtime Chess Session stub.
 */
export class ChessRoom extends DurableObject {
  async fetch(request) {
    return new Response(JSON.stringify({ do: 'ChessRoom', ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/** Legacy KV-backed stubs to satisfy Cloudflare persistence migrations. */
export class IAMSession extends DurableObject {
  async fetch() { return new Response(JSON.stringify({ do: 'IAMSession', ok: true, legacy: true })); }
}
export class IAMAgentSession extends DurableObject {
  async fetch() { return new Response(JSON.stringify({ do: 'IAMAgentSession', ok: true, legacy: true })); }
}
