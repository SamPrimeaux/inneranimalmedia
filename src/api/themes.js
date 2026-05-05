/**
 * API Service: Theme Management
 * Handles theme gallery, active theme resolution, and applying new themes.
 * Deconstructed from legacy worker.js.
 *
 * GET /api/themes/active always returns live CSS variables merged from D1 `cms_themes.config`
 * (`theme_channel: live`). R2 `css_url` / compiled CSS on that row are metadata for published/public
 * snapshots only — the dashboard must keep applying `data` via JS (optimistic + collab), not fetching
 * `theme.css` for realtime editing.
 */
import { getAuthUser, jsonResponse, fetchAuthUserTenantId } from '../core/auth.js';
import { buildActiveThemeApiPayload } from '../core/cms-theme-active.js';

/**
 * Main dispatcher for Theme-related API routes (/api/themes/*).
 */
export async function handleThemesApi(request, url, env, ctx) {
    const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    try {
        // ── GET /api/themes (Gallery) ──
        if (pathLower === '/api/themes' && method === 'GET') {
            const { results } = await env.DB.prepare(
                `SELECT id, name, slug, config, theme_family, sort_order, css_url, tenant_id, workspace_id, wcag_scores, contrast_flags, is_system, monaco_bg
                 FROM cms_themes ORDER BY is_system DESC, theme_family ASC, sort_order ASC, name ASC`
            ).all();
            return jsonResponse({ themes: results || [] });
        }

        // ── GET /api/themes/active ──
        if (pathLower === '/api/themes/active' && method === 'GET') {
            const workspaceId = url.searchParams.get('workspace_id') || url.searchParams.get('workspace');
            const authUser = await getAuthUser(request, env).catch(() => null);
            let tid = authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
              ? String(authUser.tenant_id).trim()
              : null;
            if (!tid && authUser?.id) {
              tid = await fetchAuthUserTenantId(env, authUser.id).catch(() => null);
            }
            
            // Try loading from settings
            let themeRow = null;
            if (tid) {
                const settingKey = 'appearance.theme';
                const row = await env.DB.prepare(
                    `SELECT t.* FROM cms_themes t
                     INNER JOIN settings s ON s.setting_value = t.slug OR s.setting_value = CAST(t.id AS TEXT)
                     WHERE s.tenant_id = ? AND s.setting_key = ? LIMIT 1`
                ).bind(tid, settingKey).first();
                if (row) themeRow = row;
            }

            if (!themeRow) {
                // Fallback to default
                themeRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE is_system = 1 AND slug = 'dark' LIMIT 1`).first();
            }

            const payload = buildActiveThemeApiPayload(themeRow) || { name: 'dark', slug: 'dark', is_dark: true, data: {}, theme_channel: 'live' };
            if (workspaceId) payload.workspace = workspaceId;
            return jsonResponse(payload);
        }

        // ── POST /api/themes/apply ──
        if (pathLower === '/api/themes/apply' && method === 'POST') {
            const authUser = await getAuthUser(request, env);
            if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

            const body = await request.json().catch(() => ({}));
            const themeId = body.theme_id;
            if (!themeId) return jsonResponse({ error: 'theme_id required' }, 400);

            const theme = await env.DB.prepare('SELECT slug FROM cms_themes WHERE id = ?').bind(themeId).first();
            if (!theme) return jsonResponse({ error: 'Theme not found' }, 404);

            let tid = authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
              ? String(authUser.tenant_id).trim()
              : null;
            if (!tid) tid = await fetchAuthUserTenantId(env, authUser.id);
            if (!tid) return jsonResponse({ error: 'Tenant could not be resolved' }, 403);

            await env.DB.prepare(
                    `INSERT INTO settings (tenant_id, setting_key, setting_value, updated_at)
                     VALUES (?, 'appearance.theme', ?, unixepoch())
                     ON CONFLICT(tenant_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = unixepoch()`
                ).bind(tid, theme.slug).run();

            return jsonResponse({ ok: true, theme: theme.slug });
        }

        return jsonResponse({ error: 'Theme route not found' }, 404);
    } catch (e) {
        return jsonResponse({ error: e.message }, 500);
    }
}
