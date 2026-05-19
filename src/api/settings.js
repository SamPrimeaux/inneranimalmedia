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
  authUserIsSuperadmin,
  invalidateFeatureFlagsCache,
  loadFeatureFlags,
} from '../core/auth.js';
import {
  appendAgentsamSkillRevision,
  skillPatchKeysNeedRevision,
} from '../core/skill-revision.js';
import {
  resolveEffectiveWorkspaceId,
  resolveActiveBootstrap,
  WORKSPACE_CONTEXT_MISSING,
} from '../core/bootstrap.js';
import { handleSettingsIntegrationsApi } from './settings-integrations.js';
import { handleSettingsSectionStatusApi } from './settings-sections.js';
import { handleSettingsApiKeysApi } from './settings-api-keys.js';
import { handleSettingsWorkspaceApi } from './settings-workspace.js';
import { encryptApiKeyForStorage } from './provisioning.js';
import { userCanAccessWorkspace, canUsePlatformAssetsR2Upload } from '../core/cms-theme-resolve.js';

/** Deep-merge `cms_pipeline` into `workspaces.settings_json` (no new tables). */
function mergeCmsPipelineIntoWorkspaceSettings(existingJson, patchPipeline) {
  let root = {};
  try {
    if (existingJson != null && existingJson !== '') {
      root = typeof existingJson === 'string' ? JSON.parse(existingJson) : existingJson;
    }
  } catch {
    root = {};
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) root = {};
  const prev =
    root.cms_pipeline && typeof root.cms_pipeline === 'object' && !Array.isArray(root.cms_pipeline)
      ? root.cms_pipeline
      : {};
  const merged = {
    ...prev,
    ...(patchPipeline && typeof patchPipeline === 'object' && !Array.isArray(patchPipeline)
      ? patchPipeline
      : {}),
  };
  return JSON.stringify({ ...root, cms_pipeline: merged });
}

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

/**
 * Workspace rows for legacy GET /api/settings/workspaces (name/display_name/column drift).
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
async function fetchWorkspaceRowsForSettingsApi(db) {
  const attempts = [
    `SELECT id, COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(name), ''), id) AS name, category, brand
     FROM workspaces WHERE id LIKE 'ws_%' ORDER BY 2`,
    `SELECT id, name, category, brand FROM workspaces WHERE id LIKE 'ws_%' ORDER BY name`,
    `SELECT id, name, category FROM workspaces WHERE id LIKE 'ws_%' ORDER BY name`,
    `SELECT id, display_name AS name, category, NULL AS brand FROM workspaces WHERE id LIKE 'ws_%' ORDER BY display_name`,
  ];
  for (const sql of attempts) {
    try {
      const res = await db.prepare(sql).all();
      return res.results || [];
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (msg.includes('no such column')) continue;
      throw e;
    }
  }
  return [];
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

function mcpLastCheckIso(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n < 1e12) return new Date(n * 1000).toISOString();
  return new Date(n).toISOString();
}

function mcpDashboardConfigFromRow(row) {
  const meta = parseJsonSafe(row?.metadata, {});
  const saved = meta.dashboard_mcp_config;
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
  const url = row?.endpoint_url != null ? String(row.endpoint_url).trim() : '';
  return {
    url,
    headers: meta.suggested_headers && typeof meta.suggested_headers === 'object' ? meta.suggested_headers : {},
  };
}

async function resolveWorkspaceDisplayName(env, workspaceId) {
  const wsId = workspaceId != null && workspaceId !== '' ? String(workspaceId).trim() : '';
  if (!wsId) return { id: '', name: '' };
  const core = CORE_WORKSPACES_DATA.find((w) => String(w.id) === wsId);
  if (core) return { id: wsId, name: String(core.name || wsId) };
  if (!env?.DB) return { id: wsId, name: wsId };
  try {
    const row = await env.DB.prepare('SELECT id, name FROM workspaces WHERE id = ? LIMIT 1').bind(wsId).first();
    return { id: wsId, name: row?.name != null && String(row.name).trim() ? String(row.name).trim() : wsId };
  } catch {
    return { id: wsId, name: wsId };
  }
}

async function mcpFetchJsonRpcPing(env, endpointUrl, headersObj) {
  const t0 = Date.now();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(headersObj && typeof headersObj === 'object' ? headersObj : {}),
  };
  const token = env.MCP_AUTH_TOKEN ? String(env.MCP_AUTH_TOKEN) : '';
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(String(endpointUrl).trim(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: {} }),
    signal: AbortSignal.timeout(5000),
  });
  const latency_ms = Date.now() - t0;
  return { res, latency_ms };
}

// No runtime hardcoded workspace IDs. If the DB is unavailable, settings endpoints should return empty lists.
const CORE_WORKSPACES_DATA = [];
const CORE_WORKSPACE_IDS = [];

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

  const settingsApiKeysRes = await handleSettingsApiKeysApi(
    request,
    env,
    ctx,
    authUser,
    url,
    pathLower,
    method,
  );
  if (settingsApiKeysRes) return settingsApiKeysRes;

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

  const sectionStatusRes = await handleSettingsSectionStatusApi(
    request,
    env,
    authUser,
    url,
    pathLower,
    method,
  );
  if (sectionStatusRes) return sectionStatusRes;

  const workspaceSettingsRes = await handleSettingsWorkspaceApi(request, env, ctx, {
    authUser,
    url,
    pathLower,
    method,
    sessionUserId,
  });
  if (workspaceSettingsRes) return workspaceSettingsRes;

  // ── /api/settings/profile ─────────────────────────────────────────────────
  if (pathLower === '/api/settings/profile' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    return jsonResponse({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      display_name: authUser.display_name ?? authUser.name,
      avatar_url: authUser.avatar_url ?? null,
      tenant_id: authUser.tenant_id,
      active_workspace_id: authUser.active_workspace_id,
      is_superadmin: authUser.is_superadmin,
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

  /** Flat PATCH fields for `/api/settings/user-policy` (dashboard General + agent prefs). */
  const USER_POLICY_FLAT_PATCH_KEYS = [
    'sync_layouts',
    'show_status_bar',
    'autohide_editor',
    'autoinject_code',
    'web_search_enabled',
    'web_fetch_enabled',
    'text_size',
    'default_agent_location',
    'auto_clear_chat',
    'submit_with_mod_enter',
  ];

  // ── /api/settings/user-policy ────────────────────────────────────────────
  if (pathLower === '/api/settings/user-policy' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const uid = String(authUser.id || '').trim();
    let wsId =
      url.searchParams.get('workspace_id') != null && String(url.searchParams.get('workspace_id')).trim() !== ''
        ? String(url.searchParams.get('workspace_id')).trim()
        : '';
    if (!wsId && authUser.active_workspace_id != null && String(authUser.active_workspace_id).trim() !== '') {
      wsId = String(authUser.active_workspace_id).trim();
    }
    if (!wsId) wsId = await resolveRequestWorkspaceId(env, authUser, url);
    if (!wsId) wsId = '';
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : '';
    if (!tenantId) tenantId = (await fetchAuthUserTenantId(env, uid)) || '';
    if (!tenantId) tenantId = await fallbackSystemTenantId(env);
    try {
      let row = await env.DB.prepare(
        `SELECT * FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1`,
      )
        .bind(uid, wsId)
        .first();
      if (!row) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO agentsam_user_policy (user_id, workspace_id, tenant_id)
           VALUES (?, ?, ?)`,
        )
          .bind(uid, wsId, tenantId)
          .run();
        row = await env.DB.prepare(
          `SELECT * FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1`,
        )
          .bind(uid, wsId)
          .first();
      }
      return jsonResponse({ policy: row ?? {} });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/settings/user-policy' && method === 'PATCH') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const uid = String(authUser.id || '').trim();
    let wsId =
      body.workspace_id != null && String(body.workspace_id).trim() !== ''
        ? String(body.workspace_id).trim()
        : '';
    if (!wsId && authUser.active_workspace_id != null && String(authUser.active_workspace_id).trim() !== '') {
      wsId = String(authUser.active_workspace_id).trim();
    }
    if (!wsId) wsId = await resolveRequestWorkspaceId(env, authUser, url);
    if (!wsId) wsId = '';
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : '';
    if (!tenantId) tenantId = (await fetchAuthUserTenantId(env, uid)) || '';
    if (!tenantId) tenantId = await fallbackSystemTenantId(env);
    const cols = USER_POLICY_FLAT_PATCH_KEYS.filter((k) =>
      Object.prototype.hasOwnProperty.call(body, k),
    );
    if (!cols.length) return jsonResponse({ error: 'No valid fields' }, 400);
    const insertCols = ['user_id', 'workspace_id', 'tenant_id', ...cols].join(', ');
    const placeholders = ['?', '?', '?', ...cols.map(() => '?')].join(', ');
    const updateSet = cols.map((k) => `${k} = excluded.${k}`).join(', ');
    const values = [uid, wsId, tenantId, ...cols.map((k) => body[k])];
    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_user_policy (${insertCols})
         VALUES (${placeholders})
         ON CONFLICT(user_id, workspace_id) DO UPDATE SET
           ${updateSet},
           updated_at = datetime('now')`,
      )
        .bind(...values)
        .run();
      return jsonResponse({ ok: true });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/settings/feature-flags' && method === 'GET') {
    if (!env.DB) return jsonResponse({ flags: [], overrides: [] });
    const uid = String(authUser.id || '').trim();
    try {
      const [flagsRes, overridesRes] = await Promise.all([
        env.DB.prepare(
          `SELECT flag_key, description, enabled_globally, environment, rollout_pct, is_archived, updated_at
           FROM agentsam_feature_flag
           WHERE COALESCE(is_archived, 0) = 0
           ORDER BY flag_key ASC`,
        ).all(),
        env.DB.prepare(
          `SELECT flag_key, enabled, updated_at
           FROM agentsam_user_feature_override
           WHERE user_id = ?
           ORDER BY flag_key ASC`,
        )
          .bind(uid)
          .all(),
      ]);
      return jsonResponse({
        flags: flagsRes.results || [],
        overrides: overridesRes.results || [],
      });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  {
    const ffMatch = pathLower.match(/^\/api\/settings\/feature-flags\/([^/]+)$/);
    if (ffMatch && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const flagKey = decodeURIComponent(ffMatch[1] || '').trim();
      if (!flagKey) return jsonResponse({ error: 'flag_key required' }, 400);
      const uid = String(authUser.id || '').trim();
      const body = await request.json().catch(() => ({}));
      if (!Object.prototype.hasOwnProperty.call(body, 'enabled')) {
        return jsonResponse({ error: 'enabled required (boolean)' }, 400);
      }
      const enabled =
        body.enabled === true || body.enabled === 1 || body.enabled === '1' ? 1 : 0;
      try {
        const flagRow = await env.DB.prepare(
          `SELECT flag_key FROM agentsam_feature_flag WHERE flag_key = ? LIMIT 1`,
        )
          .bind(flagKey)
          .first();
        if (!flagRow) return jsonResponse({ error: 'unknown flag_key' }, 404);
        const personUuid =
          authUser.person_uuid != null && String(authUser.person_uuid).trim() !== ''
            ? String(authUser.person_uuid).trim()
            : null;
        await env.DB.prepare(
          `INSERT INTO agentsam_user_feature_override (user_id, flag_key, enabled, person_uuid, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(user_id, flag_key) DO UPDATE SET
             enabled = excluded.enabled,
             person_uuid = COALESCE(excluded.person_uuid, agentsam_user_feature_override.person_uuid),
             updated_at = datetime('now')`,
        )
          .bind(uid, flagKey, enabled, personUuid)
          .run();
        await invalidateFeatureFlagsCache(env, uid);
        const tenantId =
          authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
            ? String(authUser.tenant_id).trim()
            : (await fetchAuthUserTenantId(env, uid)) || null;
        const feature_flags = await loadFeatureFlags(env, uid, tenantId);
        return jsonResponse({
          ok: true,
          flag_key: flagKey,
          enabled: enabled === 1,
          feature_flags,
        });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }
  }

  const STORAGE_PROVIDER_PREFS_ALLOWED = ['r2', 'github', 'google_drive', 'supabase', 's3'];

  function maskStorageProviderPrefsRow(row) {
    if (!row || typeof row !== 'object') return row;
    const prefs = parseJsonSafe(row.preferences_json, {});
    const out = { ...row, preferences_json: { ...prefs } };
    const p = out.preferences_json;
    if (p.secret_access_key != null && String(p.secret_access_key).trim() !== '') {
      p.secret_access_key = '********';
    }
    if (p.access_key_id != null && String(p.access_key_id).length > 6) {
      const ak = String(p.access_key_id);
      p.access_key_id = `${ak.slice(0, 4)}…${ak.slice(-4)}`;
    }
    return out;
  }

  // ── /api/settings/storage-preferences (per-provider rows) ───────────────
  if (pathLower === '/api/settings/storage-preferences' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const uid = String(authUser.id || '').trim();
    try {
      const { results } = await env.DB.prepare(
        `SELECT user_id, tenant_id, workspace_id, provider, preferences_json, updated_at
         FROM user_storage_provider_preferences
         WHERE user_id = ?
         ORDER BY provider ASC`,
      )
        .bind(uid)
        .all();
      let oauth_providers = [];
      try {
        const tr = await env.DB.prepare(
          `SELECT DISTINCT lower(provider) AS p FROM user_oauth_tokens WHERE user_id = ?`,
        )
          .bind(uid)
          .all();
        oauth_providers = (tr.results || []).map((r) => String(r.p || '').toLowerCase()).filter(Boolean);
      } catch (_) {
        oauth_providers = [];
      }
      return jsonResponse({
        preferences: (results || []).map(maskStorageProviderPrefsRow),
        oauth_providers,
      });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('no such table')) {
        return jsonResponse(
          {
            error: 'user_storage_provider_preferences missing',
            hint: 'Apply migrations/289_storage_provider_prefs_general_ui.sql',
            preferences: [],
            oauth_providers: [],
          },
          503,
        );
      }
      return jsonResponse({ error: msg }, 500);
    }
  }

  if (pathLower === '/api/settings/storage-preferences' && method === 'PATCH') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const provider = String(body.provider || '').trim().toLowerCase();
    if (!STORAGE_PROVIDER_PREFS_ALLOWED.includes(provider)) {
      return jsonResponse({ error: 'Invalid or missing provider' }, 400);
    }
    const uid = String(authUser.id || '').trim();
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : '';
    if (!tenantId) tenantId = (await fetchAuthUserTenantId(env, uid)) || '';
    if (!tenantId) tenantId = await fallbackSystemTenantId(env);
    const workspaceId =
      body.workspace_id != null && String(body.workspace_id).trim() !== ''
        ? String(body.workspace_id).trim()
        : null;
    const allowedKeysByProvider = {
      r2: ['bucket_name', 'public_base_url', 'r2_prefix'],
      github: ['repo', 'branch', 'base_path'],
      google_drive: ['folder_id', 'folder_name'],
      supabase: ['project_url', 'bucket_name', 'schema'],
      s3: ['endpoint_url', 'access_key_id', 'secret_access_key', 'bucket', 'region'],
    };
    const keys = allowedKeysByProvider[provider] || [];
    let prev = {};
    try {
      const existing = await env.DB.prepare(
        `SELECT preferences_json FROM user_storage_provider_preferences WHERE user_id = ? AND provider = ? LIMIT 1`,
      )
        .bind(uid, provider)
        .first();
      prev = parseJsonSafe(existing?.preferences_json, {});
    } catch (_) {
      prev = {};
    }
    const next = { ...prev };
    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
      const v = body[k];
      if (k === 'secret_access_key' && (v === '' || v === null || v === '********')) continue;
      next[k] = v;
    }
    const preferences_json = JSON.stringify(next);
    try {
      await env.DB.prepare(
        `INSERT INTO user_storage_provider_preferences (user_id, tenant_id, workspace_id, provider, preferences_json, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, provider) DO UPDATE SET
           preferences_json = excluded.preferences_json,
           tenant_id = excluded.tenant_id,
           workspace_id = excluded.workspace_id,
           updated_at = excluded.updated_at`,
      )
        .bind(uid, tenantId, workspaceId, provider, preferences_json)
        .run();
      const row = await env.DB.prepare(
        `SELECT user_id, tenant_id, workspace_id, provider, preferences_json, updated_at
         FROM user_storage_provider_preferences WHERE user_id = ? AND provider = ? LIMIT 1`,
      )
        .bind(uid, provider)
        .first();
      return jsonResponse({ ok: true, preference: maskStorageProviderPrefsRow(row) });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('no such table')) {
        return jsonResponse(
          { error: 'user_storage_provider_preferences missing', hint: 'Apply migrations/289_storage_provider_prefs_general_ui.sql' },
          503,
        );
      }
      return jsonResponse({ error: msg }, 500);
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
        return jsonResponse({
          data: CORE_WORKSPACES_DATA,
          current: env.DEFAULT_WORKSPACE_ID || null,
          workspaceThemes: {},
          workspaces: {},
        });
      }
      try {
        const { userId: canonicalUserId } = await resolveCanonicalUserId(env, sessionUserId, authUser.email);

        const loadUws = async (uid) => {
          try {
            const res = await env.DB.prepare(
              'SELECT workspace_id, brand, plans, budget, time, theme FROM user_workspace_settings WHERE user_id = ?',
            )
              .bind(uid)
              .all();
            return res.results || [];
          } catch (e) {
            const errMsg = String(e?.message || '');
            if (errMsg.includes('no such column: theme')) {
              const res = await env.DB.prepare(
                'SELECT workspace_id, brand, plans, budget, time FROM user_workspace_settings WHERE user_id = ?',
              )
                .bind(uid)
                .all();
              return res.results || [];
            }
            if (errMsg.includes('no such table') && errMsg.includes('user_workspace_settings')) {
              return [];
            }
            throw e;
          }
        };

        const [wsRows, rowsPrimary, usPrimary] = await Promise.all([
          fetchWorkspaceRowsForSettingsApi(env.DB),
          loadUws(sessionUserId),
          env.DB.prepare('SELECT default_workspace_id FROM user_settings WHERE user_id = ? LIMIT 1')
            .bind(sessionUserId)
            .first()
            .catch(() => null),
        ]);

        let rows = rowsPrimary;
        if (
          rows.length === 0 &&
          canonicalUserId &&
          String(canonicalUserId).trim() !== String(sessionUserId).trim()
        ) {
          rows = await loadUws(String(canonicalUserId).trim());
        }

        let us = usPrimary;
        if (
          (!us?.default_workspace_id || String(us.default_workspace_id).trim() === '') &&
          canonicalUserId &&
          String(canonicalUserId).trim() !== String(sessionUserId).trim()
        ) {
          const u2 = await env.DB.prepare('SELECT default_workspace_id FROM user_settings WHERE user_id = ? LIMIT 1')
            .bind(String(canonicalUserId).trim())
            .first()
            .catch(() => null);
          if (u2?.default_workspace_id) us = u2;
        }

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
        
        const current = us?.default_workspace_id || env.DEFAULT_WORKSPACE_ID || null;
        return jsonResponse({ data: wsRows.length > 0 ? wsRows : CORE_WORKSPACES_DATA, current, workspaceThemes, workspaces });
      } catch (e) {
        const msg = e?.message != null ? String(e.message) : String(e);
        const stack = typeof e?.stack === 'string' ? e.stack : '';
        console.error('[GET /api/settings/workspaces]', msg, stack || '');
        return jsonResponse(
          {
            data: CORE_WORKSPACES_DATA,
            current: env.DEFAULT_WORKSPACE_ID || null,
            error: msg,
            error_name: e?.name != null ? String(e.name) : 'Error',
            detail: stack ? stack.split('\n').slice(0, 12).join('\n') : msg,
          },
          500,
        );
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
        const msg = String(e?.message || '');
        if (msg.includes('no such table') && msg.includes('user_workspace_settings')) {
          return jsonResponse(
            {
              error: 'user_workspace_settings table missing',
              hint: 'Apply migrations/141_user_workspace_settings.sql (optional theme column: migrations/148_workspace_default_and_theme.sql)',
            },
            503,
          );
        }
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
      const msg = String(e?.message || '');
      if (msg.includes('no such table') && msg.includes('user_workspace_settings')) {
        return jsonResponse(
          {
            error: 'user_workspace_settings table missing',
            hint: 'Apply migrations/141_user_workspace_settings.sql and migrations/148_workspace_default_and_theme.sql',
          },
          503,
        );
      }
      return jsonResponse({ error: e?.message ?? 'Save failed' }, 500);
    }
  }

  // ── GET /api/ai/models — D1 agentsam_ai (Settings + admin) ─────────────────
  if (pathLower === '/api/ai/models' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const { results } = await env.DB.prepare(
        'SELECT * FROM agentsam_ai ORDER BY provider ASC, display_name ASC',
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
        `UPDATE agentsam_ai SET show_in_picker = ?, updated_at = unixepoch()
         WHERE model_key = ?`,
      )
        .bind(enabled ? 1 : 0, modelKey)
        .run();
      if (!r.meta?.changes) return jsonResponse({ error: 'Model not found' }, 404);
      const row = await env.DB.prepare(
        'SELECT * FROM agentsam_ai WHERE model_key = ? LIMIT 1',
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
      .bind(workspaceId || null, ...agentsamUserCandidates)
      .first()
      .catch(() => null);
    const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

    const [policyRow, cmdRows, domainRows, mcpRows, subagentList] = await Promise.all([
      env.DB.prepare(
        `SELECT * FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1`,
      )
        .bind(agentsamUserId, workspaceId || null)
        .first()
        .catch(() => null),
      env.DB.prepare(
        `SELECT command FROM agentsam_command_allowlist
         WHERE user_id = ? AND workspace_id = ?
         ORDER BY command ASC`,
      )
        .bind(agentsamUserId, workspaceId || null)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT host FROM agentsam_fetch_domain_allowlist
         WHERE user_id = ? AND workspace_id = ?
         ORDER BY host ASC`,
      )
        .bind(agentsamUserId, workspaceId || null)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT tool_key, NULL AS notes FROM agentsam_mcp_allowlist
         WHERE user_id = ? AND workspace_id = ?
         ORDER BY tool_key ASC`,
      )
        .bind(agentsamUserId, workspaceId || null)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT * FROM agentsam_subagent_profile
         WHERE user_id = ? AND workspace_id = ?
         ORDER BY COALESCE(sort_order, 9999), display_name ASC`,
      )
        .bind(agentsamUserId, workspaceId || null)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
    ]);

    return jsonResponse({
      workspace_id: workspaceId || null,
      agentsam_user_id: agentsamUserId,
      canonical: {
        auth_id: canonicalAuthId || null,
        user_id: canonicalUserId || null,
        session_user_id: sessionUserId || null,
      },
      policy: policyRow || null,
      subagents: Array.isArray(subagentList) ? subagentList : [],
      allowlists: {
        commands: cmdRows.map((r) => String(r.command || '').trim()).filter(Boolean),
        domains: domainRows.map((r) => String(r.host || '').trim()).filter(Boolean),
        mcp: mcpRows
          .map((r) => ({ tool_key: String(r.tool_key || '').trim(), notes: r.notes ?? null }))
          .filter((x) => x.tool_key),
      },
    });
  }

  {
    const agentRowM = pathLower.match(/^\/api\/settings\/agents\/([^/]+)$/);
    const agentSeg = agentRowM ? decodeURIComponent(agentRowM[1] || '').trim() : '';
    const reserved = new Set(['policy', 'commands', 'domains', 'mcp']);
    if (agentSeg && !reserved.has(agentSeg) && method === 'PATCH') {
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
        .bind(workspaceId || null, ...agentsamUserCandidates)
        .first()
        .catch(() => null);
      const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);
      const sets = [];
      const vals = [];
      if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
        sets.push('is_active = ?');
        const v = body.is_active;
        vals.push(v === true || v === 1 || v === '1' ? 1 : 0);
      }
      if (Object.prototype.hasOwnProperty.call(body, 'default_model_id') && body.default_model_id != null) {
        sets.push('default_model_id = ?');
        vals.push(String(body.default_model_id));
      }
      if (!sets.length) return jsonResponse({ error: 'Only is_active and default_model_id may be updated' }, 400);
      sets.push("updated_at = datetime('now')");
      vals.push(agentSeg, agentsamUserId, workspaceId || null);
      const n = await env.DB.prepare(
        `UPDATE agentsam_subagent_profile SET ${sets.join(', ')}
         WHERE id = ? AND user_id = ? AND workspace_id = ?`,
      )
        .bind(...vals)
        .run();
      if (!n.meta?.changes) return jsonResponse({ error: 'Subagent not found' }, 404);
      const row = await env.DB.prepare(
        `SELECT * FROM agentsam_subagent_profile WHERE id = ? AND user_id = ? LIMIT 1`,
      )
        .bind(agentSeg, agentsamUserId)
        .first()
        .catch(() => null);
      return jsonResponse({ ok: true, subagent: row });
    }
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
      .bind(workspaceId || null, ...agentsamUserCandidates)
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
    const values = [agentsamUserId, workspaceId || null, ...cols.map((k) => incoming[k])];

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
      .bind(agentsamUserId, workspaceId || null)
      .first()
      .catch(() => null);

    return jsonResponse({
      ok: true,
      policy: row,
      workspace_id: workspaceId || null,
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
      .bind(workspaceId || null, ...agentsamUserCandidates)
      .first()
      .catch(() => null);
    const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

    await env.DB.prepare(
      `INSERT INTO agentsam_command_allowlist (id, user_id, workspace_id, command, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, workspace_id, command) DO NOTHING`,
    )
      .bind(crypto.randomUUID(), agentsamUserId, workspaceId || null, command)
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
        .bind(workspaceId || null, ...agentsamUserCandidates)
        .first()
        .catch(() => null);
      const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

      await env.DB.prepare(
        `DELETE FROM agentsam_command_allowlist
         WHERE user_id = ? AND workspace_id = ? AND command = ?`,
      )
        .bind(agentsamUserId, workspaceId || null, command)
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
      .bind(workspaceId || null, ...agentsamUserCandidates)
      .first()
      .catch(() => null);
    const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

    await env.DB.prepare(
      `INSERT INTO agentsam_fetch_domain_allowlist (id, user_id, workspace_id, host, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, workspace_id, host) DO NOTHING`,
    )
      .bind(crypto.randomUUID(), agentsamUserId, workspaceId || null, host)
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
        .bind(workspaceId || null, ...agentsamUserCandidates)
        .first()
        .catch(() => null);
      const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

      await env.DB.prepare(
        `DELETE FROM agentsam_fetch_domain_allowlist
         WHERE user_id = ? AND workspace_id = ? AND host = ?`,
      )
        .bind(agentsamUserId, workspaceId || null, host)
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
      .bind(workspaceId || null, ...agentsamUserCandidates)
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
        .bind(crypto.randomUUID(), agentsamUserId, workspaceId || null, tool_key, notes)
        .run();
    } catch (e) {
      if (String(e?.message || '').includes('no such column: notes')) {
        await env.DB.prepare(
          `INSERT INTO agentsam_mcp_allowlist (id, user_id, workspace_id, tool_key, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(user_id, workspace_id, tool_key) DO NOTHING`,
        )
          .bind(crypto.randomUUID(), agentsamUserId, workspaceId || null, tool_key)
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
        .bind(workspaceId || null, ...agentsamUserCandidates)
        .first()
        .catch(() => null);
      const agentsamUserId = stored?.user_id ? String(stored.user_id) : String(canonicalAuthId || sessionUserId);

      await env.DB.prepare(
        `DELETE FROM agentsam_mcp_allowlist
         WHERE user_id = ? AND workspace_id = ? AND tool_key = ?`,
      )
        .bind(agentsamUserId, workspaceId || null, tool_key)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  // ── AI Models catalog + BYOK (/api/settings/ai-models*) ───────────────────
  const normalizeAiProviderSlug = (p) => {
    const s = String(p || '').trim().toLowerCase();
    if (s === 'google' || s === 'gemini' || s === 'google_ai') return 'google_ai';
    if (s === 'anthropic') return 'anthropic';
    if (s === 'openai' || s === 'cursor') return 'openai';
    if (s === 'cloudflare' || s === 'workers_ai' || s === 'cloudflare_workers_ai') return 'cloudflare';
    if (s === 'ollama') return 'ollama';
    return s;
  };

  const providerUiOrder = (slug) => {
    const k = normalizeAiProviderSlug(slug);
    const order = { openai: 0, anthropic: 1, google_ai: 2, google: 2, cloudflare: 3, ollama: 4 };
    return order[k] != null ? order[k] : 100 + k.charCodeAt(0);
  };

  async function validateAiKeyProbe(providerNorm, rawKey) {
    const k = String(rawKey || '');
    if (!k.trim()) return { ok: false, error: 'Key required' };
    if (providerNorm === 'openai' || providerNorm === 'cursor') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${k}` },
      });
      return r.ok ? { ok: true } : { ok: false, error: `OpenAI validation failed (${r.status})` };
    }
    if (providerNorm === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': k,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      return r.ok ? { ok: true } : { ok: false, error: `Anthropic validation failed (${r.status})` };
    }
    if (providerNorm === 'google_ai' || providerNorm === 'google') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`;
      const r = await fetch(url);
      return r.ok ? { ok: true } : { ok: false, error: `Google AI validation failed (${r.status})` };
    }
    return { ok: true };
  }

  if (pathLower === '/api/settings/ai-models/usage' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'tenant required' }, 400);
    try {
      const { results } = await env.DB.prepare(
        `SELECT provider, model,
            SUM(cost_usd) AS cost_30d,
            SUM(tokens_in + tokens_out) AS tokens_30d,
            COUNT(*) AS calls_30d
         FROM agentsam_usage_events
         WHERE tenant_id = ? AND created_at > unixepoch() - 2592000
         GROUP BY provider, model
         ORDER BY cost_30d DESC`,
      )
        .bind(tenantId)
        .all();
      const usage = (results || []).map((row) => ({
        provider: row.provider != null ? String(row.provider) : '',
        model: row.model != null ? String(row.model) : '',
        cost_30d: Number(row.cost_30d) || 0,
        tokens_30d: Number(row.tokens_30d) || 0,
        calls_30d: Number(row.calls_30d) || 0,
      }));
      return jsonResponse({ usage });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/settings/ai-models' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'tenant required' }, 400);
    const { userId: canonicalUserId } = await resolveCanonicalUserId(env, sessionUserId, authUser.email);
    const storeUserId = canonicalUserId != null && String(canonicalUserId).trim() !== ''
      ? String(canonicalUserId).trim()
      : String(authUser.id || '').trim();
    try {
      const { results: modelRows } = await env.DB.prepare(
        `SELECT *
         FROM agentsam_ai
         WHERE model_key IS NOT NULL
         ORDER BY provider, sort_order, model_key`,
      ).all();

      const { results: usageRows } = await env.DB.prepare(
        `SELECT provider,
            SUM(cost_usd) AS cost_30d,
            SUM(tokens_in + tokens_out) AS tokens_30d,
            COUNT(*) AS calls_30d
         FROM agentsam_usage_events
         WHERE tenant_id = ? AND created_at > unixepoch() - 2592000
         GROUP BY provider`,
      )
        .bind(tenantId)
        .all();

      let keyRows = [];
      try {
        const q = await env.DB.prepare(
          `SELECT provider, key_name, key_preview, is_active, last_used_at
           FROM user_api_keys
           WHERE user_id = ? AND COALESCE(is_active, 1) = 1`,
        )
          .bind(storeUserId)
          .all();
        keyRows = q?.results || [];
      } catch (_) {
        keyRows = [];
      }

      const usageByProv = new Map();
      for (const r of usageRows || []) {
        usageByProv.set(
          normalizeAiProviderSlug(r.provider),
          {
            cost_30d: Number(r.cost_30d) || 0,
            tokens_30d: Number(r.tokens_30d) || 0,
            calls_30d: Number(r.calls_30d) || 0,
          },
        );
      }

      const keysByProv = new Map();
      for (const r of keyRows) {
        const slug = normalizeAiProviderSlug(r.provider);
        if (!keysByProv.has(slug)) keysByProv.set(slug, r);
      }

      const bySlug = new Map();
      for (const m of modelRows || []) {
        const slug = normalizeAiProviderSlug(m.provider);
        if (!bySlug.has(slug)) {
          bySlug.set(slug, {
            provider: slug,
            api_platform: m.api_platform != null ? String(m.api_platform) : '',
            has_personal_key: !!keysByProv.get(slug),
            key_preview: keysByProv.get(slug)?.key_preview != null ? String(keysByProv.get(slug).key_preview) : null,
            cost_30d: usageByProv.get(slug)?.cost_30d ?? 0,
            tokens_30d: usageByProv.get(slug)?.tokens_30d ?? 0,
            calls_30d: usageByProv.get(slug)?.calls_30d ?? 0,
            models: [],
          });
        }
        const bucket = bySlug.get(slug);
        if (!bucket.api_platform && m.api_platform) bucket.api_platform = String(m.api_platform);
        const disp = m.display_name != null && String(m.display_name).trim() !== ''
          ? String(m.display_name)
          : (m.name != null ? String(m.name) : '');
        bucket.models.push({
          model_key: m.model_key != null ? String(m.model_key) : '',
          display_name: disp,
          status: m.status != null ? String(m.status) : '',
          show_in_picker: Number(m.show_in_picker) === 1,
          picker_eligible: Number(m.picker_eligible) !== 0,
          supports_tools: Number(m.supports_tools) === 1,
          supports_vision: Number(m.supports_vision) === 1,
          supports_cache: Number(m.supports_cache) === 1,
          supports_thinking: Number(m.supports_thinking) === 1,
          supports_structured_output: Number(m.supports_structured_output) === 1,
          supports_responses_api: Number(m.supports_responses_api) === 1,
          context_max_tokens:
            m.context_max_tokens != null && m.context_max_tokens !== ''
              ? Number(m.context_max_tokens)
              : null,
          input_rate_per_mtok:
            m.input_rate_per_mtok != null && m.input_rate_per_mtok !== ''
              ? Number(m.input_rate_per_mtok)
              : null,
          output_rate_per_mtok:
            m.output_rate_per_mtok != null && m.output_rate_per_mtok !== ''
              ? Number(m.output_rate_per_mtok)
              : null,
          size_class: m.size_class != null ? String(m.size_class) : '',
          sort_order: m.sort_order != null ? Number(m.sort_order) : 0,
        });
      }

      const providers = Array.from(bySlug.values()).sort(
        (a, b) => providerUiOrder(a.provider) - providerUiOrder(b.provider) || a.provider.localeCompare(b.provider),
      );

      for (const p of providers) {
        const kr = keysByProv.get(p.provider);
        p.has_personal_key = !!kr;
        p.key_preview = kr?.key_preview != null ? String(kr.key_preview) : null;
      }

      return jsonResponse({ providers });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/settings/ai-models/keys' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (!env.VAULT_MASTER_KEY && !env.VAULT_KEY) {
      return jsonResponse({ error: 'Vault not configured' }, 503);
    }
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'tenant required' }, 400);
    const { userId: canonicalUserId } = await resolveCanonicalUserId(env, sessionUserId, authUser.email);
    const storeUserId = canonicalUserId != null && String(canonicalUserId).trim() !== ''
      ? String(canonicalUserId).trim()
      : String(authUser.id || '').trim();
    const body = await request.json().catch(() => ({}));
    const providerRaw = String(body.provider || '').trim();
    const keyName = String(body.keyName || body.key_name || 'default').trim() || 'default';
    const rawKey = String(body.rawKey || body.raw_key || '').trim();
    const provNorm = normalizeAiProviderSlug(providerRaw);
    if (!provNorm) return jsonResponse({ error: 'provider required' }, 400);

    const probe = await validateAiKeyProbe(provNorm, rawKey);
    if (!probe.ok) return jsonResponse({ error: probe.error || 'Validation failed' }, 400);

    let encrypted;
    try {
      encrypted = await encryptApiKeyForStorage(env, rawKey);
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'Encrypt failed' }, 500);
    }

    const preview =
      rawKey.length <= 12 ? '************' : `${rawKey.slice(0, 12)}****`;

    const uakId = `uak_${crypto.randomUUID().replace(/-/g, '')}`;
    try {
      await env.DB.prepare(
        `UPDATE user_api_keys SET is_active = 0, updated_at = datetime('now')
         WHERE user_id = ? AND tenant_id = ? AND LOWER(provider) = LOWER(?)`,
      )
        .bind(storeUserId, tenantId, provNorm)
        .run();
    } catch (_) {
      try {
        await env.DB.prepare(
          `UPDATE user_api_keys SET is_active = 0
           WHERE user_id = ? AND tenant_id = ? AND LOWER(provider) = LOWER(?)`,
        )
          .bind(storeUserId, tenantId, provNorm)
          .run();
      } catch (__) {
        /* schema without updated_at */
      }
    }

    try {
      await env.DB.prepare(
        `INSERT INTO user_api_keys (id, tenant_id, user_id, provider, key_name, key_preview, key_hash, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
        .bind(uakId, tenantId, storeUserId, provNorm, keyName, preview, encrypted)
        .run();
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'Failed to store key' }, 500);
    }

    return jsonResponse({ ok: true, key_preview: preview, provider: provNorm });
  }

  {
    const m = pathLower.match(/^\/api\/settings\/ai-models\/keys\/([^/]+)$/);
    if (m && method === 'DELETE') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const tenantId = await resolveAuthTenantId(env, authUser);
      if (!tenantId) return jsonResponse({ error: 'tenant required' }, 400);
      const { userId: canonicalUserId } = await resolveCanonicalUserId(env, sessionUserId, authUser.email);
      const storeUserId = canonicalUserId != null && String(canonicalUserId).trim() !== ''
        ? String(canonicalUserId).trim()
        : String(authUser.id || '').trim();
      const providerSeg = decodeURIComponent(m[1] || '').trim();
      const provNorm = normalizeAiProviderSlug(providerSeg);
      try {
        await env.DB.prepare(
          `UPDATE user_api_keys SET is_active = 0 WHERE user_id = ? AND tenant_id = ? AND LOWER(provider) = LOWER(?)`,
        )
          .bind(storeUserId, tenantId, provNorm)
          .run();
      } catch (e) {
        return jsonResponse({ error: e?.message ?? 'Failed to remove key' }, 500);
      }
      return jsonResponse({ ok: true });
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/ai-models\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const seg = decodeURIComponent(m[1] || '').trim();
      if (seg === 'keys' || seg === 'usage') {
        /* handled above */
      } else if (seg) {
        if (!authUserIsSuperadmin(authUser)) {
          return jsonResponse({ error: 'Forbidden' }, 403);
        }
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        const modelKey = seg;
        const body = await request.json().catch(() => ({}));
        const hasPicker = body && Object.prototype.hasOwnProperty.call(body, 'show_in_picker');
        const hasStatus = body && Object.prototype.hasOwnProperty.call(body, 'status');
        if (!hasPicker && !hasStatus) return jsonResponse({ error: 'No fields to update' }, 400);
        const sets = [];
        const vals = [];
        if (hasPicker) {
          const v = !!body.show_in_picker;
          sets.push('show_in_picker = ?');
          vals.push(v ? 1 : 0);
        }
        if (hasStatus) {
          const st = String(body.status || '').toLowerCase();
          if (st !== 'active' && st !== 'inactive') {
            return jsonResponse({ error: 'status must be active or inactive' }, 400);
          }
          sets.push('status = ?');
          vals.push(st);
        }
        sets.push("updated_at = datetime('now')");
        try {
          await env.DB.prepare(`UPDATE agentsam_ai SET ${sets.join(', ')} WHERE model_key = ?`)
            .bind(...vals, modelKey)
            .run();
        } catch (e) {
          return jsonResponse({ error: e?.message ?? 'Update failed' }, 500);
        }
        return jsonResponse({ ok: true, model_key: modelKey });
      }
    }
  }

  // ── MODELS ────────────────────────────────────────────────────────────────
  if (pathLower === '/api/settings/models' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
    try {
      const [models, tiers, routing] = await Promise.all([
        env.DB.prepare(
          `SELECT id, display_name AS name, provider,
                  CASE WHEN COALESCE(status, '') = 'active' THEN 1 ELSE 0 END AS is_active,
                  show_in_picker,
                  context_max_tokens AS context_window,
                  input_rate_per_mtok AS cost_per_input_mtok,
                  output_rate_per_mtok AS cost_per_output_mtok
           FROM agentsam_ai
           ORDER BY provider, display_name`,
        )
          .all()
          .catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT * FROM agentsam_model_tier WHERE workspace_id = ? ORDER BY tier_level`,
        )
          .bind(workspaceId || null)
          .all()
          .catch(() => ({ results: [] })),
        env.DB.prepare(`SELECT * FROM agentsam_routing_arms ORDER BY task_type, mode`)
          .all()
          .catch(() => ({ results: [] })),
      ]);
      return jsonResponse({
        models: models.results || [],
        tiers: tiers.results || [],
        routing: routing.results || [],
        workspace_id: workspaceId || null,
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
        `SELECT status, show_in_picker FROM agentsam_ai WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first();
      if (!existing) return jsonResponse({ error: 'Model not found' }, 404);
      const effectiveActive = String(existing.status || '') === 'active';
      const iaRaw = hasIA ? body.is_active : effectiveActive;
      const spRaw = hasSP ? body.show_in_picker : existing.show_in_picker;
      const nextActive =
        iaRaw === true || iaRaw === 1 || iaRaw === '1' || iaRaw === 'active';
      const sp = spRaw === true || spRaw === 1 || spRaw === '1' ? 1 : 0;
      await env.DB.prepare(
        `UPDATE agentsam_ai SET status = ?, show_in_picker = ?, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(nextActive ? 'active' : 'inactive', sp, id)
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
  if (pathLower === '/api/settings/mcp/status' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
      const tenantId = await resolveAuthTenantId(env, authUser);
      let results = [];
      try {
        if (workspaceId || tenantId) {
          const r = await env.DB.prepare(
            `SELECT id, health_status, last_health_check, metadata
             FROM mcp_services
             WHERE (workspace_id = ? OR tenant_id = ?)
             ORDER BY service_name`,
          )
            .bind(workspaceId || null, tenantId || null)
            .all();
          results = r.results || [];
        } else {
          const r = await env.DB.prepare(
            `SELECT id, health_status, last_health_check, metadata
             FROM mcp_services
             WHERE workspace_id IS NULL
             ORDER BY service_name`,
          ).all();
          results = r.results || [];
        }
      } catch {
        const r = await env.DB.prepare(
          `SELECT id, health_status, last_health_check, metadata FROM mcp_services ORDER BY service_name`,
        ).all();
        results = r.results || [];
      }
      const servers = (results || []).map((row) => {
        const meta = parseJsonSafe(row.metadata, {});
        const lat = meta.last_latency_ms;
        return {
          id: String(row.id),
          health_status: row.health_status != null ? String(row.health_status) : 'unknown',
          last_check_at: mcpLastCheckIso(row.last_health_check),
          latency_ms: lat != null && Number.isFinite(Number(lat)) ? Number(lat) : null,
        };
      });
      return jsonResponse({ servers });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/mcp\/servers\/([^/]+)\/ping$/);
    if (m && method === 'POST') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      try {
        const row = await env.DB.prepare(`SELECT id, endpoint_url, metadata FROM mcp_services WHERE id = ?`).bind(id).first();
        if (!row?.endpoint_url || !String(row.endpoint_url).trim().startsWith('http')) {
          return jsonResponse({ status: 'unreachable', latency_ms: null });
        }
        const cfg = mcpDashboardConfigFromRow(row);
        const hdrs = cfg.headers && typeof cfg.headers === 'object' ? cfg.headers : {};
        let status = 'unreachable';
        let latency_ms = null;
        try {
          const { res, latency_ms: ms } = await mcpFetchJsonRpcPing(
            env,
            cfg.url && String(cfg.url).trim().startsWith('http') ? String(cfg.url).trim() : String(row.endpoint_url).trim(),
            hdrs,
          );
          latency_ms = ms;
          status = res.ok ? 'healthy' : 'unreachable';
        } catch {
          status = 'unreachable';
        }
        const health_status = status === 'healthy' ? 'healthy' : 'unreachable';
        try {
          const meta = parseJsonSafe(row.metadata, {});
          meta.last_latency_ms = latency_ms;
          await env.DB.prepare(
            `UPDATE mcp_services SET health_status = ?, last_health_check = unixepoch(),
             metadata = json_set(COALESCE(metadata, '{}'), '$.last_latency_ms', ?),
             updated_at = unixepoch() WHERE id = ?`,
          )
            .bind(health_status, latency_ms ?? null, id)
            .run();
        } catch {
          /* ignore */
        }
        return jsonResponse({ status, latency_ms });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/mcp\/servers\/([^/]+)\/tools\/refresh$/);
    if (m && method === 'POST') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      try {
        const row = await env.DB.prepare(`SELECT id, endpoint_url, metadata FROM mcp_services WHERE id = ?`).bind(id).first();
        if (!row?.endpoint_url) return jsonResponse({ error: 'Server not found' }, 404);
        const cfg = mcpDashboardConfigFromRow(row);
        const url =
          cfg.url && String(cfg.url).trim().startsWith('http')
            ? String(cfg.url).trim()
            : String(row.endpoint_url).trim();
        const hdrs = cfg.headers && typeof cfg.headers === 'object' ? cfg.headers : {};
        const headers = {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...hdrs,
        };
        const token = env.MCP_AUTH_TOKEN ? String(env.MCP_AUTH_TOKEN) : '';
        if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
          signal: AbortSignal.timeout(8000),
        });
        const text = await resp.text();
        let tools = [];
        try {
          const line = text.split('\n').find((l) => {
            const t = l.trim();
            return t.startsWith('data:') || t.startsWith('{');
          });
          const raw = line
            ? line.trim().startsWith('data:')
              ? line.trim().slice(5).trim()
              : line.trim()
            : '{}';
          const json = JSON.parse(raw || '{}');
          const rawTools = json?.result?.tools;
          tools = Array.isArray(rawTools)
            ? rawTools.map((t) => ({
                name: String(t?.name || ''),
                description: t?.description != null ? String(t.description) : '',
                inputSchema: t?.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : null,
              }))
            : [];
        } catch {
          tools = [];
        }
        return jsonResponse({ tools, source: 'live', ok: resp.ok });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e), tools: [], source: 'live' }, 502);
      }
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/mcp\/servers\/([^/]+)\/tools$/);
    if (m && method === 'GET') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      try {
        const row = await env.DB.prepare(`SELECT endpoint_url FROM mcp_services WHERE id = ?`).bind(id).first();
        if (!row?.endpoint_url) return jsonResponse({ error: 'Server not found' }, 404);
        const ep = String(row.endpoint_url).trim();
        const { results } = await env.DB.prepare(
          `SELECT tool_name, description, input_schema, enabled
           FROM agentsam_mcp_tools WHERE mcp_service_url = ? ORDER BY tool_name`,
        )
          .bind(ep)
          .all();
        const tools = (results || []).map((t) => {
          let inputSchema = null;
          if (t.input_schema != null && String(t.input_schema).trim() !== '') {
            try {
              inputSchema = JSON.parse(String(t.input_schema));
            } catch {
              inputSchema = { raw: String(t.input_schema) };
            }
          }
          return {
            name: String(t.tool_name || ''),
            description: t.description != null ? String(t.description) : '',
            inputSchema,
            enabled: Number(t.enabled ?? 0) === 1,
          };
        });
        return jsonResponse({ tools, source: 'registry' });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/mcp\/servers\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      try {
        const row = await env.DB.prepare(`SELECT id, metadata, endpoint_url FROM mcp_services WHERE id = ?`).bind(id).first();
        if (!row) return jsonResponse({ error: 'Server not found' }, 404);
        if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
          const on = body.enabled === true || body.enabled === 1 || body.enabled === '1';
          await env.DB.prepare(`UPDATE mcp_services SET is_active = ?, updated_at = unixepoch() WHERE id = ?`)
            .bind(on ? 1 : 0, id)
            .run();
        }
        if (Object.prototype.hasOwnProperty.call(body, 'config') && body.config && typeof body.config === 'object') {
          const cfgJson = JSON.stringify(body.config);
          const newUrl =
            typeof body.config.url === 'string' && body.config.url.trim().startsWith('http')
              ? body.config.url.trim()
              : null;
          await env.DB.prepare(
            `UPDATE mcp_services SET
               metadata = json_set(COALESCE(metadata, '{}'), '$.dashboard_mcp_config', json(?)),
               endpoint_url = COALESCE(?, endpoint_url),
               updated_at = unixepoch()
             WHERE id = ?`,
          )
            .bind(cfgJson, newUrl, id)
            .run();
        }
        return jsonResponse({ ok: true });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }
    if (m && method === 'DELETE') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      try {
        await env.DB.prepare(`UPDATE mcp_services SET is_active = 0, updated_at = unixepoch() WHERE id = ?`)
          .bind(id)
          .run();
        return jsonResponse({ ok: true });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }
  }

  if (pathLower === '/api/settings/mcp' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
      const tenantId = await resolveAuthTenantId(env, authUser);
      const wsDisplay = await resolveWorkspaceDisplayName(env, workspaceId);

      // New schema (Sprint 1): workspace-scoped MCP servers + tool registry.
      try {
        const serverRow = await (async () => {
          if (workspaceId) {
            const r = await env.DB.prepare(
              `SELECT url
               FROM agentsam_mcp_servers
               WHERE is_active = 1 AND workspace_id = ?
               ORDER BY updated_at DESC
               LIMIT 1`,
            )
              .bind(workspaceId)
              .first()
              .catch(() => null);
            if (r?.url) return r;
          }
          if (tenantId) {
            const r = await env.DB.prepare(
              `SELECT url
               FROM agentsam_mcp_servers
               WHERE is_active = 1 AND tenant_id = ?
               ORDER BY updated_at DESC
               LIMIT 1`,
            )
              .bind(tenantId)
              .first()
              .catch(() => null);
            if (r?.url) return r;
          }
          const r = await env.DB.prepare(
            `SELECT url
             FROM agentsam_mcp_servers
             WHERE is_active = 1 AND workspace_id IS NULL
             ORDER BY updated_at DESC
             LIMIT 1`,
          )
            .first()
            .catch(() => null);
          return r;
        })();

        // Workspace scoping: tools are visible when workspace_scope contains ws OR tenant_id matches.
        // Fallback (no workspace/tenant): only tools with NULL workspace_scope (rare).
        let toolRows = [];
        try {
          if (workspaceId || tenantId) {
            const { results } = await env.DB.prepare(
              `SELECT
                 tool_key,
                 handler_type,
                 description,
                 input_schema,
                 modes_json,
                 risk_level,
                 handler_config,
                 is_active
               FROM agentsam_mcp_tools
               WHERE is_active = 1
                 AND (
                   (? != '' AND EXISTS (SELECT 1 FROM json_each(COALESCE(workspace_scope, '[]')) WHERE value = ?))
                   OR (? != '' AND tenant_id = ?)
                 )
               ORDER BY COALESCE(sort_priority, 9999), tool_key ASC`,
            )
              .bind(
                workspaceId ? String(workspaceId) : '',
                workspaceId ? String(workspaceId) : '',
                tenantId ? String(tenantId) : '',
                tenantId ? String(tenantId) : '',
              )
              .all();
            toolRows = results || [];
          } else {
            const { results } = await env.DB.prepare(
              `SELECT
                 tool_key,
                 handler_type,
                 description,
                 input_schema,
                 modes_json,
                 risk_level,
                 handler_config,
                 is_active
               FROM agentsam_mcp_tools
               WHERE is_active = 1 AND workspace_scope IS NULL
               ORDER BY COALESCE(sort_priority, 9999), tool_key ASC`,
            ).all();
            toolRows = results || [];
          }
        } catch {
          toolRows = [];
        }

        return jsonResponse({
          workspace: { id: wsDisplay.id, name: wsDisplay.name },
          connected: {
            url: serverRow?.url != null ? String(serverRow.url) : '',
          },
          tools: toolRows || [],
        });
      } catch {
        // Fall through to legacy surface below.
      }

      // Legacy surface (older dashboard): mcp_services + agentsam_mcp_tools.
      const [servers, tools, stats] = await Promise.all([
        env.DB.prepare(
          `SELECT s.*, COUNT(t.id) AS tool_count
           FROM mcp_services s
           LEFT JOIN agentsam_mcp_tools t ON t.mcp_service_url = s.endpoint_url
           GROUP BY s.id
           ORDER BY s.service_name`,
        )
          .all()
          .catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT t.*
           FROM agentsam_mcp_tools t
           ORDER BY COALESCE(t.tool_category, 'other'), COALESCE(t.sort_priority, 9999), t.tool_name`,
        )
          .all()
          .catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT tool_name, call_count, success_count, failure_count, total_cost_usd, avg_duration_ms
           FROM agentsam_tool_stats_compacted
           WHERE date = date('now')`,
        )
          .all()
          .catch(() => ({ results: [] })),
      ]);
      const statsMap = Object.fromEntries((stats.results || []).map((s) => [String(s.tool_name), s]));
      const toolsWithStats = (tools.results || []).map((t) => ({
        ...t,
        stats: statsMap[String(t.tool_name)] || null,
      }));

      return jsonResponse({
        servers: servers.results || [],
        tools: toolsWithStats,
        commandPerformance: [],
      });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/tools\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const toolKey = decodeURIComponent(m[1] || '').trim();
      if (!toolKey) return jsonResponse({ error: 'tool_key required' }, 400);
      const body = await request.json().catch(() => ({}));
      if (!body || typeof body !== 'object') return jsonResponse({ error: 'JSON body required' }, 400);

      // Only allow the requested editable fields.
      const allowed = [
        'handler_type',
        'description',
        'input_schema',
        'modes_json',
        'risk_level',
        'handler_config',
        'tool_key',
      ];
      const keys = allowed.filter((k) => Object.prototype.hasOwnProperty.call(body, k));
      if (!keys.length) return jsonResponse({ error: 'No allowed fields to update' }, 400);

      // Normalize JSON-ish fields (accept object/array or string).
      const normalizeJsonField = (val, fallback) => {
        if (val == null) return fallback;
        if (typeof val === 'string') return val;
        try {
          return JSON.stringify(val);
        } catch {
          return fallback;
        }
      };

      const sets = [];
      const binds = [];
      for (const k of keys) {
        if (k === 'input_schema') {
          sets.push('input_schema = ?');
          binds.push(normalizeJsonField(body.input_schema, '{}'));
          continue;
        }
        if (k === 'modes_json') {
          sets.push('modes_json = ?');
          binds.push(normalizeJsonField(body.modes_json, '[]'));
          continue;
        }
        if (k === 'handler_config') {
          sets.push('handler_config = ?');
          binds.push(normalizeJsonField(body.handler_config, '{}'));
          continue;
        }
        if (k === 'tool_key') {
          // tool_key is editable only for rename-like operations; keep it strict.
          const next = String(body.tool_key || '').trim();
          if (!next) return jsonResponse({ error: 'tool_key cannot be empty' }, 400);
          sets.push('tool_key = ?');
          binds.push(next);
          continue;
        }
        sets.push(`${k} = ?`);
        binds.push(body[k]);
      }
      sets.push('updated_at = unixepoch()');

      // Scope: update only within the caller's workspace/tenant visibility.
      const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
      const tenantId = await resolveAuthTenantId(env, authUser);
      const ws = workspaceId ? String(workspaceId) : '';
      const tid = tenantId ? String(tenantId) : '';

      try {
        // Primary: new schema table.
        const res = await env.DB.prepare(
          `UPDATE agentsam_mcp_tools
           SET ${sets.join(', ')}
           WHERE tool_key = ?
             AND is_active = 1
             AND (
               (? != '' AND EXISTS (SELECT 1 FROM json_each(COALESCE(workspace_scope, '[]')) WHERE value = ?))
               OR (? != '' AND tenant_id = ?)
             )`,
        )
          .bind(...binds, toolKey, ws, ws, tid, tid)
          .run();
        if (!res?.meta?.changes) return jsonResponse({ error: 'Tool not found' }, 404);
        const updated = await env.DB.prepare(
          `SELECT tool_key, handler_type, description, input_schema, modes_json, risk_level, handler_config, is_active
           FROM agentsam_mcp_tools
           WHERE tool_key = ?
           LIMIT 1`,
        )
          .bind(body.tool_key ? String(body.tool_key).trim() : toolKey)
          .first()
          .catch(() => null);
        return jsonResponse({ ok: true, tool: updated });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
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
        `UPDATE agentsam_mcp_tools
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
        `UPDATE agentsam_mcp_tools
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
          workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : null,
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
      const tenantId =
        authUser?.tenant_id != null ? String(authUser.tenant_id).trim() : null;
      const rev = await appendAgentsamSkillRevision(
        env,
        {
          skillId: id,
          changedBy: String(storedUserId),
          changeNote: typeof body.change_note === 'string' ? body.change_note : 'initial create',
          contentMarkdown: content_markdown,
          tenantId,
          workspaceId: workspaceId != null ? String(workspaceId).trim() : null,
        },
        ctx,
      );
      if (!rev.ok) {
        return jsonResponse({ error: rev.error || 'skill_revision_failed' }, 500);
      }
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
      if (skillPatchKeysNeedRevision(keys)) {
        const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
        const tenantId =
          authUser?.tenant_id != null ? String(authUser.tenant_id).trim() : null;
        const fieldsNote = keys.filter((k) => k !== 'content_markdown').join(', ');
        const changeNote =
          body.change_note != null && String(body.change_note).trim() !== ''
            ? String(body.change_note).slice(0, 2000)
            : fieldsNote
              ? `updated: ${fieldsNote}`
              : null;
        const rev = await appendAgentsamSkillRevision(
          env,
          {
            skillId: id,
            changedBy: String(storedUserId),
            changeNote,
            contentMarkdown:
              typeof body.content_markdown === 'string' ? body.content_markdown : undefined,
            tenantId,
            workspaceId: workspaceId != null ? String(workspaceId).trim() : null,
          },
          ctx,
        );
        if (!rev.ok) {
          return jsonResponse({ error: rev.error || 'skill_revision_failed' }, 500);
        }
      }
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
    const tid = await resolveAuthTenantId(env, authUser);
    const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
    const { listAgentsamCommandsForSettings } = await import('../core/agentsam-command-catalog.js');
    const results = await listAgentsamCommandsForSettings(env.DB, {
      tenantId: tid,
      workspaceId: wsRes?.workspaceId ?? null,
    }).catch(() => []);
    return jsonResponse({ commands: results || [], source: 'agentsam_commands' });
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
      await env.DB.prepare(`UPDATE agentsam_commands SET is_active = ?, updated_at = datetime('now') WHERE id = ?`)
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
       WHERE (user_id = ? OR user_id IS NULL)
         AND (workspace_id = ? OR workspace_id IS NULL)
         AND COALESCE(is_active, 1) = 1
       ORDER BY datetime(updated_at) DESC`,
    )
      .bind(String(storedUserId), String(wsId))
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
         WHERE id = ?
           AND workspace_id = ?
           AND user_id = ?`,
      )
        .bind(...vals, id, String(wsId), String(canonicalAuthId || sessionUserId))
        .run();
      return jsonResponse({ ok: true });
    }
  }

  // ── WORKSPACE / HOOKS / SECURITY / USAGE (read surfaces) ──────────────────
  if (pathLower === '/api/settings/workspace' && method === 'PATCH') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    const isSuper = Number(authUser.is_superadmin) === 1;
    if (!tenantId && !isSuper) return jsonResponse({ error: 'Tenant required' }, 403);

    const body = await request.json().catch(() => ({}));
    const wid =
      body.workspace_id != null && String(body.workspace_id).trim() !== ''
        ? String(body.workspace_id).trim()
        : (await resolveRequestWorkspaceId(env, authUser, url));
    if (!wid) return jsonResponse({ error: 'workspace_id required' }, 400);

    const ok = await userCanAccessWorkspace(env, authUser, wid);
    if (!ok) return jsonResponse({ error: 'Forbidden' }, 403);

    const row = await env.DB.prepare(`SELECT settings_json FROM workspaces WHERE id = ? LIMIT 1`).bind(wid).first();
    if (!row) return jsonResponse({ error: 'Workspace not found' }, 404);

    const hasCmsPipeline = body.cms_pipeline != null && typeof body.cms_pipeline === 'object';
    const hasWorkspaceSettings = body.workspace_settings != null && typeof body.workspace_settings === 'object';
    const hasWorkspaceLimits = body.workspace_limits != null && typeof body.workspace_limits === 'object';
    if (!hasCmsPipeline && !hasWorkspaceSettings && !hasWorkspaceLimits) {
      return jsonResponse(
        { error: 'Provide cms_pipeline, workspace_settings, and/or workspace_limits' },
        400,
      );
    }

    let nextJson = row.settings_json;
    if (hasCmsPipeline) {
      nextJson = mergeCmsPipelineIntoWorkspaceSettings(row.settings_json, body.cms_pipeline);
      await env.DB.prepare(`UPDATE workspaces SET settings_json = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(nextJson, wid)
        .run();
    }

    let parsed = {};
    try {
      parsed =
        nextJson != null && String(nextJson).trim() !== ''
          ? typeof nextJson === 'string'
            ? JSON.parse(nextJson)
            : nextJson
          : {};
    } catch {
      parsed = {};
    }

    if (hasWorkspaceSettings) {
      const wsAllowed = ['theme_id', 'accent_color', 'timezone'];
      const wsCols = [];
      const wsVals = [];
      for (const k of wsAllowed) {
        if (body.workspace_settings[k] !== undefined) {
          wsCols.push(k);
          wsVals.push(body.workspace_settings[k]);
        }
      }
      if (wsCols.length) {
        const colList = wsCols.join(', ');
        const placeholders = wsCols.map(() => '?').join(', ');
        const setExcluded = wsCols.map((c) => `${c} = excluded.${c}`).join(', ');
        await env.DB.prepare(
          `INSERT INTO workspace_settings (workspace_id, ${colList})
           VALUES (?, ${placeholders})
           ON CONFLICT(workspace_id) DO UPDATE SET
           ${setExcluded}, updated_at = datetime('now')`,
        )
          .bind(wid, ...wsVals)
          .run()
          .catch(() => null);
      }
    }

    if (hasWorkspaceLimits) {
      const limAllowed = ['max_daily_cost_usd', 'max_members'];
      const limCols = [];
      const limVals = [];
      for (const k of limAllowed) {
        if (body.workspace_limits[k] !== undefined) {
          limCols.push(k);
          limVals.push(body.workspace_limits[k]);
        }
      }
      if (limCols.length) {
        const colList = limCols.join(', ');
        const placeholders = limCols.map(() => '?').join(', ');
        const setExcluded = limCols.map((c) => `${c} = excluded.${c}`).join(', ');
        await env.DB.prepare(
          `INSERT INTO workspace_limits (workspace_id, ${colList})
           VALUES (?, ${placeholders})
           ON CONFLICT(workspace_id) DO UPDATE SET
           ${setExcluded}, updated_at = datetime('now')`,
        )
          .bind(wid, ...limVals)
          .run()
          .catch(() => null);
      }
    }

    return jsonResponse({ ok: true, settings_json: parsed });
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
        .bind(String(storedUserId), workspaceId || null)
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
      .bind(
        id,
        String(storedUserId),
        workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : null,
        trigger,
        command,
        provider,
        is_active,
      )
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
       FROM auth_sessions
       WHERE user_id = ? AND (revoked_at IS NULL OR TRIM(COALESCE(revoked_at, '')) = '')
       ORDER BY COALESCE(last_active_at, created_at) DESC`,
    )
      .bind(String(storedUserId))
      .all()
      .catch(() => ({ results: [] }));
    return jsonResponse({ sessions: results || [] });
  }

  if (pathLower === '/api/settings/profile' && method === 'PATCH') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const allowed = ['name', 'display_name', 'avatar_url'];
    const sets = [];
    const vals = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        sets.push(`${k} = ?`);
        vals.push(body[k]);
      }
    }
    if (!sets.length) return jsonResponse({ error: 'No valid fields' }, 400);
    vals.push(authUser.id);
    await env.DB.prepare(
      `UPDATE auth_users SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(...vals)
      .run();
    return jsonResponse({ ok: true });
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
    const m = pathLower.match(/^\/api\/settings\/security\/findings\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const findingId = decodeURIComponent(m[1] || '').trim();
      if (!findingId) return jsonResponse({ error: 'id required' }, 400);
      const tenantId = await resolveAuthTenantId(env, authUser);
      if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);
      const body = await request.json().catch(() => ({}));
      const newStatus = typeof body.status === 'string' ? body.status.trim() : '';
      const allowed = ['triaged', 'false_positive', 'fixed'];
      if (!allowed.includes(newStatus)) {
        return jsonResponse({ error: 'invalid_status' }, 400);
      }
      const out = await env.DB.prepare(
        `UPDATE security_findings
         SET status = ?, updated_at = unixepoch()
         WHERE id = ? AND tenant_id = ?`,
      )
        .bind(newStatus, findingId, tenantId)
        .run()
        .catch(() => null);
      const changes = out?.meta?.changes ?? 0;
      if (!out?.success || changes === 0) {
        return jsonResponse({ error: 'not_found' }, 404);
      }
      return jsonResponse({ ok: true, id: findingId, status: newStatus });
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
        `UPDATE auth_sessions SET revoked_at = datetime('now'), revoke_reason = 'user_revoked'
         WHERE id = ? AND user_id = ?`,
      )
        .bind(id, String(storedUserId))
        .run();
      if (env.SESSION_CACHE) {
        try {
          await env.SESSION_CACHE.delete(`iam_sess_v1:${id}`);
        } catch (_) {}
      }
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
      where += ` AND COALESCE(model_key, model) = ?`;
      params.push(model);
    }
    const [summary, ledger, total] = await Promise.all([
      env.DB.prepare(
        `SELECT provider, COALESCE(model_key, model) AS model_used,
                SUM(tokens_in) AS input_tokens,
                SUM(tokens_out) AS output_tokens,
                COUNT(*) AS call_count,
                ROUND(SUM(cost_usd), 4) AS cost_usd
         FROM agentsam_usage_events
         WHERE tenant_id = ? AND created_at >= unixepoch(date('now','start of month'))
         GROUP BY provider, COALESCE(model_key, model)
         ORDER BY cost_usd DESC`,
      )
        .bind(tenantId)
        .all()
        .catch(() => ({ results: [] })),
      env.DB.prepare(
        `SELECT provider, COALESCE(model_key, model) AS model_used, tokens_in AS input_tokens, tokens_out AS output_tokens, cost_usd, created_at
         FROM agentsam_usage_events
         ${where}
         ORDER BY created_at DESC
         LIMIT 50 OFFSET ?`,
      )
        .bind(...params, offset)
        .all()
        .catch(() => ({ results: [] })),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM agentsam_usage_events ${where}`,
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
      const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
      if (wsRes.error === WORKSPACE_CONTEXT_MISSING || !wsRes.workspaceId) {
        return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
      }
      const tid = await resolveAuthTenantId(env, authUser);
      const boot = await resolveActiveBootstrap(env, {
        userId: sessionUserId,
        personUuid: authUser.person_uuid ?? null,
        tenantId: tid,
        workspaceId: wsRes.workspaceId,
      });
      const prefs = parseJsonSafe(boot?.ui_preferences_json, {});
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
      const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
      if (wsRes.error === WORKSPACE_CONTEXT_MISSING || !wsRes.workspaceId) {
        return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
      }
      const tid = await resolveAuthTenantId(env, authUser);
      const row = await resolveActiveBootstrap(env, {
        userId: sessionUserId,
        personUuid: authUser.person_uuid ?? null,
        tenantId: tid,
        workspaceId: wsRes.workspaceId,
      });
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
        const workspaceId = wsRes.workspaceId;
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
            tid,
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
