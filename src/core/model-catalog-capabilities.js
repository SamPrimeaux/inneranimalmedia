/**
 * agentsam_model_catalog capability gates for Thompson routing + Anthropic dispatch.
 * Columns added in migration 354; cost_notes remains human-readable backup.
 */

import { pragmaTableInfo } from './retention.js';

/** Scout / triage — Haiku only */
export const SCOUT_TASK_TYPES = new Set([
  'intent_classification',
  'task_type_detection',
  'tool_prefilter',
  'cheap_summary',
  'file_relevance_triage',
  'sse_state_labeling',
  'prompt_risk_scan',
  'context_budget_estimation',
  'plan_title_generation',
  'small_json_transform',
]);

/** Production builder — Sonnet primary */
export const BUILDER_TASK_TYPES = new Set([
  'agentic_code_patch',
  'cloudflare_worker_debug',
  'typescript_react_refactor',
  'database_schema_reasoning',
  'long_context_repo_reasoning',
  'workflow_plan_generation',
  'tool_chain_planning',
  'supabase_d1_alignment',
  'code',
  'deploy',
  'debug',
  'plan',
]);

/** Boss / gated — Opus only when explicitly pinned (arms ineligible for Auto) */
export const BOSS_TASK_TYPES = new Set([
  'owner_approved_boss_check',
  'final_predeploy_sanity_check',
  'security_sensitive_review',
  'migration_approval_review',
  'high_risk_review',
  'multi_agent_arbitration',
]);

/**
 * @param {string | null | undefined} raw
 * @returns {Record<string, string>}
 */
export function parseCostNotesCapabilities(raw) {
  const out = {};
  if (raw == null || String(raw).trim() === '') return out;
  for (const part of String(raw).split(';')) {
    const p = part.trim();
    if (!p || !p.includes('=')) continue;
    const i = p.indexOf('=');
    out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  return out;
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {{
 *   routing_lane: string,
 *   supports_code_execution: boolean,
 *   supports_compaction: boolean,
 *   supports_effort_scaling: boolean,
 *   supports_apply_patch: boolean,
 *   thinking_policy: string,
 *   max_context_tokens: number,
 *   supports_prompt_cache: boolean,
 * }}
 */
export function catalogCapabilitiesFromRow(row) {
  const notes = parseCostNotesCapabilities(row?.cost_notes);
  const lane =
    row?.routing_lane != null && String(row.routing_lane).trim() !== ''
      ? String(row.routing_lane).trim()
      : notes.routing_lane || 'unknown';

  const num = (col, noteKey, fallback) => {
    if (row && row[col] != null && row[col] !== '') {
      const n = Number(row[col]);
      if (Number.isFinite(n)) return n;
    }
    if (notes[noteKey] != null) {
      const v = notes[noteKey].toLowerCase();
      if (v === '1' || v === 'true') return 1;
      if (v === '0' || v === 'false') return 0;
    }
    return fallback;
  };

  const thinking =
    row?.thinking_policy != null && String(row.thinking_policy).trim() !== ''
      ? String(row.thinking_policy).trim()
      : notes.thinking_policy || 'omitted';

  return {
    routing_lane: lane,
    supports_code_execution: num('supports_code_execution', 'supports_code_execution', 0) === 1,
    supports_compaction: num('supports_compaction', 'supports_compaction', 0) === 1,
    supports_effort_scaling: num('supports_effort_scaling', 'supports_effort_scaling', 0) === 1,
    supports_apply_patch: num('supports_apply_patch', 'supports_apply_patch', 0) === 1,
    thinking_policy: thinking,
    max_context_tokens: Math.max(
      0,
      Math.floor(
        Number(row?.context_window) ||
          Number(notes.max_context) ||
          Number(notes.max_context_tokens) ||
          0,
      ),
    ),
    supports_prompt_cache:
      num('supports_cache', 'supports_prompt_cache', 0) === 1 ||
      num('supports_prompt_cache', 'supports_prompt_cache', 0) === 1,
  };
}

/**
 * @param {import('./model-catalog-capabilities.js').ReturnType<typeof catalogCapabilitiesFromRow>} cap
 * @param {string} taskType
 * @param {boolean} toolRequired
 */
export function catalogAllowsTask(cap, taskType, toolRequired) {
  if (!cap) return true;
  const tt = String(taskType || '').trim();
  const lane = cap.routing_lane;

  if (BOSS_TASK_TYPES.has(tt)) {
    return lane === 'orchestrator' || lane === 'boss';
  }
  if (BUILDER_TASK_TYPES.has(tt)) {
    if (lane === 'scout') return false;
    if (toolRequired && !cap.supports_code_execution && lane !== 'workhorse' && lane !== 'orchestrator') {
      return false;
    }
    if (toolRequired && !cap.supports_code_execution) return false;
    return lane === 'workhorse' || lane === 'orchestrator';
  }
  if (tt === 'chat') {
    if (toolRequired) return lane === 'workhorse' || lane === 'orchestrator';
    return lane === 'scout' || lane === 'workhorse';
  }
  if (SCOUT_TASK_TYPES.has(tt)) {
    if (lane === 'workhorse' || lane === 'orchestrator') return false;
    return lane === 'scout';
  }
  return true;
}

/**
 * @param {any} env
 * @param {string} modelKey
 */
export async function loadCatalogCapabilities(env, modelKey) {
  const mk = modelKey != null ? String(modelKey).trim() : '';
  if (!mk || !env?.DB) return null;
  const cols = await pragmaTableInfo(env.DB, 'agentsam_model_catalog');
  if (!cols.has('model_key')) return null;

  const select = ['model_key', 'cost_notes', 'context_window'];
  for (const c of [
    'routing_lane',
    'supports_code_execution',
    'supports_compaction',
    'supports_effort_scaling',
    'supports_apply_patch',
    'thinking_policy',
    'supports_cache',
    'supports_prompt_cache',
  ]) {
    if (cols.has(c)) select.push(c);
  }

  try {
    const row = await env.DB.prepare(
      `SELECT ${select.join(', ')} FROM agentsam_model_catalog WHERE model_key = ? AND is_active = 1 LIMIT 1`,
    )
      .bind(mk)
      .first();
    return row ? catalogCapabilitiesFromRow(row) : null;
  } catch {
    return null;
  }
}

/**
 * @param {any} env
 * @param {Array<Record<string, unknown>>} arms
 * @param {{ taskType?: string, toolRequired?: boolean }} q
 */
export async function filterArmsByCatalogCapabilities(env, arms, q) {
  if (!arms?.length || !env?.DB) return arms || [];
  const tt = q.taskType != null ? String(q.taskType).trim() : 'chat';
  const toolReq = !!q.toolRequired;
  const keys = [...new Set(arms.map((a) => String(a.model_key || '').trim()).filter(Boolean))];
  if (!keys.length) return arms;

  const cols = await pragmaTableInfo(env.DB, 'agentsam_model_catalog');
  if (!cols.has('model_key')) return arms;

  const select = ['model_key', 'cost_notes', 'context_window'];
  for (const c of [
    'routing_lane',
    'supports_code_execution',
    'supports_compaction',
    'supports_effort_scaling',
    'supports_apply_patch',
    'thinking_policy',
    'supports_cache',
    'supports_prompt_cache',
  ]) {
    if (cols.has(c)) select.push(c);
  }

  const placeholders = keys.map(() => '?').join(',');
  let rows = [];
  try {
    const res = await env.DB.prepare(
      `SELECT ${select.join(', ')} FROM agentsam_model_catalog
       WHERE model_key IN (${placeholders}) AND is_active = 1`,
    )
      .bind(...keys)
      .all();
    rows = res.results || [];
  } catch {
    return arms;
  }

  const capByKey = Object.fromEntries(
    rows.map((r) => [String(r.model_key).trim(), catalogCapabilitiesFromRow(r)]),
  );

  return arms.filter((a) => {
    const mk = String(a.model_key || '').trim();
    const cap = capByKey[mk];
    if (!cap) return true;
    if (toolReq && Number(a.supports_tools) === 1 && !cap.supports_code_execution && BUILDER_TASK_TYPES.has(tt)) {
      return false;
    }
    return catalogAllowsTask(cap, tt, toolReq);
  });
}

/**
 * Features_json fragment for agentsam_ai / Anthropic integration.
 * @param {ReturnType<typeof catalogCapabilitiesFromRow> | null} cap
 */
export function anthropicFeaturesFromCatalogCapabilities(cap) {
  if (!cap) return {};
  return {
    compaction: cap.supports_compaction,
    anthropic_code_execution: cap.supports_code_execution,
    thinking: cap.thinking_policy === 'adaptive_and_enabled' || cap.thinking_policy === 'adaptive_only',
    effort_scaling: cap.supports_effort_scaling,
    thinking_policy: cap.thinking_policy,
    routing_lane: cap.routing_lane,
    /** Top-level automatic cache_control when agentsam_ai.supports_cache or features_json enables it. */
    prompt_caching: cap.supports_prompt_cache === true,
  };
}
