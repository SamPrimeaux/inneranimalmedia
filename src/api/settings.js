/**
 * API Service: User & Workspace Settings
 * Handles workspace listings, themes, and personal account configurations.
 * Deconstructed from legacy worker.js.
 */
import {
  getAuthUser,
  jsonResponse,
  fetchAuthUserTenantId,
  fallbackSystemTenantId,
} from '../core/auth.js';
import { handleSettingsIntegrationsApi } from './settings-integrations.js';

const AGENTSAM_POLICY_COLS = [
  'auto_run_mode',
  'browser_protection',
  'mcp_tools_protection',
  'file_deletion_protection',
  'external_file_protection',
  'default_agent_location',
  'text_size',
  'auto_clear_chat',
  'submit_with_mod_enter',
  'max_tab_count',
  'queue_messages_mode',
  'usage_summary_mode',
  'agent_autocomplete',
  'web_search_enabled',
  'auto_accept_web_search',
  'web_fetch_enabled',
  'hierarchical_ignore',
  'ignore_symlinks',
  'inline_diffs',
  'jump_next_diff_on_accept',
  'auto_format_on_agent_finish',
  'legacy_terminal_tool',
  'toolbar_on_selection',
  'auto_parse_links',
  'themed_diff_backgrounds',
  'terminal_hint',
  'terminal_preview_box',
  'collapse_auto_run_commands',
  'voice_submit_keyword',
  'commit_attribution',
  'pr_attribution',
  'settings_json',
];

async function resolveCanonicalUserId(env, sessionUserId, email) {
  if (!env?.DB) return { authId: sessionUserId || null, userId: null };
  const sid = sessionUserId != null ? String(sessionUserId).trim() : '';
  const em = email != null ? String(email).trim() : '';
  try {
    const row = await env.DB.prepare(
      `SELECT au.id as auth_id, u.id as user_id
       FROM auth_users au
       LEFT JOIN users u ON u.auth_id = au.id OR LOWER(COALESCE(u.email,'')) = LOWER(au.email)
       WHERE au.id = ? OR LOWER(au.email) = LOWER(?)
       LIMIT 1`,
    )
      .bind(sid, em || sid)
      .first();
    return { authId: row?.auth_id || (sid || null), userId: row?.user_id || null };
  } catch {
    return { authId: sid || null, userId: null };
  }
}

async function resolveRequestWorkspaceId(env, authUser, url) {
  const fromQuery = url.searchParams.get('workspace_id');
  if (fromQuery != null && String(fromQuery).trim() !== '') return String(fromQuery).trim();
  if (!env?.DB) return '';
  const uid = String(authUser?.id || '').trim();
  try {
    const row = await env.DB.prepare(
      `SELECT default_workspace_id FROM user_settings WHERE user_id = ? LIMIT 1`,
    )
      .bind(uid)
      .first();
    if (row?.default_workspace_id != null && String(row.default_workspace_id).trim() !== '') {
      return String(row.default_workspace_id).trim();
    }
  } catch (_) {
    /* legacy schema */
  }
  try {
    const row = await env.DB.prepare(
      `SELECT default_workspace_id FROM users WHERE id = ? LIMIT 1`,
    )
      .bind(uid)
      .first();
    if (row?.default_workspace_id != null && String(row.default_workspace_id).trim() !== '') {
      return String(row.default_workspace_id).trim();
    }
  } catch (_) {
    /* ignore */
  }
  return '';
}

async function resolveAuthTenantId(env, authUser) {
  if (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  let tid = await fetchAuthUserTenantId(env, authUser.id);
  if (tid) return tid;
  if (authUser.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email);
    if (tid) return tid;
  }
  return null;
}

function parseJsonSafe(str, fallback = {}) {
  if (str == null || str === '') return { ...fallback };
  try {
    const o = typeof str === 'string' ? JSON.parse(str) : str;
    return typeof o === 'object' && o !== null ? o : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

const CORE_WORKSPACES_DATA = [
  { id: 'ws_inneranimalmedia', name: 'Inner Animal Media', category: 'entity' },
  { id: 'ws_inneranimal', name: 'InnerAnimal', category: 'entity' },
  { id: 'ws_meauxbility', name: 'Meauxbility', category: 'entity' },
  { id: 'ws_innerautodidact', name: 'InnerAutodidact', category: 'entity' },
];

const CORE_WORKSPACE_IDS = CORE_WORKSPACES_DATA.map(w => w.id);

async function workspaceIdIsAllowed(env, id) {
  if (CORE_WORKSPACE_IDS.includes(id)) return true;
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare('SELECT id FROM workspaces WHERE id = ? LIMIT 1').bind(id).first();
    return !!row;
  } catch (_) {
    return false;
  }
}

/**
 * Main dispatcher for Settings-related API routes (/api/settings/*).
 */
export async function handleSettingsRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  const sessionUserId = authUser.id;

  const settingsIntegrationsRes = await handleSettingsIntegrationsApi(
    request,
    env,
    ctx,
    authUser,
    url,
    pathLower,
    method,
  );
  if (settingsIntegrationsRes) return settingsIntegrationsRes;

  // ── /api/settings/profile ─────────────────────────────────────────────────
  if (pathLower === '/api/settings/profile' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const uid = String(authUser.id || '').trim();
    const email = String(authUser.email || '').trim() || null;
    let row = null;
    try {
      row = await env.DB.prepare(
        `SELECT id, email, name, tenant_id, role, created_at, avatar_url, default_workspace_id
         FROM auth_users WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1`,
      )
        .bind(uid, uid)
        .first();
    } catch (_) {}
    const tenantId = (row?.tenant_id != null && String(row.tenant_id).trim() !== '')
      ? String(row.tenant_id).trim()
      : await resolveAuthTenantId(env, authUser);
    const role = row?.role != null && String(row.role).trim() ? String(row.role).trim() : (authUser.role || 'user');
    const workspace_id = row?.default_workspace_id != null && String(row.default_workspace_id).trim()
      ? String(row.default_workspace_id).trim()
      : (await resolveRequestWorkspaceId(env, authUser, url)) || null;
    return jsonResponse({
      id: uid,
      email: row?.email ?? email,
      name: row?.name ?? authUser.name ?? null,
      tenant_id: tenantId,
      role,
      workspace_id,
      created_at: row?.created_at ?? null,
      avatar_url: row?.avatar_url ?? null,
    });
  }

  // ── /api/settings/theme ───────────────────────────────────────────────────
  if (pathLower === '/api/settings/theme' && method === 'GET') {
    if (!env.DB) {
      return jsonResponse({ theme: 'dark', accent_color: '#c8ff3e', dark_mode: true });
    }
    const uid = String(authUser.id || '').trim();
    const defaults = { theme: 'dark', accent_color: '#c8ff3e', dark_mode: true };
    try {
      const row = await env.DB.prepare(
        `SELECT theme, accent_color, dark_mode
         FROM user_settings WHERE user_id = ? LIMIT 1`,
      )
        .bind(uid)
        .first();
      if (!row) return jsonResponse(defaults);
      const theme = row.theme != null && String(row.theme).trim() ? String(row.theme).trim() : defaults.theme;
      const accent_color =
        row.accent_color != null && String(row.accent_color).trim()
          ? String(row.accent_color).trim()
          : defaults.accent_color;
      const dark_mode =
        row.dark_mode === 0 || row.dark_mode === '0' || row.dark_mode === false
          ? false
          : true;
      return jsonResponse({ theme, accent_color, dark_mode });
    } catch (_) {
      return jsonResponse(defaults);
    }
  }

  // ── /api/settings/preferences ─────────────────────────────────────────────
  if (pathLower === '/api/settings/preferences' && method === 'GET') {
    if (!env.DB) return jsonResponse({ prefs_json: {}, tenant_id: null, user_id: sessionUserId });
    const tenantId = await resolveAuthTenantId(env, authUser);
    const uid = String(authUser.id || '').trim();
    if (!tenantId) return jsonResponse({ prefs_json: {}, tenant_id: null, user_id: uid });
    try {
      const row = await env.DB.prepare(
        `SELECT * FROM user_storage_preferences WHERE tenant_id = ? AND user_id = ? LIMIT 1`,
      )
        .bind(tenantId, uid)
        .first();
      if (!row) {
        return jsonResponse({ tenant_id: tenantId, user_id: uid, prefs_json: {}, updated_at: null });
      }
      const prefs = parseJsonSafe(row.prefs_json, {});
      return jsonResponse({ ...row, prefs_json: prefs });
    } catch (_) {
      return jsonResponse({ tenant_id: tenantId, user_id: uid, prefs_json: {}, updated_at: null });
    }
  }

  const { authId: canonicalAuthId, userId: canonicalUserId } =
    await resolveCanonicalUserId(env, sessionUserId, authUser.email);
  const agentsamUserCandidates = Array.from(
    new Set([canonicalAuthId, canonicalUserId, sessionUserId].filter(Boolean).map((x) => String(x))),
  );

  // ── /api/tenant/onboarding ─────────────────────────────────────────────
  if (pathLower === '/api/tenant/onboarding' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);
    try {
      const row = await env.DB.prepare(
        `SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`,
      )
        .bind(tenantId)
        .first();
      if (!row) {
        return jsonResponse({
          onboarding_completed: 0,
          activation_progress: 0,
          activation_checks: {},
          activation_checks_json: '{}',
        });
      }
      const checks = parseJsonSafe(row.activation_checks_json, {});
      return jsonResponse({
        ...row,
        activation_checks: checks,
        activation_checks_json:
          typeof row.activation_checks_json === 'string'
            ? row.activation_checks_json
            : JSON.stringify(checks),
      });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/tenant/onboarding' && method === 'PATCH') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);
    const body = await request.json().catch(() => ({}));
    const checkKey =
      typeof body.check_key === 'string' ? body.check_key.trim() : '';
    if (!checkKey) return jsonResponse({ error: 'check_key required' }, 400);
    const completed =
      body.completed === true ||
      body.completed === 1 ||
      body.completed === '1';

    try {
      const existing = await env.DB.prepare(
        `SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`,
      )
        .bind(tenantId)
        .first();

      let checks = parseJsonSafe(existing?.activation_checks_json, {});
      checks[checkKey] = !!completed;

      const keys = Object.keys(checks);
      const total = keys.length;
      const done = keys.filter((k) => checks[k] === true).length;
      const activation_progress =
        total === 0 ? 0 : Math.round((done / total) * 100);
      const onboarding_completed = total > 0 && done === total ? 1 : 0;

      const checksJson = JSON.stringify(checks);

      await env.DB.prepare(
        `INSERT INTO tenant_activation_status (
          tenant_id, onboarding_completed, activation_checks_json, activation_progress
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET
          onboarding_completed = excluded.onboarding_completed,
          activation_checks_json = excluded.activation_checks_json,
          activation_progress = excluded.activation_progress`,
      )
        .bind(
          tenantId,
          onboarding_completed,
          checksJson,
          activation_progress,
        )
        .run();

      const row = await env.DB.prepare(
        `SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`,
      )
        .bind(tenantId)
        .first();

      return jsonResponse({
        ...row,
        activation_checks: checks,
      });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('ON CONFLICT') || msg.includes('no such column')) {
        try {
          const existing = await env.DB.prepare(
            `SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`,
          )
            .bind(tenantId)
            .first();
          let checks = parseJsonSafe(existing?.activation_checks_json, {});
          checks[checkKey] = !!completed;
          const keys = Object.keys(checks);
          const total = keys.length;
          const done = keys.filter((k) => checks[k] === true).length;
          const activation_progress =
            total === 0 ? 0 : Math.round((done / total) * 100);
          const onboarding_completed = total > 0 && done === total ? 1 : 0;
          const checksJson = JSON.stringify(checks);
          if (existing) {
            await env.DB.prepare(
              `UPDATE tenant_activation_status SET
                onboarding_completed = ?, activation_checks_json = ?, activation_progress = ?
               WHERE tenant_id = ?`,
            )
              .bind(
                onboarding_completed,
                checksJson,
                activation_progress,
                tenantId,
              )
              .run();
          } else {
            await env.DB.prepare(
              `INSERT INTO tenant_activation_status (
                tenant_id, onboarding_completed, activation_checks_json, activation_progress
              ) VALUES (?, ?, ?, ?)`,
            )
              .bind(
                tenantId,
                onboarding_completed,
                checksJson,
                activation_progress,
              )
              .run();
          }
          const row = await env.DB.prepare(
            `SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`,
          )
            .bind(tenantId)
            .first();
          return jsonResponse({ ...row, activation_checks: checks });
        } catch (e2) {
          return jsonResponse({ error: e2?.message ?? String(e2) }, 500);
        }
      }
      return jsonResponse({ error: msg }, 500);
    }
  }

  // ── GET /api/tenant/branding ─────────────────────────────────────────────
  if (pathLower === '/api/tenant/branding' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);
    try {
      const row = await env.DB.prepare(
        `SELECT * FROM tenant_branding WHERE tenant_id = ? LIMIT 1`,
      )
        .bind(tenantId)
        .first();
      if (!row) return jsonResponse({ branding: null });
      return jsonResponse(row);
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── /api/settings/workspaces ───────────────────────────────────────────
  if (pathLower === '/api/settings/workspaces' || pathLower === '/api/workspaces') {
    if (method === 'POST') {
      if (!env.DB) return jsonResponse({ error: 'Database not available' }, 500);
      const body = await request.json().catch(() => ({}));
      const { name, handle, status, category, brand } = body;
      if (!name) return jsonResponse({ error: 'name required' }, 400);
      
      const id = `ws_${Date.now()}`;
      try {
        await env.DB.prepare(
          `INSERT INTO workspaces (id, name, handle, status, category, brand, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
        ).bind(id, name, handle || name, status || 'active', category || 'other', brand || null).run();
        return jsonResponse({ ok: true, id });
      } catch (e) {
        // Fallback for missing columns if table schema differs
        if (String(e?.message || '').includes('no such column')) {
          await env.DB.prepare(
            `INSERT INTO workspaces (id, name, handle, status, created_at) VALUES (?, ?, ?, ?, unixepoch())`
          ).bind(id, name, handle || name, status || 'active').run();
          return jsonResponse({ ok: true, id });
        }
        throw e;
      }
    }

    if (method === 'GET') {
      if (!env.DB) {
        return jsonResponse({ data: CORE_WORKSPACES_DATA, current: 'ws_inneranimalmedia', workspaceThemes: {}, workspaces: {} });
      }
      try {
        const [wsRows, rows, us] = await Promise.all([
          (async () => {
            try {
              const res = await env.DB.prepare("SELECT id, name, category, brand FROM workspaces WHERE id LIKE 'ws_%' ORDER BY name").all();
              return res.results || [];
            } catch (e) {
              if (String(e?.message || '').includes('no such column: brand')) {
                const res = await env.DB.prepare("SELECT id, name, category FROM workspaces WHERE id LIKE 'ws_%' ORDER BY name").all();
                return res.results || [];
              }
              throw e;
            }
          })(),
          (async () => {
            try {
              const res = await env.DB.prepare(
                'SELECT workspace_id, brand, plans, budget, time, theme FROM user_workspace_settings WHERE user_id = ?'
              ).bind(sessionUserId).all();
              return res.results || [];
            } catch (e) {
              if (String(e?.message || '').includes('no such column: theme')) {
                const res = await env.DB.prepare(
                  'SELECT workspace_id, brand, plans, budget, time FROM user_workspace_settings WHERE user_id = ?'
                ).bind(sessionUserId).all();
                return res.results || [];
              }
              throw e;
            }
          })(),
          (async () => {
            try {
              return await env.DB.prepare('SELECT default_workspace_id FROM user_settings WHERE user_id = ? LIMIT 1').bind(sessionUserId).first();
            } catch (e) {
              return null;
            }
          })(),
        ]);

        const workspaces = {};
        const workspaceThemes = {};
        for (const r of rows) {
          workspaces[r.workspace_id] = {
            brand: r.brand ?? '',
            plans: r.plans ?? '',
            budget: r.budget ?? '',
            time: r.time ?? '',
          };
          if (r.theme != null && r.theme.trim()) workspaceThemes[r.workspace_id] = r.theme.trim();
        }
        
        const current = us?.default_workspace_id || 'ws_inneranimalmedia';
        return jsonResponse({ data: wsRows.length > 0 ? wsRows : CORE_WORKSPACES_DATA, current, workspaceThemes, workspaces });
      } catch (e) {
        return jsonResponse({ data: CORE_WORKSPACES_DATA, current: 'ws_inneranimalmedia', error: e?.message }, 500);
      }
    }

    if (method === 'PATCH' || method === 'PUT') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      try {
        const body = await request.json().catch(() => ({}));
        const { workspace_id, brand, plans, budget, time } = body;
        if (!workspace_id) return jsonResponse({ error: 'workspace_id required' }, 400);
        
        await env.DB.prepare(
          `INSERT INTO user_workspace_settings (user_id, workspace_id, brand, plans, budget, time, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, unixepoch())
           ON CONFLICT(user_id, workspace_id) DO UPDATE SET
             brand = excluded.brand, plans = excluded.plans, budget = excluded.budget, time = excluded.time, updated_at = unixepoch()`
        ).bind(sessionUserId, workspace_id, brand ?? '', plans ?? '', budget ?? '', time ?? '').run();
        return jsonResponse({ ok: true });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? 'Save failed' }, 500);
      }
    }
  }

  // ── POST /api/settings/workspaces/active — touch workspaces (sort order) ──
  if (pathLower === '/api/settings/workspaces/active' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const tenantId = await resolveAuthTenantId(env, authUser);
      const isSuper = Number(authUser.is_superadmin) === 1;
      if (!tenantId && !isSuper) return jsonResponse({ error: 'Tenant required' }, 403);
      const body = await request.json().catch(() => ({}));
      const id = body.id != null ? String(body.id).trim() : '';
      if (!id) return jsonResponse({ error: 'id required' }, 400);

      const row = await env.DB.prepare(
        `SELECT w.id, w.display_name, w.slug, w.workspace_type, w.r2_prefix, w.github_repo, w.settings_json,
                w.tenant_id
         FROM workspaces w
         WHERE w.id = ?
           AND (
             w.tenant_id = ?
             OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = w.id AND wm.user_id = ?
                 AND COALESCE(wm.is_active, 1) = 1
             )
             OR (? = 1)
           )
         LIMIT 1`,
      )
        .bind(id, tenantId ?? '', sessionUserId, isSuper ? 1 : 0)
        .first();
      if (!row) return jsonResponse({ error: 'Workspace not found' }, 404);

      await env.DB.prepare(`UPDATE workspaces SET updated_at = datetime('now') WHERE id = ?`).bind(id).run();

      try {
        await env.DB.prepare(
          `UPDATE user_settings SET default_workspace_id = ?, updated_at = unixepoch() WHERE user_id = ?`,
        )
          .bind(id, sessionUserId)
          .run();
      } catch (_) {
        /* optional legacy row */
      }

      return jsonResponse({
        success: true,
        workspace: {
          id: row.id,
          display_name: row.display_name,
          slug: row.slug,
          workspace_type: row.workspace_type ?? null,
          r2_prefix: row.r2_prefix ?? null,
          github_repo: row.github_repo ?? null,
          settings_json: row.settings_json ?? null,
        },
        ok: true,
        current: id,
      });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'Update failed' }, 500);
    }
  }

  // ── /api/settings/workspace/default ──────────────────────────────────────
  if (pathLower === '/api/settings/workspace/default' && (method === 'PUT' || method === 'PATCH')) {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const body = await request.json().catch(() => ({}));
      const workspace_id = body.workspace_id;
      if (!workspace_id) return jsonResponse({ error: 'workspace_id required' }, 400);
      
      await env.DB.prepare(
        `UPDATE user_settings SET default_workspace_id = ?, updated_at = unixepoch() WHERE user_id = ?`
      ).bind(workspace_id, sessionUserId).run();
      return jsonResponse({ ok: true, current: workspace_id });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'Update failed' }, 500);
    }
  }

  // ── /api/settings/workspace/:id/theme ────────────────────────────────────
  const themeMatch = pathLower.match(/^\/api\/settings\/workspace\/([^/]+)\/theme$/);
  if (themeMatch && (method === 'PUT' || method === 'PATCH')) {
    const workspaceId = themeMatch[1];
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const body = await request.json().catch(() => ({}));
      const theme = body.theme != null ? String(body.theme).trim() : null;
      
      await env.DB.prepare(
        `INSERT INTO user_workspace_settings (user_id, workspace_id, brand, plans, budget, time, theme, updated_at)
         VALUES (?, ?, '', '', '', '', ?, unixepoch())
         ON CONFLICT(user_id, workspace_id) DO UPDATE SET theme = excluded.theme, updated_at = unixepoch()`
      ).bind(sessionUserId, workspaceId, theme || null).run();
      return jsonResponse({ ok: true });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'Save failed' }, 500);
    }
  }

  // ── GET /api/ai/models — D1 ai_models (Settings + admin) ─────────────────
  if (pathLower === '/api/ai/models' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const { results } = await env.DB.prepare(
        'SELECT * FROM ai_models ORDER BY provider ASC, display_name ASC',
      ).all();
      return jsonResponse({ models: results || [] });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── POST /api/settings/model-preference — toggle show_in_picker ─────────
  if (pathLower === '/api/settings/model-preference' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    const isSuper = Number(authUser.is_superadmin) === 1;
    if (!tenantId && !isSuper) return jsonResponse({ error: 'Tenant required' }, 403);
    const body = await request.json().catch(() => ({}));
    const modelKey = String(body.model_key || '').trim();
    if (!modelKey) return jsonResponse({ error: 'model_key required' }, 400);
    const enabled =
      body.enabled === true ||
      body.enabled === 1 ||
      body.enabled === '1' ||
      body.enabled === 'true';
    try {
      const r = await env.DB.prepare(
        `UPDATE ai_models SET show_in_picker = ?, updated_at = unixepoch()
         WHERE model_key = ?`,
      )
        .bind(enabled ? 1 : 0, modelKey)
        .run();
      if (!r.meta?.changes) return jsonResponse({ error: 'Model not found' }, 404);
      const row = await env.DB.prepare(
        'SELECT * FROM ai_models WHERE model_key = ? LIMIT 1',
      )
        .bind(modelKey)
        .first();
      return jsonResponse({ ok: true, model: row });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── AGENTS (Cursor parity) ────────────────────────────────────────────────
  if (pathLower === '/api/settings/agents' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);

    const stored = await env.DB.prepare(
      `SELECT user_id FROM agentsam_user_policy
       WHERE workspace_id = ?
         AND user_id IN (${agentsamUserCandidates.map(() => '?').join(', ')})
       LIMIT 1`,
    )
      .bind(workspaceId || '', ...agentsamUserCandidates)
      .first()
      .catch(() => null);
    const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

    const [policyRow, cmdRows, domainRows, mcpRows] = await Promise.all([
      env.DB.prepare(
        `SELECT * FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1`,
      )
        .bind(agentsamUserId, workspaceId || '')
        .first()
        .catch(() => null),
      env.DB.prepare(
        `SELECT command FROM agentsam_command_allowlist
         WHERE user_id = ? AND workspace_id = ?
         ORDER BY command ASC`,
      )
        .bind(agentsamUserId, workspaceId || '')
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT host FROM agentsam_fetch_domain_allowlist
         WHERE user_id = ? AND workspace_id = ?
         ORDER BY host ASC`,
      )
        .bind(agentsamUserId, workspaceId || '')
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT tool_key, NULL AS notes FROM agentsam_mcp_allowlist
         WHERE user_id = ? AND workspace_id = ?
         ORDER BY tool_key ASC`,
      )
        .bind(agentsamUserId, workspaceId || '')
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
    ]);

    return jsonResponse({
      workspace_id: workspaceId || '',
      agentsam_user_id: agentsamUserId,
      canonical: {
        auth_id: canonicalAuthId || null,
        user_id: canonicalUserId || null,
        session_user_id: sessionUserId || null,
      },
      policy: policyRow || null,
      allowlists: {
        commands: cmdRows.map((r) => String(r.command || '').trim()).filter(Boolean),
        domains: domainRows.map((r) => String(r.host || '').trim()).filter(Boolean),
        mcp: mcpRows
          .map((r) => ({ tool_key: String(r.tool_key || '').trim(), notes: r.notes ?? null }))
          .filter((x) => x.tool_key),
      },
    });
  }

  if (pathLower === '/api/settings/agents/policy' && (method === 'PATCH' || method === 'PUT')) {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const workspaceId =
      body.workspace_id != null && String(body.workspace_id).trim() !== ''
        ? String(body.workspace_id).trim()
        : await resolveRequestWorkspaceId(env, authUser, url);

    const stored = await env.DB.prepare(
      `SELECT user_id FROM agentsam_user_policy
       WHERE workspace_id = ?
         AND user_id IN (${agentsamUserCandidates.map(() => '?').join(', ')})
       LIMIT 1`,
    )
      .bind(workspaceId || '', ...agentsamUserCandidates)
      .first()
      .catch(() => null);
    const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

    const incoming =
      body && typeof body === 'object'
        ? body.policy && typeof body.policy === 'object'
          ? body.policy
          : body
        : {};
    const cols = AGENTSAM_POLICY_COLS.filter((k) => Object.prototype.hasOwnProperty.call(incoming, k));
    if (!cols.length) return jsonResponse({ error: 'No valid policy fields' }, 400);

    const insertCols = ['user_id', 'workspace_id', ...cols].join(', ');
    const placeholders = ['?', '?', ...cols.map(() => '?')].join(', ');
    const updateSet = cols.map((k) => `${k} = excluded.${k}`).join(', ');
    const values = [agentsamUserId, workspaceId || '', ...cols.map((k) => incoming[k])];

    await env.DB.prepare(
      `INSERT INTO agentsam_user_policy (${insertCols})
       VALUES (${placeholders})
       ON CONFLICT(user_id, workspace_id) DO UPDATE SET
         ${updateSet},
         updated_at = datetime('now')`,
    )
      .bind(...values)
      .run();

    const row = await env.DB.prepare(
      `SELECT * FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1`,
    )
      .bind(agentsamUserId, workspaceId || '')
      .first()
      .catch(() => null);

    return jsonResponse({
      ok: true,
      policy: row,
      workspace_id: workspaceId || '',
      agentsam_user_id: agentsamUserId,
    });
  }

  // ── AGENTS Allowlist CRUD ────────────────────────────────────────────────
  if (pathLower === '/api/settings/agents/commands' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const workspaceId =
      body.workspace_id != null && String(body.workspace_id).trim() !== ''
        ? String(body.workspace_id).trim()
        : await resolveRequestWorkspaceId(env, authUser, url);
    const command = body?.command != null ? String(body.command).trim() : '';
    if (!command) return jsonResponse({ error: 'command required' }, 400);

    const stored = await env.DB.prepare(
      `SELECT user_id FROM agentsam_user_policy
       WHERE workspace_id = ?
         AND user_id IN (${agentsamUserCandidates.map(() => '?').join(', ')})
       LIMIT 1`,
    )
      .bind(workspaceId || '', ...agentsamUserCandidates)
      .first()
      .catch(() => null);
    const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

    await env.DB.prepare(
      `INSERT INTO agentsam_command_allowlist (id, user_id, workspace_id, command, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, workspace_id, command) DO NOTHING`,
    )
      .bind(crypto.randomUUID(), agentsamUserId, workspaceId || '', command)
      .run();
    return jsonResponse({ ok: true });
  }

  {
    const m = pathLower.match(/^\/api\/settings\/agents\/commands\/([^/]+)$/);
    if (m && method === 'DELETE') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
      const command = decodeURIComponent(m[1] || '').trim();
      if (!command) return jsonResponse({ error: 'command required' }, 400);

      const stored = await env.DB.prepare(
        `SELECT user_id FROM agentsam_user_policy
         WHERE workspace_id = ?
           AND user_id IN (${agentsamUserCandidates.map(() => '?').join(', ')})
         LIMIT 1`,
      )
        .bind(workspaceId || '', ...agentsamUserCandidates)
        .first()
        .catch(() => null);
      const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

      await env.DB.prepare(
        `DELETE FROM agentsam_command_allowlist
         WHERE user_id = ? AND workspace_id = ? AND command = ?`,
      )
        .bind(agentsamUserId, workspaceId || '', command)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  if (pathLower === '/api/settings/agents/domains' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const workspaceId =
      body.workspace_id != null && String(body.workspace_id).trim() !== ''
        ? String(body.workspace_id).trim()
        : await resolveRequestWorkspaceId(env, authUser, url);
    const host = body?.host != null ? String(body.host).trim() : '';
    if (!host) return jsonResponse({ error: 'host required' }, 400);

    const stored = await env.DB.prepare(
      `SELECT user_id FROM agentsam_user_policy
       WHERE workspace_id = ?
         AND user_id IN (${agentsamUserCandidates.map(() => '?').join(', ')})
       LIMIT 1`,
    )
      .bind(workspaceId || '', ...agentsamUserCandidates)
      .first()
      .catch(() => null);
    const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

    await env.DB.prepare(
      `INSERT INTO agentsam_fetch_domain_allowlist (id, user_id, workspace_id, host, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, workspace_id, host) DO NOTHING`,
    )
      .bind(crypto.randomUUID(), agentsamUserId, workspaceId || '', host)
      .run();
    return jsonResponse({ ok: true });
  }

  {
    const m = pathLower.match(/^\/api\/settings\/agents\/domains\/([^/]+)$/);
    if (m && method === 'DELETE') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
      const host = decodeURIComponent(m[1] || '').trim();
      if (!host) return jsonResponse({ error: 'host required' }, 400);

      const stored = await env.DB.prepare(
        `SELECT user_id FROM agentsam_user_policy
         WHERE workspace_id = ?
           AND user_id IN (${agentsamUserCandidates.map(() => '?').join(', ')})
         LIMIT 1`,
      )
        .bind(workspaceId || '', ...agentsamUserCandidates)
        .first()
        .catch(() => null);
      const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

      await env.DB.prepare(
        `DELETE FROM agentsam_fetch_domain_allowlist
         WHERE user_id = ? AND workspace_id = ? AND host = ?`,
      )
        .bind(agentsamUserId, workspaceId || '', host)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  if (pathLower === '/api/settings/agents/mcp' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const workspaceId =
      body.workspace_id != null && String(body.workspace_id).trim() !== ''
        ? String(body.workspace_id).trim()
        : await resolveRequestWorkspaceId(env, authUser, url);
    const tool_key = body?.tool_key != null ? String(body.tool_key).trim() : '';
    const notes = body?.notes != null ? String(body.notes).trim() : null;
    if (!tool_key) return jsonResponse({ error: 'tool_key required' }, 400);
    if (!tool_key.includes(':')) return jsonResponse({ error: 'tool_key must include ":" (server:tool)' }, 400);

    const stored = await env.DB.prepare(
      `SELECT user_id FROM agentsam_user_policy
       WHERE workspace_id = ?
         AND user_id IN (${agentsamUserCandidates.map(() => '?').join(', ')})
       LIMIT 1`,
    )
      .bind(workspaceId || '', ...agentsamUserCandidates)
      .first()
      .catch(() => null);
    const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

    // Note: current schema may not include notes; try best-effort insert.
    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_mcp_allowlist (id, user_id, workspace_id, tool_key, notes, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, workspace_id, tool_key) DO NOTHING`,
      )
        .bind(crypto.randomUUID(), agentsamUserId, workspaceId || '', tool_key, notes)
        .run();
    } catch (e) {
      if (String(e?.message || '').includes('no such column: notes')) {
        await env.DB.prepare(
          `INSERT INTO agentsam_mcp_allowlist (id, user_id, workspace_id, tool_key, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(user_id, workspace_id, tool_key) DO NOTHING`,
        )
          .bind(crypto.randomUUID(), agentsamUserId, workspaceId || '', tool_key)
          .run();
      } else {
        throw e;
      }
    }
    return jsonResponse({ ok: true });
  }

  {
    const m = pathLower.match(/^\/api\/settings\/agents\/mcp\/([^/]+)$/);
    if (m && method === 'DELETE') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
      const tool_key = decodeURIComponent(m[1] || '').trim();
      if (!tool_key) return jsonResponse({ error: 'tool_key required' }, 400);

      const stored = await env.DB.prepare(
        `SELECT user_id FROM agentsam_user_policy
         WHERE workspace_id = ?
           AND user_id IN (${agentsamUserCandidates.map(() => '?').join(', ')})
         LIMIT 1`,
      )
        .bind(workspaceId || '', ...agentsamUserCandidates)
        .first()
        .catch(() => null);
      const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

      await env.DB.prepare(
        `DELETE FROM agentsam_mcp_allowlist
         WHERE user_id = ? AND workspace_id = ? AND tool_key = ?`,
      )
        .bind(agentsamUserId, workspaceId || '', tool_key)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  // ── MODELS ────────────────────────────────────────────────────────────────
  if (pathLower === '/api/settings/models' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
    try {
      const [models, tiers, routing] = await Promise.all([
        env.DB.prepare(
          `SELECT id, display_name AS name, provider, is_active, show_in_picker,
                  context_max_tokens AS context_window,
                  input_rate_per_mtok AS cost_per_input_mtok,
                  output_rate_per_mtok AS cost_per_output_mtok
           FROM ai_models
           ORDER BY provider, display_name`,
        )
          .all()
          .catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT * FROM agentsam_model_tier WHERE workspace_id = ? ORDER BY tier_level`,
        )
          .bind(workspaceId || '')
          .all()
          .catch(() => ({ results: [] })),
        env.DB.prepare(`SELECT * FROM ai_routing_rules ORDER BY priority`)
          .all()
          .catch(() => ({ results: [] })),
      ]);
      return jsonResponse({
        models: models.results || [],
        tiers: tiers.results || [],
        routing: routing.results || [],
        workspace_id: workspaceId || '',
      });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/models\/([^/]+)\/toggle$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const hasIA = body && Object.prototype.hasOwnProperty.call(body, 'is_active');
      const hasSP = body && Object.prototype.hasOwnProperty.call(body, 'show_in_picker');
      if (!hasIA && !hasSP) return jsonResponse({ error: 'No fields to update' }, 400);
      const existing = await env.DB.prepare(
        `SELECT is_active, show_in_picker FROM ai_models WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first();
      if (!existing) return jsonResponse({ error: 'Model not found' }, 404);
      const iaRaw = hasIA ? body.is_active : existing.is_active;
      const spRaw = hasSP ? body.show_in_picker : existing.show_in_picker;
      const ia = iaRaw === true || iaRaw === 1 || iaRaw === '1' ? 1 : 0;
      const sp = spRaw === true || spRaw === 1 || spRaw === '1' ? 1 : 0;
      await env.DB.prepare(
        `UPDATE ai_models SET is_active = ?, show_in_picker = ?, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(ia, sp, id)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/models\/tiers\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const allowed = [
        'model_id',
        'api_platform',
        'max_context_tokens',
        'max_output_tokens',
        'is_active',
        'escalate_if_confidence_below',
        'tier_name',
      ];
      const keys = allowed.filter((k) => body && Object.prototype.hasOwnProperty.call(body, k));
      if (!keys.length) return jsonResponse({ error: 'No fields to update' }, 400);
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const vals = keys.map((k) => body[k]);
      await env.DB.prepare(
        `UPDATE agentsam_model_tier SET ${sets}, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(...vals, id)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  // ── MCP settings surface ──────────────────────────────────────────────────
  if (pathLower === '/api/settings/mcp' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const [servers, tools, stats] = await Promise.all([
        env.DB.prepare(
          `SELECT s.*, COUNT(t.id) AS tool_count
           FROM mcp_services s
           LEFT JOIN mcp_registered_tools t ON t.mcp_service_url = s.endpoint_url
           WHERE COALESCE(s.is_active, 1) = 1
           GROUP BY s.id
           ORDER BY s.service_name`,
        )
          .all()
          .catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT t.*
           FROM mcp_registered_tools t
           ORDER BY COALESCE(t.tool_category, 'other'), COALESCE(t.sort_priority, 9999), t.tool_name`,
        )
          .all()
          .catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT tool_name, call_count, success_count, failure_count, total_cost_usd, avg_duration_ms
           FROM mcp_tool_call_stats
           WHERE date = date('now')`,
        )
          .all()
          .catch(() => ({ results: [] })),
      ]);
      const statsMap = Object.fromEntries(
        (stats.results || []).map((s) => [String(s.tool_name), s]),
      );
      const toolsWithStats = (tools.results || []).map((t) => ({
        ...t,
        stats: statsMap[String(t.tool_name)] || null,
      }));

      let commandPerformance = [];
      try {
        const tenantIdForPerf =
          (await resolveAuthTenantId(env, authUser)) || fallbackSystemTenantId(env);
        const perfResult = await env.DB.prepare(
          `SELECT
             epm.command_id,
             COALESCE(MAX(ac.display_name), CAST(epm.command_id AS TEXT)) AS display_name,
             SUM(epm.execution_count) AS total_executions,
             ROUND(AVG(epm.success_rate_percent), 1) AS avg_success_rate,
             ROUND(AVG(epm.avg_duration_ms), 0) AS avg_duration_ms,
             ROUND(SUM(COALESCE(epm.total_cost_cents, 0)) / 100.0, 4) AS total_cost_usd,
             MAX(epm.metric_date) AS last_active_date
           FROM execution_performance_metrics epm
           LEFT JOIN agentsam_commands ac ON ac.id = epm.command_id
           WHERE epm.tenant_id = ?
             AND epm.metric_date >= date('now', '-7 days')
           GROUP BY epm.command_id
           ORDER BY SUM(epm.execution_count) DESC`,
        )
          .bind(tenantIdForPerf)
          .all();
        commandPerformance = perfResult?.results || [];
      } catch {
        commandPerformance = [];
      }

      return jsonResponse({
        servers: servers.results || [],
        tools: toolsWithStats,
        commandPerformance,
      });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/mcp\/tools\/([^/]+)\/toggle$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const enabled = body.enabled === true || body.enabled === 1 || body.enabled === '1';
      await env.DB.prepare(
        `UPDATE mcp_registered_tools
         SET enabled = ?, updated_at = datetime('now')
         WHERE id = ? OR tool_name = ?`,
      )
        .bind(enabled ? 1 : 0, id, id)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/mcp\/tools\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const allowed = [
        'tool_name',
        'tool_category',
        'description',
        'enabled',
        'requires_approval',
        'handler_type',
        'handler_config',
        'risk_level',
        'sort_priority',
        'intent_tags',
        'modes_json',
        'cost_per_call_usd',
        'input_schema',
        'mcp_service_url',
      ];
      const keys = allowed.filter((k) => body && Object.prototype.hasOwnProperty.call(body, k));
      if (!keys.length) return jsonResponse({ error: 'No fields to update' }, 400);
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const vals = keys.map((k) => body[k]);
      await env.DB.prepare(
        `UPDATE mcp_registered_tools
         SET ${sets}, updated_at = datetime('now')
         WHERE id = ? OR tool_name = ?`,
      )
        .bind(...vals, id, id)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  // ── SKILLS / SUBAGENTS / COMMANDS / RULES ─────────────────────────────────
  if (pathLower === '/api/settings/skills' && method === 'GET') {
    if (!env.DB) return jsonResponse({ skills: [] });
    const storedUserId = canonicalAuthId || sessionUserId;
    const { results } = await env.DB.prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM agentsam_skill_invocation i WHERE i.skill_id = s.id) AS invocation_count,
        (SELECT MAX(invoked_at) FROM agentsam_skill_invocation i WHERE i.skill_id = s.id) AS last_used
       FROM agentsam_skill s
       WHERE s.user_id = ?
       ORDER BY COALESCE(s.sort_order, 9999), COALESCE(s.name, s.id)`,
    )
      .bind(String(storedUserId))
      .all()
      .catch(() => ({ results: [] }));
    return jsonResponse({ skills: results || [] });
  }

  if (pathLower === '/api/settings/skills' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const storedUserId = canonicalAuthId || sessionUserId;
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return jsonResponse({ error: 'name required' }, 400);
    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `skill_${crypto.randomUUID()}`;
    const description = typeof body.description === 'string' ? body.description : null;
    const icon = typeof body.icon === 'string' ? body.icon : null;
    const content_markdown = typeof body.content_markdown === 'string' ? body.content_markdown : '';
    const slash_trigger = typeof body.slash_trigger === 'string' ? body.slash_trigger : null;
    const globs = typeof body.globs === 'string' ? body.globs : null;
    const always_apply = body.always_apply === true || body.always_apply === 1 || body.always_apply === '1' ? 1 : 0;
    const tags = typeof body.tags === 'string' ? body.tags : null;
    const sort_order = body.sort_order != null && Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : null;
    const is_active = body.is_active === false || body.is_active === 0 || body.is_active === '0' ? 0 : 1;
    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_skill (
          id, user_id, workspace_id, name, description, icon, content_markdown,
          slash_trigger, globs, always_apply, tags, sort_order, is_active,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
        .bind(
          id,
          String(storedUserId),
          String(workspaceId || ''),
          name,
          description,
          icon,
          content_markdown,
          slash_trigger,
          globs,
          always_apply,
          tags,
          sort_order,
          is_active,
        )
        .run();
      return jsonResponse({ ok: true, id });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/skills\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const storedUserId = canonicalAuthId || sessionUserId;
      const body = await request.json().catch(() => ({}));
      const allowed = [
        'name',
        'description',
        'icon',
        'content_markdown',
        'slash_trigger',
        'globs',
        'always_apply',
        'tags',
        'sort_order',
        'is_active',
      ];
      const keys = allowed.filter((k) => body && Object.prototype.hasOwnProperty.call(body, k));
      if (!keys.length) return jsonResponse({ error: 'No fields to update' }, 400);
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const vals = keys.map((k) => body[k]);
      await env.DB.prepare(
        `UPDATE agentsam_skill SET ${sets}, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
      )
        .bind(...vals, id, String(storedUserId))
        .run();
      return jsonResponse({ ok: true });
    }
  }

  if (pathLower === '/api/settings/subagents' && method === 'GET') {
    if (!env.DB) return jsonResponse({ subagents: [] });
    const storedUserId = canonicalAuthId || sessionUserId;
    const { results } = await env.DB.prepare(
      `SELECT * FROM agentsam_subagent_profile WHERE user_id = ? ORDER BY COALESCE(sort_order, 9999)`,
    )
      .bind(String(storedUserId))
      .all()
      .catch(() => ({ results: [] }));
    return jsonResponse({ subagents: results || [] });
  }

  {
    const m = pathLower.match(/^\/api\/settings\/subagents\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const storedUserId = canonicalAuthId || sessionUserId;
      const body = await request.json().catch(() => ({}));
      const allowed = [
        'display_name',
        'description',
        'instructions_markdown',
        'default_model_id',
        'personality_tone',
        'sandbox_mode',
        'model_reasoning_effort',
        'is_active',
      ];
      const keys = allowed.filter((k) => body && Object.prototype.hasOwnProperty.call(body, k));
      if (!keys.length) return jsonResponse({ error: 'No fields to update' }, 400);
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const vals = keys.map((k) => body[k]);
      await env.DB.prepare(
        `UPDATE agentsam_subagent_profile SET ${sets}, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
      )
        .bind(...vals, id, String(storedUserId))
        .run();
      return jsonResponse({ ok: true });
    }
  }

  if (pathLower === '/api/settings/commands' && method === 'GET') {
    if (!env.DB) return jsonResponse({ commands: [] });
    const { results } = await env.DB.prepare(
      `SELECT * FROM agentsam_slash_commands WHERE COALESCE(is_active, 1) = 1 ORDER BY COALESCE(sort_order, 9999)`,
    )
      .all()
      .catch(() => ({ results: [] }));
    return jsonResponse({ commands: results || [] });
  }

  {
    const m = pathLower.match(/^\/api\/settings\/commands\/([^/]+)\/toggle$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const raw = Object.prototype.hasOwnProperty.call(body, 'is_active') ? body.is_active : body.enabled;
      const enabled = raw === true || raw === 1 || raw === '1';
      await env.DB.prepare(`UPDATE agentsam_slash_commands SET is_active = ? WHERE id = ?`)
        .bind(enabled ? 1 : 0, id)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  if (pathLower === '/api/settings/rules' && method === 'GET') {
    if (!env.DB) return jsonResponse({ rules: [] });
    const storedUserId = canonicalAuthId || sessionUserId;
    const { results } = await env.DB.prepare(
      `SELECT * FROM agentsam_rules_document
       WHERE (user_id = ? OR user_id IS NULL) AND COALESCE(is_active, 1) = 1
       ORDER BY datetime(updated_at) DESC`,
    )
      .bind(String(storedUserId))
      .all()
      .catch(() => ({ results: [] }));
    return jsonResponse({ rules: results || [] });
  }

  {
    const m = pathLower.match(/^\/api\/settings\/rules\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const hasBody = body && Object.prototype.hasOwnProperty.call(body, 'body_markdown');
      const hasActive = body && Object.prototype.hasOwnProperty.call(body, 'is_active');
      if (!hasBody && !hasActive) return jsonResponse({ error: 'No fields to update' }, 400);
      const sets = [];
      const vals = [];
      if (hasBody) {
        const body_markdown = typeof body.body_markdown === 'string' ? body.body_markdown : String(body.body_markdown ?? '');
        sets.push('body_markdown = ?');
        vals.push(body_markdown);
        sets.push('version = COALESCE(version, 1) + 1');
      }
      if (hasActive) {
        const ia = body.is_active === true || body.is_active === 1 || body.is_active === '1' ? 1 : 0;
        sets.push('is_active = ?');
        vals.push(ia);
      }
      await env.DB.prepare(
        `UPDATE agentsam_rules_document
         SET ${sets.join(', ')}, updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(...vals, id)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  // ── WORKSPACE / HOOKS / SECURITY / USAGE (read surfaces) ──────────────────
  if (pathLower === '/api/settings/workspace' && method === 'GET') {
    if (!env.DB) return jsonResponse({ workspace: null, members: [], indexJob: null });
    const tenantId = await resolveAuthTenantId(env, authUser);
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
    if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);
    try {
      const [workspace, members, indexJob] = await Promise.all([
        env.DB.prepare(
          `SELECT w.*, ws.theme_id, ws.accent_color, ws.timezone, ws.settings_json,
                  wl.max_daily_cost_usd, wl.max_members
           FROM workspaces w
           LEFT JOIN workspace_settings ws ON ws.workspace_id = w.id
           LEFT JOIN workspace_limits wl ON wl.workspace_id = w.id
           WHERE w.tenant_id = ?
           LIMIT 1`,
        )
          .bind(tenantId)
          .first()
          .catch(() => null),
        workspaceId
          ? env.DB.prepare(
              `SELECT wm.user_id, wm.role, u.display_name, u.email, u.avatar_url
               FROM workspace_members wm
               JOIN users u ON u.id = wm.user_id
               WHERE wm.workspace_id = ?`,
            )
              .bind(workspaceId)
              .all()
              .then((r) => r.results || [])
              .catch(() => [])
          : Promise.resolve([]),
        workspaceId
          ? env.DB.prepare(
              `SELECT status, progress_percent, file_count, indexed_file_count, last_sync_at, last_error
               FROM agentsam_code_index_job
               WHERE workspace_id = ?
               ORDER BY datetime(updated_at) DESC
               LIMIT 1`,
            )
              .bind(workspaceId)
              .first()
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      return jsonResponse({ workspace, members, indexJob, workspace_id: workspaceId || '' });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/settings/workspace/reindex' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
    if (!workspaceId) return jsonResponse({ error: 'workspace_id required' }, 400);
    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_code_index_job (
          workspace_id, status, progress_percent, file_count, indexed_file_count, last_sync_at, last_error, updated_at
        ) VALUES (?, 'running', 0, 0, 0, NULL, NULL, datetime('now'))
        ON CONFLICT(workspace_id) DO UPDATE SET
          status = 'running',
          progress_percent = 0,
          last_error = NULL,
          updated_at = datetime('now')`,
      )
        .bind(workspaceId)
        .run();
      return jsonResponse({ ok: true });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/settings/hooks' && method === 'GET') {
    if (!env.DB) return jsonResponse({ hooks: [], executions: [] });
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
    const storedUserId = canonicalAuthId || sessionUserId;
    const [hooks, executions] = await Promise.all([
      env.DB.prepare(
        `SELECT h.*,
          (SELECT COUNT(*) FROM agentsam_hook_execution e WHERE e.hook_id = h.id) AS run_count,
          (SELECT MAX(ran_at) FROM agentsam_hook_execution e WHERE e.hook_id = h.id) AS last_ran
         FROM agentsam_hook h
         WHERE h.user_id = ? AND COALESCE(h.workspace_id, '') = COALESCE(?, '')`,
      )
        .bind(String(storedUserId), workspaceId || '')
        .all()
        .catch(() => ({ results: [] })),
      env.DB.prepare(
        `SELECT * FROM agentsam_hook_execution WHERE user_id = ? ORDER BY datetime(ran_at) DESC LIMIT 50`,
      )
        .bind(String(storedUserId))
        .all()
        .catch(() => ({ results: [] })),
    ]);
    return jsonResponse({ hooks: hooks.results || [], executions: executions.results || [] });
  }

  if (pathLower === '/api/settings/hooks' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
    const storedUserId = canonicalAuthId || sessionUserId;
    const body = await request.json().catch(() => ({}));
    const trigger = typeof body.trigger === 'string' ? body.trigger.trim() : '';
    const command = typeof body.command === 'string' ? body.command.trim() : '';
    const provider = typeof body.provider === 'string' ? body.provider.trim() : 'system';
    if (!trigger) return jsonResponse({ error: 'trigger required' }, 400);
    if (!command) return jsonResponse({ error: 'command required' }, 400);
    const id = `hook_${crypto.randomUUID()}`;
    const is_active = body.is_active === false || body.is_active === 0 || body.is_active === '0' ? 0 : 1;
    await env.DB.prepare(
      `INSERT INTO agentsam_hook (id, user_id, workspace_id, trigger, command, provider, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(id, String(storedUserId), String(workspaceId || ''), trigger, command, provider, is_active)
      .run();
    return jsonResponse({ ok: true, id });
  }

  {
    const m = pathLower.match(/^\/api\/settings\/hooks\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const storedUserId = canonicalAuthId || sessionUserId;
      const body = await request.json().catch(() => ({}));
      const allowed = ['is_active', 'trigger', 'command', 'provider'];
      const keys = allowed.filter((k) => body && Object.prototype.hasOwnProperty.call(body, k));
      if (!keys.length) return jsonResponse({ error: 'No fields to update' }, 400);
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const vals = keys.map((k) => body[k]);
      await env.DB.prepare(
        `UPDATE agentsam_hook SET ${sets}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
      )
        .bind(...vals, id, String(storedUserId))
        .run();
      return jsonResponse({ ok: true });
    }
    if (m && method === 'DELETE') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const storedUserId = canonicalAuthId || sessionUserId;
      await env.DB.prepare(`DELETE FROM agentsam_hook WHERE id = ? AND user_id = ?`)
        .bind(id, String(storedUserId))
        .run();
      return jsonResponse({ ok: true });
    }
  }

  if (pathLower === '/api/settings/security/sessions' && method === 'GET') {
    if (!env.DB) return jsonResponse({ sessions: [] });
    const storedUserId = canonicalAuthId || sessionUserId;
    const { results } = await env.DB.prepare(
      `SELECT id, provider, ip_address, user_agent, last_active_at, expires_at, created_at
       FROM sessions
       WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY COALESCE(last_active_at, created_at) DESC`,
    )
      .bind(String(storedUserId))
      .all()
      .catch(() => ({ results: [] }));
    return jsonResponse({ sessions: results || [] });
  }

  if (pathLower === '/api/settings/security/findings' && method === 'GET') {
    if (!env.DB) return jsonResponse({ findings: [] });
    const storedUserId = canonicalAuthId || sessionUserId;
    try {
      const { results } = await env.DB.prepare(
        `SELECT severity, title, description, created_at
         FROM security_findings
         WHERE user_id = ?
         ORDER BY datetime(created_at) DESC
         LIMIT 100`,
      )
        .bind(String(storedUserId))
        .all()
        .catch(() => ({ results: [] }));
      return jsonResponse({ findings: results || [] });
    } catch {
      return jsonResponse({ findings: [] });
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/security\/sessions\/([^/]+)$/);
    if (m && method === 'DELETE') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const storedUserId = canonicalAuthId || sessionUserId;
      await env.DB.prepare(
        `UPDATE sessions SET revoked_at = unixepoch() * 1000, revoke_reason = 'user_revoked'
         WHERE id = ? AND user_id = ?`,
      )
        .bind(id, String(storedUserId))
        .run();
      return jsonResponse({ ok: true });
    }
  }

  if (pathLower === '/api/settings/usage' && method === 'GET') {
    if (!env.DB) return jsonResponse({ summary: [], ledger: [], total: 0, page: 1 });
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const provider = String(url.searchParams.get('provider') || '').trim();
    const model = String(url.searchParams.get('model') || '').trim();
    const offset = (page - 1) * 50;
    let where = `WHERE tenant_id = ?`;
    const params = [tenantId];
    if (provider) {
      where += ` AND provider = ?`;
      params.push(provider);
    }
    if (model) {
      where += ` AND model_used = ?`;
      params.push(model);
    }
    const [summary, ledger, total] = await Promise.all([
      env.DB.prepare(
        `SELECT provider, model_used,
                SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens,
                COUNT(*) AS call_count,
                ROUND(SUM(metric_value), 4) AS cost_usd
         FROM agent_telemetry
         WHERE tenant_id = ? AND metric_type = 'cost'
           AND created_at >= date('now','start of month')
         GROUP BY provider, model_used
         ORDER BY cost_usd DESC`,
      )
        .bind(tenantId)
        .all()
        .catch(() => ({ results: [] })),
      env.DB.prepare(
        `SELECT provider, model_used, input_tokens, output_tokens, metric_value AS cost_usd, created_at
         FROM agent_telemetry
         ${where} AND metric_type = 'cost'
         ORDER BY created_at DESC
         LIMIT 50 OFFSET ?`,
      )
        .bind(...params, offset)
        .all()
        .catch(() => ({ results: [] })),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM agent_telemetry ${where} AND metric_type = 'cost'`,
      )
        .bind(...params)
        .first()
        .catch(() => ({ n: 0 })),
    ]);
    return jsonResponse({
      summary: summary.results || [],
      ledger: ledger.results || [],
      total: Number(total?.n || 0),
      page,
    });
  }

  // ── GET /api/settings/default-model ──────────────────────────────────────
  if (pathLower === '/api/settings/default-model' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const row = await env.DB.prepare(
        `SELECT ui_preferences_json FROM agentsam_bootstrap WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`,
      )
        .bind(sessionUserId)
        .first();
      const prefs = parseJsonSafe(row?.ui_preferences_json, {});
      const default_model =
        typeof prefs.default_model === 'string' && prefs.default_model.trim()
          ? prefs.default_model.trim()
          : null;
      return jsonResponse({ default_model });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── POST /api/settings/default-model ─────────────────────────────────────
  if (pathLower === '/api/settings/default-model' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    const isSuper = Number(authUser.is_superadmin) === 1;
    if (!tenantId && !isSuper) return jsonResponse({ error: 'Tenant required' }, 403);
    const body = await request.json().catch(() => ({}));
    const modelKey = String(body.model_key || '').trim();
    if (!modelKey) return jsonResponse({ error: 'model_key required' }, 400);
    try {
      const row = await env.DB.prepare(
        `SELECT id, ui_preferences_json FROM agentsam_bootstrap WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`,
      )
        .bind(sessionUserId)
        .first();
      const prefs = parseJsonSafe(row?.ui_preferences_json, {});
      prefs.default_model = modelKey;
      const prefsJson = JSON.stringify(prefs);
      if (row?.id) {
        await env.DB.prepare(
          `UPDATE agentsam_bootstrap SET ui_preferences_json = ?, updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(prefsJson, row.id)
          .run();
      } else {
        const bid = `asb_${sessionUserId}`.slice(0, 80);
        let workspaceId = '';
        try {
          const urow = await env.DB.prepare(
            `SELECT default_workspace_id FROM users WHERE id = ? LIMIT 1`,
          )
            .bind(sessionUserId)
            .first();
          workspaceId =
            String(urow?.default_workspace_id || '').trim() ||
            `ws_${String(sessionUserId).replace(/^au_/, '').slice(0, 28)}`;
        } catch {
          workspaceId = `ws_${String(sessionUserId).replace(/^au_/, '').slice(0, 28)}`;
        }
        await env.DB.prepare(
          `INSERT INTO agentsam_bootstrap (
             id, workspace_id, tenant_id, user_id, email, display_name,
             environment, is_active, capabilities_json, governance_roles_json, approval_required_json,
             allowed_execution_modes_json, default_execution_mode, runtime_status_json, backend_health_json,
             feature_flags_json, ui_preferences_json, created_at, updated_at
           ) VALUES (?,?,?,?,?,?,
             'production', 1, '{}','[]','[]','[\"pty\"]','pty','{}','{}','{}',?,
             datetime('now'), datetime('now'))`,
        )
          .bind(
            bid,
            workspaceId,
            tenantId,
            sessionUserId,
            String(authUser.email || '').trim() || null,
            String(authUser.display_name || authUser.name || '').trim() || null,
            prefsJson,
          )
          .run();
      }
      return jsonResponse({ ok: true, default_model: modelKey });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  return jsonResponse({ error: 'Settings route not found' }, 404);
}

/** Router passes `(request, url, env, ctx)` — delegate to `handleSettingsRequest`. */
export async function handleSettingsApi(request, _url, env, ctx) {
  return handleSettingsRequest(request, env, ctx);
}
