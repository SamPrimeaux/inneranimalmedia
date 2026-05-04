/**
 * Multi-step workflow runner — D1 agentsam_mcp_workflows + agentsam_workflow_runs.
 */
import { executeCommand, resolveRuntimeWorkspaceId } from '../api/command-run-telemetry.js';
import { isFeatureEnabled } from './features.js';

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

  const enabled = await isFeatureEnabled(env, 'multi_step_workflows', { userId, tenantId });
  if (!enabled) return { ok: false, error: 'feature_disabled' };

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
  const wsResolved = resolveRuntimeWorkspaceId(env, workspaceId);

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
