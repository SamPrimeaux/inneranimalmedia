/**
 * IAM — Unified Provider Dispatch
 * Routes agent calls using agentsam_model_catalog as canonical execution metadata
 * (api_platform, provider ids). agentsam_ai is legacy/persona fallback when no catalog row exists.
 */
import { chatWithAnthropic, normalizeAnthropicEffort } from '../integrations/anthropic.js';
import { chatWithToolsOpenAI,
         chatWithToolsOpenAIResponses,
         completeWithOpenAI,
         completeWithOpenAIResponsesNonStream }  from '../integrations/openai.js';
import { resolveOpenAiApiKey } from '../integrations/openai-credentials.js';
import { chatWithToolsGemini, completeWithGemini } from '../integrations/gemini.js';
import { chatWithToolsVertex } from '../integrations/vertex.js';
import { jsonResponse }        from './responses.js';
import { resolveApiKey }       from './vault.js';
import { pickRoutingArmByThompson } from './thompson.js';
import { isThompsonRoutingSamplingEnabled } from './routing-thompson-flag.js';
import { pragmaTableInfo }     from './retention.js';
import { queryRoutingArmsCandidates, filterArmsForRouteKey } from './routing.js';
import { dispatchCursorComposerStream } from '../api/cursor-agent.js';
import {
  catalogChatFallbackSqlGuard,
  isNonChatCatalogModel,
} from './catalog-chat-fallback-guard.js';

/** Thrown when Ollama is skipped so the agent model chain can try the next provider (no SSE error text). */
export const OLLAMA_SKIP_MESSAGE = 'ollama_skip';

function shouldLogModelMetaFallback(env) {
  const d = env?.AGENT_SAM_DEBUG ?? env?.AGENT_SAM_MODEL_DEBUG ?? env?.DEBUG;
  return d === true || d === 1 || String(d || '').toLowerCase() === 'true' || String(d || '') === '1';
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {boolean} allowDegraded
 */
async function pickFallbackCatalogModelKey(db, allowDegraded) {
  const cols = await pragmaTableInfo(db, 'agentsam_model_catalog');
  if (!cols.has('model_key')) return null;
  const hasTenant = cols.has('tenant_id') && cols.has('workspace_id');
  const hasDegraded = cols.has('is_degraded');
  const hasTier = cols.has('tier');
  const scope = hasTenant ? `AND COALESCE(tenant_id,'') = '' AND COALESCE(workspace_id,'') = ''` : '';
  const degradedClause =
    !allowDegraded && hasDegraded ? 'AND COALESCE(is_degraded,0) = 0' : '';
  const chatGuard = catalogChatFallbackSqlGuard({
    openaiModelIdExpr: cols.has('openai_model_id') ? 'openai_model_id' : null,
    hasSupportsTools: cols.has('supports_tools'),
    hasRoutingLane: cols.has('routing_lane'),
    requireTools: true,
  });
  const orderBy = hasTier
    ? `CASE LOWER(COALESCE(tier,'')) WHEN 'micro' THEN 0 WHEN 'flash' THEN 1 WHEN 'standard' THEN 2 WHEN 'power' THEN 3 WHEN 'reasoning' THEN 4 WHEN 'frontier' THEN 5 ELSE 9 END, model_key ASC`
    : 'model_key ASC';
  const sql = `SELECT model_key FROM agentsam_model_catalog
     WHERE is_active = 1 ${degradedClause} ${scope} ${chatGuard}
     ORDER BY ${orderBy}
     LIMIT 1`;
  try {
    const row = await db.prepare(sql).first();
    return row?.model_key != null ? String(row.model_key).trim() : null;
  } catch {
    return null;
  }
}

/** @param {any} params */
async function resolveAutoModelKey(env, params) {
  let modelKey = params.modelKey;
  const mk = modelKey != null ? String(modelKey).trim() : '';
  if (mk && mk.toLowerCase() !== 'auto') return modelKey;

  const ws =
    params.workspaceId != null && String(params.workspaceId).trim() !== ''
      ? String(params.workspaceId).trim()
      : '';

  // 1) Same candidate pool as Thompson tuning: routing arms (workspace → global), then Thompson draw or best decayed_score.
  if (env?.DB) {
    let arms = await queryRoutingArmsCandidates(env, {
      taskType: params.taskType || 'chat',
      mode: params.mode || 'auto',
      workspaceId: ws,
      toolRequired: !!params.toolRequired,
      routeKey: params.routeKey ?? null,
    }).catch(() => []);
    arms = await filterArmsForRouteKey(env, params.routeKey ?? null, arms);
    if (arms?.length) {
      const useThompson = await isThompsonRoutingSamplingEnabled(env, {
        userId: params.userId,
        tenantId: params.tenantId,
      });
      const arm = useThompson ? pickRoutingArmByThompson(arms) : arms[0];
      const mkArm = arm?.model_key != null ? String(arm.model_key).trim() : '';
      if (mkArm) {
        params.model = mkArm;
        params.provider = arm.provider;
        params.routing_arm_id = arm.id;
        return mkArm;
      }
    }
  }

  if (env?.DB) {
    let ck = await pickFallbackCatalogModelKey(env.DB, false);
    if (!ck) ck = await pickFallbackCatalogModelKey(env.DB, true);
    if (ck) return ck;
  }

  const fallback = await env?.DB?.prepare(
    `SELECT model_key FROM agentsam_ai
     WHERE mode = 'model' AND status = 'active'
     ORDER BY sort_order ASC, name ASC
     LIMIT 1`,
  )
    .first()
    .catch(() => null);
  if (fallback?.model_key) return String(fallback.model_key);
  return null;
}

/**
 * Provider-specific API model id from catalog columns (logical model_key may differ).
 * @param {Record<string, unknown>} row
 * @param {string} provider
 */
function pickProviderModelIdFromCatalogRow(row, provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'openai') return row.openai_model_id ?? null;
  if (p === 'deepseek') return row.openai_model_id ?? row.model_key ?? null;
  if (p === 'anthropic') return row.anthropic_model_id ?? null;
  if (p === 'google' || p === 'gemini') return row.google_model_id ?? null;
  if (p === 'workers_ai' || p === 'cloudflare') return row.workers_ai_model_id ?? null;
  if (p === 'vertex') return row.google_model_id ?? row.vertex_model_id ?? null;
  return null;
}

/**
 * When catalog omits api_platform, derive a dispatch platform from provider slug.
 * @param {string} provider
 * @param {string} [rawPlatform]
 */
function deriveApiPlatformFromProvider(provider, rawPlatform) {
  let plat = rawPlatform != null ? String(rawPlatform).trim() : '';
  if (plat.toLowerCase() === 'unknown') plat = '';
  if (plat) return plat;
  const p = String(provider || '').toLowerCase();
  if (p === 'openai') return 'openai_chat_completions';
  if (p === 'deepseek') return 'deepseek';
  if (p === 'anthropic') return 'anthropic';
  if (p === 'google' || p === 'gemini') return 'gemini_api';
  if (p === 'workers_ai' || p === 'cloudflare') return 'workers_ai';
  if (p === 'vertex') return 'vertex';
  if (p === 'ollama') return 'ollama';
  return 'unknown';
}

/** Last-resort dispatch lane when catalog provider/api_platform are blank or stale. */
function deriveApiPlatformFromModelKey(modelKey) {
  const k = String(modelKey || '').trim().toLowerCase();
  if (!k) return 'unknown';
  if (k.startsWith('gpt-5') || k.startsWith('o3') || k.startsWith('o4')) return 'openai_responses';
  if (k.startsWith('gpt-') || k.startsWith('o1')) return 'openai_chat_completions';
  if (k.startsWith('claude')) return 'anthropic';
  if (k.startsWith('gemini')) return 'gemini_api';
  if (k.startsWith('@cf/') || k.includes('workers-ai')) return 'workers_ai';
  if (k.startsWith('deepseek')) return 'deepseek';
  return 'unknown';
}

/** Catalog api_platform with provider-derived fallback (never default to anthropic). */
function resolveDispatchPlatform(meta) {
  let plat = String(
    meta?.api_platform ? meta.api_platform : deriveApiPlatformFromProvider(meta?.provider || '', ''),
  ).toLowerCase();
  if (plat === 'unknown' || plat === '') {
    plat = deriveApiPlatformFromProvider(meta?.provider || '', '').toLowerCase();
  }
  if (plat === 'unknown' || plat === '') {
    plat = deriveApiPlatformFromModelKey(meta?.model_key || meta?.logical_model_key || '').toLowerCase();
  }
  if (plat === 'google_ai' || plat === 'google_ai_studio') plat = 'gemini_api';
  // Catalog aliases used by Workers AI OpenAI-compat models (kimi, granite, …)
  if (plat === 'workers_ai_openai_compat' || plat === 'workers-ai' || plat === 'cloudflare_workers_ai') {
    plat = 'workers_ai';
  }
  if (plat === 'google_vertex') plat = 'vertex';
  return plat;
}

/** Anthropic Messages API — never forward sampling temperature in request bodies. */
function isAnthropicDispatchPlatform(platform, provider) {
  const plat = String(platform || '').toLowerCase();
  const prov = String(provider || '').toLowerCase();
  return plat === 'anthropic' || plat === 'anthropic_messages' || prov === 'anthropic';
}

function deepseekDispatchExtras(meta, options = {}) {
  const out = {};
  if (meta?.thinking_mode != null && String(meta.thinking_mode).trim() !== '') {
    out.thinkingMode = String(meta.thinking_mode).trim();
  }
  if (meta?.thinking_policy != null && String(meta.thinking_policy).trim() !== '') {
    out.thinkingPolicy = String(meta.thinking_policy).trim();
  }
  if (meta?.tool_invocation_style != null && String(meta.tool_invocation_style).trim() !== '') {
    out.toolInvocationStyle = String(meta.tool_invocation_style).trim();
  }
  if (options?.deepseekStrictTools === true || options?.deepseek_strict_tools === true) {
    out.deepseekStrictTools = true;
  }
  const rf = options?.response_format ?? options?.responseFormat ?? null;
  if (rf && typeof rf === 'object') {
    out.responseFormat = rf;
  } else if (
    options?.jsonMode === true ||
    options?.json_mode === true ||
    options?.requireJsonOutput === true
  ) {
    out.jsonMode = true;
  }
  return out;
}

function omitAnthropicTemperature(options) {
  if (!options || typeof options !== 'object') return {};
  const { temperature: _omit, ...rest } = options;
  return rest;
}

/**
 * @param {Record<string, unknown>} catalogRow
 * @param {Set<string>} colset
 * @param {string} logicalModelKey
 */
function normalizeCatalogModelMeta(catalogRow, colset, logicalModelKey) {
  const provider = catalogRow.provider != null ? String(catalogRow.provider) : '';
  const rawPlat = colset.has('api_platform') && catalogRow.api_platform != null
    ? String(catalogRow.api_platform).trim()
    : '';
  const apiPlatform = deriveApiPlatformFromProvider(provider, rawPlat);

  const name =
    (colset.has('display_name') && catalogRow.display_name != null && String(catalogRow.display_name).trim())
      ? String(catalogRow.display_name).trim()
      : logicalModelKey;

  const contextMax =
    (colset.has('context_max_tokens') ? catalogRow.context_max_tokens : null) ??
    (colset.has('context_window') ? catalogRow.context_window : null) ??
    null;
  const outputMax =
    (colset.has('output_max_tokens') ? catalogRow.output_max_tokens : null) ??
    (colset.has('max_output_tokens') ? catalogRow.max_output_tokens : null) ??
    null;

  let inputMtok = colset.has('input_rate_per_mtok') ? catalogRow.input_rate_per_mtok : null;
  let outputMtok = colset.has('output_rate_per_mtok') ? catalogRow.output_rate_per_mtok : null;
  if ((inputMtok == null || Number(inputMtok) === 0) && colset.has('cost_per_1k_in')) {
    const c1k = Number(catalogRow.cost_per_1k_in);
    if (!Number.isNaN(c1k)) inputMtok = c1k * 1000;
  }
  if ((outputMtok == null || Number(outputMtok) === 0) && colset.has('cost_per_1k_out')) {
    const c1k = Number(catalogRow.cost_per_1k_out);
    if (!Number.isNaN(c1k)) outputMtok = c1k * 1000;
  }

  const rawProvId = pickProviderModelIdFromCatalogRow(catalogRow, provider);
  const providerModelId =
    rawProvId != null && String(rawProvId).trim() !== '' ? String(rawProvId).trim() : null;

  const supportsStreaming = colset.has('supports_streaming')
    ? catalogRow.supports_streaming
    : 1;

  return {
    id: catalogRow.id != null ? String(catalogRow.id) : null,
    name,
    model_key: logicalModelKey,
    provider,
    api_platform: apiPlatform,
    provider_model_id: providerModelId,
    secret_key_name: colset.has('secret_key_name') ? catalogRow.secret_key_name ?? null : null,
    supports_tools: catalogRow.supports_tools ?? null,
    supports_vision: catalogRow.supports_vision ?? null,
    supports_streaming: supportsStreaming,
    context_max_tokens: contextMax,
    output_max_tokens: outputMax,
    input_rate_per_mtok: inputMtok,
    output_rate_per_mtok: outputMtok,
    tool_invocation_style: colset.has('tool_invocation_style') ? catalogRow.tool_invocation_style ?? null : null,
    thinking_mode: colset.has('thinking_mode') ? catalogRow.thinking_mode ?? null : null,
    thinking_policy: colset.has('thinking_policy') ? catalogRow.thinking_policy ?? null : null,
    effort: colset.has('effort') ? catalogRow.effort ?? null : null,
  };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} logicalModelKey
 */
async function fetchCatalogModelRow(db, logicalModelKey) {
  const colset = await pragmaTableInfo(db, 'agentsam_model_catalog');
  if (!colset.has('model_key') || !colset.has('is_active')) return null;

  const candidates = [
    { label: 'global_non_degraded', allowDegraded: false, globalOnly: true },
    { label: 'global_any', allowDegraded: true, globalOnly: true },
    { label: 'scoped_non_degraded', allowDegraded: false, globalOnly: false },
    { label: 'scoped_any', allowDegraded: true, globalOnly: false },
  ];

  const baseCols = [
    'id', 'model_key', 'provider', 'is_active', 'supports_tools', 'supports_vision',
    'display_name', 'api_platform', 'tenant_id', 'workspace_id', 'is_degraded',
    'openai_model_id', 'anthropic_model_id', 'google_model_id', 'workers_ai_model_id', 'vertex_model_id',
    'context_window', 'max_output_tokens', 'context_max_tokens', 'output_max_tokens',
    'cost_per_1k_in', 'cost_per_1k_out', 'input_rate_per_mtok', 'output_rate_per_mtok',
    'supports_streaming', 'secret_key_name', 'tool_invocation_style', 'thinking_mode', 'thinking_policy', 'effort',
  ];
  const selectList = baseCols.filter((c) => colset.has(c));
  if (!selectList.includes('model_key')) return null;

  const hasTenant = colset.has('tenant_id') && colset.has('workspace_id');
  const hasDegraded = colset.has('is_degraded');

  for (const c of candidates) {
    if (c.globalOnly && !hasTenant) continue;
    const parts = [`model_key = ?`, `is_active = 1`];
    const binds = [logicalModelKey];
    if (c.globalOnly) {
      parts.push(`COALESCE(tenant_id,'') = ''`);
      parts.push(`COALESCE(workspace_id,'') = ''`);
    }
    if (!c.allowDegraded && hasDegraded) {
      parts.push(`COALESCE(is_degraded,0) = 0`);
    }
    const sql = `SELECT ${selectList.join(', ')} FROM agentsam_model_catalog WHERE ${parts.join(' AND ')} LIMIT 1`;
    try {
      const row = await db.prepare(sql).bind(...binds).first();
      if (row && row.model_key != null) return { row, colset };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Exported for agent tool-loop stream parsing (OpenAI vs Anthropic vs Gemini). */
export async function resolveModelMeta(env, modelKey) {
  if (!env.DB || !modelKey) return null;
  const logicalKey = String(modelKey).trim();
  if (!logicalKey) return null;

  try {
    const pack = await fetchCatalogModelRow(env.DB, logicalKey);
    if (pack) {
      return normalizeCatalogModelMeta(pack.row, pack.colset, logicalKey);
    }
  } catch {
    /* fall through */
  }

  try {
    const legacy = await env.DB.prepare(
      `SELECT id, name, model_key, api_platform, provider,
       secret_key_name, supports_tools, supports_vision,
       context_max_tokens, output_max_tokens,
       input_rate_per_mtok, output_rate_per_mtok,
       tool_invocation_style, thinking_mode, effort
       FROM agentsam_ai
       WHERE model_key = ?
         AND mode = 'model' AND status = 'active'
       LIMIT 1`,
    )
      .bind(logicalKey)
      .first();
    if (legacy) {
      if (shouldLogModelMetaFallback(env)) {
        console.warn(
          '[provider] resolveModelMeta: using agentsam_ai fallback (no active agentsam_model_catalog row)',
          logicalKey,
        );
      }
      const p = legacy.provider != null ? String(legacy.provider) : '';
      const ap = legacy.api_platform != null ? String(legacy.api_platform).trim() : '';
      return {
        ...legacy,
        api_platform: deriveApiPlatformFromProvider(p, ap),
        provider_model_id: null,
        supports_streaming: legacy.supports_streaming ?? 1,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function estimateTokensFromChars(value) {
  return Math.ceil(String(value ?? '').length / 4);
}

function safeJsonLength(value) {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return 0;
  }
}

function toolNamesForPromptAudit(tools) {
  if (!Array.isArray(tools)) return [];
  const out = [];
  for (const t of tools.slice(0, 100)) {
    if (!t || typeof t !== 'object') continue;
    const n = t.name || t.function?.name;
    if (n) out.push(String(n));
  }
  return out;
}

function systemPromptStringForAudit(systemPrompt) {
  if (systemPrompt == null) return '';
  if (typeof systemPrompt === 'string') return systemPrompt;
  try {
    return JSON.stringify(systemPrompt);
  } catch {
    return '';
  }
}

function agentPromptAuditEnvEnabled(env) {
  const v = env?.AGENT_SAM_PROMPT_AUDIT;
  return (
    v === true ||
    v === 1 ||
    String(v ?? '').toLowerCase() === 'true' ||
    String(v) === '1'
  );
}

/**
 * TEMP: token/char estimates only — no raw prompts, cookies, or API keys.
 * Runs when `params.promptAuditContext` is set (SSE agent / MCP panel) or `AGENT_SAM_PROMPT_AUDIT` is truthy on env.
 */
function maybeLogAgentChatPromptAudit(env, params, resolvedModelKey, meta) {
  const rawCtx = params.promptAuditContext;
  const enabledByEnv = agentPromptAuditEnvEnabled(env);
  if (!enabledByEnv && (rawCtx === undefined || rawCtx === null)) return;

  const { systemPrompt, messages, tools = [] } = params;
  const platform = String(meta?.api_platform || 'unknown').toLowerCase();
  const providerHint = meta?.provider != null ? String(meta.provider) : null;
  const messagesJson = JSON.stringify(messages || []);
  const toolsJson = JSON.stringify(tools || []);
  const sysStr = systemPromptStringForAudit(systemPrompt);
  const estimatedMessageTokens = estimateTokensFromChars(messagesJson);
  const estimatedToolTokens = estimateTokensFromChars(toolsJson);
  const estimatedSystemTokens = estimateTokensFromChars(sysStr);
  const narrowCtx =
    rawCtx && typeof rawCtx === 'object'
      ? {
          route: rawCtx.route,
          agent_id: rawCtx.agent_id,
          session_id: rawCtx.session_id,
          workspace_id: rawCtx.workspace_id,
          mode: rawCtx.mode,
          intent_slug: rawCtx.intent_slug,
          capability_families: Array.isArray(rawCtx.capability_families)
            ? rawCtx.capability_families.slice(0, 32).map((x) => String(x || '').slice(0, 64))
            : undefined,
          loop_turn: rawCtx.loop_turn,
          pause_turn_continuation: rawCtx.pause_turn_continuation,
          mcp_slug: rawCtx.mcp_slug,
        }
      : {};
  const promptAudit = {
    source: 'agent_chat_prompt_audit',
    model_key: resolvedModelKey,
    api_platform: platform,
    provider: providerHint,
    provider_model_id:
      meta?.provider_model_id != null && String(meta.provider_model_id).trim() !== ''
        ? String(meta.provider_model_id).trim()
        : null,
    message_count: Array.isArray(messages) ? messages.length : 0,
    tool_count: Array.isArray(tools) ? tools.length : 0,
    messages_chars: safeJsonLength(messages),
    tools_chars: safeJsonLength(tools),
    system_prompt_chars: sysStr.length,
    estimated_message_tokens: estimatedMessageTokens,
    estimated_tool_tokens: estimatedToolTokens,
    estimated_system_tokens: estimatedSystemTokens,
    estimated_total_prompt_tokens:
      estimatedMessageTokens + estimatedToolTokens + estimatedSystemTokens,
    tool_names: toolNamesForPromptAudit(tools),
    ...Object.fromEntries(Object.entries(narrowCtx).filter(([, v]) => v !== undefined)),
    created_at: new Date().toISOString(),
  };
  console.log('[agent_prompt_audit]', JSON.stringify(promptAudit));
}

export async function dispatchStream(env, request, params) {
  const modelKey = await resolveAutoModelKey(env, params);
  if (modelKey == null || String(modelKey).trim() === '') {
    return jsonResponse(
      {
        error: 'No routable model for auto selection',
        detail: 'Configure agentsam_routing_arms (and agentsam_model_catalog) or set model explicitly.',
      },
      503,
    );
  }
  const { systemPrompt, messages, tools = [], options = {}, userId, anthropicContainerId } = params;
  const meta = await resolveModelMeta(env, modelKey);
  maybeLogAgentChatPromptAudit(env, params, modelKey, meta);
  const platform = resolveDispatchPlatform(meta);
  const providerModelId =
    meta?.provider_model_id != null && String(meta.provider_model_id).trim() !== ''
      ? String(meta.provider_model_id).trim()
      : null;
  const modelForUpstream = providerModelId || modelKey;
  const catalogMaxOut = Number(meta?.max_output_tokens ?? meta?.output_max_tokens ?? 0);
  const optMaxOut = Number(options.maxOutputTokens ?? 0);
  const maxOutputTokens =
    optMaxOut > 0 ? optMaxOut : catalogMaxOut > 0 ? catalogMaxOut : undefined;
  const routingArmId =
    params.routingArmId ?? params.routing_arm_id ?? options.routingArmId ?? options.routing_arm_id ?? null;
  const dp = {
    modelKey,
    providerModelId,
    systemPrompt,
    messages,
    tools,
    userId,
    secretKeyName: meta?.secret_key_name ?? null,
    provider: meta?.provider ?? null,
    apiPlatform: platform,
    openaiPreviousResponseId: params.openaiPreviousResponseId ?? null,
    ...(params.forcedToolName
      ? { forcedToolName: String(params.forcedToolName).trim() }
      : {}),
    ...options,
    ...(maxOutputTokens != null ? { maxOutputTokens } : {}),
    ...(routingArmId != null && String(routingArmId).trim() !== ''
      ? { routingArmId: String(routingArmId).trim() }
      : {}),
    ...(params.reasoningEffort != null ? { reasoningEffort: params.reasoningEffort } : {}),
    ...(params.taskType != null && String(params.taskType).trim() !== ''
      ? { taskType: String(params.taskType).trim() }
      : {}),
    ...(params.mode != null && String(params.mode).trim() !== ''
      ? { mode: String(params.mode).trim() }
      : {}),
    ...(params.lane != null && String(params.lane).trim() !== ''
      ? { lane: String(params.lane).trim() }
      : {}),
    ...(params.signal != null ? { signal: params.signal } : {}),
    ...deepseekDispatchExtras(meta, options),
  };

  switch (platform) {
    case 'deepseek':
    case 'openai':
    case 'openai_chat_completions':
      return chatWithToolsOpenAI(env, request, dp);
    case 'openai_responses':
    case 'responses':
      return chatWithToolsOpenAIResponses(env, request, dp);
    case 'gemini_api':
      return chatWithToolsGemini(env, request, dp);
    case 'vertex':
      return chatWithToolsVertex(env, request, dp);
    case 'workers_ai':
      return dispatchWorkersAI(env, request, dp);
    case 'ollama':
      return dispatchOllama(env, request, dp);
    case 'anthropic':
    case 'anthropic_messages': {
      const anthropicEffort =
        normalizeAnthropicEffort(params.reasoningEffort) ||
        normalizeAnthropicEffort(meta?.effort) ||
        normalizeAnthropicEffort(options.effort);
      const anthropicOptions = omitAnthropicTemperature(options);
      return chatWithAnthropic({
        messages, tools, env, userId,
        options: {
          model: modelForUpstream,
          catalogModelKey: modelKey,
          systemPrompt,
          ...(params.taskType != null && String(params.taskType).trim() !== ''
            ? { routingTaskType: String(params.taskType).trim() }
            : {}),
          ...(params.promptCaching != null ? { promptCaching: params.promptCaching } : {}),
          ...(params.cacheTtl != null ? { cacheTtl: params.cacheTtl } : {}),
          ...(anthropicEffort ? { effort: anthropicEffort } : {}),
          ...(params.reasoningEffort != null
            ? { reasoningEffort: params.reasoningEffort }
            : {}),
          ...anthropicOptions,
          ...(params.forcedToolName
            ? { tool_choice: { type: 'tool', name: String(params.forcedToolName) } }
            : {}),
          ...(anthropicContainerId != null && String(anthropicContainerId).trim() !== ''
            ? { container: String(anthropicContainerId).trim() }
            : {}),
          ...(params.signal != null ? { signal: params.signal } : {}),
        },
      });
    }
    case 'cursor_sdk':
      return dispatchCursorComposerStream(env, request, {
        ...dp,
        agentRunId: params.agentRunId ?? params.agent_run_id ?? null,
        routingArmId: params.routingArmId ?? params.routing_arm_id ?? null,
        workspaceId: params.workspaceId ?? params.workspace_id ?? null,
        tenantId: params.tenantId ?? params.tenant_id ?? null,
      });
    default:
      throw new Error(
        `[dispatchProviderChat] unsupported api_platform: "${platform}" for model "${modelKey}". ` +
        `Check agentsam_model_catalog.api_platform — expected one of: deepseek, openai, openai_chat_completions, openai_responses, anthropic, gemini_api, vertex, workers_ai, ollama, cursor_sdk.`
      );
  }
}

export async function dispatchComplete(env, params) {
  const modelKey = await resolveAutoModelKey(env, params);
  if (modelKey == null || String(modelKey).trim() === '') {
    throw new Error('No routable model for auto selection; configure agentsam_routing_arms or agentsam_model_catalog.');
  }
  const { systemPrompt, messages, tools = [], options = {}, userId } = params;
  const meta = await resolveModelMeta(env, modelKey);
  const platform = resolveDispatchPlatform(meta);
  const providerModelId =
    meta?.provider_model_id != null && String(meta.provider_model_id).trim() !== ''
      ? String(meta.provider_model_id).trim()
      : null;
  const modelForUpstream = providerModelId || modelKey;
  const catalogMaxOut = Number(meta?.max_output_tokens ?? meta?.output_max_tokens ?? 0);
  const optMaxOut = Number(options.maxOutputTokens ?? 0);
  const maxOutputTokens =
    optMaxOut > 0 ? optMaxOut : catalogMaxOut > 0 ? catalogMaxOut : undefined;

  const completeOpts = {
    modelKey,
    providerModelId,
    systemPrompt,
    messages,
    tools,
    userId,
    secretKeyName: meta?.secret_key_name ?? null,
    provider: meta?.provider ?? null,
    apiPlatform: platform,
    reasoningEffort: options.reasoningEffort || 'none',
    verbosity: options.verbosity || 'low',
    ...(maxOutputTokens != null ? { maxOutputTokens } : {}),
    ...deepseekDispatchExtras(meta, options),
  };

  if (platform === 'deepseek' || platform === 'openai' || platform === 'openai_chat_completions') {
    return completeWithOpenAI(env, completeOpts);
  }

  if (platform === 'openai_responses' || platform === 'responses') {
    return completeWithOpenAIResponsesNonStream(env, {
      ...completeOpts,
      openaiPreviousResponseId: params.openaiPreviousResponseId ?? null,
    });
  }

  if (platform === 'gemini_api') {
    return completeWithGemini(env, completeOpts);
  }

  if (isAnthropicDispatchPlatform(platform, meta?.provider)) {
    const res = await chatWithAnthropic({
      messages,
      tools,
      env,
      userId,
      options: { model: modelForUpstream, catalogModelKey: modelKey, systemPrompt, stream: false },
    });
    if (res instanceof Response) {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (_) {
        return { text };
      }
    }
    return res;
  }

  throw new Error(
    `[dispatchComplete] unsupported api_platform: "${platform}" for model "${modelKey}". ` +
      'Use deepseek, openai, openai_responses, gemini_api, or anthropic.',
  );
}

/** Prefer an active OpenAI *chat* catalog row for Workers AI → OpenAI failover (never STT/TTS). */
async function pickOpenAiFallbackModelKeyFromCatalog(env) {
  const db = env?.DB;
  if (!db) return null;
  const cols = await pragmaTableInfo(db, 'agentsam_model_catalog');
  if (!cols.has('model_key') || !cols.has('provider')) return null;
  const scope =
    cols.has('tenant_id') && cols.has('workspace_id')
      ? `AND COALESCE(tenant_id,'') = '' AND COALESCE(workspace_id,'') = ''`
      : '';
  const hasTier = cols.has('tier');
  const hasDegraded = cols.has('is_degraded');
  const degradedClause = hasDegraded ? `AND COALESCE(is_degraded,0) = 0` : '';
  const chatGuard = catalogChatFallbackSqlGuard({
    openaiModelIdExpr: cols.has('openai_model_id') ? 'openai_model_id' : null,
    hasSupportsTools: cols.has('supports_tools'),
    hasRoutingLane: cols.has('routing_lane'),
    requireTools: true,
  });
  const orderBy = hasTier
    ? `CASE LOWER(COALESCE(tier,'')) WHEN 'micro' THEN 0 WHEN 'flash' THEN 1 WHEN 'standard' THEN 2 WHEN 'power' THEN 3 WHEN 'reasoning' THEN 4 WHEN 'frontier' THEN 5 ELSE 9 END, model_key ASC`
    : 'model_key ASC';
  try {
    const row = await db
      .prepare(
        `SELECT model_key, openai_model_id, routing_lane, supports_tools FROM agentsam_model_catalog
         WHERE is_active = 1 ${degradedClause}
           AND LOWER(TRIM(provider)) = 'openai'
           ${scope}
           ${chatGuard}
         ORDER BY ${orderBy}
         LIMIT 1`,
      )
      .first();
    const key = row?.model_key != null ? String(row.model_key).trim() : null;
    if (!key || isNonChatCatalogModel(key, row)) return null;
    return key;
  } catch {
    return null;
  }
}

/**
 * Build Workers AI chat payload — reasoning_effort always from routing arm (D1), never hardcoded.
 * @param {any[]} messages
 * @param {{ reasoning_effort?: string|null }} arm
 * @param {{ maxTokens?: number, stream?: boolean }} [opts]
 */
function buildWorkersAiPayload(messages, arm, opts = {}) {
  const maxTok = opts.maxTokens ?? 2048;
  // CF docs (MiniMax M3, etc.) use max_tokens; OpenAI-compat lanes also accept max_completion_tokens.
  const payload = {
    messages,
    max_tokens: maxTok,
    max_completion_tokens: maxTok,
    ...(opts.stream != null ? { stream: opts.stream } : {}),
  };

  if (arm?.reasoning_effort) {
    payload.reasoning_effort = arm.reasoning_effort;
  }

  // Kimi (and similar reasoning models) need json_object paired with reasoning_effort=none
  // to emit content instead of reasoning_content only (benchmark 2026-05-30).
  // Do not force json_object on MiniMax / general chat pins — it breaks plain replies.
  const modelHint = String(opts.modelKey || opts.providerModelId || '').toLowerCase();
  const isKimi = modelHint.includes('kimi');
  if (arm?.reasoning_effort === 'none' && isKimi) {
    payload.response_format = { type: 'json_object' };
  }

  return payload;
}

/** @param {any} result */
function extractWorkersAiContent(result) {
  const msg = result?.choices?.[0]?.message ?? result?.choices?.[0]?.delta ?? null;
  if (!msg) {
    if (typeof result?.response === 'string' && result.response.length > 0) return result.response;
    return null;
  }
  if (typeof msg.content === 'string' && msg.content.length > 0) return msg.content;
  if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.length > 0) {
    return msg.reasoning_content;
  }
  return null;
}

/** @param {string|null|undefined} raw */
function cleanWorkersAiOutput(raw) {
  return (raw ?? '')
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
}

/** @param {any} env @param {any} params */
async function resolveWorkersAiArmFromParams(env, params) {
  const routingArmId =
    params?.routingArmId ?? params?.routing_arm_id ?? null;
  if (routingArmId && env?.DB) {
    try {
      const row = await env.DB.prepare(
        'SELECT reasoning_effort FROM agentsam_routing_arms WHERE id = ? LIMIT 1',
      )
        .bind(String(routingArmId).trim())
        .first();
      if (row) return { reasoning_effort: row.reasoning_effort ?? null };
    } catch (_) {
      /* best-effort — fall through */
    }
  }
  const modelKey = params?.modelKey != null ? String(params.modelKey).trim() : '';
  const taskType = params?.taskType ?? params?.task_type ?? null;
  if (modelKey && taskType && env?.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT reasoning_effort FROM agentsam_routing_arms
         WHERE model_key = ? AND task_type = ? AND is_active = 1
         ORDER BY priority DESC LIMIT 1`,
      )
        .bind(modelKey, String(taskType).trim())
        .first();
      if (row) return { reasoning_effort: row.reasoning_effort ?? null };
    } catch (_) {
      /* best-effort */
    }
  }
  const effort = params?.reasoningEffort ?? params?.reasoning_effort ?? null;
  return effort != null && String(effort).trim() !== ''
    ? { reasoning_effort: String(effort).trim() }
    : {};
}

function extractWorkersAiSseToken(obj) {
  const piece = extractWorkersAiContent(obj);
  if (piece) return cleanWorkersAiOutput(piece);
  if (!obj || typeof obj !== 'object') return '';
  const c0 = Array.isArray(obj.choices) ? obj.choices[0] : null;
  const t =
    c0?.text ??
    (typeof obj.response === 'string' ? obj.response : obj.response != null ? String(obj.response) : '') ??
    '';
  return cleanWorkersAiOutput(typeof t === 'string' ? t : String(t || ''));
}

function throwIfDispatchAborted(signal) {
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
}

async function dispatchWorkersAI(env, request, params) {
  const { modelKey, providerModelId, systemPrompt, messages, userId, maxOutputTokens, signal } = params;
  throwIfDispatchAborted(signal);
  const waiModel = providerModelId || modelKey;
  const waiMessages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...messages,
  ];
  const arm = await resolveWorkersAiArmFromParams(env, params);
  const waiPayload = buildWorkersAiPayload(waiMessages, arm, {
    maxTokens: maxOutputTokens ?? 2048,
    stream: true,
    modelKey,
    providerModelId,
  });

  const pinnedExplicit =
    modelKey != null &&
    String(modelKey).trim() !== '' &&
    String(modelKey).trim().toLowerCase() !== 'auto' &&
    !(params?.routingArmId || params?.routing_arm_id);

  const openAiFallback = async (reason) => {
    const detail = String(reason?.message || reason || 'workers_ai_failed');
    // Explicit picker pin: surface WAI failure — do not silently swap to OpenAI.
    if (pinnedExplicit) {
      console.warn('[provider] Workers AI pinned model failed (no silent OpenAI swap)', modelKey, detail);
      return jsonResponse(
        {
          error: 'Workers AI model failed',
          model: modelKey,
          workers_ai_model: waiModel,
          detail,
          hint:
            'Enable/enroll this model for the account in Workers AI (MiniMax M3 = minimax/m3). STT models like gpt-4o-mini-transcribe are never used as chat fallbacks.',
        },
        502,
      );
    }
    const fbKey =
      (await pickOpenAiFallbackModelKeyFromCatalog(env)) ||
      (await pickFallbackCatalogModelKey(env.DB, false)) ||
      (await pickFallbackCatalogModelKey(env.DB, true));
    console.warn('[provider] Workers AI → OpenAI fallback', fbKey || '(none)', detail);
    if (!fbKey || isNonChatCatalogModel(fbKey)) {
      return jsonResponse(
        {
          error: 'Workers AI failed and no chat-capable OpenAI fallback is configured in agentsam_model_catalog',
          detail,
        },
        503,
      );
    }
    const fbMeta = await resolveModelMeta(env, fbKey);
    if (isNonChatCatalogModel(fbKey, fbMeta)) {
      return jsonResponse(
        {
          error: 'Workers AI failed; refused non-chat OpenAI fallback',
          detail,
          refused_fallback: fbKey,
        },
        503,
      );
    }
    const openaiKey = await resolveOpenAiApiKey(env, fbKey, userId, {
      secretKeyName: fbMeta?.secret_key_name,
    });
    if (!openaiKey) {
      return jsonResponse(
        { error: 'Workers AI failed and OpenAI is not configured', detail },
        503,
      );
    }
    return chatWithToolsOpenAI(env, request, {
      ...params,
      modelKey: fbKey,
      providerModelId:
        fbMeta?.provider_model_id != null && String(fbMeta.provider_model_id).trim() !== ''
          ? String(fbMeta.provider_model_id).trim()
          : null,
      secretKeyName: fbMeta?.secret_key_name ?? null,
    });
  };

  if (!env.AI) return openAiFallback('AI binding not available');

  let response;
  try {
    throwIfDispatchAborted(signal);
    response = await env.AI.run(waiModel, waiPayload);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return openAiFallback(e);
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const writeToken = async (text) => {
    if (text == null || text === '') return;
    const line = `data: ${JSON.stringify({ type: 'token', text: String(text) })}\n\n`;
    await writer.write(encoder.encode(line));
  };

  void (async () => {
    try {
      if (response instanceof ReadableStream) {
        const reader = response.getReader();
        const dec = new TextDecoder();
        let buf = '';
        const onAbort = () => {
          reader.cancel('aborted').catch(() => {});
        };
        signal?.addEventListener?.('abort', onAbort, { once: true });
        try {
        while (true) {
          throwIfDispatchAborted(signal);
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            const t = line.trim();
            if (!t || t === 'data: [DONE]' || t === 'data:[DONE]') continue;
            const jsonStr = t.startsWith('data:') ? t.slice(t.indexOf(':') + 1).trim() : t;
            let j;
            try {
              j = JSON.parse(jsonStr);
            } catch {
              if (!t.startsWith('data:') && !t.startsWith('event:') && t[0] !== ':') {
                await writeToken(t);
              }
              continue;
            }
            const piece = extractWorkersAiSseToken(j);
            if (piece) await writeToken(piece);
          }
        }
        const tail = buf.trim();
        if (tail) {
          try {
            const piece = extractWorkersAiSseToken(JSON.parse(tail));
            if (piece) await writeToken(piece);
          } catch {
            await writeToken(tail);
          }
        }
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        } finally {
          signal?.removeEventListener?.('abort', onAbort);
        }
      } else {
        throwIfDispatchAborted(signal);
        let text = extractWorkersAiContent(response) ?? '';
        if (!text && typeof response?.response === 'string') text = response.response;
        else if (!text && response?.response != null && typeof response.response !== 'object') {
          text = String(response.response);
        } else if (!text && typeof response === 'string') text = response;
        await writeToken(cleanWorkersAiOutput(text));
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      }
    } catch (e) {
      console.warn('[provider] Workers AI stream failed mid-flight', e?.message || e);
      try {
        if (pinnedExplicit) {
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                error: 'workers_ai_failed',
                model: modelKey,
                detail: String(e?.message || e),
              })}\n\n`,
            ),
          );
        } else {
          const fbKey =
            (await pickOpenAiFallbackModelKeyFromCatalog(env)) ||
            (await pickFallbackCatalogModelKey(env.DB, false)) ||
            (await pickFallbackCatalogModelKey(env.DB, true));
          const fbMeta = fbKey && !isNonChatCatalogModel(fbKey) ? await resolveModelMeta(env, fbKey) : null;
          const fb =
            fbKey && fbMeta && !isNonChatCatalogModel(fbKey, fbMeta)
              ? await chatWithToolsOpenAI(env, request, {
                  ...params,
                  modelKey: fbKey,
                  providerModelId:
                    fbMeta?.provider_model_id != null && String(fbMeta.provider_model_id).trim() !== ''
                      ? String(fbMeta.provider_model_id).trim()
                      : null,
                  secretKeyName: fbMeta?.secret_key_name ?? null,
                })
              : null;
          if (fb instanceof Response && fb.ok && fb.body) {
            const rdr = fb.body.getReader();
            while (true) {
              const { done, value } = await rdr.read();
              if (done) break;
              if (value?.byteLength) await writer.write(value);
            }
          } else if (fb instanceof Response) {
            console.warn('[provider] Workers AI OpenAI fallback HTTP', fb.status);
            await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'stream_unavailable' })}\n\n`));
          } else if (!fb) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'stream_unavailable' })}\n\n`));
          }
        }
      } catch (e2) {
        console.warn('[provider] Workers AI OpenAI fallback threw', e2?.message ?? e2);
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'stream_unavailable' })}\n\n`));
      }
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
  });
}

async function dispatchOllama(env, request, params) {
  const base =
    (env.OLLAMA_BASE_URL && String(env.OLLAMA_BASE_URL).trim()) ||
    (env.OLLAMA_TUNNEL_URL && String(env.OLLAMA_TUNNEL_URL).trim()) ||
    'https://ollama.inneranimalmedia.com';
  const { modelKey, providerModelId, systemPrompt, messages } = params;
  const ollamaModel = providerModelId || modelKey;
  const ollamaMessages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...messages,
  ];
  try {
    const upstream = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.OLLAMA_CF_CLIENT_ID && env.OLLAMA_CF_CLIENT_SECRET
          ? {
              'CF-Access-Client-Id': env.OLLAMA_CF_CLIENT_ID,
              'CF-Access-Client-Secret': env.OLLAMA_CF_CLIENT_SECRET,
            }
          : {}),
      },
      body: JSON.stringify({ model: ollamaModel, messages: ollamaMessages, stream: true, keep_alive: '10m' }),
    });
    if (!upstream.ok) {
      if (upstream.status === 403) {
        console.warn('[provider] Ollama upstream 403; continuing provider chain');
        throw new Error(OLLAMA_SKIP_MESSAGE);
      }
      console.warn('[provider] Ollama upstream error', upstream.status);
      throw new Error(OLLAMA_SKIP_MESSAGE);
    }
    return new Response(upstream.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    if (String(e?.message || '') === OLLAMA_SKIP_MESSAGE) throw e;
    const msg = String(e?.message || e || '');
    const refused = /ECONNREFUSED|connection refused|Failed to fetch|NetworkError/i.test(msg);
    if (refused) {
      console.warn('[provider] Ollama connection refused or unreachable; continuing provider chain');
    } else {
      console.warn('[provider] Ollama unavailable; continuing provider chain');
    }
    throw new Error(OLLAMA_SKIP_MESSAGE);
  }
}
