import {
  resolveModelForTask,
  normalizeCanonicalTaskType,
} from './resolveModel.js';
import { estimateModelRunCostUsd } from './model-pricing.js';
import {
  resolveRoutingArmByModelKey,
  loadChatRoutingArmsModelKeyOrder,
} from './routing.js';
import { isEtoThompsonOwner } from './performance-eto.js';
import { triggerEvalAfterNRuns } from './eval-runner.js';
import { inferIntentHeuristically } from '../api/agent/classify-intent.js';
import { parseJsonSafe } from './agent-prompt-builder.js';

let modelTierMigrationStarted = false;

const AI_MODEL_ROW_SQL = `id, name, provider, model_key, api_platform,
  secret_key_name, supports_tools, supports_vision,
  supports_cache, context_max_tokens, output_max_tokens,
  input_rate_per_mtok, output_rate_per_mtok,
  cache_write_rate_per_mtok, cache_read_rate_per_mtok,
  cache_write_1h_rate_per_mtok, pricing_extras_json,
  size_class, sort_order, tool_invocation_style,
  thinking_mode, effort, system_prompt,
  features_json, picker_group, is_global,
  allowed_tenants_json`;

export async function routingPickFromResolveModelForTask(env, {
  taskType,
  mode,
  workspaceId,
  tenantId,
  toolRequired,
}) {
  if (!env?.DB || !taskType || !workspaceId) return null;
  try {
    const resolved = await resolveModelForTask(env, {
      task_type: normalizeCanonicalTaskType(taskType),
      mode: mode != null && String(mode).trim() !== '' ? String(mode).trim() : 'agent',
      workspace_id: String(workspaceId).trim(),
      tenant_id: tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : undefined,
      require_tools: !!toolRequired,
    });
    const aiRow = await resolveAgentsamAiRowByModelKey(env, tenantId, resolved.model_key);
    const modelIdRaw = aiRow?.id != null ? String(aiRow.id).trim() : '';
    if (!modelIdRaw) return null;
    return {
      source: resolved.resolution_source === 'thompson' ? 'thompson' : resolved.resolution_source,
      modelId: modelIdRaw,
      modelKey: resolved.model_key,
      provider: resolved.provider ?? aiRow?.provider ?? null,
      armId: resolved.routing_arm_id != null ? String(resolved.routing_arm_id).trim() : '',
      taskType: String(taskType).trim(),
      fallbackModelKey: null,
    };
  } catch (e) {
    console.warn('[agent] routingPickFromResolveModelForTask', e?.message ?? e);
    return null;
  }
}

/** USD from agentsam_model_pricing (via estimateModelRunCostUsd pricing spine). */
export async function fetchModelCostUsd(env, modelKey, inputTokens, outputTokens, cacheReadTokens = 0) {
  if (!env?.DB || !modelKey || (!inputTokens && !outputTokens)) return 0;
  try {
    const priced = await estimateModelRunCostUsd(env.DB, {
      modelKey: String(modelKey),
      inputTokens: Math.max(0, Math.floor(Number(inputTokens) || 0)),
      outputTokens: Math.max(0, Math.floor(Number(outputTokens) || 0)),
      cacheReadTokens: Math.max(0, Math.floor(Number(cacheReadTokens) || 0)),
    });
    return Number(priced?.costUsd) || 0;
  } catch {
    return 0;
  }
}

const WRITE_LIKE_PREFIXES = ['d1_', 'worker_', 'resend_', 'meshyai_'];
const TERM_WRITE_TOOLS = new Set(['terminal_run', 'terminal_execute', 'run_command', 'bash']);

/**
 * POST /api/agent/tool-smoke ONLY — default-safe denylist for blind / unaudited smoke runs.
 *
 * Do NOT import or reuse this set for: /api/agent/chat, MCP dispatch, branded catalog routing,
 * workflow execution, approvals, or any runtime tool selection. Agent runtime safety is
 * route requirements + branded MCP catalog + approval + entitlements (see mcp-tools-branded,
 * resolveAgentChatRouteToolRequirements, validateToolCall).
 *
 * Smoke safety is a test-harness concern; collapsing it into global Agent Sam policy is wrong.
 */
const TOOL_SMOKE_DEFAULT_SAFE_DENYLIST = new Set([
  'cdt_evaluate_script',
  'cdt_upload_file',
  'd1_write',
  'd1_batch_write',
  'worker_deploy',
  'resend_send_broadcast',
  'resend_create_api_key',
  'meshyai_image_to_3d',
  'meshyai_text_to_3d',
  'meshyai_animation',
  'meshyai_rigging',
  'meshyai_retexture',
  'meshyai_remesh',
  'meshyai_convert',
  'meshyai_resize',
  'meshyai_uv_unwrap',
  'meshyai_print_multi_color',
  'agentsam_run_agent',
  'python_execute',
  'terminal_run',
  'terminal_execute',
  'run_command',
  'bash',
]);

/** Registry keys in `agentsam_prompt_versions.prompt_key` — content always loaded from D1. */
const TENANT_KNOWLEDGE_PLATFORM = 'tenant_knowledge_platform';
const TENANT_SHINSHU = 'tenant_jake_waalk';

/**
 * Effective workspace_id via resolveEffectiveWorkspaceId (header/session/tenant/membership).
 * @param {any} env
 * @param {Request} request
 * @param {string|null|undefined} userId
 * @param {Record<string, unknown>} [cache]
 */
/** Derives cost tier label from agentsam_ai.features_json for workspace tier gating. */
export function modelCostTierFromRow(row) {
  const meta = parseJsonSafe(row?.features_json ?? row?.metadata_json, {}) || {};
  const t = meta.cost_tier;
  if (t != null && String(t).trim() !== '') return String(t).trim();
  return 'free';
}

/**
 * Restricts the candidate model chain to tiers allowed for this workspace (agentsam_model_tier).
 */
export async function filterWorkspaceModelTierPool(env, workspaceId, chainRows) {
  if (!env?.DB || !workspaceId || !chainRows?.length) return chainRows || [];
  try {
    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM agentsam_model_tier',
    ).first();
    if (!count?.n) return chainRows;
  } catch {
    return chainRows;
  }
  try {
    const { results } = await env.DB.prepare(
      `SELECT cost_tier FROM agentsam_model_tier
       WHERE workspace_id = ? AND is_active = 1
       ORDER BY tier_level ASC`,
    )
      .bind(String(workspaceId).trim())
      .all();
    const rows = results || [];
    if (!rows.length) return chainRows;
    const allowed = new Set(
      rows
        .map((r) => r?.cost_tier)
        .filter((t) => t != null && String(t).trim() !== '')
        .map((t) => String(t).trim()),
    );
    if (!allowed.size) return chainRows;
    return chainRows.filter((r) => { const ct = modelCostTierFromRow(r); return !ct || allowed.has(ct); });
  } catch (e) {
    console.warn('[agent] model tier filter', e?.message ?? e);
    return chainRows;
  }
}

export async function resolveDefaultModel(env, tenantId) {
  if (!env.DB || !tenantId || String(tenantId).trim() === '') return null;
  try {
    const row = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND COALESCE(supports_tools, 0) = 1
         AND LOWER(COALESCE(api_platform, '')) != 'workers_ai'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       ORDER BY COALESCE(input_rate_per_mtok, 999999) ASC
       LIMIT 1`,
    ).bind(tenantId).first();
    if (row?.model_key) return row.model_key;
    const fb = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND COALESCE(supports_tools, 0) = 1
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       ORDER BY COALESCE(input_rate_per_mtok, 999999) ASC LIMIT 1`,
    ).bind(tenantId).first();
    return fb?.model_key || null;
  } catch (_) {
    return null;
  }
}

export async function resolveAiModelRowById(env, id, tenantIdOpt) {
  if (!env.DB || id == null || id === '') return null;
  const tenantId =
    tenantIdOpt != null && String(tenantIdOpt).trim() !== ''
      ? String(tenantIdOpt).trim()
      : null;
  if (!tenantId) return null;
  try {
    return await env.DB.prepare(
      `SELECT ${AI_MODEL_ROW_SQL}
       FROM agentsam_ai
       WHERE id = ?
         AND mode = 'model' AND status = 'active'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       LIMIT 1`,
    ).bind(id, tenantId).first();
  } catch (_) {
    return null;
  }
}

export function metadataObject(row) {
  return parseJsonSafe(row?.features_json ?? row?.metadata_json, {}) || {};
}

export function rowIsGranite(row) {
  const mk = String(row?.model_key || '').toLowerCase();
  if (mk.includes('granite')) return true;
  const meta = metadataObject(row);
  if (meta.fallback_only === true) return true;
  return false;
}

/** External paid/cloud APIs — excludes Workers AI / Cloudflare-hosted chat fallbacks. */
export function rowIsExternalProvider(row) {
  const plat = String(row?.api_platform || '').toLowerCase();
  const prov = String(row?.provider || '').toLowerCase();
  if (plat === 'workers_ai' || prov === 'cloudflare') return false;
  return true;
}

export async function resolveAiModelFromRequest(env, body, tenantIdCtx) {
  const tenantId =
    tenantIdCtx != null && String(tenantIdCtx).trim() !== ''
      ? String(tenantIdCtx).trim()
      : body?.tenant_id != null && String(body.tenant_id).trim() !== ''
        ? String(body.tenant_id).trim()
        : null;
  if (!tenantId) {
    return { row: null, rawRequestedKey: null, rawRequestedId: null };
  }
  const rawId =
    body?.model_id != null && String(body.model_id).trim() !== ''
      ? String(body.model_id).trim()
      : body?.modelId != null && String(body.modelId).trim() !== ''
        ? String(body.modelId).trim()
        : '';
  let rawKey =
    body?.model != null && String(body.model).trim() !== ''
      ? String(body.model).trim()
      : body?.model_key != null && String(body.model_key).trim() !== ''
        ? String(body.model_key).trim()
        : body?.modelKey != null && String(body.modelKey).trim() !== ''
          ? String(body.modelKey).trim()
          : '';
  if (/^auto$/i.test(rawKey)) rawKey = '';
  if (!env.DB) {
    return { row: null, rawRequestedKey: rawKey || null, rawRequestedId: rawId || null };
  }
  try {
    if (rawId || rawKey) {
      const needle = rawId || rawKey;
      const row = await env.DB.prepare(
        `SELECT ${AI_MODEL_ROW_SQL}
         FROM agentsam_ai
         WHERE (id = ? OR model_key = ?)
           AND mode = 'model' AND status = 'active'
           AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         LIMIT 1`,
      )
        .bind(needle, needle, tenantId)
        .first();
      if (row) {
        if (rawId) {
          return { row, rawRequestedKey: rawKey || row.model_key, rawRequestedId: rawId };
        }
        return { row, rawRequestedKey: rawKey, rawRequestedId: rawId || null };
      }
    }
  } catch (_) {
    /* fallthrough */
  }
  return { row: null, rawRequestedKey: rawKey || null, rawRequestedId: rawId || null };
}

/** Ask SSE fast path: explicit request or route preference, then canonical routing resolution. */
export async function resolveAskFastModelKey(env, body, tenantId, workspaceId, promptRouteRow) {
  const { row } = await resolveAiModelFromRequest(env, body, tenantId);
  const tid = tenantId != null ? String(tenantId).trim() : '';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  const requestedModelKey = row?.model_key ? String(row.model_key).trim() : '';
  if (!env?.DB) {
    return requestedModelKey
      ? { model_key: requestedModelKey, routing_arm_id: null }
      : null;
  }
  try {
    let requestedForResolver = requestedModelKey || null;
    if (!requestedForResolver && promptRouteRow?.preferred_model) {
      const pref = String(promptRouteRow.preferred_model).trim();
      if (pref) {
        const pr = await resolveAgentsamAiRowByModelKey(env, tid, pref);
        if (pr?.model_key) requestedForResolver = String(pr.model_key).trim();
      }
    }
    if (!requestedForResolver && promptRouteRow?.fallback_model) {
      const fb = String(promptRouteRow.fallback_model).trim();
      if (fb) {
        const fr = await resolveAgentsamAiRowByModelKey(env, tid, fb);
        if (fr?.model_key) requestedForResolver = String(fr.model_key).trim();
      }
    }
    const resolved = await resolveModelForTask(env, {
      task_type: 'ask',
      mode: 'ask',
      requested_model_key: requestedForResolver,
      workspace_id: ws || null,
      tenant_id: tid || null,
      require_tools: false,
    });
    return resolved?.model_key ? resolved : null;
  } catch (_) {
    /* fall through */
  }
  return null;
}

export function normalizeGateParseFailure(originalMessage) {
  return { intent: 'auto', rewritten_query: originalMessage, confidence: 0.75 };
}

/** Map heuristic taskType + mode → routing arm intent_slug prefix (e.g. code_agent). */
export function intentSlugFromHeuristic(taskType, mode, modeConfig) {
  const tt = normalizeCanonicalTaskType(taskType || 'ask');
  const md =
    String(mode || modeConfig?.slug || modeConfig?.mode || 'agent').trim().toLowerCase() || 'agent';
  return `${tt}_${md}`;
}

export async function gateRewriteAndClassify(_env, modeConfig, message, _tenantId) {
  const { taskType, mode } = inferIntentHeuristically(message);
  const intentSlug = intentSlugFromHeuristic(taskType, mode, modeConfig);
  return {
    intent: intentSlug,
    rewritten_query: message,
    confidence: 0.85,
    taskType,
    mode,
  };
}

/**
 * D1 agentsam_capability_aliases → preferred tool_key names for a classified taskType.
 * @param {any} env
 * @param {string} taskType
 * @returns {Promise<string[]>}
 */
export async function recordArmOutcome(env, ctx, armId, success, routingInfo) {
  if (!env.DB || !armId) return;
  try {
    const etoOwner = await isEtoThompsonOwner(env);
    if (etoOwner) {
      await env.DB.prepare(
        `UPDATE agentsam_routing_arms SET
          total_executions = COALESCE(total_executions, 0) + 1,
          updated_at = unixepoch()
         WHERE id = ?`,
      )
        .bind(armId)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE agentsam_routing_arms SET
          total_executions = total_executions + 1,
          success_alpha = success_alpha + CASE WHEN ? THEN 0.5 ELSE 0 END,
          success_beta  = success_beta  + CASE WHEN ? THEN 0 ELSE 0.5 END,
          decayed_score = (success_alpha + CASE WHEN ? THEN 0.5 ELSE 0 END) /
            (success_alpha + success_beta + 1.0) *
            pow(0.995, CAST((unixepoch() - last_decay_at) AS REAL) / 86400.0),
          last_decay_at = unixepoch(),
          updated_at = unixepoch()
        WHERE id = ?`,
      )
        .bind(success ? 1 : 0, success ? 1 : 0, success ? 1 : 0, armId)
        .run();
    }

    if (ctx?.waitUntil && routingInfo) {
      ctx.waitUntil(triggerEvalAfterNRuns(env, ctx, {
        armId,
        taskType: routingInfo.taskType,
        mode: routingInfo.mode,
        modelKey: routingInfo.modelKey,
        workspaceId: routingInfo.workspaceId
      }).catch(e => console.warn('[eval] triggerEvalAfterNRuns failed:', e?.message)));
    }
  } catch (e) {
    console.warn('[routing] recordArmOutcome failed:', e?.message);
  }
}

/** Vague "create a skill" requests should interview first, not auto-run the plan executor. */
export function dedupeModelsByKey(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const k = r?.model_key;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** DB-driven tool-capable fallback chain (canonical agentsam_ai only). */
export async function loadToolFallbackChain(env, opts = {}) {
  if (!env.DB) return [];
  const tenantId =
    opts.tenantId != null && String(opts.tenantId).trim() !== ''
      ? String(opts.tenantId).trim()
      : '';
  if (!tenantId) return [];
  const excludeModelKeys = Array.isArray(opts.excludeModelKeys)
    ? [...new Set(opts.excludeModelKeys.map((k) => String(k || '').trim()).filter(Boolean))]
    : [];
  const limRaw = Number(opts.limit);
  const lim = Number.isFinite(limRaw) && limRaw > 0 ? Math.min(Math.floor(limRaw), 50) : 3;
  try {
    let sql = `SELECT ${AI_MODEL_ROW_SQL}
       FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND supports_tools = 1
         AND model_key IS NOT NULL
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         AND api_platform NOT IN ('workers_ai', 'ollama')`;
    const binds = [tenantId];
    if (excludeModelKeys.length) {
      sql += ` AND model_key NOT IN (${excludeModelKeys.map(() => '?').join(',')})`;
      binds.push(...excludeModelKeys);
    }
    sql += ` ORDER BY COALESCE(sort_order, 999999) ASC LIMIT ?`;
    binds.push(lim);
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return results || [];
  } catch (_) {
    return [];
  }
}

export async function resolveAgentsamAiRowByModelKey(env, tenantId, modelKey) {
  if (!env.DB || !tenantId || !modelKey) return null;
  const mk = String(modelKey).trim();
  if (!mk) return null;
  try {
    return await env.DB.prepare(
      `SELECT ${AI_MODEL_ROW_SQL}
       FROM agentsam_ai
       WHERE model_key = ?
         AND mode = 'model' AND status = 'active'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       LIMIT 1`,
    ).bind(mk, tenantId).first();
  } catch (_) {
    return null;
  }
}

export async function loadAgentsamAiActiveModelKeysOrdered(env) {
  if (!env?.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai WHERE mode = 'model' AND status = 'active' ORDER BY sort_order ASC, name ASC LIMIT 40`,
    ).all();
    return (results || []).map((r) => String(r.model_key || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Chat SSE tail of the model chain: `agentsam_routing_arms` (chat + mode + is_eligible, decayed_score),
 * resolved to `agentsam_ai` rows; then catalog-ordered keys and active `agentsam_ai` rows from D1 (no hardcoded SKUs).
 */
export async function loadChatRoutingFallbackRows(env, opts = {}) {
  const tenantId =
    opts.tenantId != null && String(opts.tenantId).trim() !== ''
      ? String(opts.tenantId).trim()
      : '';
  if (!tenantId) return [];
  const mode = opts.mode;
  const excludeModelKeys = Array.isArray(opts.excludeModelKeys)
    ? opts.excludeModelKeys.map((k) => String(k || '').trim()).filter(Boolean)
    : [];
  const excludeSet = new Set(excludeModelKeys);
  const requireTools = !!opts.requireTools;

  const ws =
    opts.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : '';
  let keyOrder = await loadChatRoutingArmsModelKeyOrder(env, mode, ws, {
    toolRequired: requireTools,
    routeKey: opts.routeKey ?? null,
  });
  keyOrder = keyOrder.filter((k) => !excludeSet.has(k));

  const rows = [];
  const seen = new Set();
  const enrichWithRoutingArmId = async (r) => {
    if (!r?.model_key) return r;
    const lookup = await resolveRoutingArmByModelKey(env, {
      modelKey: String(r.model_key).trim(),
      taskType: 'chat',
      mode,
      workspaceId: ws,
    });
    return { ...r, routing_arm_id: lookup?.armId ?? null };
  };
  for (const mk of keyOrder) {
    const r = await resolveAgentsamAiRowByModelKey(env, tenantId, mk);
    if (r?.model_key && !seen.has(r.model_key)) {
      seen.add(r.model_key);
      rows.push(await enrichWithRoutingArmId(r));
    }
  }

  if (!rows.length) {
    for (const mk of await loadAgentsamAiActiveModelKeysOrdered(env)) {
      if (excludeSet.has(mk)) continue;
      const r = await resolveAgentsamAiRowByModelKey(env, tenantId, mk);
      if (r?.model_key && !seen.has(r.model_key)) {
        seen.add(r.model_key);
        rows.push(await enrichWithRoutingArmId(r));
      }
    }
  }

  return filterChainToolPolicy(rows, requireTools);
}

export function filterChainToolPolicy(rows, requireTools) {
  if (!requireTools || !rows?.length) return rows || [];
  return rows.filter((r) => Number(r.supports_tools) === 1);
}

/** AUTO routing: drop Granite when any non-Granite external provider is available in the pool. */
export function filterGraniteAutoChain(rows, externalNonGraniteExists) {
  if (!rows?.length) return [];
  if (!externalNonGraniteExists) return rows;
  return rows.filter((r) => !rowIsGranite(r));
}

export function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`timeout_after_${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export async function runModelTierMigration(env) {
  // No-op: model tiers are managed and seeded in D1 (agentsam_model_tier).
  // Kept to avoid breaking older code paths that still call this function.
  void env;
}

export function kickoffModelTierMigration(env, ctx) {
  if (modelTierMigrationStarted) return;
  modelTierMigrationStarted = true;
  try {
    const p = runModelTierMigration(env).catch((e) => {
      console.warn('[agent] model tier migration failed:', e?.message);
    });
    ctx?.waitUntil?.(p);
  } catch (e) {
    console.warn('[agent] model tier migration kickoff failed:', e?.message);
  }
}

// ─── Approval Gate ────────────────────────────────────────────────────────────

