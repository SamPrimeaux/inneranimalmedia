/**
 * User App runtime lane — project context SSOT + dashboard lane name.
 *
 * `user_app` is the lane the dashboard sends (runtime_lane=user_app). It is NOT a compile
 * bypass: compileUserAppRuntimeProfile delegates to resolveRuntimeProfile → classifyIntent →
 * compileModeProfile (prompt routes + route_requirements + route-scoped tools).
 *
 * Naming: `tenant_saas` means "full compile path," not a second company. Session tenant_id /
 * workspace_id are unchanged either way.
 */
import { normalizeAgentRuntimeMode } from './agent-mode.js';
import { stripCasualIntentMessage } from './runtime-profile.js';
import { sanitizeGithubRepoContextForChat } from './github-repo-scope.js';
import { authUserIsSuperadmin } from './auth.js';
import { parseSessionProjectIdFromChatBody } from './project-chat-link.js';
import { askDataPlaneIntent, codeContextIntent } from './ask-evidence-tools.js';

/** Project-scoped read-only Q&A — memory + Vectorize inline; keeps composer mode (Agent/Ask). */
export const USER_APP_PROJECT_QNA_ROUTE = 'project_qna_fast';

/**
 * Classify intent on the user's turn only — ignore client-prepended project memory/instructions.
 * @param {string} message
 */
export function stripProjectScopedIntentMessage(message) {
  let s = stripCasualIntentMessage(message);
  const parts = s.split(/\r?\n\r?\n---\r?\n\r?\n/);
  if (parts.length > 1) {
    s = parts[parts.length - 1].trim();
  }
  s = s
    .replace(/^Project memory:\s*[\s\S]*?(?=\n\nProject instructions:|\n\n---\n\n|$)/i, '')
    .replace(/^Project instructions:\s*[\s\S]*?(?=\n\n---\n\n|$)/i, '')
    .trim();
  return s;
}

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
 * @param {Record<string, unknown>|null|undefined} body
 * @param {ProjectContext|null|undefined} projectContext
 * @returns {string|null}
 */
export function resolveUserAppProjectScopeRef(body, projectContext) {
  const fromBody = parseSessionProjectIdFromChatBody(body);
  if (fromBody) return fromBody;
  const direct = trim(body?.project_id ?? body?.projectId);
  return direct || null;
}

/**
 * @param {Record<string, unknown>|null|undefined} body
 * @param {ProjectContext|null|undefined} projectContext
 */
export function hasUserAppProjectScope(body, projectContext) {
  return !!(resolveUserAppProjectScopeRef(body, projectContext) || projectContext?.github_repo);
}

/**
 * Read-only project questions — answer from injected memory + RAG, not agentsam_d1_query fanout.
 * Uses the user's turn text only so prepended project memory cannot trigger data-plane tools.
 * @param {string} message
 */
export function isProjectReadOnlyChatMessage(message) {
  const t = stripProjectScopedIntentMessage(message);
  if (!t) return true;
  const mutationIntent =
    /\b(fix|patch|edit|implement|deploy|run|execute|write|create|add|update|migrate|refactor|change)\b/i.test(
      t,
    );
  if (mutationIntent && !codeContextIntent(t)) return false;
  if (askDataPlaneIntent(t)) return false;
  if (codeContextIntent(t)) return false;
  // Repo analysis / tree / skills inventory needs github_* tools — not memory-only QnA.
  if (
    /\b(this repo|the repo|codebase|repository)\b/i.test(t) &&
    /\b(analy[sz]e|summar(?:y|ize)|skills?|tree|structure|overview|audit|inventory|list)\b/i.test(t)
  ) {
    return false;
  }
  if (/\b(github_tree|github_read|top-?level tree|file tree)\b/i.test(t)) return false;
  if (/\b(terminal|sandbox|wrangler deploy|github_write|commit|push)\b/i.test(t)) return false;
  if (/\bbinding(s)?\b/i.test(t) && !/\b(iam|inneranimalmedia|platform)\b/i.test(t)) return true;
  return true;
}

/**
 * @param {Record<string, unknown>|null|undefined} body
 * @param {ProjectContext|null|undefined} projectContext
 * @param {string} mode
 * @param {string} message
 */
export function shouldUseProjectQnaFastLane(body, projectContext, mode, message) {
  if (!hasUserAppProjectScope(body, projectContext)) return false;
  const normalized = normalizeAgentRuntimeMode(mode);
  if (normalized === 'debug' || normalized === 'multitask' || normalized === 'plan') return false;
  return isProjectReadOnlyChatMessage(message);
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
    candidate = trim(
      input.body?.active_repo ??
        input.body?.activeRepo ??
        input.body?.github_repo_context ??
        input.body?.githubRepoContext ??
        input.body?.selectedGithubRepoContext,
    );
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
 * Dashboard `user_app` lane — full compile path (masks removed).
 * classifyIntent → compileModeProfile; mcpOAuthParity=false → route-scoped tools (not 100 oauth dump).
 *
 * @param {any} env
 * @param {import('./runtime-profile.types.js').ResolveRuntimeProfileInput & {
 *   body?: Record<string, unknown>|null,
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
  const body = input.body && typeof input.body === 'object' ? input.body : null;
  const session = input.session || {};
  const workspaceId = trim(session.workspaceId);
  const userId = trim(session.userId);
  const tenantId = trim(session.tenantId);
  const overrides = input.overrides || {};
  const isSuperadmin =
    input.isSuperadmin === true ||
    session.isSuperadmin === true ||
    authUserIsSuperadmin(session.authUser);
  const projectContext = input.projectContext ?? null;
  const hasProjectScope = hasUserAppProjectScope(body, projectContext);
  const projectQnaFastLane = shouldUseProjectQnaFastLane(body, projectContext, mode, message);

  const { resolveRuntimeProfile } = await import('./runtime-profile.js');
  const profile = await resolveRuntimeProfile(env, {
    mode,
    message,
    session: {
      userId,
      workspaceId,
      tenantId,
      conversationId: session.conversationId,
      authUser: session.authUser,
      isSuperadmin,
    },
    overrides: {
      model_key: overrides.model_key,
      subagent_slug: overrides.subagent_slug,
      task_type: overrides.task_type,
      route_key: projectQnaFastLane
        ? USER_APP_PROJECT_QNA_ROUTE
        : overrides.route_key ?? null,
    },
    compile_lane: 'live',
    requireVision: input.requireVision === true,
    // P0#5 / tkt_route_contract_tool_scoping — no OAuth-parity 100-tool default-allow.
    mcpOAuthParity: false,
  });

  profile._runtime_lane = RUNTIME_LANE_USER_APP;
  profile._project_context = projectContext;
  profile._project_qna_fast_lane = projectQnaFastLane;
  profile.profile_id = `user_app_${profile.mode || mode}`;

  if (hasProjectScope && profile.context_policy) {
    profile.context_policy = {
      ...profile.context_policy,
      include_rag: true,
      include_memory: true,
      include_workspace: true,
    };
  }

  if (!profile.model_key) {
    profile.model_key =
      (await loadWorkspaceDefaultModel(env, workspaceId)) || USER_APP_DEFAULT_MODEL;
  }

  console.info(
    '[user-app-runtime] compiled',
    JSON.stringify({
      mode: profile.mode,
      model_key: profile.model_key,
      tool_count: Array.isArray(profile.tool_allowlist) ? profile.tool_allowlist.length : 0,
      routing_task_type: profile.routing_task_type,
      prompt_route_id: profile.source?.prompt_route_id ?? null,
      route_requirements_id: profile.source?.route_requirements_id ?? null,
      project_repo: projectContext?.github_repo ?? null,
      project_qna_fast_lane: projectQnaFastLane,
      has_project_scope: hasProjectScope,
      message_len: message.length,
      mcp_oauth_parity: false,
    }),
  );
  return profile;
}
