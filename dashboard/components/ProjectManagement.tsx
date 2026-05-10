import React, { useMemo, useState } from "react";
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

type ProjectStatus = "active" | "blocked" | "review" | "complete" | "planning";
type Priority = "P0" | "P1" | "P2" | "P3";
type TaskStatus = "todo" | "in_progress" | "review" | "blocked" | "done";

type Project = {
  id: string;
  name: string;
  client: string;
  owner: string;
  stage: string;
  status: ProjectStatus;
  priority: Priority;
  progress: number;
  health: number;
  budgetUsed: number;
  budgetTotal: number;
  dueDate: string;
  lastDeploy: string;
  activeTasks: number;
  blockedTasks: number;
  completedTasks: number;
  tags: string[];
};

type Task = {
  id: string;
  title: string;
  projectId: string;
  owner: string;
  status: TaskStatus;
  priority: Priority;
  due: string;
  estimateHours: number;
};

type Milestone = {
  id: string;
  projectId: string;
  title: string;
  date: string;
  status: "done" | "current" | "upcoming" | "risk";
};

const projects: Project[] = [
  {
    id: "proj_agent_sam",
    name: "Agent Sam Dashboard",
    client: "InnerAnimalMedia",
    owner: "Sam",
    stage: "Analytics + Observability",
    status: "active",
    priority: "P0",
    progress: 68,
    health: 87,
    budgetUsed: 37245,
    budgetTotal: 60000,
    dueDate: "May 24",
    lastDeploy: "2h ago",
    activeTasks: 18,
    blockedTasks: 2,
    completedTasks: 74,
    tags: ["Cloudflare", "Supabase", "Agentic UI"],
  },
  {
    id: "proj_cpas",
    name: "Companions of CPAS",
    client: "Rescue Platform",
    owner: "Sam",
    stage: "Board Demo Buildout",
    status: "review",
    priority: "P0",
    progress: 74,
    health: 82,
    budgetUsed: 12880,
    budgetTotal: 18000,
    dueDate: "May 13",
    lastDeploy: "1d ago",
    activeTasks: 11,
    blockedTasks: 1,
    completedTasks: 46,
    tags: ["CMS", "Donations", "Rescue"],
  },
  {
    id: "proj_tools",
    name: "IAM Tools Agent Workspace",
    client: "InnerAnimalMedia",
    owner: "Agent Sam",
    stage: "MCP + Tool Governance",
    status: "active",
    priority: "P1",
    progress: 52,
    health: 76,
    budgetUsed: 9200,
    budgetTotal: 22000,
    dueDate: "Jun 02",
    lastDeploy: "5h ago",
    activeTasks: 23,
    blockedTasks: 4,
    completedTasks: 39,
    tags: ["MCP", "Workflow", "Routing"],
  },
  {
    id: "proj_gator",
    name: "Swamp Blood Gator Guides",
    client: "Outdoor Brand",
    owner: "Sam",
    stage: "CF-Native Rebuild",
    status: "planning",
    priority: "P2",
    progress: 35,
    health: 71,
    budgetUsed: 4300,
    budgetTotal: 12000,
    dueDate: "Jun 18",
    lastDeploy: "never",
    activeTasks: 9,
    blockedTasks: 0,
    completedTasks: 12,
    tags: ["Brand", "CMS", "R2"],
  },
];

const tasks: Task[] = [
  { id: "t1", title: "Wire dashboard KPI views to Supabase analytics API", projectId: "proj_agent_sam", owner: "Sam", status: "in_progress", priority: "P0", due: "Today", estimateHours: 3.5 },
  { id: "t2", title: "Validate agentsam_tool_call_events waterfall payload", projectId: "proj_agent_sam", owner: "Agent Sam", status: "review", priority: "P0", due: "Today", estimateHours: 1.25 },
  { id: "t3", title: "Create CPAS donation dashboard seed data", projectId: "proj_cpas", owner: "Sam", status: "todo", priority: "P0", due: "Tomorrow", estimateHours: 2 },
  { id: "t4", title: "Fix semantic_search_log capture on every RAG request", projectId: "proj_agent_sam", owner: "Agent Sam", status: "blocked", priority: "P1", due: "May 12", estimateHours: 2.5 },
  { id: "t5", title: "Add MCP tool category filters", projectId: "proj_tools", owner: "Sam", status: "in_progress", priority: "P1", due: "May 14", estimateHours: 2 },
  { id: "t6", title: "Draft reusable CMS project card schema", projectId: "proj_tools", owner: "Agent Sam", status: "done", priority: "P2", due: "May 09", estimateHours: 1 },
];

const milestones: Milestone[] = [
  { id: "m1", projectId: "proj_agent_sam", title: "Telemetry tables verified", date: "May 10", status: "done" },
  { id: "m2", projectId: "proj_agent_sam", title: "Analytics views live", date: "May 12", status: "current" },
  { id: "m3", projectId: "proj_agent_sam", title: "Chart UI wired", date: "May 15", status: "upcoming" },
  { id: "m4", projectId: "proj_cpas", title: "Board demo polish", date: "May 13", status: "risk" },
  { id: "m5", projectId: "proj_tools", title: "MCP governance pass", date: "May 18", status: "upcoming" },
];

const velocityData = [
  { day: "Mon", completed: 8, added: 5, blocked: 1 },
  { day: "Tue", completed: 12, added: 9, blocked: 2 },
  { day: "Wed", completed: 10, added: 7, blocked: 1 },
  { day: "Thu", completed: 16, added: 10, blocked: 3 },
  { day: "Fri", completed: 14, added: 8, blocked: 2 },
  { day: "Sat", completed: 6, added: 4, blocked: 1 },
  { day: "Sun", completed: 9, added: 6, blocked: 0 },
];

const burnData = [
  { date: "May 8", planned: 42, actual: 37 },
  { date: "May 9", planned: 38, actual: 35 },
  { date: "May 10", planned: 35, actual: 31 },
  { date: "May 11", planned: 30, actual: 29 },
  { date: "May 12", planned: 26, actual: 24 },
  { date: "May 13", planned: 22, actual: 18 },
  { date: "May 14", planned: 18, actual: 14 },
];

const workloadData = [
  { name: "Sam", value: 36 },
  { name: "Agent Sam", value: 28 },
  { name: "Cursor", value: 18 },
  { name: "Design", value: 12 },
  { name: "Review", value: 6 },
];

const statusLabels: Record<ProjectStatus, string> = {
  active: "Active",
  blocked: "Blocked",
  review: "Review",
  complete: "Complete",
  planning: "Planning",
};

const taskLabels: Record<TaskStatus, string> = {
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

function PriorityPill({ priority }: { priority: Priority }) {
  return (
    <span
      className={classNames(
        "rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        priority === "P0" && "border-rose-400/35 bg-rose-400/10 text-rose-200",
        priority === "P1" && "border-amber-400/35 bg-amber-400/10 text-amber-200",
        priority === "P2" && "border-cyan-400/35 bg-cyan-400/10 text-cyan-200",
        priority === "P3" && "border-slate-400/25 bg-slate-400/10 text-slate-300",
      )}
    >
      {priority}
    </span>
  );
}

function StatusPill({ status }: { status: ProjectStatus | TaskStatus }) {
  const label = status in statusLabels ? statusLabels[status as ProjectStatus] : taskLabels[status as TaskStatus];
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
    <section className={classNames("rounded-2xl border border-white/10 bg-slate-950/54 shadow-[0_18px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl", className)}>
      {children}
    </section>
  );
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 pt-5">
      <h2 className="text-sm font-semibold tracking-tight text-slate-100">{title}</h2>
      {action ? (
        <button className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200">
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sublabel, tone }: { icon: React.ElementType; label: string; value: string; sublabel: string; tone: "cyan" | "emerald" | "violet" | "amber" | "rose" }) {
  const toneClass = {
    cyan: "from-cyan-400/20 to-blue-500/5 text-cyan-200 border-cyan-300/20",
    emerald: "from-emerald-400/20 to-teal-500/5 text-emerald-200 border-emerald-300/20",
    violet: "from-violet-400/20 to-fuchsia-500/5 text-violet-200 border-violet-300/20",
    amber: "from-amber-400/20 to-orange-500/5 text-amber-200 border-amber-300/20",
    rose: "from-rose-400/20 to-red-500/5 text-rose-200 border-rose-300/20",
  }[tone];

  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</div>
          <div className="mt-1 text-xs text-slate-400">{sublabel}</div>
        </div>
        <div className={classNames("rounded-xl border bg-gradient-to-br p-2", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const burn = Math.round((project.budgetUsed / project.budgetTotal) * 100);
  return (
    <Card className="group overflow-hidden p-4 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-slate-900/70">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityPill priority={project.priority} />
            <StatusPill status={project.status} />
          </div>
          <h3 className="mt-3 truncate text-base font-semibold text-white">{project.name}</h3>
          <p className="mt-1 truncate text-xs text-slate-400">{project.client} • {project.stage}</p>
        </div>
        <button className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-slate-400 hover:text-white">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-slate-500">Progress</div>
          <div className="mt-1 font-semibold text-slate-100">{project.progress}%</div>
        </div>
        <div>
          <div className="text-slate-500">Health</div>
          <div className="mt-1 font-semibold text-emerald-200">{project.health}%</div>
        </div>
        <div>
          <div className="text-slate-500">Due</div>
          <div className="mt-1 font-semibold text-slate-100">{project.dueDate}</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
            <span>Delivery</span>
            <span>{project.progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${project.progress}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
            <span>Budget</span>
            <span>{money(project.budgetUsed)} / {money(project.budgetTotal)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-400" style={{ width: `${Math.min(burn, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {project.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300">
            {tag}
          </span>
        ))}
      </div>
    </Card>
  );
}

function TaskRow({ task, projectName }: { task: Task; projectName: string }) {
  return (
    <div className="grid grid-cols-12 items-center gap-3 border-b border-white/5 px-5 py-3 last:border-b-0 hover:bg-white/[0.025]">
      <div className="col-span-5 min-w-0">
        <div className="truncate text-sm font-medium text-slate-100">{task.title}</div>
        <div className="mt-1 truncate text-xs text-slate-500">{projectName}</div>
      </div>
      <div className="col-span-2 text-xs text-slate-300">{task.owner}</div>
      <div className="col-span-2"><StatusPill status={task.status} /></div>
      <div className="col-span-1"><PriorityPill priority={task.priority} /></div>
      <div className="col-span-1 text-xs text-slate-400">{task.due}</div>
      <div className="col-span-1 text-right text-xs text-slate-400">{task.estimateHours}h</div>
    </div>
  );
}

export default function ProjectManagement() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesQuery = [project.name, project.client, project.stage, project.owner, ...project.tags]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [query, statusFilter]);

  const projectById = useMemo(() => Object.fromEntries(projects.map((project) => [project.id, project.name])), []);
  const totals = useMemo(() => {
    const totalBudget = projects.reduce((sum, p) => sum + p.budgetTotal, 0);
    const usedBudget = projects.reduce((sum, p) => sum + p.budgetUsed, 0);
    const activeTasks = projects.reduce((sum, p) => sum + p.activeTasks, 0);
    const blockedTasks = projects.reduce((sum, p) => sum + p.blockedTasks, 0);
    const completedTasks = projects.reduce((sum, p) => sum + p.completedTasks, 0);
    const avgHealth = Math.round(projects.reduce((sum, p) => sum + p.health, 0) / projects.length);
    return { totalBudget, usedBudget, activeTasks, blockedTasks, completedTasks, avgHealth };
  }, []);

  return (
    <div className="w-full p-4 text-slate-100 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1720px] space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              <Sparkles className="h-4 w-4" />
              Project Command Center
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">Project Management</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Portfolio health, task execution, sprint velocity, budget burn, and project risk in one focused workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.07]">
              <CalendarDays className="h-4 w-4" />
              Last 14 Days
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/15">
              <Plus className="h-4 w-4" />
              New Project
            </button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard icon={Briefcase} label="Active Projects" value={String(projects.filter((p) => p.status !== "complete").length)} sublabel="4 tracked workspaces" tone="cyan" />
          <KpiCard icon={ListChecks} label="Open Tasks" value={String(totals.activeTasks)} sublabel={`${totals.completedTasks} completed`} tone="emerald" />
          <KpiCard icon={AlertTriangle} label="Blocked" value={String(totals.blockedTasks)} sublabel="Needs review today" tone="rose" />
          <KpiCard icon={ShieldCheck} label="Avg Health" value={`${totals.avgHealth}%`} sublabel="Portfolio health" tone="violet" />
          <KpiCard icon={Flame} label="Budget Burn" value={money(totals.usedBudget)} sublabel={`${money(totals.totalBudget)} allocated`} tone="amber" />
          <KpiCard icon={TimerReset} label="This Week" value="24.6h" sublabel="Tracked execution time" tone="cyan" />
        </section>

        <section className="grid gap-5 xl:grid-cols-12">
          <Card className="xl:col-span-8">
            <div className="flex flex-col gap-3 px-5 pt-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Portfolio Overview</h2>
                <p className="mt-1 text-xs text-slate-500">Delivery status, budget, health, and deploy readiness by project.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search projects..."
                    className="h-9 w-64 rounded-xl border border-white/10 bg-slate-950/70 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/40"
                  />
                </div>
                <button
                  onClick={() => setStatusFilter(statusFilter === "all" ? "active" : "all")}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300 hover:bg-white/[0.07]"
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
                          <Cell key={index} fill={["#22d3ee", "#8b5cf6", "#10b981", "#f59e0b", "#fb7185"][index % 5]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 self-center">
                  {workloadData.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ["#22d3ee", "#8b5cf6", "#10b981", "#f59e0b", "#fb7185"][index % 5] }} />
                        {item.name}
                      </div>
                      <span className="font-semibold text-slate-100">{item.value}%</span>
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
                          "z-10 h-3 w-3 rounded-full ring-4 ring-slate-950",
                          milestone.status === "done" && "bg-emerald-400",
                          milestone.status === "current" && "bg-cyan-400",
                          milestone.status === "upcoming" && "bg-violet-400",
                          milestone.status === "risk" && "bg-rose-400",
                        )}
                      />
                      <span className="mt-1 h-full w-px bg-white/10" />
                    </div>
                    <div className="min-w-0 pb-1">
                      <div className="text-sm font-medium text-slate-100">{milestone.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{projectById[milestone.projectId]} • {milestone.date}</div>
                    </div>
                  </div>
                ))}
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
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }} />
                  <Bar dataKey="completed" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="added" stackId="a" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="blocked" stackId="a" fill="#fb7185" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="xl:col-span-4">
            <SectionTitle title="Burndown Forecast" action="Open Sprint" />
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
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }} />
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
                { icon: CheckCircle2, label: "Deploy Ready", value: "3 / 4", tone: "text-emerald-300", bar: 75 },
                { icon: Workflow, label: "Workflow Coverage", value: "82%", tone: "text-cyan-300", bar: 82 },
                { icon: GitBranch, label: "Open PR / Review Items", value: "7", tone: "text-violet-300", bar: 45 },
                { icon: Clock3, label: "SLA Risk", value: "2 projects", tone: "text-rose-300", bar: 28 },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <item.icon className={classNames("h-4 w-4", item.tone)} />
                      <span className="text-sm text-slate-300">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-white">{item.value}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${item.bar}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <Card>
          <div className="flex flex-col gap-3 px-5 pt-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Priority Task Queue</h2>
              <p className="mt-1 text-xs text-slate-500">Live work across projects, owners, status, priority, and time estimates.</p>
            </div>
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.07]">
                <LayoutGrid className="h-4 w-4" />
                Board
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.07]">
                <Users className="h-4 w-4" />
                Assign
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/15">
                <Plus className="h-4 w-4" />
                Add Task
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden">
            <div className="grid grid-cols-12 gap-3 border-y border-white/10 bg-white/[0.025] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <div className="col-span-5">Task</div>
              <div className="col-span-2">Owner</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Priority</div>
              <div className="col-span-1">Due</div>
              <div className="col-span-1 text-right">Est.</div>
            </div>
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} projectName={projectById[task.projectId]} />
            ))}
          </div>
        </Card>

        <section className="grid gap-5 lg:grid-cols-3">
          <Card className="p-5">
            <Target className="h-5 w-5 text-cyan-300" />
            <h3 className="mt-4 text-base font-semibold text-white">Today’s Focus</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Finish analytics view validation, unblock RAG search logging, and convert the mockup into chart-ready React components.
            </p>
          </Card>
          <Card className="p-5">
            <AlertTriangle className="h-5 w-5 text-amber-300" />
            <h3 className="mt-4 text-base font-semibold text-white">Risk Watch</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              CPAS board-demo timeline and empty DesignStudio analytics tables need explicit smoke tests before UI polish continues.
            </p>
          </Card>
          <Card className="p-5">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            <h3 className="mt-4 text-base font-semibold text-white">Next Proof Point</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Each project card should link to real Supabase/D1 evidence: tasks, deploys, budget, blockers, logs, and Agent Sam execution traces.
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
