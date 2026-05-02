/**
 * API Service: Mission Control Hub
 * Handles roadmap tracking, task management, system stats, and terminal history.
 * Deconstructed from legacy worker.js.
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';

/**
 * Main dispatcher for Hub-related API routes (/api/hub/*).
 */
export async function handleHubApi(request, url, env, ctx) {
    const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    try {
        const hubPath = pathLower.slice('/api/hub/'.length);

        if (hubPath === 'roadmap') return handleHubRoadmap(url, env);
        if (hubPath === 'tasks') {
            if (method === 'POST') return handleHubTaskCreate(request, env);
            return handleHubTasks(env);
        }
        if (hubPath === 'stats') return handleHubStats(env);
        if (hubPath === 'terminal') return handleHubTerminal(env);

        const taskIdMatch = hubPath.match(/^tasks\/([^/]+)$/);
        if (taskIdMatch && method === 'PATCH') return handleHubTaskUpdate(request, env, taskIdMatch[1]);

        return jsonResponse({ error: 'Hub route not found' }, 404);
    } catch (e) {
        return jsonResponse({ error: e.message }, 500);
    }
}

// --- Implementation Handlers ---

async function handleHubRoadmap(url, env) {
    const planId = url.searchParams.get('plan_id') || 'plan_iam_dashboard_v1';
    const { results } = await env.DB.prepare(
        `SELECT id, title, status, order_index, description FROM roadmap_steps WHERE plan_id = ? ORDER BY order_index`
    ).bind(planId).all();
    return jsonResponse({ steps: results || [] });
}

async function handleHubTasks(env) {
    const { results } = await env.DB.prepare(`
        SELECT id, title, status, priority, project_id, due_date
        FROM tasks
        WHERE status NOT IN ('done','cancelled') AND (tenant_id = 'system' OR tenant_id IS NULL)
        ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 WHEN 'high' THEN 3 WHEN 'medium' THEN 4 ELSE 5 END, created_at DESC
        LIMIT 20
    `).all();
    return jsonResponse({ tasks: results || [] });
}

async function handleHubStats(env) {
    const [hoursRow, spendRow, callsRow] = await Promise.all([
        env.DB.prepare(`SELECT COALESCE(SUM(duration_seconds),0)/3600.0 as h FROM project_time_entries WHERE date(start_time) = date('now')`).first(),
        env.DB.prepare(`SELECT COALESCE(SUM(amount_usd), 0) as s FROM spend_ledger WHERE occurred_at >= unixepoch('now', '-7 days')`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM agent_telemetry WHERE created_at >= unixepoch('now', 'start of day')`).first(),
    ]);
    return jsonResponse({
        hours_today: Number(hoursRow?.h || 0),
        spend_this_week: Number(spendRow?.s || 0),
        agent_calls_today: Number(callsRow?.c || 0)
    });
}

async function handleHubTerminal(env) {
    const { results } = await env.DB.prepare(
        `SELECT content as command, created_at FROM terminal_history ORDER BY created_at DESC LIMIT 8`
    ).all();
    return jsonResponse({ rows: results || [] });
}

async function handleHubTaskCreate(request, env) {
    const body = await request.json().catch(() => ({}));
    const title = (body.title || '').trim();
    if (!title) return jsonResponse({ error: 'title required' }, 400);
    
    const id = 'task_' + Date.now();
    await env.DB.prepare(
        `INSERT INTO tasks (id, title, status, priority, project_id, tenant_id, created_at) 
         VALUES (?, ?, 'todo', ?, ?, 'system', unixepoch())`
    ).bind(id, title, body.priority || 'medium', body.project_id || null).run();
    return jsonResponse({ ok: true, id });
}

async function handleHubTaskUpdate(request, env, taskId) {
    const body = await request.json().catch(() => ({}));
    const status = body.status;
    if (!status) return jsonResponse({ error: 'status required' }, 400);
    await env.DB.prepare(`UPDATE tasks SET status = ? WHERE id = ?`).bind(status, taskId).run();
    return jsonResponse({ ok: true });
}
