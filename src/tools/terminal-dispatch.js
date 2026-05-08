/**
 * Dispatcher: Terminal (terminal-dispatch)
 * Handles HTTP routes for terminal execution, auditing, and AI assistance.
 */

import { getAuthUser } from '../core/auth.js';
import { startAgentsamScriptRun, finalizeAgentsamScriptRun } from '../core/agentsam-script-runs.js';
import { runTerminalCommand } from '../core/terminal.js';

const SCRIPT_TRIGGER_SOURCES = new Set(['agent_sam', 'cursor', 'manual', 'github_push', 'scheduled', 'cicd']);

export async function handleTerminalRequest(path, method, body, env, request, ctx) {
  const pathLower = path.toLowerCase();

  // 1. POST /api/agent/terminal/run
  if (pathLower === '/api/agent/terminal/run' && method === 'POST') {
    const command = typeof body?.command === 'string' ? body.command.trim() : '';
    const session_id = body?.session_id ?? null;
    if (!command) return { error: 'No command', status: 400 };

    const agentsamScriptId =
      typeof body?.agentsam_script_id === 'string' ? body.agentsam_script_id.trim() : '';
    const workspaceForTelemetry =
      typeof body?.workspace_id === 'string' && body.workspace_id.trim()
        ? body.workspace_id.trim()
        : env.DEFAULT_WORKSPACE_ID != null && String(env.DEFAULT_WORKSPACE_ID).trim() !== ''
          ? String(env.DEFAULT_WORKSPACE_ID).trim()
          : '';
    const triggerSrcRaw = body?.trigger_source;
    const triggerSource =
      typeof triggerSrcRaw === 'string' && SCRIPT_TRIGGER_SOURCES.has(triggerSrcRaw.trim())
        ? triggerSrcRaw.trim()
        : 'agent_sam';

    let scriptRun = null;
    /** @type {{ scriptId: string, workspaceId: string, tenantId?: string | null, userId?: string | null } | null} */
    let hookCtx = null;
    const startedMs = Date.now();

    if (agentsamScriptId && workspaceForTelemetry && env.DB) {
      try {
        const authUser = await getAuthUser(request, env);
        const tenantId =
          authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
            ? String(authUser.tenant_id).trim()
            : null;
        scriptRun = await startAgentsamScriptRun(env.DB, {
          scriptId: agentsamScriptId,
          workspaceId: workspaceForTelemetry,
          triggeredBy: authUser?.email || authUser?.id || 'terminal',
          triggerSource,
          tenantId,
          userId: authUser?.id ?? null,
        });
        if (scriptRun?.id) {
          hookCtx = {
            scriptId: agentsamScriptId,
            workspaceId: workspaceForTelemetry,
            tenantId,
            userId: authUser?.id ?? null,
          };
        }
      } catch (e) {
        console.warn('[terminal] agentsam_script_runs start', e?.message ?? e);
      }
    }

    try {
      const { output, command: runCommand, exitCode } = await runTerminalCommand(
        env,
        request,
        command,
        session_id,
        ctx,
      );
      const execId = crypto.randomUUID();
      const wid =
        env.DEFAULT_WORKSPACE_ID != null && String(env.DEFAULT_WORKSPACE_ID).trim() !== ''
          ? String(env.DEFAULT_WORKSPACE_ID).trim()
          : null;
      const tenantId = env.DEFAULT_TENANT_ID ?? null;

      // Audit execution to D1
      if (wid) {
        try {
          await env.DB.prepare(
            `INSERT INTO agentsam_command_run 
         (id, tenant_id, workspace_id, session_id, command_name, command_text, output_text, status, started_at, completed_at)
         VALUES (?, ?, ?, ?, 'terminal_run', ?, ?, 'completed', unixepoch(), unixepoch())`
          ).bind(execId, tenantId, wid, session_id || null, runCommand, output).run();
        } catch (_) {}
      }

      if (scriptRun?.id && hookCtx) {
        try {
          const dur = Date.now() - startedMs;
          const ok = exitCode === 0 || exitCode === undefined || exitCode === null;
          await finalizeAgentsamScriptRun(
            env.DB,
            scriptRun.id,
            {
              status: ok ? 'passed' : 'failed',
              exitCode: exitCode ?? null,
              durationMs: dur,
              outputSummary: String(output ?? '').slice(0, 2000),
              errorMessage: ok ? null : `exit code ${exitCode}`,
            },
            hookCtx,
          );
        } catch (e) {
          console.warn('[terminal] agentsam_script_runs finalize', e?.message ?? e);
        }
      }

      return {
        output,
        command: runCommand,
        execution_id: execId,
        exit_code: exitCode,
        agentsam_script_run_id: scriptRun?.id ?? null,
      };
    } catch (e) {
      if (scriptRun?.id && hookCtx && env.DB) {
        try {
          await finalizeAgentsamScriptRun(
            env.DB,
            scriptRun.id,
            {
              status: 'failed',
              durationMs: Date.now() - startedMs,
              errorMessage: String(e?.message || e).slice(0, 2000),
            },
            hookCtx,
          );
        } catch (_) {}
      }
      throw e;
    }
  }

  // 2. POST /api/agent/terminal/complete
  if (pathLower === '/api/agent/terminal/complete' && method === 'POST') {
    const executionId = body?.execution_id;
    const status = body?.status;
    const now = Math.floor(Date.now() / 1000);

    if (executionId && (status === 'completed' || status === 'failed')) {
      try {
        await env.DB.prepare(
          "UPDATE agentsam_command_run SET status = ?, completed_at = ? WHERE id = ?"
        ).bind(status, now, executionId).run();
      } catch (_) {}
    }
    return { ok: true };
  }

  // 3. POST /api/terminal/assist
  if (pathLower === '/api/terminal/assist' && method === 'POST') {
    const { mode, command, context, output, exit_code } = body || {};
    // ... migration logic for assists handlers ...
    return { error: 'Terminal assist integration in progress', status: 501 };
  }

  return { error: 'Not Found', status: 404 };
}
