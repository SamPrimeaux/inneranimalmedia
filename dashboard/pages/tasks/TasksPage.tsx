import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  GitBranch,
  Layers3,
  ListChecks,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TimerReset,
  UserRound,
  Workflow,
} from "lucide-react";

type TaskPriority = "P0" | "P1" | "P2" | "P3";
type TaskStatus = "backlog" | "todo" | "in_progress" | "testing" | "awaiting_approval" | "complete" | "blocked";
type TaskSource = "manual" | "agent_sam" | "cursor" | "workflow" | "deploy";

type DashboardTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  project_id?: string;
  project_name?: string;
  workspace_id: string;
  tenant_id?: string;
  owner_name?: string;
  assignee_name?: string;
  due_date?: string;
  estimate_hours?: number;
  tracked_hours?: number;
  tags: string[];
  source: TaskSource;
  approval_required?: boolean;
  blocked_reason?: string;
  agentsam_todo_id?: string;
  workflow_run_id?: string;
  created_at: string;
  updated_at: string;
};

type ColumnDef = {
  id: TaskStatus;
  title: string;
  hint: string;
};

const columns: ColumnDef[] = [
  { id: "backlog", title: "Backlog", hint: "Captured work" },
  { id: "todo", title: "To Do", hint: "Ready to start" },
  { id: "in_progress", title: "In Progress", hint: "Actively moving" },
  { id: "testing", title: "Testing", hint: "Validate before merge" },
  { id: "awaiting_approval", title: "Awaiting Approval", hint: "Needs owner gate" },
  { id: "complete", title: "Complete", hint: "Closed this cycle" },
];

const initialTasks: DashboardTask[] = [
  {
    id: "task_dashboard_projects",
    title: "Finalize Project Management page install",
    description: "Verify route, shell rendering, R2 upload path, and production bundle visibility for /dashboard/projects.",
    status: "testing",
    priority: "P0",
    project_name: "Agent Sam Dashboard",
    workspace_id: "ws_inneranimalmedia",
    owner_name: "Sam",
    assignee_name: "Agent Sam",
    due_date: "Today",
    estimate_hours: 2,
    tracked_hours: 0.8,
    tags: ["dashboard", "vite", "r2"],
    source: "manual",
    workflow_run_id: "wf_projects_page_v1",
    created_at: "2026-05-10T15:00:00Z",
    updated_at: "2026-05-10T20:00:00Z",
  },
  {
    id: "task_overview_bundle",
    title: "Ship Overview bundle endpoint + modular panels",
    description: "Confirm /api/overview/dashboard-bundle responds and new overview panels are loaded by the live dashboard bundle.",
    status: "in_progress",
    priority: "P0",
    project_name: "Agent Sam Analytics",
    workspace_id: "ws_inneranimalmedia",
    owner_name: "Sam",
    assignee_name: "Cursor",
    due_date: "Today",
    estimate_hours: 4,
    tracked_hours: 2.4,
    tags: ["overview", "analytics", "api"],
    source: "cursor",
    agentsam_todo_id: "todo_overview_modularization",
    workflow_run_id: "wf_overview_bundle",
    created_at: "2026-05-10T14:00:00Z",
    updated_at: "2026-05-10T20:10:00Z",
  },
  {
    id: "task_r2_bundle_path",
    title: "Resolve stale frontend deploy path",
    description: "Identify whether production loads static/dashboard/agent or static/dashboard/app and make deploy scripts update the correct bundle every time.",
    status: "blocked",
    priority: "P0",
    project_name: "Dashboard Infrastructure",
    workspace_id: "ws_inneranimalmedia",
    owner_name: "Sam",
    assignee_name: "Agent Sam",
    due_date: "Today",
    estimate_hours: 3,
    tracked_hours: 1.1,
    tags: ["cloudflare", "r2", "deploy"],
    source: "deploy",
    blocked_reason: "Live browser appears to load stale shell/chunks after successful Worker deploys.",
    created_at: "2026-05-10T13:00:00Z",
    updated_at: "2026-05-10T20:12:00Z",
  },
  {
    id: "task_kanban_api",
    title: "Create Kanban API over existing D1 tables",
    description: "Use kanban_boards, kanban_columns, and kanban_tasks with tenant/workspace authorization. Do not create duplicate schema.",
    status: "backlog",
    priority: "P1",
    project_name: "Agent Sam Task System",
    workspace_id: "ws_inneranimalmedia",
    owner_name: "Sam",
    assignee_name: "Agent Sam",
    due_date: "May 12",
    estimate_hours: 5,
    tracked_hours: 0,
    tags: ["d1", "kanban", "workspace"],
    source: "workflow",
    agentsam_todo_id: "todo_kanban_api_v1",
    created_at: "2026-05-10T12:00:00Z",
    updated_at: "2026-05-10T19:00:00Z",
  },
  {
    id: "task_pintest_v3",
    title: "Register observability pintest v3",
    description: "Add repeatable script and agentsam_scripts row for 8/8 observability table validation.",
    status: "awaiting_approval",
    priority: "P1",
    project_name: "Agent Sam Observability",
    workspace_id: "ws_inneranimalmedia",
    owner_name: "Sam",
    assignee_name: "Cursor",
    due_date: "Tomorrow",
    estimate_hours: 1,
    tracked_hours: 0.4,
    tags: ["pintest", "observability", "scripts"],
    source: "agent_sam",
    approval_required: true,
    agentsam_todo_id: "todo_observability_pintest_v3",
    created_at: "2026-05-10T16:00:00Z",
    updated_at: "2026-05-10T20:09:00Z",
  },
  {
    id: "task_cpas_board_demo",
    title: "Polish CPAS board-demo dashboard",
    description: "Make donation, animal, adoption, and CMS demo panels feel board-ready.",
    status: "todo",
    priority: "P0",
    project_name: "Companions of CPAS",
    workspace_id: "ws_inneranimalmedia",
    owner_name: "Sam",
    assignee_name: "Sam",
    due_date: "Tomorrow",
    estimate_hours: 6,
    tracked_hours: 1.5,
    tags: ["client", "cms", "demo"],
    source: "manual",
    created_at: "2026-05-10T11:00:00Z",
    updated_at: "2026-05-10T18:00:00Z",
  },
  {
    id: "task_reingest_skip",
    title: "Skip unchanged document embeddings",
    description: "Avoid paying for Workers AI embedding calls when content_hash is unchanged.",
    status: "complete",
    priority: "P1",
    project_name: "Knowledge Pipeline",
    workspace_id: "ws_inneranimalmedia",
    owner_name: "Sam",
    assignee_name: "Agent Sam",
    due_date: "Today",
    estimate_hours: 1,
    tracked_hours: 0.7,
    tags: ["performance", "embeddings", "cost"],
    source: "workflow",
    workflow_run_id: "wf_reingest_skip_v1",
    created_at: "2026-05-10T15:30:00Z",
    updated_at: "2026-05-10T20:00:00Z",
  },
];

const statusLabel: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  testing: "Testing",
  awaiting_approval: "Awaiting Approval",
  complete: "Complete",
  blocked: "Blocked",
};

const priorityClass: Record<TaskPriority, string> = {
  P0: "border-rose-400/35 bg-rose-400/10 text-rose-200",
  P1: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  P2: "border-cyan-400/35 bg-cyan-400/10 text-cyan-200",
  P3: "border-slate-400/25 bg-slate-400/10 text-slate-300",
};

const sourceClass: Record<TaskSource, string> = {
  manual: "bg-slate-400/15 text-slate-300",
  agent_sam: "bg-cyan-400/15 text-cyan-200",
  cursor: "bg-violet-400/15 text-violet-200",
  workflow: "bg-emerald-400/15 text-emerald-200",
  deploy: "bg-amber-400/15 text-amber-200",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function statusTone(status: TaskStatus) {
  if (status === "complete") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (status === "blocked") return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  if (status === "awaiting_approval") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  if (status === "testing") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  if (status === "in_progress") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function CardShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-white/10 bg-slate-950/48 shadow-[0_18px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl", className)}>
      {children}
    </section>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: React.ElementType; label: string; value: string; sub: string; tone: string }) {
  return (
    <CardShell className="relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{sub}</div>
        </div>
        <div className={cx("rounded-xl border p-2", tone)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </CardShell>
  );
}

function TaskCard({
  task,
  onMove,
  selected,
  onSelect,
}: {
  task: DashboardTask;
  onMove: (taskId: string, status: TaskStatus) => void;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        "group w-full rounded-2xl border bg-white/[0.035] p-3 text-left transition duration-150 hover:-translate-y-0.5 hover:bg-white/[0.06]",
        selected ? "border-cyan-300/35 shadow-[0_0_0_1px_rgba(34,211,238,0.16)]" : "border-white/10",
        task.blocked_reason ? "ring-1 ring-rose-400/20" : "",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cx("rounded-full border px-2 py-0.5 text-[10px] font-semibold", priorityClass[task.priority])}>
              {task.priority}
            </span>
            <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-medium", sourceClass[task.source])}>
              {task.source.replace("_", " ")}
            </span>
            {task.approval_required ? (
              <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                approval
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-100">{task.title}</h3>
        </div>
        <MoreHorizontal className="mt-1 h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-300" />
      </div>

      <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{task.description}</p>

      {task.blocked_reason ? (
        <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-2 text-xs leading-5 text-rose-100">
          <span className="font-semibold">Blocked:</span> {task.blocked_reason}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {task.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-400">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-slate-400">
            <UserRound className="h-3 w-3" />
            <span className="truncate">{task.assignee_name || "Unassigned"}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 text-slate-400">
          <CalendarDays className="h-3 w-3" />
          <span>{task.due_date || "No due date"}</span>
        </div>
        <div className="flex items-center gap-1">
          <TimerReset className="h-3 w-3" />
          <span>{task.tracked_hours ?? 0}h / {task.estimate_hours ?? 0}h</span>
        </div>
        <div className="truncate text-right">{task.project_name || "No project"}</div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <select
          value={task.status}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onMove(task.id, event.target.value as TaskStatus)}
          className="h-8 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-2 text-xs text-slate-300 outline-none focus:border-cyan-300/40"
        >
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              Move to {column.title}
            </option>
          ))}
          <option value="blocked">Move to Blocked</option>
        </select>
      </div>
    </button>
  );
}

function KanbanColumn({
  column,
  tasks,
  selectedTaskId,
  onSelectTask,
  onMove,
}: {
  column: ColumnDef;
  tasks: DashboardTask[];
  selectedTaskId: string | null;
  onSelectTask: (task: DashboardTask) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
}) {
  return (
    <div className="flex max-h-[calc(100vh-320px)] min-h-[560px] w-[320px] shrink-0 flex-col rounded-2xl border border-white/10 bg-white/[0.035]">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100">{column.title}</h2>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">{tasks.length}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{column.hint}</p>
        </div>
        <button className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-400 hover:text-white">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            selected={selectedTaskId === task.id}
            onSelect={() => onSelectTask(task)}
            onMove={onMove}
          />
        ))}
        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">
            No tasks in {column.title}.
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 p-3">
        <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06]">
          <Plus className="h-3.5 w-3.5" />
          Add task
        </button>
      </div>
    </div>
  );
}

function DetailPanel({ task }: { task: DashboardTask | null }) {
  if (!task) {
    return (
      <CardShell className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Sparkles className="h-4 w-4 text-cyan-300" />
          Select a task
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Click any card to inspect owner, linked Agent Sam context, workflow run, blocker, and execution metadata.
        </p>
      </CardShell>
    );
  }

  return (
    <CardShell className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Task details</div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{task.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{task.description}</p>
        </div>
        <span className={cx("rounded-full border px-2.5 py-1 text-xs font-medium", statusTone(task.status))}>
          {statusLabel[task.status]}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Assignee</div>
          <div className="mt-1 text-sm font-medium text-slate-100">{task.assignee_name || "Unassigned"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Agent Todo</div>
          <div className="mt-1 truncate text-sm font-medium text-slate-100">{task.agentsam_todo_id || "Not linked"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Workflow Run</div>
          <div className="mt-1 truncate text-sm font-medium text-slate-100">{task.workflow_run_id || "Not linked"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Source</div>
          <div className="mt-1 text-sm font-medium text-slate-100">{task.source.replace("_", " ")}</div>
        </div>
      </div>
    </CardShell>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<DashboardTask[]>(initialTasks);
  const [query, setQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTasks[0]?.id ?? null);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) =>
      [
        task.title,
        task.description,
        task.project_name,
        task.owner_name,
        task.assignee_name,
        task.priority,
        task.status,
        task.source,
        task.agentsam_todo_id,
        task.workflow_run_id,
        ...task.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [tasks, query]);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  const counts = useMemo(() => {
    const total = tasks.length;
    const blocked = tasks.filter((task) => task.status === "blocked" || task.blocked_reason).length;
    const inProgress = tasks.filter((task) => task.status === "in_progress").length;
    const approval = tasks.filter((task) => task.status === "awaiting_approval" || task.approval_required).length;
    const complete = tasks.filter((task) => task.status === "complete").length;
    const agentLinked = tasks.filter((task) => task.agentsam_todo_id || task.workflow_run_id || task.source === "agent_sam").length;
    return { total, blocked, inProgress, approval, complete, agentLinked };
  }, [tasks]);

  function moveTask(taskId: string, status: TaskStatus) {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status, updated_at: new Date().toISOString() } : task)));
  }

  function selectTask(task: DashboardTask) {
    setSelectedTaskId(task.id);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden text-slate-100">
      <div className="shrink-0 border-b border-white/10 bg-[var(--dashboard-canvas)]/95 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
              <Layers3 className="h-4 w-4" />
              Workspace Kanban
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Tasks</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Workspace task board, approvals, blockers, and Agent Sam execution work.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks, tags, projects..."
                className="h-9 w-72 rounded-xl border border-white/10 bg-slate-950/70 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/40"
              />
            </div>
            <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300 hover:bg-white/[0.07]">
              <Filter className="h-4 w-4" />
              Filter
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300 hover:bg-white/[0.07]">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 hover:bg-cyan-400/15">
              <Plus className="h-4 w-4" />
              New Task
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Kpi icon={ListChecks} label="Total Tasks" value={String(counts.total)} sub="visible cards" tone="border-cyan-300/20 bg-cyan-400/10 text-cyan-200" />
          <Kpi icon={Workflow} label="In Progress" value={String(counts.inProgress)} sub="actively moving" tone="border-emerald-300/20 bg-emerald-400/10 text-emerald-200" />
          <Kpi icon={AlertTriangle} label="Blocked" value={String(counts.blocked)} sub="needs decision" tone="border-rose-300/20 bg-rose-400/10 text-rose-200" />
          <Kpi icon={ShieldCheck} label="Approvals" value={String(counts.approval)} sub="owner gates" tone="border-amber-300/20 bg-amber-400/10 text-amber-200" />
          <Kpi icon={CheckCircle2} label="Completed" value={String(counts.complete)} sub="this cycle" tone="border-teal-300/20 bg-teal-400/10 text-teal-200" />
          <Kpi icon={Bot} label="Agent Linked" value={String(counts.agentLinked)} sub="todo/workflow refs" tone="border-violet-300/20 bg-violet-400/10 text-violet-200" />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => {
            const colTasks = filteredTasks.filter((task) => task.status === column.id);
            return (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={colTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={selectTask}
                onMove={moveTask}
              />
            );
          })}

          <div className="flex max-h-[calc(100vh-320px)] min-h-[560px] w-[320px] shrink-0 flex-col rounded-2xl border border-rose-400/20 bg-rose-400/[0.035]">
            <div className="flex items-start justify-between gap-3 border-b border-rose-400/15 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-rose-100">Blocked</h2>
                  <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-xs text-rose-100">
                    {filteredTasks.filter((task) => task.status === "blocked").length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-rose-200/60">Requires action</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-rose-300" />
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {filteredTasks.filter((task) => task.status === "blocked").map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  selected={selectedTaskId === task.id}
                  onSelect={() => selectTask(task)}
                  onMove={moveTask}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2 grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <DetailPanel task={selectedTask} />
          </div>
          <CardShell className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Execution queue</div>
                <p className="mt-1 text-xs text-slate-500">Next high-priority work surfaced from the board.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-cyan-300" />
            </div>
            <div className="mt-4 space-y-3">
              {tasks
                .filter((task) => task.priority === "P0" && task.status !== "complete")
                .slice(0, 4)
                .map((task) => (
                  <button
                    key={task.id}
                    onClick={() => selectTask(task)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-100">{task.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <Clock3 className="h-3 w-3" />
                        {task.due_date || "No due date"}
                        <GitBranch className="ml-1 h-3 w-3" />
                        {statusLabel[task.status]}
                      </div>
                    </div>
                    <span className={cx("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", priorityClass[task.priority])}>
                      {task.priority}
                    </span>
                  </button>
                ))}
            </div>
          </CardShell>
        </div>
      </div>
    </div>
  );
}
