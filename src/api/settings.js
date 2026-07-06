/**
 * API Service: User & Workspace Settings
 * Handles workspace listings, themes, and personal account configurations.
 * Deconstructed from legacy worker.js.
 *
 * P0 data isolation audit 2026-05-23 — unscoped SELECT lines (grep -v WHERE user_id|workspace_id|tenant_id):
 * Full log: artifacts/p0-data-isolation-audit-20260523.txt
 * user_api_keys / user_secrets: scoped in settings-api-keys.js (WHERE user_id = ?).
 */
import {
  getAuthUser,
  jsonResponse,
  syncSessionWorkspaceId,
  fetchAuthUserTenantId,
  fallbackSystemTenantId,
  authUserIsSuperadmin,
  invalidateFeatureFlagsCache,
  loadFeatureFlagsFromD1,
  appendBrowserLoginSessionCookies,
} from '../core/auth.js';
import {
  appendAgentsamSkillRevision,
  skillPatchKeysNeedRevision,
} from '../core/skill-revision.js';
import { appendAgentsamRulesRevision } from '../core/rules-revision.js';
import {
  resolveEffectiveWorkspaceId,
  resolveActiveBootstrap,
  WORKSPACE_CONTEXT_MISSING,
} from '../core/bootstrap.js';
import { handleSettingsIntegrationsApi } from './settings-integrations.js';
import { handleSettingsSectionStatusApi } from './settings-sections.js';
import { handleSettingsKeysApi } from './settings-api-keys.js';
import { handleSettingsWorkspaceApi } from './settings-workspace.js';
import { encryptApiKeyForStorage } from './provisioning.js';
import { isSamOperatorLaneUserId } from '../core/platform-operator-policy.js';
import { canUsePlatformAssetsR2Upload } from '../core/cms-theme-resolve.js';
import { fetchWorkspaceRowsForSettingsApi, userCanAccessWorkspace } from '../core/workspace-access.js';
import { loadWorkspaceThemeMap, persistWorkspaceThemeSlug } from '../core/workspace-user-prefs.js';
import { generateMcpToken } from '../core/mcp-auth.js';
import { isVaultConfigured } from '../core/vault-key-material.js';
import { MCP_CANONICAL_CLIENT_ID } from './mcp-oauth-shared.js';

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

function normalizeRulesApplyMode(raw) {
  const m = raw != null ? String(raw).trim().toLowerCase() : 'always';
  if (m === 'glob' || m === 'globs' || m === 'path') return 'glob';
  if (m === 'manual' || m === 'agent_requested') return 'manual';
  return 'always';
}

const RULES_DOC_ORDER_BY = 'COALESCE(sort_order, 0) ASC, COALESCE(updated_at_epoch, 0) DESC';

async function insertAgentsamRulesDocument(env, row) {
  const {
    id,
    userId,
    workspaceId,
    title,
    bodyMarkdown,
    applyMode,
    globs,
    sortOrder,
  } = row;
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_rules_document (
        id, user_id, workspace_id, title, body_markdown, version, is_active,
        apply_mode, globs, sort_order, created_at_epoch, updated_at_epoch, source_stored
      ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, unixepoch(), unixepoch(), 'dashboard')`,
    )
      .bind(id, userId, workspaceId, title, bodyMarkdown, applyMode, globs, sortOrder ?? 0)
      .run();
    return { ok: true, extended: true };
  } catch (e) {
    const msg = String(e?.message || e);
    if (!msg.includes('no such column')) throw e;
    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_rules_document (
          id, user_id, workspace_id, title, body_markdown, version, is_active,
          apply_mode, globs, source, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, 'dashboard', ?, datetime('now'), datetime('now'))`,
      )
        .bind(id, userId, workspaceId, title, bodyMarkdown, applyMode, globs, sortOrder ?? 0)
        .run();
      return { ok: true, extended: true };
    } catch (e2) {
      const msg2 = String(e2?.message || e2);
      if (!msg2.includes('no such column')) throw e2;
      await env.DB.prepare(
        `INSERT INTO agentsam_rules_document (
          id, user_id, workspace_id, title, body_markdown, version, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))`,
      )
        .bind(id, userId, workspaceId, title, bodyMarkdown)
        .run();
      return { ok: true, extended: false };
    }
  }
}

function slugifySubagentLabel(label) {
  const s = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || 'subagent';
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
      `SELECT active_workspace_id FROM auth_users WHERE id = ? LIMIT 1`,
    )
      .bind(uid)
      .first();
    if (row?.active_workspace_id != null && String(row.active_workspace_id).trim() !== '') {
      return String(row.active_workspace_id).trim();
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

  const settingsApiKeysRes = await handleSettingsKeysApi(
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

  // ── /api/settings/mcp-tokens (GET list, POST create, DELETE /:id revoke) ───
  const mcpTokensPathMatch = pathLower.match(/^\/api\/settings\/mcp-tokens(?:\/([^/]+))?$/);
  if (mcpTokensPathMatch) {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!workspaceId || !tenantId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const tokenId = mcpTokensPathMatch[1] ? decodeURIComponent(mcpTokensPathMatch[1]).trim() : '';

    if (!tokenId && method === 'GET') {
      try {
        const { results } = await env.DB.prepare(
          `SELECT id, label, rate_limit_per_hour, is_active, expires_at, created_at, last_used_at, allowed_tools
           FROM mcp_workspace_tokens
           WHERE tenant_id = ? AND workspace_id = ? AND COALESCE(is_active, 1) = 1
           ORDER BY created_at DESC LIMIT 50`,
        )
          .bind(tenantId, workspaceId)
          .all();
        return jsonResponse({ tokens: results || [] });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    if (!tokenId && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const label = typeof body?.label === 'string' ? body.label.trim() : '';
      const allowedTools = body?.allowedTools ?? body?.allowed_tools ?? null;
      const expiresInDays = body?.expiresInDays ?? body?.expires_in_days ?? null;
      const rateParsed = Number(body?.rateLimitPerHour ?? body?.rate_limit_per_hour);
      const rateLimitPerHour =
        Number.isFinite(rateParsed) && rateParsed > 0 ? Math.min(10000, Math.floor(rateParsed)) : 1000;
      try {
        const result = await generateMcpToken(env, {
          userId: String(authUser.id || '').trim(),
          workspaceId,
          tenantId,
          label: label || `${authUser.name || authUser.email || 'User'} MCP token`,
          allowedTools: allowedTools || null,
          rateLimitPerHour,
          expiresInDays: expiresInDays || null,
        });
        return jsonResponse({
          ok: true,
          bearer: result.bearer,
          tokenId: result.tokenId,
          warning: 'Save this bearer — it will not be shown again.',
        });
      } catch (e) {
        return jsonResponse({ error: e?.message || String(e) }, 500);
      }
    }

    if (tokenId && method === 'DELETE') {
      try {
        await env.DB.prepare(
          `UPDATE mcp_workspace_tokens SET is_active = 0, revoked_at = unixepoch()
           WHERE id = ? AND tenant_id = ? AND workspace_id = ?`,
        )
          .bind(tokenId, tenantId, workspaceId)
          .run();
        return jsonResponse({ ok: true });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ── /api/settings/profile ─────────────────────────────────────────────────
  if (pathLower === '/api/settings/profile' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const uid = String(authUser.id || '').trim();
    let row = null;
    try {
      row = await env.DB.prepare(
        `SELECT
           u.display_name AS au_display_name,
           u.avatar_url AS au_avatar_url,
           u.phone AS au_phone,
           u.timezone AS au_timezone,
           u.name AS au_name,
           s.full_name,
           s.bio,
           s.primary_email,
           s.backup_email,
           s.phone_verified,
           s.primary_email_verified,
           s.language,
           s.display_name AS us_display_name,
           s.avatar_url AS us_avatar_url,
           s.phone AS us_phone,
           s.timezone AS us_timezone
         FROM auth_users u
         LEFT JOIN user_settings s ON s.user_id = u.id
         WHERE u.id = ?
         LIMIT 1`,
      )
        .bind(uid)
        .first();
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'profile_load_failed' }, 500);
    }
    const primaryEmail =
      (row?.primary_email != null && String(row.primary_email).trim()) ||
      String(authUser.email || '').trim() ||
      '';
    const displayName =
      (row?.us_display_name != null && String(row.us_display_name).trim()) ||
      (row?.au_display_name != null && String(row.au_display_name).trim()) ||
      String(authUser.display_name || authUser.name || '').trim() ||
      '';
    const avatarUrl =
      (row?.us_avatar_url != null && String(row.us_avatar_url).trim()) ||
      (row?.au_avatar_url != null && String(row.au_avatar_url).trim()) ||
      null;
    const phone =
      (row?.us_phone != null && String(row.us_phone).trim()) ||
      (row?.au_phone != null && String(row.au_phone).trim()) ||
      '';
    const timezone =
      (row?.us_timezone != null && String(row.us_timezone).trim()) ||
      (row?.au_timezone != null && String(row.au_timezone).trim()) ||
      'America/Chicago';
    const language =
      row?.language != null && String(row.language).trim() ? String(row.language).trim() : 'en';
    const worker_base_url =
      typeof env.WORKER_BASE_URL === 'string' ? env.WORKER_BASE_URL.trim() : 'https://inneranimalmedia.com';
    const profile = {
      id: uid,
      email: primaryEmail,
      name: row?.au_name != null ? String(row.au_name) : authUser.name ?? null,
      display_name: displayName,
      full_name: row?.full_name != null ? String(row.full_name) : '',
      avatar_url: avatarUrl,
      phone,
      bio: row?.bio != null ? String(row.bio) : '',
      timezone,
      language,
      primary_email: primaryEmail,
      backup_email: row?.backup_email != null ? String(row.backup_email) : '',
      primary_email_verified: row?.primary_email_verified ? 1 : 0,
      phone_verified: row?.phone_verified ? 1 : 0,
      tenant_id: authUser.tenant_id,
      active_workspace_id: authUser.active_workspace_id,
      is_superadmin: authUser.is_superadmin,
      worker_base_url,
      flat: {
        display_name: displayName,
        full_name: row?.full_name != null ? String(row.full_name) : displayName,
        primary_email: primaryEmail,
      },
    };
    return jsonResponse(profile);
  }

  if (pathLower === '/api/settings/profile' && method === 'PATCH') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    if (body.primary_email !== undefined) {
      return jsonResponse({ error: 'primary_email is read-only' }, 400);
    }
    const uid = String(authUser.id || '').trim();
    const str = (v, max) => {
      if (v === undefined || v === null) return undefined;
      return String(v).trim().slice(0, max);
    };

    const display_name = str(body.display_name, 200);
    const avatar_url = str(body.avatar_url, 2000);
    const phone = str(body.phone, 64);
    const timezone = str(body.timezone, 80);
    const full_name = str(body.full_name, 200);
    const bio = str(body.bio, 4000);
    const backup_email = str(body.backup_email, 320);
    const language = str(body.language, 16);

    const authSets = [];
    const authVals = [];
    if (display_name !== undefined) {
      authSets.push('display_name = ?');
      authVals.push(display_name || null);
    }
    if (avatar_url !== undefined) {
      authSets.push('avatar_url = ?');
      authVals.push(avatar_url || null);
    }
    if (phone !== undefined) {
      authSets.push('phone = ?');
      authVals.push(phone || null);
    }
    if (timezone !== undefined) {
      authSets.push('timezone = ?');
      authVals.push(timezone || 'America/Chicago');
    }
    if (authSets.length) {
      authVals.push(uid);
      await env.DB.prepare(
        `UPDATE auth_users SET ${authSets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(...authVals)
        .run();
    }

    const settingsSets = [];
    const settingsVals = [];
    if (display_name !== undefined) {
      settingsSets.push('display_name = ?');
      settingsVals.push(display_name || null);
    }
    if (avatar_url !== undefined) {
      settingsSets.push('avatar_url = ?');
      settingsVals.push(avatar_url || null);
    }
    if (phone !== undefined) {
      settingsSets.push('phone = ?');
      settingsVals.push(phone || null);
    }
    if (timezone !== undefined) {
      settingsSets.push('timezone = ?');
      settingsVals.push(timezone || 'America/Chicago');
    }
    if (full_name !== undefined) {
      settingsSets.push('full_name = ?');
      settingsVals.push(full_name || null);
    }
    if (bio !== undefined) {
      settingsSets.push('bio = ?');
      settingsVals.push(bio || null);
    }
    if (backup_email !== undefined) {
      settingsSets.push('backup_email = ?');
      settingsVals.push(backup_email || null);
    }
    if (language !== undefined) {
      settingsSets.push('language = ?');
      settingsVals.push(language || 'en');
    }

    if (settingsSets.length) {
      settingsSets.push('updated_at = unixepoch()');
      settingsVals.push(uid);
      const upd = await env.DB.prepare(
        `UPDATE user_settings SET ${settingsSets.join(', ')} WHERE user_id = ?`,
      )
        .bind(...settingsVals)
        .run();
      if (!upd?.meta?.changes) {
        const primary_email = String(authUser.email || '').trim() || null;
        await env.DB.prepare(
          `INSERT INTO user_settings (
             id, user_id, display_name, avatar_url, phone, timezone, full_name, bio,
             backup_email, language, primary_email, theme, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'meaux-storm-gray', unixepoch())`,
        )
          .bind(
            `us_${uid}`,
            uid,
            display_name ?? null,
            avatar_url ?? null,
            phone ?? null,
            timezone ?? 'America/Chicago',
            full_name ?? null,
            bio ?? null,
            backup_email ?? null,
            language ?? 'en',
            primary_email,
          )
          .run();
      }
    }

    if (!authSets.length && !settingsSets.length) {
      return jsonResponse({ error: 'No valid fields' }, 400);
    }
    return jsonResponse({ ok: true });
  }

  if (pathLower === '/api/settings/profile/avatar' && method === 'POST') {
    const ct = (request.headers.get('Content-Type') || '').toLowerCase();
    if (!ct.includes('multipart/form-data')) {
      return jsonResponse({ error: 'multipart file required' }, 400);
    }
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const token = String(
      env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '',
    ).trim();
    const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
    if (!accountId || !token || !accountHash) {
      return jsonResponse({ error: 'Cloudflare Images not configured' }, 503);
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return jsonResponse({ error: 'file required' }, 400);
    }
    const uploadForm = new FormData();
    uploadForm.append('file', file, file.name || 'avatar.jpg');
    let cfJson;
    try {
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: uploadForm,
        },
      );
      cfJson = await cfRes.json().catch(() => ({}));
      if (!cfRes.ok || !cfJson?.success) {
        const msg =
          cfJson?.errors?.[0]?.message || cfJson?.messages?.[0]?.message || 'Upload failed';
        return jsonResponse({ error: msg }, cfRes.status >= 400 ? cfRes.status : 502);
      }
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'Upload failed' }, 502);
    }
    const imageId = cfJson?.result?.id;
    if (!imageId) return jsonResponse({ error: 'No image id returned' }, 502);
    const avatar_url = `https://imagedelivery.net/${accountHash}/${imageId}/avatar`;
    return jsonResponse({ ok: true, avatar_url });
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
        const feature_flags = await loadFeatureFlagsFromD1(env, uid, tenantId);
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
          current: null,
          workspaceThemes: {},
          workspaces: {},
        });
      }
      try {
        const tenantId = await resolveAuthTenantId(env, authUser);
        if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);

        const { userId: canonicalUserId } = await resolveCanonicalUserId(env, sessionUserId, authUser.email);

        const [wsRows, usPrimary] = await Promise.all([
          fetchWorkspaceRowsForSettingsApi(env.DB, env, authUser),
          env.DB.prepare('SELECT default_workspace_id FROM user_settings WHERE user_id = ? LIMIT 1')
            .bind(sessionUserId)
            .first()
            .catch(() => null),
        ]);

        const workspaceThemes = await loadWorkspaceThemeMap(
          env,
          wsRows.map((r) => r.id),
        );
        const workspaces = {};

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

        const settingsCurrent =
          us?.default_workspace_id != null && String(us.default_workspace_id).trim() !== ''
            ? String(us.default_workspace_id).trim()
            : null;
        const authCurrent =
          authUser?.active_workspace_id != null && String(authUser.active_workspace_id).trim() !== ''
            ? String(authUser.active_workspace_id).trim()
            : null;
        const current = authCurrent || settingsCurrent || null;
        const current_source = authCurrent
          ? 'auth_users.active_workspace_id'
          : settingsCurrent
            ? 'user_settings.default_workspace_id'
            : null;
        return jsonResponse({
          data: wsRows.length > 0 ? wsRows : CORE_WORKSPACES_DATA,
          current,
          current_source,
          workspaceThemes,
          workspaces,
        });
      } catch (e) {
        const msg = e?.message != null ? String(e.message) : String(e);
        const stack = typeof e?.stack === 'string' ? e.stack : '';
        console.error('[GET /api/settings/workspaces]', msg, stack || '');
        return jsonResponse(
          {
            data: CORE_WORKSPACES_DATA,
            current: null,
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
        if (!(await userCanAccessWorkspace(env, authUser, workspace_id))) {
          return jsonResponse({ error: 'Workspace not found' }, 404);
        }

        return jsonResponse({ ok: true, deprecated: true, note: 'brand/plans/budget/time prefs retired' });
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

      const allowed = isSuper || (await userCanAccessWorkspace(env, authUser, id));
      if (!allowed) return jsonResponse({ error: 'Workspace not found' }, 404);

      const { userCanActivatePlatformWorkspace } = await import('../core/platform-operator-policy.js');
      if (!(await userCanActivatePlatformWorkspace(env, authUser, id))) {
        return jsonResponse({ error: 'Workspace not found' }, 404);
      }

      const row = await env.DB.prepare(
        `SELECT w.id, w.display_name, w.slug, w.workspace_type, w.r2_prefix, w.github_repo, w.settings_json,
                w.tenant_id
         FROM workspaces w
         WHERE w.id = ?
         LIMIT 1`,
      )
        .bind(id)
        .first();
      if (!row) return jsonResponse({ error: 'Workspace not found' }, 404);

      await env.DB.prepare(`UPDATE workspaces SET updated_at = datetime('now') WHERE id = ?`).bind(id).run();

      try {
        const upd = await env.DB.prepare(
          `UPDATE user_settings SET default_workspace_id = ?, updated_at = unixepoch() WHERE user_id = ?`,
        )
          .bind(id, sessionUserId)
          .run();
        if (!upd?.meta?.changes) {
          await env.DB.prepare(
            `INSERT INTO user_settings (id, user_id, default_workspace_id, theme, updated_at)
             VALUES (?, ?, ?, 'meaux-storm-gray', unixepoch())`,
          )
            .bind(`us_${sessionUserId}`, sessionUserId, id)
            .run()
            .catch(() => {});
        }
      } catch (_) {
        /* optional legacy row */
      }

      try {
        await env.DB.prepare(
          `UPDATE auth_users SET active_workspace_id = ?, updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(id, sessionUserId)
          .run();
      } catch (_) {
        /* ignore */
      }

      let reminted = null;
      try {
        reminted = await syncSessionWorkspaceId(env, request, sessionUserId, id);
      } catch (_) {
        /* non-fatal — auth_users is SSOT */
      }

      const response = jsonResponse({
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
      if (reminted?.sessionToken) {
        appendBrowserLoginSessionCookies(response.headers, reminted.sessionToken);
      }
      return response;
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
      if (!(await userCanAccessWorkspace(env, authUser, workspaceId))) {
        return jsonResponse({ error: 'Workspace not found' }, 404);
      }
      if (theme) await persistWorkspaceThemeSlug(env, workspaceId, theme);
      return jsonResponse({ ok: true });
    } catch (e) {
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
        `SELECT tool_key, COALESCE(preference, 'allow') AS preference, notes
           FROM agentsam_mcp_allowlist
          WHERE user_id = ? AND workspace_id = ?
          ORDER BY tool_key ASC`,
      )
        .bind(agentsamUserId, workspaceId || null)
        .all()
        .then((r) => r.results || [])
        .catch(() =>
          env.DB.prepare(
            `SELECT tool_key, NULL AS notes FROM agentsam_mcp_allowlist
               WHERE user_id = ? AND workspace_id = ?
               ORDER BY tool_key ASC`,
          )
            .bind(agentsamUserId, workspaceId || null)
            .all()
            .then((r2) => r2.results || [])
            .catch(() => []),
        ),
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

    let mcp_tool_groups = [];
    let mcp_group_preferences = {};
    try {
      const { loadMcpOAuthConsentToolManifest } = await import('./mcp-oauth-shared.js');
      const {
        groupMcpToolsForPreferences,
        inferGroupPreferenceFromAllowlist,
      } = await import('../core/mcp-tool-preference.js');
      const manifest = await loadMcpOAuthConsentToolManifest(env, {
        userId: agentsamUserId,
        workspaceId: workspaceId || '',
        tenantId: String(policyRow?.tenant_id || authUser?.tenant_id || '').trim(),
        clientId: MCP_CANONICAL_CLIENT_ID,
        grantedScopes: ['mcp:tools', 'iam:agent', 'iam:profile'],
      });
      mcp_tool_groups = manifest.tool_groups?.length
        ? manifest.tool_groups
        : groupMcpToolsForPreferences(manifest.tools || []);
      const allowed = new Set(
        mcpRows.map((r) => String(r.tool_key || '').trim()).filter(Boolean),
      );
      for (const g of mcp_tool_groups) {
        mcp_group_preferences[g.group_key] = inferGroupPreferenceFromAllowlist(g.tools, allowed);
      }
    } catch (_) {}

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
          .map((r) => ({
            tool_key: String(r.tool_key || '').trim(),
            notes: r.notes ?? null,
            preference: r.preference != null ? String(r.preference) : null,
          }))
          .filter((x) => x.tool_key),
      },
      mcp_tool_groups,
      mcp_group_preferences,
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

  if (pathLower === '/api/settings/agents/mcp/preferences' && (method === 'PUT' || method === 'PATCH')) {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const workspaceId =
      body.workspace_id != null && String(body.workspace_id).trim() !== ''
        ? String(body.workspace_id).trim()
        : await resolveRequestWorkspaceId(env, authUser, url);
    const prefs =
      body.group_preferences && typeof body.group_preferences === 'object'
        ? body.group_preferences
        : body.tool_preferences && typeof body.tool_preferences === 'object'
          ? body.tool_preferences
          : null;
    if (!prefs) return jsonResponse({ error: 'group_preferences object required' }, 400);

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

    try {
      const { loadMcpOAuthConsentToolManifest } = await import('./mcp-oauth-shared.js');
      const { persistMcpAllowlistFromGroupPreferences } = await import('../core/mcp-tool-preference.js');
      const manifest = await loadMcpOAuthConsentToolManifest(env, {
        userId: agentsamUserId,
        workspaceId: workspaceId || '',
        tenantId: String(authUser?.tenant_id || '').trim(),
        clientId: String(body.client_id || MCP_CANONICAL_CLIENT_ID),
        grantedScopes: ['mcp:tools', 'iam:agent', 'iam:profile'],
      });
      const result = await persistMcpAllowlistFromGroupPreferences(env, {
        userId: agentsamUserId,
        workspaceId: workspaceId || '',
        tenantId: String(authUser?.tenant_id || '').trim(),
        clientId: String(body.client_id || MCP_CANONICAL_CLIENT_ID),
        catalogTools: manifest.tools || [],
        groupPreferences: prefs,
      });
      return jsonResponse({ ok: true, ...result });
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 500);
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

  if (pathLower === '/api/settings/allowlist/command-suggestions' && method === 'GET') {
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

    const [patternRows, allowRows] = await Promise.all([
      env.DB.prepare(
        `SELECT pattern, mapped_command, category
         FROM agentsam_command_pattern
         WHERE is_active = 1
           AND (workspace_id = ? OR workspace_id IS NULL OR workspace_id = '')
         ORDER BY use_count DESC, created_at ASC
         LIMIT 200`,
      )
        .bind(workspaceId || null)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT command FROM agentsam_command_allowlist
         WHERE user_id = ? AND workspace_id = ?`,
      )
        .bind(agentsamUserId, workspaceId || null)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
    ]);

    const existing = new Set(
      allowRows.map((row) => String(row.command || '').trim()).filter(Boolean),
    );
    const seen = new Set();
    const suggestions = [];
    for (const row of patternRows) {
      const pattern = String(row.mapped_command || row.pattern || '').trim();
      if (!pattern || existing.has(pattern) || seen.has(pattern)) continue;
      seen.add(pattern);
      suggestions.push({
        pattern,
        category: row.category != null ? String(row.category) : undefined,
      });
      if (suggestions.length >= 50) break;
    }

    return jsonResponse({ suggestions });
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

  const providerSlugForKeysApi = (slug) => {
    const s = normalizeAiProviderSlug(slug);
    if (s === 'google_ai') return 'google';
    if (s === 'cursor') return 'openai';
    return s;
  };

  const canManageAiModelCatalog = (user) =>
    authUserIsSuperadmin(user) || isSamOperatorLaneUserId(user?.id);

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
    const storeUserId = String(authUser.id || '').trim();
    try {
      const { results: modelRows } = await env.DB.prepare(
        `SELECT *
         FROM agentsam_ai
         WHERE model_key IS NOT NULL AND COALESCE(status, '') != 'removed'
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
           WHERE tenant_id = ? AND user_id = ? AND COALESCE(is_active, 1) = 1`,
        )
          .bind(tenantId, storeUserId)
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

      return jsonResponse({
        providers,
        can_manage_catalog: canManageAiModelCatalog(authUser),
      });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/settings/ai-models/keys' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const providerRaw = String(body.provider || '').trim();
    const provNorm = normalizeAiProviderSlug(providerRaw);
    if (!provNorm) return jsonResponse({ error: 'provider required' }, 400);
    const keysProvider = providerSlugForKeysApi(provNorm);
    const rawKey = String(body.rawKey || body.raw_key || body.api_key || '').trim();
    if (!rawKey) return jsonResponse({ error: 'API key required' }, 400);
    const label =
      String(body.keyName || body.key_name || '').trim() ||
      `${keysProvider} API key (AI Models)`;
    const fwdUrl = new URL(request.url);
    fwdUrl.pathname = '/api/settings/keys';
    const fwdReq = new Request(fwdUrl.toString(), {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({
        category: 'provider',
        provider: keysProvider,
        label,
        api_key: rawKey,
        validate: true,
      }),
    });
    return handleSettingsKeysApi(
      fwdReq,
      env,
      ctx,
      authUser,
      fwdUrl,
      '/api/settings/keys',
      'POST',
    );
  }

  {
    const m = pathLower.match(/^\/api\/settings\/ai-models\/keys\/([^/]+)$/);
    if (m && method === 'DELETE') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const tenantId = await resolveAuthTenantId(env, authUser);
      if (!tenantId) return jsonResponse({ error: 'tenant required' }, 400);
      const storeUserId = String(authUser.id || '').trim();
      const providerSeg = decodeURIComponent(m[1] || '').trim();
      const keysProvider = providerSlugForKeysApi(providerSeg);
      try {
        const row = await env.DB.prepare(
          `SELECT id FROM user_api_keys
           WHERE tenant_id = ? AND user_id = ? AND provider = ? AND COALESCE(is_active, 1) = 1
           LIMIT 1`,
        )
          .bind(tenantId, storeUserId, keysProvider)
          .first();
        if (!row?.id) return jsonResponse({ ok: true, removed: false });
        const fwdUrl = new URL(request.url);
        fwdUrl.pathname = `/api/settings/keys/${encodeURIComponent(String(row.id))}`;
        const fwdReq = new Request(fwdUrl.toString(), {
          method: 'DELETE',
          headers: request.headers,
        });
        return handleSettingsKeysApi(
          fwdReq,
          env,
          ctx,
          authUser,
          fwdUrl,
          fwdUrl.pathname.toLowerCase(),
          'DELETE',
        );
      } catch (e) {
        return jsonResponse({ error: e?.message ?? 'Failed to remove key' }, 500);
      }
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/ai-models\/([^/]+)$/);
    if (m) {
      const seg = decodeURIComponent(m[1] || '').trim();
      if (seg && seg !== 'keys' && seg !== 'usage') {
        if (!canManageAiModelCatalog(authUser)) {
          return jsonResponse({ error: 'Forbidden' }, 403);
        }
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        const modelKey = seg;

        if (method === 'DELETE') {
          try {
            const existing = await env.DB.prepare(
              `SELECT model_key FROM agentsam_ai WHERE model_key = ? LIMIT 1`,
            )
              .bind(modelKey)
              .first();
            if (!existing) return jsonResponse({ error: 'Model not found' }, 404);
            await env.DB.prepare(
              `UPDATE agentsam_ai
               SET status = 'removed', show_in_picker = 0, picker_eligible = 0, updated_at = datetime('now')
               WHERE model_key = ?`,
            )
              .bind(modelKey)
              .run();
            return jsonResponse({ ok: true, model_key: modelKey, removed: true });
          } catch (e) {
            return jsonResponse({ error: e?.message ?? 'Remove failed' }, 500);
          }
        }

        if (method === 'PATCH') {
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
          `SELECT COALESCE(tool_name, tool_key) AS tool_name, description, input_schema, COALESCE(is_active, 1) AS enabled
           FROM agentsam_tools WHERE mcp_service_url = ? ORDER BY COALESCE(tool_name, tool_key)`,
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

        // Workspace scoping: tools visible when workspace_scope is global or contains ws.
        let toolRows = [];
        try {
          const wsArg = workspaceId ? String(workspaceId) : '';
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
             FROM agentsam_tools
             WHERE COALESCE(is_active, 1) = 1
               AND COALESCE(is_degraded, 0) = 0
               AND (
                 COALESCE(is_global, 1) = 1
                 OR workspace_scope IS NULL OR trim(workspace_scope) IN ('', '[]')
                 OR workspace_scope LIKE '%"*"%'
                 OR (? != '' AND instr(COALESCE(workspace_scope, ''), ?) > 0)
               )
             ORDER BY COALESCE(sort_priority, 9999), tool_key ASC`,
          )
            .bind(wsArg, wsArg)
            .all();
          toolRows = results || [];
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

      // Legacy surface (older dashboard): mcp_services + agentsam_tools.
      const [servers, tools, stats] = await Promise.all([
        env.DB.prepare(
          `SELECT s.*, COUNT(t.id) AS tool_count
           FROM mcp_services s
           LEFT JOIN agentsam_tools t ON t.mcp_service_url = s.endpoint_url
           GROUP BY s.id
           ORDER BY s.service_name`,
        )
          .all()
          .catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT t.*, COALESCE(t.is_active, 1) AS enabled
           FROM agentsam_tools t
           ORDER BY COALESCE(t.tool_category, 'other'), COALESCE(t.sort_priority, 9999), COALESCE(t.tool_name, t.tool_key)`,
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

      // Scope: update only within the caller's workspace visibility.
      const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
      const ws = workspaceId ? String(workspaceId) : '';

      try {
        const res = await env.DB.prepare(
          `UPDATE agentsam_tools
           SET ${sets.join(', ')}
           WHERE tool_key = ?
             AND COALESCE(is_active, 1) = 1
             AND (
               COALESCE(is_global, 1) = 1
               OR workspace_scope IS NULL OR trim(workspace_scope) IN ('', '[]')
               OR workspace_scope LIKE '%"*"%'
               OR (? != '' AND instr(COALESCE(workspace_scope, ''), ?) > 0)
             )`,
        )
          .bind(...binds, toolKey, ws, ws)
          .run();
        if (!res?.meta?.changes) return jsonResponse({ error: 'Tool not found' }, 404);
        const updated = await env.DB.prepare(
          `SELECT tool_key, handler_type, description, input_schema, modes_json, risk_level, handler_config, is_active
           FROM agentsam_tools
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
        `UPDATE agentsam_tools
         SET is_active = ?, updated_at = unixepoch()
         WHERE id = ? OR tool_name = ? OR tool_key = ?`,
      )
        .bind(enabled ? 1 : 0, id, id, id)
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
      const sets = keys.map((k) => (k === 'enabled' ? 'is_active = ?' : `${k} = ?`)).join(', ');
      const vals = keys.map((k) => {
        if (k === 'enabled') {
          const on = body.enabled === true || body.enabled === 1 || body.enabled === '1';
          return on ? 1 : 0;
        }
        return body[k];
      });
      await env.DB.prepare(
        `UPDATE agentsam_tools
         SET ${sets}, updated_at = unixepoch()
         WHERE id = ? OR tool_name = ? OR tool_key = ?`,
      )
        .bind(...vals, id, id, id)
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
    const storedUserId = String(canonicalAuthId || sessionUserId || '').trim();
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
    const wsKey = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';
    const { results } = await env.DB.prepare(
      `SELECT * FROM agentsam_subagent_profile
       WHERE user_id = ?
         AND COALESCE(workspace_id, '') = ?
         AND COALESCE(is_platform_global, 0) = 0
       ORDER BY COALESCE(sort_order, 9999), display_name ASC`,
    )
      .bind(storedUserId, wsKey)
      .all()
      .catch(() => ({ results: [] }));
    return jsonResponse({ subagents: results || [], workspace_id: wsKey || null });
  }

  if (pathLower === '/api/settings/subagents' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const storedUserId = String(canonicalAuthId || sessionUserId || '').trim();
    if (!storedUserId) return jsonResponse({ error: 'user required' }, 401);
    const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
    const wsKey = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';
    const body = await request.json().catch(() => ({}));
    const display_name =
      typeof body.display_name === 'string' && body.display_name.trim()
        ? body.display_name.trim().slice(0, 120)
        : '';
    if (!display_name) return jsonResponse({ error: 'display_name required' }, 400);
    const slugRaw =
      typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : slugifySubagentLabel(display_name);
    const slug = slugifySubagentLabel(slugRaw);
    const id =
      typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `asp_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const description = typeof body.description === 'string' ? body.description : '';
    const instructions_markdown =
      typeof body.instructions_markdown === 'string' ? body.instructions_markdown : '';
    const default_model_id =
      body.default_model_id != null && String(body.default_model_id).trim() !== ''
        ? String(body.default_model_id).trim()
        : null;
    const personality_tone =
      typeof body.personality_tone === 'string' && body.personality_tone.trim()
        ? body.personality_tone.trim().slice(0, 64)
        : 'professional';
    const sandbox_mode =
      typeof body.sandbox_mode === 'string' && body.sandbox_mode.trim()
        ? body.sandbox_mode.trim().slice(0, 64)
        : 'workspace-write';
    const model_reasoning_effort =
      typeof body.model_reasoning_effort === 'string' && body.model_reasoning_effort.trim()
        ? body.model_reasoning_effort.trim().slice(0, 32)
        : 'medium';
    const access_mode =
      body.access_mode === 'read_only' || body.access_mode === 'read_write' ? body.access_mode : 'read_write';
    const allowed_tool_globs =
      typeof body.allowed_tool_globs === 'string'
        ? body.allowed_tool_globs
        : Array.isArray(body.allowed_tool_globs)
          ? JSON.stringify(body.allowed_tool_globs)
          : null;
    const agent_type =
      typeof body.agent_type === 'string' && body.agent_type.trim()
        ? body.agent_type.trim().slice(0, 64)
        : 'custom';
    const run_in_background =
      body.run_in_background === true || body.run_in_background === 1 || body.run_in_background === '1' ? 1 : 0;
    const sort_order =
      body.sort_order != null && Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 100;
    const tenantId = await resolveAuthTenantId(env, authUser).catch(() => null);
    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_subagent_profile (
          id, user_id, workspace_id, tenant_id, slug, display_name, description,
          instructions_markdown, allowed_tool_globs, default_model_id, is_active,
          personality_tone, access_mode, sandbox_mode, model_reasoning_effort,
          agent_type, run_in_background, sort_order, is_platform_global,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1,
          ?, ?, ?, ?, ?, ?, ?, 0,
          datetime('now'), datetime('now')
        )`,
      )
        .bind(
          id,
          storedUserId,
          wsKey,
          tenantId,
          slug,
          display_name,
          description,
          instructions_markdown,
          allowed_tool_globs,
          default_model_id,
          personality_tone,
          access_mode,
          sandbox_mode,
          model_reasoning_effort,
          agent_type,
          run_in_background,
          sort_order,
        )
        .run();
      const row = await env.DB.prepare(
        `SELECT * FROM agentsam_subagent_profile WHERE id = ? AND user_id = ? LIMIT 1`,
      )
        .bind(id, storedUserId)
        .first()
        .catch(() => null);
      return jsonResponse({ ok: true, id, subagent: row });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('UNIQUE') || msg.includes('constraint')) {
        return jsonResponse({ error: 'A subagent with this slug already exists in this workspace' }, 409);
      }
      return jsonResponse({ error: msg }, 500);
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/subagents\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const storedUserId = canonicalAuthId || sessionUserId;
      const workspaceId = await resolveRequestWorkspaceId(env, authUser, url);
      const wsKey = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';
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
        'access_mode',
        'allowed_tool_globs',
        'run_in_background',
        'sort_order',
        'icon',
      ];
      const keys = allowed.filter((k) => body && Object.prototype.hasOwnProperty.call(body, k));
      if (!keys.length) return jsonResponse({ error: 'No fields to update' }, 400);
      if (keys.includes('access_mode')) {
        const am = body.access_mode;
        if (am !== 'read_only' && am !== 'read_write') {
          return jsonResponse({ error: 'access_mode must be read_only or read_write' }, 400);
        }
      }
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const vals = keys.map((k) => {
        if (k === 'is_active' || k === 'run_in_background') {
          const v = body[k];
          return v === true || v === 1 || v === '1' ? 1 : 0;
        }
        if (k === 'allowed_tool_globs' && Array.isArray(body[k])) return JSON.stringify(body[k]);
        return body[k];
      });
      const n = await env.DB.prepare(
        `UPDATE agentsam_subagent_profile SET ${sets}, updated_at = datetime('now')
         WHERE id = ? AND user_id = ? AND COALESCE(workspace_id, '') = ? AND COALESCE(is_platform_global, 0) = 0`,
      )
        .bind(...vals, id, String(storedUserId), wsKey)
        .run();
      if (!n.meta?.changes) return jsonResponse({ error: 'Subagent not found' }, 404);
      const row = await env.DB.prepare(
        `SELECT * FROM agentsam_subagent_profile WHERE id = ? AND user_id = ? LIMIT 1`,
      )
        .bind(id, String(storedUserId))
        .first()
        .catch(() => null);
      return jsonResponse({ ok: true, subagent: row });
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

  const rulesWorkspaceId = await resolveRequestWorkspaceId(env, authUser, url);
  const rulesWsKey =
    rulesWorkspaceId != null && String(rulesWorkspaceId).trim() !== ''
      ? String(rulesWorkspaceId).trim()
      : '';
  const rulesUserId = String(canonicalAuthId || sessionUserId || '').trim();

  if (pathLower === '/api/settings/rules' && method === 'GET') {
    if (!env.DB) return jsonResponse({ rules: [] });
    try {
      const { results } = await env.DB.prepare(
        `SELECT *
         FROM agentsam_rules_document
         WHERE (user_id = ? OR user_id IS NULL)
           AND (
             COALESCE(workspace_id, '') = ?
             OR workspace_id IS NULL
             OR TRIM(COALESCE(workspace_id, '')) = ''
           )
         ORDER BY ${RULES_DOC_ORDER_BY}`,
      )
        .bind(rulesUserId, rulesWsKey)
        .all();
      return jsonResponse({ rules: results || [], workspace_id: rulesWsKey || null });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/settings/rules' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (!rulesUserId) return jsonResponse({ error: 'user required' }, 401);
    const body = await request.json().catch(() => ({}));
    const title =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 200)
        : 'Untitled rule';
    const body_markdown =
      typeof body.body_markdown === 'string' ? body.body_markdown : String(body.body_markdown ?? '');
    const apply_mode = normalizeRulesApplyMode(body.apply_mode);
    const globs =
      typeof body.globs === 'string' && body.globs.trim() ? body.globs.trim().slice(0, 2000) : null;
    const id =
      typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `ard_${crypto.randomUUID()}`;
    try {
      await insertAgentsamRulesDocument(env, {
        id,
        userId: rulesUserId,
        workspaceId: rulesWsKey,
        title,
        bodyMarkdown: body_markdown,
        applyMode: apply_mode,
        globs,
        sortOrder: 0,
      });
      await appendAgentsamRulesRevision(
        env,
        {
          documentId: id,
          createdBy: rulesUserId,
          bodyMarkdown: body_markdown,
          version: 1,
          workspaceId: rulesWsKey,
        },
        ctx,
      );
      const row = await env.DB.prepare(`SELECT * FROM agentsam_rules_document WHERE id = ? LIMIT 1`)
        .bind(id)
        .first();
      return jsonResponse({ ok: true, id, rule: row });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('UNIQUE') || msg.includes('constraint')) {
        return jsonResponse({ error: 'Rule already exists' }, 409);
      }
      return jsonResponse({ error: msg }, 500);
    }
  }

  {
    const m = pathLower.match(/^\/api\/settings\/rules\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const allowed = ['title', 'body_markdown', 'is_active', 'apply_mode', 'globs', 'sort_order'];
      const keys = allowed.filter((k) => body && Object.prototype.hasOwnProperty.call(body, k));
      if (!keys.length) return jsonResponse({ error: 'No fields to update' }, 400);

      const existing = await env.DB.prepare(
        `SELECT * FROM agentsam_rules_document WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first();
      if (!existing) return jsonResponse({ error: 'Rule not found' }, 404);
      if (existing.user_id != null && String(existing.user_id) !== rulesUserId) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
      const docWs = existing.workspace_id != null ? String(existing.workspace_id).trim() : '';
      if (docWs && rulesWsKey && docWs !== rulesWsKey) {
        return jsonResponse({ error: 'Wrong workspace for this rule' }, 403);
      }

      const sets = [];
      const vals = [];
      for (const k of keys) {
        if (k === 'title') {
          sets.push('title = ?');
          vals.push(String(body.title || '').trim().slice(0, 200) || 'Untitled rule');
        } else if (k === 'body_markdown') {
          sets.push('body_markdown = ?');
          vals.push(
            typeof body.body_markdown === 'string'
              ? body.body_markdown
              : String(body.body_markdown ?? ''),
          );
        } else if (k === 'is_active') {
          sets.push('is_active = ?');
          vals.push(body.is_active === true || body.is_active === 1 || body.is_active === '1' ? 1 : 0);
        } else if (k === 'apply_mode') {
          sets.push('apply_mode = ?');
          vals.push(normalizeRulesApplyMode(body.apply_mode));
        } else if (k === 'globs') {
          sets.push('globs = ?');
          vals.push(
            typeof body.globs === 'string' && body.globs.trim()
              ? body.globs.trim().slice(0, 2000)
              : null,
          );
        } else if (k === 'sort_order') {
          sets.push('sort_order = ?');
          vals.push(Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0);
        }
      }
      if (keys.includes('body_markdown')) {
        sets.push('version = COALESCE(version, 1) + 1');
      }
      try {
        await env.DB.prepare(
          `UPDATE agentsam_rules_document SET ${sets.join(', ')}, updated_at_epoch = unixepoch() WHERE id = ?`,
        )
          .bind(...vals, id)
          .run();
      } catch (e) {
        const msg = String(e?.message || e);
        if (!msg.includes('no such column')) {
          return jsonResponse({ error: e?.message ?? String(e) }, 500);
        }
        try {
          await env.DB.prepare(
            `UPDATE agentsam_rules_document SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
          )
            .bind(...vals, id)
            .run();
        } catch (e2) {
          return jsonResponse({ error: e2?.message ?? String(e2) }, 500);
        }
      }

      if (keys.includes('body_markdown')) {
        const nextVer = Number(existing.version || 1) + 1;
        await appendAgentsamRulesRevision(
          env,
          {
            documentId: id,
            createdBy: rulesUserId,
            bodyMarkdown:
              typeof body.body_markdown === 'string'
                ? body.body_markdown
                : String(body.body_markdown ?? ''),
            version: nextVer,
            workspaceId: rulesWsKey,
          },
          ctx,
        );
      }

      const row = await env.DB.prepare(`SELECT * FROM agentsam_rules_document WHERE id = ? LIMIT 1`)
        .bind(id)
        .first();
      return jsonResponse({ ok: true, rule: row });
    }

    if (m && method === 'DELETE') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      const id = decodeURIComponent(m[1] || '').trim();
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const existing = await env.DB.prepare(
        `SELECT user_id, workspace_id FROM agentsam_rules_document WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first();
      if (!existing) return jsonResponse({ error: 'Rule not found' }, 404);
      if (existing.user_id != null && String(existing.user_id) !== rulesUserId) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
      try {
        await env.DB.prepare(
          `UPDATE agentsam_rules_document SET is_active = 0, updated_at_epoch = unixepoch() WHERE id = ?`,
        )
          .bind(id)
          .run();
      } catch (e) {
        const msg = String(e?.message || e);
        if (!msg.includes('no such column')) {
          return jsonResponse({ error: e?.message ?? String(e) }, 500);
        }
        await env.DB.prepare(
          `UPDATE agentsam_rules_document SET is_active = 0, updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(id)
          .run();
      }
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
      const { queueCodeIndexJobAfterDeploy } = await import('../core/deploy-code-index-queue.js');
      const queued = await queueCodeIndexJobAfterDeploy(env, {
        workspaceId,
        triggeredBy: 'dashboard_reindex',
      });
      if (!queued.ok && !queued.skipped) {
        return jsonResponse({ error: queued.error || 'queue_failed' }, 500);
      }
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

  if (pathLower === '/api/settings/security/findings' && method === 'GET') {
    if (!env.DB) return jsonResponse({ findings: [] });
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ findings: [] });
    const storedUserId = canonicalAuthId || sessionUserId;
    const userScope = storedUserId != null ? String(storedUserId).trim() : '';
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, finding_type, severity, snippet_redacted, status, source_type, source_ref, created_at
         FROM security_findings
         WHERE tenant_id = ?
           AND (? = '' OR user_id IS NULL OR user_id = '' OR user_id = ?)
         ORDER BY created_at DESC
         LIMIT 100`,
      )
        .bind(tenantId, userScope, userScope)
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
      const resolvedClause =
        newStatus === 'false_positive' || newStatus === 'fixed'
          ? ', resolved_at = unixepoch()'
          : '';
      const out = await env.DB.prepare(
        `UPDATE security_findings
         SET status = ?, updated_at = unixepoch()${resolvedClause}
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
