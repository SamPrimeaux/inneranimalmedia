/**
 * API Service: Agent Sam Capability Layer
 * Handles registry lookups for managed agents, skills, and invocation auditing.
 * Interfaces with agentsam_ai, agentsam_skill, and agentsam_skill_invocation.
 */
import { handlers as db } from '../tools/db.js';
import { getAuthUser, jsonResponse, fetchAuthUserTenantId, fallbackSystemTenantId } from '../core/auth.js';
import { resolveIamActorContext } from '../core/identity.js';
import {
  resolveEffectiveWorkspaceId,
  resolveActiveBootstrap,
  WORKSPACE_CONTEXT_MISSING,
} from '../core/bootstrap.js';
import { executeWorkflowAndStream } from '../core/workflow-executor.js';
import {
  loadWorkflowGraphBundle,
  requireWorkflowGraphContext,
  saveWorkflowCanvasLayout,
  createWorkflowNode,
  updateWorkflowNode,
  deleteWorkflowNode,
  createWorkflowEdge,
  deleteWorkflowEdge,
  patchWorkflowRegistry,
} from '../core/agentsam-workflow-graph.js';
import { insertAgentsamPlanRow, insertAgentsamPlanTaskRows } from '../core/agentsam-plan-insert.js';
import {
  createPlanExcalidrawArtifact,
  createPlanMarkdownArtifact,
} from '../core/agentsam-plan-excalidraw-artifact.js';

/**
 * HTTP entry for /api/agentsam/* (registry, prompts, etc.).
 */
export async function handleAgentSamApi(request, url, env, ctx) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  const out = await handleAgentSamRegistryRequest(request, env, ctx, authUser);
  if (out) return out;
  return jsonResponse({ error: 'API route not found' }, 404);
}

/**
 * Main switch-board for Agent Sam Registry requests.
 */
export async function handleAgentSamRegistryRequest(request, env, ctx, authUser) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    const planTasksMatch = path.match(/^\/api\/agentsam\/plans\/([^/]+)\/tasks$/);
    if (planTasksMatch && method === 'GET') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const planId = decodeURIComponent(planTasksMatch[1] || '').trim();
      if (!planId) return jsonResponse({ error: 'plan_id required' }, 400);

      let tenantId =
        authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
          ? String(authUser.tenant_id).trim()
          : null;
      if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
      if (!tenantId) tenantId = fallbackSystemTenantId(env);

      const plan = await env.DB.prepare(
        `SELECT id, tenant_id FROM agentsam_plans WHERE id = ? LIMIT 1`,
      )
        .bind(planId)
        .first()
        .catch(() => null);
      if (!plan?.id) return jsonResponse({ error: 'plan not found' }, 404);
      if (String(plan.tenant_id || '') !== tenantId) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const { results } = await env.DB.prepare(
        `SELECT id, plan_id, order_index, title, description, priority, category, status,
                blocked_reason, notes, estimated_minutes, actual_minutes, completed_at
         FROM agentsam_plan_tasks
         WHERE plan_id = ?
         ORDER BY order_index ASC, id ASC`,
      )
        .bind(planId)
        .all()
        .catch(() => ({ results: [] }));

      return jsonResponse({ ok: true, plan_id: planId, tasks: results || [] });
    }

    // POST /api/agentsam/plans — create plan + optional plan_tasks (D1; pragma-safe columns)
    if (path === '/api/agentsam/plans' && method === 'POST') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const body = await request.json().catch(() => ({}));
      const title = String(body.title ?? '').trim();
      if (!title) return jsonResponse({ error: 'title required' }, 400);

      const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
      const workspaceId =
        body.workspace_id != null && String(body.workspace_id).trim() !== ''
          ? String(body.workspace_id).trim()
          : wsRes?.workspaceId ?? null;
      if (!workspaceId) {
        return jsonResponse(
          { error: wsRes?.error || 'workspace_id required', code: wsRes?.error || null },
          400,
        );
      }

      let tenantId =
        body.tenant_id != null && String(body.tenant_id).trim() !== ''
          ? String(body.tenant_id).trim()
          : authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
            ? String(authUser.tenant_id).trim()
            : null;
      if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
      if (!tenantId) tenantId = fallbackSystemTenantId(env);

      const planIdIn = body.id != null && String(body.id).trim() !== '' ? String(body.id).trim() : undefined;
      const { id: planId } = await insertAgentsamPlanRow(
        env,
        {
        id: planIdIn,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        session_id: body.session_id != null ? String(body.session_id) : null,
        agent_id: body.agent_id != null ? String(body.agent_id) : null,
        title,
        plan_type: body.plan_type,
        plan_date: body.plan_date != null ? String(body.plan_date) : undefined,
        status: body.status,
        morning_brief:
          body.morning_brief != null
            ? typeof body.morning_brief === 'string'
              ? body.morning_brief
              : JSON.stringify(body.morning_brief)
            : undefined,
        session_notes:
          body.session_notes != null
            ? typeof body.session_notes === 'string'
              ? body.session_notes
              : JSON.stringify(body.session_notes)
            : undefined,
        default_model: body.default_model != null ? String(body.default_model) : null,
        workflow_id: body.workflow_id != null ? String(body.workflow_id) : null,
        workflow_run_id: body.workflow_run_id != null ? String(body.workflow_run_id) : null,
        tasks_total: Array.isArray(body.tasks) ? body.tasks.length : body.tasks_total,
        linked_todo_ids:
          body.linked_todo_ids != null
            ? typeof body.linked_todo_ids === 'string'
              ? body.linked_todo_ids
              : JSON.stringify(body.linked_todo_ids)
            : undefined,
        linked_project_keys:
          body.linked_project_keys != null
            ? typeof body.linked_project_keys === 'string'
              ? body.linked_project_keys
              : JSON.stringify(body.linked_project_keys)
            : undefined,
        },
        ctx,
      );

      let taskIds = [];
      if (Array.isArray(body.tasks) && body.tasks.length) {
        const { ids } = await insertAgentsamPlanTaskRows(
          env,
          {
            planId,
            tenantId,
            workspaceId,
            tasks: body.tasks,
          },
          ctx,
        );
        taskIds = ids;
      }

      let visual_map = null;
      let visual_map_error = null;
      const taskCount = taskIds.length;
      let wantVisual = false;
      if (body.create_visual_map === true) wantVisual = true;
      else if (body.create_visual_map === false) wantVisual = false;
      else wantVisual = taskCount >= 2;
      if (wantVisual && env.DASHBOARD && authUser?.id) {
        try {
          visual_map = await createPlanExcalidrawArtifact(env, {
            tenantId,
            workspaceId,
            userId: String(authUser.id),
            planId,
          });
        } catch (e) {
          visual_map_error = e?.message != null ? String(e.message) : String(e);
        }
      } else if (wantVisual && !env.DASHBOARD) {
        visual_map_error = 'DASHBOARD bucket not configured';
      } else if (wantVisual && !authUser?.id) {
        visual_map_error = 'user_id missing for artifact';
      }

      let plan_markdown = null;
      let plan_markdown_error = null;
      let wantMd = false;
      if (body.create_plan_markdown === true) wantMd = true;
      else if (body.create_plan_markdown === false) wantMd = false;
      else wantMd = true;
      if (wantMd && env.DASHBOARD && authUser?.id) {
        try {
          plan_markdown = await createPlanMarkdownArtifact(env, {
            tenantId,
            workspaceId,
            userId: String(authUser.id),
            planId,
          });
        } catch (e) {
          plan_markdown_error = e?.message != null ? String(e.message) : String(e);
        }
      } else if (wantMd && !env.DASHBOARD) {
        plan_markdown_error = 'DASHBOARD bucket not configured';
      } else if (wantMd && !authUser?.id) {
        plan_markdown_error = 'user_id missing for artifact';
      }

      return jsonResponse(
        {
          ok: true,
          plan_id: planId,
          task_ids: taskIds,
          tasks_total: taskIds.length,
          tasks_done: 0,
          tasks_blocked: 0,
          visual_map: visual_map
            ? {
                artifact_id: visual_map.artifact_id,
                r2_key: visual_map.r2_key,
                public_url: visual_map.public_url,
              }
            : null,
          ...(visual_map_error ? { visual_map_error } : {}),
          plan_markdown: plan_markdown
            ? {
                artifact_id: plan_markdown.artifact_id,
                r2_key: plan_markdown.r2_key,
                public_url: plan_markdown.public_url,
              }
            : null,
          ...(plan_markdown_error ? { plan_markdown_error } : {}),
        },
        201,
      );
    }

    // Bootstrap config for authenticated user (Agent Sam UI)
    if (path === '/api/agentsam/config' && method === 'GET') {
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({});
      try {
        const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
        if (wsRes.error === WORKSPACE_CONTEXT_MISSING || !wsRes.workspaceId) {
          return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
        }
        const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
        const tid =
          actorCtx?.tenantId ||
          (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
            ? String(authUser.tenant_id).trim()
            : null);
        const row = await resolveActiveBootstrap(env, {
          userId: authUser.id,
          personUuid: actorCtx?.personUuid ?? authUser.person_uuid ?? null,
          tenantId: tid,
          workspaceId: wsRes.workspaceId,
        });
        return jsonResponse(row || {});
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    // 1. Model Registry: GET /api/agentsam/ai/:role
    if (path.startsWith('/api/agentsam/ai') && method === 'GET') {
        const parts = path.split('/');
        const role = parts[parts.length - 1]; // e.g. orchestrator, worker
        const agent = await getAgentMetadata(env, role);
        return jsonResponse(agent);
    }

    // 2. Skill Registry: GET /api/agentsam/skills
    if (path === '/api/agentsam/skills' && method === 'GET') {
        const skills = await getAgentSkills(env);
        return jsonResponse(skills);
    }

    // 3. Invocation Audit: GET /api/agentsam/invocations
    if (path === '/api/agentsam/invocations' && method === 'GET') {
        const invocations = await getInvocations(env);
        return jsonResponse(invocations);
    }

    // D1 agent_chat_plan trace (latest or ?run_id=)
    if (path === '/api/agentsam/agent-chat-plan-trace' && method === 'GET') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
      if (wsRes.error === WORKSPACE_CONTEXT_MISSING || !wsRes.workspaceId) {
        return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
      }
      const wsId = String(wsRes.workspaceId).trim();
      const runIdParam = url.searchParams.get('run_id')?.trim();
      let run = null;
      if (runIdParam) {
        run = await env.DB
          .prepare(
            `SELECT * FROM agentsam_workflow_runs WHERE id = ? AND workspace_id = ? LIMIT 1`,
          )
          .bind(runIdParam, wsId)
          .first()
          .catch(() => null);
      } else {
        run = await env.DB
          .prepare(
            `SELECT * FROM agentsam_workflow_runs
             WHERE workspace_id = ?
               AND (workflow_key = 'agent_chat_plan' OR workflow_id = 'wf_agent_chat_plan')
             ORDER BY created_at DESC
             LIMIT 1`,
          )
          .bind(wsId)
          .first()
          .catch(() => null);
      }
      if (!run?.id) return jsonResponse({ error: 'no_run' }, 404);
      const rid = String(run.id);
      const plan = await env.DB
        .prepare(`SELECT * FROM agentsam_plans WHERE workflow_run_id = ? ORDER BY created_at DESC LIMIT 1`)
        .bind(rid)
        .first()
        .catch(() => null);
      const tasks = plan?.id
        ? (
            await env.DB
              .prepare(`SELECT * FROM agentsam_plan_tasks WHERE plan_id = ? ORDER BY order_index`)
              .bind(plan.id)
              .all()
          ).results || []
        : [];
      const steps =
        (
          await env.DB
            .prepare(`SELECT * FROM agentsam_execution_steps WHERE execution_id = ? ORDER BY created_at, node_key`)
            .bind(rid)
            .all()
        ).results || [];
      const approvals =
        (
          await env.DB
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
      for (const t of tasks) {
        if (t.command_run_id) crIds.add(String(t.command_run_id));
      }
      let command_runs = [];
      if (crIds.size) {
        const placeholders = [...crIds].map(() => '?').join(',');
        command_runs =
          (
            await env.DB
              .prepare(`SELECT * FROM agentsam_command_run WHERE id IN (${placeholders})`)
              .bind(...[...crIds])
              .all()
          ).results || [];
      }

      const tasksWithSteps = tasks.filter((t) => t.execution_step_id).length;
      const tasksWithWrun = tasks.filter((t) => t.workflow_run_id).length;
      const wrunMatch = tasks.filter((t) => String(t.workflow_run_id || '') === rid).length;
      const stepExecMatch = tasks.filter((t) => {
        const sid = t.execution_step_id;
        if (!sid) return false;
        const s = steps.find((x) => x.id === sid);
        return s && String(s.execution_id || '') === rid;
      }).length;

      return jsonResponse({
        workflow_run: run,
        plan,
        tasks,
        steps,
        approvals,
        command_runs,
        checks: {
          plan_has_workflow_run_id: !!plan?.workflow_run_id,
          tasks_total: tasks.length,
          tasks_with_steps: tasksWithSteps,
          tasks_with_wrun: tasksWithWrun,
          tasks_wrun_equals_run: wrunMatch,
          tasks_execution_step_matches_run: stepExecMatch,
        },
      });
    }

    // 4. Prompt Registry: GET /api/agentsam/prompts/:group
    if (path.startsWith('/api/agentsam/prompts') && method === 'GET') {
        const parts = path.split('/');
        const group = parts[parts.length - 1]; // e.g. coding
        
        if (group === 'prompts') {
            // General list (agentsam_prompt_versions replaces ai_prompts_library)
            const sql =
              'SELECT id, prompt_key AS category, 100 AS weight, is_active FROM agentsam_prompt_versions ORDER BY prompt_key ASC';
            const res = await db.d1_query({ sql }, env);
            return jsonResponse(res.results || []);
        }

        // Specific weighted selection test
        const prompt = await getActivePromptByWeight(env, group);
        return jsonResponse(prompt);
    }

    // ── Workflow APIs ────────────────────────────────────────────────────────

    // GET /api/agentsam/mcp-workflows — tenant-scoped MCP catalog rows
    if (path === '/api/agentsam/mcp-workflows' && method === 'GET') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      try {
        const { tenantId, workspaceId } = await workflowScope();
        const tid = tenantId != null ? String(tenantId) : '';
        let sql = `SELECT id, workflow_key, display_name, description, category, subagent_slug,
          graph_mode, tools_json, steps_json, run_count, success_count, status,
          total_cost_usd, updated_at
          FROM agentsam_mcp_workflows WHERE COALESCE(is_active, 1) = 1`;
        const binds = [];
        if (tid) {
          sql += ` AND (tenant_id = ? OR tenant_id IS NULL)`;
          binds.push(tid);
        }
        sql += ` ORDER BY updated_at DESC LIMIT 200`;
        const stmt = env.DB.prepare(sql);
        const { results } = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
        return jsonResponse({ workflows: results || [], workspace_id: workspaceId });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    // GET /api/agentsam/workflows — list active workflows with node/edge counts
    if (path === '/api/agentsam/workflows' && method === 'GET') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      try {
        const { results } = await env.DB.prepare(`
          SELECT
            w.id, w.workflow_key, w.display_name, w.description,
            w.risk_level, w.requires_approval, w.is_active,
            COUNT(DISTINCT n.id) AS node_count,
            COUNT(DISTINCT e.id) AS edge_count,
            COALESCE(rs.run_count, 0) AS run_count,
            COALESCE(rs.success_count, 0) AS success_count,
            COALESCE(rs.fail_count, 0) AS fail_count,
            rs.avg_cost_usd
          FROM agentsam_workflows w
          LEFT JOIN agentsam_workflow_nodes n
            ON n.workflow_id = w.id AND COALESCE(n.is_active, 1) = 1
          LEFT JOIN agentsam_workflow_edges e
            ON e.workflow_id = w.id
          LEFT JOIN (
            SELECT workflow_key,
              COUNT(*) AS run_count,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS success_count,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS fail_count,
              AVG(COALESCE(cost_usd, 0)) AS avg_cost_usd
            FROM agentsam_workflow_runs
            GROUP BY workflow_key
          ) rs ON rs.workflow_key = w.workflow_key
          WHERE w.is_active = 1
          GROUP BY w.id
          ORDER BY w.display_name ASC
        `).all();
        return jsonResponse(results || []);
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    // POST /api/agentsam/workflows/:id/run — start a workflow run, stream SSE
    const wfRunMatch = path.match(/^\/api\/agentsam\/workflows\/([^/]+)\/run$/);
    if (wfRunMatch && method === 'POST') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const wfId = wfRunMatch[1];
      try {
        const workflow = await env.DB.prepare(
          `SELECT * FROM agentsam_workflows WHERE id = ? AND is_active = 1 LIMIT 1`
        ).bind(wfId).first();
        if (!workflow) return jsonResponse({ error: 'workflow not found' }, 404);

        const body = await request.json().catch(() => ({}));
        const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
        const workspaceId = wsRes?.workspaceId ?? body.workspace_id ?? null;

        const { readable, writable } = new TransformStream();
        const controller = {
          _enc: new TextEncoder(),
          _writer: writable.getWriter(),
          enqueue(chunk) { void this._writer.write(chunk); },
          close() { void this._writer.close().catch(() => {}); },
        };

        // Fire the graph executor asynchronously so we can return the stream immediately
        void (async () => {
          try {
            await executeWorkflowAndStream(
              env,
              workflow.workflow_key,
              body.input ?? body.message ?? {},
              authUser,
              workspaceId,
              controller,
            );
          } catch (e) {
            try {
              const enc = new TextEncoder();
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'workflow_error', message: e?.message ?? String(e) })}\n\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
              controller.close();
            } catch (_) {}
          }
        })();

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    // GET /api/agentsam/workflow-runs/:id — run status + steps + approvals
    const wfRunStatusMatch = path.match(/^\/api\/agentsam\/workflow-runs\/([^/]+)$/);
    if (wfRunStatusMatch && method === 'GET') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const runId = wfRunStatusMatch[1];
      try {
        const run = await env.DB.prepare(
          `SELECT * FROM agentsam_workflow_runs WHERE id = ? LIMIT 1`
        ).bind(runId).first();
        if (!run) return jsonResponse({ error: 'run not found' }, 404);

        const steps = (await env.DB.prepare(
          `SELECT id, execution_id, node_key, node_type, status, edge_taken, approval_id, input_json, output_json, error_json, latency_ms, created_at
           FROM agentsam_execution_steps WHERE execution_id = ? ORDER BY created_at ASC`
        ).bind(runId).all()).results || [];

        const approvals = (await env.DB.prepare(
          `SELECT id, status, workflow_run_id, execution_step_id, risk_level, tool_name, action_summary, created_at
           FROM agentsam_approval_queue WHERE workflow_run_id = ? ORDER BY created_at DESC`
        ).bind(runId).all()).results || [];

        const plan = await env.DB.prepare(
          `SELECT * FROM agentsam_plans WHERE workflow_run_id = ? ORDER BY created_at DESC LIMIT 1`
        ).bind(runId).first().catch(() => null);

        return jsonResponse({ run, steps, approvals, plan: plan || null });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    // POST /api/agentsam/workflow-runs/:id/approve — approve/deny a pending approval gate
    const wfApproveMatch = path.match(/^\/api\/agentsam\/workflow-runs\/([^/]+)\/approve$/);
    if (wfApproveMatch && method === 'POST') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const runId = wfApproveMatch[1];
      try {
        const body = await request.json().catch(() => ({}));
        const decision = String(body.decision || 'approved').toLowerCase();
        const approvalId = body.approval_id ? String(body.approval_id) : null;

        if (!['approved', 'denied', 'rejected'].includes(decision)) {
          return jsonResponse({ error: 'decision must be approved or denied' }, 400);
        }
        const dbStatus = decision === 'approved' ? 'approved' : 'denied';

        let updated;
        if (approvalId) {
          updated = await env.DB.prepare(
            `UPDATE agentsam_approval_queue SET status = ?, approved_by = ?, decided_at = unixepoch()
             WHERE id = ? AND status = 'pending'`
          ).bind(dbStatus, authUser?.id ?? null, approvalId).run();
        } else {
          updated = await env.DB.prepare(
            `UPDATE agentsam_approval_queue SET status = ?, approved_by = ?, decided_at = unixepoch()
             WHERE workflow_run_id = ? AND status = 'pending'`
          ).bind(dbStatus, authUser?.id ?? null, runId).run();
        }

        const changes = updated?.meta?.changes ?? updated?.changes ?? 0;

        if (decision === 'approved') {
          await env.DB.prepare(
            `UPDATE agentsam_workflow_runs SET status = 'running', updated_at = datetime('now')
             WHERE id = ? AND status = 'awaiting_approval'`
          ).bind(runId).run().catch(() => null);
        } else {
          await env.DB.prepare(
            `UPDATE agentsam_workflow_runs SET status = 'failed', kill_reason = 'approval_rejected', updated_at = datetime('now')
             WHERE id = ?`
          ).bind(runId).run().catch(() => null);
        }

        return jsonResponse({ ok: true, decision, run_id: runId, rows_updated: changes });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    // ── Workflow graph CRUD (registry id in path; DAG rows use dag_workflow_id) ──
    async function workflowScope() {
      const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
      const tenantId =
        authUser?.tenant_id ??
        (await fetchAuthUserTenantId(env, authUser?.id).catch(() => null)) ??
        (await fallbackSystemTenantId(env).catch(() => null));
      return {
        tenantId: tenantId != null ? String(tenantId) : null,
        workspaceId: wsRes?.workspaceId ?? null,
      };
    }

    const wfLayoutMatch = path.match(/^\/api\/agentsam\/workflows\/([^/]+)\/layout$/);
    if (wfLayoutMatch && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const registryId = decodeURIComponent(wfLayoutMatch[1]);
      try {
        const body = await request.json().catch(() => ({}));
        const positions =
          body.positions && typeof body.positions === 'object' ? body.positions : body;
        const { tenantId, workspaceId } = await workflowScope();
        const out = await saveWorkflowCanvasLayout(
          env.DB,
          registryId,
          positions,
          tenantId,
          workspaceId,
        );
        if (out.error) return jsonResponse({ error: out.error }, out.status);
        return jsonResponse(out);
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    const wfNodeKeyMatch = path.match(/^\/api\/agentsam\/workflows\/([^/]+)\/nodes\/([^/]+)$/);
    if (wfNodeKeyMatch && (method === 'PATCH' || method === 'DELETE')) {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const registryId = decodeURIComponent(wfNodeKeyMatch[1]);
      const nodeKey = decodeURIComponent(wfNodeKeyMatch[2]);
      try {
        const { tenantId, workspaceId } = await workflowScope();
        const ctx = await requireWorkflowGraphContext(env.DB, registryId, tenantId, workspaceId);
        if (ctx.error) return jsonResponse({ error: ctx.error }, ctx.status);
        const { dag_workflow_id: dagId } = ctx.bundle;
        if (method === 'DELETE') {
          const out = await deleteWorkflowNode(env.DB, { dagWorkflowId: dagId, nodeKey });
          if (out.error) return jsonResponse({ error: out.error }, out.status);
          return jsonResponse(out);
        }
        const body = await request.json().catch(() => ({}));
        const out = await updateWorkflowNode(env.DB, {
          dagWorkflowId: dagId,
          nodeKey,
          body,
        });
        if (out.error) return jsonResponse({ error: out.error }, out.status);
        return jsonResponse(out);
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    const wfNodesPostMatch = path.match(/^\/api\/agentsam\/workflows\/([^/]+)\/nodes$/);
    if (wfNodesPostMatch && method === 'POST') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const registryId = decodeURIComponent(wfNodesPostMatch[1]);
      try {
        const { tenantId, workspaceId } = await workflowScope();
        const ctx = await requireWorkflowGraphContext(env.DB, registryId, tenantId, workspaceId);
        if (ctx.error) return jsonResponse({ error: ctx.error }, ctx.status);
        const body = await request.json().catch(() => ({}));
        const out = await createWorkflowNode(env.DB, {
          registryId,
          dagWorkflowId: ctx.bundle.dag_workflow_id,
          body,
        });
        if (out.error) return jsonResponse({ error: out.error }, out.status);
        return jsonResponse(out, 201);
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    const wfEdgeIdMatch = path.match(/^\/api\/agentsam\/workflows\/([^/]+)\/edges\/([^/]+)$/);
    if (wfEdgeIdMatch && method === 'DELETE') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const registryId = decodeURIComponent(wfEdgeIdMatch[1]);
      const edgeId = decodeURIComponent(wfEdgeIdMatch[2]);
      try {
        const { tenantId, workspaceId } = await workflowScope();
        const ctx = await requireWorkflowGraphContext(env.DB, registryId, tenantId, workspaceId);
        if (ctx.error) return jsonResponse({ error: ctx.error }, ctx.status);
        const out = await deleteWorkflowEdge(env.DB, {
          dagWorkflowId: ctx.bundle.dag_workflow_id,
          edgeId,
        });
        if (out.error) return jsonResponse({ error: out.error }, out.status);
        return jsonResponse(out);
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    const wfEdgesPostMatch = path.match(/^\/api\/agentsam\/workflows\/([^/]+)\/edges$/);
    if (wfEdgesPostMatch && method === 'POST') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const registryId = decodeURIComponent(wfEdgesPostMatch[1]);
      try {
        const { tenantId, workspaceId } = await workflowScope();
        const ctx = await requireWorkflowGraphContext(env.DB, registryId, tenantId, workspaceId);
        if (ctx.error) return jsonResponse({ error: ctx.error }, ctx.status);
        const body = await request.json().catch(() => ({}));
        const out = await createWorkflowEdge(env.DB, {
          dagWorkflowId: ctx.bundle.dag_workflow_id,
          body,
        });
        if (out.error) return jsonResponse({ error: out.error }, out.status);
        return jsonResponse(out, 201);
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    const wfSingleMatch = path.match(/^\/api\/agentsam\/workflows\/([^/]+)$/);
    if (wfSingleMatch && method === 'GET') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const registryId = decodeURIComponent(wfSingleMatch[1]);
      try {
        const { tenantId, workspaceId } = await workflowScope();
        const bundle = await loadWorkflowGraphBundle(env.DB, registryId, tenantId, workspaceId);
        if (!bundle) return jsonResponse({ error: 'workflow not found' }, 404);
        return jsonResponse({
          workflow: bundle.workflow,
          mcp_workflow: bundle.mcp_workflow,
          registry_workflow_id: bundle.registry_workflow_id,
          dag_workflow_id: bundle.dag_workflow_id,
          nodes: bundle.nodes,
          edges: bundle.edges,
          canvas_layout: bundle.canvas_layout,
          runs_summary: bundle.runs_summary,
        });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    if (wfSingleMatch && method === 'PATCH') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const registryId = decodeURIComponent(wfSingleMatch[1]);
      try {
        const body = await request.json().catch(() => ({}));
        const out = await patchWorkflowRegistry(env.DB, registryId, body);
        if (out.error) return jsonResponse({ error: out.error }, out.status);
        return jsonResponse(out);
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    return null;
}

/**
 * Performs a surgical lookup of a managed agent by its role or ID.
 */
export async function getAgentMetadata(env, roleOrId) {
    const sql = `
        SELECT * FROM agentsam_ai 
        WHERE (id = ? OR role_name = ?) AND status = 'active'
        LIMIT 1
    `;
    const res = await db.d1_query({ sql, params: [roleOrId, roleOrId] }, env);
    
    if (res.error) return { error: res.error };
    if (!res.results?.length) return { error: `Agent not found: ${roleOrId}` };

    const agent = res.results[0];
    
    // Parse JSON policies
    agent.model_policy = JSON.parse(agent.model_policy_json || '{}');
    agent.cost_policy = JSON.parse(agent.cost_policy_json || '{}');
    agent.memory_policy = JSON.parse(agent.memory_policy_json || '{}');
    agent.tool_permissions = JSON.parse(agent.tool_permissions_json || '{}');

    return agent;
}

/**
 * Fetches all active managed skills for Agent Sam.
 */
export async function getAgentSkills(env) {
    const sql = "SELECT * FROM agentsam_skill WHERE is_active = 1 ORDER BY sort_order ASC";
    const res = await db.d1_query({ sql }, env);
    return res.results || [];
}

/**
 * Records a skill invocation for auditing and spent-ledger calibration.
 */
export async function logSkillInvocation(env, data) {
    const sql = `
        INSERT INTO agentsam_skill_invocation 
        (skill_id, conversation_id, trigger_method, input_summary, success, error_message, duration_ms, model_used, tokens_in, tokens_out, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    return await db.d1_write({
        sql,
        params: [
            data.skillId,
            data.conversationId,
            data.triggerMethod || 'auto',
            data.inputSummary,
            data.success ? 1 : 0,
            data.errorMessage || null,
            data.durationMs || 0,
            data.modelUsed,
            data.tokensIn || 0,
            data.tokensOut || 0,
            data.costUsd || 0
        ]
    }, env);
}

/**
 * A/B Testing Engine: Selects an active prompt from a group based on weights.
 */
export async function getActivePromptByWeight(env, groupKey) {
    const sql = `
        SELECT id, prompt_key, version,
               body AS prompt_template, prompt_key AS category,
               100 AS weight, body_tokens, is_active, notes
        FROM agentsam_prompt_versions 
        WHERE prompt_key = ? AND is_active = 1
    `;
    const res = await db.d1_query({ sql, params: [groupKey] }, env);
    const prompts = res.results || [];

    if (!prompts.length) return null;
    if (prompts.length === 1) return prompts[0];

    // Weighted Random Selection
    const totalWeight = prompts.reduce((sum, p) => sum + (p.weight || 100), 0);
    let random = Math.random() * totalWeight;
    
    for (const prompt of prompts) {
        if (random < (prompt.weight || 100)) return prompt;
        random -= (prompt.weight || 100);
    }

    return prompts[0]; // Fallback
}

/**
 * Retrieves a specific prompt by its ID with parsed metadata.
 */
export async function getPromptMetadata(env, promptId) {
    const sql = 'SELECT * FROM agentsam_prompt_versions WHERE id = ?';
    const res = await db.d1_query({ sql, params: [promptId] }, env);
    
    if (!res.results?.length) return null;
    const prompt = res.results[0];
    prompt.prompt_template = prompt.body;
    prompt.category = prompt.prompt_key;
    try {
      prompt.metadata = JSON.parse(prompt.notes || '{}');
    } catch (_) {
      prompt.metadata = {};
    }
    return prompt;
}

/**
 * Retrieval for the spent ledger and audit trail.
 */
async function getInvocations(env) {
    const sql = "SELECT * FROM agentsam_skill_invocation ORDER BY invoked_at DESC LIMIT 100";
    const res = await db.d1_query({ sql }, env);
    return res.results || [];
}
