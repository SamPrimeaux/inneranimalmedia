/**
 * Agent Sam subagent profile tools + workflow runner.
 *
 * Subagent CRUD uses D1 `agentsam_subagent_profile` (singular table name).
 * Workflow execution uses agentsam_workflows / executeWorkflowGraph.
 */
import {
  createSubagentProfile,
  getSubagentProfileBySlug,
  listSubagentProfilesForScope,
} from '../../core/subagent-profile-write.js';

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
    const { workspaceId, tenantId, userId } = toolSessionContext(params);
    if (!userId) return { error: 'Agent Sam Error: user_id required' };
    try {
      const rows = await listSubagentProfilesForScope(env, {
        userId,
        workspaceId,
        tenantId,
        includePlatformGlobal: true,
      });
      return {
        success: true,
        table: 'agentsam_subagent_profile',
        subagents: rows,
        count: rows.length,
      };
    } catch (e) {
      return { error: `Agent Sam Error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },

  async agentsam_get_agent(params, env) {
    if (!env?.DB) return { error: 'Agent Sam Error: DB not configured' };
    const { workspaceId, tenantId, userId } = toolSessionContext(params);
    if (!userId) return { error: 'Agent Sam Error: user_id required' };
    const slug = String(
      params.slug || params.agent_slug || params.profile_slug || params.agent_id || '',
    ).trim();
    const runId = String(params.id || params.run_id || '').trim();
    if (!slug && runId) {
      return handlers.agentsam_get_workflow_run({ ...params, id: runId }, env);
    }
    if (!slug) return { error: 'Agent Sam Error: slug required' };
    try {
      const row = await getSubagentProfileBySlug(env, { userId, workspaceId, tenantId }, slug);
      if (!row && runId) {
        return handlers.agentsam_get_workflow_run({ ...params, id: runId }, env);
      }
      if (!row) {
        return {
          error: 'Agent Sam Error: subagent not found',
          slug,
          table: 'agentsam_subagent_profile',
        };
      }
      return { success: true, table: 'agentsam_subagent_profile', subagent: row };
    } catch (e) {
      return { error: `Agent Sam Error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },

  async agentsam_create_subagent(params, env) {
    if (!env?.DB) return { error: 'Agent Sam Error: DB not configured' };
    const { workspaceId, tenantId, userId } = toolSessionContext(params);
    if (!userId) return { error: 'Agent Sam Error: user_id required' };
    if (!workspaceId) return { error: 'Agent Sam Error: workspace_id required' };
    try {
      const out = await createSubagentProfile(
        env,
        { userId, workspaceId, tenantId },
        {
          display_name: params.display_name ?? params.displayName ?? params.name,
          slug: params.slug,
          description: params.description,
          instructions_markdown: params.instructions_markdown ?? params.instructions,
          allowed_tool_globs: params.allowed_tool_globs ?? params.tools,
          default_model_id: params.default_model_id ?? params.model_id,
          personality_tone: params.personality_tone,
          sandbox_mode: params.sandbox_mode,
          model_reasoning_effort: params.model_reasoning_effort,
          access_mode: params.access_mode,
          agent_type: params.agent_type,
          run_in_background: params.run_in_background,
          sort_order: params.sort_order,
        },
      );
      if (!out.ok) {
        return {
          error: `Agent Sam Error: ${out.error || 'create_failed'}`,
          table: 'agentsam_subagent_profile',
          slug: out.slug || null,
        };
      }
      return {
        success: true,
        table: 'agentsam_subagent_profile',
        id: out.id,
        slug: out.slug,
        subagent: out.subagent,
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

  /** Poll workflow run status (legacy id param). Subagent profiles: use agentsam_get_agent + slug. */
  async agentsam_get_workflow_run(params, env) {
    const id = String(params.id || params.run_id || '').trim();
    if (!id) return { error: 'Agent Sam Error: id or run_id required' };
    if (!env?.DB) return { error: 'Agent Sam Error: DB not configured' };
    try {
      const row = await env.DB.prepare(`SELECT * FROM agentsam_workflow_runs WHERE id = ? LIMIT 1`)
        .bind(id)
        .first();
      if (!row) return { error: 'Agent Sam Error: workflow run not found', id };
      return { run: row };
    } catch (e) {
      return { error: `Agent Sam Error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
