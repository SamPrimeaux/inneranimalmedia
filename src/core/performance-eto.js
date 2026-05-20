/**
 * agentsam_performance_eto_events — Thompson training ledger (immutable per source row).
 * EPM remains dashboard rollup; this table owns reward → routing_arms apply.
 */

import { startCronRun, completeCronRun, failCronRun } from './cron-run-ledger.js';
import { enforceEvalSlosPauseArms } from './routing-cron.js';
import { pragmaTableInfo, tableExists } from './retention.js';
import { deriveProvider, writeRoutingMemoryPrior } from './memory.js';

const EPM = 'agentsam_execution_performance_metrics';

const TABLE = 'agentsam_performance_eto_events';
const ARMS = 'agentsam_routing_arms';

/** @type {Set<string> | null} */
let etoReadyCache = null;

/**
 * @param {any} env
 */
export async function isEtoThompsonOwner(env) {
  if (!env?.DB) return false;
  if (etoReadyCache != null) return etoReadyCache;
  etoReadyCache = await tableExists(env.DB, TABLE);
  return etoReadyCache;
}

export function newEtoEventId() {
  return `eto_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 */
export function effectiveRoutingArmIdFromRow(row) {
  const direct = row?.routing_arm_id != null ? String(row.routing_arm_id).trim() : '';
  if (direct) return direct;
  const inferred =
    row?.inferred_routing_arm_id != null ? String(row.inferred_routing_arm_id).trim() : '';
  return inferred || '';
}

function safeJson(value) {
  if (value == null) return '{}';
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return '{}';
    try {
      JSON.parse(s);
      return s;
    } catch {
      return JSON.stringify({ raw: s.slice(0, 2000) });
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

/**
 * @param {{ success?: boolean, timedOut?: boolean, slaBreach?: boolean }} o
 */
export function computeRewardPolicy(o) {
  const timedOut = !!o.timedOut;
  const slaBreach = !!o.slaBreach;
  const success = !!o.success && !timedOut;

  if (success && !slaBreach) {
    return {
      success: 1,
      failure: 0,
      timed_out: timedOut ? 1 : 0,
      sla_breach: 0,
      reward_score: 1,
      alpha_delta: 1,
      beta_delta: 0,
      reward_reason: 'success',
    };
  }
  if (timedOut) {
    return {
      success: 0,
      failure: 0,
      timed_out: 1,
      sla_breach: slaBreach ? 1 : 0,
      reward_score: 0,
      alpha_delta: 0,
      beta_delta: 1,
      reward_reason: 'timeout',
    };
  }
  if (slaBreach) {
    return {
      success: 0,
      failure: 0,
      timed_out: 0,
      sla_breach: 1,
      reward_score: 0.25,
      alpha_delta: 0,
      beta_delta: 0.5,
      reward_reason: 'sla_breach',
    };
  }
  return {
    success: 0,
    failure: 1,
    timed_out: 0,
    sla_breach: 0,
    reward_score: 0,
    alpha_delta: 0,
    beta_delta: 1,
    reward_reason: 'failure',
  };
}

/**
 * @param {any} env
 * @param {{
 *   workspaceId: string,
 *   taskType?: string | null,
 *   mode?: string | null,
 *   modelKey?: string | null,
 * }} o
 */
export async function inferRoutingArmId(env, o) {
  if (!env?.DB) return { armId: null, evidence: { inference_rule: 'no_db' } };
  const ws = o.workspaceId != null ? String(o.workspaceId).trim() : '';
  const taskType = o.taskType != null && String(o.taskType).trim() !== '' ? String(o.taskType).trim() : 'chat';
  const mode = o.mode != null && String(o.mode).trim() !== '' ? String(o.mode).trim() : 'agent';
  const modelKey = o.modelKey != null ? String(o.modelKey).trim() : '';
  if (!ws || !modelKey) {
    return { armId: null, evidence: { inference_rule: 'missing_ws_or_model', ws, modelKey } };
  }

  const { results } = await env.DB.prepare(
    `SELECT id, model_key, priority, total_executions
     FROM ${ARMS}
     WHERE workspace_id = ?
       AND task_type = ?
       AND mode = ?
       AND model_key = ?
       AND is_active = 1
       AND is_eligible = 1
       AND COALESCE(is_paused, 0) = 0
     ORDER BY COALESCE(priority, 0) DESC, COALESCE(total_executions, 0) DESC, rowid ASC
     LIMIT 5`,
  )
    .bind(ws, taskType, mode, modelKey)
    .all()
    .catch(() => ({ results: [] }));

  const rows = results || [];
  if (!rows.length) {
    const global = await env.DB.prepare(
      `SELECT id, model_key, priority, total_executions
       FROM ${ARMS}
       WHERE COALESCE(TRIM(workspace_id), '') = ''
         AND task_type = ?
         AND mode = ?
         AND model_key = ?
         AND is_active = 1
         AND is_eligible = 1
         AND COALESCE(is_paused, 0) = 0
       ORDER BY COALESCE(priority, 0) DESC, COALESCE(total_executions, 0) DESC, rowid ASC
       LIMIT 5`,
    )
      .bind(taskType, mode, modelKey)
      .all()
      .catch(() => ({ results: [] }));
    const gRows = global.results || [];
    if (gRows.length === 1) {
      return {
        armId: String(gRows[0].id),
        evidence: {
          inference_rule: 'global_workspace_fallback',
          candidate_count: 1,
          task_type: taskType,
          mode,
          model_key: modelKey,
        },
      };
    }
    return {
      armId: null,
      evidence: {
        inference_rule: 'no_match',
        workspace_candidates: rows.length,
        global_candidates: gRows.length,
        task_type: taskType,
        mode,
        model_key: modelKey,
      },
    };
  }
  if (rows.length > 1) {
    return {
      armId: String(rows[0].id),
      evidence: {
        inference_rule: 'workspace_tiebreak_priority',
        candidate_count: rows.length,
        ambiguous: true,
        chosen_id: rows[0].id,
        task_type: taskType,
        mode,
        model_key: modelKey,
      },
    };
  }
  return {
    armId: String(rows[0].id),
    evidence: {
      inference_rule: 'workspace_exact',
      candidate_count: 1,
      task_type: taskType,
      mode,
      model_key: modelKey,
    },
  };
}

/**
 * @param {any} env
 * @param {string} modelKey
 */
async function resolveModelCatalogId(env, modelKey) {
  if (!env?.DB || !modelKey) return null;
  const row = await env.DB.prepare(
    `SELECT id FROM agentsam_model_catalog WHERE model_key = ? AND is_active = 1 LIMIT 1`,
  )
    .bind(modelKey)
    .first()
    .catch(() => null);
  return row?.id != null ? String(row.id) : null;
}

/**
 * Best-effort link to the daily EPM slice (not 1:1 with a single run).
 * EPM `mixed` rows aggregate many agent_runs per workspace + model_key + intent_category.
 * @param {any} env
 * @param {{ tenantId?: string, workspaceId: string, modelKey: string, taskType?: string, metricDate: string }} o
 */
async function resolveEpmSliceId(env, o) {
  if (!env?.DB) return null;
  const ws = o.workspaceId != null ? String(o.workspaceId).trim() : '';
  const mk = o.modelKey != null ? String(o.modelKey).trim() : '';
  const metricDate = o.metricDate != null ? String(o.metricDate).trim() : '';
  if (!ws || !mk || !metricDate) return null;

  const epmCols = await pragmaTableInfo(env.DB, EPM);
  if (!epmCols.size) return null;

  const taskType = o.taskType != null && String(o.taskType).trim() !== '' ? String(o.taskType).trim() : 'chat';
  const tenantId = o.tenantId != null ? String(o.tenantId).trim() : '';

  let row = null;
  if (epmCols.has('intent_category')) {
    row = await env.DB.prepare(
      `SELECT id FROM ${EPM}
       WHERE metric_date = ?
         AND metric_grain = 'daily'
         AND source_table = 'mixed'
         AND workspace_id = ?
         AND model_key = ?
         AND COALESCE(intent_category, '') = ?
       LIMIT 1`,
    )
      .bind(metricDate, ws, mk, taskType)
      .first()
      .catch(() => null);
  }
  if (!row?.id && epmCols.has('task_type')) {
    row = await env.DB.prepare(
      `SELECT id FROM ${EPM}
       WHERE metric_date = ?
         AND metric_grain = 'daily'
         AND source_table = 'mixed'
         AND workspace_id = ?
         AND model_key = ?
         AND COALESCE(task_type, '') = ?
       LIMIT 1`,
    )
      .bind(metricDate, ws, mk, taskType)
      .first()
      .catch(() => null);
  }
  if (!row?.id && tenantId && epmCols.has('tenant_id')) {
    row = await env.DB.prepare(
      `SELECT id FROM ${EPM}
       WHERE metric_date = ?
         AND metric_grain = 'daily'
         AND source_table = 'mixed'
         AND tenant_id = ?
         AND workspace_id = ?
         AND model_key = ?
       LIMIT 1`,
    )
      .bind(metricDate, tenantId, ws, mk)
      .first()
      .catch(() => null);
  }
  return row?.id != null ? String(row.id) : null;
}

/**
 * Keep agentsam_model_routing_memory cold-start priors in sync (replaces applyRoutingArmUsageFeedback path).
 * @param {any} env
 * @param {Record<string, unknown>} row
 */
async function syncRoutingMemoryPriorFromEto(env, row) {
  const ws = row.workspace_id != null ? String(row.workspace_id).trim() : '';
  const tt = row.task_type != null ? String(row.task_type).trim() : '';
  const mk = row.model_key != null ? String(row.model_key).trim() : '';
  if (!ws || !tt || !mk) return;

  await writeRoutingMemoryPrior(env, {
    workspaceId: ws,
    taskType: tt,
    modelKey: mk,
    provider: row.provider != null ? String(row.provider) : null,
    success: Number(row.success) === 1,
    latencyMs: row.latency_ms != null ? Number(row.latency_ms) : null,
    costUsd: row.cost_usd != null ? Number(row.cost_usd) : null,
  });
}

/** Stamp epm_id on batch-built agent_run ETO rows after EPM rollup (same metric_date). */
async function backfillEtoEpmIds(env, metricDateExpr) {
  if (!env?.DB) return 0;
  const etoCols = await pragmaTableInfo(env.DB, TABLE);
  const epmCols = await pragmaTableInfo(env.DB, EPM);
  if (!etoCols.has('epm_id') || !epmCols.size) return 0;

  const intentMatch = epmCols.has('intent_category')
    ? `AND epm.intent_category = COALESCE(e.task_type, '')`
    : epmCols.has('task_type')
      ? `AND epm.task_type = COALESCE(e.task_type, '')`
      : '';

  try {
    const r = await env.DB.prepare(
      `UPDATE ${TABLE} AS e
       SET epm_id = (
         SELECT epm.id FROM ${EPM} epm
         WHERE epm.metric_date = ${metricDateExpr}
           AND epm.metric_grain = 'daily'
           AND epm.source_table = 'mixed'
           AND epm.workspace_id = e.workspace_id
           AND epm.model_key = e.model_key
           ${intentMatch}
         LIMIT 1
       )
       WHERE e.source_table = 'agentsam_agent_run'
         AND (e.epm_id IS NULL OR trim(e.epm_id) = '')
         AND e.model_key IS NOT NULL AND trim(e.model_key) != ''
         AND date(e.created_at) = ${metricDateExpr}`,
    ).run();
    return Number(r.meta?.changes ?? r.changes ?? 0) || 0;
  } catch (e) {
    console.warn('[eto] backfillEtoEpmIds', e?.message ?? e);
    return 0;
  }
}

/** @param {string | null | undefined} runGroupId */
function routingArmIdFromRunGroup(runGroupId) {
  const rg = runGroupId != null ? String(runGroupId).trim() : '';
  return rg.startsWith('ra_') ? rg : '';
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} row
 */
function detectSmoke(row) {
  const rg = row.run_group_id != null ? String(row.run_group_id) : '';
  const suite = row.suite_id != null ? String(row.suite_id) : '';
  const trigger = row.trigger != null ? String(row.trigger) : '';
  const grader = row.grader_model != null ? String(row.grader_model) : '';
  const reason = row.reward_reason != null ? String(row.reward_reason) : '';
  const evalId = row.id != null ? String(row.id) : '';
  const combined = `${rg} ${suite} ${trigger} ${grader} ${reason} ${evalId}`;
  /** Labeled quickstart batches train Thompson (name contains "smoke" but is not a discard-only smoke test). */
  if (/anthropic_smoketest_quickstart|quickstart_train_batch/i.test(combined)) {
    return false;
  }
  return /smoke|benchmark|e2e_test|routing_eval|iam_eval/i.test(combined);
}

/**
 * @param {any} env
 * @param {{
 *   tenantId?: string | null,
 *   workspaceId: string,
 *   userId?: string | null,
 *   agentRunId: string,
 *   routingArmId?: string | null,
 *   routeKey?: string | null,
 *   taskType?: string | null,
 *   mode?: string | null,
 *   modelKey?: string | null,
 *   provider?: string | null,
 *   workflowRunId?: string | null,
 *   executionId?: string | null,
 *   success: boolean,
 *   timedOut?: boolean,
 *   slaBreach?: boolean,
 *   latencyMs?: number,
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   costUsd?: number,
 *   qualityScore?: number | null,
 *   eventStatus?: string | null,
 *   quickstartBatch?: string | null,
 *   etlRunId?: string | null,
 *   skipIfExists?: boolean,
 * }} p
 */
export async function upsertEtoFromAgentRun(env, p) {
  if (!env?.DB || !(await isEtoThompsonOwner(env))) return { ok: false, reason: 'eto_table_missing' };

  const agentRunId = p.agentRunId != null ? String(p.agentRunId).trim() : '';
  const workspaceId = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  if (!agentRunId || !workspaceId) return { ok: false, reason: 'missing_ids' };

  const cols = await pragmaTableInfo(env.DB, TABLE);
  if (!cols.size) return { ok: false, reason: 'eto_schema_missing' };

  const modelKey =
    p.modelKey != null && String(p.modelKey).trim() !== '' ? String(p.modelKey).trim() : null;
  const taskType = p.taskType != null && String(p.taskType).trim() !== '' ? String(p.taskType).trim() : 'chat';
  const mode = p.mode != null && String(p.mode).trim() !== '' ? String(p.mode).trim() : 'agent';

  let routingArmId = p.routingArmId != null ? String(p.routingArmId).trim() : '';
  let inferredArmId = '';
  let evidence = { source: 'live_agent_run' };

  if (!routingArmId && modelKey) {
    const inf = await inferRoutingArmId(env, { workspaceId, taskType, mode, modelKey });
    inferredArmId = inf.armId || '';
    evidence = { ...evidence, ...inf.evidence };
  }

  const effective = routingArmId || inferredArmId;
  const reward = computeRewardPolicy({
    success: p.success,
    timedOut: p.timedOut,
    slaBreach: p.slaBreach,
  });

  const isSmoke = detectSmoke({
    id: agentRunId,
    run_group_id: agentRunId,
    trigger: p.quickstartBatch ?? p.eventStatus,
  });
  const trainingEligible =
    !!effective &&
    !isSmoke &&
    reward.reward_reason !== 'policy_blocked' &&
    (p.success === true || p.success === false || p.timedOut === true);

  const catalogId = modelKey ? await resolveModelCatalogId(env, modelKey) : null;
  const metricDate = new Date().toISOString().slice(0, 10);
  const epmId =
    modelKey && workspaceId
      ? await resolveEpmSliceId(env, {
          tenantId: p.tenantId,
          workspaceId,
          modelKey,
          taskType,
          metricDate,
        })
      : null;
  const provider =
    p.provider != null && String(p.provider).trim() !== ''
      ? String(p.provider).trim()
      : modelKey
        ? deriveProvider(modelKey)
        : null;

  const id = newEtoEventId();
  const parts = [];
  const binds = [];
  const add = (name, val) => {
    if (!cols.has(name)) return;
    parts.push(name);
    binds.push(val);
  };

  add('id', id);
  add('tenant_id', p.tenantId != null ? String(p.tenantId).trim() : '');
  add('workspace_id', workspaceId);
  add('user_id', p.userId != null ? String(p.userId).trim() : null);
  add('source_table', 'agentsam_agent_run');
  add('source_id', agentRunId);
  add('agent_run_id', agentRunId);
  add('workflow_run_id', p.workflowRunId != null ? String(p.workflowRunId).slice(0, 120) : null);
  add('execution_id', p.executionId != null ? String(p.executionId).slice(0, 120) : null);
  add('routing_arm_id', routingArmId || null);
  add('inferred_routing_arm_id', inferredArmId || null);
  add('route_key', p.routeKey != null ? String(p.routeKey).slice(0, 120) : null);
  add('task_type', taskType);
  add('mode', mode);
  add('model_catalog_id', catalogId);
  add('model_key', modelKey);
  add('provider', provider);
  add('event_status', p.eventStatus != null ? String(p.eventStatus).slice(0, 80) : p.success ? 'completed' : 'failed');
  add('success', reward.success);
  add('failure', reward.failure);
  add('timed_out', reward.timed_out);
  add('sla_breach', reward.sla_breach);
  add('latency_ms', Math.max(0, Math.floor(Number(p.latencyMs) || 0)));
  add('input_tokens', Math.max(0, Math.floor(Number(p.inputTokens) || 0)));
  add('output_tokens', Math.max(0, Math.floor(Number(p.outputTokens) || 0)));
  add('cost_usd', Number(p.costUsd) || 0);
  add('quality_score', p.qualityScore != null && Number.isFinite(Number(p.qualityScore)) ? Number(p.qualityScore) : null);
  add('is_smoke_test', isSmoke ? 1 : 0);
  add('is_training_eligible', trainingEligible ? 1 : 0);
  add('reward_score', reward.reward_score);
  add('alpha_delta', reward.alpha_delta);
  add('beta_delta', reward.beta_delta);
  add('reward_reason', reward.reward_reason);
  add(
    'evidence_json',
    safeJson({
      ...evidence,
      effective_arm_id: effective || null,
      epm_link: epmId
        ? { id: epmId, grain: 'daily', source_table: 'mixed', note: 'aggregated_slice_not_1_to_1' }
        : null,
    }),
  );
  add('epm_id', epmId);
  add('etl_run_id', p.etlRunId != null ? String(p.etlRunId).slice(0, 120) : null);

  if (parts.length < 5) return { ok: false, reason: 'eto_columns_missing' };

  const sql = p.skipIfExists !== false
    ? `INSERT OR IGNORE INTO ${TABLE} (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`
    : `INSERT INTO ${TABLE} (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')}) ON CONFLICT(source_table, source_id) DO UPDATE SET
        routing_arm_id = COALESCE(excluded.routing_arm_id, ${TABLE}.routing_arm_id),
        inferred_routing_arm_id = COALESCE(excluded.inferred_routing_arm_id, ${TABLE}.inferred_routing_arm_id),
        is_training_eligible = excluded.is_training_eligible,
        reward_score = excluded.reward_score,
        alpha_delta = excluded.alpha_delta,
        beta_delta = excluded.beta_delta,
        reward_reason = excluded.reward_reason,
        evidence_json = excluded.evidence_json,
        latency_ms = excluded.latency_ms,
        cost_usd = excluded.cost_usd`;

  try {
    const r = await env.DB.prepare(sql).bind(...binds).run();
    const changes = Number(r.meta?.changes ?? r.changes ?? 0) || 0;
    if (trainingEligible) {
      await syncRoutingMemoryPriorFromEto(env, {
        workspace_id: workspaceId,
        task_type: taskType,
        model_key: modelKey,
        provider,
        success: reward.success,
        latency_ms: Math.max(0, Math.floor(Number(p.latencyMs) || 0)),
        cost_usd: Number(p.costUsd) || 0,
      });
    }
    return { ok: true, id, inserted: changes > 0, effective_arm_id: effective || null, trainingEligible, epm_id: epmId };
  } catch (e) {
    console.warn('[eto] upsertEtoFromAgentRun', e?.message ?? e);
    return { ok: false, reason: String(e?.message || e) };
  }
}

/**
 * @param {any} env
 * @param {any} [ctx]
 * @param {Parameters<typeof upsertEtoFromAgentRun>[1]} p
 */
export function scheduleEtoFromAgentRun(env, ctx, p) {
  if (!env?.DB || !ctx?.waitUntil) return;
  ctx.waitUntil(upsertEtoFromAgentRun(env, p).catch(() => {}));
}

/**
 * Live / Worker eval path — one ETO row per agentsam_eval_runs insert (D1 canonical).
 * @param {any} env
 * @param {{
 *   evalRunId: string,
 *   tenantId?: string | null,
 *   workspaceId?: string | null,
 *   suiteId?: string | null,
 *   caseId?: string | null,
 *   modelKey: string,
 *   provider?: string | null,
 *   taskType?: string | null,
 *   mode?: string | null,
 *   routingArmId?: string | null,
 *   runGroupId?: string | null,
 *   passed: boolean | number,
 *   scoreOverall?: number | null,
 *   scoreQuality?: number | null,
 *   latencyMs?: number,
 *   costUsd?: number,
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   failureTaxonomy?: string | null,
 *   slaBreach?: boolean,
 * }} p
 */
export async function upsertEtoFromEvalRun(env, p) {
  if (!env?.DB || !(await isEtoThompsonOwner(env))) return { ok: false, reason: 'eto_table_missing' };

  const evalRunId = p.evalRunId != null ? String(p.evalRunId).trim() : '';
  const modelKey = p.modelKey != null ? String(p.modelKey).trim() : '';
  if (!evalRunId || !modelKey) return { ok: false, reason: 'missing_ids' };

  let workspaceId = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  if (!workspaceId && p.tenantId) {
    const ws = await env.DB.prepare(
      `SELECT id FROM agentsam_workspace WHERE tenant_id = ? ORDER BY id LIMIT 1`,
    )
      .bind(String(p.tenantId).trim())
      .first()
      .catch(() => null);
    workspaceId = ws?.id != null ? String(ws.id) : '';
  }
  if (!workspaceId) workspaceId = 'ws_inneranimalmedia';

  const taskType = p.taskType != null && String(p.taskType).trim() !== '' ? String(p.taskType).trim() : 'chat';
  const mode = p.mode != null && String(p.mode).trim() !== '' ? String(p.mode).trim() : 'agent';

  let routingArmId =
    p.routingArmId != null ? String(p.routingArmId).trim() : routingArmIdFromRunGroup(p.runGroupId);
  let inferredArmId = '';
  let evidence = { source: 'live_eval_run', suite_id: p.suiteId ?? null, case_id: p.caseId ?? null };

  if (!routingArmId) {
    const inf = await inferRoutingArmId(env, { workspaceId, taskType, mode, modelKey });
    inferredArmId = inf.armId || '';
    evidence = { ...evidence, ...inf.evidence };
  }

  const effective = routingArmId || inferredArmId;
  const passed = Number(p.passed) === 1 || p.passed === true;
  const reward = computeRewardPolicy({
    success: passed,
    timedOut: false,
    slaBreach: !!p.slaBreach,
  });

  const isSmoke = detectSmoke({
    id: evalRunId,
    suite_id: p.suiteId,
    run_group_id: p.runGroupId,
    grader_model: null,
  });
  const trainingEligible = !!effective && !isSmoke && (passed || !passed);

  const cols = await pragmaTableInfo(env.DB, TABLE);
  if (!cols.size) return { ok: false, reason: 'eto_schema_missing' };

  const catalogId = await resolveModelCatalogId(env, modelKey);
  const provider =
    p.provider != null && String(p.provider).trim() !== ''
      ? String(p.provider).trim()
      : deriveProvider(modelKey);

  const parts = [];
  const binds = [];
  const add = (name, val) => {
    if (!cols.has(name)) return;
    parts.push(name);
    binds.push(val);
  };

  add('id', newEtoEventId());
  add('tenant_id', p.tenantId != null ? String(p.tenantId).trim() : '');
  add('workspace_id', workspaceId);
  add('source_table', 'agentsam_eval_runs');
  add('source_id', evalRunId);
  add('eval_run_id', evalRunId);
  add('routing_arm_id', routingArmId || null);
  add('inferred_routing_arm_id', inferredArmId || null);
  add('task_type', taskType);
  add('mode', mode);
  add('model_catalog_id', catalogId);
  add('model_key', modelKey);
  add('provider', provider);
  add('event_status', passed ? 'eval_passed' : 'eval_failed');
  add('success', reward.success);
  add('failure', reward.failure);
  add('timed_out', reward.timed_out);
  add('sla_breach', reward.sla_breach);
  add('latency_ms', Math.max(0, Math.floor(Number(p.latencyMs) || 0)));
  add('input_tokens', Math.max(0, Math.floor(Number(p.inputTokens) || 0)));
  add('output_tokens', Math.max(0, Math.floor(Number(p.outputTokens) || 0)));
  add('cost_usd', Number(p.costUsd) || 0);
  add(
    'quality_score',
    p.scoreOverall != null && Number.isFinite(Number(p.scoreOverall))
      ? Number(p.scoreOverall)
      : p.scoreQuality != null && Number.isFinite(Number(p.scoreQuality))
        ? Number(p.scoreQuality)
        : null,
  );
  add('is_smoke_test', isSmoke ? 1 : 0);
  add('is_training_eligible', trainingEligible ? 1 : 0);
  add('reward_score', reward.reward_score);
  add('alpha_delta', reward.alpha_delta);
  add('beta_delta', reward.beta_delta);
  add('reward_reason', passed ? 'eval_pass' : 'eval_fail');
  add(
    'evidence_json',
    safeJson({
      ...evidence,
      effective_arm_id: effective || null,
      failure_taxonomy: p.failureTaxonomy ?? null,
    }),
  );

  try {
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO ${TABLE} (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
    )
      .bind(...binds)
      .run();
    if (trainingEligible) {
      await syncRoutingMemoryPriorFromEto(env, {
        workspace_id: workspaceId,
        task_type: taskType,
        model_key: modelKey,
        provider,
        success: reward.success,
        latency_ms: Math.max(0, Math.floor(Number(p.latencyMs) || 0)),
        cost_usd: Number(p.costUsd) || 0,
      });
    }
    return {
      ok: true,
      inserted: (Number(r.meta?.changes ?? r.changes ?? 0) || 0) > 0,
      effective_arm_id: effective || null,
      trainingEligible,
    };
  } catch (e) {
    console.warn('[eto] upsertEtoFromEvalRun', e?.message ?? e);
    return { ok: false, reason: String(e?.message || e) };
  }
}

/** @param {any} env @param {any} ctx @param {Parameters<typeof upsertEtoFromEvalRun>[1]} p */
export function scheduleEtoFromEvalRun(env, ctx, p) {
  if (!env?.DB || !ctx?.waitUntil) return;
  ctx.waitUntil(upsertEtoFromEvalRun(env, p).catch(() => {}));
}

/**
 * One ETO row per model-escalation attempt (chat fallback chain). Distinct from agent_run finalize.
 * @param {any} env
 * @param {{
 *   escalationId: string,
 *   tenantId?: string | null,
 *   workspaceId: string,
 *   agentRunId: string,
 *   routingArmId?: string | null,
 *   modelKey: string,
 *   provider?: string | null,
 *   taskType?: string | null,
 *   mode?: string | null,
 *   chainIndex: number,
 *   succeeded: boolean,
 *   latencyMs?: number,
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   costUsd?: number,
 *   qualityScore?: number | null,
 *   errorMessage?: string | null,
 * }} p
 */
export async function upsertEtoFromEscalationAttempt(env, p) {
  if (!env?.DB || !(await isEtoThompsonOwner(env))) return { ok: false, reason: 'eto_table_missing' };

  const escalationId = p.escalationId != null ? String(p.escalationId).trim() : '';
  const workspaceId = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  const modelKey = p.modelKey != null ? String(p.modelKey).trim() : '';
  const agentRunId = p.agentRunId != null ? String(p.agentRunId).trim() : '';
  if (!escalationId || !workspaceId || !modelKey) return { ok: false, reason: 'missing_ids' };

  const taskType = p.taskType != null && String(p.taskType).trim() !== '' ? String(p.taskType).trim() : 'chat';
  const mode = p.mode != null && String(p.mode).trim() !== '' ? String(p.mode).trim() : 'agent';

  let routingArmId = p.routingArmId != null ? String(p.routingArmId).trim() : '';
  let inferredArmId = '';
  let evidence = { source: 'escalation_attempt', chain_index: p.chainIndex, agent_run_id: agentRunId };

  if (!routingArmId) {
    const inf = await inferRoutingArmId(env, { workspaceId, taskType, mode, modelKey });
    inferredArmId = inf.armId || '';
    evidence = { ...evidence, ...inf.evidence };
  }

  const effective = routingArmId || inferredArmId;
  const success = !!p.succeeded;
  const reward = computeRewardPolicy({ success, timedOut: false, slaBreach: false });
  const trainingEligible = !!effective && reward.reward_reason !== 'policy_blocked';

  const cols = await pragmaTableInfo(env.DB, TABLE);
  if (!cols.size) return { ok: false, reason: 'eto_schema_missing' };

  const catalogId = await resolveModelCatalogId(env, modelKey);
  const provider =
    p.provider != null && String(p.provider).trim() !== ''
      ? String(p.provider).trim()
      : deriveProvider(modelKey);

  const parts = [];
  const binds = [];
  const add = (name, val) => {
    if (!cols.has(name)) return;
    parts.push(name);
    binds.push(val);
  };

  add('id', newEtoEventId());
  add('tenant_id', p.tenantId != null ? String(p.tenantId).trim() : '');
  add('workspace_id', workspaceId);
  add('source_table', 'agentsam_escalation');
  add('source_id', escalationId);
  add('agent_run_id', agentRunId || null);
  add('routing_arm_id', routingArmId || null);
  add('inferred_routing_arm_id', inferredArmId || null);
  add('task_type', taskType);
  add('mode', mode);
  add('model_catalog_id', catalogId);
  add('model_key', modelKey);
  add('provider', provider);
  add('event_status', success ? 'escalation_success' : 'escalation_failed');
  add('success', reward.success);
  add('failure', reward.failure);
  add('timed_out', reward.timed_out);
  add('sla_breach', reward.sla_breach);
  add('latency_ms', Math.max(0, Math.floor(Number(p.latencyMs) || 0)));
  add('input_tokens', Math.max(0, Math.floor(Number(p.inputTokens) || 0)));
  add('output_tokens', Math.max(0, Math.floor(Number(p.outputTokens) || 0)));
  add('cost_usd', Number(p.costUsd) || 0);
  add(
    'quality_score',
    p.qualityScore != null && Number.isFinite(Number(p.qualityScore)) ? Number(p.qualityScore) : null,
  );
  add('is_smoke_test', 0);
  add('is_training_eligible', trainingEligible ? 1 : 0);
  add('reward_score', reward.reward_score);
  add('alpha_delta', reward.alpha_delta);
  add('beta_delta', reward.beta_delta);
  add('reward_reason', success ? 'escalation_pass' : 'escalation_fail');
  add(
    'evidence_json',
    safeJson({
      ...evidence,
      effective_arm_id: effective || null,
      error_message: p.errorMessage != null ? String(p.errorMessage).slice(0, 500) : null,
    }),
  );

  if (parts.length < 5) return { ok: false, reason: 'eto_columns_missing' };

  try {
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO ${TABLE} (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
    )
      .bind(...binds)
      .run();
    if (trainingEligible) {
      await syncRoutingMemoryPriorFromEto(env, {
        workspace_id: workspaceId,
        task_type: taskType,
        model_key: modelKey,
        provider,
        success: reward.success,
        latency_ms: Math.max(0, Math.floor(Number(p.latencyMs) || 0)),
        cost_usd: Number(p.costUsd) || 0,
      });
    }
    return {
      ok: true,
      inserted: (Number(r.meta?.changes ?? r.changes ?? 0) || 0) > 0,
      effective_arm_id: effective || null,
      trainingEligible,
    };
  } catch (e) {
    console.warn('[eto] upsertEtoFromEscalationAttempt', e?.message ?? e);
    return { ok: false, reason: String(e?.message || e) };
  }
}

/**
 * Insert agentsam_escalation row + ETO training row for one chat model attempt.
 * @param {any} env
 * @param {any} ctx
 * @param {Parameters<typeof upsertEtoFromEscalationAttempt>[1] & { errorEventId?: string | null }} p
 */
export async function recordEscalationAttempt(env, ctx, p) {
  const escCols = await pragmaTableInfo(env.DB, 'agentsam_escalation');
  const escalationId =
    p.escalationId != null && String(p.escalationId).trim() !== ''
      ? String(p.escalationId).trim()
      : `esc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  if (escCols.size) {
    const parts = [];
    const binds = [];
    const add = (name, val) => {
      if (!escCols.has(name)) return;
      parts.push(name);
      binds.push(val);
    };
    add('id', escalationId);
    add('run_group_id', p.agentRunId);
    add('error_event_id', p.errorEventId != null ? String(p.errorEventId).slice(0, 120) : 'none');
    add('chain_index', Math.max(0, Math.floor(Number(p.chainIndex) || 0)));
    add('model_attempted', p.modelKey);
    add('succeeded', p.succeeded ? 1 : 0);
    add('latency_ms', Math.max(0, Math.floor(Number(p.latencyMs) || 0)));
    add('input_tokens', Math.max(0, Math.floor(Number(p.inputTokens) || 0)));
    add('output_tokens', Math.max(0, Math.floor(Number(p.outputTokens) || 0)));
    if (!p.succeeded) {
      add('error_message', p.errorMessage != null ? String(p.errorMessage).slice(0, 500) : null);
    }
    add('workspace_id', p.workspaceId);
    add('tenant_id', p.tenantId);
    add('created_at_unix', Math.floor(Date.now() / 1000));
    if (parts.length >= 4) {
      try {
        await env.DB.prepare(
          `INSERT INTO agentsam_escalation (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
        )
          .bind(...binds)
          .run();
      } catch (e) {
        console.warn('[eto] escalation insert', e?.message ?? e);
      }
    }
  }

  const etoPayload = { ...p, escalationId };
  if (ctx?.waitUntil) {
    ctx.waitUntil(upsertEtoFromEscalationAttempt(env, etoPayload).catch(() => {}));
  } else {
    await upsertEtoFromEscalationAttempt(env, etoPayload);
  }
  return escalationId;
}

/** @param {any} env @param {any} ctx @param {Parameters<typeof recordEscalationAttempt>[2]} p */
export function scheduleEscalationAttempt(env, ctx, p) {
  if (!env?.DB || !ctx?.waitUntil) return;
  ctx.waitUntil(recordEscalationAttempt(env, ctx, p).catch(() => {}));
}

/**
 * Build ETO rows from canonical sources (yesterday UTC). Idempotent via UNIQUE(source_table, source_id).
 * @param {any} env
 * @param {{ metricDate?: string, etlRunId?: string | null }} [opts]
 */
export async function buildEtoEventsBatch(env, opts = {}) {
  if (!env?.DB || !(await isEtoThompsonOwner(env))) {
    return { ok: false, skipped: true, reason: 'eto_table_missing', built: 0 };
  }

  const metricDate = opts.metricDate != null ? String(opts.metricDate).trim() : '';
  const dayExpr = metricDate ? `date('${metricDate.replace(/'/g, "''")}')` : `date('now', '-1 day')`;
  const etlRunId = opts.etlRunId != null ? String(opts.etlRunId) : null;

  let built = 0;

  const runCols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
  const wfExpr = runCols.has('workflow_run_id') ? "NULLIF(trim(ar.workflow_run_id), '')" : 'NULL';

  const agentSql = `
    INSERT OR IGNORE INTO ${TABLE} (
      id, tenant_id, workspace_id, user_id,
      source_table, source_id,
      agent_run_id, workflow_run_id, execution_id,
      routing_arm_id, task_type, mode,
      model_key, provider,
      event_status, success, failure, timed_out, sla_breach,
      latency_ms, input_tokens, output_tokens, cost_usd,
      is_smoke_test, is_training_eligible,
      reward_score, alpha_delta, beta_delta,
      reward_reason, evidence_json, etl_run_id, created_at
    )
    SELECT
      'eto_' || lower(hex(randomblob(8))),
      COALESCE(NULLIF(trim(ar.tenant_id), ''), 'platform'),
      COALESCE(ar.workspace_id, ''),
      ar.user_id,
      'agentsam_agent_run',
      ar.id,
      ar.id,
      ${wfExpr},
      ar.id,
      NULLIF(trim(ar.routing_arm_id), ''),
      COALESCE(NULLIF(trim(ar.task_type), ''), 'chat'),
      'agent',
      COALESCE(NULLIF(trim(ar.model_id), ''), NULLIF(trim(ar.ai_model_ref), '')),
      NULL,
      ar.status,
      CASE WHEN ar.status = 'completed' THEN 1 ELSE 0 END,
      CASE WHEN ar.status = 'failed' THEN 1 ELSE 0 END,
      COALESCE(ar.timed_out, 0),
      COALESCE(ar.sla_breach, 0),
      CASE WHEN ar.completed_at IS NOT NULL AND ar.started_at IS NOT NULL
        THEN CAST((julianday(ar.completed_at) - julianday(ar.started_at)) * 86400000 AS INTEGER)
        ELSE NULL END,
      COALESCE(ar.input_tokens, 0),
      COALESCE(ar.output_tokens, 0),
      COALESCE(ar.cost_usd, 0),
      0,
      CASE
        WHEN COALESCE(NULLIF(trim(ar.routing_arm_id), ''), '') != '' THEN 1
        ELSE 0
      END,
      CASE WHEN ar.status = 'completed' THEN 1.0 ELSE 0.0 END,
      CASE WHEN ar.status = 'completed' THEN 1.0 ELSE 0.0 END,
      CASE WHEN ar.status = 'completed' THEN 0.0 ELSE 1.0 END,
      CASE WHEN ar.status = 'completed' THEN 'success' WHEN COALESCE(ar.timed_out,0)=1 THEN 'timeout' ELSE 'failure' END,
      '{"source":"batch_agent_run"}',
      ?,
      datetime('now')
    FROM agentsam_agent_run ar
    WHERE date(ar.created_at) = ${dayExpr}
  `;

  try {
    const r1 = await env.DB.prepare(agentSql).bind(etlRunId).run();
    built += Number(r1.meta?.changes ?? r1.changes ?? 0) || 0;
  } catch (e) {
    console.warn('[eto] build agent_run batch', e?.message ?? e);
  }

  const pending = await env.DB.prepare(
    `SELECT id, workspace_id, task_type, model_id, ai_model_ref, routing_arm_id, status, timed_out, sla_breach
     FROM agentsam_agent_run ar
     WHERE date(ar.created_at) = ${dayExpr}
       AND NOT EXISTS (
         SELECT 1 FROM ${TABLE} e
         WHERE e.source_table = 'agentsam_agent_run' AND e.source_id = ar.id
           AND COALESCE(e.inferred_routing_arm_id, e.routing_arm_id, '') != ''
       )`,
  )
    .all()
    .catch(() => ({ results: [] }));

  for (const row of pending.results || []) {
    const mk = String(row.model_id || row.ai_model_ref || '').trim();
    if (!mk || !row.workspace_id) continue;
    const inf = await inferRoutingArmId(env, {
      workspaceId: String(row.workspace_id),
      taskType: row.task_type != null ? String(row.task_type) : 'chat',
      mode: 'agent',
      modelKey: mk,
    });
    if (!inf.armId) continue;
    const reward = computeRewardPolicy({
      success: String(row.status) === 'completed',
      timedOut: Number(row.timed_out) === 1,
      slaBreach: Number(row.sla_breach) === 1,
    });
    try {
      await env.DB.prepare(
        `UPDATE ${TABLE} SET
          inferred_routing_arm_id = ?,
          is_training_eligible = CASE WHEN is_smoke_test = 0 THEN 1 ELSE 0 END,
          alpha_delta = ?,
          beta_delta = ?,
          reward_score = ?,
          reward_reason = ?,
          evidence_json = ?
         WHERE source_table = 'agentsam_agent_run' AND source_id = ?`,
      )
        .bind(
          inf.armId,
          reward.alpha_delta,
          reward.beta_delta,
          reward.reward_score,
          reward.reward_reason,
          safeJson({ ...inf.evidence, batch_inference: true }),
          row.id,
        )
        .run();
      built += 1;
    } catch (e) {
      console.warn('[eto] infer patch', row.id, e?.message ?? e);
    }
  }

  if (runCols.has('routing_arm_id')) {
    try {
      await env.DB.prepare(
        `UPDATE ${TABLE} SET is_training_eligible = 1
         WHERE source_table = 'agentsam_agent_run'
           AND date(created_at) >= ${dayExpr}
           AND is_smoke_test = 0
           AND COALESCE(NULLIF(trim(routing_arm_id), ''), NULLIF(trim(inferred_routing_arm_id), '')) != ''
           AND applied_to_thompson_at IS NULL`,
      ).run();
    } catch (_) {
      /* non-fatal */
    }
  }

  const evalCols = await pragmaTableInfo(env.DB, 'agentsam_eval_runs');
  const suiteCols = await pragmaTableInfo(env.DB, 'agentsam_eval_suites');
  if (evalCols.size && suiteCols.size) {
    const armFromRg = "CASE WHEN er.run_group_id LIKE 'ra_%' THEN trim(er.run_group_id) ELSE NULL END";
    const wsExpr = `(SELECT aw.id FROM agentsam_workspace aw WHERE aw.tenant_id = er.tenant_id ORDER BY aw.id LIMIT 1)`;
    const evalSql = `
      INSERT OR IGNORE INTO ${TABLE} (
        id, tenant_id, workspace_id,
        source_table, source_id, eval_run_id,
        routing_arm_id, task_type, mode,
        model_key, provider,
        event_status, success, failure, timed_out, sla_breach,
        latency_ms, input_tokens, output_tokens, cost_usd, quality_score,
        is_smoke_test, is_training_eligible,
        reward_score, alpha_delta, beta_delta,
        reward_reason, evidence_json, etl_run_id, created_at
      )
      SELECT
        'eto_' || lower(hex(randomblob(8))),
        COALESCE(er.tenant_id, 'platform'),
        COALESCE(${wsExpr}, 'ws_inneranimalmedia'),
        'agentsam_eval_runs',
        er.id,
        er.id,
        ${armFromRg},
        COALESCE(es.task_type, 'chat'),
        COALESCE(es.mode, 'agent'),
        er.model_key,
        er.provider,
        CASE WHEN COALESCE(er.passed, 0) = 1 THEN 'eval_passed' ELSE 'eval_failed' END,
        CASE WHEN COALESCE(er.passed, 0) = 1 THEN 1 ELSE 0 END,
        CASE WHEN COALESCE(er.passed, 0) = 0 THEN 1 ELSE 0 END,
        0,
        CASE
          WHEN ts.task_type IS NOT NULL AND er.score_overall IS NOT NULL AND er.score_overall < ts.sla_min_quality THEN 1
          WHEN ts.task_type IS NOT NULL AND COALESCE(er.passed, 0) = 0 AND COALESCE(er.score_overall, 0) < ts.sla_min_quality THEN 1
          WHEN ts.task_type IS NOT NULL AND er.latency_ms IS NOT NULL AND er.latency_ms > ts.sla_p95_latency_ms THEN 1
          WHEN ts.task_type IS NOT NULL AND er.cost_usd IS NOT NULL AND er.cost_usd > ts.sla_avg_cost_usd THEN 1
          ELSE 0
        END,
        COALESCE(er.latency_ms, 0),
        COALESCE(er.input_tokens, 0),
        COALESCE(er.output_tokens, 0),
        COALESCE(er.cost_usd, 0),
        COALESCE(er.score_overall, er.score_quality),
        CASE
          WHEN er.run_group_id LIKE 'smoke_%' OR er.suite_id LIKE '%smoke%' OR er.id LIKE '%smoke%' THEN 1
          ELSE 0
        END,
        CASE
          WHEN er.run_group_id LIKE 'smoke_%' OR er.suite_id LIKE '%smoke%' OR er.id LIKE '%smoke%' THEN 0
          WHEN ${armFromRg} IS NOT NULL THEN 1
          ELSE 0
        END,
        CASE WHEN COALESCE(er.passed, 0) = 1 THEN 1.0 ELSE 0.0 END,
        CASE WHEN COALESCE(er.passed, 0) = 1 THEN 1.0 ELSE 0.0 END,
        CASE WHEN COALESCE(er.passed, 0) = 1 THEN 0.0 ELSE 1.0 END,
        CASE WHEN COALESCE(er.passed, 0) = 1 THEN 'eval_pass' ELSE 'eval_fail' END,
        '{"source":"batch_eval_runs"}',
        ?,
        datetime('now')
      FROM agentsam_eval_runs er
      INNER JOIN agentsam_eval_suites es ON es.id = er.suite_id
      LEFT JOIN agentsam_task_slos ts ON ts.task_type = es.task_type
      WHERE date(er.run_at) = ${dayExpr}
    `;
    try {
      const re = await env.DB.prepare(evalSql).bind(etlRunId).run();
      built += Number(re.meta?.changes ?? re.changes ?? 0) || 0;
    } catch (e) {
      console.warn('[eto] build eval_runs batch', e?.message ?? e);
    }

    const pendingEval = await env.DB.prepare(
      `SELECT er.id, er.tenant_id, er.model_key, er.passed, er.latency_ms, er.cost_usd, er.score_overall,
              es.task_type, es.mode,
              COALESCE(${wsExpr}, 'ws_inneranimalmedia') AS workspace_id
       FROM agentsam_eval_runs er
       INNER JOIN agentsam_eval_suites es ON es.id = er.suite_id
       WHERE date(er.run_at) = ${dayExpr}
         AND (er.run_group_id IS NULL OR er.run_group_id NOT LIKE 'ra_%')
         AND EXISTS (
           SELECT 1 FROM ${TABLE} e
           WHERE e.source_table = 'agentsam_eval_runs' AND e.source_id = er.id
             AND COALESCE(e.inferred_routing_arm_id, e.routing_arm_id, '') = ''
         )`,
    )
      .all()
      .catch(() => ({ results: [] }));

    for (const row of pendingEval.results || []) {
      const mk = String(row.model_key || '').trim();
      if (!mk) continue;
      const inf = await inferRoutingArmId(env, {
        workspaceId: String(row.workspace_id),
        taskType: row.task_type != null ? String(row.task_type) : 'chat',
        mode: row.mode != null ? String(row.mode) : 'agent',
        modelKey: mk,
      });
      if (!inf.armId) continue;
      const reward = computeRewardPolicy({
        success: Number(row.passed) === 1,
        timedOut: false,
        slaBreach: false,
      });
      try {
        await env.DB.prepare(
          `UPDATE ${TABLE} SET
            inferred_routing_arm_id = ?,
            workspace_id = ?,
            is_training_eligible = CASE WHEN is_smoke_test = 0 THEN 1 ELSE 0 END,
            alpha_delta = ?,
            beta_delta = ?,
            reward_score = ?,
            reward_reason = ?,
            evidence_json = ?
           WHERE source_table = 'agentsam_eval_runs' AND source_id = ?`,
        )
          .bind(
            inf.armId,
            row.workspace_id,
            reward.alpha_delta,
            reward.beta_delta,
            reward.reward_score,
            reward.reward_reason,
            safeJson({ ...inf.evidence, batch_inference: true }),
            row.id,
          )
          .run();
        built += 1;
      } catch (e) {
        console.warn('[eto] eval infer patch', row.id, e?.message ?? e);
      }
    }

    try {
      await env.DB.prepare(
        `UPDATE ${TABLE} SET is_training_eligible = 1
         WHERE source_table = 'agentsam_eval_runs'
           AND date(created_at) >= ${dayExpr}
           AND is_smoke_test = 0
           AND COALESCE(NULLIF(trim(routing_arm_id), ''), NULLIF(trim(inferred_routing_arm_id), '')) != ''
           AND applied_to_thompson_at IS NULL`,
      ).run();
    } catch (_) {
      /* non-fatal */
    }
  }

  const usageCols = await pragmaTableInfo(env.DB, 'agentsam_usage_events');
  if (usageCols.size) {
    const usageSql = `
      INSERT OR IGNORE INTO ${TABLE} (
        id, tenant_id, workspace_id, user_id,
        source_table, source_id, usage_event_id,
        routing_arm_id, model_key, provider,
        event_status, success, failure,
        latency_ms, input_tokens, output_tokens, cost_usd,
        is_smoke_test, is_training_eligible,
        reward_score, alpha_delta, beta_delta,
        reward_reason, evidence_json, etl_run_id, created_at
      )
      SELECT
        'eto_' || lower(hex(randomblob(8))),
        COALESCE(ue.tenant_id, 'platform'),
        COALESCE(ue.workspace_id, ''),
        ue.user_id,
        'agentsam_usage_events',
        ue.id,
        ue.id,
        NULLIF(trim(ue.routing_arm_id), ''),
        COALESCE(NULLIF(trim(ue.model_key), ''), NULLIF(trim(ue.model), '')),
        ue.provider,
        ue.status,
        CASE WHEN COALESCE(ue.status, '') != 'error' THEN 1 ELSE 0 END,
        CASE WHEN COALESCE(ue.status, '') = 'error' THEN 1 ELSE 0 END,
        COALESCE(ue.duration_ms, 0),
        COALESCE(ue.input_tokens, ue.tokens_in, 0),
        COALESCE(ue.output_tokens, ue.tokens_out, 0),
        COALESCE(ue.cost_usd, 0),
        0,
        CASE WHEN NULLIF(trim(ue.routing_arm_id), '') IS NOT NULL THEN 1 ELSE 0 END,
        CASE WHEN COALESCE(ue.status, '') != 'error' THEN 1.0 ELSE 0.0 END,
        CASE WHEN COALESCE(ue.status, '') != 'error' THEN 1.0 ELSE 0.0 END,
        CASE WHEN COALESCE(ue.status, '') = 'error' THEN 1.0 ELSE 0.0 END,
        CASE WHEN COALESCE(ue.status, '') != 'error' THEN 'success' ELSE 'failure' END,
        '{"source":"batch_usage_events_legacy"}',
        ?,
        datetime('now')
      FROM agentsam_usage_events ue
      WHERE date(COALESCE(datetime(ue.created_at, 'unixepoch'), ue.created_at)) = ${dayExpr}
        AND NOT (
          ue.ref_table = 'agentsam_agent_run'
          AND ue.ref_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM ${TABLE} x WHERE x.source_table = 'agentsam_agent_run' AND x.source_id = ue.ref_id)
        )
    `;
    try {
      const ru = await env.DB.prepare(usageSql).bind(etlRunId).run();
      built += Number(ru.meta?.changes ?? ru.changes ?? 0) || 0;
    } catch (e) {
      console.warn('[eto] build usage_events batch', e?.message ?? e);
    }
  }

  const epmLinked = await backfillEtoEpmIds(env, dayExpr);
  built += epmLinked;

  return { ok: true, built, epm_linked: epmLinked, metricDate: metricDate || 'yesterday' };
}

/**
 * Apply pending eligible ETO rows to agentsam_routing_arms (Thompson state).
 * @param {any} env
 * @param {{ etoRunId?: string | null }} [opts]
 */
export async function applyEtoToRoutingArms(env, opts = {}) {
  if (!env?.DB || !(await isEtoThompsonOwner(env))) {
    return { ok: false, skipped: true, reason: 'eto_table_missing', armsUpdated: 0 };
  }

  const etoRunId = opts.etoRunId != null ? String(opts.etoRunId) : null;
  const armCols = await pragmaTableInfo(env.DB, ARMS);
  if (!armCols.has('success_alpha') || !armCols.has('success_beta')) {
    return { ok: false, reason: 'routing_arms_missing_beta_columns' };
  }

  const { results: groups } = await env.DB.prepare(
    `SELECT
       COALESCE(NULLIF(trim(routing_arm_id), ''), NULLIF(trim(inferred_routing_arm_id), '')) AS arm_id,
       SUM(alpha_delta) AS sum_alpha,
       SUM(beta_delta) AS sum_beta,
       COUNT(*) AS n,
       AVG(latency_ms) AS avg_latency_ms,
       SUM(cost_usd) AS sum_cost_usd
     FROM ${TABLE}
     WHERE is_training_eligible = 1
       AND applied_to_thompson_at IS NULL
       AND COALESCE(NULLIF(trim(routing_arm_id), ''), NULLIF(trim(inferred_routing_arm_id), '')) != ''
     GROUP BY arm_id`,
  )
    .all()
    .catch(() => ({ results: [] }));

  let armsUpdated = 0;
  let memorySynced = 0;
  const stamp = new Date().toISOString();

  const { results: memoryRows } = await env.DB.prepare(
    `SELECT workspace_id, task_type, model_key, provider, success, latency_ms, cost_usd
     FROM ${TABLE}
     WHERE is_training_eligible = 1
       AND applied_to_thompson_at IS NULL
       AND workspace_id IS NOT NULL AND trim(workspace_id) != ''
       AND model_key IS NOT NULL AND trim(model_key) != ''
       AND task_type IS NOT NULL AND trim(task_type) != ''`,
  )
    .all()
    .catch(() => ({ results: [] }));

  for (const row of memoryRows || []) {
    try {
      await syncRoutingMemoryPriorFromEto(env, row);
      memorySynced += 1;
    } catch (e) {
      console.warn('[eto] routing_memory sync', e?.message ?? e);
    }
  }

  for (const g of groups.results || []) {
    const armId = g.arm_id != null ? String(g.arm_id).trim() : '';
    if (!armId) continue;
    const da = Number(g.sum_alpha) || 0;
    const db = Number(g.sum_beta) || 0;
    if (da === 0 && db === 0) continue;

    const arm = await env.DB.prepare(
      `SELECT id, success_alpha, success_beta, cost_n, cost_mean, cost_m2, latency_n, latency_mean, latency_m2
       FROM ${ARMS} WHERE id = ? LIMIT 1`,
    )
      .bind(armId)
      .first()
      .catch(() => null);
    if (!arm) continue;

    const n = Math.max(1, Number(g.n) || 1);
    const costUsd = (Number(g.sum_cost_usd) || 0) / n;
    const latMs = Number(g.avg_latency_ms) || 0;

    const newAlpha = (Number(arm.success_alpha) || 1) + da;
    const newBeta = (Number(arm.success_beta) || 1) + db;

    try {
      if (armCols.has('cost_m2') && armCols.has('latency_m2')) {
        const cn = Number(arm.cost_n) || 0;
        const cm = Number(arm.cost_mean) || 0;
        const cm2 = Number(arm.cost_m2) || 0;
        const ln = Number(arm.latency_n) || 0;
        const lm = Number(arm.latency_mean) || 0;
        const lm2 = Number(arm.latency_m2) || 0;
        const newCn = cn + n;
        const newCm = cn === 0 ? costUsd : cm + (costUsd - cm) * (n / newCn);
        const newCm2 = cm2 + (costUsd - cm) * (costUsd - newCm);
        const newLn = ln + n;
        const newLm = ln === 0 ? latMs : lm + (latMs - lm) * (n / newLn);
        const newLm2 = lm2 + (latMs - lm) * (latMs - newLm);

        await env.DB.prepare(
          `UPDATE ${ARMS} SET
            success_alpha = ?,
            success_beta = ?,
            cost_n = ?, cost_mean = ?, cost_m2 = ?,
            latency_n = ?, latency_mean = ?, latency_m2 = ?,
            decayed_score = ? / (? + ?),
            updated_at = unixepoch()
           WHERE id = ?`,
        )
          .bind(newAlpha, newBeta, newCn, newCm, newCm2, newLn, newLm, newLm2, newAlpha, newAlpha, newBeta, armId)
          .run();
      } else {
        await env.DB.prepare(
          `UPDATE ${ARMS} SET
            success_alpha = ?,
            success_beta = ?,
            updated_at = unixepoch()
           WHERE id = ?`,
        )
          .bind(newAlpha, newBeta, armId)
          .run();
      }
      armsUpdated += 1;
    } catch (e) {
      console.warn('[eto] apply arm', armId, e?.message ?? e);
    }
  }

  try {
    await env.DB.prepare(
      `UPDATE ${TABLE} SET
        applied_to_thompson_at = ?,
        eto_run_id = COALESCE(?, eto_run_id)
       WHERE is_training_eligible = 1
         AND applied_to_thompson_at IS NULL
         AND COALESCE(NULLIF(trim(routing_arm_id), ''), NULLIF(trim(inferred_routing_arm_id), '')) != ''`,
    )
      .bind(stamp, etoRunId)
      .run();
  } catch (e) {
    console.warn('[eto] stamp applied_to_thompson_at', e?.message ?? e);
  }

  return { ok: true, armsUpdated, memorySynced, groups: (groups.results || []).length };
}

/**
 * EPM → ETO build → ETO apply (midnight chain).
 * @param {any} env
 */
export async function runEtoPipeline(env) {
  if (!env?.DB) return { ok: false, reason: 'no_db' };

  const begun = await startCronRun(env, {
    jobName: 'eto_pipeline',
    cronExpression: '0 1 * * *',
    tenantId: null,
    workspaceId: null,
  });
  const etlRunId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();

  try {
    const built = await buildEtoEventsBatch(env, { etlRunId });
    const applied = await applyEtoToRoutingArms(env, { etoRunId: etlRunId });
    const evalPaused = await enforceEvalSlosPauseArms(env, { lookbackDays: 7 });
    if (etlRunId) {
      await completeCronRun(env, etlRunId, startedAt, {
        rowsWritten: (built.built || 0) + (applied.armsUpdated || 0) + (evalPaused.armsPaused || 0),
        metadata: { built, applied, evalPaused },
      });
    }
    return { ok: true, built, applied, evalPaused };
  } catch (e) {
    if (etlRunId) await failCronRun(env, etlRunId, startedAt, e);
    throw e;
  }
}
