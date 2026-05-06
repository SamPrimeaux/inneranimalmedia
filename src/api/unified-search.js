/**
 * Unified Cmd+K search — D1 + Supabase pgvector (Hyperdrive).
 */
import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';

const BGE_MODEL = '@cf/baai/bge-base-en-v1.5';

/**
 * @param {any} env
 * @param {string} sql
 * @param {unknown[]} params
 */
async function hyperdriveQuery(env, sql, params) {
  if (!env?.HYPERDRIVE || typeof env.HYPERDRIVE.query !== 'function') return [];
  try {
    const result = await env.HYPERDRIVE.query(sql, params);
    return result?.rows ?? [];
  } catch (e) {
    console.warn('[unified-search] hyperdrive', e?.message ?? e);
    return [];
  }
}

/**
 * @param {any} env
 * @param {string} query
 * @param {number} limit
 */
async function searchDocumentsVector(env, query, limit) {
  if (!env?.AI || !env?.HYPERDRIVE) return [];
  let embResult;
  try {
    embResult = await env.AI.run(BGE_MODEL, { text: String(query || '').trim() });
  } catch (e) {
    console.warn('[unified-search] embed', e?.message ?? e);
    return [];
  }
  const vec = embResult?.data?.[0] ?? embResult?.result?.[0];
  if (!Array.isArray(vec) || !vec.length) return [];

  const embedding = JSON.stringify(vec);
  const lim = Math.min(Math.max(1, limit), 50);
  const rows = await hyperdriveQuery(
    env,
    `SELECT id, content_preview, metadata,
            1 - (embedding <=> $1::vector) AS similarity
     FROM public.documents
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [embedding, lim],
  );

  const out = [];
  for (const row of rows) {
    const sim = Number(row.similarity ?? 0);
    let meta = row.metadata;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = {};
      }
    }
    const m = meta && typeof meta === 'object' ? meta : {};
    const title =
      (typeof m.title === 'string' && m.title) ||
      (typeof row.content_preview === 'string' ? row.content_preview.slice(0, 120) : 'Document');
    const subtitle =
      (typeof m.source === 'string' && m.source) ||
      (typeof m.snippet === 'string' && m.snippet) ||
      '';
    const url = typeof m.url === 'string' ? m.url : null;
    out.push({
      type: 'knowledge',
      id: String(row.id ?? ''),
      title,
      subtitle: subtitle || undefined,
      score: sim,
      url,
    });
  }
  return out;
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 */
export async function handleUnifiedSearchApi(request, url, env) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const userId = authUser.id ? String(authUser.id) : null;

  if (method === 'GET' && pathLower === '/api/unified-search/recent') {
    if (!env.DB) return jsonResponse({ items: [] });
    try {
      const uid = userId || '';
      const { results } = await env.DB.prepare(
        `SELECT query, result_kind, opened_id, created_at
         FROM ai_search_analytics
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
      )
        .bind(uid)
        .all();
      const items = (results || []).map((r) => ({
        query: r.query,
        result_kind: r.result_kind,
        opened_id: r.opened_id,
      }));
      return jsonResponse({ items });
    } catch (e) {
      console.warn('[unified-search/recent]', e?.message ?? e);
      return jsonResponse({ items: [] });
    }
  }

  if (method === 'POST' && pathLower === '/api/unified-search/track') {
    if (!env.DB) return jsonResponse({ ok: false }, 503);
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const query = String(body.query || '').slice(0, 500);
    const resultKind = body.result_kind != null ? String(body.result_kind).slice(0, 64) : null;
    const openedId = body.opened_id != null ? String(body.opened_id).slice(0, 500) : null;
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        `INSERT INTO ai_search_analytics (id, user_id, query, result_kind, opened_id, created_at)
         VALUES (?, ?, ?, ?, ?, unixepoch())`,
      )
        .bind(id, userId || '', query, resultKind, openedId)
        .run();
    } catch (e) {
      console.warn('[unified-search/track]', e?.message ?? e);
      return jsonResponse({ ok: false }, 500);
    }
    return jsonResponse({ ok: true });
  }

  if (method === 'POST' && pathLower === '/api/unified-search') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const rawQ = String(body.query || '').trim();
    if (rawQ.length < 2) {
      return jsonResponse({ results: [] });
    }
    const limit = Math.min(Math.max(1, Number(body.limit) || 22), 50);
    const qLow = `%${String(rawQ).toLowerCase()}%`;

    if (!env.DB) {
      return jsonResponse({ results: [], warning: 'DB not configured' });
    }

    const [
      tableRows,
      cmdRows,
      todoRows,
      planRows,
      toolRows,
      docRows,
    ] = await Promise.all([
      env.DB.prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND lower(name) LIKE ?
         LIMIT 15`,
      )
        .bind(qLow)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT id, user_input, normalized_intent, output_text
         FROM agentsam_command_run
         WHERE lower(user_input) LIKE ? OR lower(COALESCE(normalized_intent,'')) LIKE ?
            OR lower(COALESCE(output_text,'')) LIKE ?
         ORDER BY rowid DESC
         LIMIT 10`,
      )
        .bind(qLow, qLow, qLow)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT id, title, description, status
         FROM agentsam_todo
         WHERE status IN ('todo','in_progress','blocked')
           AND (lower(title) LIKE ? OR lower(COALESCE(description,'')) LIKE ?)
         ORDER BY updated_at DESC
         LIMIT 10`,
      )
        .bind(qLow, qLow)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT id, title, status FROM agentsam_plans
         WHERE lower(title) LIKE ?
         ORDER BY plan_date DESC
         LIMIT 10`,
      )
        .bind(qLow)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT id, tool_name, COALESCE(description,'') AS description
         FROM agentsam_mcp_tools
         WHERE lower(tool_name) LIKE ? OR lower(COALESCE(description,'')) LIKE ?
         LIMIT 10`,
      )
        .bind(qLow, qLow)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      searchDocumentsVector(env, rawQ, Math.min(limit, 8)),
    ]);

    /** @type {{ type: string, id: string, title: string, subtitle?: string, score: number, url?: string|null, sql_text?: string }[]} */
    const merged = [];

    for (const t of tableRows) {
      const name = String(t.name || '');
      const nm = name.toLowerCase();
      const hit = rawQ.toLowerCase();
      const score = nm.includes(hit) ? 0.92 : 0.78;
      merged.push({
        type: 'table',
        id: name,
        title: name,
        subtitle: 'D1 table',
        score,
      });
    }

    for (const c of cmdRows) {
      const id = String(c.id || '');
      const ui = String(c.user_input || '').slice(0, 200);
      merged.push({
        type: 'query',
        id,
        title: ui || 'Command run',
        subtitle: c.normalized_intent ? String(c.normalized_intent).slice(0, 120) : undefined,
        sql_text: ui,
        score: 0.74,
      });
    }

    for (const td of todoRows) {
      merged.push({
        type: 'knowledge',
        id: String(td.id || ''),
        title: String(td.title || 'Todo'),
        subtitle: td.status ? `todo · ${td.status}` : 'todo',
        score: 0.73,
      });
    }

    for (const p of planRows) {
      merged.push({
        type: 'knowledge',
        id: String(p.id || ''),
        title: String(p.title || 'Plan'),
        subtitle: p.status ? `plan · ${p.status}` : 'plan',
        score: 0.71,
      });
    }

    for (const tl of toolRows) {
      merged.push({
        type: 'knowledge',
        id: String(tl.id || tl.tool_name || ''),
        title: String(tl.tool_name || 'tool'),
        subtitle: String(tl.description || '').slice(0, 160) || 'MCP tool',
        score: 0.79,
      });
    }

    for (const d of docRows) {
      merged.push({
        type: 'knowledge',
        id: d.id,
        title: d.title,
        subtitle: d.subtitle,
        score: typeof d.score === 'number' ? d.score : 0.65,
        url: d.url ?? null,
      });
    }

    merged.sort((a, b) => b.score - a.score);
    const results = merged.slice(0, limit);

    return jsonResponse({ results });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
