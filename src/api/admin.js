/**
 * src/api/admin.js
 * Admin API — platform management endpoints.
 *
 * All routes require admin-level auth (role = 'admin' | 'superadmin').
 * Prefix: /api/admin/*
 *
 * Routes:
 *   GET    /api/admin/models              — list ai_models
 *   PATCH  /api/admin/models/:id          — update a model (is_active, rates, etc.)
 *   GET    /api/admin/routing-rules       — list model_routing_rules
 *   POST   /api/admin/routing-rules       — create/upsert a routing rule
 *   DELETE /api/admin/routing-rules/:id   — delete a routing rule
 *   GET    /api/admin/config              — list agent_platform_context keys
 *   PUT    /api/admin/config              — upsert a platform config key
 *   DELETE /api/admin/config/:key         — delete a config key
 *   POST   /api/admin/flush-cache         — invalidate ai_compiled_context_cache
 *   GET    /api/admin/stats               — ai usage / cost rollup
 *   GET    /api/admin/health              — system binding health check
 */

import { jsonResponse }                  from '../core/responses.js';
import { getAuthUser }                   from '../core/auth.js';
import { invalidateCompiledContextCache } from './rag.js';

// ── Auth Guard ────────────────────────────────────────────────────────────────

async function requireAdmin(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) return [null, jsonResponse({ error: 'Unauthorized' }, 401)];
  if (!['admin', 'superadmin'].includes(user.role)) {
    return [null, jsonResponse({ error: 'Forbidden — admin role required' }, 403)];
  }
  return [user, null];
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleAdminApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '');
  const method = request.method.toUpperCase();

  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const [, authErr] = await requireAdmin(request, env);
  if (authErr) return authErr;

  // ── GET /api/admin/models ────────────────────────────────────────────────
  if (path === '/api/admin/models' && method === 'GET') {
    const provider = url.searchParams.get('provider') || null;
    const activeOnly = url.searchParams.get('active') !== 'false';

    let sql = `SELECT id, provider, model_key, display_name, size_class,
                      is_active, supports_tools, supports_vision, supports_cache,
                      input_rate_per_mtok, output_rate_per_mtok, neurons_usd_per_1k,
                      show_in_picker, api_platform, rpm_limit, itpm_limit, otpm_limit,
                      created_at, updated_at
               FROM ai_models WHERE 1=1`;
    const params = [];

    if (provider) { sql += ' AND provider = ?'; params.push(provider); }
    if (activeOnly) { sql += ' AND is_active = 1'; }
    sql += ' ORDER BY provider, size_class, display_name';

    const stmt = params.length ? env.DB.prepare(sql).bind(...params) : env.DB.prepare(sql);
    const { results } = await stmt.all().catch(() => ({ results: [] }));
    return jsonResponse({ models: results || [], count: (results || []).length });
  }

  // ── PATCH /api/admin/models/:id ──────────────────────────────────────────
  if (path.startsWith('/api/admin/models/') && method === 'PATCH') {
    const id = decodeURIComponent(path.replace('/api/admin/models/', ''));
    if (!id) return jsonResponse({ error: 'model id required' }, 400);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const allowed = [
      'is_active', 'show_in_picker', 'display_name', 'size_class',
      'input_rate_per_mtok', 'output_rate_per_mtok', 'neurons_usd_per_1k',
      'cache_write_rate_per_mtok', 'cache_read_rate_per_mtok',
      'rpm_limit', 'itpm_limit', 'otpm_limit',
      'supports_tools', 'supports_vision', 'supports_cache', 'supports_fast_mode',
      'context_max_tokens', 'context_default_tokens', 'secret_key_name',
    ];

    const fields = Object.keys(body).filter(k => allowed.includes(k));
    if (!fields.length) return jsonResponse({ error: 'No valid fields to update' }, 400);

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values    = fields.map(f => body[f]);
    values.push(Math.floor(Date.now() / 1000), id);

    await env.DB.prepare(
      `UPDATE ai_models SET ${setClause}, updated_at = ? WHERE id = ?`
    ).bind(...values).run();

    return jsonResponse({ ok: true, id, updated: fields });
  }

  // ── GET /api/admin/routing-rules ─────────────────────────────────────────
  if (path === '/api/admin/routing-rules' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM model_routing_rules ORDER BY priority DESC, created_at DESC`
    ).all().catch(() => ({ results: [] }));
    return jsonResponse({ rules: results || [] });
  }

  // ── POST /api/admin/routing-rules ────────────────────────────────────────
  if (path === '/api/admin/routing-rules' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { intent_tag, provider, model_key, priority = 0, is_active = 1, condition_json } = body;
    if (!intent_tag || !provider || !model_key) {
      return jsonResponse({ error: 'intent_tag, provider, model_key required' }, 400);
    }

    const id = `rule_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO model_routing_rules
       (id, intent_tag, provider, model_key, priority, is_active, condition_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`
    ).bind(id, intent_tag, provider, model_key, priority, is_active ? 1 : 0,
      condition_json ? JSON.stringify(condition_json) : null
    ).run();

    return jsonResponse({ ok: true, id });
  }

  // ── DELETE /api/admin/routing-rules/:id ──────────────────────────────────
  if (path.startsWith('/api/admin/routing-rules/') && method === 'DELETE') {
    const id = path.replace('/api/admin/routing-rules/', '');
    await env.DB.prepare(`DELETE FROM model_routing_rules WHERE id = ?`).bind(id).run();
    return jsonResponse({ ok: true, deleted: id });
  }

  // ── GET /api/admin/config ────────────────────────────────────────────────
  if (path === '/api/admin/config' && method === 'GET') {
    const search = url.searchParams.get('q');
    let sql = `SELECT id, memory_key, memory_value, updated_at
               FROM agent_platform_context WHERE 1=1`;
    const params = [];
    if (search) {
      sql += ` AND (memory_key LIKE ? OR memory_value LIKE ?)`;
      const like = `%${search}%`;
      params.push(like, like);
    }
    sql += ` ORDER BY memory_key LIMIT 200`;

    const stmt = params.length ? env.DB.prepare(sql).bind(...params) : env.DB.prepare(sql);
    const { results } = await stmt.all().catch(() => ({ results: [] }));
    return jsonResponse({ config: results || [], count: (results || []).length });
  }

  // ── PUT /api/admin/config ────────────────────────────────────────────────
  if (path === '/api/admin/config' && method === 'PUT') {
    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { key, value } = body;
    if (!key || value === undefined) return jsonResponse({ error: 'key and value required' }, 400);

    const id = `apc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await env.DB.prepare(
      `INSERT INTO agent_platform_context (id, memory_key, memory_value, updated_at)
       VALUES (?, ?, ?, unixepoch())
       ON CONFLICT(memory_key) DO UPDATE SET memory_value = excluded.memory_value, updated_at = unixepoch()`
    ).bind(id, key, String(value)).run();

    invalidateCompiledContextCache(env);
    return jsonResponse({ ok: true, key });
  }

  // ── DELETE /api/admin/config/:key ────────────────────────────────────────
  if (path.startsWith('/api/admin/config/') && method === 'DELETE') {
    const key = decodeURIComponent(path.replace('/api/admin/config/', ''));
    await env.DB.prepare(
      `DELETE FROM agent_platform_context WHERE memory_key = ?`
    ).bind(key).run();
    invalidateCompiledContextCache(env);
    return jsonResponse({ ok: true, deleted: key });
  }

  // ── POST /api/admin/flush-cache ──────────────────────────────────────────
  if (path === '/api/admin/flush-cache' && method === 'POST') {
    const { meta } = await env.DB.prepare(
      `DELETE FROM ai_compiled_context_cache`
    ).run().catch(() => ({ meta: {} }));
    return jsonResponse({ ok: true, rows_deleted: meta?.changes ?? 0 });
  }

  // ── GET /api/admin/stats ─────────────────────────────────────────────────
  if (path === '/api/admin/stats' && method === 'GET') {
    const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 90);
    const since = Math.floor(Date.now() / 1000) - (days * 86400);

    const [usageRes, costRes, modelRes] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) as total_requests,
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as requests_period
         FROM ai_interactions`
      ).bind(since).first().catch(() => null),

      env.DB.prepare(
        `SELECT SUM(cost_usd) as total_usd, period_date
         FROM ai_costs_daily WHERE period_date >= date('now', ?)
         GROUP BY period_date ORDER BY period_date DESC LIMIT ?`
      ).bind(`-${days} days`, days).all().catch(() => ({ results: [] })),

      env.DB.prepare(
        `SELECT provider, model_key, COUNT(*) as calls,
                SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens
         FROM ai_usage_log
         WHERE created_at >= ?
         GROUP BY provider, model_key
         ORDER BY calls DESC LIMIT 20`
      ).bind(since).all().catch(() => ({ results: [] })),
    ]);

    return jsonResponse({
      period_days:   days,
      usage:         usageRes,
      cost_by_day:   costRes.results || [],
      top_models:    modelRes.results || [],
    });
  }

  // ── GET /api/admin/health ────────────────────────────────────────────────
  if (path === '/api/admin/health' && method === 'GET') {
    const checks = {
      db:         false,
      ai:         false,
      r2:         false,
      kv:         false,
      vectorize:  false,
      hyperdrive: false,
    };

    // DB ping
    try {
      await env.DB.prepare('SELECT 1').first();
      checks.db = true;
    } catch (_) {}

    // AI binding
    checks.ai = !!env.AI;

    // R2
    checks.r2 = !!env.R2;

    // KV
    checks.kv = !!env.SESSION_CACHE;

    // Vectorize (optional)
    checks.vectorize = !!env.VECTORIZE_INDEX;

    // Hyperdrive (optional)
    checks.hyperdrive = !!env.HYPERDRIVE;

    const allHealthy = Object.values(checks).every(Boolean);
    return jsonResponse({
      healthy: allHealthy,
      checks,
      timestamp: new Date().toISOString(),
    }, allHealthy ? 200 : 207);
  }

  return jsonResponse({ error: 'Admin route not found', path }, 404);
}
