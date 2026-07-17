import { scheduleToolCallLog } from './agentsam-ops-ledger.js';

export function inferArtifactFromAssistantText(text) {
  if (!text || typeof text !== 'string' || !text.includes('```')) return null;
  const m = text.match(/```([\w+#.-]*)/);
  const rawLang = m && m[1] ? String(m[1]).toLowerCase().replace(/^language-/, '') : '';
  let artifact_type = 'other';
  if (rawLang.includes('html')) artifact_type = 'html';
  else if (rawLang === 'js' || rawLang === 'javascript') artifact_type = 'js';
  else if (rawLang === 'ts' || rawLang === 'typescript' || rawLang === 'tsx') artifact_type = 'tsx';
  else if (rawLang === 'css') artifact_type = 'css';
  else if (rawLang === 'json') artifact_type = 'json';
  else if (rawLang === 'sql') artifact_type = 'sql';
  const name = rawLang && rawLang.length > 0 && rawLang.length < 80 ? rawLang : 'untitled';
  return { artifact_type, name };
}

export function extractLastAssistantPlainText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'assistant') continue;
    const c = m.content;
    if (typeof c === 'string') return c.trim();
    if (Array.isArray(c)) {
      return c
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
        .trim();
    }
  }
  return '';
}

export function scheduleAgentsamArtifactFromChatOutput(env, ctx, opts) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const { outputText, userId, tenantId, workspaceId, sourceAgentRunId, sourceSessionId } = opts;
  const meta = inferArtifactFromAssistantText(outputText || '');
  if (!meta) return;
  const uid = userId != null ? String(userId).trim() : '';
  const tid = tenantId != null ? String(tenantId).trim() : '';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!uid || !tid || !ws) return;
  ctx.waitUntil(
    (async () => {
      try {
        const { extractFencedArtifactContent, writeWorkspaceArtifact } = await import(
          '../core/artifact-r2-store.js'
        );
        const content = extractFencedArtifactContent(outputText || '');
        if (!content) return;
        const out = await writeWorkspaceArtifact(env, ctx, {
          userId: uid,
          tenantId: tid,
          workspaceId: ws,
          content,
          artifactType: meta.artifact_type,
          name: meta.name,
          source: 'agent_response',
          sourceRunId: sourceAgentRunId ?? null,
          sourceSessionId: sourceSessionId ?? null,
          origin: env?.IAM_ORIGIN ?? null,
        });
        if (!out.ok) {
          console.error('[agentsam_artifacts]', out.user_message || out.error);
        }
      } catch (e) {
        console.warn('[agentsam_artifacts]', e?.message ?? e);
      }
    })(),
  );
}

export function scheduleAgentsamToolCallLog(env, ctx, fields) {
  const {
    tenantId, sessionId, toolName, status, durationMs, costUsd,
    inputTokens, outputTokens, userId, workspaceId, errorMessage, inputSummary,
    agent_run_id, agentRunId, conversation_id, conversationId,
    routingArmId, routing_arm_id, agentId, agent_id, sourceTool, source_tool,
    inputCostUsd, input_cost_usd, outputCostUsd, output_cost_usd,
  } = fields;
  const tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : '';
  const ws = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';
  if (!tid || !ws) return;
  let stat = 'success';
  if (status === 'error') stat = 'error';
  else if (status === 'timeout') stat = 'timeout';
  else if (status === 'blocked') stat = 'blocked';
  else if (status === 'pending') stat = 'pending';
  scheduleToolCallLog(env, ctx, {
    tenantId, workspaceId, sessionId, toolName,
    status: stat, durationMs, costUsd, inputTokens, outputTokens, userId,
    inputCostUsd: inputCostUsd ?? input_cost_usd,
    outputCostUsd: outputCostUsd ?? output_cost_usd,
    errorMessage: errorMessage != null ? String(errorMessage).slice(0, 8000) : null,
    inputSummary: String(inputSummary ?? '').slice(0, 200),
    tool_key: fields.tool_key,
    capability_key: fields.capability_key,
    handler_key: fields.handler_key,
    route_key: fields.route_key,
    agentsam_tools_id: fields.agentsam_tools_id,
    mcp_server_id: fields.mcp_server_id,
    server_key: fields.server_key,
    approval_id: fields.approval_id,
    policy_decision_json: fields.policy_decision_json,
    agent_run_id: agent_run_id ?? agentRunId,
    conversation_id: conversation_id ?? conversationId ?? sessionId,
    routing_arm_id: routing_arm_id ?? routingArmId ?? null,
    agent_id: agent_id ?? agentId ?? null,
    source_tool: source_tool ?? sourceTool ?? null,
  });
}

export function toolLogFieldsFromValidation(validation) {
  if (!validation || typeof validation !== 'object') return {};
  const v = validation;
  const policy = {
    allowed: v.allowed === true,
    reason: v.reason ?? null,
    riskLevel: v.riskLevel ?? null,
    requiresConfirmation: v.requiresConfirmation === true,
    capability_shadow:
      v.capabilityDecision && typeof v.capabilityDecision === 'object'
        ? v.capabilityDecision
        : null,
  };
  const out = {
    tool_key: v.toolKey != null ? String(v.toolKey) : undefined,
    capability_key: v.capabilityKey != null ? String(v.capabilityKey) : undefined,
    handler_key: v.handlerKey != null ? String(v.handlerKey) : undefined,
    route_key: v.routeKey != null ? String(v.routeKey) : undefined,
    agentsam_tools_id: v.agentsamToolsId != null ? v.agentsamToolsId : undefined,
    mcp_server_id: v.mcpServerId != null ? v.mcpServerId : undefined,
    server_key: v.serverKey != null ? String(v.serverKey) : undefined,
    policy_decision_json: JSON.stringify(policy),
  };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

// Stubs — no longer needed but kept to avoid import errors elsewhere
export async function resolveBootstrapWorkspaceIdForAgentApi() { return null; }
export async function resolvePromptRouteRowForAgentChat() { return null; }
export async function resolveAgentsamPromptRoute() { return null; }
export async function fetchActivePlanContextFragment() { return ''; }

export function isSimpleAskMessage(message = '') {
  const s = String(message || '').trim().toLowerCase();
  if (!s || s.length > 80) return false;
  return ['hi', 'hello', 'hey', 'yo', 'sup', 'thanks', 'thank you', 'ok', 'okay', 'test', 'ping'].includes(s);
}

/**
 * Flat static system prompt — ambient identity + optional locked client context +
 * hard-scoped memory digest + optional lane RAG block.
 */
export async function buildSystemPrompt(_env, _tenantId, _mode, _contextBlock, _modeConfig, _promptRouteRow, options = {}) {
  const message = options?.message != null ? String(options.message) : '';
  const activeRepo = String(
    options?.activeRepo ??
      options?.active_repo ??
      options?.githubRepoContext ??
      options?.github_repo_context ??
      '',
  ).trim();
  const activeBranch = String(options?.activeBranch ?? options?.active_branch ?? 'main').trim() || 'main';
  const userId = String(options?.userId ?? options?.ctx?.authUser?.id ?? '').trim();
  const workspaceId = String(options?.workspaceId ?? options?.ctx?.authUser?.active_workspace_id ?? '').trim();
  const tenantId = String(_tenantId ?? options?.ctx?.authUser?.tenant_id ?? '').trim();

  const base = activeRepo
    ? 'You are Agent Sam, an AI coding and operations assistant. Use tools to read files, query databases, run commands, and deploy.'
    : 'You are Agent Sam, an AI coding and operations assistant. Use tools to read files, query databases, run commands, and deploy. Do not assume an active repo, file, or dashboard surface — discover job context through tools or explicit user attachments (@file, @browser, etc.).';
  const parts = [base];

  if (activeRepo) {
    parts.push(
      [
        '## Active GitHub repo (locked this turn)',
        `repo: ${activeRepo}`,
        `default_branch: ${activeBranch}`,
        'When the user says "this repo", "the open repo", "the current repo", or "here", use this exact owner/name.',
        `Call agentsam_github_tree({ repo: "${activeRepo}", branch: "${activeBranch}", recursive: false }) for a top-level listing.`,
        'Do NOT ask which repo. Do NOT call agentsam_github_repo_list first unless they ask to list their repos or switch repos.',
      ].join('\n'),
    );
  }

  try {
    const { formatAmbientIdentityForAgent } = await import('./workspace-studio-context.js');
    const auth = options?.ctx?.authUser ?? options?.authUser ?? null;
    const isSuperadmin =
      auth?.role === 'superadmin' ||
      auth?.is_superadmin === true ||
      auth?.is_superadmin === 1 ||
      Number(auth?.is_superadmin) === 1;
    const identityBlock = formatAmbientIdentityForAgent({
      user_id: userId || auth?.id || null,
      email: auth?.email ?? null,
      role: auth?.role ?? (isSuperadmin ? 'superadmin' : 'user'),
      is_superadmin: isSuperadmin ? 1 : 0,
      tenant_id: tenantId || auth?.tenant_id || null,
      workspace_id: workspaceId || auth?.active_workspace_id || null,
      credential_lane: isSuperadmin ? 'platform' : 'byok',
    });
    if (identityBlock) parts.push(`## Session\n${identityBlock}`);
  } catch (_) {
    /* optional */
  }

  // Always-on private memory digest — only when all three scopes are present.
  if (tenantId && userId && workspaceId && _env) {
    try {
      const { loadPinnedMemoryDigestForPrompt } = await import('./agentsam-private-memory.js');
      const mem = await loadPinnedMemoryDigestForPrompt(_env, {
        tenantId,
        workspaceId,
        userId,
        limit: 16,
      });
      if (mem) parts.push(mem.trim());
    } catch (e) {
      console.warn('[agent-prompt] memory digest skipped', e?.message ?? e);
    }
  }

  const laneCtx = _contextBlock != null ? String(_contextBlock).trim() : '';
  if (laneCtx) {
    parts.push(`## Lane context\n${laneCtx.slice(0, 6000)}`);
  }

  try {
    const { hasImageGenerationIntent } = await import('../tools/image_generation.js');
    if (hasImageGenerationIntent(message)) {
      parts.push(
        'Image request this turn: call imgx_generate_image with a concrete visual prompt. Do not only describe the image in text — invoke the tool.',
      );
    }
  } catch (_) {
    /* optional */
  }
  return parts.join('\n\n');
}

export function projectIdFromEnv(env) {
  const candidates = [env?.PROJECT_ID, env?.WORKER_NAME, env?.CLOUDFLARE_WORKER_NAME];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return 'inneranimalmedia';
}

export function parseJsonSafe(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
