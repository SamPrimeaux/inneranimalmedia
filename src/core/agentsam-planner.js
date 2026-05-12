/**
 * Agent Sam Planner
 * Decomposes a user goal into agentsam_plans + agentsam_plan_tasks rows.
 * Uses gpt-5.4-mini via dispatchComplete (openai_responses platform).
 */

import { dispatchComplete } from './provider.js';

function planId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return 'plan_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
function taskId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return 'task_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

const PLANNER_SYSTEM = `You are Agent Sam's planning engine.
The user has given you a goal. Decompose it into 2-8 concrete, executable tasks.
Return ONLY valid JSON, no markdown, no explanation:
{
  "plan_title": "short title for the plan",
  "tasks": [
    {
      "title": "short task title",
      "description": "what to do and why",
      "category": "backend|frontend|db|infra|ux|research|other",
      "priority": "P0|P1|P2|P3",
      "handler_type": "agent|terminal|db_query|mcp_tool",
      "workflow_key": null,
      "estimated_minutes": 5
    }
  ]
}
Rules:
- handler_type = "agent" for LLM generation tasks
- handler_type = "terminal" for shell/wrangler commands
- handler_type = "db_query" for D1 reads/writes
- workflow_key: only set if an existing agentsam_workflows.workflow_key matches exactly
- 2 tasks minimum, 8 maximum
- P0 = critical, P1 = high, P2 = medium, P3 = low`;

export async function createPlan(
  env,
  { goal, userId, workspaceId, tenantId, sessionId = null, workflowRunId = null },
) {
  void userId;
  if (!env.DB) throw new Error('DB not available');

  let parsed;
  try {
    const result = await dispatchComplete(env, {
      modelKey: 'gpt-5.4-mini',
      systemPrompt: PLANNER_SYSTEM,
      messages: [{ role: 'user', content: String(goal).slice(0, 4000) }],
      options: { reasoningEffort: 'medium', verbosity: 'low' },
    });
    const text = result?.text || result?.output_text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    parsed = {
      plan_title: String(goal).slice(0, 80),
      tasks: [
        {
          title: 'Execute goal',
          description: String(goal),
          category: 'other',
          priority: 'P1',
          handler_type: 'agent',
          workflow_key: null,
          estimated_minutes: 10,
        },
      ],
    };
  }

  const pid = planId();
  const today = new Date().toISOString().slice(0, 10);
  let tasks = Array.isArray(parsed.tasks) ? parsed.tasks.slice(0, 8) : [];
  if (!tasks.length) {
    tasks = [
      {
        title: 'Execute goal',
        description: String(goal),
        category: 'other',
        priority: 'P1',
        handler_type: 'agent',
        workflow_key: null,
        estimated_minutes: 10,
      },
    ];
  }

  await env.DB
    .prepare(
      `INSERT INTO agentsam_plans
      (id, tenant_id, workspace_id, session_id, title, status, plan_type,
       plan_date, default_model, tasks_total, tasks_done, workflow_run_id,
       created_at, updated_at)
    VALUES (?,?,?,?,?,'active','feature',?,?,?,0,?,unixepoch(),unixepoch())`,
    )
    .bind(
      pid,
      tenantId || 'tenant_sam_primeaux',
      workspaceId || '',
      sessionId,
      parsed.plan_title || String(goal).slice(0, 80),
      today,
      'gpt-5.4-mini',
      tasks.length,
      workflowRunId,
    )
    .run();

  const insertedTasks = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const tid = taskId();
    await env.DB
      .prepare(
        `INSERT INTO agentsam_plan_tasks
        (id, plan_id, tenant_id, workspace_id, order_index, title, description,
         priority, category, status, handler_type, handler_key,
         estimated_minutes, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,'todo',?,?,?,unixepoch())`,
      )
      .bind(
        tid,
        pid,
        tenantId || 'tenant_sam_primeaux',
        workspaceId || '',
        i,
        String(t.title || '').slice(0, 200),
        String(t.description || '').slice(0, 2000),
        t.priority || 'P1',
        t.category || 'other',
        t.handler_type || 'agent',
        t.workflow_key != null && String(t.workflow_key).trim() !== '' ? String(t.workflow_key).trim() : null,
        t.estimated_minutes || null,
      )
      .run();
    insertedTasks.push({ id: tid, ...t, order_index: i });
  }

  return { plan_id: pid, plan_title: parsed.plan_title || String(goal).slice(0, 80), tasks: insertedTasks };
}
