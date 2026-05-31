import React from "react";
import { Sparkles } from "lucide-react";
import type { BoardTask } from "./types";
import { cx, statusLabel, statusTone } from "./types";

function CardShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-white/10 bg-slate-950/48 shadow-[0_18px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </section>
  );
}

export default function TaskDetailPanel({ task }: { task: BoardTask | null }) {
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
