/** 
 * Realtime broadcast room for workflow step events.
 * Handles WebSocket clients and POST /broadcast from Worker.
 */
import { DurableObject } from "cloudflare:workers";

export class IAMCollaborationSession extends DurableObject {
  /**
   * @param {import('@cloudflare/workers-types').DurableObjectState} state
   * @param {Record<string, unknown>} env
   */
  constructor(state, env) {
    super(state, env);
    /** @type {import('@cloudflare/workers-types').DurableObjectState} */
    this._state = state;
    this.env = env;
  }

  /** @param {Request} request */
  async fetch(request) {
    const url = new URL(request.url);

    // POST /broadcast — send raw text to all connected sockets
    if (request.method === 'POST' && (url.pathname === '/broadcast' || url.pathname.endsWith('/broadcast'))) {
      const text = await request.text();
      const sockets = this.ctx.getWebSockets();
      let delivered = 0;
      for (const ws of sockets) {
        try { ws.send(text); delivered++; } catch (e) {
          console.warn('[IAM_COLLAB] broadcast send', e?.message ?? e);
        }
      }
      return new Response(JSON.stringify({ ok: true, delivered, queued: delivered === 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /canvas/state — return persisted canvas elements + active theme
    if (request.method === 'GET' && url.pathname === '/canvas/state') {
      const elements = (await this.ctx.storage.get('canvas_elements')) ?? [];
      const activeTheme = (await this.ctx.storage.get('canvas_active_theme')) ?? null;
      return new Response(JSON.stringify({ canvasElements: elements, activeTheme }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /canvas/elements — persist elements + broadcast canvas_update
    if (request.method === 'POST' && url.pathname === '/canvas/elements') {
      const { elements } = await request.json();
      await this.ctx.storage.put('canvas_elements', elements);
      const msg = JSON.stringify({ type: 'canvas_update', elements });
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(msg); } catch (_) {}
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // POST /canvas/theme — validate slug against D1, persist, broadcast theme_update
    if (request.method === 'POST' && url.pathname === '/canvas/theme') {
      const { theme_slug } = await request.json();
      const row = await this.env.DB.prepare(
        'SELECT id, name, slug, config, theme_family, monaco_theme, monaco_bg FROM cms_themes WHERE slug = ?'
      ).bind(theme_slug).first();
      if (!row) return new Response(JSON.stringify({ error: 'unknown theme_slug' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      let cssVars = {};
      try { cssVars = JSON.parse(row.config).cssVars ?? {}; } catch (_) {}
      await this.ctx.storage.put('canvas_active_theme', theme_slug);
      const msg = JSON.stringify({ type: 'theme_update', theme_slug, cssVars, monaco_theme: row.monaco_theme, monaco_bg: row.monaco_bg });
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(msg); } catch (_) {}
      }
      return new Response(JSON.stringify({ ok: true, theme_slug }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Non-WebSocket requests fall through here (info endpoint)
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response(JSON.stringify({ do: 'IAMCollaborationSession', ok: true, room: url.pathname }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // WebSocket upgrade
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** @param {WebSocket} ws @param {string | ArrayBuffer} message */
  async webSocketMessage(ws, message) {
    try {
      if (typeof message === 'string' && message === 'ping') ws.send('pong');
    } catch (_) { }
  }

  /** @param {WebSocket} ws */
  async webSocketClose(ws) {
    try {
      ws.close(1000, 'done');
    } catch (_) { }
  }
}
