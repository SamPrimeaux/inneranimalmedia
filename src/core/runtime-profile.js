/**
 * Compile D1 registry fragments → flat RuntimeProfile (Phase 1 spine).
 * Shadow lane: log-only on chat requests until Phase 2 cutover.
 */
import { normalizeAgentRuntimeMode, AGENT_MODE_CONTRACT } from './agent-mode.js';
import { loadModeToolPolicy } from './agent-mode-tool-policy.js';
import { filterAskReadEvidenceTools } from './agent-tool-planes.js';
import {
  augmentAskRouteRequirements,
  compileAskEvidenceToolRows,
  askPinnedEvidenceToolNames,
  askDataPlaneIntent as askMessageDataPlaneIntent,
  codeContextIntent as askMessageCodeContextIntent,
} from './ask-evidence-tools.js';
import {
  READONLY_REPO_AUDIT_ROUTE_KEY,
  CORE_EVIDENCE_TOOL_NAMES,
  augmentReadonlyRepoAuditRouteRequirements,
  compileReadonlyRepoAuditToolRows,
  filterReportChildOrchestrationTools,
  isReadonlyRepoAuditContext,
  readonlyRepoAuditPinnedToolNames,
} from './readonly-repo-audit-tools.js';
import { RUNTIME_PROFILE_VERSION } from './runtime-profile.types.js';
import { messageHasBrowserUrlNavigation } from '../api/agent/classify-intent.js';
import { IN_APP_MCP_PARITY_TOOL_LIMIT } from './in-app-mcp-oauth-parity.js';

const TERMINAL_TOOL_NAMES = ['terminal_run', 'terminal_execute', 'run_command', 'bash'];

const AUGMENTATION_EXEMPT_ROUTES = new Set([
  'design_intake',
  'cad_generation',
  'design_studio',
  'cms_code_pass',
  'mcp_panel',
  'mail_triage',
]);

const EXEMPT_ROUTE_TOOL_ALLOWLIST_FALLBACK = {
  design_intake: ['agentsam_d1_write', 'fs_read_file', 'fs_search_files', 'agentsam_memory_manager'],
  cad_generation: ['agentsam_d1_write', 'fs_read_file', 'fs_search_files', 'agentsam_memory_manager', 'agentsam_r2_put'],
  design_studio: ['agentsam_d1_write', 'fs_read_file', 'fs_search_files', 'agentsam_memory_manager', 'agentsam_r2_put'],
  mail_triage: [
    'gmail_list_inbox',
    'gmail_get_message',
    'gmail_modify_message',
    'gmail_send',
    'agentsam_gmail_mcp_search_threads',
    'agentsam_gmail_mcp_get_thread',
  ],
};

/**
 * @param {{ promptRouteMax?: number|null, routeReqMax?: number|null, modelCap?: number|null, requestLimit?: number|null }} p
 */
function effectiveAgentChatToolCap(p) {
  const n = (x) => {
    if (x == null || x === '') return null;
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  };
  const pr = n(p.promptRouteMax);
  const rr = n(p.routeReqMax);
  const mc = n(p.modelCap) ?? 8;
  const rl = n(p.requestLimit) ?? 20;
  if (pr === 0 || rr === 0) return 0;
  const caps = [];
  if (pr != null && pr > 0) caps.push(Math.floor(pr));
  if (rr != null && rr > 0) caps.push(Math.floor(rr));
  caps.push(Math.floor(mc), Math.floor(rl));
  return Math.max(0, Math.min(...caps));
}

/**
 * @param {string} [taskType]
 * @param {string} [modeSlug]
 */
function maxModelToolsForAgentTask(taskType, modeSlug) {
  const tt = String(taskType || '').toLowerCase();
  const mode = String(modeSlug || '').toLowerCase();
  if (mode === 'ask') return 8;
  if (tt === 'debug' || tt === 'tool_use') return 8;
  if (tt === 'mcp_panel') return 24;
  if (['code', 'sql_d1_generation', 'terminal_execution', 'deploy', 'cms_edit'].includes(tt)) return 12;
  if (tt === 'plan') return 6;
  return 8;
}

/**
 * @param {string} message
 */
/** Strip quickstart/on-demand suffixes before casual-intent checks. */
export function stripCasualIntentMessage(message) {
  const raw = String(message || '').trim();
  if (!raw) return '';
  const cut = raw.split(/\r?\n\r?\n--- On-demand context/i)[0]?.trim();
  return cut || raw;
}

export function isSimpleAskMessage(message) {
  const s = stripCasualIntentMessage(message).trim().toLowerCase();
  if (!s || s.length > 80) return false;
  if (
    ['hi', 'hello', 'hey', 'yo', 'sup', 'thanks', 'thank you', 'ok', 'okay', 'test', 'ping', 'wyd'].includes(
      s,
    )
  ) {
    return true;
  }
  return (
    /^what'?s up\??$/i.test(s) ||
    /^how are you\??$/i.test(s) ||
    /^how r u\??$/i.test(s) ||
    /^whatcha doin\??$/i.test(s)
  );
}

/**
 * @param {string} mode
 * @param {string} message
 */
function askDataPlaneIntent(mode, message) {
  return mode === 'ask' && askMessageDataPlaneIntent(message);
}

/**
 * @param {string} message
 */
function codeContextIntent(message) {
  return askMessageCodeContextIntent(message);
}

/**
 * General knowledge — no project evidence needed ("what is a heuristic?").
 * @param {string} message
 */
function isGeneralKnowledgeQuestion(message) {
  const s = String(message || '').trim();
  if (!s || s.length > 160) return false;
  if (askDataPlaneIntent('ask', message) || codeContextIntent(message)) return false;
  return /^(what is|what are|explain|define|tell me about)\s+(a|an|the)?\s*[\w\s-]+\??$/i.test(s);
}

/**
 * Ask mutation work without evidence context — explain only, no tool compile.
 * @param {string} message
 */
function askMutationWorkWithoutEvidence(message) {
  const t = String(message || '');
  const work =
    /\b(fix|patch|edit|implement|deploy|run|execute|write|create|add|update|migrate|refactor|change)\b/i.test(
      t,
    );
  if (!work) return false;
  return !codeContextIntent(t) && !askDataPlaneIntent('ask', t);
}

/**
 * Ask mode: compile read-only evidence tools when the question needs grounding.
 * @param {string} message
 */
function askNeedsReadEvidenceTools(message) {
  if (isSimpleAskMessage(message)) return false;
  if (isGeneralKnowledgeQuestion(message)) return false;
  if (askMutationWorkWithoutEvidence(message)) return false;
  if (askDataPlaneIntent('ask', message)) return true;
  if (codeContextIntent(message)) return true;
  if (/\b(deployment status|last deploy|worker logs|read logs|show logs|status of deploy)\b/i.test(message)) {
    return true;
  }
  return false;
}

/**
 * @param {string} mode
 * @param {string} message
 * @param {number} maxTools
 * @param {string|null} refinedRouteKey
 */
function shouldCompileToolsForTurn(mode, message, maxTools, refinedRouteKey) {
  if (maxTools <= 0) return false;
  if (refinedRouteKey === 'simple_ask_greeting') return false;
  if (isSimpleAskMessage(message)) return false;
  if (mode === 'agent' || mode === 'debug' || mode === 'multitask' || mode === 'plan') return true;
  if (mode === 'ask') return askNeedsReadEvidenceTools(message);
  return false;
}

/**
 * @param {string} mode
 * @param {string} message
 */
function agentLikeTooling(mode, message) {
  if (mode === 'ask') return askNeedsReadEvidenceTools(message);
  const explicitSurfaceOrWorkflowIntent =
    /\b(open|use|launch|focus|debug|inspect|screenshot|capture|diagram|flowchart|browser|monaco|excalidraw|workflow)\b/i.test(
      message,
    );
  return (
    mode === 'agent' ||
    mode === 'debug' ||
    mode === 'multitask' ||
    (mode === 'ask' && explicitSurfaceOrWorkflowIntent)
  );
}

/**
 * @param {string} mode
 */
export function resolveModeController(mode) {
  switch (normalizeAgentRuntimeMode(mode)) {
    case 'ask':
      return 'ask_controller';
    case 'plan':
      return 'plan_controller';
    case 'agent':
      return 'agent_controller';
    case 'debug':
      return 'debug_controller';
    case 'multitask':
      return 'multitask_controller';
    default:
      return 'ask_controller';
  }
}

/**
 * Phase 3: deterministic mode → execution_kind mapping.
 * - No long-work promotion.
 * - No Agent/Multitask plan hijack.
 * - No guessing after profile compile.
 *
 * Acceptance:
 * - Only mode === "plan" can produce plan_pipeline.
 * - Agent must always produce agent_tool_loop.
 * - Debug must always produce debug_investigation_loop.
 * - Multitask must always produce multitask_fanout.
 *
 * @param {string} mode
 */
export function resolveExecutionKind(mode) {
  switch (normalizeAgentRuntimeMode(mode)) {
    case 'ask':
      return 'ask_turn';
    case 'plan':
      return 'plan_pipeline';
    case 'agent':
      return 'agent_tool_loop';
    case 'debug':
      return 'debug_investigation_loop';
    case 'multitask':
      return 'multitask_fanout';
    default:
      return 'ask_turn';
  }
}

/**
 * @param {Exclude<import('./agent-mode.js').AgentMode, 'auto'>} mode
 */
function defaultWritePolicyForMode(mode) {
  switch (mode) {
    case 'ask':
      return {
        can_edit_files: false,
        can_terminal: false,
        can_d1_write: false,
        can_deploy: false,
        can_browser_automation: false,
        can_memory_write: false,
      };
    case 'plan':
      return {
        can_edit_files: false,
        can_terminal: false,
        can_d1_write: false,
        can_deploy: false,
        can_browser_automation: false,
        can_memory_write: false,
      };
    case 'debug':
      return {
        can_edit_files: true,
        can_terminal: true,
        can_d1_write: true,
        // Debug mode must never deploy until evidence/approval gates allow it.
        can_deploy: false,
        can_browser_automation: true,
        can_memory_write: true,
      };
    case 'agent':
    case 'multitask':
    default:
      return {
        can_edit_files: true,
        can_terminal: true,
        can_d1_write: true,
        can_deploy: true,
        can_browser_automation: true,
        can_memory_write: true,
      };
  }
}

/**
 * @param {Exclude<import('./agent-mode.js').AgentMode, 'auto'>} mode
 */
function defaultParallelPolicyForMode(mode) {
  if (mode === 'multitask') {
    return {
      enabled: true,
      execution_enabled: false,
      max_subagents: 3,
      max_depth: 1,
      allowed_subagent_types: ['read', 'write', 'summarize'],
      merge_strategy: 'rws_pipeline',
    };
  }
  return {
    enabled: false,
    execution_enabled: false,
    max_subagents: 0,
    max_depth: 0,
    allowed_subagent_types: [],
    merge_strategy: 'synthesize',
  };
}

/**
 * @param {any} promptRouteRow
 */
function contextPolicyFromPromptRoute(promptRouteRow) {
  const includeRag = promptRouteRow?.include_rag == null ? true : Number(promptRouteRow.include_rag) !== 0;
  const includeMemory =
    promptRouteRow?.include_recent_memory == null
      ? true
      : Number(promptRouteRow.include_recent_memory) !== 0;
  const includeWorkspace = true;
  return {
    include_rag: includeRag,
    include_memory: includeMemory,
    include_workspace: includeWorkspace,
    fresh_thread_recommended: false,
  };
}

/**
 * @param {any} env
 * @param {{ tenantId?: string|null, mode: string, taskType: string }} q
 */
async function resolvePromptRouteRow(env, q) {
  if (!env?.DB) return null;
  const tid = q.tenantId != null ? String(q.tenantId).trim() : '';
  const mode = String(q.mode || '').trim();
  const taskType = String(q.taskType || '').trim();
  const routeByKeySql = `
      SELECT r.*
      FROM agentsam_prompt_routes r
      WHERE r.route_key = ?
        AND r.is_active = 1
        AND (r.tenant_id IS NULL OR r.tenant_id = ?)
      ORDER BY CASE WHEN r.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
               COALESCE(r.priority, 0) ASC
      LIMIT 1
    `;
  try {
    if (mode) {
      const modeRoute = await env.DB.prepare(routeByKeySql).bind(mode, tid).first();
      if (modeRoute) return modeRoute;
    }
    if (taskType && taskType !== mode) {
      const taskRoute = await env.DB.prepare(routeByKeySql).bind(taskType, tid).first();
      if (taskRoute) return taskRoute;
    }
    return null;
  } catch (e) {
    console.warn('[runtime-profile] prompt_route', e?.message ?? e);
    return null;
  }
}

/**
 * Explicit composer mode (Agent / Multitask / Debug / Plan) owns route_key — intent must not override.
 * @param {string} mode
 */
function executionModeLocksRouteKey(mode) {
  return (
    mode === 'agent' || mode === 'multitask' || mode === 'debug' || mode === 'plan'
  );
}

/**
 * Map composer mode + classified taskType → Thompson routing_task_type.
 * Agent mode honors classification (mask #2 fix) — previously locked to mode and discarded
 * inferIntentHeuristically results. Explicit body.task_type override still wins.
 * multitask/debug/plan keep mode lock unless explicit override.
 * @param {string} composerMode
 * @param {string} classifiedTaskType
 * @param {boolean} [hasExplicitTaskTypeOverride]
 */
export function resolveComposerRoutingTaskType(
  composerMode,
  classifiedTaskType,
  hasExplicitTaskTypeOverride = false,
) {
  const mode = String(composerMode || 'agent').trim().toLowerCase();
  const classified = String(classifiedTaskType || '').trim().toLowerCase();
  if (hasExplicitTaskTypeOverride && classified) return classified;
  // Agent: classification drives Thompson (code → code arms, not chat/haiku by default).
  if (mode === 'agent' && classified) return classified;
  if (executionModeLocksRouteKey(mode)) return mode;
  return classified || mode;
}

/**
 * @param {any} env
 * @param {string|null|undefined} tenantId
 * @param {string} routeKey
 */
async function loadPromptRouteRowByKey(env, tenantId, routeKey) {
  if (!env?.DB || !routeKey) return null;
  try {
    return await env.DB.prepare(
      `SELECT * FROM agentsam_prompt_routes
       WHERE route_key = ?
         AND is_active = 1
         AND (tenant_id = ? OR tenant_id IS NULL)
       ORDER BY CASE WHEN tenant_id = ? THEN 0 ELSE 1 END, priority ASC
       LIMIT 1`,
    )
      .bind(routeKey, tenantId, tenantId)
      .first();
  } catch (_) {
    return null;
  }
}

/**
 * @param {any} env
 * @param {{ tenantId?: string|null, mode: string, taskType: string, message: string, routeKeyPin?: string|null }} q
 */
async function resolvePromptRouteForCompile(env, q) {
  const mode = String(q.mode || 'agent').toLowerCase();
  const message = String(q.message || '');
  const taskType = String(q.taskType || '').trim().toLowerCase();
  let refinedRouteKey = null;
  const routePin = q.routeKeyPin != null ? String(q.routeKeyPin).trim() : '';

  // Quickstart cards and API route_key pins must win over mode-locked agent/multitask routes.
  if (routePin) {
    const exemptPin = AUGMENTATION_EXEMPT_ROUTES.has(routePin) || AUGMENTATION_EXEMPT_ROUTES.has(taskType);
    if (exemptPin) {
      const pinnedRow = env?.DB ? await loadPromptRouteRowByKey(env, q.tenantId, routePin) : null;
      return { row: pinnedRow, refinedRouteKey: routePin };
    }
    const pinnedRow = env?.DB ? await loadPromptRouteRowByKey(env, q.tenantId, routePin) : null;
    if (pinnedRow) {
      return { row: pinnedRow, refinedRouteKey: String(pinnedRow.route_key || routePin) };
    }
  }

  if (executionModeLocksRouteKey(mode)) {
    if (taskType && taskType !== mode) {
      const taskRow = await loadPromptRouteRowByKey(env, q.tenantId, taskType);
      if (taskRow) return { row: taskRow, refinedRouteKey: taskType };
    }
    const row = await loadPromptRouteRowByKey(env, q.tenantId, mode);
    return { row, refinedRouteKey: mode };
  }

  if (q.routeKeyPin && env?.DB) {
    try {
      const pinned = await env.DB.prepare(
        `SELECT * FROM agentsam_prompt_routes
         WHERE route_key = ?
           AND is_active = 1
           AND (tenant_id = ? OR tenant_id IS NULL)
         ORDER BY CASE WHEN tenant_id = ? THEN 0 ELSE 1 END, priority ASC
         LIMIT 1`,
      )
        .bind(String(q.routeKeyPin).trim(), q.tenantId, q.tenantId)
        .first();
      if (pinned) return { row: pinned, refinedRouteKey: String(pinned.route_key || q.routeKeyPin) };
    } catch (_) {
      /* non-fatal */
    }
  }

  let row = await resolvePromptRouteRow(env, {
    tenantId: q.tenantId,
    mode,
    taskType: q.taskType,
  });

  const needsBrowserRoute = messageHasBrowserUrlNavigation(message);
  if (needsBrowserRoute && row?.route_key !== 'browser' && env?.DB) {
    try {
      const browserRow = await env.DB.prepare(
        `SELECT r.*
         FROM agentsam_prompt_routes r
         WHERE r.route_key = 'browser'
           AND r.is_active = 1
           AND (r.tenant_id IS NULL OR r.tenant_id = ?)
         ORDER BY CASE WHEN r.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
                  COALESCE(r.priority, 0) ASC
         LIMIT 1`,
      )
        .bind(q.tenantId != null ? String(q.tenantId).trim() : '')
        .first();
      if (browserRow) {
        row = browserRow;
        refinedRouteKey = 'browser';
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  const tooling = agentLikeTooling(mode, message);
  if (
    (mode === 'ask' || mode === 'agent') &&
    isSimpleAskMessage(message) &&
    !tooling &&
    env?.DB
  ) {
    try {
      const greetingRoute = await env.DB.prepare(
        `SELECT * FROM agentsam_prompt_routes
         WHERE route_key = 'simple_ask_greeting'
           AND is_active = 1
           AND (tenant_id = ? OR tenant_id IS NULL)
         ORDER BY CASE WHEN tenant_id = ? THEN 0 ELSE 1 END
         LIMIT 1`,
      )
        .bind(q.tenantId, q.tenantId)
        .first();
      if (greetingRoute) {
        row = greetingRoute;
        refinedRouteKey = 'simple_ask_greeting';
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  if (!refinedRouteKey && row?.route_key) refinedRouteKey = String(row.route_key);
  if (!refinedRouteKey && q.routeKeyPin) refinedRouteKey = String(q.routeKeyPin).trim();
  return { row, refinedRouteKey };
}

/**
 * @param {import('./runtime-profile.types.js').RuntimeProfile} profile
 */
async function hashRuntimeProfile(profile) {
  const stable = JSON.stringify({
    mode: profile.mode,
    mode_controller: profile.mode_controller,
    profile_id: profile.profile_id,
    execution_kind: profile.execution_kind,
    tool_policy: profile.tool_policy,
    write_policy: profile.write_policy,
    routing_task_type: profile.routing_task_type,
    max_tools: profile.max_tools,
    context_policy: profile.context_policy,
    parallel_policy: profile.parallel_policy,
    debug_policy: profile.debug_policy ?? null,
  });
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/**
 * When a surface route (e.g. browser) scores zero tools, re-select from mode defaults + intent caps — no hardcoded tool names.
 * @param {any} env
 * @param {{ message: string, mode: string, taskType: string, tenantId?: string|null, workspaceId: string, userId: string, maxTools: number }} p
 */
async function compileCatalogToolsForModeFallback(env, p) {
  const useOAuthParity = p.mcpOAuthParity !== false;
  if (useOAuthParity) {
    const { selectOAuthMcpParityToolsForAgentChat } = await import('./in-app-mcp-oauth-parity.js');
    const det = await selectOAuthMcpParityToolsForAgentChat(
      env.DB,
      {
        userId: p.userId,
        tenantId: p.tenantId,
        workspaceId: p.workspaceId,
        isSuperadmin: p.isSuperadmin === true,
      },
      {
        outputLimit: Math.max(1, Math.min(IN_APP_MCP_PARITY_TOOL_LIMIT, p.maxTools || IN_APP_MCP_PARITY_TOOL_LIMIT)),
        modeSlug: p.mode,
        isSuperadmin: p.isSuperadmin === true,
      },
    );
    return det.rows || [];
  }
  const { resolveAgentChatRouteToolRequirements } = await import('./agentsam-route-tool-resolver.js');
  const { selectAgentsamToolsForAgentChat } = await import('./agentsam-tools-catalog.js');
  const { augmentAskRouteRequirements } = await import('./ask-evidence-tools.js');
  const mode = String(p.mode || 'agent').toLowerCase();
  const taskType = String(p.taskType || '').trim().toLowerCase();
  const genericTaskTypes = new Set(['chat', 'ask', 'explain', 'summary', 'recall', '']);
  const fallbackRouteKey =
    mode === 'multitask'
      ? 'multitask'
      : mode === 'plan'
        ? 'plan'
        : mode === 'debug'
          ? 'debug'
          : taskType && !genericTaskTypes.has(taskType)
            ? taskType
            : 'agent_general';
  let req = await resolveAgentChatRouteToolRequirements(env, {
    routeKey: fallbackRouteKey,
    taskType: p.taskType,
    modeSlug: mode,
  });
  req = augmentAskRouteRequirements(p.message, req, mode);
  const det = await selectAgentsamToolsForAgentChat(
    env.DB,
    { userId: p.userId, tenantId: p.tenantId, workspaceId: p.workspaceId },
    {
      routeToolRequirements: req,
      message: p.message,
      taskType: p.taskType,
      modeSlug: mode,
      catalogLimit: Math.min(96, Math.max(8, p.maxTools * 4)),
      outputLimit: Math.max(1, p.maxTools),
    },
  );
  return det.rows || [];
}

/**
 * @param {any} env
 * @param {{
 *   mode: string,
 *   message: string,
 *   tenantId?: string|null,
 *   workspaceId?: string|null,
 *   userId?: string|null,
 *   taskType?: string|null,
 *   routeKeyPin?: string|null,
 *   compile_lane?: 'shadow'|'live',
 * }} input
 * @returns {Promise<import('./runtime-profile.types.js').RuntimeProfile>}
 */
export async function compileModeProfile(env, input) {
  const mode = /** @type {Exclude<import('./agent-mode.js').AgentMode, 'auto'>} */ (
    normalizeAgentRuntimeMode(input.mode) === 'auto' ? 'agent' : normalizeAgentRuntimeMode(input.mode)
  );
  const message = String(input.message || '');
  const taskType = String(input.taskType || mode).toLowerCase();
  const tenantId = input.tenantId != null ? String(input.tenantId).trim() : null;
  const workspaceId = input.workspaceId != null ? String(input.workspaceId).trim() : null;
  const userId = input.userId != null ? String(input.userId).trim() : null;
  const compileLane = input.compile_lane === 'live' ? 'live' : 'shadow';
  const useOAuthParity = input.mcpOAuthParity !== false;
  const isSuperadmin = input.isSuperadmin === true;

  const { row: promptRouteRow, refinedRouteKey } = await resolvePromptRouteForCompile(env, {
    tenantId,
    mode,
    taskType,
    message,
    routeKeyPin: input.routeKeyPin,
  });

  const routeKey =
    refinedRouteKey ||
    (input.routeKeyPin ? String(input.routeKeyPin).trim() : null) ||
    (promptRouteRow?.route_key != null ? String(promptRouteRow.route_key).trim() : null) ||
    mode;

  const routeToolRequirements = env?.DB
    ? await (
        await import('./agentsam-route-tool-resolver.js')
      ).resolveAgentChatRouteToolRequirements(env, {
        routeKey,
        taskType,
        modeSlug: mode,
      })
    : null;

  // Routes that own their own tool set — skip evidence augmentation entirely
  // Hard tool_key allowlist for exempt routes — bypasses lane/category catalog selection entirely.
  // routeKeyRaw collapses to modeSlug ('agent') inside resolveAgentChatRouteToolRequirements,
  // so agentsam_prompt_routes.tool_keys for the real route_key is never consulted there — the
  // base catalog always comes from the broad 'agent' defaults. For AUGMENTATION_EXEMPT_ROUTES,
  // promptRouteRow (resolved by the REAL route_key via resolvePromptRouteForCompile/routeKeyPin,
  // not modeSlug) IS the correct row, so its tool_keys column is read live below as the
  // allowlistKeys source — edit that D1 row to change the allowlist, no deploy needed.
  // This fallback only fires if that row is missing/empty for an exempt route.

  const effectiveRouteReq = (() => {
    let req = routeToolRequirements;
    const skipAugment =
      AUGMENTATION_EXEMPT_ROUTES.has(routeKey) ||
      AUGMENTATION_EXEMPT_ROUTES.has(taskType) ||
      AUGMENTATION_EXEMPT_ROUTES.has(input.routeKeyPin);
    if (
      !skipAugment && (
        mode === 'ask' ||
        mode === 'agent' ||
        mode === 'debug' ||
        mode === 'plan' ||
        mode === 'multitask'
      )
    ) {
      req = augmentAskRouteRequirements(message, req, mode);
    }
    const readonlyAudit =
      isReadonlyRepoAuditContext(message) ||
      refinedRouteKey === READONLY_REPO_AUDIT_ROUTE_KEY ||
      input.routeKeyPin === READONLY_REPO_AUDIT_ROUTE_KEY;
    if (readonlyAudit) {
      req = augmentReadonlyRepoAuditRouteRequirements(message, req);
    }
    return req;
  })();

  const modeToolPolicy = await loadModeToolPolicy(env, mode, { routeKey, taskType });

  const promptRouteMax =
    promptRouteRow?.max_tools != null && String(promptRouteRow.max_tools).trim() !== ''
      ? Number(promptRouteRow.max_tools)
      : null;
  const modelCap = useOAuthParity
    ? IN_APP_MCP_PARITY_TOOL_LIMIT
    : maxModelToolsForAgentTask(taskType, mode);
  const maxTools = useOAuthParity
    ? IN_APP_MCP_PARITY_TOOL_LIMIT
    : effectiveAgentChatToolCap({
        promptRouteMax,
        routeReqMax: effectiveRouteReq?.max_tools ?? routeToolRequirements?.max_tools,
        modelCap,
        requestLimit: 20,
      });

  /** @type {string[]} */
  let toolAllowlist = [];
  /** @type {Array<Record<string, unknown>>} */
  let compiledToolRows = [];
  /** @type {string[]} */
  let missingRequiredCapabilities = [];
  /** @type {string[]} */
  let allowedDomains = [];
  if (
    env?.DB &&
    workspaceId &&
    userId &&
    shouldCompileToolsForTurn(mode, message, maxTools, refinedRouteKey) &&
    maxTools > 0
  ) {
    const { selectAgentsamToolsForAgentChat } = await import('./agentsam-tools-catalog.js');
    let scoredRows = [];
    // Resolve exempt-route allowlist (mail_triage, design_*, …) before OAuth parity.
    // OAuth parity lists oauth_visible=1 only — gmail_list_inbox was invisible there and
    // the model fell back to agentsam_d1_query. Exempt routes must pin their tool_keys.
    const exemptAllowlistKeyEarly = AUGMENTATION_EXEMPT_ROUTES.has(routeKey)
      ? routeKey
      : AUGMENTATION_EXEMPT_ROUTES.has(taskType)
        ? taskType
        : AUGMENTATION_EXEMPT_ROUTES.has(input.routeKeyPin)
          ? input.routeKeyPin
          : null;
    let exemptAllowlistEarly = null;
    if (exemptAllowlistKeyEarly) {
      if (promptRouteRow?.route_key === exemptAllowlistKeyEarly && promptRouteRow?.tool_keys) {
        try {
          const parsed = JSON.parse(String(promptRouteRow.tool_keys));
          if (Array.isArray(parsed) && parsed.length > 0) {
            exemptAllowlistEarly = parsed.map((k) => String(k).trim()).filter(Boolean);
          }
        } catch (_) {
          /* fall through */
        }
      }
      if (!exemptAllowlistEarly) {
        exemptAllowlistEarly = EXEMPT_ROUTE_TOOL_ALLOWLIST_FALLBACK[exemptAllowlistKeyEarly] || null;
      }
    }

    if (useOAuthParity && exemptAllowlistEarly?.length) {
      const { fetchAgentsamToolRowsByName } = await import('./agent-tool-loader.js');
      const { mapCatalogRowsToMcpParityAgentTools } = await import('./in-app-mcp-oauth-parity.js');
      const pinnedRows = await fetchAgentsamToolRowsByName(env, exemptAllowlistEarly);
      const byName = new Map(
        (pinnedRows || []).map((r) => [String(r.tool_name || '').trim().toLowerCase(), r]),
      );
      const ordered = [];
      for (const key of exemptAllowlistEarly) {
        const row = byName.get(String(key).trim().toLowerCase());
        if (row) ordered.push(row);
      }
      scoredRows = mapCatalogRowsToMcpParityAgentTools(ordered).slice(0, Math.max(1, maxTools));
      console.info(
        '[runtime-profile] exempt_route_oauth_parity_pin',
        JSON.stringify({
          route_key: exemptAllowlistKeyEarly,
          pinned: scoredRows.map((r) => r.name || r.tool_key).filter(Boolean),
        }),
      );
    } else if (useOAuthParity) {
      const { selectOAuthMcpParityToolsForAgentChat } = await import('./in-app-mcp-oauth-parity.js');
      const det = await selectOAuthMcpParityToolsForAgentChat(
        env.DB,
        { userId, tenantId, workspaceId, isSuperadmin },
        {
          outputLimit: maxTools,
          modeSlug: mode,
          isSuperadmin,
        },
      );
      scoredRows = det.rows || [];
    } else {
    const exemptAllowlistKey = AUGMENTATION_EXEMPT_ROUTES.has(routeKey)
      ? routeKey
      : AUGMENTATION_EXEMPT_ROUTES.has(taskType)
        ? taskType
        : AUGMENTATION_EXEMPT_ROUTES.has(input.routeKeyPin)
          ? input.routeKeyPin
          : null;
    // Live source: agentsam_prompt_routes.tool_keys for the row that matches this exempt
    // route_key (promptRouteRow is resolved by the real route_key, not modeSlug — see
    // resolvePromptRouteForCompile). Editing that D1 row's tool_keys changes the allowlist
    // with no deploy. Falls back to the hardcoded map only if that row/column is empty.
    let exemptAllowlist = null;
    if (exemptAllowlistKey) {
      if (promptRouteRow?.route_key === exemptAllowlistKey && promptRouteRow?.tool_keys) {
        try {
          const parsed = JSON.parse(String(promptRouteRow.tool_keys));
          if (Array.isArray(parsed) && parsed.length > 0) {
            exemptAllowlist = parsed.map((k) => String(k).trim()).filter(Boolean);
          }
        } catch (_) {
          /* fall through to hardcoded fallback */
        }
      }
      if (!exemptAllowlist) {
        exemptAllowlist = EXEMPT_ROUTE_TOOL_ALLOWLIST_FALLBACK[exemptAllowlistKey] || null;
      }
    }
    const allowlistKeys = exemptAllowlist ? new Set(exemptAllowlist.map((k) => k.toLowerCase())) : null;
    const det = await selectAgentsamToolsForAgentChat(env.DB, { userId, tenantId, workspaceId }, {
      allowlistKeys,
      routeToolRequirements: effectiveRouteReq || {
        route_key: routeKey,
        task_type: taskType,
        allowed_lanes: ['general'],
        required_capabilities: [],
        optional_capabilities: [],
        blocked_capabilities: [],
        max_tools: maxTools,
        approval_policy: null,
        source: 'default',
      },
      message,
      taskType,
      modeSlug: mode,
      catalogLimit: Math.min(96, maxTools * 4),
      outputLimit: maxTools,
    });
    let scoredRowsLegacy = det.rows || [];
    missingRequiredCapabilities = det.missingRequiredCapabilities || [];
    allowedDomains = det.allowedDomains || [];
    if (det.droppedUnknownLanes?.length) {
      console.warn('[runtime-profile] route_unknown_lanes_dropped', {
        route_key: routeKey,
        lanes: det.droppedUnknownLanes,
      });
    }
    scoredRows = scoredRowsLegacy;
    }
    const readonlyAuditCompile =
      isReadonlyRepoAuditContext(message) ||
      refinedRouteKey === READONLY_REPO_AUDIT_ROUTE_KEY ||
      input.routeKeyPin === READONLY_REPO_AUDIT_ROUTE_KEY;
    if (readonlyAuditCompile && readonlyRepoAuditPinnedToolNames(message).length > 0) {
      const pinned = await compileReadonlyRepoAuditToolRows(env, {
        message,
        workspaceId,
        maxTools,
        scoredRows,
      });
      scoredRows = pinned.mergedRows;
    } else if (mode === 'ask' && askPinnedEvidenceToolNames(message, mode).length > 0) {
      const pinned = await compileAskEvidenceToolRows(env, {
        message,
        workspaceId,
        userId,
        tenantId,
        maxTools,
        scoredRows,
        modeSlug: mode,
      });
      scoredRows = pinned.mergedRows;
    }
    compiledToolRows = scoredRows;
    toolAllowlist = compiledToolRows.map((r) => String(r.name || r.tool_key || r.tool_name || '').trim()).filter(Boolean);
  }

  const denySet = new Set((modeToolPolicy.denyTools || []).map((t) => String(t)));
  toolAllowlist = toolAllowlist.filter((name) => !denySet.has(name));
  if (mode === 'ask' || isReadonlyRepoAuditContext(message) || input.routeKeyPin === READONLY_REPO_AUDIT_ROUTE_KEY) {
    // Ask/readonly audit should not lose tool capability; it should lose *unsafe execution* by policy.
    // Orchestration tools are still removed here (child fanout / pipeline controls).
    compiledToolRows = filterReportChildOrchestrationTools(compiledToolRows);
    toolAllowlist = compiledToolRows.map((r) => String(r.name || r.tool_key || r.tool_name || '').trim()).filter(Boolean);
  }

  const modesWithCatalogFallback =
    mode === 'multitask' || mode === 'agent' || mode === 'debug' || mode === 'plan';
  if (modesWithCatalogFallback && toolAllowlist.length === 0 && env?.DB && workspaceId && userId) {
    const fallbackRows = await compileCatalogToolsForModeFallback(env, {
      message,
      mode,
      taskType,
      tenantId,
      userId,
      workspaceId,
      maxTools,
      mcpOAuthParity: useOAuthParity,
      isSuperadmin,
    });
    if (fallbackRows.length) {
      compiledToolRows = fallbackRows;
      toolAllowlist = compiledToolRows
        .map((r) => String(r.name || r.tool_key || r.tool_name || '').trim())
        .filter(Boolean);
    }
  }

  const modeContract = AGENT_MODE_CONTRACT[mode] || AGENT_MODE_CONTRACT.agent;

  const writePolicy = defaultWritePolicyForMode(mode);
  const executionKind = resolveExecutionKind(mode);
  const modeController = resolveModeController(mode);

  const profileId = `mode_${mode}@${routeKey || 'default'}`;
  const systemPromptKey =
    promptRouteRow?.system_prompt_key != null && String(promptRouteRow.system_prompt_key).trim() !== ''
      ? String(promptRouteRow.system_prompt_key).trim()
      : promptRouteRow?.route_key != null
        ? String(promptRouteRow.route_key)
        : mode;

  /** @type {import('./runtime-profile.types.js').RuntimeProfile} */
  const profile = {
    mode,
    mode_controller: modeController,
    profile_id: profileId,
    profile_hash: '',
    profile_version: RUNTIME_PROFILE_VERSION,
    system_prompt_key: systemPromptKey,
    system_prompt_inline:
      promptRouteRow?.system_prompt_fragment != null
        ? String(promptRouteRow.system_prompt_fragment)
        : null,
    prompt_layers: promptRouteRow?.route_key ? [String(promptRouteRow.route_key)] : [mode],
    tool_allowlist: toolAllowlist,
    tool_denylist: [...denySet],
    tool_require_approval: (modeToolPolicy.requireApprovalTools || []).map((t) => String(t)),
    tool_policy: {
      allowlist: toolAllowlist,
      denylist: [...denySet],
      require_approval: (modeToolPolicy.requireApprovalTools || []).map((t) => String(t)),
      max_tool_calls: 15,
      max_runtime_ms: 90000,
    },
    max_tools: maxTools,
    max_tool_calls: 15,
    max_turns: 6,
    max_runtime_ms: 90000,
    write_policy: writePolicy,
    workflow_key:
      promptRouteRow?.workflow_key != null && String(promptRouteRow.workflow_key).trim() !== ''
        ? String(promptRouteRow.workflow_key).trim()
        : null,
    execution_kind: executionKind,
    context_policy: contextPolicyFromPromptRoute(promptRouteRow),
    routing_task_type: taskType,
    model_key: null,
    routing_arm_id: null,
    temperature: 0.7,
    parallel_policy: defaultParallelPolicyForMode(mode),
    debug_policy:
      mode === 'debug'
        ? {
            evidence_required_before_write: true,
            evidence_required_before_deploy: true,
            phase: 'hypothesize',
          }
        : null,
    source: {
      prompt_route_id: promptRouteRow?.id != null ? String(promptRouteRow.id) : null,
      route_requirements_id: routeToolRequirements?.route_key ?? null,
      compiled_at: Math.floor(Date.now() / 1000),
      compile_lane: compileLane,
    },
    refined_route_key: refinedRouteKey,
    color: modeContract.color,
    tool_profile: modeContract.tool_profile,
    tool_capable_required:
      toolAllowlist.length > 0 ||
      mode === 'agent' ||
      mode === 'debug' ||
      mode === 'plan' ||
      mode === 'multitask',
    missing_required_capabilities: missingRequiredCapabilities,
    allowed_domains: allowedDomains,
    selected_provider: null,
    _compiled_tool_rows: compiledToolRows,
    _prompt_route_row: promptRouteRow,
  };

  profile.profile_hash = await hashRuntimeProfile(profile);
  return profile;
}

/**
 * @param {import('./runtime-profile.types.js').RuntimeProfile} profile
 * @param {Record<string, unknown>|null|undefined} userPolicy
 */
function applyUserPolicyToProfile(profile, userPolicy) {
  if (!userPolicy) return profile;
  const canPty = Number(userPolicy.can_run_pty) === 1;
  if (!canPty) {
    profile.write_policy.can_terminal = false;
    const denied = new Set(profile.tool_denylist);
    for (const t of TERMINAL_TOOL_NAMES) denied.add(t);
    profile.tool_denylist = [...denied];
    profile.tool_allowlist = profile.tool_allowlist.filter((name) => !denied.has(name));
    if (profile.tool_policy) {
      profile.tool_policy.denylist = profile.tool_denylist;
      profile.tool_policy.allowlist = profile.tool_allowlist;
    }
  }

  // RWS fanout (read → write → summarize) — Multitask only, policy-gated per user/workspace.
  if (profile.mode === 'multitask' && profile.parallel_policy) {
    const allowSpawn = Number(userPolicy.allow_subagent_spawn ?? 0) === 1;
    const allowExec = Number(userPolicy.allow_fanout_execution ?? 0) === 1;
    profile.parallel_policy.enabled = allowSpawn;
    profile.parallel_policy.execution_enabled = allowSpawn && allowExec;
    const depth = Math.max(1, Math.floor(Number(userPolicy.max_spawn_depth ?? 1) || 1));
    profile.parallel_policy.max_depth = Math.min(
      depth,
      Math.floor(Number(profile.parallel_policy.max_depth ?? depth) || depth),
    );
    profile.parallel_policy.max_subagents = 3;
    profile.parallel_policy.merge_strategy = 'rws_pipeline';
  }
  return profile;
}

/**
 * @param {import('./runtime-profile.types.js').RuntimeProfile} profile
 * @param {import('./runtime-profile.types.js').RuntimeProfileOverrides} [overrides]
 */
function applyOverridesToProfile(profile, overrides) {
  if (!overrides) return profile;
  if (overrides.model_key != null && String(overrides.model_key).trim() !== '') {
    profile.model_key = String(overrides.model_key).trim();
  }
  if (overrides.skip_rws_fanout === true) {
    profile.skip_rws_fanout = true;
  }
  return profile;
}

/**
 * @param {any} env
 * @param {import('./runtime-profile.types.js').ResolveRuntimeProfileInput} input
 * @returns {Promise<import('./runtime-profile.types.js').RuntimeProfile>}
 */
export async function resolveRuntimeProfile(env, input) {
  const mode = normalizeAgentRuntimeMode(input.mode);
  const composerMode = mode === 'auto' ? 'agent' : mode;
  const session = input.session || {};
  const overrides = input.overrides || {};
  const message = String(input.message || '').trim();

  let classifiedTaskType = overrides.task_type ? String(overrides.task_type).trim().toLowerCase() : '';
  let classifiedIntent = null;
  let classifiedMode = null;
  if (!classifiedTaskType && message && env?.DB) {
    try {
      const { classifyIntent } = await import('../api/agent/classify-intent.js');
      const classified = await classifyIntent(env, message, {
        session: {
          userId: session.userId,
          workspaceId: session.workspaceId,
          tenantId: session.tenantId,
          conversationId: session.conversationId,
        },
      });
      classifiedTaskType = String(classified.taskType || '').trim().toLowerCase();
      classifiedIntent = classified.intent != null ? String(classified.intent) : null;
      classifiedMode = classified.mode != null ? String(classified.mode) : null;
      if (classifiedTaskType) {
        console.info(
          '[runtime-profile] classified_intent',
          JSON.stringify({
            taskType: classifiedTaskType,
            intent: classifiedIntent,
            mode: classifiedMode,
            matchedBy: classified.matchedBy ?? null,
            confidence: classified.confidence ?? null,
            escalated: classified.escalated === true,
          }),
        );
      }
    } catch (e) {
      console.warn('[runtime-profile] classifyIntent', e?.message ?? e);
    }
  }

  const taskType = resolveComposerRoutingTaskType(
    composerMode,
    classifiedTaskType,
    Boolean(overrides.task_type),
  );

  // project_qna_fast: short-circuit tool compilation — answer from project memory + RAG.
  // Never strip tools for image generation asks (photo/image/logo/etc.).
  let hasImageAsk = false;
  try {
    const { hasImageGenerationIntent } = await import('../tools/image_generation.js');
    hasImageAsk = hasImageGenerationIntent(message);
  } catch {
    hasImageAsk = false;
  }
  const isProjectQnaFast =
    classifiedIntent === 'project_qna_fast' &&
    composerMode === 'agent' &&
    !overrides.task_type &&
    !overrides.route_key &&
    !hasImageAsk;

  let profile = await compileModeProfile(env, {
    mode: composerMode,
    message,
    tenantId: session.tenantId,
    workspaceId: session.userId ? session.workspaceId : session.workspaceId,
    userId: session.userId,
    taskType,
    routeKeyPin: isProjectQnaFast ? 'project_qna_fast' : overrides.route_key,
    compile_lane: input.compile_lane || 'shadow',
    mcpOAuthParity: input.mcpOAuthParity,
    isProjectQnaFast,
    isSuperadmin:
      session.isSuperadmin === true ||
      session.is_superadmin === true ||
      String(session.role || session.authUser?.role || '')
        .trim()
        .toLowerCase() === 'superadmin' ||
      Number(session.authUser?.is_superadmin) === 1,
  });

  if (session.userId && session.workspaceId) {
    const { loadAgentSamUserPolicy } = await import('./agent-policy.js');
    const userPolicy = await loadAgentSamUserPolicy(env, session.userId, session.workspaceId);
    profile = applyUserPolicyToProfile(profile, userPolicy);
  }

  profile = applyOverridesToProfile(profile, overrides);
  if (classifiedIntent) profile._classified_intent = classifiedIntent;
  if (isProjectQnaFast) profile._project_qna_fast_lane = true;
  profile = await resolveProfileModel(env, profile, {
    workspaceId: session.workspaceId,
    tenantId: session.tenantId,
    requestedModel: overrides.model_key,
    requireTools: profile.tool_allowlist.length > 0,
    requireVision: input.requireVision === true,
  });
  profile.tool_capable_required = profile.tool_allowlist.length > 0;
  profile.profile_hash = await hashRuntimeProfile(profile);
  return profile;
}

/**
 * Bind model + routing arm via resolveModelForTask (Thompson when auto).
 * @param {any} env
 * @param {import('./runtime-profile.types.js').RuntimeProfile} profile
 * @param {{ workspaceId?: string|null, tenantId?: string|null, requestedModel?: string|null, requireTools?: boolean, requireVision?: boolean }} opts
 */
export async function resolveProfileModel(env, profile, opts) {
  if (!env?.DB || !opts.workspaceId) return profile;
  const ws = String(opts.workspaceId).trim();
  const raw = opts.requestedModel != null ? String(opts.requestedModel).trim() : '';
  const isAuto = !raw || raw.toLowerCase() === 'auto';
  const requireVision = opts.requireVision === true;
  const toolCapableRequired = profile.tool_capable_required || profile.tool_allowlist.length > 0;
  if (!isAuto && !requireVision) {
    profile.model_key = raw;
    return profile;
  }
  try {
    const { resolveModelForTask, normalizeCanonicalTaskType } = await import('./resolveModel.js');
    if (!isAuto && requireVision) {
      try {
        const pinned = await resolveModelForTask(env, {
          task_type: normalizeCanonicalTaskType(profile.routing_task_type || profile.mode),
          mode: profile.mode,
          workspace_id: ws,
          tenant_id: opts.tenantId != null ? String(opts.tenantId).trim() : undefined,
          requested_model_key: raw,
          require_tools: toolCapableRequired,
          require_vision: true,
        });
        profile.model_key = pinned.model_key;
        profile.routing_arm_id =
          pinned.routing_arm_id != null ? String(pinned.routing_arm_id) : null;
        profile.selected_provider =
          pinned.provider != null ? String(pinned.provider) : null;
        return profile;
      } catch (e) {
        console.warn('[runtime-profile] pinned model lacks vision, re-routing', e?.message ?? e);
      }
    }
    const taskType = normalizeCanonicalTaskType(profile.routing_task_type || profile.mode);
    const resolved = await resolveModelForTask(env, {
      task_type: taskType,
      mode: profile.mode,
      workspace_id: ws,
      tenant_id: opts.tenantId != null ? String(opts.tenantId).trim() : undefined,
      require_tools: toolCapableRequired,
      require_vision: requireVision,
      requested_model_key: isAuto ? null : raw,
    });
    profile.model_key = resolved.model_key;
    profile.routing_arm_id =
      resolved.routing_arm_id != null ? String(resolved.routing_arm_id) : null;
    profile.selected_provider =
      resolved.provider != null ? String(resolved.provider) : null;
    profile.tool_capable_required = toolCapableRequired;
  } catch (e) {
    console.warn('[runtime-profile] resolveProfileModel', e?.message ?? e);
  }
  if (!profile.model_key) {
    try {
      const { queryGlobalPolicyArm, normalizeCanonicalTaskType } = await import('./resolveModel.js');
      const taskType = normalizeCanonicalTaskType(profile.routing_task_type || profile.mode);
      const globalArm = await queryGlobalPolicyArm(env.DB, {
        task_type: taskType,
        mode: profile.mode,
        workspace_id: ws,
        require_tools: toolCapableRequired,
      });
      if (globalArm?.model_key) {
        profile.model_key = String(globalArm.model_key);
        profile.routing_arm_id = globalArm.id != null ? String(globalArm.id) : null;
        console.warn('[runtime-profile] resolveProfileModel global policy fallback', profile.model_key);
      }
    } catch (fb) {
      console.warn('[runtime-profile] resolveProfileModel fallback', fb?.message ?? fb);
    }
  }
  return profile;
}

/**
 * Map compiled tool rows → OpenAI/Anthropic manifest shape.
 * @param {Array<Record<string, unknown>>} rows
 */
export function toolsManifestFromCompiledRows(rows) {
  return (rows || []).map((t) => {
    const raw =
      t.input_schema && typeof t.input_schema === 'object' ? t.input_schema : {};
    const name = String(t.name || t.tool_name || '').trim();
    return {
      name,
      description: String(t.description || name),
      input_schema: Object.assign({ type: 'object', properties: {} }, raw, { type: 'object' }),
    };
  }).filter((t) => t.name);
}

/**
 * Structured shadow log — one line per chat request for spine validation.
 * @param {import('./runtime-profile.types.js').RuntimeProfile} profile
 * @param {{ path?: string, shadow?: boolean, conversation_id?: string|null }} [meta]
 */
export function logRuntimeProfile(profile, meta = {}) {
  console.log(
    '[runtime-profile]',
    JSON.stringify({
      live: meta.live !== false,
      path: meta.path || 'agentChatSpine',
      conversation_id: meta.conversation_id ?? null,
      mode: profile.mode,
      profile_id: profile.profile_id,
      profile_hash: profile.profile_hash,
      execution_kind: profile.execution_kind,
      model_key: profile.model_key,
      routing_arm_id: profile.routing_arm_id,
      tool_allowlist_count: profile.tool_allowlist.length,
      max_tools: profile.max_tools,
      write_policy: profile.write_policy,
      color: profile.color,
      tool_profile: profile.tool_profile,
      tool_capable_required: profile.tool_capable_required,
      source: profile.source,
    }),
  );
}

/**
 * Proof log — one line per chat turn for mode/route/tool contract validation.
 * @param {import('./runtime-profile.types.js').RuntimeProfile} profile
 * @param {{ requestedMode?: string, routeKey?: string|null, taskType?: string|null }} [meta]
 */
export function logRouteContract(profile, meta = {}) {
  const finalTools = profile.tool_allowlist || [];
  console.log(
    '[agent] route_contract',
    JSON.stringify({
      requestedMode: meta.requestedMode ?? profile.mode,
      routeKey: meta.routeKey ?? profile.refined_route_key ?? profile.mode,
      taskType: meta.taskType ?? profile.routing_task_type,
      color: profile.color,
      toolProfile: profile.tool_profile,
      writePolicy: profile.write_policy,
      finalToolCount: finalTools.length,
      missingRequiredCapabilities: profile.missing_required_capabilities || [],
      allowedDomains: profile.allowed_domains || [],
      droppedRouteLanes: profile.source?.dropped_route_lanes || [],
      toolCapableRequired: profile.tool_capable_required || finalTools.length > 0,
      toolNames: finalTools,
      selectedModel: profile.model_key,
      selectedProvider: profile.selected_provider,
      selectedArmId: profile.routing_arm_id,
      executionKind: profile.execution_kind,
    }),
  );
}

/** @deprecated use logRuntimeProfile */
export function logShadowRuntimeProfile(profile, meta = {}) {
  logRuntimeProfile(profile, { ...meta, live: false });
}

/**
 * Non-blocking shadow compile for chat hot path.
 * @param {any} ctx
 * @param {any} env
 * @param {import('./runtime-profile.types.js').ResolveRuntimeProfileInput} input
 * @param {{ path?: string, conversation_id?: string|null }} [meta]
 */
export function scheduleShadowRuntimeProfileCompile(ctx, env, input, meta = {}) {
  const run = async () => {
    try {
      const profile = await resolveRuntimeProfile(env, { ...input, compile_lane: 'shadow' });
      logShadowRuntimeProfile(profile, { ...meta, shadow: true });
    } catch (e) {
      console.warn('[runtime-profile] shadow_compile_failed', e?.message ?? String(e));
    }
  };
  if (ctx?.waitUntil) ctx.waitUntil(run());
  else run().catch(() => {});
}

export {
  defaultWritePolicyForMode,
  defaultParallelPolicyForMode,
  agentLikeTooling,
  askNeedsReadEvidenceTools,
  hashRuntimeProfile,
};
