/**
 * API Layer: User & Workspace Settings
 * Handles workspace listings, user preferences, theme preferences, and account config.
 * Tables: workspaces, user_workspace_settings, user_settings, user_preferences
 *
 * No hardcoded workspace IDs or names — all workspace data comes from DB scoped to tenant.
 */
import { jsonResponse }                 from '../core/responses.js';
import { getAuthUser, tenantIdFromEnv } from '../core/auth.js';
import { setUserThemePreference,
         getUserThemePreference }        from '../core/themes.js';

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function handleSettingsApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  const userId = String(authUser.id || '').trim();
  if (!env.DB)  return jsonResponse({ error: 'DB not configured' }, 503);

  try {

    // ── /api/settings/workspaces or /api/workspaces ───────────────────────
    if (path === '/api/settings/workspaces' || path === '/api/workspaces') {

      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { name, handle, status, category, brand } = body;
        if (!name) return jsonResponse({ error: 'name required' }, 400);

        const id = `ws_${Date.now()}`;
        await env.DB.prepare(
          `INSERT INTO workspaces (id, name, handle, status, category, created_at)
           VALUES (?, ?, ?, ?, ?, unixepoch())`
        ).bind(id, name, handle || name, status || 'active', category || 'other').run();
        return jsonResponse({ ok: true, id });
      }

      if (method === 'GET') {
        const [wsRows, userWsRows, defaultWs] = await Promise.all([
          env.DB.prepare(
            `SELECT id, name, category FROM workspaces WHERE status = 'active' ORDER BY name ASC`
          ).all().then(r => r.results || []).catch(() => []),

          env.DB.prepare(
            `SELECT workspace_id, brand, plans, budget, time, theme
             FROM user_workspace_settings WHERE user_id = ?`
          ).bind(userId).all().then(r => r.results || []).catch(() => []),

          env.DB.prepare(
            `SELECT default_workspace_id FROM user_settings WHERE user_id = ? LIMIT 1`
          ).bind(userId).first().catch(() => null),
        ]);

        const workspaces = {};
        const workspaceThemes = {};
        for (const r of userWsRows) {
          workspaces[r.workspace_id] = {
            brand:  r.brand  ?? '',
            plans:  r.plans  ?? '',
            budget: r.budget ?? '',
            time:   r.time   ?? '',
          };
          if (r.theme?.trim()) workspaceThemes[r.workspace_id] = r.theme.trim();
        }

        return jsonResponse({
          data:            wsRows,
          current:         defaultWs?.default_workspace_id || null,
          workspaceThemes,
          workspaces,
        });
      }

      if (method === 'PATCH' || method === 'PUT') {
        const body = await request.json().catch(() => ({}));
        const { workspace_id, brand, plans, budget, time } = body;
        if (!workspace_id) return jsonResponse({ error: 'workspace_id required' }, 400);

        await env.DB.prepare(
          `INSERT INTO user_workspace_settings (user_id, workspace_id, brand, plans, budget, time, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, unixepoch())
           ON CONFLICT(user_id, workspace_id) DO UPDATE SET
             brand      = excluded.brand,
             plans      = excluded.plans,
             budget     = excluded.budget,
             time       = excluded.time,
             updated_at = unixepoch()`
        ).bind(userId, workspace_id, brand ?? '', plans ?? '', budget ?? '', time ?? '').run();
        return jsonResponse({ ok: true });
      }
    }

    // ── /api/settings/workspace/default ──────────────────────────────────
    if (path === '/api/settings/workspace/default' && (method === 'PUT' || method === 'PATCH')) {
      const body = await request.json().catch(() => ({}));
      const workspace_id = body.workspace_id;
      if (!workspace_id) return jsonResponse({ error: 'workspace_id required' }, 400);

      await env.DB.prepare(
        `UPDATE user_settings SET default_workspace_id = ?, updated_at = unixepoch() WHERE user_id = ?`
      ).bind(workspace_id, userId).run();
      return jsonResponse({ ok: true, current: workspace_id });
    }

    // ── /api/settings/workspace/:id/theme ────────────────────────────────
    const wsThemeMatch = path.match(/^\/api\/settings\/workspace\/([^/]+)\/theme$/);
    if (wsThemeMatch && (method === 'PUT' || method === 'PATCH')) {
      const workspaceId = wsThemeMatch[1];
      const body        = await request.json().catch(() => ({}));
      const theme       = body.theme != null ? String(body.theme).trim() : null;

      await env.DB.prepare(
        `INSERT INTO user_workspace_settings (user_id, workspace_id, brand, plans, budget, time, theme, updated_at)
         VALUES (?, ?, '', '', '', '', ?, unixepoch())
         ON CONFLICT(user_id, workspace_id) DO UPDATE SET theme = excluded.theme, updated_at = unixepoch()`
      ).bind(userId, workspaceId, theme || null).run();
      return jsonResponse({ ok: true });
    }

    // ── /api/user/preferences (theme + other prefs) ───────────────────────
    if (path === '/api/user/preferences' && method === 'PATCH') {
      const body = await request.json().catch(() => ({}));

      // Theme preference — delegates to themes.js which writes to user_preferences
      if (body.theme_preset) {
        await setUserThemePreference(env, userId, body.theme_preset);
      }

      // Other user_settings fields
      const settingsCols = ['timezone','language','compact_mode','sidebar_collapsed','font_size','high_contrast','email_notifications','push_notifications','reduced_motion'];
      const sets = [], vals = [];
      for (const [k, v] of Object.entries(body)) {
        if (settingsCols.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
      }
      if (sets.length) {
        vals.push(userId);
        await env.DB.prepare(
          `UPDATE user_settings SET ${sets.join(', ')}, updated_at = unixepoch() WHERE user_id = ?`
        ).bind(...vals).run().catch(() => {});
      }

      return jsonResponse({ ok: true });
    }

    // ── /api/user/preferences (GET) ───────────────────────────────────────
    if (path === '/api/user/preferences' && method === 'GET') {
      const [settings, themePreset] = await Promise.all([
        env.DB.prepare(`SELECT * FROM user_settings WHERE user_id = ? LIMIT 1`).bind(userId).first().catch(() => null),
        getUserThemePreference(env, userId),
      ]);
      return jsonResponse({ settings: settings || null, theme_preset: themePreset });
    }

    // ── /api/user/profile (GET) ───────────────────────────────────────────
    if (path === '/api/user/profile' && method === 'GET') {
      const row = await env.DB.prepare(
        `SELECT id, user_id, full_name, display_name, avatar_url, bio,
                primary_email, phone, timezone, language, theme, compact_mode,
                sidebar_collapsed, font_size, default_workspace_id, created_at
         FROM user_settings WHERE user_id = ? LIMIT 1`
      ).bind(userId).first().catch(() => null);
      return jsonResponse({ profile: row || null });
    }

    // ── /api/user/profile (PATCH) ─────────────────────────────────────────
    if (path === '/api/user/profile' && method === 'PATCH') {
      const body    = await request.json().catch(() => ({}));
      const allowed = ['full_name','display_name','avatar_url','bio','phone','timezone','language'];
      const sets = [], vals = [];
      for (const [k, v] of Object.entries(body)) {
        if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
      }
      if (!sets.length) return jsonResponse({ ok: true });
      vals.push(userId);
      await env.DB.prepare(
        `UPDATE user_settings SET ${sets.join(', ')}, updated_at = unixepoch() WHERE user_id = ?`
      ).bind(...vals).run();
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Settings route not found', path }, 404);
  } catch (e) {
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}
