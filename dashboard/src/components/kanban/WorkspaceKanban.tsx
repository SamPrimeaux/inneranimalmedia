import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { KanbanColumn, KanbanTask } from "../../../api/kanban";
import {
  fetchKanbanBoards,
  fetchKanbanColumns,
  fetchKanbanTasks,
  patchKanbanTask,
} from "../../../api/kanban";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const priorityClass: Record<string, string> = {
  urgent: "border-rose-400/35 bg-rose-400/10 text-rose-200",
  high: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  medium: "border-cyan-400/35 bg-cyan-400/10 text-cyan-200",
  low: "border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] text-[var(--dashboard-muted)]",
};

export type KanbanColumnDef = {
  id: string;
  title: string;
  hint: string;
};

function KanbanTaskCard({
  task,
  columns,
  onMove,
}: {
  task: KanbanTask;
  columns: KanbanColumnDef[];
  onMove: (taskId: string, columnId: string) => void;
}) {
  const pr = task.priority || "medium";
  return (
    <div className="w-full rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 p-3 text-left">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cx("rounded-full border px-2 py-0.5 text-[10px] font-semibold", priorityClass[pr] || priorityClass.medium)}>
          {pr}
        </span>
        {task.completed_at ? (
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">
            done
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[var(--dashboard-text)]">{task.title}</h3>
      {task.description ? (
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--dashboard-muted)]">{task.description}</p>
      ) : null}
      <div className="mt-3">
        <select
          value={task.column_id || ""}
          onChange={(event) => onMove(task.id, event.target.value)}
          className="h-8 w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-card)] px-2 text-xs text-[var(--dashboard-text)] outline-none focus:border-cyan-300/40"
        >
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              Move to {column.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function KanbanColumnView({
  column,
  tasks,
  allColumns,
  onMove,
}: {
  column: KanbanColumnDef;
  tasks: KanbanTask[];
  allColumns: KanbanColumnDef[];
  onMove: (taskId: string, columnId: string) => void;
}) {
  return (
    <div className="flex max-h-[560px] min-h-[420px] w-[300px] shrink-0 flex-col rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-card)]/80">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--dashboard-border)] p-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--dashboard-text)]">{column.title}</h2>
            <span className="rounded-full bg-[var(--dashboard-panel)] px-2 py-0.5 text-xs text-[var(--dashboard-muted)]">
              {tasks.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--dashboard-muted)]">{column.hint}</p>
        </div>
        <button type="button" className="rounded-xl border border-[var(--dashboard-border)] p-2 text-[var(--dashboard-muted)]">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {tasks.map((task) => (
          <KanbanTaskCard key={task.id} task={task} columns={allColumns} onMove={onMove} />
        ))}
        {!tasks.length ? (
          <div className="rounded-2xl border border-dashed border-[var(--dashboard-border)] p-6 text-center text-xs text-[var(--dashboard-muted)]">
            No tasks in {column.title}.
          </div>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  workspaceId: string | null;
};

export default function WorkspaceKanban({ workspaceId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [boardName, setBoardName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId?.trim()) {
      setColumns([]);
      setTasks([]);
      setBoardName(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const boardsRes = await fetchKanbanBoards(workspaceId);
      if (!boardsRes.ok) throw new Error(boardsRes.error || "Failed to load boards");
      const boards = boardsRes.boards || [];
      const board = boards.find((b) => !b.project_id) || boards[0];
      if (!board) {
        setColumns([]);
        setTasks([]);
        setBoardName(null);
        return;
      }
      setBoardName(board.name);
      const [colsRes, tasksRes] = await Promise.all([
        fetchKanbanColumns(board.id),
        fetchKanbanTasks({ boardId: board.id }),
      ]);
      if (!colsRes.ok) throw new Error(colsRes.error || "Failed to load columns");
      if (!tasksRes.ok) throw new Error(tasksRes.error || "Failed to load tasks");
      setColumns(colsRes.columns || []);
      setTasks((tasksRes.tasks || []).filter((t) => !t.completed_at));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setColumns([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columnDefs: KanbanColumnDef[] = useMemo(
    () =>
      columns.map((c) => ({
        id: c.id,
        title: c.name,
        hint: "Column",
      })),
    [columns],
  );

  async function moveTask(taskId: string, columnId: string) {
    const prev = tasks;
    setTasks((current) => current.map((t) => (t.id === taskId ? { ...t, column_id: columnId } : t)));
    const res = await patchKanbanTask(taskId, { column_id: columnId });
    if (!res.ok) {
      setTasks(prev);
      setError(res.error || "Move failed");
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-card)]/90">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--dashboard-border)] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--dashboard-text)]">Workspace Kanban</h2>
          <p className="mt-1 text-xs text-[var(--dashboard-muted)]">{boardName ? boardName : "No board in this workspace"}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-[var(--dashboard-border)] px-3 py-2 text-xs text-[var(--dashboard-muted)] hover:bg-[var(--dashboard-panel)]"
        >
          Refresh
        </button>
      </div>
      {error ? <div className="px-5 py-3 text-sm text-rose-200">{error}</div> : null}
      {loading ? (
        <div className="px-5 py-8 text-sm text-[var(--dashboard-muted)]">Loading kanban…</div>
      ) : !columnDefs.length ? (
        <div className="px-5 py-8 text-sm text-[var(--dashboard-muted)]">No kanban board configured for this workspace.</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto p-5">
          {columnDefs.map((column) => (
            <KanbanColumnView
              key={column.id}
              column={column}
              allColumns={columnDefs}
              tasks={tasks.filter((t) => t.column_id === column.id)}
              onMove={moveTask}
            />
          ))}
          <div className="flex max-h-[560px] min-h-[420px] w-[300px] shrink-0 flex-col rounded-2xl border border-rose-400/20 bg-rose-400/[0.04]">
            <div className="border-b border-rose-400/15 p-4">
              <h2 className="text-sm font-semibold text-rose-100">Unassigned</h2>
              <p className="mt-1 text-xs text-rose-200/60">No column</p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {tasks
                .filter((t) => !t.column_id || !columnDefs.some((c) => c.id === t.column_id))
                .map((task) => (
                  <KanbanTaskCard key={task.id} task={task} columns={columnDefs} onMove={moveTask} />
                ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
