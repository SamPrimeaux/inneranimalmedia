/**
 * Agent Sam Task Executor
 * Runs agentsam_plan_tasks sequentially, emitting SSE events per task.
 * Each task uses its handler_type to decide execution path.
 */

import { dispatchComplete } from './provider.js';
import { resolveCanonicalUserId } from '../api/auth.js';
import { executeCommand, completeCommand } from '../api/command-run-telemetry.js';
import { runTerminalCommandViaHttpExec } from './terminal.js';

const TASK_AGENT_SYSTEM = `You are Agent Sam executing a specific task. Complete it thoroughly and concisely. Return your result as plain text.`;

/** Shell text to run after authorization (handler_key may hold agentsam_commands id). */
function shellCommandForTerminalTask(task) {
  const hk = task.handler_key != null ? String(task.handler_key).trim() : '';
  const desc = String(task.description || '').trim();
  if (hk.startsWith('cmd:')) return desc.slice(0, 4000);
  if (hk && /^[a-zA-Z0-9_.-]{4,80}$/.test(hk) && !/[;&|`$]/.test(hk)) {
    return desc.slice(0, 4000);
  }
  return (hk || desc).slice(0, 4000);
}

/**
 * Planner-generated shell: create command_run + approval_queue and attach to the plan task.
 * @param {any} env
 * @param {{ task: Record<string, unknown>, planId: string, userId: string|null, workspaceId: string, tenantId: string|null, sessionId: string|null, cmd: string, emit: (ev: string, data: Record<string, unknown>) => void }} p
 * @returns {Promise<{ ok: boolean, reused?: boolean, created?: boolean, command_run_id?: string, approval_id?: string }>}
 */
async function ensurePlanTerminalApprovalProposal(env, p) {
  const { task, planId, userId, workspaceId, tenantId, sessionId, cmd, emit } = p;
  if (!env.DB || !cmd.trim()) return { ok: false };

  const ws = String(workspaceId || '').trim();
  if (!ws) return { ok: false };

  let tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : null;
  if (!tid) {
    const prow = await env.DB
      .prepare(`SELECT tenant_id FROM agentsam_plans WHERE id = ? LIMIT 1`)
      .bind(planId)
      .first()
      .catch(() => null);
    tid = prow?.tenant_id != null ? String(prow.tenant_id).trim() : null;
  }
  if (!tid) tid = 'tenant_sam_primeaux';

  const uidRaw = userId != null && String(userId).trim() !== '' ? String(userId).trim() : null;
  if (!uidRaw) return { ok: false };
  const canonicalUser = await resolveCanonicalUserId(uidRaw, env).catch(() => uidRaw);

  const existingCrid = task.command_run_id != null ? String(task.command_run_id).trim() : '';
  if (existingCrid) {
    const run = await env.DB
      .prepare(`SELECT approval_status FROM agentsam_command_run WHERE id = ? LIMIT 1`)
      .bind(existingCrid)
      .first()
      .catch(() => null);
    const q = await env.DB
      .prepare(
        `SELECT id, status FROM agentsam_approval_queue WHERE command_run_id = ? AND lower(status) = 'pending' LIMIT 1`,
      )
      .bind(existingCrid)
      .first()
      .catch(() => null);
    if (run && String(run.approval_status || '').toLowerCase() === 'pending_approval' && q?.id) {
      const input = JSON.stringify({
        command_text: cmd.slice(0, 4000),
        plan_task_id: task.id,
        plan_id: planId,
      });
      emit('approval_required', {
        task_id: task.id,
        command_run_id: existingCrid,
        approval_id: String(q.id),
        title: String(task.title || 'Terminal'),
        command_preview: cmd.slice(0, 2000),
        risk_level: 'high',
        action_summary: `Plan terminal task needs explicit approval before execution.`,
        plan_id: planId,
      });
      return { ok: true, reused: true, command_run_id: existingCrid, approval_id: String(q.id) };
    }
  }

  const runId = 'run_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const approvalId = 'appr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const commandsJson = JSON.stringify([{ proposed_shell: cmd.slice(0, 4000), source: 'plan_terminal', plan_task_id: task.id }]);
  const userInput = String(task.title || 'Plan terminal').slice(0, 2000);
  const inputJson = JSON.stringify({
    command_text: cmd.slice(0, 4000),
    plan_task_id: task.id,
    plan_id: planId,
  });

  try {
    await env.DB
      .prepare(
        `INSERT INTO agentsam_command_run
          (id, tenant_id, workspace_id, user_id, session_id, conversation_id,
           user_input, normalized_intent, intent_category, model_id,
           commands_json, result_json, output_text, confidence_score,
           success, exit_code, duration_ms, input_tokens, output_tokens, cost_usd, error_message,
           selected_command_id, selected_command_slug, risk_level, requires_confirmation, approval_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        runId,
        tid,
        ws,
        canonicalUser,
        sessionId || null,
        null,
        userInput,
        'plan_terminal',
        'misc',
        null,
        commandsJson,
        '{}',
        null,
        null,
        0,
        null,
        null,
        0,
        0,
        0,
        null,
        null,
        null,
        'high',
        1,
        'pending_approval',
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO agentsam_approval_queue
          (id, tenant_id, workspace_id, user_id, session_id, plan_id, command_run_id,
           tool_name, action_summary, input_json, risk_level, status, expires_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending', unixepoch() + 3600)`,
      )
      .bind(
        approvalId,
        tid,
        ws,
        canonicalUser,
        sessionId || null,
        planId,
        runId,
        'terminal.plan_task',
        `Approve shell for plan task: ${String(task.title || '').slice(0, 200)}`,
        inputJson,
        'high',
      )
      .run();

    await env.DB
      .prepare(
        `UPDATE agentsam_plan_tasks SET command_run_id = ?, output_summary = ?, status = 'skipped', completed_at = unixepoch() WHERE id = ?`,
      )
      .bind(
        runId,
        '[terminal] Awaiting explicit approval (Allow) before execution.',
        task.id,
      )
      .run();

    emit('approval_required', {
      task_id: task.id,
      command_run_id: runId,
      approval_id: approvalId,
      title: String(task.title || 'Terminal'),
      command_preview: cmd.slice(0, 2000),
      risk_level: 'high',
      action_summary: `Plan terminal task needs explicit approval before execution.`,
      plan_id: planId,
    });

    return { ok: true, created: true, command_run_id: runId, approval_id: approvalId };
  } catch (e) {
    console.warn('[executePlan] terminal approval proposal failed', e?.message ?? e);
    return { ok: false };
  }
}

/**
 * @param {any} env
 * @param {string} commandRunId
 * @returns {Promise<boolean>}
 */
async function isCommandRunApprovedForTerminal(env, commandRunId) {
  const id = String(commandRunId || '').trim();
  if (!id || !env.DB) return false;
  const run = await env.DB
    .prepare(`SELECT * FROM agentsam_command_run WHERE id = ? LIMIT 1`)
    .bind(id)
    .first()
    .catch(() => null);
  if (!run) return false;

  const st = run.approval_status != null ? String(run.approval_status).toLowerCase().trim() : '';
  // Direct approval on the run row (e.g. post-approve sync). Never treat not_required as user consent for planner shell.
  if (st === 'approved') return true;

  try {
    const q = await env.DB
      .prepare(
        `SELECT id FROM agentsam_approval_queue
         WHERE command_run_id = ?
           AND lower(status) = 'approved'
           AND (expires_at IS NULL OR expires_at > unixepoch())
         LIMIT 1`,
      )
      .bind(id)
      .first();
    return !!q?.id;
  } catch {
    return false;
  }
}

/**
 * Opt-in terminal: only after an approved agentsam_command_run, or executeCommand() did not
 * return pending_approval (same approval gate as the command pipeline).
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{ task: Record<string, unknown>, planId: string, userId: string|null, workspaceId: string, tenantId: string|null, sessionId: string|null }} p
 */
async function authorizePlanTerminalExecution(env, ctx, p) {
  const { task, planId, userId, workspaceId, tenantId, sessionId } = p;
  const stubCtx =
    ctx && typeof ctx.waitUntil === 'function'
      ? ctx
      : { waitUntil: (fn) => void Promise.resolve(typeof fn === 'function' ? fn() : fn).catch(() => {}) };

  const crid = task.command_run_id != null ? String(task.command_run_id).trim() : '';
  if (crid && (await isCommandRunApprovedForTerminal(env, crid))) {
    return { allowed: true, via: 'approved_command_run', command_run_id: crid, chain_id: null, commandId: null };
  }

  let commandId = '';
  const hkRaw = task.handler_key != null ? String(task.handler_key).trim() : '';
  if (hkRaw.startsWith('cmd:')) commandId = hkRaw.slice(4).trim();
  else if (hkRaw && !hkRaw.includes(' ')) commandId = hkRaw;

  if (!commandId && crid && env.DB) {
    const run = await env.DB
      .prepare(`SELECT selected_command_id FROM agentsam_command_run WHERE id = ? LIMIT 1`)
      .bind(crid)
      .first()
      .catch(() => null);
    if (run?.selected_command_id != null && String(run.selected_command_id).trim() !== '') {
      commandId = String(run.selected_command_id).trim();
    }
  }

  if (!commandId || !env.DB) {
    return {
      allowed: false,
      reason: 'no_gate',
      userMessage:
        '[terminal] NOT EXECUTED: link an approved agentsam_command_run (set plan task command_run_id after approval), or set handler_key to an agentsam_commands.id so the command approval gate can run.',
    };
  }

  const cmdRow = await env.DB
    .prepare(`SELECT id FROM agentsam_commands WHERE id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`)
    .bind(commandId)
    .first()
    .catch(() => null);
  if (!cmdRow?.id) {
    return {
      allowed: false,
      reason: 'command_not_found',
      userMessage: `[terminal] NOT EXECUTED: agentsam_commands id not found or inactive: ${commandId}`,
    };
  }

  const execOut = await executeCommand(env, stubCtx, {
    commandId,
    userId,
    tenantId,
    workspaceId,
    sessionId: sessionId || null,
    planId,
    todoId: null,
    skipApprovalGate: false,
  });

  if (!execOut || execOut.ok === false) {
    return {
      allowed: false,
      reason: 'executeCommand_failed',
      userMessage: `[terminal] NOT EXECUTED: executeCommand failed — ${execOut?.error ?? JSON.stringify(execOut)}`,
    };
  }
  if (execOut.status === 'pending_approval') {
    return {
      allowed: false,
      reason: 'pending_approval',
      approval_id: execOut.approval_id ?? null,
      command_run_id: execOut.command_run_id ?? null,
      command_preview: execOut.command_preview != null ? String(execOut.command_preview).slice(0, 2000) : null,
      userMessage:
        '[terminal] NOT EXECUTED: command requires human approval (executeCommand returned pending_approval). Click Allow on the approval card, then run resume for this task.',
    };
  }

  return {
    allowed: true,
    via: 'executeCommand',
    chain_id: execOut.chain_id ?? null,
    commandId,
    modelKey: execOut.model_key ?? null,
    provider: execOut.provider ?? null,
    task_type: execOut.task_type ?? null,
  };
}

export async function executePlan(
  env,
  { planId, userId, workspaceId, tenantId, emit, ctx = null, onlyTaskId = null, sessionId = null, skipPlanAggregate = false },
) {
  if (!env.DB) {
    emit('text', { text: '[Agent Sam] Database is not available; plan tasks were not executed.' });
    return;
  }

  let taskSql = `SELECT * FROM agentsam_plan_tasks
    WHERE plan_id = ? AND status IN ('todo','in_progress')
    ORDER BY order_index ASC`;
  const binds = [planId];
  if (onlyTaskId != null && String(onlyTaskId).trim() !== '') {
    taskSql = `SELECT * FROM agentsam_plan_tasks
    WHERE plan_id = ? AND id = ? AND status IN ('todo','in_progress','skipped')
    ORDER BY order_index ASC LIMIT 1`;
    binds.push(String(onlyTaskId).trim());
  }

  const { results: tasks } = await env.DB.prepare(taskSql).bind(...binds).all();

  if (!tasks || tasks.length === 0) {
    emit('text', { text: onlyTaskId ? '[Agent Sam] No runnable plan task found for resume.' : '[Agent Sam] No pending plan tasks.' });
    return;
  }

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const task of tasks || []) {
    emit('task_start', {
      task_id: task.id,
      title: task.title,
      description: task.description,
      order_index: task.order_index,
      handler_type: task.handler_type,
      total_tasks: tasks.length,
    });

    await env.DB
      .prepare(`UPDATE agentsam_plan_tasks SET status='in_progress', started_at=unixepoch() WHERE id=?`)
      .bind(task.id)
      .run();

    let output = null;
    let ok = true;

    try {
      if (task.handler_type === 'agent' || !task.handler_type) {
        const result = await dispatchComplete(env, {
          modelKey: 'auto',
          taskType: task.category === 'db' ? 'sql_d1_generation' : 'code',
          mode: 'agent',
          systemPrompt: TASK_AGENT_SYSTEM,
          messages: [
            {
              role: 'user',
              content: `Task: ${task.title}\n\n${task.description || ''}`,
            },
          ],
          options: { reasoningEffort: 'medium', verbosity: 'low' },
        });
        output = result?.text || result?.output_text || '';
      } else if (task.handler_type === 'terminal') {
        const cmd = shellCommandForTerminalTask(task).trim();

        const stubCtx =
          ctx && typeof ctx.waitUntil === 'function'
            ? ctx
            : { waitUntil: (fn) => void Promise.resolve(typeof fn === 'function' ? fn() : fn).catch(() => {}) };

        const authz = await authorizePlanTerminalExecution(env, ctx, {
          task,
          planId,
          userId,
          workspaceId,
          tenantId,
          sessionId: sessionId || null,
        });

        if (authz.allowed && !cmd) {
          output =
            '[terminal] NOT EXECUTED: put the shell command in the task description when handler_key is an agentsam_commands id (cmd:… prefix).';
          await env.DB
            .prepare(
              `UPDATE agentsam_plan_tasks
        SET status='skipped', completed_at=unixepoch(), output_summary=?
        WHERE id=?`,
            )
            .bind(String(output || '').slice(0, 4000), task.id)
            .run();
          skipped++;
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'skipped',
            output: String(output || '').slice(0, 2000),
            order_index: task.order_index,
          });
          continue;
        }

        if (!authz.allowed) {
          if (cmd && (authz.reason === 'no_gate' || authz.reason === 'command_not_found')) {
            const prop = await ensurePlanTerminalApprovalProposal(env, {
              task,
              planId,
              userId,
              workspaceId,
              tenantId,
              sessionId,
              cmd,
              emit,
            });
            if (prop?.ok) {
              skipped++;
              emit('task_complete', {
                task_id: task.id,
                title: task.title,
                status: 'skipped',
                output:
                  '[terminal] Approval required — click **Allow** on the card, then confirm execution resumes for this task.',
                order_index: task.order_index,
              });
              continue;
            }
          }

          if (authz.reason === 'pending_approval' && authz.approval_id) {
            const pre = authz.command_preview || cmd.slice(0, 2000);
            const cr = authz.command_run_id != null ? String(authz.command_run_id).trim() : '';
            if (cr) {
              await env.DB
                .prepare(
                  `UPDATE agentsam_plan_tasks SET command_run_id = COALESCE(?, command_run_id), output_summary = ?, status = 'skipped', completed_at = unixepoch() WHERE id = ?`,
                )
                .bind(
                  cr,
                  '[terminal] Catalog command awaiting explicit approval — click Allow, then use resume for this task.',
                  task.id,
                )
                .run();
            } else {
              await env.DB
                .prepare(
                  `UPDATE agentsam_plan_tasks SET output_summary = ?, status = 'skipped', completed_at = unixepoch() WHERE id = ?`,
                )
                .bind(authz.userMessage || '[terminal] Awaiting approval.', task.id)
                .run();
            }
            skipped++;
            emit('approval_required', {
              task_id: task.id,
              command_run_id: cr || undefined,
              approval_id: authz.approval_id,
              title: String(task.title || 'Terminal'),
              command_preview: pre,
              risk_level: 'medium',
              action_summary: 'Approve catalog-linked terminal command before execution.',
              plan_id: planId,
            });
            emit('task_complete', {
              task_id: task.id,
              title: task.title,
              status: 'skipped',
              output: authz.userMessage || '[terminal] Awaiting approval.',
              order_index: task.order_index,
            });
            continue;
          }

          output = authz.userMessage || `[terminal] NOT EXECUTED (${authz.reason || 'denied'})`;
          await env.DB
            .prepare(
              `UPDATE agentsam_plan_tasks
        SET status='skipped', completed_at=unixepoch(), output_summary=?
        WHERE id=?`,
            )
            .bind(String(output || '').slice(0, 4000), task.id)
            .run();
          skipped++;
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'skipped',
            output: String(output || '').slice(0, 2000),
            order_index: task.order_index,
          });
          continue;
        }

        const t0 = Date.now();
        const http = await runTerminalCommandViaHttpExec(env, cmd);
        const durationMs = Math.max(0, Date.now() - t0);

        const commandRunIdForTelemetry =
          (authz.command_run_id != null && String(authz.command_run_id).trim()) ||
          (task.command_run_id != null && String(task.command_run_id).trim()) ||
          '';
        if (commandRunIdForTelemetry) {
          try {
            if (http?.ok) {
              await env.DB
                .prepare(
                  `UPDATE agentsam_command_run SET approval_status = 'approved', success = 1, exit_code = 0, duration_ms = ?, output_text = ?, error_message = NULL WHERE id = ?`,
                )
                .bind(durationMs, String(http.text || '').slice(0, 50000), commandRunIdForTelemetry)
                .run();
            } else {
              await env.DB
                .prepare(
                  `UPDATE agentsam_command_run SET approval_status = 'approved', success = 0, exit_code = COALESCE(exit_code, 1), duration_ms = ?, error_message = ? WHERE id = ?`,
                )
                .bind(durationMs, 'terminal_http_exec_failed', commandRunIdForTelemetry)
                .run();
            }
          } catch (_) {}
        }

        if (authz.chain_id) {
          await completeCommand(env, stubCtx, {
            chainId: authz.chain_id,
            commandId: authz.commandId,
            success: !!http?.ok,
            durationMs,
            outputSummary: http?.ok ? String(http.text || '').slice(0, 8000) : null,
            errorMessage: http?.ok ? null : 'terminal_http_exec_failed',
            taskType: authz.task_type || 'tool_use',
            modelKey: authz.modelKey,
            provider: authz.provider,
          });
        }

        if (!http?.ok) {
          failed++;
          output = `[terminal] Authorized but execution failed (HTTP exec / PTY bridge). Command: ${cmd.slice(0, 400)}`;
          await env.DB
            .prepare(
              `UPDATE agentsam_plan_tasks
        SET status='blocked', error_trace=?, completed_at=unixepoch()
        WHERE id=?`,
            )
            .bind(String(output || '').slice(0, 2000), task.id)
            .run();
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'failed',
            error: String(output || '').slice(0, 2000),
            order_index: task.order_index,
          });
          continue;
        }

        output = `[terminal] executed (${authz.via || 'authorized'})\n${String(http.text || '').slice(0, 3500)}`;
        await env.DB
          .prepare(
            `UPDATE agentsam_plan_tasks
        SET status='done', completed_at=unixepoch(), output_summary=?
        WHERE id=?`,
          )
          .bind(String(output || '').slice(0, 4000), task.id)
          .run();
        completed++;
        emit('task_complete', {
          task_id: task.id,
          title: task.title,
          status: 'done',
          output: String(output || '').slice(0, 2000),
          order_index: task.order_index,
        });
        continue;
      } else if (task.handler_type === 'db_query') {
        const result = await dispatchComplete(env, {
          modelKey: 'gpt-5.4-nano',
          systemPrompt:
            'You are a D1 database assistant. Describe what query you would run and what it returns.',
          messages: [{ role: 'user', content: task.description || task.title }],
          options: { reasoningEffort: 'low', verbosity: 'low' },
        });
        output = result?.text || result?.output_text || '';
      } else if (task.handler_type === 'mcp_tool') {
        const wk = String(task.handler_key || '').trim();
        if (wk) {
          const { executeWorkflowGraph } = await import('./workflow-executor.js');
          const wResult = await executeWorkflowGraph(env, {
            workflowKey: wk,
            input: { message: task.description || task.title },
            tenantId: tenantId || 'tenant_sam_primeaux',
            workspaceId: workspaceId || '',
            userId,
            triggerType: 'agent',
          });
          output = wResult?.ok
            ? JSON.stringify(
                wResult.step_results?.length
                  ? wResult.step_results[wResult.step_results.length - 1]?.output ?? wResult.step_results
                  : {},
              )
            : `Workflow failed: ${wResult?.error ?? wResult?.kill_reason ?? 'unknown'}`;
          ok = !!wResult?.ok;
        } else {
          const result = await dispatchComplete(env, {
            modelKey: 'gpt-5.4-nano',
            systemPrompt: TASK_AGENT_SYSTEM,
            messages: [{ role: 'user', content: task.description || task.title }],
            options: { reasoningEffort: 'low' },
          });
          output = result?.text || result?.output_text || '';
        }
      } else {
        const result = await dispatchComplete(env, {
          modelKey: 'gpt-5.4-nano',
          systemPrompt: TASK_AGENT_SYSTEM,
          messages: [{ role: 'user', content: task.description || task.title }],
          options: { reasoningEffort: 'low' },
        });
        output = result?.text || result?.output_text || '';
      }

      if (ok) {
        await env.DB
          .prepare(
            `UPDATE agentsam_plan_tasks
        SET status='done', completed_at=unixepoch(), output_summary=?
        WHERE id=?`,
          )
          .bind(String(output || '').slice(0, 4000), task.id)
          .run();

        completed++;
        emit('task_complete', {
          task_id: task.id,
          title: task.title,
          status: 'done',
          output: String(output || '').slice(0, 2000),
          order_index: task.order_index,
        });
      } else {
        failed++;
        const errMsg = String(output || 'workflow failed').slice(0, 2000);
        await env.DB
          .prepare(
            `UPDATE agentsam_plan_tasks
        SET status='blocked', error_trace=?, completed_at=unixepoch()
        WHERE id=?`,
          )
          .bind(errMsg, task.id)
          .run();

        emit('task_complete', {
          task_id: task.id,
          title: task.title,
          status: 'failed',
          error: errMsg,
          order_index: task.order_index,
        });
      }
    } catch (e) {
      failed++;
      const errMsg = e?.message ?? String(e);
      await env.DB
        .prepare(
          `UPDATE agentsam_plan_tasks
        SET status='blocked', error_trace=?, completed_at=unixepoch()
        WHERE id=?`,
        )
        .bind(errMsg.slice(0, 2000), task.id)
        .run();

      emit('task_complete', {
        task_id: task.id,
        title: task.title,
        status: 'failed',
        error: errMsg,
        order_index: task.order_index,
      });
    }
  }

  if (!skipPlanAggregate) {
    await env.DB
      .prepare(
        `UPDATE agentsam_plans
    SET tasks_done=?,
        tasks_blocked = COALESCE(tasks_blocked, 0) + ?,
        status=CASE WHEN ?=0 THEN 'complete' ELSE 'active' END,
        updated_at=unixepoch()
    WHERE id=?`,
      )
      .bind(completed, skipped, failed, planId)
      .run();

    emit('plan_complete', {
      plan_id: planId,
      tasks_completed: completed,
      tasks_failed: failed,
      tasks_skipped: skipped,
      status: failed === 0 ? 'complete' : 'partial',
    });
  } else {
    emit('plan_task_resume_complete', {
      plan_id: planId,
      task_id: onlyTaskId,
      tasks_completed: completed,
      tasks_failed: failed,
      tasks_skipped: skipped,
      status: failed === 0 ? 'ok' : 'partial',
    });
  }
}
