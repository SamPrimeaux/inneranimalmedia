import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Filter,
  Flame,
  GitBranch,
  LayoutGrid,
  ListChecks,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Users,
  Workflow,
} from "lucide-react";
import type { OverviewProject, PriorityTask, ProjectsOverviewResponse } from "../../api/projects";
import { fetchProjectsOverview } from "../../api/projects";
import NewProjectModal from "../../components/projects/NewProjectModal";

const chartTooltip = {
  background: "var(--dashboard-card)",
  border: "1px solid var(--dashboard-border)",
  borderRadius: 12,
  color: "var(--dashboard-text)",
} as const;

type ProjectStatusUi = "active" | "blocked" | "review" | "complete" | "planning";
type TaskStatusUi = "todo" | "in_progress" | "review" | "blocked" | "done";
type PriorityUi = "P0" | "P1" | "P2" | "P3";

const statusLabels: Record<ProjectStatusUi, string> = {
  active: "Active",
  blocked: "Blocked",
  review: "Review",
  complete: "Complete",
  planning: "Planning",
};

const taskLabels: Record<TaskStatusUi, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function classNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function PriorityPill({ priority }: { priority: PriorityUi }) {
  return (
    <span
      className={classNames(
        "rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        priority === "P0" && "border-rose-400/35 bg-rose-400/10 text-rose-200",
        priority === "P1" && "border-amber-400/35 bg-amber-400/10 text-amber-200",
        priority === "P2" && "border-cyan-400/35 bg-cyan-400/10 text-cyan-200",
        priority === "P3" && "border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] text-[var(--dashboard-muted)]",
      )}
    >
      {priority}
    </span>
  );
}

function StatusPill({ status }: { status: ProjectStatusUi | TaskStatusUi }) {
  const label = status in statusLabels ? statusLabels[status as ProjectStatusUi] : taskLabels[status as TaskStatusUi];
  return (
    <span
      className={classNames(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium",
        status === "active" || status === "in_progress"
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          : "",
        status === "review" ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "",
        status === "blocked" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "",
        status === "complete" || status === "done" ? "border-teal-400/30 bg-teal-400/10 text-teal-200" : "",
        status === "planning" || status === "todo" ? "border-violet-400/30 bg-violet-400/10 text-violet-200" : "",
      )}
    >
      {label}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={classNames(
        "rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-card)]/90 shadow-[0_18px_70px_rgba(0,0,0,0.18)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </section>
  );
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 pt-5">
      <h2 className="text-sm font-semibold tracking-tight text-[var(--dashboard-text)]">{title}</h2>
      {action ? (
        <button className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200">
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sublabel: string;
  tone: "cyan" | "emerald" | "violet" | "amber" | "rose";
}) {
  const toneClass = {
    cyan: "from-cyan-400/20 to-blue-500/5 text-cyan-200 border-cyan-300/20",
    emerald: "from-emerald-400/20 to-teal-500/5 text-emerald-200 border-emerald-300/20",
    violet: "from-violet-400/20 to-fuchsia-500/5 text-violet-200 border-violet-300/20",
    amber: "from-amber-400/20 to-orange-500/5 text-amber-200 border-amber-300/20",
    rose: "from-rose-400/20 to-red-500/5 text-rose-200 border-rose-300/20",
  }[tone];

  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--dashboard-border)] to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--dashboard-muted)]">{label}</div>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--dashboard-text)]">{value}</div>
          <div className="mt-1 text-xs text-[var(--dashboard-muted)]">{sublabel}</div>
        </div>
        <div className={classNames("rounded-xl border bg-gradient-to-br p-2", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function ProjectCard({ project }: { project: OverviewProject }) {
  const st = project.status as ProjectStatusUi;
  const pr = project.priority as PriorityUi;
  const burn = project.budgetTotal > 0 ? Math.round((project.budgetUsed / project.budgetTotal) * 100) : 0;
  return (
    <Card className="group overflow-hidden p-4 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-[var(--dashboard-panel)]/80">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityPill priority={pr} />
            <StatusPill status={st} />
          </div>
          <h3 className="mt-3 truncate text-base font-semibold text-[var(--dashboard-text)]">{project.name}</h3>
          <p className="mt-1 truncate text-xs text-[var(--dashboard-muted)]">
            {project.client || "—"} · {project.project_type || "project"}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-[var(--dashboard-border)] p-2 text-[var(--dashboard-muted)] opacity-60 hover:opacity-100"
          aria-label="More"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-[var(--dashboard-muted)]">
        <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 py-2">
          <div className="text-sm font-semibold text-[var(--dashboard-text)]">{project.health}%</div>
          <div>Health</div>
        </div>
        <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 py-2">
          <div className="text-sm font-semibold text-[var(--dashboard-text)]">{project.activeTasks}</div>
          <div>Open tasks</div>
        </div>
        <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 py-2">
          <div className="text-sm font-semibold text-rose-200">{project.blockedTasks}</div>
          <div>Blocked</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-[var(--dashboard-muted)]">
            <span>Delivery</span>
            <span>{project.progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--dashboard-panel)]">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${project.progress}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-[var(--dashboard-muted)]">
            <span>Budget (tokens)</span>
            <span>
              {project.budgetUsed.toLocaleString()} / {project.budgetTotal.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--dashboard-panel)]">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-400" style={{ width: `${Math.min(burn, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(project.tags || []).map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/50 px-2 py-1 text-[11px] text-[var(--dashboard-muted)]"
          >
            {tag}
          </span>
        ))}
      </div>
    </Card>
  );
}

function TaskRow({ task, projectName }: { task: PriorityTask; projectName: string }) {
  const st = (task.status === "in progress" ? "in_progress" : task.status) as TaskStatusUi;
  const pr = task.priority as PriorityUi;
  return (
    <div className="grid grid-cols-12 items-center gap-3 border-b border-[var(--dashboard-border)]/60 px-5 py-3 last:border-b-0 hover:bg-[var(--dashboard-panel)]/40">
      <div className="col-span-5 min-w-0">
        <div className="truncate text-sm font-medium text-[var(--dashboard-text)]">{task.title}</div>
        <div className="mt-1 truncate text-xs text-[var(--dashboard-muted)]">{projectName}</div>
      </div>
      <div className="col-span-2 text-xs text-[var(--dashboard-muted)]">{task.owner}</div>
      <div className="col-span-2">
        <StatusPill status={st} />
      </div>
      <div className="col-span-1">
        <PriorityPill priority={pr} />
      </div>
      <div className="col-span-1 text-xs text-[var(--dashboard-muted)]">{task.due}</div>
      <div className="col-span-1 text-right text-xs text-[var(--dashboard-muted)]">{task.estimateHours.toFixed(1)}h</div>
    </div>
  );
}

const PIE_COLORS = ["#22d3ee", "#8b5cf6", "#10b981", "#f59e0b", "#fb7185"];

function emptyVelocity(): { day: string; completed: number; added: number; blocked: number }[] {
  const out = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({ day: d.toLocaleDateString("en-US", { weekday: "short" }), completed: 0, added: 0, blocked: 0 });
  }
  return out;
}

function emptyBurn(): { date: string; planned: number; actual: number }[] {
  const out = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({ date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), planned: 0, actual: 0 });
  }
  return out;
}

export default function ProjectManagement() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatusUi | "all">("all");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [overview, setOverview] = useState<ProjectsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refreshOverview = useCallback(async (ws: string | null) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchProjectsOverview(ws);
      if (!data.ok) {
        setLoadError(data.error || "Failed to load projects overview.");
        setOverview(null);
      } else {
        setOverview(data);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let ws: string | null = null;
      try {
        const r = await fetch("/api/settings/workspaces", { credentials: "same-origin" });
        const j = (await r.json()) as { current?: string | null };
        ws = j.current?.trim() || null;
      } catch {
        ws = null;
      }
      if (cancelled) return;
      setWorkspaceId(ws);
      await refreshOverview(ws);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshOverview]);

  const projects = overview?.projects || [];
  const kpis = overview?.kpis;
  const milestones = overview?.milestones || [];
  const workloadData = overview?.workload_mix?.length ? overview.workload_mix : [{ name: "No plan tasks", value: 100 }];
  const velocityData = overview?.velocity_week?.length ? overview.velocity_week : emptyVelocity();
  const burnData = overview?.burn_week?.length ? overview.burn_week : emptyBurn();
  const tasks = overview?.priority_tasks || [];

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesQuery = [project.name, project.client, project.stage, project.owner, ...(project.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [projects, query, statusFilter]);

  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);

  const blockedPortfolio = useMemo(() => projects.reduce((s, p) => s + p.blockedTasks, 0), [projects]);

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-[var(--dashboard-bg)] text-[var(--dashboard-text)]">
      <div className="mx-auto w-full max-w-[1680px] px-6 py-6 pb-24">
        {loadError ? (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{loadError}</div>
        ) : null}
        {loading && !overview ? (
          <div className="mb-4 text-sm text-[var(--dashboard-muted)]">Loading portfolio…</div>
        ) : null}

        <div className="space-y-5">
          <header className="flex flex-col gap-4 rounded-3xl border border-[var(--dashboard-border)] bg-[var(--dashboard-card)]/80 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.2)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                <Sparkles className="h-4 w-4" />
                Project Command Center
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--dashboard-text)] md:text-4xl">Project Management</h1>
              <p className="mt-2 max-w-3xl text-sm text-[var(--dashboard-muted)]">
                Portfolio health, plan tasks, usage burn, and milestones — backed by D1 via{" "}
                <code className="rounded bg-[var(--dashboard-panel)] px-1">/api/projects/overview</code>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 px-3 py-2 text-sm text-[var(--dashboard-text)] hover:bg-[var(--dashboard-panel)]"
              >
                <CalendarDays className="h-4 w-4" />
                Last 14 Days
                <ChevronDown className="h-4 w-4 text-[var(--dashboard-muted)]" />
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/15"
              >
                <Plus className="h-4 w-4" />
                New Project
              </button>
            </div>
          </header>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <KpiCard
              icon={Briefcase}
              label="Active Projects"
              value={kpis ? String(kpis.active_projects) : "—"}
              sublabel="Non-complete in scope"
              tone="cyan"
            />
            <KpiCard
              icon={ListChecks}
              label="Open Tasks"
              value={kpis ? String(kpis.open_tasks) : "—"}
              sublabel="Plan tasks in flight"
              tone="emerald"
            />
            <KpiCard
              icon={AlertTriangle}
              label="Blocked"
              value={kpis ? String(kpis.blocked) : "—"}
              sublabel="Across linked plans"
              tone="rose"
            />
            <KpiCard
              icon={ShieldCheck}
              label="Avg Health"
              value={kpis ? `${kpis.avg_health}%` : "—"}
              sublabel="Quality + blockers"
              tone="violet"
            />
            <KpiCard
              icon={Flame}
              label="Budget Burn"
              value={kpis ? money(kpis.budget_burn) : "—"}
              sublabel={kpis ? `${money(kpis.budget_allocated)} allocated (workspace)` : ""}
              tone="amber"
            />
            <KpiCard
              icon={TimerReset}
              label="This Week"
              value={kpis ? `${kpis.this_week_hours}h` : "—"}
              sublabel="Completed task minutes"
              tone="cyan"
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-12">
            <Card className="xl:col-span-8">
              <div className="flex flex-col gap-3 px-5 pt-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--dashboard-text)]">Portfolio Overview</h2>
                  <p className="mt-1 text-xs text-[var(--dashboard-muted)]">
                    {overview?.updated_at ? `Updated ${new Date(overview.updated_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--dashboard-muted)]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search projects..."
                      className="h-9 w-64 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] pl-9 pr-3 text-sm text-[var(--dashboard-text)] outline-none placeholder:text-[var(--dashboard-muted)] focus:border-cyan-300/40"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === "all" ? "active" : "all")}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 px-3 text-sm text-[var(--dashboard-muted)] hover:bg-[var(--dashboard-panel)]"
                  >
                    <Filter className="h-4 w-4" />
                    {statusFilter === "all" ? "All Status" : statusLabels[statusFilter]}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                {filteredProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
                {!filteredProjects.length && !loading ? (
                  <div className="col-span-2 py-8 text-center text-sm text-[var(--dashboard-muted)]">No projects in this workspace filter.</div>
                ) : null}
              </div>
            </Card>

            <div className="grid gap-5 xl:col-span-4">
              <Card>
                <SectionTitle title="Workload Mix" action="Balance" />
                <div className="grid grid-cols-2 gap-2 p-5">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={workloadData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={76} paddingAngle={3}>
                          {workloadData.map((_, index) => (
                            <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTooltip} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 self-center">
                    {workloadData.map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 text-[var(--dashboard-muted)]">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                          {item.name}
                        </div>
                        <span className="font-semibold text-[var(--dashboard-text)]">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card>
                <SectionTitle title="Milestone Timeline" action="View Roadmap" />
                <div className="space-y-4 p-5">
                  {milestones.map((milestone) => (
                    <div key={milestone.id} className="flex gap-3">
                      <div className="relative flex flex-col items-center">
                        <span
                          className={classNames(
                            "z-10 h-3 w-3 rounded-full ring-4 ring-[var(--dashboard-bg)]",
                            milestone.status === "done" && "bg-emerald-400",
                            milestone.status === "current" && "bg-cyan-400",
                            milestone.status === "upcoming" && "bg-violet-400",
                            milestone.status === "risk" && "bg-rose-400",
                          )}
                        />
                        <span className="mt-1 h-full w-px bg-[var(--dashboard-border)]" />
                      </div>
                      <div className="min-w-0 pb-1">
                        <div className="text-sm font-medium text-[var(--dashboard-text)]">{milestone.title}</div>
                        <div className="mt-1 text-xs text-[var(--dashboard-muted)]">
                          {projectById[milestone.projectId] || "Project"} • {milestone.date}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!milestones.length ? (
                    <div className="text-sm text-[var(--dashboard-muted)]">No project goals in scope.</div>
                  ) : null}
                </div>
              </Card>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-12">
            <Card className="xl:col-span-4">
              <SectionTitle title="Sprint Velocity" action="Inspect" />
              <div className="h-72 p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={velocityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="day" stroke="var(--dashboard-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--dashboard-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltip} />
                    <Bar dataKey="completed" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="added" stackId="a" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="blocked" stackId="a" fill="#fb7185" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="xl:col-span-4">
              <SectionTitle title="Usage Burndown (30d cost)" action="Open Sprint" />
              <div className="h-72 p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={burnData}>
                    <defs>
                      <linearGradient id="planned" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="actual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="date" stroke="var(--dashboard-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--dashboard-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltip} />
                    <Area type="monotone" dataKey="planned" stroke="#8b5cf6" fill="url(#planned)" strokeWidth={2} />
                    <Area type="monotone" dataKey="actual" stroke="#22d3ee" fill="url(#actual)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="xl:col-span-4">
              <SectionTitle title="Execution Health" />
              <div className="grid gap-3 p-5">
                {[
                  {
                    icon: CheckCircle2,
                    label: "Deploy Ready",
                    value: `${Math.max(0, projects.length - blockedPortfolio)} / ${projects.length || 1}`,
                    tone: "text-emerald-300",
                    bar: projects.length ? Math.round((1 - blockedPortfolio / (projects.length * 4)) * 100) : 0,
                  },
                  {
                    icon: Workflow,
                    label: "Avg portfolio health",
                    value: kpis ? `${kpis.avg_health}%` : "—",
                    tone: "text-cyan-300",
                    bar: kpis?.avg_health ?? 0,
                  },
                  {
                    icon: GitBranch,
                    label: "Distinct statuses",
                    value: String(overview?.status_counts?.length || 0),
                    tone: "text-violet-300",
                    bar: 40,
                  },
                  {
                    icon: Clock3,
                    label: "Open tasks",
                    value: kpis ? String(kpis.open_tasks) : "—",
                    tone: "text-rose-300",
                    bar: Math.min(100, (kpis?.open_tasks || 0) * 3),
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <item.icon className={classNames("h-4 w-4", item.tone)} />
                        <span className="text-sm text-[var(--dashboard-muted)]">{item.label}</span>
                      </div>
                      <span className="text-sm font-semibold text-[var(--dashboard-text)]">{item.value}</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-[var(--dashboard-panel)]">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${Math.min(100, Math.max(8, item.bar))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <Card>
            <div className="flex flex-col gap-3 px-5 pt-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--dashboard-text)]">Priority Task Queue</h2>
                <p className="mt-1 text-xs text-[var(--dashboard-muted)]">Recent plan tasks linked to projects (sample).</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 px-3 py-2 text-sm text-[var(--dashboard-muted)] hover:bg-[var(--dashboard-panel)]"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Board
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 px-3 py-2 text-sm text-[var(--dashboard-muted)] hover:bg-[var(--dashboard-panel)]"
                >
                  <Users className="h-4 w-4" />
                  Assign
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/15"
                >
                  <Plus className="h-4 w-4" />
                  Add Task
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden">
              <div className="grid grid-cols-12 gap-3 border-y border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/40 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--dashboard-muted)]">
                <div className="col-span-5">Task</div>
                <div className="col-span-2">Owner</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1">Priority</div>
                <div className="col-span-1">Due</div>
                <div className="col-span-1 text-right">Est.</div>
              </div>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} projectName={projectById[task.projectId] || "—"} />
              ))}
              {!tasks.length ? (
                <div className="px-5 py-6 text-center text-sm text-[var(--dashboard-muted)]">No linked plan tasks in this scope.</div>
              ) : null}
            </div>
          </Card>

          <section className="grid gap-5 lg:grid-cols-3">
            <Card className="p-5">
              <Target className="h-5 w-5 text-cyan-300" />
              <h3 className="mt-4 text-base font-semibold text-[var(--dashboard-text)]">Today’s focus</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--dashboard-muted)]">
                Clear blockers on linked plan tasks, keep workspace spend inside allocated budget, and verify milestones stay tied to real D1
                goals.
              </p>
            </Card>
            <Card className="p-5">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              <h3 className="mt-4 text-base font-semibold text-[var(--dashboard-text)]">Risk watch</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--dashboard-muted)]">
                {blockedPortfolio ? `${blockedPortfolio} blocked tasks across visible projects.` : "No blocked tasks counted in this slice."}{" "}
                Open issues use the project_issues table when present.
              </p>
            </Card>
            <Card className="p-5">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <h3 className="mt-4 text-base font-semibold text-[var(--dashboard-text)]">Next proof point</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--dashboard-muted)]">
                Wire edit flows to PATCH /api/projects/:id and expand nested endpoints once `project_costs` keys are reconciled to TEXT
                project ids.
              </p>
            </Card>
          </section>
        </div>
      </div>

      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultWorkspaceId={workspaceId}
        onCreated={() => void refreshOverview(workspaceId)}
      />
    </main>
  );
}
