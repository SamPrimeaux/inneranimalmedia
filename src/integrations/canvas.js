/**
 * Integration Layer: Canvas / Excalidraw
 * Manages draw canvas state via:
 *   - IAMCollaborationSession DO (realtime sync + in-session state)
 *   - R2 (persistent canvas saves, keyed by project)
 *   - D1 project_draws + draw_libraries tables (metadata + library catalog)
 *
 * Routes under /api/draw/*
 */
import { jsonResponse } from '../core/responses.js';
import { getAuthUser, tenantIdFromEnv } from '../core/auth.js';

// ─── DO Helper ────────────────────────────────────────────────────────────────

/**
 * Get the IAMCollaborationSession DO stub for a given room ID.
 */
function getCollabDO(env, roomId) {
  if (!env.IAM_COLLAB) return null;
  const id = env.IAM_COLLAB.idFromName(roomId);
  return env.IAM_COLLAB.get(id);
}

// ─── R2 Canvas Persistence ────────────────────────────────────────────────────

function canvasR2Key(projectId) {
  return `canvas/${projectId}/elements.json`;
}

async function loadCanvasFromR2(env, projectId) {
  const bucket = env.DASHBOARD || env.R2;
  if (!bucket) return null;
  try {
    const obj = await bucket.get(canvasR2Key(projectId));
    if (!obj) return null;
    return JSON.parse(await obj.text());
  } catch (_) {
    return null;
  }
}

async function saveCanvasToR2(env, projectId, elements) {
  const bucket = env.DASHBOARD || env.R2;
  if (!bucket) return false;
  try {
    await bucket.put(
      canvasR2Key(projectId),
      JSON.stringify(elements),
      { httpMetadata: { contentType: 'application/json' } }
    );
    return true;
  } catch (_) {
    return false;
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

/**
 * Main dispatcher for /api/draw/* routes.
 */
export async function handleCanvasApi(request, env) {
  const url    = new URL(request.url);
  const path   = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  // ── GET /api/draw/state ───────────────────────────────────────────────────
  if (path === '/api/draw/state' && method === 'GET') {
    const projectId = url.searchParams.get('project_id') || 'default';
    const roomId    = url.searchParams.get('room_id') || projectId;

    // Try DO first (hot state), fall back to R2
    const stub = getCollabDO(env, roomId);
    if (stub) {
      try {
        const res = await stub.fetch(new Request(`https://do/canvas/state`));
        const data = await res.json();
        if (data.canvasElements?.length) {
          return jsonResponse({ elements: data.canvasElements, activeTheme: data.activeTheme, source: 'do' });
        }
      } catch (_) {}
    }

    const r2Elements = await loadCanvasFromR2(env, projectId);
    return jsonResponse({ elements: r2Elements || [], activeTheme: null, source: 'r2' });
  }

  // ── POST /api/draw/elements ───────────────────────────────────────────────
  if (path === '/api/draw/elements' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { elements, project_id: projectId = 'default', room_id: roomId } = body;
    if (!Array.isArray(elements)) return jsonResponse({ error: 'elements array required' }, 400);

    const actualRoom = roomId || projectId;

    // Push to DO for realtime broadcast
    const stub = getCollabDO(env, actualRoom);
    if (stub) {
      await stub.fetch(new Request('https://do/canvas/elements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements }),
      })).catch(() => {});
    }

    // Persist to R2
    const saved = await saveCanvasToR2(env, projectId, elements);

    // Record draw in D1
    if (env.DB && projectId !== 'default') {
      const r2Key = canvasR2Key(projectId);
      await env.DB.prepare(
        `INSERT OR REPLACE INTO project_draws (project_id, r2_key, generation_type, created_at)
         VALUES (?, ?, 'manual', datetime('now'))`
      ).bind(projectId, r2Key).run().catch(() => {});
    }

    return jsonResponse({ ok: true, saved, elements: elements.length });
  }

  // ── POST /api/draw/theme ──────────────────────────────────────────────────
  if (path === '/api/draw/theme' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { theme_slug, room_id: roomId = 'default' } = body;
    if (!theme_slug) return jsonResponse({ error: 'theme_slug required' }, 400);

    const stub = getCollabDO(env, roomId);
    if (!stub) return jsonResponse({ error: 'Collaboration DO not configured' }, 503);

    const res = await stub.fetch(new Request('https://do/canvas/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme_slug }),
    }));

    const data = await res.json().catch(() => ({}));
    return jsonResponse(data, res.status);
  }

  // ── GET /api/draw/libraries ───────────────────────────────────────────────
  if (path === '/api/draw/libraries' && method === 'GET') {
    if (!env.DB) return jsonResponse({ libraries: [] });

    try {
      const { results } = await env.DB.prepare(
        `SELECT id, slug, name, filename, category, icon, r2_bucket, r2_key,
                public_url, r2_dev_url, file_size_bytes, item_count,
                is_active, sort_order, auto_load, agent_tags, description
         FROM draw_libraries
         WHERE is_active = 1
         ORDER BY sort_order ASC, name ASC`
      ).all();

      return jsonResponse({ libraries: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/draw/saves ───────────────────────────────────────────────────
  if (path === '/api/draw/saves' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ saves: [] });

    const projectId = url.searchParams.get('project_id') || null;

    try {
      const query = projectId
        ? env.DB.prepare(`SELECT id, project_id, r2_key, generation_type, created_at FROM project_draws WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`).bind(projectId)
        : env.DB.prepare(`SELECT id, project_id, r2_key, generation_type, created_at FROM project_draws ORDER BY created_at DESC LIMIT 50`);

      const { results } = await query.all();
      return jsonResponse({ saves: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── DELETE /api/draw/saves/:id ────────────────────────────────────────────
  const deleteMatch = path.match(/^\/api\/draw\/saves\/([^/]+)$/);
  if (deleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    const id = deleteMatch[1];
    try {
      const row = await env.DB.prepare(`SELECT r2_key FROM project_draws WHERE id = ? LIMIT 1`).bind(id).first();
      if (!row) return jsonResponse({ error: 'Save not found' }, 404);

      // Delete from R2
      const bucket = env.DASHBOARD || env.R2;
      if (bucket && row.r2_key) await bucket.delete(row.r2_key).catch(() => {});

      // Delete from D1
      await env.DB.prepare(`DELETE FROM project_draws WHERE id = ?`).bind(id).run();
      return jsonResponse({ ok: true });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: 'Canvas route not found', path }, 404);
}
