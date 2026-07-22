/**
 * Session-scoped agent context — tools + write_policy + roots cached on AgentChatSqlV1.
 * Bootstrap once; chat messages reuse. No per-turn profile/classify.
 *
 * LAW: never dump full oauth_visible (~100+) into the in-app model loop —
 * that hangs the Worker after the first tool_call (CPU/stream death).
 * Catalog discovery stays OAuth/MCP-sized; in-app session uses a working spine.
 *
 * SSOT: the in-app tool menu is agentsam_tool_profile_bindings (task_type -> profile_key)
 * joined to agentsam_tool_profiles (tool_keys_json). Editing the menu is a D1 UPDATE,
 * not a code deploy. EMERGENCY_FALLBACK_TOOL_KEYS below only fires if that D1 lookup
 * itself fails (row missing / DB unreachable) and always logs loudly when it does —
 * it is a degraded-mode safety net, not a second source of truth.
 */
import { inputSchemaFromAgentsamToolRow } from './agentsam-tools-catalog.js';
import {
  loadExecutableHandlerTypes,
  validateHandlerConfigForExecution,
  EXECUTABLE_HANDLER_TYPES,
} from './agentsam-tools-catalog.js';
import { parseHandlerConfig } from './resolve-credential.js';
import { normalizeAgentRuntimeMode } from './agent-mode.js';
import { parseWritePolicyJson } from './d1-tool-profile.js';
import { resolveSessionProfileTaskType } from './session-profile-task.js';
import { isDesignModeActiveFromBody } from './design-mode-context.js';

export { resolveSessionProfileTaskType } from './session-profile-task.js';
export { isDesignModeActiveFromBody, isDesignModeBrowserContext } from './design-mode-context.js';

/** Soft cap — above this, DO cache is treated as stale mega-catalog and rebuilt. */
export const SESSION_TOOL_CACHE_SOFT_MAX = 40;
/** Bump when session tool menu contract changes (e.g. progressive core vs full profile). */
export const SESSION_CONTEXT_VERSION = 11;

/**
 * Degraded-mode fallback ONLY — used when agentsam_tool_profile_bindings /
 * agentsam_tool_profiles cannot be read for the current mode. Every use of this
 * array is logged at warn level with reason=profile_lookup_failed so it shows up
 * in dashboards instead of silently becoming the permanent behavior again.
 */
export const EMERGENCY_FALLBACK_TOOL_KEYS = Object.freeze([
  'agentsam_cf_d1_list',
  'agentsam_d1_query',
  'agentsam_d1_write',
  'agentsam_cf_workers_list',
  'agentsam_r2_list',
  'agentsam_r2_get',
  'agentsam_github_repo_list',
  'agentsam_github_tree',
  'agentsam_github_read',
  'agentsam_github_read_many',
  'agentsam_github_search',
  'agentsam_github_write',
  'agentsam_github_patch',
  'agentsam_github_list_commits',
  'agentsam_terminal_local',
  'agentsam_terminal_remote',
  'agentsam_terminal_sandbox',
  'agentsam_memory_manager',
  'fs_read_file',
  'fs_search_files',
  'fs_edit_file',
  'pty_git_status',
  'search_web',
]);

/** Back-compat alias — do not add new call sites against this name. */
export const SESSION_WORKING_TOOL_KEYS = EMERGENCY_FALLBACK_TOOL_KEYS;

/**
 * @param {string} mode
 */
export function writePolicyFromComposerMode(mode) {
  const m = normalizeAgentRuntimeMode(mode);
  if (m === 'ask') {
    return {
      can_edit_files: false,
      can_terminal: false,
      can_d1_write: false,
      can_deploy: false,
      can_browser_automation: false,
      can_memory_write: false,
    };
  }
  if (m === 'plan') {
    return {
      can_edit_files: true,
      can_terminal: false,
      can_d1_write: false,
      can_deploy: false,
      can_browser_automation: false,
      can_memory_write: true,
    };
  }
  return {
    can_edit_files: true,
    can_terminal: true,
    can_d1_write: true,
    can_deploy: true,
    can_browser_automation: true,
    can_memory_write: true,
  };
}

/**
 * @param {string} mode
 */
export function modeControllerForComposerMode(mode) {
  const m = normalizeAgentRuntimeMode(mode);
  if (m === 'ask') return { mode_controller: 'ask_controller', execution_kind: 'ask_turn' };
  if (m === 'plan') return { mode_controller: 'plan_controller', execution_kind: 'plan_pipeline' };
  if (m === 'debug') return { mode_controller: 'debug_controller', execution_kind: 'debug_investigation_loop' };
  if (m === 'multitask') return { mode_controller: 'multitask_controller', execution_kind: 'multitask_fanout' };
  return { mode_controller: 'agent_controller', execution_kind: 'agent_tool_loop' };
}

function parseJsonArraySafe(raw, fallback = []) {
  if (raw == null || raw === '') return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.map((x) => String(x).trim()).filter(Boolean) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * D1-SSOT profile lookup: task_type (composer mode) -> profile_key -> tool_keys_json.
 * Falls back to profile_key='default_route', then to null (caller uses EMERGENCY_FALLBACK_TOOL_KEYS).
 * @param {unknown} db
 * @param {string} composerMode
 */
export async function loadToolProfileForMode(db, composerMode) {
  if (!db?.prepare) return null;
  const mode = String(composerMode || '').trim().toLowerCase();
  if (!mode) return null;
  try {
    const row = await db
      .prepare(
        `SELECT p.profile_key, p.tool_keys_json, p.max_tools, p.write_policy_json,
                p.updated_at AS profile_updated_at, b.updated_at AS binding_updated_at,
                b.force_first_tool AS force_first_tool
         FROM agentsam_tool_profile_bindings b
         JOIN agentsam_tool_profiles p ON p.profile_key = b.profile_key AND COALESCE(p.is_active, 1) = 1
         WHERE b.task_type = ? AND COALESCE(b.is_active, 1) = 1
         ORDER BY b.priority ASC
         LIMIT 1`,
      )
      .bind(mode)
      .first()
      .catch(() => null);
    if (row) {
      return {
        profile_key: row.profile_key,
        tool_keys: parseJsonArraySafe(row.tool_keys_json, []),
        max_tools: Number(row.max_tools) > 0 ? Number(row.max_tools) : SESSION_TOOL_CACHE_SOFT_MAX,
        write_policy: parseWritePolicyJson(row.write_policy_json),
        force_first_tool: String(row.force_first_tool || '').trim() || null,
        profile_revision: `${Number(row.binding_updated_at) || 0}:${Number(row.profile_updated_at) || 0}`,
      };
    }
  } catch (e) {
    console.warn('[agent-session-context] profile_binding_query_failed', mode, e?.message ?? e);
  }

  // Named binding missing — try the explicit default_route profile before giving up.
  try {
    const row = await db
      .prepare(
        `SELECT profile_key, tool_keys_json, max_tools, write_policy_json, updated_at
         FROM agentsam_tool_profiles
         WHERE profile_key = 'default_route' AND COALESCE(is_active, 1) = 1
         LIMIT 1`,
      )
      .first()
      .catch(() => null);
    const keys = parseJsonArraySafe(row?.tool_keys_json, []);
    if (row && keys.length) {
      return {
        profile_key: row.profile_key,
        tool_keys: keys,
        max_tools: Number(row.max_tools) > 0 ? Number(row.max_tools) : SESSION_TOOL_CACHE_SOFT_MAX,
        write_policy: parseWritePolicyJson(row.write_policy_json),
        profile_revision: `default:${Number(row.updated_at) || 0}`,
      };
    }
  } catch (e) {
    console.warn('[agent-session-context] default_route_query_failed', e?.message ?? e);
  }

  return null;
}

/**
 * @param {unknown} env Worker env bindings (needs env.DB, optionally env.SESSION_CACHE)
 * @param {string} composerMode
 * @returns {Promise<{ tools: unknown[], profile_key: string|null, profile_task_type: string }>}
 */
export async function loadOauthVisibleToolsForSession(env, composerMode, resolvedProfile = null) {
  const db = env?.DB ?? env; // back-compat: earlier signature took `db` directly
  const profileTaskType = String(composerMode || 'agent').trim().toLowerCase() || 'agent';
  if (!db?.prepare) {
    return { tools: [], profile_key: null, profile_task_type: profileTaskType };
  }

  const profile = resolvedProfile || await loadToolProfileForMode(db, profileTaskType);
  let keys = profile?.tool_keys?.length ? profile.tool_keys : null;
  const maxTools = profile?.max_tools || SESSION_TOOL_CACHE_SOFT_MAX;

  if (!keys) {
    console.warn(
      '[agent-session-context] profile_lookup_failed_using_emergency_fallback',
      JSON.stringify({ composerMode: profileTaskType, reason: 'no_active_binding_or_profile' }),
    );
    keys = [...EMERGENCY_FALLBACK_TOOL_KEYS];
  }

  const placeholders = keys.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT tool_key, tool_name, description, input_schema, handler_config, tool_category,
              handler_type, requires_approval, risk_level
       FROM agentsam_tools
       WHERE COALESCE(is_active, 1) = 1
         AND COALESCE(is_degraded, 0) = 0
         AND (tool_key IN (${placeholders}) OR tool_name IN (${placeholders}))
       ORDER BY COALESCE(sort_priority, 50) ASC, tool_name ASC
       LIMIT ?`,
    )
    .bind(...keys, ...keys, Math.min(maxTools, SESSION_TOOL_CACHE_SOFT_MAX))
    .all()
    .catch(() => ({ results: [] }));

  const executableTypes = await loadExecutableHandlerTypes(env?.DB ? env : { DB: db }).catch(
    () => EXECUTABLE_HANDLER_TYPES,
  );

  const byKey = new Map();
  for (const row of results || []) {
    const name = String(row.tool_name || row.tool_key || '').trim();
    if (!name) continue;
    const key = String(row.tool_key || name).trim();

    // Fail closed: no executor branch for this handler_type -> never offer it to the model.
    const cfg = parseHandlerConfig(row.handler_config);
    const v = validateHandlerConfigForExecution(row, cfg, executableTypes || EXECUTABLE_HANDLER_TYPES);
    if (!v.ok) {
      console.warn('[agent-session-context] skip_unexecutable_tool', key, v.error);
      continue;
    }

    byKey.set(key, {
      name,
      tool_name: name,
      tool_key: key,
      description: String(row.description || name).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: row.tool_category != null ? String(row.tool_category) : null,
      requires_approval: Number(row.requires_approval || 0) === 1,
      risk_level: row.risk_level != null ? String(row.risk_level) : null,
    });
  }

  // Preserve D1 profile key order for stable model menus.
  const ordered = [];
  for (const k of keys) {
    const hit = byKey.get(k) || [...byKey.values()].find((t) => t.name === k || t.tool_key === k);
    if (hit && !ordered.some((t) => t.tool_key === hit.tool_key)) {
      ordered.push(hit);
    }
  }
  return {
    tools: ordered,
    profile_key: profile?.profile_key || null,
    profile_task_type: profileTaskType,
    write_policy: profile?.write_policy || {},
    profile_revision: profile?.profile_revision || null,
    force_first_tool: profile?.force_first_tool || null,
  };
}

/**
 * @param {unknown} env
 * @param {string} conversationId
 */
export function getAgentSessionStub(env, conversationId) {
  if (!env?.AGENT_SESSION) return null;
  const convId = String(conversationId || '').trim();
  if (!convId) return null;
  return env.AGENT_SESSION.get(env.AGENT_SESSION.idFromName(convId));
}

/**
 * @param {any} stub
 * @param {unknown} tools
 * @param {unknown} writePolicy
 * @param {unknown} roots
 */
export async function doSetSessionContext(stub, tools, writePolicy, roots) {
  if (!stub) return { ok: false, reason: 'no_stub' };
  if (typeof stub.setSessionContext === 'function') {
    return stub.setSessionContext(tools, writePolicy, roots);
  }
  const resp = await stub.fetch(
    new Request('https://do/session-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tools, writePolicy, roots }),
    }),
  );
  if (!resp.ok) return { ok: false, reason: `do_${resp.status}` };
  return resp.json().catch(() => ({ ok: true }));
}

/**
 * @param {any} stub
 */
export async function doGetSessionContext(stub) {
  if (!stub) return null;
  if (typeof stub.getSessionContext === 'function') {
    return stub.getSessionContext();
  }
  const resp = await stub.fetch(new Request('https://do/session-context', { method: 'GET' }));
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  if (!data || data.empty) return null;
  return data;
}

/**
 * @param {any} stub
 * @param {string} callId
 * @param {{ timeoutMs?: number }} [opts]
 */
export async function doWaitForFsaFulfill(stub, callId, opts = {}) {
  if (!stub) throw new Error('fsa_no_session_do');
  if (typeof stub.waitForFsaFulfill === 'function') {
    return stub.waitForFsaFulfill(callId, opts);
  }
  const resp = await stub.fetch(
    new Request('https://do/fsa/wait', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, timeoutMs: opts.timeoutMs ?? 90000 }),
    }),
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `fsa_wait_${resp.status}`);
  }
  return resp.json();
}

/**
 * @param {any} stub
 * @param {string} callId
 * @param {unknown} result
 */
export async function doFulfillFsaRequest(stub, callId, result) {
  if (!stub) return { ok: false, reason: 'no_stub' };
  if (typeof stub.fulfillFsaRequest === 'function') {
    return stub.fulfillFsaRequest(callId, result);
  }
  const resp = await stub.fetch(
    new Request('https://do/fsa/fulfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, result }),
    }),
  );
  if (!resp.ok) return { ok: false, reason: `do_${resp.status}` };
  return resp.json().catch(() => ({ ok: true }));
}

/**
 * @param {unknown} env
 * @param {{
 *   conversationId: string,
 *   mode: string,
 *   workspaceId?: string|null,
 *   body?: Record<string, unknown>,
 *   activeFileEnvelope?: Record<string, unknown>|null,
 *   forceRefresh?: boolean,
 * }} opts
 */
export async function loadOrBootstrapSessionContext(env, opts) {
  const conversationId = String(opts.conversationId || '').trim();
  const mode = normalizeAgentRuntimeMode(opts.mode);
  const composerMode = mode === 'auto' ? 'agent' : mode;
  let profileTaskType = resolveSessionProfileTaskType(composerMode, opts.body);
  const stub = getAgentSessionStub(env, conversationId);
  const requestedRouteKey = String(
    opts.body?.route_key || opts.body?.routeKey || '',
  ).trim().toLowerCase();
  const requestedTaskType = String(opts.body?.task_type || opts.body?.taskType || '')
    .trim()
    .toLowerCase();
  const designModeActive = isDesignModeActiveFromBody(opts.body || null);
  const explicitProfileHint =
    requestedTaskType !== '' ||
    designModeActive ||
    profileTaskType === 'design_mode' ||
    (requestedRouteKey !== '' &&
      requestedRouteKey !== 'auto' &&
      requestedRouteKey !== composerMode);

  const truthyFlag = (v) =>
    v === true || v === 1 || v === '1' || String(v || '').trim().toLowerCase() === 'true';
  const roots = {
    fsa_root:
      truthyFlag(opts.body?.local_fsa_connected) ||
      truthyFlag(opts.body?.fsa_root) ||
      String(opts.activeFileEnvelope?.source || '').toLowerCase() === 'local' ||
      String(opts.body?.active_file_source || '').toLowerCase() === 'local',
    source: opts.activeFileEnvelope?.source || opts.body?.active_file_source || null,
    path:
      opts.activeFileEnvelope?.path ||
      opts.activeFileEnvelope?.workspace_path ||
      opts.body?.active_file_path ||
      null,
    github_repo:
      opts.activeFileEnvelope?.github_repo ||
      opts.body?.selectedGithubRepoContext ||
      opts.body?.github_repo_context ||
      null,
    workspace_id: opts.workspaceId || null,
    profile_task_type: profileTaskType,
    route_key: requestedRouteKey || null,
    context_version: SESSION_CONTEXT_VERSION,
  };

  if (stub && !opts.forceRefresh) {
    const cached = await doGetSessionContext(stub).catch(() => null);
    const cachedCount = Array.isArray(cached?.tools) ? cached.tools.length : 0;
    const cachedKeys = new Set(
      (Array.isArray(cached?.tools) ? cached.tools : [])
        .map((t) => String(t?.tool_key || t?.name || '').trim())
        .filter(Boolean),
    );
    const cachedProfileTask =
      String(cached?.roots?.profile_task_type || cached?.profile_task_type || '').trim().toLowerCase();
    const cachedContextVersion = Number(cached?.roots?.context_version || 0);
    // Drop cached design_mode when Browser Design Mode is off; otherwise sticky cache
    // would keep the UI-edit kit after the user toggles Design Mode off.
    if (cachedProfileTask === 'design_mode' && !designModeActive && profileTaskType !== 'design_mode') {
      /* keep freshly resolved profileTaskType */
    } else if (!explicitProfileHint && cachedProfileTask) {
      profileTaskType = cachedProfileTask;
      roots.profile_task_type = cachedProfileTask;
      roots.route_key = cached?.roots?.route_key || null;
    }
    if (designModeActive) {
      profileTaskType = 'design_mode';
      roots.profile_task_type = 'design_mode';
    }
    const currentProfile = await loadToolProfileForMode(env?.DB, profileTaskType);
    const currentProfileKey = String(currentProfile?.profile_key || '').trim();
    const cachedProfileKey = String(cached?.roots?.profile_key || '').trim();
    const currentProfileRevision = String(currentProfile?.profile_revision || '').trim();
    const cachedProfileRevision = String(cached?.roots?.profile_revision || '').trim();
    const isDatabaseProfile =
      profileTaskType === 'database_studio' ||
      profileTaskType === 'database_schema' ||
      profileTaskType === 'd1_query' ||
      profileTaskType === 'supabase_query' ||
      profileTaskType === 'supabase_write';
    const requiresCfCatalog =
      profileTaskType === composerMode &&
      !isDatabaseProfile &&
      (composerMode === 'agent' || composerMode === 'multitask' || composerMode === 'debug');
    // Progressive discovery (v10+): core menu must include search_tools — not the old CF dump.
    let progressiveSession = false;
    try {
      const { modeUsesProgressiveToolDiscovery } = await import('./progressive-tool-discovery.js');
      progressiveSession = modeUsesProgressiveToolDiscovery(composerMode);
    } catch {
      progressiveSession = false;
    }
    const missingCfList =
      requiresCfCatalog &&
      !progressiveSession &&
      !cachedKeys.has('agentsam_cf_d1_list');
    const missingSearchTools =
      requiresCfCatalog && progressiveSession && !cachedKeys.has('agentsam_search_tools');
    const missingWebSearch = requiresCfCatalog && !cachedKeys.has('search_web');
    const missingSupabaseRead = isDatabaseProfile && !cachedKeys.has('agentsam_supabase_query');
    const missingSupabaseWrite = isDatabaseProfile && !cachedKeys.has('agentsam_supabase_write');
    // Progressive core omits d1_query (discover via search_tools); do not invalidate for that.
    const missingD1Query =
      isDatabaseProfile && !progressiveSession && !cachedKeys.has('agentsam_d1_query');
    const cacheUsable =
      cached &&
      cachedCount > 0 &&
      cachedCount <= SESSION_TOOL_CACHE_SOFT_MAX &&
      cachedContextVersion === SESSION_CONTEXT_VERSION &&
      String(cached.mode || '') === composerMode &&
      cachedProfileTask === profileTaskType &&
      cachedProfileKey === currentProfileKey &&
      cachedProfileRevision === currentProfileRevision &&
      !missingCfList &&
      !missingSearchTools &&
      !missingWebSearch &&
      !missingSupabaseRead &&
      !missingSupabaseWrite &&
      !missingD1Query;
    if (cacheUsable) {
      let cachedTools = cached.tools;
      // Belt: never serve a mega menu for progressive modes even if an old DO blob slipped through.
      if (progressiveSession && Array.isArray(cachedTools) && cachedTools.length > 12) {
        try {
          const { applyProgressiveCoreCompile } = await import('./progressive-tool-discovery.js');
          const prog = await applyProgressiveCoreCompile(env, {
            mode: composerMode,
            compiledToolRows: cachedTools,
            toolAllowlist: cachedTools
              .map((t) => String(t?.name || t?.tool_name || '').trim())
              .filter(Boolean),
          });
          if (prog.progressive) {
            cachedTools = prog.compiledToolRows;
            await doSetSessionContext(stub, cachedTools, cached.writePolicy, {
              ...(cached.roots || {}),
              ...roots,
              progressive_tool_discovery: true,
            }).catch(() => {});
          }
        } catch (e) {
          console.warn('[agent-session-context] progressive_cache_shrink', e?.message ?? e);
        }
      }
      const mergedRoots = {
        ...(cached.roots || {}),
        ...roots,
        ...(progressiveSession ? { progressive_tool_discovery: true } : {}),
      };
      if (JSON.stringify(mergedRoots) !== JSON.stringify(cached.roots || {})) {
        await doSetSessionContext(stub, cachedTools, cached.writePolicy, mergedRoots).catch(() => {});
      }
      console.info(
        '[agent-session-context] cache_hit',
        JSON.stringify({
          conversationId,
          tools: Array.isArray(cachedTools) ? cachedTools.length : cachedCount,
          mode: composerMode,
          profile_task_type: profileTaskType,
          progressive: progressiveSession,
        }),
      );
      return {
        tools: cachedTools,
        writePolicy: cached.writePolicy || writePolicyFromComposerMode(composerMode),
        roots: mergedRoots,
        mode: composerMode,
        profile_task_type: profileTaskType,
        profile_key: cached?.roots?.profile_key || null,
        fromCache: true,
      };
    }
    if (
      (missingCfList ||
        missingSearchTools ||
        missingWebSearch ||
        missingSupabaseRead ||
        missingSupabaseWrite ||
        missingD1Query ||
        cachedProfileKey !== currentProfileKey ||
        cachedProfileRevision !== currentProfileRevision ||
        (cachedProfileTask && cachedProfileTask !== profileTaskType)) &&
      cachedCount > 0
    ) {
      const missing = [
        missingCfList ? 'agentsam_cf_d1_list' : null,
        missingSearchTools ? 'agentsam_search_tools' : null,
        missingWebSearch ? 'search_web' : null,
        missingSupabaseRead ? 'agentsam_supabase_query' : null,
        missingSupabaseWrite ? 'agentsam_supabase_write' : null,
        missingD1Query ? 'agentsam_d1_query' : null,
        cachedProfileKey !== currentProfileKey
          ? `profile_key:${cachedProfileKey || '(none)'}->${currentProfileKey || '(none)'}`
          : null,
        cachedProfileRevision !== currentProfileRevision
          ? `profile_revision:${cachedProfileRevision || '(none)'}->${currentProfileRevision || '(none)'}`
          : null,
        cachedProfileTask && cachedProfileTask !== profileTaskType
          ? `profile_task_type:${cachedProfileTask}->${profileTaskType}`
          : null,
      ].filter(Boolean);
      console.info(
        '[agent-session-context] cache_invalidate_profile_upgrade',
        JSON.stringify({
          conversationId,
          tools: cachedCount,
          missing,
        }),
      );
    }
    if (cachedCount > SESSION_TOOL_CACHE_SOFT_MAX) {
      console.info(
        '[agent-session-context] cache_invalidate_mega',
        JSON.stringify({ conversationId, tools: cachedCount, soft_max: SESSION_TOOL_CACHE_SOFT_MAX }),
      );
    }
  }

  const resolvedProfile = await loadToolProfileForMode(env?.DB, profileTaskType);
  const loaded = await loadOauthVisibleToolsForSession(env, profileTaskType, resolvedProfile);
  let tools = Array.isArray(loaded?.tools) ? loaded.tools : [];
  let progressiveBootstrap = false;
  try {
    const { applyProgressiveCoreCompile, modeUsesProgressiveToolDiscovery } = await import(
      './progressive-tool-discovery.js'
    );
    if (modeUsesProgressiveToolDiscovery(composerMode) && env?.DB) {
      const prog = await applyProgressiveCoreCompile(env, {
        mode: composerMode,
        compiledToolRows: tools,
        toolAllowlist: tools.map((t) => String(t?.name || t?.tool_name || '').trim()).filter(Boolean),
      });
      if (prog.progressive) {
        progressiveBootstrap = true;
        tools = prog.compiledToolRows;
      }
    }
  } catch (e) {
    console.warn('[agent-session-context] progressive_bootstrap', e?.message ?? e);
  }
  const writePolicy = {
    ...writePolicyFromComposerMode(composerMode),
    ...(loaded?.write_policy || {}),
  };
  const rootsWithMode = {
    ...roots,
    mode: composerMode,
    profile_task_type: profileTaskType,
    profile_key: loaded?.profile_key || null,
    profile_revision: loaded?.profile_revision || null,
    force_first_tool: loaded?.force_first_tool || null,
    ...(progressiveBootstrap ? { progressive_tool_discovery: true } : {}),
  };
  if (stub) {
    await doSetSessionContext(stub, tools, writePolicy, rootsWithMode).catch((e) => {
      console.warn('[agent-session-context] set_failed', e?.message ?? e);
    });
  }
  console.info(
    '[agent-session-context] bootstrap',
    JSON.stringify({
      conversationId,
      tools: tools.length,
      mode: composerMode,
      profile_task_type: profileTaskType,
      profile_key: loaded?.profile_key || null,
      fsa_root: roots.fsa_root === true,
      progressive: progressiveBootstrap,
    }),
  );
  return {
    tools,
    writePolicy,
    roots: rootsWithMode,
    mode: composerMode,
    profile_task_type: profileTaskType,
    profile_key: loaded?.profile_key || null,
    fromCache: false,
  };
}

/**
 * Minimal RuntimeProfile-shaped object for controllers — no compileModeProfile.
 * @param {{
 *   mode: string,
 *   tools: unknown[],
 *   writePolicy: Record<string, boolean>,
 *   modelKey: string|null,
 *   routingArmId?: string|null,
 *   routingSelectedBy?: string|null,
 *   profileTaskType?: string|null,
 *   profileKey?: string|null,
 *   routeKey?: string|null,
 * }} p
 */
export function buildSessionRuntimeProfile(p) {
  const mode = normalizeAgentRuntimeMode(p.mode) === 'auto' ? 'agent' : normalizeAgentRuntimeMode(p.mode);
  const { mode_controller, execution_kind } = modeControllerForComposerMode(mode);
  const tools = Array.isArray(p.tools) ? p.tools : [];
  const allowlist = tools.map((t) => String(t?.name || t?.tool_name || '').trim()).filter(Boolean);
  const profileTaskType = String(p.profileTaskType || mode).trim() || mode;
  const profileKey = String(p.profileKey || '').trim() || null;
  const progressive =
    p.progressive === true ||
    ['agent', 'debug', 'multitask'].includes(mode);
  return {
    profile_id: profileKey ? `session@${profileKey}` : `session@${mode}`,
    mode,
    mode_controller,
    execution_kind,
    model_key: p.modelKey,
    routing_arm_id: p.routingArmId ?? null,
    routing_selected_by: p.routingSelectedBy ?? null,
    routing_task_type: profileTaskType,
    refined_route_key: String(p.routeKey || '').trim() || profileTaskType,
    write_policy: p.writePolicy || writePolicyFromComposerMode(mode),
    tool_allowlist: allowlist,
    tool_denylist: [],
    // Progressive: empty allowlist (option a) — write_policy is the mutate gate.
    tool_policy: { allowlist: progressive ? [] : allowlist, denylist: [] },
    max_tools: Math.max(allowlist.length, 1),
    max_tool_calls: 32,
    max_turns: 12,
    temperature: 0.7,
    tool_capable_required: allowlist.length > 0,
    context_policy: { include_rag: false, include_memory: false },
    _compiled_tool_rows: tools,
    _progressive_tool_discovery: progressive,
    source: {
      compile_lane: 'session_context',
      session_scoped: true,
      profile_key: profileKey,
      profile_task_type: profileTaskType,
      route_key: String(p.routeKey || '').trim() || null,
      progressive_tool_discovery: progressive,
    },
    color: mode === 'ask' ? 'green' : mode === 'plan' ? 'blue' : 'purple',
  };
}
