/**
 * Mirrors a proven D1 agent_chat_plan workflow run to Supabase public.* tables
 * using the same payload shape as scripts/agentsam-supabase-direct-sync.py
 * (PostgREST upsert; no agentsam schema profile).
 */

import { patchD1WorkflowRunSupabaseMirrorState } from './agentsam-supabase-sync.js';

const WORKFLOW_KEY = 'agent_chat_plan';
const WORKFLOW_D1_ID = 'wf_agent_chat_plan';

function supabaseRestBase(env) {
  const raw = env?.SUPABASE_URL;
  if (!raw || !String(raw).trim()) return null;
  return String(raw).replace(/\/$/, '');
}

function supabaseServiceRole(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !String(key).trim()) return null;
  return String(key).trim();
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
  const base = supabaseRestBase(env);
  const key = supabaseServiceRole(env);
  if (!db || !rid) return { ok: false, error: 'missing_db_or_run' };
  if (!base || !key) return { ok: false, error: 'supabase_env_missing' };

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  };

  const upsert = async (table, rows, onConflict = 'id') => {
    if (!rows?.length) return { ok: true, skipped: true };
    const q = `?on_conflict=${encodeURIComponent(onConflict)}`;
    const res = await fetch(`${base}/rest/v1/${table}${q}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `${table} HTTP ${res.status}: ${text.slice(0, 2000)}` };
    }
    return { ok: true };
  };

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

    const tenantId = run.tenant_id || workflow.tenant_id || 'tenant_sam_primeaux';
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

    const order = [
      ['agentsam_workflows', workflowRow],
      ['agentsam_workflow_runs', runRow],
      ['agentsam_workflow_steps', stepRows],
      ['agentsam_workflow_events', eventRows],
      ['agentsam_debug_snapshots', [snapshotRow]],
    ];

    for (const [table, payload] of order) {
      const rows = Array.isArray(payload) ? payload : [payload];
      const r = await upsert(table, rows.filter(Boolean));
      if (!r.ok) {
        await patchD1WorkflowRunSupabaseMirrorState(env, rid, { ok: false, error: r.error || table });
        return { ok: false, error: r.error };
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
