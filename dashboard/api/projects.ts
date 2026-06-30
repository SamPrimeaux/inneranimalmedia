export type ProjectKpis = {
  active_projects: number;
  open_tasks: number;
  blocked: number;
  avg_health: number;
  budget_burn: number;
  budget_allocated: number;
  this_week_hours: number;
};

export type OverviewProject = {
  id: string;
  name: string;
  client: string;
  client_name: string;
  owner: string;
  stage: string;
  description: string;
  status: string;
  status_raw: string;
  priority: string;
  priority_num: number;
  project_type: string;
  progress: number;
  health: number;
  budgetUsed: number;
  budgetTotal: number;
  budget_allocated_workspace: number;
  dueDate: string;
  lastDeploy: string;
  activeTasks: number;
  blockedTasks: number;
  completedTasks: number;
  totalTasks: number;
  openIssueCount: number;
  tags: string[];
  workspace_id: string | null;
  tenant_id: string | null;
  cover_image_url?: string | null;
  chat_project_id?: string | null;
};

export type OverviewMilestone = {
  id: string;
  projectId: string;
  title: string;
  date: string;
  status: string;
};

export type WorkloadSlice = { name: string; value: number };
export type StatusCount = { status: string; count: number };
export type VelocityDay = { day: string; completed: number; added: number; blocked: number };
export type BurnDay = { date: string; planned: number; actual: number };

export type PriorityTask = {
  id: string;
  title: string;
  projectId: string;
  owner: string;
  status: string;
  priority: string;
  due: string;
  estimateHours: number;
};

export type ProjectsOverviewResponse = {
  ok: boolean;
  kpis: ProjectKpis;
  projects: OverviewProject[];
  milestones: OverviewMilestone[];
  workload_mix: WorkloadSlice[];
  status_counts: StatusCount[];
  velocity_week?: VelocityDay[];
  burn_week?: BurnDay[];
  priority_tasks?: PriorityTask[];
  updated_at: string;
  error?: string;
};

export type CreateProjectPayload = {
  name: string;
  description?: string;
  client_name?: string;
  project_type?: string;
  status?: string;
  priority?: number;
  workspace_id: string;
  budget_usd?: number;
  tags?: string[];
  domain?: string;
  worker_id?: string;
  d1_databases?: string;
  r2_buckets?: string;
  target_launch_date?: string;
  accessibility_target?: string;
  performance_budget?: string;
};

function qs(workspaceId?: string | null) {
  if (!workspaceId?.trim()) return "";
  return `?workspace_id=${encodeURIComponent(workspaceId.trim())}`;
}

export type ProjectListRow = {
  id: string;
  name: string;
  description?: string | null;
  client_name?: string | null;
  status?: string | null;
  priority?: number | null;
  project_type?: string | null;
  workspace_id?: string | null;
  tenant_id?: string | null;
  tags_json?: string | null;
  metadata_json?: string | null;
  cover_image_url?: string | null;
  chat_project_id?: string | null;
  launch_date?: string | null;
  estimated_completion_date?: number | null;
};

function priorityToLabel(n: number) {
  const p = Number(n) || 0;
  if (p >= 80) return "P0";
  if (p >= 60) return "P1";
  if (p >= 40) return "P2";
  return "P3";
}

function mapDbStatusToUi(status: string | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (s === "blocked" || s === "maintenance") return "blocked";
  if (s === "complete" || s === "archived") return "complete";
  if (s === "review" || s === "staging") return "review";
  if (s === "planning" || s === "discovery") return "planning";
  if (s === "development" || s === "active" || s === "production") return "active";
  return "planning";
}

function safeJsonArray(text: unknown, fallback: string[] = []) {
  try {
    const v = JSON.parse(String(text || "null"));
    return Array.isArray(v) ? v.map(String) : fallback;
  } catch {
    return fallback;
  }
}

/** Lightweight list row → grid card shape (no KPI/plan-task fan-out). */
export function mapListRowToOverview(row: ProjectListRow): OverviewProject {
  const tags = safeJsonArray(row.tags_json, []);
  const dueTs = row.estimated_completion_date;
  return {
    id: String(row.id),
    name: String(row.name || "Untitled"),
    client: row.client_name || "",
    client_name: row.client_name || "",
    owner: "",
    stage: row.description ? String(row.description).slice(0, 120) : "",
    description: row.description || "",
    status: mapDbStatusToUi(row.status),
    status_raw: row.status || "",
    priority: priorityToLabel(Number(row.priority) || 0),
    priority_num: Number(row.priority) || 0,
    project_type: row.project_type || "",
    progress: 0,
    health: 0,
    budgetUsed: 0,
    budgetTotal: 1,
    budget_allocated_workspace: 0,
    dueDate: dueTs
      ? new Date(Number(dueTs) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : row.launch_date || "—",
    lastDeploy: "—",
    activeTasks: 0,
    blockedTasks: 0,
    completedTasks: 0,
    totalTasks: 0,
    openIssueCount: 0,
    tags,
    workspace_id: row.workspace_id || null,
    tenant_id: row.tenant_id || null,
    cover_image_url: row.cover_image_url || null,
    chat_project_id: row.chat_project_id || null,
  };
}

export async function fetchProjectsList(
  workspaceId?: string | null,
): Promise<{ ok: boolean; projects: OverviewProject[]; error?: string }> {
  const r = await fetch(`/api/projects${qs(workspaceId)}`, { credentials: "same-origin" });
  const j = (await r.json()) as { ok?: boolean; success?: boolean; projects?: ProjectListRow[]; error?: string };
  if (!r.ok) return { ok: false, projects: [], error: j.error || `HTTP ${r.status}` };
  const rows = Array.isArray(j.projects) ? j.projects : [];
  return { ok: true, projects: rows.map(mapListRowToOverview) };
}

export async function fetchProjectsOverview(workspaceId?: string | null): Promise<ProjectsOverviewResponse> {
  const r = await fetch(`/api/projects/overview${qs(workspaceId)}`, { credentials: "same-origin" });
  const j = (await r.json()) as ProjectsOverviewResponse;
  if (!r.ok) return { ...j, ok: false, error: j.error || `HTTP ${r.status}` };
  return j;
}

export async function createProject(payload: CreateProjectPayload): Promise<{ ok: boolean; project?: unknown; error?: string }> {
  const r = await fetch("/api/projects", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await r.json()) as { ok: boolean; project?: unknown; error?: string };
  if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
  return j;
}

export async function updateProject(
  id: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; project?: unknown; error?: string }> {
  const r = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await r.json()) as { ok: boolean; project?: unknown; error?: string };
  if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
  return j;
}

/** Soft-delete (archive) by default; pass hard=true to permanently remove. */
export async function deleteProject(
  id: string,
  opts?: { hard?: boolean },
): Promise<{ ok: boolean; error?: string; archived?: boolean; deleted?: boolean }> {
  const qs = opts?.hard ? "?hard=1" : "";
  const r = await fetch(`/api/projects/${encodeURIComponent(id)}${qs}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const j = (await r.json()) as { ok: boolean; error?: string; archived?: boolean; deleted?: boolean };
  if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
  return j;
}
