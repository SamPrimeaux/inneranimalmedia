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
