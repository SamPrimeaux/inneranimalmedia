/**
 * Agent Sam workflow tools (list / run / status).
 *
 * These were previously wired to GET/POST https://IAM_ORIGIN/api/agent/{list,run,status},
 * but those routes are not implemented in handleAgentApi — and Worker self-fetch has no
 * session cookies, so they always failed with upstream_request_failed.
 *
 * Implementation: D1 agentsam_workflows + agentsam_workflow_runs + executeWorkflowGraph.
 */

/**
 * @param {Record<string, unknown>} params
 */
function toolSessionContext(params) {
  const s = params?.session && typeof params.session === 'object' ? params.session : {};
  const workspaceId =
    (params.workspace_id != null && String(params.workspace_id).trim()) ||
    (s.workspace_id != null && String(s.workspace_id).trim()) ||
    (s.workspaceId != null && String(s.workspaceId).trim()) ||
    '';
  const tenantId =
    (params.tenant_id != null && String(params.tenant_id).trim()) ||
    (s.tenant_id != null && String(s.tenant_id).trim()) ||
    '';
  const userId =
    (params.user_id != null && String(params.user_id).trim()) ||
    (s.user_id != null && String(s.user_id).trim()) ||
    null;
  return { workspaceId, tenantId, userId };
}

export const handlers = {
  async agentsam_list_agents(params, env) {
    if (!env?.DB) return { error: 'Agent Sam Error: DB not configured' };
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, workflow_key, display_name, description, workflow_type, trigger_type,
                default_mode, default_task_type, risk_level, requires_approval, is_active
         FROM agentsam_workflows
         WHERE COALESCE(is_active, 1) = 1
         ORDER BY COALESCE(display_name, workflow_key)
         LIMIT 200`,
      ).all();
      const rows = results || [];
      return {
        workflows: rows,
        count: rows.length,
        note: 'Active rows from agentsam_workflows (use workflow_key with agentsam_run_agent).',
      };
    } catch (e) {
      return { error: `Agent Sam Error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },

  async agentsam_run_agent(params, env) {
    const workflowKey = String(
      params.workflow_key || params.workflowKey || params.agent_id || params.agent_key || '',
    ).trim();
    if (!workflowKey) {
      return { error: 'Agent Sam Error: workflow_key (or agent_id) required' };
    }
    const { workspaceId, tenantId, userId } = toolSessionContext(params);
    if (!workspaceId) {
      return { error: 'Agent Sam Error: workspace context required (workspace_id on tool params)' };
    }
    if (!tenantId) {
      return { error: 'Agent Sam Error: tenant context required (tenant_id on tool params)' };
    }
    if (!env?.DB) return { error: 'Agent Sam Error: DB not configured' };
    try {
      const { executeWorkflowGraph } = await import('../../core/workflow-executor.js');
      let input = {};
      if (params.input && typeof params.input === 'object') input = { ...params.input };
      else if (params.prompt != null && String(params.prompt).trim()) {
        input = { message: String(params.prompt).trim() };
      }
      return await executeWorkflowGraph(env, {
        workflowKey,
        input,
        tenantId,
        workspaceId,
        userId,
        userEmail: params.user_email != null ? String(params.user_email) : null,
        triggerType: params.trigger_type != null ? String(params.trigger_type) : 'agent',
      });
    } catch (e) {
      return { error: `Agent Sam Error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },

  async agentsam_get_agent(params, env) {
    const id = String(params.id || params.run_id || '').trim();
    if (!id) return { error: 'Agent Sam Error: id or run_id required' };
    if (!env?.DB) return { error: 'Agent Sam Error: DB not configured' };
    try {
      const row = await env.DB
        .prepare(`SELECT * FROM agentsam_workflow_runs WHERE id = ? LIMIT 1`)
        .bind(id)
        .first();
      if (!row) return { error: 'Agent Sam Error: workflow run not found', id };
      return { run: row };
    } catch (e) {
      return { error: `Agent Sam Error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
