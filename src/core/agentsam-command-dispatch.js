/**
 * Single dispatcher for agentsam_commands rows. Called by executeCommand after approval.
 */
import { runBuiltinTool } from '../tools/ai-dispatch.js';
import { executeWorkflowGraph } from './workflow-executor.js';

/**
 * @param {any} env
 * @param {Record<string, unknown>} cmdRow
 * @param {Record<string, unknown>} [args]
 * @param {Record<string, unknown>} [runContext]
 */
export async function dispatchAgentsamCommand(env, cmdRow, args = {}, runContext = {}) {
  const routerType = String(cmdRow?.router_type || '').trim();
  const toolKey = cmdRow?.tool_key != null ? String(cmdRow.tool_key).trim() : '';
  const workflowKey = cmdRow?.workflow_key != null ? String(cmdRow.workflow_key).trim() : '';
  const slug = cmdRow?.slug != null ? String(cmdRow.slug).trim() : '';
  const mappedCommand =
    cmdRow?.mapped_command != null ? String(cmdRow.mapped_command) : null;

  const rendered = mappedCommand
    ? mappedCommand.replace(/\{([A-Z_]+)\}/g, (_, k) => {
        const upper = String(k);
        const lower = upper.toLowerCase();
        if (args[upper] != null) return String(args[upper]);
        if (args[lower] != null) return String(args[lower]);
        return `{${k}}`;
      })
    : null;

  switch (routerType) {
    case 'tool': {
      if (!toolKey) {
        throw new Error(`[dispatch] command ${slug} has router_type=tool but no tool_key`);
      }
      return runBuiltinTool(
        env,
        toolKey,
        { command: rendered, args, ...(typeof args === 'object' && args ? args : {}) },
        runContext,
      );
    }
    case 'workflow': {
      if (!workflowKey) {
        throw new Error(`[dispatch] command ${slug} has router_type=workflow but no workflow_key`);
      }
      const wf = await env.DB.prepare(
        `SELECT workflow_key FROM agentsam_workflows
         WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
      )
        .bind(workflowKey)
        .first();
      if (!wf?.workflow_key) {
        throw new Error(`[dispatch] workflow_key=${workflowKey} not found in agentsam_workflows`);
      }
      return executeWorkflowGraph(env, {
        workflowKey,
        input: { ...args, trigger_type: 'agent' },
        tenantId: runContext?.tenantId ?? runContext?.tenant_id ?? env?.TENANT_ID ?? null,
        workspaceId: runContext?.workspaceId ?? runContext?.workspace_id ?? null,
        userId: runContext?.userId ?? runContext?.user_id ?? null,
        triggerType: 'agent',
      });
    }
    case 'script': {
      const scriptSlug = toolKey || slug;
      const script = await env.DB.prepare(
        `SELECT slug, body, runner FROM agentsam_scripts
         WHERE slug = ? AND COALESCE(is_active, 1) = 1 AND COALESCE(safe_to_run, 0) = 1
         LIMIT 1`,
      )
        .bind(scriptSlug)
        .first();
      if (!script?.body) {
        throw new Error(`[dispatch] script ${scriptSlug} not found or not safe`);
      }
      return runBuiltinTool(
        env,
        'terminal_run',
        { command: String(script.body), runner: script.runner ?? 'shell' },
        runContext,
      );
    }
    default:
      throw new Error(`[dispatch] unknown router_type=${routerType} for command ${slug}`);
  }
}
