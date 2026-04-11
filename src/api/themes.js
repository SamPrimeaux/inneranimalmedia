/**
 * API Layer: Theme Management
 * HTTP routes for theme gallery, active theme resolution, apply, and Monaco config.
 * Delegates persistence logic to src/core/themes.js.
 * Table: cms_themes (98 rows, canonical). settings (appearance.theme key).
 */
import { jsonResponse }                               from '../core/responses.js';
import { getAuthUser, tenantIdFromEnv }               from '../core/auth.js';
import { getUserThemePreference, setUserThemePreference,
         getMonacoThemeConfig }                       from '../core/themes.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

function activeThemePayload(row) {
  if (!row) return null;
  let data = {};
  try {
    if (typeof row.config === 'string')        data = JSON.parse(row.config);
    else if (row.config && typeof row.config === 'object') data = row.config;
  } catch (_) {}
  return {
    id:           row.id,
    name:         row.name  || 'Custom Theme',
    slug:         row.slug  || 'custom',
    is_dark:      data.mode === 'dark' || data.is_dark === true || String(row.slug || '').includes('dark'),
    css_url:      row.css_url     || null,
    theme_family: row.theme_family || 'custom',
    wcag_scores:  row.wcag_scores || null,
    data,
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function handleThemesApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  try {

    // ── GET /api/themes ───────────────────────────────────────────────────
    if (path === '/api/themes' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT id, name, slug, config, theme_family, sort_order, css_url,
                tenant_id, workspace_id, wcag_scores, contrast_flags, is_system
         FROM cms_themes
         ORDER BY is_system DESC, theme_family ASC, sort_order ASC, name ASC`
      ).all();
      return jsonResponse({ themes: results || [] });
    }

    // ── GET /api/themes/active ────────────────────────────────────────────
    if (path === '/api/themes/active' && method === 'GET') {
      const workspaceId = url.searchParams.get('workspace_id') || url.searchParams.get('workspace') || null;
      const tid         = tenantIdFromEnv(env);
      let themeRow      = null;

      // 1. settings table
      if (tid) {
        try {
          themeRow = await env.DB.prepare(
            `SELECT t.* FROM cms_themes t
             INNER JOIN settings s ON s.setting_value = t.slug OR s.setting_value = CAST(t.id AS TEXT)
             WHERE s.tenant_id = ? AND s.setting_key = 'appearance.theme' LIMIT 1`
          ).bind(tid).first();
        } catch (_) {}
      }

      // 2. user_preferences via core/themes.js
      if (!themeRow) {
        try {
          const authUser = await getAuthUser(request, env);
          if (authUser?.id) {
            const slug = await getUserThemePreference(env, authUser.id);
            if (slug) themeRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE slug = ? LIMIT 1`).bind(slug).first();
          }
        } catch (_) {}
      }

      // 3. Fallback: first active system theme (no hardcoded slug)
      if (!themeRow) {
        themeRow = await env.DB.prepare(
          `SELECT * FROM cms_themes WHERE is_system = 1 ORDER BY sort_order ASC LIMIT 1`
        ).first().catch(() => null);
      }

      const payload = activeThemePayload(themeRow) || { name: 'default', slug: 'default', is_dark: true, data: {} };
      if (workspaceId) payload.workspace = workspaceId;
      return jsonResponse(payload);
    }

    // ── POST /api/themes/apply ────────────────────────────────────────────
    if (path === '/api/themes/apply' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      const body    = await request.json().catch(() => ({}));
      const themeId = body.theme_id || body.slug;
      if (!themeId) return jsonResponse({ error: 'theme_id or slug required' }, 400);

      const theme = await env.DB.prepare(
        `SELECT id, slug FROM cms_themes WHERE id = ? OR slug = ? LIMIT 1`
      ).bind(themeId, themeId).first();
      if (!theme) return jsonResponse({ error: 'Theme not found' }, 404);

      const tid = tenantIdFromEnv(env);
      if (tid) {
        await env.DB.prepare(
          `INSERT INTO settings (tenant_id, setting_key, setting_value, category, updated_at)
           VALUES (?, 'appearance.theme', ?, 'appearance', unixepoch())
           ON CONFLICT(tenant_id, setting_key)
           DO UPDATE SET setting_value = excluded.setting_value, updated_at = unixepoch()`
        ).bind(tid, theme.slug).run().catch(() => {});
      }

      await setUserThemePreference(env, String(authUser.id), theme.slug);
      return jsonResponse({ ok: true, theme: theme.slug });
    }

    // ── GET /api/themes/:slug — single theme ──────────────────────────────
    const slugMatch = path.match(/^\/api\/themes\/([^/]+)$/);
    if (slugMatch && method === 'GET') {
      const row = await env.DB.prepare(
        `SELECT * FROM cms_themes WHERE slug = ? OR id = ? LIMIT 1`
      ).bind(slugMatch[1], slugMatch[1]).first();
      if (!row) return jsonResponse({ error: 'Theme not found' }, 404);
      return jsonResponse({ theme: activeThemePayload(row) });
    }

    // ── GET /api/themes/:slug/monaco — Monaco editor config ──────────────
    const monacoMatch = path.match(/^\/api\/themes\/([^/]+)\/monaco$/);
    if (monacoMatch && method === 'GET') {
      const row = await env.DB.prepare(
        `SELECT * FROM cms_themes WHERE slug = ? OR id = ? LIMIT 1`
      ).bind(monacoMatch[1], monacoMatch[1]).first();
      if (!row) return jsonResponse({ error: 'Theme not found' }, 404);
      return jsonResponse({ slug: monacoMatch[1], monaco: getMonacoThemeConfig(row) });
    }

    return jsonResponse({ error: 'Theme route not found', path }, 404);

  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}
