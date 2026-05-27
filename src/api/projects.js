/**
 * Projects API — /api/projects* (D1 canonical; no Supabase dependency).
 * Dispatched from src/api/finance.js after auth + DB checks.
 */
import { jsonResponse } from '../core/auth.js';

function safeJsonArray(text, fallback = []) {
  try {
    const v = JSON.parse(String(text || 'null'));
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function slugifyBase(name) {
  return String(name || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'project';
}

function priorityToLabel(n) {
  const p = Number(n) || 0;
  if (p >= 80) return 'P0';
  if (p >= 60) return 'P1';
  if (p >= 40) return 'P2';
  return 'P3';
}

function mapDbStatusToUi(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'blocked' || s === 'maintenance') return 'blocked';
  if (s === 'complete' || s === 'archived') return 'complete';
  if (s === 'review' || s === 'staging') return 'review';
  if (s === 'planning' || s === 'discovery') return 'planning';
  if (s === 'development' || s === 'active' || s === 'production') return 'active';
  return 'planning';
}

async function assertWorkspaceAllowed(db, workspaceId, tenantId, isSuperadmin) {
  if (isSuperadmin) return true;
  if (!workspaceId || !tenantId) return false;
  const row = await db
    .prepare(
      `SELECT id FROM workspaces WHERE id = ?
       AND (owner_tenant_id = ? OR default_tenant_id = ?)
       LIMIT 1`,
    )
    .bind(workspaceId, tenantId, tenantId)
    .first();
  return !!row;
}

function buildProjectWhereClause(workspaceId, tenantId) {
  if (!tenantId) return { sql: '1=0', binds: [] };
  if (!workspaceId) {
    return { sql: 'p.tenant_id = ?', binds: [tenantId] };
  }
  return {
    sql: `p.tenant_id = ?
      AND (p.workspace_id = ? OR p.workspace_id IS NULL OR p.workspace_id = '')`,
    binds: [tenantId, workspaceId],
  };
}

async function fetchPlanTasksForTenant(db, tenantId, workspaceId) {
  try {
    if (workspaceId) {
      const { results } = await db
        .prepare(
          `SELECT t.id, t.plan_id, t.status, t.title, t.priority, t.actual_minutes, t.completed_at,
                  t.created_at, pl.linked_project_keys, pl.workspace_id AS plan_workspace_id
           FROM agentsam_plan_tasks t
           INNER JOIN agentsam_plans pl ON pl.id = t.plan_id
           WHERE pl.tenant_id = ?
             AND (pl.workspace_id = ? OR pl.workspace_id IS NULL OR pl.workspace_id = '')`,
        )
        .bind(tenantId, workspaceId)
        .all();
      return results || [];
    }
    const { results } = await db
      .prepare(
        `SELECT t.id, t.plan_id, t.status, t.title, t.priority, t.actual_minutes, t.completed_at,
                t.created_at, pl.linked_project_keys, pl.workspace_id AS plan_workspace_id
         FROM agentsam_plan_tasks t
         INNER JOIN agentsam_plans pl ON pl.id = t.plan_id
         WHERE pl.tenant_id = ?`,
      )
      .bind(tenantId)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

function indexTasksByProject(planTaskRows) {
  /** @type {Record<string, { total: number, done: number, blocked: number, open: number }>} */
  const by = {};
  for (const row of planTaskRows) {
    const keys = safeJsonArray(row.linked_project_keys, []);
    const targets = keys.length ? keys : [null];
    for (const pid of targets) {
      if (!pid) continue;
      if (!by[pid]) by[pid] = { total: 0, done: 0, blocked: 0, open: 0 };
      const st = String(row.status || '').toLowerCase();
      by[pid].total += 1;
      if (st === 'done' || st === 'complete') by[pid].done += 1;
      else if (st === 'blocked') by[pid].blocked += 1;
      else by[pid].open += 1;
    }
  }
  return by;
}

async function fetchQualityByProject(db, projectIds) {
  if (!projectIds.length) return {};
  /** @type {Record<string, number>} */
  const out = {};
  try {
    const placeholders = projectIds.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT project_id, pass_rate FROM project_quality_summary WHERE project_id IN (${placeholders})`)
      .bind(...projectIds)
      .all();
    for (const r of results || []) {
      if (r.project_id != null) out[String(r.project_id)] = Number(r.pass_rate) || 0;
    }
  } catch {
    /* view missing or sqlite error */
  }
  return out;
}

async function fetchOpenIssuesByProject(db, projectIds) {
  if (!projectIds.length) return {};
  /** @type {Record<string, number>} */
  const out = {};
  try {
    const placeholders = projectIds.map(() => '?').join(',');
    const { results } = await db
      .prepare(
        `SELECT project_id, COUNT(*) as c FROM project_issues
         WHERE project_id IN (${placeholders}) AND LOWER(COALESCE(status,'')) IN ('open','in_progress','new')
         GROUP BY project_id`,
      )
      .bind(...projectIds)
      .all();
    for (const r of results || []) {
      if (r.project_id != null) out[String(r.project_id)] = Number(r.c) || 0;
    }
  } catch {
    /* table drift */
  }
  return out;
}

function computeHealth({ passRate, blockedCount, openIssueCount, estDate, status }) {
  if (passRate > 0) return Math.max(0, Math.min(100, Math.round(passRate)));
  let h = 100;
  h -= Math.min(40, (Number(blockedCount) || 0) * 8);
  h -= Math.min(30, (Number(openIssueCount) || 0) * 5);
  const st = String(status || '').toLowerCase();
  if (st === 'blocked' || st === 'maintenance') h -= 15;
  if (estDate) {
    const ts = typeof estDate === 'number' ? estDate * 1000 : Date.parse(String(estDate));
    if (!Number.isNaN(ts) && ts < Date.now() && st !== 'complete' && st !== 'archived') h -= 12;
  }
  return Math.max(0, Math.min(100, Math.round(h)));
}

async function handleOverview(request, url, env, authUser) {
  const tenantId = authUser.tenant_id ? String(authUser.tenant_id) : null;
  let workspaceId =
    url.searchParams.get('workspace_id') ||
    (authUser.active_workspace_id ? String(authUser.active_workspace_id) : null);

  if (workspaceId && !(await assertWorkspaceAllowed(env.DB, workspaceId, tenantId, !!authUser.is_superadmin))) {
    return jsonResponse({ ok: false, error: 'workspace_not_allowed' }, 403);
  }

  const { sql: whereSql, binds: whereBinds } = buildProjectWhereClause(workspaceId, tenantId);

  let projectRows = [];
  try {
    const { results } = await env.DB.prepare(`SELECT p.* FROM projects p WHERE ${whereSql} ORDER BY COALESCE(p.priority,0) DESC, p.name ASC`).bind(...whereBinds).all();
    projectRows = results || [];
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e.message || e) }, 500);
  }

  const projectIds = projectRows.map((r) => String(r.id));

  const [planTasks, qualityMap, issuesMap, goalsRows] = await Promise.all([
    tenantId ? fetchPlanTasksForTenant(env.DB, tenantId, workspaceId) : Promise.resolve([]),
    fetchQualityByProject(env.DB, projectIds),
    fetchOpenIssuesByProject(env.DB, projectIds),
    (async () => {
      if (!projectIds.length) return [];
      try {
        const ph = projectIds.map(() => '?').join(',');
        const { results } = await env.DB
          .prepare(
            `SELECT id, project_id, goal_name, status, current_progress_percent, priority, created_at
             FROM project_goals WHERE project_id IN (${ph}) ORDER BY priority DESC LIMIT 80`,
          )
          .bind(...projectIds)
          .all();
        return results || [];
      } catch {
        return [];
      }
    })(),
  ]);

  const taskByProject = indexTasksByProject(planTasks);

  let budgetAllocated = 0;
  try {
    if (workspaceId) {
      const row = await env.DB
        .prepare(`SELECT COALESCE(SUM(budget_usd),0) as v FROM workspace_projects WHERE workspace_id = ?`)
        .bind(workspaceId)
        .first();
      budgetAllocated = Number(row?.v ?? 0);
    }
  } catch {
    /* */
  }

  let budgetBurn = 0;
  try {
    if (workspaceId) {
      const row = await env.DB
        .prepare(
          `SELECT COALESCE(SUM(cost_usd),0) as v FROM agentsam_usage_events
           WHERE workspace_id = ? AND COALESCE(created_at_unix, created_at) >= unixepoch() - 30 * 86400`,
        )
        .bind(workspaceId)
        .first();
      budgetBurn = Number(row?.v ?? 0);
    } else if (tenantId) {
      const row = await env.DB
        .prepare(
          `SELECT COALESCE(SUM(cost_usd),0) as v FROM agentsam_usage_events
           WHERE tenant_id = ? AND COALESCE(created_at_unix, created_at) >= unixepoch() - 30 * 86400`,
        )
        .bind(tenantId)
        .first();
      budgetBurn = Number(row?.v ?? 0);
    }
  } catch {
    /* */
  }

  let thisWeekHours = 0;
  try {
    const weekStart = Math.floor(Date.now() / 1000) - 7 * 86400;
    if (tenantId) {
      const row = await env.DB
        .prepare(
          `SELECT COALESCE(SUM(t.actual_minutes),0) as m
           FROM agentsam_plan_tasks t
           INNER JOIN agentsam_plans pl ON pl.id = t.plan_id
           WHERE pl.tenant_id = ?
             AND t.completed_at IS NOT NULL AND t.completed_at >= ?
             AND ( ? IS NULL OR pl.workspace_id = ? OR pl.workspace_id IS NULL OR pl.workspace_id = '')`,
        )
        .bind(tenantId, weekStart, workspaceId, workspaceId)
        .first();
      thisWeekHours = Math.round((Number(row?.m ?? 0) / 60) * 10) / 10;
    }
  } catch {
    /* */
  }

  /** @type {Record<string, number>} */
  const statusCountsMap = {};
  let activeProjects = 0;
  let healthSum = 0;

  const projects = projectRows.map((p) => {
    const id = String(p.id);
    const t = taskByProject[id] || { total: 0, done: 0, blocked: 0, open: 0 };
    const progress = t.total ? Math.round((t.done / t.total) * 100) : 0;
    const passRate = qualityMap[id] || 0;
    const issueC = issuesMap[id] || 0;
    const uiStatus = mapDbStatusToUi(p.status);
    const health = computeHealth({
      passRate,
      blockedCount: t.blocked,
      openIssueCount: issueC,
      estDate: p.estimated_completion_date,
      status: p.status,
    });

    const stKey = String(p.status || 'unknown');
    statusCountsMap[stKey] = (statusCountsMap[stKey] || 0) + 1;

    if (uiStatus !== 'complete') activeProjects += 1;
    healthSum += health;

    const tags = safeJsonArray(p.tags_json, []);
    const budgetTotal = Number(p.budget_tokens) > 0 ? Number(p.budget_tokens) : 0;
    const budgetUsed = Number(p.tokens_used) || 0;

    return {
      id,
      name: p.name,
      client: p.client_name || '',
      client_name: p.client_name || '',
      owner: p.owner_user_id || '',
      stage: p.description ? String(p.description).slice(0, 120) : '',
      description: p.description || '',
      status: uiStatus,
      status_raw: p.status || '',
      priority: priorityToLabel(p.priority),
      priority_num: Number(p.priority) || 0,
      project_type: p.project_type || '',
      progress,
      health,
      budgetUsed: Math.round(budgetUsed),
      budgetTotal: Math.round(budgetTotal) || Math.round(budgetAllocated / Math.max(1, projectIds.length)) || 1,
      budget_allocated_workspace: Math.round(budgetAllocated),
      dueDate: p.estimated_completion_date
        ? new Date(Number(p.estimated_completion_date) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : p.launch_date || '—',
      lastDeploy: '—',
      activeTasks: t.open + t.blocked,
      blockedTasks: t.blocked,
      completedTasks: t.done,
      totalTasks: t.total,
      openIssueCount: issueC,
      tags,
      workspace_id: p.workspace_id || null,
      tenant_id: p.tenant_id || null,
    };
  });

  const openTasks = planTasks.filter((r) => {
    const st = String(r.status || '').toLowerCase();
    return st !== 'done' && st !== 'complete';
  }).length;

  const blockedTasks = planTasks.filter((r) => String(r.status || '').toLowerCase() === 'blocked').length;

  const avgHealth = projects.length ? Math.round(healthSum / projects.length) : 0;

  const status_counts = Object.entries(statusCountsMap).map(([status, count]) => ({ status, count }));

  const categoryMix = {};
  for (const row of planTasks) {
    const c = String(row.priority || 'P1');
    categoryMix[c] = (categoryMix[c] || 0) + 1;
  }
  const totalCat = Object.values(categoryMix).reduce((a, b) => a + b, 0) || 1;
  const workload_mix = Object.entries(categoryMix).map(([name, count]) => ({
    name,
    value: Math.round((count / totalCat) * 1000) / 10,
  }));

  const milestones = (goalsRows || []).slice(0, 20).map((g) => {
    const milestoneDateRaw = g.target_date || g.due_date || g.deadline || g.created_at;
    return {
      id: String(g.id),
      projectId: String(g.project_id),
      title: g.goal_name || 'Goal',
      date: milestoneDateRaw
        ? new Date(Number(milestoneDateRaw) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '—',
      status: ['complete', 'completed', 'done'].includes(String(g.status || '').toLowerCase())
        ? 'done'
        : String(g.status || '').toLowerCase() === 'in_progress' || Number(g.current_progress_percent) >= 50
          ? 'current'
          : Number(g.current_progress_percent) >= 25
            ? 'upcoming'
            : 'risk',
    };
  });

  const velocity_week = [];
  const burn_week = [];
  try {
    for (let i = 6; i >= 0; i -= 1) {
      const dayStart = Math.floor(Date.now() / 1000) - i * 86400;
      const dayEnd = dayStart + 86400;
      const label = new Date(dayStart * 1000).toLocaleDateString('en-US', { weekday: 'short' });
      let completed = 0;
      let added = 0;
      let blocked = 0;
      if (tenantId) {
        const c1 = await env.DB
          .prepare(
            `SELECT COUNT(*) as c FROM agentsam_plan_tasks t
             INNER JOIN agentsam_plans pl ON pl.id = t.plan_id
             WHERE pl.tenant_id = ? AND t.completed_at >= ? AND t.completed_at < ?
             AND ( ? IS NULL OR pl.workspace_id = ? OR pl.workspace_id IS NULL OR pl.workspace_id = '')`,
          )
          .bind(tenantId, dayStart, dayEnd, workspaceId, workspaceId)
          .first();
        completed = Number(c1?.c ?? 0);
        const c2 = await env.DB
          .prepare(
            `SELECT COUNT(*) as c FROM agentsam_plan_tasks t
             INNER JOIN agentsam_plans pl ON pl.id = t.plan_id
             WHERE pl.tenant_id = ? AND t.created_at >= ? AND t.created_at < ?
             AND ( ? IS NULL OR pl.workspace_id = ? OR pl.workspace_id IS NULL OR pl.workspace_id = '')`,
          )
          .bind(tenantId, dayStart, dayEnd, workspaceId, workspaceId)
          .first();
        added = Number(c2?.c ?? 0);
        const c3 = await env.DB
          .prepare(
            `SELECT COUNT(*) as c FROM agentsam_plan_tasks t
             INNER JOIN agentsam_plans pl ON pl.id = t.plan_id
             WHERE pl.tenant_id = ? AND LOWER(t.status) = 'blocked' AND t.created_at >= ? AND t.created_at < ?
             AND ( ? IS NULL OR pl.workspace_id = ? OR pl.workspace_id IS NULL OR pl.workspace_id = '')`,
          )
          .bind(tenantId, dayStart, dayEnd, workspaceId, workspaceId)
          .first();
        blocked = Number(c3?.c ?? 0);
      }
      velocity_week.push({ day: label, completed, added, blocked });
    }
  } catch {
    for (let i = 6; i >= 0; i -= 1) {
      velocity_week.push({ day: '?', completed: 0, added: 0, blocked: 0 });
    }
  }

  try {
    for (let i = 6; i >= 0; i -= 1) {
      const dayStart = Math.floor(Date.now() / 1000) - i * 86400;
      const dayEnd = dayStart + 86400;
      const label = new Date(dayStart * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      let planned = 0;
      let actual = 0;
      if (workspaceId) {
        const r1 = await env.DB
          .prepare(
            `SELECT COALESCE(SUM(cost_usd),0) as v FROM agentsam_usage_events
             WHERE workspace_id = ? AND COALESCE(created_at_unix, created_at) >= ? AND COALESCE(created_at_unix, created_at) < ?`,
          )
          .bind(workspaceId, dayStart, dayEnd)
          .first();
        actual = Math.round(Number(r1?.v ?? 0) * 1000) / 1000;
      } else if (tenantId) {
        const r1 = await env.DB
          .prepare(
            `SELECT COALESCE(SUM(cost_usd),0) as v FROM agentsam_usage_events
             WHERE tenant_id = ? AND COALESCE(created_at_unix, created_at) >= ? AND COALESCE(created_at_unix, created_at) < ?`,
          )
          .bind(tenantId, dayStart, dayEnd)
          .first();
        actual = Math.round(Number(r1?.v ?? 0) * 1000) / 1000;
      }
      planned = Math.round(actual * 1.08 * 1000) / 1000;
      burn_week.push({ date: label, planned, actual });
    }
  } catch {
    /* */
  }

  const priority_tasks = planTasks.slice(0, 40).map((t) => {
    let projectId = '';
    const keys = safeJsonArray(t.linked_project_keys, []);
    if (keys[0]) projectId = String(keys[0]);
    return {
      id: String(t.id),
      title: t.title || 'Task',
      projectId,
      owner: '—',
      status: String(t.status || 'todo').toLowerCase(),
      priority: ['P0', 'P1', 'P2', 'P3'].includes(String(t.priority))
        ? String(t.priority)
        : Number(t.priority) === 0
          ? 'P0'
          : Number(t.priority) === 1
            ? 'P1'
            : Number(t.priority) === 2
              ? 'P2'
              : 'P3',
      due: '—',
      estimateHours: Number(t.actual_minutes || 0) / 60 || 0,
    };
  });

  const kpis = {
    active_projects: activeProjects,
    open_tasks: openTasks,
    blocked: blockedTasks,
    avg_health: avgHealth,
    budget_burn: Math.round(budgetBurn * 100) / 100,
    budget_allocated: Math.round(budgetAllocated * 100) / 100,
    this_week_hours: thisWeekHours,
  };

  return jsonResponse({
    ok: true,
    kpis,
    projects,
    milestones,
    workload_mix,
    status_counts,
    velocity_week,
    burn_week,
    priority_tasks,
    updated_at: new Date().toISOString(),
  });
}

async function handleList(env, authUser, url) {
  const tenantId = authUser.tenant_id ? String(authUser.tenant_id) : null;
  const workspaceId =
    url.searchParams.get('workspace_id') ||
    (authUser.active_workspace_id ? String(authUser.active_workspace_id) : null);
  const { sql: whereSql, binds: whereBinds } = buildProjectWhereClause(workspaceId, tenantId);
  const { results } = await env.DB.prepare(`SELECT p.* FROM projects p WHERE ${whereSql} ORDER BY COALESCE(p.priority,0) DESC, p.name ASC`).bind(...whereBinds).all();
  return jsonResponse({ ok: true, success: true, projects: results || [] });
}

async function handleGetOne(env, authUser, id) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (authUser.tenant_id && row.tenant_id && String(row.tenant_id) !== String(authUser.tenant_id) && !authUser.is_superadmin) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }
  return jsonResponse({ ok: true, project: row });
}

async function handlePatch(request, env, authUser, id) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (authUser.tenant_id && row.tenant_id && String(row.tenant_id) !== String(authUser.tenant_id) && !authUser.is_superadmin) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }
  const body = await request.json().catch(() => ({}));
  const allowed = [
    'name',
    'description',
    'client_name',
    'project_type',
    'status',
    'priority',
    'domain',
    'worker_id',
    'd1_databases',
    'r2_buckets',
    'launch_date',
    'accessibility_target',
    'performance_budget',
    'tags_json',
    'metadata_json',
    'workspace_id',
  ];
  const updates = [];
  const binds = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      updates.push(`${k} = ?`);
      if (k === 'tags_json' && Array.isArray(body[k])) binds.push(JSON.stringify(body[k]));
      else binds.push(body[k]);
    }
  }
  if (!updates.length) return jsonResponse({ ok: true, project: row });
  updates.push('updated_at = datetime(\'now\')');
  binds.push(id);
  await env.DB.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  const next = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  return jsonResponse({ ok: true, project: next });
}

async function handlePost(request, env, authUser) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return jsonResponse({ ok: false, error: 'name_required' }, 400);

  let workspaceId = body.workspace_id ? String(body.workspace_id) : authUser.active_workspace_id || null;
  if (!workspaceId) return jsonResponse({ ok: false, error: 'workspace_required' }, 400);

  const tenantId = authUser.tenant_id ? String(authUser.tenant_id) : null;
  if (!tenantId) return jsonResponse({ ok: false, error: 'tenant_required' }, 400);

  if (!(await assertWorkspaceAllowed(env.DB, workspaceId, tenantId, !!authUser.is_superadmin))) {
    return jsonResponse({ ok: false, error: 'workspace_not_allowed' }, 403);
  }

  const projectId = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const tagsJson = JSON.stringify(tags);
  const priority = Number(body.priority);
  const prio = Number.isFinite(priority) ? Math.max(0, Math.min(100, Math.floor(priority))) : 50;
  const status = String(body.status || 'development').slice(0, 64);
  const projectType = String(body.project_type || 'dashboard').slice(0, 64);
  const clientName = String(body.client_name || '').trim() || null;
  const description = String(body.description || '').trim() || null;
  const budgetUsd = Number(body.budget_usd);
  const budget = Number.isFinite(budgetUsd) ? budgetUsd : 0;

  let ownerUserId = null;
  try {
    const wpOwner = await env.DB
      .prepare(`SELECT owner_user_id FROM workspace_projects WHERE workspace_id = ? LIMIT 1`)
      .bind(workspaceId)
      .first();
    if (wpOwner?.owner_user_id) ownerUserId = String(wpOwner.owner_user_id);
  } catch {
    /* */
  }

  await env.DB
    .prepare(
      `INSERT INTO projects (
        id, name, client_name, project_type, status, tenant_id, description, priority,
        workspace_id, tags_json, domain, worker_id, d1_databases, r2_buckets,
        launch_date, accessibility_target, performance_budget, owner_user_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      projectId,
      name,
      clientName,
      projectType,
      status,
      tenantId,
      description,
      prio,
      workspaceId,
      tagsJson,
      body.domain || null,
      body.worker_id || null,
      body.d1_database || body.d1_databases || null,
      body.r2_buckets || null,
      body.target_launch_date || body.launch_date || null,
      body.accessibility_target || null,
      body.performance_budget || null,
      ownerUserId,
    )
    .run();

  const wpId = `wp_${slugifyBase(name)}_${Math.random().toString(36).slice(2, 6)}`;
  const slug = slugifyBase(name);
  const meta = JSON.stringify({ projects_table_id: projectId });

  try {
    await env.DB
      .prepare(
        `INSERT INTO workspace_projects (
          id, workspace_id, tenant_id, owner_user_id, agent_ai_id, name, slug, description,
          client_company, project_type, status, budget_usd, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
      )
      .bind(
        wpId,
        workspaceId,
        tenantId,
        ownerUserId,
        'ai_sam_v1',
        name,
        slug,
        description,
        clientName,
        projectType,
        status === 'production' ? 'active' : 'active',
        budget,
        meta,
      )
      .run();
  } catch (e) {
    console.warn('[projects POST workspace_projects]', e?.message || e);
  }

  try {
    const planId = `plan_${projectId.slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`;
    const today = new Date().toISOString().slice(0, 10);
    const linked = JSON.stringify([projectId]);
    await env.DB
      .prepare(
        `INSERT INTO agentsam_plans (
          id, tenant_id, workspace_id, plan_date, plan_type, title, status,
          linked_project_keys, tasks_total, tasks_done, tasks_blocked, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'feature', ?, 'draft', ?, 0, 0, 0, unixepoch(), unixepoch())`,
      )
      .bind(planId, tenantId, workspaceId, today, `Plan: ${name}`, linked)
      .run();
  } catch (e) {
    console.warn('[projects POST agentsam_plans]', e?.message || e);
  }

  try {
    if (body.seed_goal !== false) {
      const gid = `goal_${Math.random().toString(36).slice(2, 10)}`;
      await env.DB
        .prepare(
          `INSERT INTO project_goals (
            id, project_id, tenant_id, goal_name, goal_description, goal_type, status, priority, created_at
          ) VALUES (?, ?, ?, ?, ?, 'primary', 'active', 70, unixepoch())`,
        )
        .bind(gid, projectId, tenantId, `Launch ${name}`, description || 'Initial project goal from dashboard.')
        .run();
    }
  } catch (e) {
    console.warn('[projects POST project_goals]', e?.message || e);
  }

  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  return jsonResponse({ ok: true, project: row, workspace_project_id: wpId }, 201);
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 * @param {any} authUser
 */
export async function handleProjectsApi(request, url, env, authUser) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();
  const sub = pathLower.startsWith('/api/projects/') ? pathLower.slice('/api/projects/'.length) : '';

  if (pathLower === '/api/projects/overview' && method === 'GET') {
    return handleOverview(request, url, env, authUser);
  }

  if (pathLower === '/api/projects' && method === 'GET') {
    return handleList(env, authUser, url);
  }

  if (pathLower === '/api/projects' && method === 'POST') {
    return handlePost(request, env, authUser);
  }

  const seg = sub.split('/').filter(Boolean);
  if (seg.length === 1 && method === 'GET') {
    return handleGetOne(env, authUser, seg[0]);
  }
  if (seg.length === 1 && (method === 'PATCH' || method === 'PUT')) {
    return handlePatch(request, env, authUser, seg[0]);
  }

  return jsonResponse({ ok: false, error: 'projects_route_not_found' }, 404);
}
