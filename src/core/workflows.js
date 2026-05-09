/**
 * Multi-step workflow runner — D1 agentsam_mcp_workflows + agentsam_workflow_runs.
 */
import { executeCommand } from '../api/command-run-telemetry.js';
import { resolveCanonicalUserId } from '../api/auth.js';
import { isFeatureEnabled } from './features.js';
import { pragmaTableInfo } from './retention.js';

export async function startWorkflow(env, ctx, o) {
  const {
    workflowKey,
    userId,
    sessionId,
    tenantId,
    workspaceId,
    inputJson = {},
    planId = null,
    triggerType = 'agent',
  } = o || {};
  if (!env?.DB) return { ok: false, error: 'no_db' };
  if (!workspaceId || String(workspaceId).trim() === '') {
    return { ok: false, error: 'workspace_required' };
  }

  const enabled = await isFeatureEnabled(env, 'multi_step_workflows', { userId, tenantId });
  if (!enabled) return { ok: false, error: 'feature_disabled' };

  // Graph-mode check: if agentsam_workflow_nodes exist for this key,
  // use the DAG executor instead of the flat steps_json runner.
  if (env.DB && workflowKey) {
    try {
      const nodeCheck = await env.DB.prepare(
        `SELECT COUNT(*) AS n
        FROM agentsam_workflow_nodes wn
        LEFT JOIN agentsam_workflows w
          ON w.id = wn.workflow_id AND COALESCE(w.is_active, 1) = 1
        LEFT JOIN agentsam_mcp_workflows m
          ON m.id = wn.workflow_id AND COALESCE(m.is_active, 1) = 1
        WHERE COALESCE(wn.is_active, 1) = 1
          AND (w.workflow_key = ? OR m.workflow_key = ?)`,
      )
        .bind(workflowKey, workflowKey)
        .first();

      if ((nodeCheck?.n ?? 0) > 0) {
        const { executeWorkflowGraph } = await import('./workflow-executor.js');
        return executeWorkflowGraph(env, {
          workflowKey,
          input: inputJson ?? {},
          tenantId,
          workspaceId,
          userId,
          userEmail: null,
          triggerType,
        });
      }
    } catch (e) {
      console.warn('[workflows] graph-mode check failed, falling back:', e?.message);
    }
  }

  let workflow = null;
  try {
    workflow = await env.DB.prepare(
      `SELECT * FROM agentsam_mcp_workflows WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
    )
      .bind(workflowKey)
      .first();
  } catch {
    workflow = await env.DB.prepare(`SELECT * FROM agentsam_mcp_workflows WHERE workflow_key = ? LIMIT 1`)
      .bind(workflowKey)
      .first()
      .catch(() => null);
  }
  if (!workflow) return { ok: false, error: 'workflow_not_found' };

  let steps = [];
  try {
    steps = JSON.parse(workflow.steps_json || '[]');
  } catch {
    steps = [];
  }
  const runId = 'wrun_' + crypto.randomUUID().slice(0, 16);
  const wsResolved = workspaceId;

  await env.DB
    .prepare(
      `INSERT INTO agentsam_workflow_runs
      (id, workflow_id, tenant_id, user_id, session_id, workspace_id,
       workflow_key, display_name, trigger_type, status,
       input_json, steps_total, started_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())`,
    )
    .bind(
      runId,
      workflow.id,
      tenantId,
      userId,
      sessionId,
      wsResolved,
      workflowKey,
      workflow.display_name,
      triggerType,
      'running',
      JSON.stringify(inputJson),
      steps.length,
    )
    .run();

  const sbUrl = env.SUPABASE_URL;
  const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (sbUrl && sbKey) {
    ctx.waitUntil(
      fetch(`${sbUrl}/rest/v1/agentsam_workflow_runs`, {
        method: 'POST',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          d1_run_id: runId,
          tenant_id: tenantId,
          workspace_id: wsResolved,
          workflow_key: workflowKey,
          display_name: workflow.display_name,
          trigger_type: triggerType,
          status: 'running',
          steps_total: steps.length,
          steps_completed: 0,
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => {}),
    );
  }

  ctx.waitUntil(
    executeWorkflowSteps(env, ctx, {
      runId,
      workflowKey,
      steps,
      userId,
      sessionId,
      tenantId,
      workspaceId: wsResolved,
      planId,
      sbUrl,
      sbKey,
    }),
  );

  return { ok: true, run_id: runId, steps_total: steps.length };
}

async function executeWorkflowSteps(env, ctx, {
  runId,
  workflowKey,
  steps,
  userId,
  sessionId,
  tenantId,
  workspaceId,
  planId,
  sbUrl,
  sbKey,
}) {
  const stepResults = [];
  const wfKey = workflowKey != null ? String(workflowKey).slice(0, 500) : '';

  const execCols = env?.DB ? await pragmaTableInfo(env.DB, 'agentsam_executions') : new Set();
  const stepCols = env?.DB ? await pragmaTableInfo(env.DB, 'agentsam_execution_steps') : new Set();
  const workflowExecId = `exec_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  if (execCols.size && execCols.has('task_id')) {
    try {
      const uid =
        userId != null && String(userId).trim() !== ''
          ? await resolveCanonicalUserId(String(userId).trim(), env)
          : null;
      if (execCols.has('model_key')) {
        await env.DB
          .prepare(
            `INSERT OR IGNORE INTO agentsam_executions
             (id, tenant_id, workspace_id, user_id, command_run_id, task_id, execution_type, command,
              status, duration_ms, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,unixepoch())`,
          )
          .bind(
            workflowExecId,
            tenantId ?? null,
            workspaceId,
            uid,
            null,
            runId,
            'workflow',
            wfKey || null,
            'running',
            0,
          )
          .run();
      } else {
        await env.DB
          .prepare(
            `INSERT OR IGNORE INTO agentsam_executions
             (id, tenant_id, workspace_id, user_id, task_id, execution_type, command, duration_ms, created_at)
             VALUES (?,?,?,?,?,?,?,?,unixepoch())`,
          )
          .bind(workflowExecId, tenantId ?? null, workspaceId, uid, runId, 'workflow', wfKey || null, 0)
          .run();
      }
    } catch (e) {
      console.warn('[workflow] agentsam_executions', e?.message ?? e);
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepStart = Date.now();

    try {
      const slug = step.command || step.slug;
      const cmd = await env.DB
        .prepare(
          `SELECT id FROM agentsam_commands WHERE slug = ? OR mapped_command = ? LIMIT 1`,
        )
        .bind(slug, step.command != null ? String(step.command) : slug)
        .first()
        .catch(() => null);

      let stepResult;
      if (cmd?.id) {
        stepResult = await executeCommand(env, ctx, {
          commandId: cmd.id,
          userId,
          sessionId,
          tenantId,
          workspaceId,
          args: step.args || {},
          planId,
          todoId: step.todo_id || null,
          taskType: step.task_type || 'tool_use',
        });
      } else {
        stepResult = { ok: false, error: `command_not_found: ${step.command || step.slug}` };
      }

      stepResults.push({
        step: i + 1,
        name: step.name || step.command,
        status: stepResult.ok ? 'completed' : 'failed',
        result: stepResult,
        duration_ms: Date.now() - stepStart,
      });

      if (stepCols.has('execution_id') && workflowExecId) {
        const stepEnd = Date.now();
        const latencyMs = Math.max(0, stepEnd - stepStart);
        const nodeKey = String(step.slug || step.command || step.name || `step_${i + 1}`).slice(0, 500);
        const nodeType = String(step.task_type || 'command').slice(0, 120);
        const st = stepResult.ok ? 'completed' : 'failed';
        const t0 = Math.floor(stepStart / 1000);
        const t1 = Math.floor(stepEnd / 1000);
        try {
          await env.DB
            .prepare(
              `INSERT OR IGNORE INTO agentsam_execution_steps
               (id, execution_id, node_key, node_type, status, input_json, output_json,
                started_at, completed_at, latency_ms, tokens_in, tokens_out, cost_usd, created_at)
               VALUES ('estep_'||lower(hex(randomblob(8))),?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
            )
            .bind(
              workflowExecId,
              nodeKey,
              nodeType,
              st,
              JSON.stringify(step.args ?? step.input ?? {}).slice(0, 8000),
              JSON.stringify(stepResult ?? {}).slice(0, 16000),
              t0,
              t1,
              latencyMs,
              0,
              0,
              0,
            )
            .run();
        } catch (e) {
          console.warn('[workflow] agentsam_execution_steps', e?.message ?? e);
        }
      }

      await env.DB
        .prepare(
          `UPDATE agentsam_workflow_runs SET
          steps_completed = ?,
          step_results_json = ?
        WHERE id = ?`,
        )
        .bind(i + 1, JSON.stringify(stepResults), runId)
        .run()
        .catch(() => {});

      if (sbUrl && sbKey) {
        await fetch(`${sbUrl}/rest/v1/agentsam_workflow_runs?d1_run_id=eq.${encodeURIComponent(runId)}`, {
          method: 'PATCH',
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            steps_completed: i + 1,
            updated_at: new Date().toISOString(),
          }),
        }).catch(() => {});
      }

      if (!stepResult.ok && !step.optional) break;
    } catch (e) {
      stepResults.push({
        step: i + 1,
        name: step.name,
        status: 'failed',
        error: e?.message,
      });
      break;
    }
  }

  const allOk = stepResults.every((s) => s.status === 'completed');
  const finalStatus = allOk ? 'completed' : 'failed';

  await env.DB
    .prepare(
      `UPDATE agentsam_workflow_runs SET
      status = ?,
      completed_at = unixepoch(),
      step_results_json = ?,
      steps_completed = ?
    WHERE id = ?`,
    )
    .bind(finalStatus, JSON.stringify(stepResults), stepResults.length, runId)
    .run()
    .catch(() => {});

  if (sbUrl && sbKey) {
    await fetch(`${sbUrl}/rest/v1/agentsam_workflow_runs?d1_run_id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: finalStatus,
        steps_completed: stepResults.length,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => {});
  }
}

export { executeWorkflowGraph } from './workflow-executor.js';
