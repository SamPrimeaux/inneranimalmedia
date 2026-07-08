/**
 * Projects API — /api/projects* (D1 canonical; Supabase mirror on every write).
 * Dispatched from src/api/finance.js after auth + DB checks.
 */
import { jsonResponse, syncSessionWorkspaceId } from '../core/auth.js';
import { withD1Retry } from '../core/d1-retry.js';
import { scheduleSyncProjectToSupabase } from '../core/agentsam-projects-supabase-sync.js';
import { resolveWorkspaceBindings, normalizeWorkspaceBindings } from '../core/agentsam-workspace.js';
import { userCanAccessWorkspace } from '../core/workspace-access.js';
import {
  readProjectDashboardMemory,
  upsertProjectDashboardMemory,
} from '../core/project-dashboard-memory.js';
import { syncProjectRuntimeContract } from '../core/project-runtime-contract-sync.js';
import { sendResendEmail } from '../services/resend.js';

const PROJECTS_LIST_CACHE = 'private, max-age=30, stale-while-revalidate=120';
const PROJECTS_OVERVIEW_CACHE = 'private, max-age=15, stale-while-revalidate=300';

function projectsJsonResponse(body, status = 200, cacheControl = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (cacheControl) headers['Cache-Control'] = cacheControl;
  return new Response(JSON.stringify(body), { status: Number(status) || 200, headers });
}

function safeJsonArray(text, fallback = []) {
  try {
    const v = JSON.parse(String(text || 'null'));
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function parseMetadataObject(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    const o = JSON.parse(String(raw));
    return typeof o === 'object' && o !== null ? o : {};
  } catch {
    return {};
  }
}

function extractCoverImageUrl(row, meta) {
  const m =
    meta != null && typeof meta === 'object'
      ? meta
      : parseMetadataObject(row?.metadata_json);
  const candidates = [
    m.cover_image_url,
    m.cover_url,
    m.hero_image_url,
    m.card_image_url,
  ];
  for (const c of candidates) {
    const u = c != null ? String(c).trim() : '';
    if (u) return u;
  }
  const tags = safeJsonArray(row?.tags_json, []);
  for (const t of tags) {
    if (typeof t === 'string' && t.startsWith('cover:')) {
      const u = t.slice(6).trim();
      if (u) return u;
    }
  }
  return null;
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

// projects.project_type / projects.status are both CHECK-constrained against
// exact lowercase-hyphenated enums in D1. The dashboard's New Project form
// sends human-readable casing (e.g. "E-Commerce"), which fails the exact
// string match and previously surfaced as a raw, unhandled D1_ERROR/500.
// Normalize + validate here so the UI can send whatever casing it wants.
const VALID_PROJECT_TYPES = ['dashboard', 'landing-page', 'saas-product', 'e-commerce', 'internal-tool', 'template'];
const VALID_PROJECT_STATUSES = ['discovery', 'design', 'development', 'qa', 'staging', 'production', 'maintenance', 'archived'];
const VALID_WORKSPACE_PROJECT_TYPES = ['website', 'mpa', 'spa', 'api', 'mobile', 'cms', 'ecommerce', 'brand', 'internal', 'other'];
const VALID_WORKSPACE_PROJECT_STATUSES = ['active', 'on_hold', 'done', 'archived'];

function normalizeEnum(value, allowed, fallback) {
  const v = String(value || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');
  if (allowed.includes(v)) return v;
  // Dashboard / agent chat often says "saas" — map to canonical enum.
  if (v === 'saas' || v === 'saas-platform') return 'saas-product';
  return fallback;
}

/** workspace_projects uses a legacy enum — map canonical projects.project_type. */
function mapWorkspaceProjectType(projectType) {
  const t = String(projectType || '').trim().toLowerCase();
  const map = {
    'landing-page': 'website',
    'saas-product': 'api',
    'e-commerce': 'ecommerce',
    'internal-tool': 'internal',
    template: 'other',
    dashboard: 'internal',
    website: 'website',
    mpa: 'mpa',
    spa: 'spa',
    api: 'api',
    mobile: 'mobile',
    cms: 'cms',
    ecommerce: 'ecommerce',
    brand: 'brand',
    internal: 'internal',
    other: 'other',
  };
  return map[t] || 'other';
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

async function mirrorProjectWrite(env, ctx, row, opts = {}) {
  if (!row?.id) return { ok: false, error: 'missing_project_row' };
  return scheduleSyncProjectToSupabase(env, ctx, row, {
    ...opts,
    awaitSync: true,
    updatedBy: opts.updatedBy ?? null,
  });
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
  try {
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
    projectRows = mergeProjectRowsById(results || [], await fetchCollaboratorProjectRows(env, authUser));
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e.message || e) }, 500);
  }

  const {
    projectRows: mergedRows,
    wpCoverByProjectId,
    chatProjectIdByProjectsId,
  } = await mergeWorkspaceProjectRows(env, workspaceId, projectRows);
  projectRows = mergedRows;

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
      chat_project_id: chatProjectIdByProjectsId.get(id) || null,
      cover_image_url: wpCoverByProjectId.get(id) || extractCoverImageUrl(p, parseMetadataObject(p?.metadata_json)),
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

  return projectsJsonResponse(
    {
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
    },
    200,
    PROJECTS_OVERVIEW_CACHE,
  );
  } catch (e) {
    console.warn('[projects/overview]', e?.message ?? e);
    return jsonResponse({ ok: false, error: String(e?.message || e).slice(0, 500) }, 500);
  }
}

/**
 * Enrich projects rows with workspace_projects cover/chat metadata only.
 * Never synthesize project rows from orphaned workspace_projects — that resurrected deleted projects.
 * @returns {Promise<{ projectRows: any[], wpCoverByProjectId: Map<string, string>, chatProjectIdByProjectsId: Map<string, string> }>}
 */
async function mergeWorkspaceProjectRows(env, workspaceId, projectRows) {
  const rows = Array.isArray(projectRows) ? [...projectRows] : [];
  const wpCoverByProjectId = new Map();
  const chatProjectIdByProjectsId = new Map();
  if (!workspaceId || !env?.DB) {
    return { projectRows: rows, wpCoverByProjectId, chatProjectIdByProjectsId };
  }

  try {
    const { results: wpRows } = await env.DB.prepare(
      `SELECT id, metadata_json
       FROM workspace_projects
       WHERE workspace_id = ?`,
    )
      .bind(workspaceId)
      .all();
    const existingIds = new Set(rows.map((r) => String(r.id)));
    for (const wp of wpRows || []) {
      const meta = parseMetadataObject(wp.metadata_json);
      const linkedId = meta.projects_table_id ? String(meta.projects_table_id) : null;
      const cover = extractCoverImageUrl(null, meta);
      if (linkedId) chatProjectIdByProjectsId.set(linkedId, String(wp.id));
      chatProjectIdByProjectsId.set(String(wp.id), String(wp.id));
      if (cover) {
        if (linkedId) wpCoverByProjectId.set(linkedId, cover);
        wpCoverByProjectId.set(String(wp.id), cover);
      }
      if (linkedId && !existingIds.has(linkedId)) {
        const linked = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(linkedId).first();
        if (linked) {
          rows.push(linked);
          existingIds.add(linkedId);
        }
      }
    }
  } catch {
    /* workspace_projects optional */
  }

  rows.sort(
    (a, b) =>
      (Number(b.priority) || 0) - (Number(a.priority) || 0) ||
      String(a.name || '').localeCompare(String(b.name || '')),
  );

  return { projectRows: rows, wpCoverByProjectId, chatProjectIdByProjectsId };
}

async function attachChatProjectIds(env, rows, chatProjectIdByProjectsId = null) {
  if (!rows?.length) return rows || [];
  let chatMap = chatProjectIdByProjectsId;
  if (!chatMap || !(chatMap instanceof Map)) {
    chatMap = new Map();
    try {
      const { results: wpRows } = await env.DB.prepare(
        `SELECT id, metadata_json FROM workspace_projects WHERE metadata_json IS NOT NULL`,
      ).all();
      for (const wp of wpRows || []) {
        const meta = parseMetadataObject(wp.metadata_json);
        const linkedId = meta.projects_table_id ? String(meta.projects_table_id) : null;
        if (linkedId) chatMap.set(linkedId, String(wp.id));
        chatMap.set(String(wp.id), String(wp.id));
      }
    } catch {
      /* optional */
    }
  }
  return rows.map((row) => ({
    ...row,
    chat_project_id: chatMap.get(String(row.id)) ?? null,
  }));
}

async function handleClientProjectsList(env, authUser) {
  const tenantId = authUser.tenant_id ? String(authUser.tenant_id) : null;
  try {
    let sql = `SELECT id, client_name, project_name, project_id, client_id, status,
                      cloudflare_worker_url, payments_received, total_invoiced, payment_notes
               FROM client_projects
               WHERE COALESCE(status, 'active') NOT IN ('archived', 'cancelled')`;
    const binds = [];
    if (tenantId && !authUser.is_superadmin) {
      sql += ` AND (tenant_id = ? OR tenant_id IS NULL)`;
      binds.push(tenantId);
    }
    sql += ` ORDER BY client_name ASC, project_name ASC`;
    const { results } = await withD1Retry(() => env.DB.prepare(sql).bind(...binds).all());
    return projectsJsonResponse({ ok: true, clients: results || [] }, 200, 'private, no-store');
  } catch (e) {
    console.warn('[projects/clients]', e?.message ?? e);
    return projectsJsonResponse({ ok: true, clients: [] }, 200, 'private, no-store');
  }
}

async function handleList(env, authUser, url) {
  const tenantId = authUser.tenant_id ? String(authUser.tenant_id) : null;
  const workspaceId =
    url.searchParams.get('workspace_id') ||
    (authUser.active_workspace_id ? String(authUser.active_workspace_id) : null);
  const scope = String(url.searchParams.get('scope') || '').trim().toLowerCase();
  const includeArchived =
    url.searchParams.get('include_archived') === '1' ||
    url.searchParams.get('include_archived') === 'true';
  let whereSql;
  let whereBinds;
  if (scope === 'tenant' && tenantId) {
    whereSql = 'p.tenant_id = ?';
    whereBinds = [tenantId];
  } else {
    ({ sql: whereSql, binds: whereBinds } = buildProjectWhereClause(workspaceId, tenantId));
  }
  if (!includeArchived) {
    whereSql += ` AND COALESCE(p.status, '') != 'archived'`;
  }
  const clientId = url.searchParams.get('client_id')?.trim() || null;
  const clientWork =
    url.searchParams.get('client_work') === '1' || url.searchParams.get('client_work') === 'true';
  if (clientId) {
    whereSql += ` AND p.client_id = ?`;
    whereBinds.push(clientId);
  } else if (clientWork) {
    whereSql += ` AND p.client_id IS NOT NULL AND TRIM(p.client_id) != ''
      AND p.client_id NOT IN ('client_sam_primeaux', 'client_meauxbility')`;
  }
  const { results } = await withD1Retry(() =>
    env.DB.prepare(`SELECT p.* FROM projects p WHERE ${whereSql} ORDER BY COALESCE(p.priority,0) DESC, p.name ASC`).bind(...whereBinds).all(),
  );
  const mergedRows = mergeProjectRowsById(results || [], await fetchCollaboratorProjectRows(env, authUser));
  const { projectRows, wpCoverByProjectId, chatProjectIdByProjectsId } = await mergeWorkspaceProjectRows(
    env,
    scope === 'tenant' ? null : workspaceId,
    mergedRows,
  );
  const enriched = projectRows.map((p) => {
    const meta = parseMetadataObject(p?.metadata_json);
    const tags = safeJsonArray(p?.tags_json, []);
    const coverFromMeta = extractCoverImageUrl(p, meta);
    const coverFromWp = wpCoverByProjectId.get(String(p.id)) ?? null;
    const priorityNum = Number(p?.priority) || 0;
    return {
      ...p,
      cover_image_url: coverFromMeta || coverFromWp,
      priority_num: priorityNum,
      priority_label: priorityToLabel(priorityNum),
      is_pinned: meta.is_pinned === true || tags.includes('pinned'),
    };
  });
  const projects = await attachChatProjectIds(env, enriched, chatProjectIdByProjectsId);
  return projectsJsonResponse({ ok: true, success: true, projects, total: projects.length }, 200, 'private, no-store');
}

async function handleGetOne(env, authUser, id) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  const access = await assertProjectAccess(env, authUser, row);
  if (!access.ok) return jsonResponse({ ok: false, error: access.error }, access.status);
  const [project] = await attachChatProjectIds(env, [row]);
  return jsonResponse({ ok: true, project: project || row });
}

async function handlePatch(request, env, authUser, id, ctx) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (authUser.tenant_id && row.tenant_id && String(row.tenant_id) !== String(authUser.tenant_id) && !authUser.is_superadmin) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }
  const body = await request.json().catch(() => ({}));

  if (Object.prototype.hasOwnProperty.call(body, 'project_type')) {
    body.project_type = normalizeEnum(body.project_type, VALID_PROJECT_TYPES, row.project_type || 'dashboard');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    body.status = normalizeEnum(body.status, VALID_PROJECT_STATUSES, row.status || 'discovery');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'is_pinned')) {
    const meta = parseMetadataObject(row.metadata_json);
    meta.is_pinned = body.is_pinned === true;
    body.metadata_json = JSON.stringify(meta);
    let tags = safeJsonArray(row.tags_json, []);
    if (body.is_pinned === true) {
      if (!tags.includes('pinned')) tags = [...tags, 'pinned'];
    } else {
      tags = tags.filter((t) => t !== 'pinned');
    }
    body.tags_json = tags;
    delete body.is_pinned;
  }

  const allowed = [
    'name',
    'description',
    'client_name',
    'project_type',
    'status',
    'priority',
    'parent_id',
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
  try {
    await env.DB.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  } catch (e) {
    return jsonResponse({ ok: false, error: `db_update_failed: ${e?.message || e}` }, 500);
  }
  const next = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  const mirror = await mirrorProjectWrite(env, ctx, next, { updatedBy: authUser?.id ?? null });
  return jsonResponse({ ok: true, project: next, supabase_mirror: mirror });
}

async function handlePost(request, env, authUser, ctx) {
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
  const status = normalizeEnum(body.status, VALID_PROJECT_STATUSES, 'development');
  const projectType = normalizeEnum(body.project_type, VALID_PROJECT_TYPES, 'dashboard');
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

  // Main row insert is the only failure mode that should ever surface as a hard
  // error to the caller — everything below this point is best-effort sidecar
  // bookkeeping and stays wrapped in its own try/catch so a missing/odd table
  // never turns "project created" into a 500.
  try {
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
  } catch (e) {
    return jsonResponse({ ok: false, error: `db_insert_failed: ${e?.message || e}` }, 500);
  }

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
        mapWorkspaceProjectType(projectType),
        mapWorkspaceProjectStatus(status),
        budget,
        meta,
      )
      .run();
  } catch (e) {
    console.warn('[projects POST workspace_projects]', e?.message || e);
  }

  // Every project gets exactly one kanban board + the canonical 7-column
  // template, matching what /api/kanban/boards self-heals to on first read.
  // Created eagerly here so the dashboard's Workspace Kanban panel never
  // shows a transient "no board" state for a brand-new project.
  try {
    const boardId = `kb_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Math.floor(Date.now() / 1000);
    await env.DB
      .prepare(
        `INSERT INTO kanban_boards (
           id, tenant_id, workspace_id, project_id, owner_id, name, description, board_type, is_active, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'Project kanban board', 'project', 1, ?, ?)`,
      )
      .bind(boardId, tenantId, workspaceId, projectId, ownerUserId, `${name} Board`, now, now)
      .run();

    const defaultColumns = [
      { name: 'Backlog', position: 0, status: 'backlog' },
      { name: 'To Do', position: 1, status: 'todo' },
      { name: 'In Progress', position: 2, status: 'in_progress' },
      { name: 'Testing', position: 3, status: 'testing' },
      { name: 'Awaiting Approval', position: 4, status: 'awaiting_approval' },
      { name: 'Complete', position: 5, status: 'complete' },
      { name: 'Blocked', position: 6, status: 'blocked' },
    ];
    for (const col of defaultColumns) {
      const columnId = `kcol_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await env.DB
        .prepare(
          `INSERT INTO kanban_columns (
             id, tenant_id, board_id, name, position, config_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(columnId, tenantId, boardId, col.name, col.position, JSON.stringify({ status: col.status }), now, now)
        .run();
    }
  } catch (e) {
    console.warn('[projects POST kanban_boards]', e?.message || e);
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
  const mirror = await mirrorProjectWrite(env, ctx, row, { updatedBy: authUser?.id ?? null });
  return jsonResponse(
    { ok: true, project: row, workspace_project_id: wpId, supabase_mirror: mirror },
    201,
  );
}

async function claimProjectCollaborator(env, projectId, authUser) {
  const email = authUser?.email ? String(authUser.email).trim().toLowerCase() : '';
  const userId = authUser?.id != null ? String(authUser.id) : null;
  if (!email || !userId || !env?.DB) return;
  try {
    await env.DB.prepare(
      `UPDATE project_collaborators
       SET user_id = ?, updated_at = unixepoch()
       WHERE project_id = ?
         AND LOWER(email) = ?
         AND (user_id IS NULL OR TRIM(user_id) = '')`,
    )
      .bind(userId, String(projectId), email)
      .run();
  } catch {
    /* optional table */
  }
}

async function isProjectCollaborator(env, projectId, authUser) {
  const email = authUser?.email ? String(authUser.email).trim().toLowerCase() : '';
  const userId = authUser?.id != null ? String(authUser.id) : '';
  if (!email && !userId) return false;
  try {
    const clauses = [];
    const binds = [String(projectId)];
    if (email) {
      clauses.push('LOWER(c.email) = ?');
      binds.push(email);
    }
    if (userId) {
      clauses.push('c.user_id = ?');
      binds.push(userId);
    }
    const row = await env.DB.prepare(
      `SELECT c.id FROM project_collaborators c
       WHERE c.project_id = ? AND (${clauses.join(' OR ')})
       LIMIT 1`,
    )
      .bind(...binds)
      .first();
    return !!row;
  } catch {
    return false;
  }
}

async function fetchCollaboratorProjectRows(env, authUser) {
  const email = authUser?.email ? String(authUser.email).trim().toLowerCase() : '';
  const userId = authUser?.id != null ? String(authUser.id) : '';
  if (!email && !userId) return [];
  try {
    const clauses = [];
    const binds = [];
    if (email) {
      clauses.push('LOWER(c.email) = ?');
      binds.push(email);
    }
    if (userId) {
      clauses.push('c.user_id = ?');
      binds.push(userId);
    }
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT p.* FROM projects p
       INNER JOIN project_collaborators c ON c.project_id = p.id
       WHERE (${clauses.join(' OR ')})
       ORDER BY COALESCE(p.priority, 0) DESC, p.name ASC`,
    )
      .bind(...binds)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

function mergeProjectRowsById(primary, extra) {
  const map = new Map();
  for (const row of primary || []) map.set(String(row.id), row);
  for (const row of extra || []) {
    const id = String(row.id);
    if (!map.has(id)) map.set(id, row);
  }
  return [...map.values()];
}

async function assertProjectAccess(env, authUser, row) {
  if (!row) return { ok: false, error: 'not_found', status: 404 };
  if (authUser?.is_superadmin) return { ok: true, row };

  const collaborator = await isProjectCollaborator(env, String(row.id), authUser);
  if (collaborator) {
    await claimProjectCollaborator(env, String(row.id), authUser);
    return { ok: true, row, collaborator: true };
  }

  if (
    authUser.tenant_id &&
    row.tenant_id &&
    String(row.tenant_id) !== String(authUser.tenant_id)
  ) {
    return { ok: false, error: 'forbidden', status: 403 };
  }
  return { ok: true, row };
}

async function handleProjectMemoryGet(env, authUser, projectId) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  const access = await assertProjectAccess(env, authUser, row);
  if (!access.ok) return jsonResponse({ ok: false, error: access.error }, access.status);

  const mem = await readProjectDashboardMemory(env.DB, projectId);
  return jsonResponse({ ok: true, project_id: String(projectId), ...mem });
}

async function handleProjectMemoryPatch(request, env, authUser, projectId) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  const access = await assertProjectAccess(env, authUser, row);
  if (!access.ok) return jsonResponse({ ok: false, error: access.error }, access.status);

  const body = await request.json().catch(() => ({}));
  const tenantId = row.tenant_id ? String(row.tenant_id) : authUser.tenant_id ? String(authUser.tenant_id) : '';
  if (!tenantId) return jsonResponse({ ok: false, error: 'tenant_required' }, 400);

  try {
    const next = await upsertProjectDashboardMemory(env.DB, {
      projectId: String(projectId),
      tenantId,
      userId: authUser?.id ?? null,
      memory: Object.prototype.hasOwnProperty.call(body, 'memory') ? String(body.memory ?? '') : undefined,
      instructions: Object.prototype.hasOwnProperty.call(body, 'instructions')
        ? String(body.instructions ?? '')
        : undefined,
    });
    return jsonResponse({ ok: true, project_id: String(projectId), ...next });
  } catch (e) {
    return jsonResponse({ ok: false, error: `memory_update_failed: ${e?.message || e}` }, 500);
  }
}

async function handleProjectRuntimeContractSync(request, env, authUser, projectId) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  const access = await assertProjectAccess(env, authUser, row);
  if (!access.ok) return jsonResponse({ ok: false, error: access.error }, access.status);

  const body = await request.json().catch(() => ({}));
  const agentsamMarkdown =
    typeof body.agentsam_markdown === 'string'
      ? body.agentsam_markdown
      : typeof body.agentsamMarkdown === 'string'
        ? body.agentsamMarkdown
        : null;

  try {
    const result = await syncProjectRuntimeContract(env, {
      projectRef: String(projectId),
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      tenantId: row.tenant_id ? String(row.tenant_id) : authUser.tenant_id ? String(authUser.tenant_id) : null,
      userId: authUser?.id ?? null,
      agentsamMarkdown,
      force: body.force === true,
    });
    const status = result.ok ? 200 : result.error === 'migration_800_required' ? 503 : 400;
    return jsonResponse({ ok: result.ok, project_id: String(projectId), ...result }, status);
  } catch (e) {
    return jsonResponse({ ok: false, error: `runtime_contract_sync_failed: ${e?.message || e}` }, 500);
  }
}

async function handleProjectCollaboratorsGet(env, authUser, projectId) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  const access = await assertProjectAccess(env, authUser, row);
  if (!access.ok) return jsonResponse({ ok: false, error: access.error }, access.status);

  try {
    const { results } = await env.DB
      .prepare(
        `SELECT id, project_id, email, user_id, role, invited_by, workspace_id, created_at, updated_at
         FROM project_collaborators WHERE project_id = ? ORDER BY created_at ASC`,
      )
      .bind(String(projectId))
      .all();
    return jsonResponse({ ok: true, project_id: String(projectId), collaborators: results || [] });
  } catch (e) {
    return jsonResponse({ ok: false, error: `collaborators_read_failed: ${e?.message || e}` }, 500);
  }
}

async function handleProjectCollaboratorsPost(request, env, authUser, projectId) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  const access = await assertProjectAccess(env, authUser, row);
  if (!access.ok) return jsonResponse({ ok: false, error: access.error }, access.status);

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return jsonResponse({ ok: false, error: 'valid_email_required' }, 400);
  const role = String(body.role || 'editor').trim().toLowerCase() === 'viewer' ? 'viewer' : 'editor';
  const tenantId = row.tenant_id ? String(row.tenant_id) : String(authUser.tenant_id || '');
  const collabId = `pcol_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  try {
    await env.DB
      .prepare(
        `INSERT INTO project_collaborators (
          id, project_id, tenant_id, workspace_id, email, user_id, role, invited_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, unixepoch(), unixepoch())
        ON CONFLICT(project_id, email) DO UPDATE SET
          role = excluded.role,
          updated_at = unixepoch(),
          invited_by = excluded.invited_by`,
      )
      .bind(
        collabId,
        String(projectId),
        tenantId,
        row.workspace_id ? String(row.workspace_id) : null,
        email,
        role,
        authUser?.id != null ? String(authUser.id) : null,
      )
      .run();
  } catch (e) {
    return jsonResponse({ ok: false, error: `collaborator_upsert_failed: ${e?.message || e}` }, 500);
  }

  const collabRes = await handleProjectCollaboratorsGet(env, authUser, projectId);
  const collabJson = await collabRes.json();

  return jsonResponse(
    {
      ok: true,
      collaborator: collabJson.collaborators?.find((c) => String(c.email).toLowerCase() === email) ?? null,
      collaborators: collabJson.collaborators ?? [],
    },
    201,
  );
}

async function handleProjectCollaboratorDelete(env, authUser, projectId, collabId) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  const access = await assertProjectAccess(env, authUser, row);
  if (!access.ok) return jsonResponse({ ok: false, error: access.error }, access.status);

  try {
    await env.DB
      .prepare(`DELETE FROM project_collaborators WHERE id = ? AND project_id = ?`)
      .bind(String(collabId), String(projectId))
      .run();
  } catch (e) {
    return jsonResponse({ ok: false, error: `collaborator_delete_failed: ${e?.message || e}` }, 500);
  }
  return jsonResponse({ ok: true, deleted: true, id: collabId });
}

async function handleProjectSharePost(request, env, authUser, projectId) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  const access = await assertProjectAccess(env, authUser, row);
  if (!access.ok) return jsonResponse({ ok: false, error: access.error }, access.status);

  const body = await request.json().catch(() => ({}));
  const base =
    (env.PUBLIC_APP_URL && String(env.PUBLIC_APP_URL).trim()) ||
    (env.ASSETS_BASE_URL && String(env.ASSETS_BASE_URL).trim()) ||
    'https://inneranimalmedia.com';
  const shareUrl = `${base.replace(/\/$/, '')}/dashboard/projects/${encodeURIComponent(String(projectId))}`;
  const message = String(body.message || '').trim();
  const role = String(body.role || 'editor').trim().toLowerCase() === 'viewer' ? 'viewer' : 'editor';
  const rawEmails = Array.isArray(body.emails) ? body.emails : body.email ? [body.email] : [];
  const emails = [...new Set(rawEmails.map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@')))];

  const invited = [];
  const emailErrors = [];

  for (const email of emails) {
    const fakeReq = new Request('http://local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });
    const add = await handleProjectCollaboratorsPost(fakeReq, env, authUser, projectId);
    if (add.status >= 400) {
      emailErrors.push({ email, error: 'invite_failed' });
      continue;
    }
    invited.push(email);

    const inviter = authUser.email ? String(authUser.email) : 'A teammate';
    const subject = `${inviter} shared project “${row.name}” with you`;
    const text =
      `${inviter} invited you to collaborate on “${row.name}” (${role} access).\n\n` +
      `Open project: ${shareUrl}\n` +
      (message ? `\nMessage:\n${message}\n` : '') +
      `\nSign in at ${base.replace(/\/$/, '')}/auth/login if needed.`;

    const sent = await sendResendEmail(env, {
      to: email,
      subject,
      text,
      tags: [{ name: 'type', value: 'project_share' }],
    });
    if (sent?.error) emailErrors.push({ email, error: sent.error });
  }

  const collabRes = await handleProjectCollaboratorsGet(env, authUser, projectId);
  const collabJson = await collabRes.json();

  return jsonResponse({
    ok: true,
    share_url: shareUrl,
    invited,
    email_errors: emailErrors,
    collaborators: collabJson.collaborators ?? [],
    copy_only: emails.length === 0,
  });
}

async function deleteProjectDependents(env, projectId) {
  const pid = String(projectId);
  const runOptional = async (sql, ...binds) => {
    try {
      await env.DB.prepare(sql).bind(...binds).run();
    } catch {
      /* optional table / legacy schema */
    }
  };

  // Todos before kanban (agentsam_todo → kanban_tasks / kanban_boards FKs).
  await runOptional(
    `DELETE FROM agentsam_todo WHERE project_id = ? OR project_key = ?`,
    pid,
    pid,
  );
  await runOptional(
    `DELETE FROM kanban_tasks WHERE board_id IN (SELECT id FROM kanban_boards WHERE project_id = ?)`,
    pid,
  );
  await runOptional(`DELETE FROM kanban_boards WHERE project_id = ?`, pid);

  // FK RESTRICT (no ON DELETE) — must clear before projects row delete.
  await runOptional(`DELETE FROM project_costs WHERE CAST(project_id AS TEXT) = ?`, pid);
  await runOptional(`DELETE FROM project_metrics WHERE CAST(project_id AS TEXT) = ?`, pid);
  await runOptional(`UPDATE worker_registry SET project_id = NULL WHERE project_id = ?`, pid);

  await runOptional(`DELETE FROM project_collaborators WHERE project_id = ?`, pid);
  await runOptional(`DELETE FROM project_memory WHERE project_id = ?`, pid);
  await runOptional(`DELETE FROM project_capability_constraints WHERE project_id = ?`, pid);
  await runOptional(`DELETE FROM project_permissions WHERE project_id = ?`, pid);

  // Legacy FKs on project_execution_audit point at dropped agent_configs / agent_command_executions (417).
  await runOptional(
    `UPDATE project_execution_audit SET agent_config_id = NULL, execution_id = NULL WHERE project_id = ?`,
    pid,
  );
  try {
    await env.DB.prepare(`DELETE FROM project_execution_audit WHERE project_id = ?`).bind(pid).run();
  } catch {
    await env.DB.batch([
      env.DB.prepare(`PRAGMA foreign_keys = OFF`),
      env.DB.prepare(`DELETE FROM project_execution_audit WHERE project_id = ?`).bind(pid),
      env.DB.prepare(`PRAGMA foreign_keys = ON`),
    ]);
  }
  await runOptional(`DELETE FROM project_goals WHERE project_id = ?`, pid);

  // FK ON DELETE SET NULL — explicit for legacy rows.
  await runOptional(`UPDATE client_workflows SET project_id = NULL WHERE CAST(project_id AS TEXT) = ?`, pid);
  await runOptional(`UPDATE cicd_events SET project_id = NULL WHERE project_id = ?`, pid);
  await runOptional(`UPDATE cicd_runs SET project_id = NULL WHERE project_id = ?`, pid);
  await runOptional(`UPDATE pipelines SET project_id = NULL WHERE project_id = ?`, pid);
  await runOptional(`UPDATE calendar_events SET project_id = NULL WHERE project_id = ?`, pid);
  await runOptional(`UPDATE client_projects SET project_id = NULL WHERE project_id = ?`, pid);
  await runOptional(`UPDATE time_projects SET projects_id = NULL WHERE projects_id = ?`, pid);
  await runOptional(`UPDATE agentsam_workspace SET project_id = NULL WHERE project_id = ?`, pid);
}

async function handleProjectActivate(request, env, authUser, projectId, ctx) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (
    authUser.tenant_id &&
    row.tenant_id &&
    String(row.tenant_id) !== String(authUser.tenant_id) &&
    !authUser.is_superadmin
  ) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }

  const bindings = normalizeWorkspaceBindings(await resolveWorkspaceBindings(env, projectId));
  const executionWorkspaceId =
    bindings?.workspaceId ||
    (row.workspace_id != null ? String(row.workspace_id).trim() : null) ||
    null;

  let workspaceActivated = false;
  if (executionWorkspaceId && authUser?.id) {
    const isSuper = Number(authUser.is_superadmin) === 1;
    const allowed = isSuper || (await userCanAccessWorkspace(env, authUser, executionWorkspaceId));
    if (allowed) {
      // Project activate scopes execution context (KV + client sessionStorage) only.
      // auth_users.active_workspace_id changes only via WorkspaceLauncher / settings switcher.
      workspaceActivated = true;

      if (bindings?.githubRepo) {
        await env.DB.prepare(
          `UPDATE workspaces SET github_repo = ?, updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(String(bindings.githubRepo).trim(), executionWorkspaceId)
          .run()
          .catch(() => null);
      }
    }
  }

  if (env?.SESSION_CACHE && authUser?.id) {
    await env.SESSION_CACHE.put(
      `iam:active_project:${String(authUser.id)}`,
      JSON.stringify({
        project_id: String(projectId),
        project_name: String(row.name || projectId),
        execution_workspace_id: executionWorkspaceId,
        github_repo: bindings?.githubRepo ?? null,
        activated_at: Date.now(),
      }),
      { expirationTtl: 86400 * 14 },
    ).catch(() => null);
  }

  return jsonResponse({
    ok: true,
    project: {
      id: row.id,
      name: row.name,
      client_id: row.client_id ?? null,
      workspace_id: row.workspace_id ?? null,
      status: row.status ?? null,
    },
    execution_workspace_id: executionWorkspaceId,
    bindings,
    workspace_activated: workspaceActivated,
  });
}

async function handleProjectWorkContext(env, authUser, projectId) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (
    authUser.tenant_id &&
    row.tenant_id &&
    String(row.tenant_id) !== String(authUser.tenant_id) &&
    !authUser.is_superadmin
  ) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }
  const bindings = normalizeWorkspaceBindings(await resolveWorkspaceBindings(env, projectId));
  return jsonResponse({
    ok: true,
    project: {
      id: row.id,
      name: row.name,
      client_id: row.client_id ?? null,
      workspace_id: row.workspace_id ?? null,
    },
    execution_workspace_id:
      bindings?.workspaceId ||
      (row.workspace_id != null ? String(row.workspace_id).trim() : null) ||
      null,
    bindings,
  });
}

async function detectProjectDeleteBlockers(env, projectId) {
  const pid = String(projectId);
  const tables = [
    ['worker_registry', `SELECT COUNT(*) AS c FROM worker_registry WHERE project_id = ?`],
    ['project_costs', `SELECT COUNT(*) AS c FROM project_costs WHERE CAST(project_id AS TEXT) = ?`],
    ['project_metrics', `SELECT COUNT(*) AS c FROM project_metrics WHERE CAST(project_id AS TEXT) = ?`],
    ['project_goals', `SELECT COUNT(*) AS c FROM project_goals WHERE project_id = ?`],
    ['project_memory', `SELECT COUNT(*) AS c FROM project_memory WHERE project_id = ?`],
    ['client_projects', `SELECT COUNT(*) AS c FROM client_projects WHERE project_id = ?`],
  ];
  const blockers = [];
  for (const [table, sql] of tables) {
    try {
      const row = await env.DB.prepare(sql).bind(pid).first();
      const count = Number(row?.c ?? 0);
      if (count > 0) blockers.push({ table, count });
    } catch {
      /* optional */
    }
  }
  return blockers;
}

async function handleDelete(request, env, authUser, id, url, ctx) {
  const row = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (authUser.tenant_id && row.tenant_id && String(row.tenant_id) !== String(authUser.tenant_id) && !authUser.is_superadmin) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }

  await deleteProjectDependents(env, id);

  try {
    await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
  } catch (e) {
    const blockers = await detectProjectDeleteBlockers(env, id).catch(() => []);
    return jsonResponse(
      {
        ok: false,
        error: `db_delete_failed: ${e?.message || e}`,
        blockers,
        hint:
          blockers.length > 0
            ? 'Dependent rows still reference this project; retry after cleanup or archive instead.'
            : 'Foreign key constraint — contact support with project id.',
      },
      500,
    );
  }
  try {
    await env.DB.prepare(
      `DELETE FROM workspace_projects
       WHERE json_extract(metadata_json, '$.projects_table_id') = ?
          OR id = ?`,
    )
      .bind(String(id), String(id))
      .run();
  } catch {
    /* optional */
  }

  let mirror = { ok: false, skipped: true };
  try {
    mirror = await mirrorProjectWrite(env, ctx, row, {
      hardDelete: true,
      updatedBy: authUser?.id ?? null,
    });
  } catch (e) {
    mirror = { ok: false, error: e?.message || String(e) };
  }

  if (!mirror?.ok) {
    return jsonResponse({
      ok: true,
      deleted: true,
      id,
      supabase_mirror: mirror,
      warning: 'supabase_mirror_failed',
    });
  }

  return jsonResponse({ ok: true, deleted: true, id, supabase_mirror: mirror });
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 * @param {any} authUser
 */
export async function handleProjectsApi(request, url, env, authUser, ctx = null) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();
  const sub = pathLower.startsWith('/api/projects/') ? pathLower.slice('/api/projects/'.length) : '';

  if (pathLower === '/api/projects/overview' && method === 'GET') {
    return handleOverview(request, url, env, authUser);
  }

  if (pathLower === '/api/projects' && method === 'GET') {
    return handleList(env, authUser, url);
  }

  if (pathLower === '/api/projects/clients' && method === 'GET') {
    return handleClientProjectsList(env, authUser);
  }

  if (pathLower === '/api/projects' && method === 'POST') {
    return handlePost(request, env, authUser, ctx);
  }

  const seg = sub.split('/').filter(Boolean);
  if (seg.length === 2 && seg[1] === 'activate' && method === 'POST') {
    return handleProjectActivate(request, env, authUser, seg[0], ctx);
  }
  if (seg.length === 2 && seg[1] === 'work-context' && method === 'GET') {
    return handleProjectWorkContext(env, authUser, seg[0]);
  }
  if (seg.length === 2 && seg[1] === 'memory') {
    if (method === 'GET') return handleProjectMemoryGet(env, authUser, seg[0]);
    if (method === 'PATCH' || method === 'PUT') return handleProjectMemoryPatch(request, env, authUser, seg[0]);
  }
  if (seg.length === 3 && seg[1] === 'runtime-contract' && seg[2] === 'sync') {
    if (method === 'POST') return handleProjectRuntimeContractSync(request, env, authUser, seg[0]);
  }
  if (seg.length === 2 && seg[1] === 'collaborators') {
    if (method === 'GET') return handleProjectCollaboratorsGet(env, authUser, seg[0]);
    if (method === 'POST') return handleProjectCollaboratorsPost(request, env, authUser, seg[0]);
  }
  if (seg.length === 3 && seg[1] === 'collaborators' && method === 'DELETE') {
    return handleProjectCollaboratorDelete(env, authUser, seg[0], seg[2]);
  }
  if (seg.length === 2 && seg[1] === 'share' && method === 'POST') {
    return handleProjectSharePost(request, env, authUser, seg[0]);
  }
  if (seg.length === 1 && method === 'GET') {
    return handleGetOne(env, authUser, seg[0]);
  }
  if (seg.length === 1 && (method === 'PATCH' || method === 'PUT')) {
    return handlePatch(request, env, authUser, seg[0], ctx);
  }
  if (seg.length === 1 && method === 'DELETE') {
    return handleDelete(request, env, authUser, seg[0], url, ctx);
  }

  return jsonResponse({ ok: false, error: 'projects_route_not_found' }, 404);
}
