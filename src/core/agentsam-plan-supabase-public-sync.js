/**
 * Mirrors D1 agent_chat_plan workflow runs and plan rows to Supabase agentsam.* tables
 * via Hyperdrive SQL (no PostgREST).
 */

import { patchD1WorkflowRunSupabaseMirrorState } from './agentsam-supabase-sync.js';
import { isHyperdriveUsable, runHyperdriveQuery, runHyperdriveTransaction } from './hyperdrive-query.js';
import {
  appendWorkflowEvents,
  captureDebugSnapshot,
  createWorkflowRun,
  updateWorkflowRun,
} from './agentsam-workflow-debug-store.js';

const WORKFLOW_KEY = 'agent_chat_plan';
const WORKFLOW_D1_ID = 'wf_agent_chat_plan';

function j(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function maybeJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return fallback;
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function isoFromUnix(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const ms = n < 1e12 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

/** D1 may store created_at as unix int or SQLite datetime string. */
function isoFromD1Time(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n)) return isoFromUnix(n);
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** D1 JSON stored as TEXT → object for PostgREST jsonb. */
function jsonTextToJsonb(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  if (Array.isArray(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Map one D1 agentsam_plans row → public.agentsam_plans (PostgREST) shape.
 * @param {Record<string, unknown>} plan
 */
export function mapD1PlanToSupabasePublicRow(plan) {
  if (!plan?.id) return null;
  const planDate = String(plan.plan_date || '').trim().slice(0, 10);
  const nowIso = new Date().toISOString();
  return {
    id: String(plan.id),
    plan_date: planDate || nowIso.slice(0, 10),
    title: String(plan.title || 'Plan').slice(0, 2000),
    status: String(plan.status || 'active'),
    morning_brief: plan.morning_brief != null ? String(plan.morning_brief) : null,
    session_notes: plan.session_notes != null ? String(plan.session_notes) : null,
    eod_summary: plan.eod_summary != null ? String(plan.eod_summary) : null,
    available_providers: jsonTextToJsonb(plan.available_providers) ?? [],
    blocked_providers: jsonTextToJsonb(plan.blocked_providers) ?? [],
    budget_snapshot: jsonTextToJsonb(plan.budget_snapshot) ?? {},
    default_model: plan.default_model != null ? String(plan.default_model) : null,
    carry_over_from: plan.carry_over_from != null ? String(plan.carry_over_from) : null,
    carry_over_count: plan.carry_over_count != null ? Number(plan.carry_over_count) : null,
    tasks_total: plan.tasks_total != null ? Number(plan.tasks_total) || 0 : 0,
    tasks_done: plan.tasks_done != null ? Number(plan.tasks_done) || 0 : 0,
    tasks_blocked: plan.tasks_blocked != null ? Number(plan.tasks_blocked) || 0 : 0,
    created_at: isoFromD1Time(plan.created_at) || nowIso,
    updated_at: isoFromD1Time(plan.updated_at) || nowIso,
  };
}

/**
 * Map one D1 agentsam_plan_tasks row → public.agentsam_plan_tasks (PostgREST) shape.
 * D1 `output_summary` maps to Supabase `notes`.
 * @param {Record<string, unknown>} task
 */
export function mapD1PlanTaskToSupabasePublicRow(task) {
  if (!task?.id || !task?.plan_id) return null;
  const notes =
    task.output_summary != null && String(task.output_summary).trim() !== ''
      ? String(task.output_summary)
      : task.notes != null && String(task.notes).trim() !== ''
        ? String(task.notes)
        : null;
  const completedAt = isoFromD1Time(task.completed_at);
  return {
    id: String(task.id),
    plan_id: String(task.plan_id),
    order_index: task.order_index != null ? Number(task.order_index) || 0 : 0,
    title: String(task.title || 'Task').slice(0, 2000),
    description: task.description != null ? String(task.description).slice(0, 8000) : null,
    priority: String(task.priority || 'P1').toUpperCase(),
    category: String(task.category || 'other').toLowerCase(),
    status: String(task.status || 'todo').toLowerCase(),
    files_involved: jsonTextToJsonb(task.files_involved) ?? [],
    tables_involved: jsonTextToJsonb(task.tables_involved) ?? [],
    routes_involved: jsonTextToJsonb(task.routes_involved) ?? [],
    estimated_minutes: task.estimated_minutes != null ? Number(task.estimated_minutes) : null,
    actual_minutes: task.actual_minutes != null ? Number(task.actual_minutes) : null,
    blocked_reason: task.blocked_reason != null ? String(task.blocked_reason) : null,
    notes,
    created_at: isoFromD1Time(task.created_at) || new Date().toISOString(),
    completed_at: completedAt,
  };
}

/**
 * Upsert D1 plan + all its plan_tasks into Supabase public.agentsam_plans / agentsam_plan_tasks.
 * Non-fatal if env missing; logs on HTTP errors.
 * @param {any} env
 * @param {string} planId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function hyperdriveUpsertPlanRows(env, planRow, taskRows) {
  if (!isHyperdriveUsable(env)) return { ok: false, error: 'hyperdrive_unavailable' };

  const planSql = `
    INSERT INTO agentsam.agentsam_plans (
      id, plan_date, title, status, morning_brief, session_notes, eod_summary,
      available_providers, blocked_providers, budget_snapshot, default_model,
      carry_over_from, carry_over_count, tasks_total, tasks_done, tasks_blocked,
      created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17::timestamptz,$18::timestamptz
    )
    ON CONFLICT (id) DO UPDATE SET
      plan_date = EXCLUDED.plan_date,
      title = EXCLUDED.title,
      status = EXCLUDED.status,
      session_notes = EXCLUDED.session_notes,
      tasks_total = EXCLUDED.tasks_total,
      tasks_done = EXCLUDED.tasks_done,
      tasks_blocked = EXCLUDED.tasks_blocked,
      updated_at = EXCLUDED.updated_at`;

  const pr = await runHyperdriveQuery(env, planSql, [
    planRow.id,
    planRow.plan_date,
    planRow.title,
    planRow.status,
    planRow.morning_brief,
    planRow.session_notes,
    planRow.eod_summary,
    j(planRow.available_providers, []),
    j(planRow.blocked_providers, []),
    j(planRow.budget_snapshot, {}),
    planRow.default_model,
    planRow.carry_over_from,
    planRow.carry_over_count,
    planRow.tasks_total,
    planRow.tasks_done,
    planRow.tasks_blocked,
    planRow.created_at,
    planRow.updated_at,
  ]);
  if (!pr.ok) return { ok: false, error: pr.error || 'agentsam_plans_upsert_failed' };

  for (const task of taskRows) {
    const taskSql = `
      INSERT INTO agentsam.agentsam_plan_tasks (
        id, plan_id, order_index, title, description, priority, category, status,
        files_involved, tables_involved, routes_involved,
        estimated_minutes, actual_minutes, blocked_reason, notes, created_at, completed_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16::timestamptz,$17::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        completed_at = EXCLUDED.completed_at`;
    const tr = await runHyperdriveQuery(env, taskSql, [
      task.id,
      task.plan_id,
      task.order_index,
      task.title,
      task.description,
      task.priority,
      task.category,
      task.status,
      j(task.files_involved, []),
      j(task.tables_involved, []),
      j(task.routes_involved, []),
      task.estimated_minutes,
      task.actual_minutes,
      task.blocked_reason,
      task.notes,
      task.created_at,
      task.completed_at,
    ]);
    if (!tr.ok) return { ok: false, error: tr.error || 'agentsam_plan_tasks_upsert_failed' };
  }

  return { ok: true };
}

export async function mirrorAgentsamD1PlanToSupabasePublic(env, planId) {
  const pid = String(planId || '').trim();
  const db = env?.DB;
  if (!pid || !db) return { ok: false, error: 'missing_db_or_plan' };
  if (!isHyperdriveUsable(env)) return { ok: false, error: 'hyperdrive_unavailable' };

  try {
    const plan = await db.prepare(`SELECT * FROM agentsam_plans WHERE id = ? LIMIT 1`).bind(pid).first();
    if (!plan?.id) return { ok: false, error: 'plan_not_found' };

    const planRow = mapD1PlanToSupabasePublicRow(plan);
    if (!planRow) return { ok: false, error: 'plan_map_failed' };

    const { results: taskRowsRaw } = await db
      .prepare(`SELECT * FROM agentsam_plan_tasks WHERE plan_id = ? ORDER BY order_index ASC, id ASC`)
      .bind(pid)
      .all();
    const tasks = (taskRowsRaw || [])
      .map((t) => mapD1PlanTaskToSupabasePublicRow(t))
      .filter(Boolean);

    return hyperdriveUpsertPlanRows(env, planRow, tasks);
  } catch (e) {
    const msg = e?.message != null ? String(e.message) : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Fire-and-forget mirror of D1 plan + tasks to Supabase public tables.
 * @param {any} env
 * @param {any} ctx
 * @param {string} planId
 */
export function scheduleMirrorAgentsamPlanToSupabasePublic(env, ctx, planId) {
  const p = mirrorAgentsamD1PlanToSupabasePublic(env, planId).then((r) => {
    if (!r.ok && r.error && r.error !== 'supabase_env_missing') {
      console.warn('[scheduleMirrorAgentsamPlanToSupabasePublic]', planId, r.error);
    }
    return r;
  });
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p.catch(() => {}));
  else void p.catch(() => {});
}

function normalizeWorkspace(v) {
  return v && String(v).trim() !== '' ? String(v).trim() : 'global';
}

/**
 * @param {any} env
 * @param {string} runId D1 agentsam_workflow_runs.id
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function mirrorAgentChatPlanD1RunToSupabasePublic(env, runId) {
  const rid = String(runId || '').trim();
  const db = env?.DB;
  if (!db || !rid) return { ok: false, error: 'missing_db_or_run' };
  if (!isHyperdriveUsable(env)) return { ok: false, error: 'hyperdrive_unavailable' };

  try {
    const workflow = await db
      .prepare(
        `SELECT * FROM agentsam_workflows WHERE id = ? OR workflow_key = ? LIMIT 1`,
      )
      .bind(WORKFLOW_D1_ID, WORKFLOW_KEY)
      .first();

    const nodes = workflow
      ? (
          await db
            .prepare(
              `SELECT n.* FROM agentsam_workflow_nodes n
               JOIN agentsam_workflows w ON w.id = n.workflow_id
               WHERE w.workflow_key = ? ORDER BY n.sort_order, n.node_key`,
            )
            .bind(WORKFLOW_KEY)
            .all()
        ).results || []
      : [];

    const edges = workflow
      ? (
          await db
            .prepare(
              `SELECT e.* FROM agentsam_workflow_edges e
               JOIN agentsam_workflows w ON w.id = e.workflow_id
               WHERE w.workflow_key = ? ORDER BY e.priority, e.from_node_key, e.to_node_key`,
            )
            .bind(WORKFLOW_KEY)
            .all()
        ).results || []
      : [];

    const run = await db
      .prepare(`SELECT * FROM agentsam_workflow_runs WHERE id = ? LIMIT 1`)
      .bind(rid)
      .first();

    if (!workflow || !run) {
      const err = !workflow ? 'workflow_template_missing' : 'workflow_run_missing';
      await patchD1WorkflowRunSupabaseMirrorState(env, rid, { ok: false, error: err });
      return { ok: false, error: err };
    }

    const tenantId = run.tenant_id || workflow.tenant_id || env?.TENANT_ID || '';
    const workspaceId = normalizeWorkspace(run.workspace_id || workflow.workspace_id);

    const steps =
      (
        await db
          .prepare(
            `SELECT * FROM agentsam_execution_steps WHERE execution_id = ? ORDER BY created_at, node_key`,
          )
          .bind(rid)
          .all()
      ).results || [];

    const planRows =
      (
        await db
          .prepare(
            `SELECT * FROM agentsam_plans WHERE workflow_run_id = ? ORDER BY created_at DESC LIMIT 1`,
          )
          .bind(rid)
          .all()
      ).results || [];
    const plan = planRows[0] || null;

    let tasks = [];
    if (plan?.id) {
      tasks =
        (
          await db
            .prepare(
              `SELECT * FROM agentsam_plan_tasks WHERE plan_id = ? ORDER BY order_index`,
            )
            .bind(plan.id)
            .all()
        ).results || [];
    }

    const approvals =
      (
        await db
          .prepare(
            `SELECT * FROM agentsam_approval_queue
             WHERE workflow_run_id = ?
                OR execution_step_id IN (SELECT id FROM agentsam_execution_steps WHERE execution_id = ?)
             ORDER BY created_at DESC`,
          )
          .bind(rid, rid)
          .all()
      ).results || [];

    const crIds = new Set();
    for (const a of approvals) {
      if (a.command_run_id) crIds.add(String(a.command_run_id));
    }
    let commandRuns = [];
    if (crIds.size) {
      const placeholders = [...crIds].map(() => '?').join(',');
      commandRuns =
        (
          await db
            .prepare(`SELECT * FROM agentsam_command_run WHERE id IN (${placeholders})`)
            .bind(...[...crIds])
            .all()
        ).results || [];
    }

    const workflowRow = {
      id: `sb_${workflow.id}`,
      d1_workflow_id: workflow.id,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      workflow_key: workflow.workflow_key || WORKFLOW_KEY,
      name: workflow.display_name || workflow.workflow_key || WORKFLOW_KEY,
      description: workflow.description ?? null,
      status: Number(workflow.is_active ?? 1) ? 'active' : 'inactive',
      trigger_type: workflow.trigger_type || 'agent',
      definition_json: {
        d1_workflow: workflow,
        nodes,
        edges,
        source: 'd1',
        spine: 'agentsam_workflow_runs.id -> agentsam_execution_steps.execution_id',
      },
      metadata: {
        source: 'agentsam-plan-supabase-public-sync.js',
        plan_id: plan?.id ?? null,
      },
    };

    const runInput = maybeJson(run.input_json, {});
    const runOutput = maybeJson(run.output_json, {});
    const runStepResults = maybeJson(run.step_results_json, []);

    const runRow = {
      id: run.id,
      d1_run_id: run.id,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      workflow_id: workflowRow.id,
      workflow_key: run.workflow_key || WORKFLOW_KEY,
      display_name: run.display_name || 'Agent Sam Workflow Run',
      trigger_type: run.trigger_type || 'agent',
      status: run.status || 'running',
      input_json: runInput,
      output_json: runOutput,
      step_results_json: runStepResults,
      steps_completed: run.steps_completed ?? 0,
      steps_total: run.steps_total ?? steps.length,
      error_message: run.error_message ?? null,
      model_used: run.model_used ?? null,
      input_tokens: run.input_tokens ?? 0,
      output_tokens: run.output_tokens ?? 0,
      cost_usd: run.cost_usd ?? 0,
      duration_ms: run.duration_ms ?? null,
      environment: run.environment || 'production',
      retry_count: run.retry_count ?? 0,
      parent_run_id: run.parent_run_id ?? null,
      started_at: isoFromUnix(run.started_at),
      completed_at: isoFromUnix(run.completed_at),
      supabase_sync_status: 'synced',
      supabase_synced_at: new Date().toISOString(),
      session_id: run.session_id ?? null,
      conversation_id: run.conversation_id ?? null,
      user_id: run.user_id ?? null,
      run_group_id: run.run_group_id ?? null,
      mode: run.mode ?? null,
      provider: run.provider ?? null,
      model_key: run.model_key ?? null,
      total_tokens: (run.input_tokens ?? 0) + (run.output_tokens ?? 0),
      estimated_cost_usd: run.cost_usd ?? 0,
      latency_ms: run.duration_ms ?? null,
      metadata: {
        source: 'agentsam-plan-supabase-public-sync.js',
        d1_workflow_id: run.workflow_id,
        d1_plan_id: plan?.id ?? null,
        approval_ids: approvals.map((a) => a.id),
        command_run_ids: commandRuns.map((c) => c.id),
      },
    };

    const taskByStep = Object.fromEntries(
      tasks.filter((t) => t.execution_step_id).map((t) => [String(t.execution_step_id), t]),
    );

    const stepRows = [];
    const eventRows = [];
    steps.forEach((step, idx) => {
      const inp = maybeJson(step.input_json, {});
      const out = maybeJson(step.output_json, {});
      const err = maybeJson(step.error_json, {});
      const task = taskByStep[String(step.id)] || null;
      const handlerKey = inp.handler_key || task?.handler_key || null;
      const modelKey = handlerKey && String(handlerKey).startsWith('gpt-') ? String(handlerKey) : null;

      stepRows.push({
        id: step.id,
        run_id: run.id,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        step_index: idx,
        step_key: step.node_key,
        step_type: step.node_type || 'agent',
        status: step.status || 'started',
        tool_key: handlerKey,
        command_key: handlerKey,
        provider: modelKey ? 'openai' : null,
        model_key: modelKey,
        input_json: inp,
        output_json: out,
        error_message: err && Object.keys(err).length ? JSON.stringify(err) : null,
        latency_ms: step.latency_ms ?? null,
        metadata: {
          d1_execution_id: step.execution_id,
          approval_id: step.approval_id,
          plan_task_id: task?.id ?? null,
        },
      });

      eventRows.push({
        id: `wfe_${step.id}`,
        run_id: run.id,
        step_id: step.id,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        event_type: `step_${String(step.status || 'updated')}`,
        event_level: 'info',
        message: `Step ${step.node_key} is ${step.status}`,
        payload_json: {
          node_key: step.node_key,
          node_type: step.node_type,
          status: step.status,
          approval_id: step.approval_id,
          source: 'd1_mirror',
        },
      });
    });

    const snapshotRow = {
      id: `dbg_${run.id.replace(/-/g, '_')}`,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      run_id: run.id,
      snapshot_key: `d1_parity_${run.id}`,
      source: 'agentsam-plan-supabase-public-sync.js',
      status: 'captured',
      request_json: {
        workflow_run_id: run.id,
        workflow_key: run.workflow_key,
        plan_id: plan?.id ?? null,
      },
      response_json: {
        steps: steps.length,
        tasks: tasks.length,
        approvals: approvals.length,
        command_runs: commandRuns.length,
      },
      environment_json: {
        source: 'worker',
      },
      notes: 'D1 to Supabase direct parity sync for Agent Sam workflow run.',
    };

    const wfSql = `
      INSERT INTO agentsam.agentsam_workflows (
        id, d1_workflow_id, tenant_id, workspace_id, workflow_key, name, description,
        status, trigger_type, definition_json, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        workflow_key = EXCLUDED.workflow_key,
        name = EXCLUDED.name,
        definition_json = EXCLUDED.definition_json,
        metadata = agentsam.agentsam_workflows.metadata || EXCLUDED.metadata`;
    const wfHd = await runHyperdriveQuery(env, wfSql, [
      workflowRow.id,
      workflowRow.d1_workflow_id,
      workflowRow.tenant_id,
      workflowRow.workspace_id,
      workflowRow.workflow_key,
      workflowRow.name,
      workflowRow.description,
      workflowRow.status,
      workflowRow.trigger_type,
      j(workflowRow.definition_json, {}),
      j(workflowRow.metadata, {}),
    ]);
    if (!wfHd.ok) {
      const err = wfHd.error || 'agentsam_workflows_upsert_failed';
      await patchD1WorkflowRunSupabaseMirrorState(env, rid, { ok: false, error: err });
      return { ok: false, error: err };
    }

    const runHd = await createWorkflowRun(env, {
      id: runRow.id,
      d1_run_id: runRow.d1_run_id,
      tenant_id: runRow.tenant_id,
      workspace_id: runRow.workspace_id,
      workflow_id: runRow.workflow_id,
      workflow_key: runRow.workflow_key,
      display_name: runRow.display_name,
      trigger_type: runRow.trigger_type,
      status: runRow.status,
      session_id: runRow.session_id,
      conversation_id: runRow.conversation_id,
      user_id: runRow.user_id,
      run_group_id: runRow.run_group_id,
      mode: runRow.mode,
      provider: runRow.provider,
      model_key: runRow.model_key,
      input_json: runRow.input_json,
      output_json: runRow.output_json,
      step_results_json: runRow.step_results_json,
      steps_completed: runRow.steps_completed,
      steps_total: runRow.steps_total,
      error_message: runRow.error_message,
      model_used: runRow.model_used,
      input_tokens: runRow.input_tokens,
      output_tokens: runRow.output_tokens,
      total_tokens: runRow.total_tokens,
      cost_usd: runRow.cost_usd,
      estimated_cost_usd: runRow.estimated_cost_usd,
      duration_ms: runRow.duration_ms,
      latency_ms: runRow.latency_ms,
      environment: runRow.environment,
      metadata: runRow.metadata,
      started_at: runRow.started_at,
      completed_at: runRow.completed_at,
    });
    if (!runHd.ok) {
      const terminal = ['completed', 'failed', 'cancelled'].includes(String(runRow.status || ''));
      const retry = terminal
        ? await updateWorkflowRun(env, runRow.id, {
            status: runRow.status,
            output_json: runRow.output_json,
            step_results_json: runRow.step_results_json,
            steps_completed: runRow.steps_completed,
            steps_total: runRow.steps_total,
            error_message: runRow.error_message,
            input_tokens: runRow.input_tokens,
            output_tokens: runRow.output_tokens,
            total_tokens: runRow.total_tokens,
            cost_usd: runRow.cost_usd,
            duration_ms: runRow.duration_ms,
            completed_at: runRow.completed_at,
            metadata: runRow.metadata,
          })
        : runHd;
      if (!retry?.ok) {
        const err = retry?.error || 'agentsam_workflow_runs_upsert_failed';
        await patchD1WorkflowRunSupabaseMirrorState(env, rid, { ok: false, error: err });
        return { ok: false, error: err };
      }
    }

    const stepsHd = await runHyperdriveTransaction(env, async (client) => {
      for (const step of stepRows) {
        await client.query(
          `INSERT INTO agentsam.agentsam_workflow_steps (
            id, run_id, tenant_id, workspace_id, step_index, step_key, step_type, status,
            tool_key, command_key, provider, model_key,
            input_json, output_json, error_message, latency_ms, metadata
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17::jsonb)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            output_json = EXCLUDED.output_json,
            error_message = EXCLUDED.error_message`,
          [
            step.id,
            step.run_id,
            step.tenant_id,
            step.workspace_id,
            step.step_index,
            step.step_key,
            step.step_type,
            step.status,
            step.tool_key,
            step.command_key,
            step.provider,
            step.model_key,
            j(step.input_json, {}),
            j(step.output_json, {}),
            step.error_message,
            step.latency_ms,
            j(step.metadata, {}),
          ],
        );
      }
      return { rows: stepRows };
    });
    if (!stepsHd.ok) {
      await patchD1WorkflowRunSupabaseMirrorState(env, rid, {
        ok: false,
        error: stepsHd.error || 'agentsam_workflow_steps_upsert_failed',
      });
      return { ok: false, error: stepsHd.error };
    }

    const eventsHd = await appendWorkflowEvents(env, eventRows.map((ev) => ({
      id: ev.id,
      run_id: ev.run_id,
      step_id: ev.step_id,
      tenant_id: ev.tenant_id,
      workspace_id: ev.workspace_id,
      event_type: ev.event_type,
      event_level: ev.event_level,
      message: ev.message,
      payload_json: ev.payload_json,
    })));
    if (!eventsHd.ok) {
      await patchD1WorkflowRunSupabaseMirrorState(env, rid, {
        ok: false,
        error: eventsHd.error || 'agentsam_workflow_events_upsert_failed',
      });
      return { ok: false, error: eventsHd.error };
    }

    const snapHd = await captureDebugSnapshot(env, {
      id: snapshotRow.id,
      tenant_id: snapshotRow.tenant_id,
      workspace_id: snapshotRow.workspace_id,
      run_id: snapshotRow.run_id,
      snapshot_key: snapshotRow.snapshot_key,
      source: snapshotRow.source,
      status: snapshotRow.status,
      request_json: snapshotRow.request_json,
      response_json: snapshotRow.response_json,
      environment_json: snapshotRow.environment_json,
      notes: snapshotRow.notes,
    });
    if (!snapHd.ok) {
      await patchD1WorkflowRunSupabaseMirrorState(env, rid, {
        ok: false,
        error: snapHd.error || 'agentsam_debug_snapshots_upsert_failed',
      });
      return { ok: false, error: snapHd.error };
    }

    if (plan?.id) {
      const pm = await mirrorAgentsamD1PlanToSupabasePublic(env, String(plan.id));
      if (!pm.ok) {
        console.warn('[mirrorAgentChatPlanD1RunToSupabasePublic] agentsam_plans/tasks mirror:', pm.error);
      }
    }

    await patchD1WorkflowRunSupabaseMirrorState(env, rid, { ok: true, supabaseRunId: run.id });
    return { ok: true };
  } catch (e) {
    const msg = e?.message != null ? String(e.message) : String(e);
    await patchD1WorkflowRunSupabaseMirrorState(env, rid, { ok: false, error: msg });
    return { ok: false, error: msg };
  }
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {string} runId
 */
export function scheduleMirrorAgentChatPlanToSupabase(env, ctx, runId) {
  const p = mirrorAgentChatPlanD1RunToSupabasePublic(env, runId);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p.catch(() => {}));
  else void p.catch(() => {});
}
