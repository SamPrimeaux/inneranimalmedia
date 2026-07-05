/**
 * User App runtime lane — project context SSOT + lightweight profile compile.
 * Cursor-shaped: open repo is context, user credential is permission, session is boundary.
 * Skips compileModeProfile / OAuth parity scan / intent→D1 route compile on dashboard chat.
 */
import { normalizeAgentRuntimeMode, AGENT_MODE_CONTRACT } from './agent-mode.js';
import {
  resolveModeController,
  resolveExecutionKind,
  defaultWritePolicyForMode,
  defaultParallelPolicyForMode,
  hashRuntimeProfile,
} from './runtime-profile.js';
import { RUNTIME_PROFILE_VERSION } from './runtime-profile.types.js';
import { selectInAppAgentSpineToolsForAgentChat } from './in-app-agent-spine.js';
import { sanitizeGithubRepoContextForChat } from './github-repo-scope.js';
import { authUserIsSuperadmin } from './auth.js';

export const RUNTIME_LANE_USER_APP = 'user_app';
export const RUNTIME_LANE_TENANT_SAAS = 'tenant_saas';
export const USER_APP_DEFAULT_MODEL = 'gpt-5.4-mini';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @typedef {{ github_repo?: string|null, branch?: string|null, active_file?: string|null, client_authority?: boolean }} ProjectContext
 */

/**
 * Parse `project` from chat body (JSON object or string). Returns null when absent.
 * @param {Record<string, unknown>|null|undefined} body
 * @returns {ProjectContext|null}
 */
export function parseProjectContextFromBody(body) {
  if (!body || typeof body !== 'object') return null;
  const raw = body.project ?? body.projectContext ?? body.project_context;
  if (raw == null || raw === '') return null;

  /** @type {Record<string, unknown>} */
  let obj;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  } else if (typeof raw === 'object') {
    obj = /** @type {Record<string, unknown>} */ (raw);
  } else {
    return null;
  }

  const github_repo = trim(obj.github_repo ?? obj.githubRepo ?? obj.repo);
  const branch = trim(obj.branch ?? obj.github_branch ?? obj.githubBranch) || 'main';
  const active_file = trim(
    obj.active_file ?? obj.activeFile ?? obj.active_path ?? obj.activePath ?? obj.github_path,
  );

  return {
    github_repo: github_repo || null,
    branch,
    active_file: active_file || null,
    client_authority: true,
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} body
 * @param {Record<string, unknown>|null|undefined} [pre]
 */
export function resolveRuntimeLane(body, pre = {}) {
  const raw = trim(body?.runtime_lane ?? body?.runtimeLane ?? pre?.runtimeLane);
  if (raw === RUNTIME_LANE_TENANT_SAAS) return RUNTIME_LANE_TENANT_SAAS;
  if (raw === RUNTIME_LANE_USER_APP) return RUNTIME_LANE_USER_APP;
  return RUNTIME_LANE_TENANT_SAAS;
}

/**
 * @param {Record<string, unknown>|null|undefined} body
 * @param {Record<string, unknown>|null|undefined} [pre]
 */
export function shouldUseUserAppRuntimeLane(body, pre = {}) {
  return resolveRuntimeLane(body, pre) === RUNTIME_LANE_USER_APP;
}

/**
 * Normalize owner/repo for chat context. Superadmin may use any explicit repo path.
 * @param {string} repo
 * @param {boolean} isSuperadmin
 */
function normalizeProjectGithubRepo(repo, isSuperadmin) {
  const s = trim(repo).replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '');
  if (!s || !s.includes('/')) return null;
  if (isSuperadmin) return s;
  return s;
}

/**
 * Resolve github repo for chat — project context wins over workspace D1 SSOT.
 * @param {any} env
 * @param {{
 *   body?: Record<string, unknown>|null,
 *   projectContext?: ProjectContext|null,
 *   activeFileEnvelope?: Record<string, unknown>|null,
 *   userId?: string|null,
 *   tenantId?: string|null,
 *   workspaceId?: string|null,
 *   isSuperadmin?: boolean,
 * }} input
 * @returns {Promise<string|null>}
 */
export async function resolveChatGithubRepoContext(env, input) {
  const userId = trim(input.userId);
  const tenantId = trim(input.tenantId);
  const workspaceId = trim(input.workspaceId);
  const isSuperadmin = input.isSuperadmin === true;
  const project = input.projectContext ?? parseProjectContextFromBody(input.body ?? null);
  const clientProjectSent = project?.client_authority === true;

  let candidate = trim(project?.github_repo);
  if (!candidate) {
    candidate = trim(input.body?.github_repo_context ?? input.body?.githubRepoContext);
  }
  if (!candidate) {
    candidate = trim(input.activeFileEnvelope?.github_repo);
  }

  if (!candidate && !clientProjectSent && workspaceId && env?.DB) {
    try {
      const { resolveGithubRepoForChatSession } = await import('./agentsam-chat-sessions.js');
      candidate =
        trim(
          await resolveGithubRepoForChatSession(env, {
            workspaceId,
            activeFileEnvelope: input.activeFileEnvelope ?? null,
            body: null,
          }),
        ) || '';
    } catch (e) {
      console.warn('[user-app-runtime] workspace_github_repo_fallback', e?.message ?? e);
    }
  }

  if (!candidate) return null;

  const normalized = normalizeProjectGithubRepo(candidate, isSuperadmin);
  if (!normalized) return null;

  if (isSuperadmin) return normalized;

  if (!userId) return null;

  try {
    const safe = await sanitizeGithubRepoContextForChat(env, {
      userId,
      tenantId: tenantId || null,
      workspaceId: workspaceId || null,
      clientRepo: normalized,
    });
    return safe || null;
  } catch (e) {
    console.warn('[user-app-runtime] github_repo_sanitize', e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
async function loadWorkspaceDefaultModel(env, workspaceId) {
  const ws = trim(workspaceId);
  if (!env?.DB || !ws) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT default_model_id FROM agentsam_workspace WHERE id = ? LIMIT 1`,
    )
      .bind(ws)
      .first();
    const model = trim(row?.default_model_id);
    return model || null;
  } catch {
    return null;
  }
}

/**
 * Lightweight RuntimeProfile for dashboard user_app lane (no compileModeProfile).
 * @param {any} env
 * @param {import('./runtime-profile.types.js').ResolveRuntimeProfileInput & {
 *   projectContext?: ProjectContext|null,
 *   requireVision?: boolean,
 *   isSuperadmin?: boolean,
 * }} input
 */
export async function compileUserAppRuntimeProfile(env, input) {
  const mode = /** @type {Exclude<import('./agent-mode.js').AgentMode, 'auto'>} */ (
    normalizeAgentRuntimeMode(input.mode) === 'auto' ? 'agent' : normalizeAgentRuntimeMode(input.mode)
  );
  const message = trim(input.message);
  const session = input.session || {};
  const workspaceId = trim(session.workspaceId);
  const userId = trim(session.userId);
  const tenantId = trim(session.tenantId);
  const overrides = input.overrides || {};
  const isSuperadmin =
    input.isSuperadmin === true ||
    session.isSuperadmin === true ||
    authUserIsSuperadmin(session.authUser);

  const modelOverrideRaw = trim(overrides.model_key);
  const isAutoModel = !modelOverrideRaw || modelOverrideRaw.toLowerCase() === 'auto';

  let compiledToolRows = [];
  let toolAllowlist = [];

  if (env?.DB && workspaceId && userId) {
    const executionMode = mode === 'agent' || mode === 'debug' || mode === 'multitask';
    if (executionMode) {
      const { selectOAuthMcpParityToolsForAgentChat, IN_APP_MCP_PARITY_TOOL_LIMIT } = await import(
        './in-app-mcp-oauth-parity.js'
      );
      const det = await selectOAuthMcpParityToolsForAgentChat(
        env.DB,
        { userId, tenantId, workspaceId, isSuperadmin },
        {
          modeSlug: mode,
          outputLimit: IN_APP_MCP_PARITY_TOOL_LIMIT,
          isSuperadmin,
        },
      );
      compiledToolRows = det.rows || [];
    } else {
      const spine = await selectInAppAgentSpineToolsForAgentChat(
        env.DB,
        { userId, tenantId, workspaceId, isSuperadmin },
        { modeSlug: mode, outputLimit: 8 },
      );
      compiledToolRows = spine.rows || [];
    }
    toolAllowlist = compiledToolRows
      .map((r) => trim(r?.name || r?.tool_key || r?.tool_name))
      .filter(Boolean);
  }

  const modeContract = AGENT_MODE_CONTRACT[mode] || AGENT_MODE_CONTRACT.agent;
  const routeKey = 'user_app';

  /** @type {import('./runtime-profile.types.js').RuntimeProfile} */
  const profile = {
    mode,
    mode_controller: resolveModeController(mode),
    profile_id: `user_app_${mode}`,
    profile_hash: '',
    profile_version: RUNTIME_PROFILE_VERSION,
    system_prompt_key: 'user_app',
    system_prompt_inline: null,
    prompt_layers: ['user_app', mode],
    tool_allowlist: toolAllowlist,
    tool_denylist: [],
    tool_require_approval: [],
    tool_policy: {
      allowlist: toolAllowlist,
      denylist: [],
      require_approval: [],
      max_tool_calls: 15,
      max_runtime_ms: 90000,
    },
    max_tools: toolAllowlist.length,
    max_tool_calls: 15,
    max_turns: 6,
    max_runtime_ms: 90000,
    write_policy: defaultWritePolicyForMode(mode),
    workflow_key: null,
    execution_kind: resolveExecutionKind(mode),
    context_policy: {
      include_rag: false,
      include_memory: false,
      include_workspace: false,
      fresh_thread_recommended: false,
    },
    routing_task_type: mode,
    model_key: null,
    routing_arm_id: null,
    temperature: 0.7,
    parallel_policy: defaultParallelPolicyForMode(mode),
    debug_policy: mode === 'debug' ? { evidence_required_before_write: true, evidence_required_before_deploy: true, phase: 'inspect' } : null,
    source: {
      prompt_route_id: null,
      route_requirements_id: null,
      compiled_at: Date.now(),
      compile_lane: 'live',
    },
    refined_route_key: routeKey,
    color: modeContract.color || 'blue',
    tool_profile: 'execution',
    tool_capable_required: toolAllowlist.length > 0,
    selected_provider: null,
    _compiled_tool_rows: compiledToolRows,
    _runtime_lane: RUNTIME_LANE_USER_APP,
    _project_context: input.projectContext ?? null,
  };

  let modelKey = isAutoModel ? null : modelOverrideRaw;
  if (!modelKey) {
    modelKey = (await loadWorkspaceDefaultModel(env, workspaceId)) || USER_APP_DEFAULT_MODEL;
  }
  profile.model_key = modelKey;

  if (input.requireVision === true && env?.DB && workspaceId) {
    const { resolveProfileModel } = await import('./runtime-profile.js');
    await resolveProfileModel(env, profile, {
      workspaceId,
      tenantId,
      requestedModel: modelOverrideRaw || modelKey,
      requireTools: toolAllowlist.length > 0,
      requireVision: true,
    });
  }

  profile.profile_hash = await hashRuntimeProfile(profile);
  console.info(
    '[user-app-runtime] compiled',
    JSON.stringify({
      mode: profile.mode,
      model_key: profile.model_key,
      tool_count: toolAllowlist.length,
      project_repo: input.projectContext?.github_repo ?? null,
      message_len: message.length,
    }),
  );
  return profile;
}
