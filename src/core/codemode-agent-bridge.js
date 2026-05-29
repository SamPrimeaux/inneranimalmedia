/**
 * Agent chat bridge — codemode AI SDK tool → IAM provider tool manifest + execute.
 */
import { CODEMODE_TOOL_NAME, shouldUseCodemodeForRequest, shouldUseCodemodeTooling } from './codemode-constants.js';

export { CODEMODE_TOOL_NAME, shouldUseCodemodeForRequest, shouldUseCodemodeTooling };

const CODEMODE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    code: {
      type: 'string',
      description:
        'JavaScript async arrow function body. Example: async () => { const r = await codemode.d1_query({ sql: "SELECT 1" }); return r; }',
    },
  },
  required: ['code'],
};

/**
 * @param {import('ai').Tool} codemodeTool
 */
export function codemodeToolToAgentDefinition(codemodeTool) {
  const desc =
    codemodeTool?.description != null
      ? String(codemodeTool.description).slice(0, 12_000)
      : 'Execute JavaScript that orchestrates IAM catalog tools via codemode.*';
  return {
    name: CODEMODE_TOOL_NAME,
    description: desc,
    input_schema: { ...CODEMODE_INPUT_SCHEMA },
    requires_approval: false,
    tool_category: 'agent',
  };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 * @param {{ toolKeys?: string[], allowlistKeys?: Set<string> }} [opts]
 */
export async function getOrBuildCodemodeRuntime(env, runContext = {}, opts = {}) {
  const { buildCodemodeToolset } = await import('./codemode-tool-set.js');
  const built = await buildCodemodeToolset(env, runContext, opts);
  return {
    codemodeTool: built.codemodeTool,
    toolCount: built.toolCount,
    execute: async (input) => executeCodemodeAgentTool(built.codemodeTool, input),
  };
}

/**
 * @param {import('ai').Tool} codemodeTool
 * @param {Record<string, unknown>} input
 */
export async function executeCodemodeAgentTool(codemodeTool, input) {
  const code = input?.code != null ? String(input.code) : '';
  if (!code.trim()) {
    return { error: 'codemode_code_required', ok: false };
  }
  if (!codemodeTool || typeof codemodeTool.execute !== 'function') {
    return { error: 'codemode_tool_unavailable', ok: false };
  }
  try {
    const out = await codemodeTool.execute({ code });
    const pending = extractPendingActions(out);
    return {
      ok: true,
      result: out?.result ?? out,
      logs: out?.logs ?? [],
      pending_actions: pending,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message != null ? String(e.message) : String(e),
    };
  }
}

/**
 * @param {unknown} out
 * @returns {Array<Record<string, unknown>>}
 */
export function extractPendingActions(out) {
  if (!out || typeof out !== 'object') return [];
  const root = /** @type {Record<string, unknown>} */ (out);
  const result = root.result;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const pa = /** @type {Record<string, unknown>} */ (result).pending_actions;
    if (Array.isArray(pa)) return pa.filter((x) => x && typeof x === 'object');
  }
  const direct = root.pending_actions;
  if (Array.isArray(direct)) return direct.filter((x) => x && typeof x === 'object');
  return [];
}

/**
 * Hybrid manifest: codemode + native sidecars (approval, browser, image/video).
 *
 * @param {Array<Record<string, unknown>>} tools
 * @param {{ codemodeTool: import('ai').Tool }} runtime
 * @param {{ browserDispatchToolsActive?: boolean, imageCapabilityIntent?: boolean, videoCapabilityIntent?: boolean }} opts
 */
export function buildHybridCodemodeManifest(tools, runtime, opts = {}) {
  const sidecar = [];
  const browserNames = new Set([
    'browser_navigate',
    'browser_content',
    'browser_open_url',
    'cdt_navigate_page',
    'cdt_take_snapshot',
    'cdt_take_screenshot',
    'cdt_evaluate_script',
    'playwright_screenshot',
    'browser_screenshot',
    'a11y_audit_webpage',
  ]);

  for (const t of tools || []) {
    const name = String(t?.name || '').trim();
    if (!name || name === CODEMODE_TOOL_NAME) continue;
    if (Number(t.requires_approval || 0) === 1) {
      sidecar.push(t);
      continue;
    }
    if (opts.browserDispatchToolsActive && browserNames.has(name)) {
      sidecar.push(t);
      continue;
    }
    if (opts.imageCapabilityIntent && /image|dalle|flux|recraft/i.test(name)) {
      sidecar.push(t);
      continue;
    }
    if (opts.videoCapabilityIntent && /video|sora|veo/i.test(name)) {
      sidecar.push(t);
      continue;
    }
  }

  return [codemodeToolToAgentDefinition(runtime.codemodeTool), ...sidecar];
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} opts
 * @param {Array<Record<string, unknown>>} pendingActions
 */
export async function enqueueCodemodePendingActions(env, ctx, opts, pendingActions) {
  if (!env?.DB || !Array.isArray(pendingActions) || !pendingActions.length) return [];
  const ids = [];
  const workspaceId = String(opts.workspaceId ?? opts.workspace_id ?? '').trim();
  const tenantId = String(opts.tenantId ?? opts.tenant_id ?? '').trim();
  const userId = String(opts.userId ?? opts.user_id ?? '').trim();
  const sessionId = opts.sessionId != null ? String(opts.sessionId) : null;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 3600;

  for (const item of pendingActions) {
    const toolName = String(item.tool_name ?? item.tool ?? 'unknown').trim() || 'unknown';
    const args = item.args ?? item.args_json ?? item.input ?? {};
    const reason = String(item.reason ?? item.action_summary ?? `Codemode pending: ${toolName}`).slice(0, 2000);
    const proposalId = `prop_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const argsStr = typeof args === 'string' ? args : JSON.stringify(args);
    const inputJson = JSON.stringify({
      command_text: `${toolName}(${argsStr.slice(0, 500)})`,
      filled_template: argsStr,
      command_source: 'codemode_sandbox',
      tool: toolName,
    });
    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_approval_queue
         (id, tenant_id, workspace_id, user_id, session_id, tool_name, action_summary,
          risk_level, input_json, expires_at, status, approval_type, created_at,
          agent_run_id, conversation_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          proposalId,
          tenantId,
          workspaceId,
          userId || 'iam_agent',
          sessionId,
          toolName,
          reason,
          String(item.risk_level ?? 'medium'),
          inputJson,
          expiresAt,
          'pending',
          'tool',
          now,
          opts.agent_run_id ?? opts.agentRunId ?? null,
          opts.conversation_id ?? opts.conversationId ?? sessionId,
        )
        .run();
      ids.push(proposalId);
    } catch (e) {
      console.warn('[codemode] approval_queue_insert', e?.message ?? e);
    }
  }
  return ids;
}
