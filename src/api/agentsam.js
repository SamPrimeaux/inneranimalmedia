/**
 * API Service: Agent Sam Capability Layer
 * Handles registry lookups for managed agents, skills, and invocation auditing.
 * Interfaces with agentsam_ai, agentsam_skill, and agentsam_skill_invocation.
 */
import { handlers as db } from '../tools/db.js';
import { getAuthUser, jsonResponse } from '../core/auth.js';
import { resolveIamActorContext } from '../core/identity.js';
import {
  resolveEffectiveWorkspaceId,
  resolveActiveBootstrap,
  WORKSPACE_CONTEXT_MISSING,
} from '../core/bootstrap.js';
import { executeWorkflowAndStream } from '../core/workflow-executor.js';

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

    // GET /api/agentsam/workflows — list active workflows with node/edge counts
    if (path === '/api/agentsam/workflows' && method === 'GET') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      try {
        const { results } = await env.DB.prepare(`
          SELECT
            w.id, w.workflow_key, w.display_name, w.description,
            w.risk_level, w.requires_approval, w.is_active,
            COUNT(DISTINCT n.id) AS node_count,
            COUNT(DISTINCT e.id) AS edge_count
          FROM agentsam_workflows w
          LEFT JOIN agentsam_workflow_nodes n
            ON n.workflow_id = w.id AND COALESCE(n.is_active, 1) = 1
          LEFT JOIN agentsam_workflow_edges e
            ON e.workflow_id = w.id
          WHERE w.is_active = 1
          GROUP BY w.id
          ORDER BY w.display_name ASC
        `).all();
        return jsonResponse(results || []);
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    // GET /api/agentsam/workflows/:id — single workflow with nodes + edges
    const wfSingleMatch = path.match(/^\/api\/agentsam\/workflows\/([^/]+)$/);
    if (wfSingleMatch && method === 'GET') {
      if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
      const wfId = wfSingleMatch[1];
      try {
        const workflow = await env.DB.prepare(
          `SELECT * FROM agentsam_workflows WHERE id = ? AND is_active = 1 LIMIT 1`
        ).bind(wfId).first();
        if (!workflow) return jsonResponse({ error: 'workflow not found' }, 404);
        const nodes = (await env.DB.prepare(
          `SELECT * FROM agentsam_workflow_nodes WHERE workflow_id = ? AND COALESCE(is_active,1)=1 ORDER BY sort_order ASC`
        ).bind(wfId).all()).results || [];
        const edges = (await env.DB.prepare(
          `SELECT * FROM agentsam_workflow_edges WHERE workflow_id = ? ORDER BY priority ASC`
        ).bind(wfId).all()).results || [];
        return jsonResponse({ workflow, nodes, edges });
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
