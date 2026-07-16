/**
 * Session-scoped agent context — tools + write_policy + roots cached on AgentChatSqlV1.
 * Bootstrap once; chat messages reuse. No per-turn profile/classify.
 *
 * LAW: never dump full oauth_visible (~100+) into the in-app model loop —
 * that hangs the Worker after the first tool_call (CPU/stream death).
 * Catalog discovery stays OAuth/MCP-sized; in-app session uses a working spine.
 */
import { inputSchemaFromAgentsamToolRow } from './agentsam-tools-catalog.js';
import { normalizeAgentRuntimeMode } from './agent-mode.js';

/** Soft cap — above this, DO cache is treated as stale mega-catalog and rebuilt. */
export const SESSION_TOOL_CACHE_SOFT_MAX = 40;

/**
 * Curated in-app Agent session tools (proven lanes). Keep under SESSION_TOOL_CACHE_SOFT_MAX.
 * Full oauth_visible remains for ChatGPT/Claude MCP tools/list — not this path.
 */
export const SESSION_WORKING_TOOL_KEYS = Object.freeze([
  'agentsam_ping',
  'agentsam_d1_query',
  'agentsam_d1_write',
  'agentsam_github_tree',
  'agentsam_github_read',
  'agentsam_github_read_many',
  'agentsam_github_search',
  'agentsam_github_write',
  'agentsam_github_patch',
  'agentsam_github_list_commits',
  'agentsam_github_repo_list',
  'agentsam_terminal_local',
  'agentsam_terminal_remote',
  'agentsam_terminal_sandbox',
  'agentsam_memory_manager',
  'agentsam_r2_list',
  'agentsam_r2_get',
  'agentsam_cf_workers_list',
  'fs_read_file',
  'fs_search_files',
  'fs_edit_file',
  'agentsam_ticket_list',
  'agentsam_ticket_get',
  'agentsam_ticket_create',
]);

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

/**
 * Load curated working tools for in-app Agent session (not full oauth_visible dump).
 * @param {unknown} db
 */
export async function loadOauthVisibleToolsForSession(db) {
  if (!db?.prepare) return [];
  const keys = [...SESSION_WORKING_TOOL_KEYS];
  const placeholders = keys.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT tool_key, tool_name, description, input_schema, handler_config, tool_category,
              requires_approval, risk_level
       FROM agentsam_tools
       WHERE COALESCE(is_active, 1) = 1
         AND COALESCE(is_degraded, 0) = 0
         AND (tool_key IN (${placeholders}) OR tool_name IN (${placeholders}))
       ORDER BY COALESCE(sort_priority, 50) ASC, tool_name ASC
       LIMIT 40`,
    )
    .bind(...keys, ...keys)
    .all()
    .catch(() => ({ results: [] }));

  const byKey = new Map();
  for (const row of results || []) {
    const name = String(row.tool_name || row.tool_key || '').trim();
    if (!name) continue;
    const key = String(row.tool_key || name).trim();
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

  // Preserve SESSION_WORKING_TOOL_KEYS order for stable model menus.
  const ordered = [];
  for (const k of keys) {
    const hit = byKey.get(k) || [...byKey.values()].find((t) => t.name === k || t.tool_key === k);
    if (hit && !ordered.some((t) => t.tool_key === hit.tool_key)) {
      if (hit.tool_key === 'agentsam_d1_query' || hit.name === 'agentsam_d1_query') {
        hit.description =
          'Run read-only SQL on a Cloudflare D1 database in the caller\'s CF account. Pass database as the Cloudflare D1 *name* (from the account catalog), or omit database to use the workspace pin / account default. Never pass a SQL table name as database (e.g. agentsam is a table prefix, not a D1). On database_not_in_account, retry using a name from the returned available list.';
      }
      ordered.push(hit);
    }
  }
  return ordered;
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
  const stub = getAgentSessionStub(env, conversationId);

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
  };

  if (stub && !opts.forceRefresh) {
    const cached = await doGetSessionContext(stub).catch(() => null);
    const cachedCount = Array.isArray(cached?.tools) ? cached.tools.length : 0;
    // Stale mega-catalog (pre-spine) — rebuild so this conversation stops hanging.
    const cacheUsable =
      cached &&
      cachedCount > 0 &&
      cachedCount <= SESSION_TOOL_CACHE_SOFT_MAX &&
      String(cached.mode || '') === composerMode;
    if (cacheUsable) {
      const mergedRoots = { ...(cached.roots || {}), ...roots };
      if (JSON.stringify(mergedRoots) !== JSON.stringify(cached.roots || {})) {
        await doSetSessionContext(stub, cached.tools, cached.writePolicy, mergedRoots).catch(() => {});
      }
      console.info(
        '[agent-session-context] cache_hit',
        JSON.stringify({ conversationId, tools: cachedCount, mode: composerMode }),
      );
      return {
        tools: cached.tools,
        writePolicy: cached.writePolicy || writePolicyFromComposerMode(composerMode),
        roots: mergedRoots,
        mode: composerMode,
        fromCache: true,
      };
    }
    if (cachedCount > SESSION_TOOL_CACHE_SOFT_MAX) {
      console.info(
        '[agent-session-context] cache_invalidate_mega',
        JSON.stringify({ conversationId, tools: cachedCount, soft_max: SESSION_TOOL_CACHE_SOFT_MAX }),
      );
    }
  }

  const tools = await loadOauthVisibleToolsForSession(env.DB);
  const writePolicy = writePolicyFromComposerMode(composerMode);
  const rootsWithMode = { ...roots, mode: composerMode };
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
      fsa_root: roots.fsa_root === true,
    }),
  );
  return { tools, writePolicy, roots: rootsWithMode, mode: composerMode, fromCache: false };
}

/**
 * Minimal RuntimeProfile-shaped object for controllers — no compileModeProfile.
 * @param {{
 *   mode: string,
 *   tools: unknown[],
 *   writePolicy: Record<string, boolean>,
 *   modelKey: string|null,
 *   routingArmId?: string|null,
 * }} p
 */
export function buildSessionRuntimeProfile(p) {
  const mode = normalizeAgentRuntimeMode(p.mode) === 'auto' ? 'agent' : normalizeAgentRuntimeMode(p.mode);
  const { mode_controller, execution_kind } = modeControllerForComposerMode(mode);
  const tools = Array.isArray(p.tools) ? p.tools : [];
  const allowlist = tools.map((t) => String(t?.name || t?.tool_name || '').trim()).filter(Boolean);
  return {
    profile_id: `session@${mode}`,
    mode,
    mode_controller,
    execution_kind,
    model_key: p.modelKey,
    routing_arm_id: p.routingArmId ?? null,
    routing_task_type: mode,
    refined_route_key: mode,
    write_policy: p.writePolicy || writePolicyFromComposerMode(mode),
    tool_allowlist: allowlist,
    tool_denylist: [],
    tool_policy: { allowlist, denylist: [] },
    max_tools: Math.max(allowlist.length, 1),
    max_tool_calls: 32,
    max_turns: 12,
    temperature: 0.7,
    tool_capable_required: allowlist.length > 0,
    context_policy: { include_rag: false, include_memory: false },
    _compiled_tool_rows: tools,
    source: { compile_lane: 'session_context', session_scoped: true },
    color: mode === 'ask' ? 'green' : mode === 'plan' ? 'blue' : 'purple',
  };
}
