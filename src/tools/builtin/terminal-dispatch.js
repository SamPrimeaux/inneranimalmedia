/**
 * Agent Sam: Terminal Dispatcher
 * HTTP routes for terminal command execution and audit logging.
 * Belongs in: src/tools/builtin/terminal-dispatch.js
 */
import { runTerminalCommand } from '../core/terminal.js';
import { jsonResponse }       from '../core/responses.js';
import { tenantIdFromEnv, projectIdFromEnv } from '../core/auth.js';

/**
 * Dispatcher for terminal execution routes.
 *
 * POST /api/agent/terminal/run      — execute a shell command via iam-pty
 * POST /api/agent/terminal/complete — mark an execution record done/failed
 */
export async function handleTerminalRequest(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  // ── POST /api/agent/terminal/run ──────────────────────────────────────────
  if (path === '/api/agent/terminal/run' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) {}

    const command    = typeof body?.command === 'string' ? body.command.trim() : '';
    const session_id = body?.session_id ?? null;
    const workspace_id = body?.workspace_id || null;

    if (!command) return jsonResponse({ error: 'command is required' }, 400);

    let output = '';
    let runCommand = command;
    try {
      const result = await runTerminalCommand(env, request, command, session_id);
      output     = result.output;
      runCommand = result.command;
    } catch (e) {
      return jsonResponse({ error: 'Terminal execution failed', detail: e.message }, 500);
    }

    const execId   = 'exec_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const tenantId = tenantIdFromEnv(env);

    // Audit to D1 — workspace_id from request body, never hardcoded
    if (env.DB && tenantId && workspace_id) {
      await env.DB.prepare(
        `INSERT INTO agent_command_executions
         (id, tenant_id, workspace_id, session_id, command_name, command_text, output_text, status, started_at, completed_at)
         VALUES (?, ?, ?, ?, 'terminal_run', ?, ?, 'completed', unixepoch(), unixepoch())`
      ).bind(execId, tenantId, workspace_id, session_id || null, runCommand, output)
        .run()
        .catch(() => {});
    }

    return jsonResponse({ output, command: runCommand, execution_id: execId });
  }

  // ── POST /api/agent/terminal/complete ─────────────────────────────────────
  if (path === '/api/agent/terminal/complete' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { execution_id, status } = body;

    if (execution_id && (status === 'completed' || status === 'failed')) {
      const now = Math.floor(Date.now() / 1000);
      await env.DB?.prepare(
        `UPDATE agent_command_executions SET status = ?, completed_at = ? WHERE id = ?`
      ).bind(status, now, execution_id).run().catch(() => {});
    }

    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Terminal route not found', path }, 404);
}
