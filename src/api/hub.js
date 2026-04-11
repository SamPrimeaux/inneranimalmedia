/**
 * API Layer: Mission Control Hub
 * Roadmap tracking, task management, system stats, and terminal history.
 * Tables: roadmap_steps, roadmap_plans, tasks, project_time_entries,
 *         terminal_history, spend_ledger, agent_telemetry
 */
import { jsonResponse }                    from '../core/responses.js';
import { getAuthUser, tenantIdFromEnv }    from '../core/auth.js';

export async function handleHubApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

  try {
    const sub = path.slice('/api/hub/'.length);

    // ── /api/hub/roadmap ──────────────────────────────────────────────────
    if (sub === 'roadmap' && method === 'GET') {
      const planId = url.searchParams.get('plan_id') || 'plan_agent_sam_endgame';
      const { results } = await env.DB.prepare(
        `SELECT id, title, status, order_index, description, links_json
         FROM roadmap_steps WHERE plan_id = ? ORDER BY order_index ASC`
      ).bind(planId).all();
      return jsonResponse({ steps: results || [] });
    }

    // ── /api/hub/roadmap/plans ────────────────────────────────────────────
    if (sub === 'roadmap/plans' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT id, name, description, status FROM roadmap_plans ORDER BY name ASC`
      ).all().catch(() => ({ results: [] }));
      return jsonResponse({ plans: results || [] });
    }

    // ── /api/hub/tasks ────────────────────────────────────────────────────
    if (sub === 'tasks') {
      if (method === 'GET') {
        const tenantId = tenantIdFromEnv(env);
        const query = tenantId
          ? env.DB.prepare(
              `SELECT id, title, status, priority, project_id, due_date, created_at
               FROM tasks
               WHERE status NOT IN ('done','cancelled')
                 AND (tenant_id = ? OR tenant_id IS NULL)
               ORDER BY
                 CASE priority WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 WHEN 'high' THEN 3 WHEN 'medium' THEN 4 ELSE 5 END,
                 created_at DESC
               LIMIT 20`
            ).bind(tenantId)
          : env.DB.prepare(
              `SELECT id, title, status, priority, project_id, due_date, created_at
               FROM tasks WHERE status NOT IN ('done','cancelled')
               ORDER BY created_at DESC LIMIT 20`
            );
        const { results } = await query.all();
        return jsonResponse({ tasks: results || [] });
      }

      if (method === 'POST') {
        const body  = await request.json().catch(() => ({}));
        const title = (body.title || '').trim();
        if (!title) return jsonResponse({ error: 'title required' }, 400);
        const tenantId = tenantIdFromEnv(env);
        const id       = 'task_' + Date.now();
        await env.DB.prepare(
          `INSERT INTO tasks (id, title, status, priority, project_id, tenant_id, created_at)
           VALUES (?, ?, 'todo', ?, ?, ?, unixepoch())`
        ).bind(id, title, body.priority || 'medium', body.project_id || null, tenantId || null).run();
        return jsonResponse({ ok: true, id });
      }
    }

    // ── /api/hub/tasks/:id ────────────────────────────────────────────────
    const taskMatch = sub.match(/^tasks\/([^/]+)$/);
    if (taskMatch && method === 'PATCH') {
      const body   = await request.json().catch(() => ({}));
      const taskId = taskMatch[1];
      const { status, priority, title } = body;

      const sets = [], vals = [];
      if (status)   { sets.push('status = ?');   vals.push(status); }
      if (priority) { sets.push('priority = ?'); vals.push(priority); }
      if (title)    { sets.push('title = ?');    vals.push(title); }
      if (!sets.length) return jsonResponse({ error: 'no fields to update' }, 400);

      vals.push(taskId);
      await env.DB.prepare(
        `UPDATE tasks SET ${sets.join(', ')}, updated_at = unixepoch() WHERE id = ?`
      ).bind(...vals).run();
      return jsonResponse({ ok: true });
    }

    // ── /api/hub/stats ────────────────────────────────────────────────────
    if (sub === 'stats' && method === 'GET') {
      const safe = p => p.catch(() => null);
      const [hoursRow, spendRow, callsRow, activeProjects, recentDeploy] = await Promise.all([
        safe(env.DB.prepare(`SELECT COALESCE(SUM(duration_seconds),0)/3600.0 AS h FROM project_time_entries WHERE date(start_time) = date('now')`).first()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(amount_usd),0) AS s FROM spend_ledger WHERE occurred_at >= unixepoch('now','-7 days')`).first()),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM agent_telemetry WHERE created_at >= unixepoch('now','start of day')`).first()),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM agentsam_project_context WHERE status='active'`).first()),
        safe(env.DB.prepare(`SELECT version, status, timestamp FROM deployments ORDER BY timestamp DESC LIMIT 1`).first()),
      ]);

      return jsonResponse({
        hours_today:       Number(hoursRow?.h   || 0),
        spend_this_week:   Number(spendRow?.s   || 0),
        agent_calls_today: Number(callsRow?.c   || 0),
        active_projects:   Number(activeProjects?.c || 0),
        last_deploy:       recentDeploy || null,
      });
    }

    // ── /api/hub/terminal ─────────────────────────────────────────────────
    if (sub === 'terminal' && method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
      const { results } = await env.DB.prepare(
        `SELECT content AS command, created_at FROM terminal_history
         ORDER BY created_at DESC LIMIT ?`
      ).bind(limit).all().catch(() => ({ results: [] }));
      return jsonResponse({ rows: results || [] });
    }

    return jsonResponse({ error: 'Hub route not found', path }, 404);

  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}
