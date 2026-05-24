/**
 * Single dispatcher for agentsam_commands rows. Called by executeCommand after approval.
 */
import { dispatchByToolCode } from './dispatch-by-tool-code.js';
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
      const mergedArgs = { command: rendered, args, ...(typeof args === 'object' && args ? args : {}) };
      return dispatchByToolCode(env, toolKey, mergedArgs, runContext);
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
      const { executeAgentsamScript } = await import('./execute-agentsam-script.js');
      return executeAgentsamScript(
        env,
        {
          scriptSlug,
          workspaceId: runContext?.workspaceId ?? runContext?.workspace_id,
          tenantId: runContext?.tenantId ?? runContext?.tenant_id,
          userId: runContext?.userId ?? runContext?.user_id,
          triggerSource: 'agent_sam',
        },
        { command: rendered, args, ...(typeof args === 'object' && args ? args : {}) },
        runContext,
      );
    }
    default:
      throw new Error(`[dispatch] unknown router_type=${routerType} for command ${slug}`);
  }
}
