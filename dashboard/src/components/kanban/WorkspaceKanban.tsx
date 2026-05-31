import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Layers3, RefreshCw } from "lucide-react";
import type { KanbanColumn as ApiKanbanColumn, KanbanTask } from "../../../api/kanban";
import {
  fetchKanbanBoards,
  fetchKanbanColumns,
  fetchKanbanTasks,
  patchKanbanTask,
} from "../../../api/kanban";
import KanbanBoard from "./KanbanBoard";
import TaskDetailPanel from "./TaskDetailPanel";
import { mapKanbanTaskToBoardTask, statusToColumnId } from "./kanban-map";
import type { BoardTask, TaskStatus } from "./types";
import { KANBAN_COLUMNS } from "./types";

type Props = {
  workspaceId: string | null;
};

export default function WorkspaceKanban({ workspaceId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiColumns, setApiColumns] = useState<ApiKanbanColumn[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [boardName, setBoardName] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId?.trim()) {
      setApiColumns([]);
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
        setApiColumns([]);
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
      const cols = colsRes.columns || [];
      setApiColumns(cols);
      const columnById = new Map(cols.map((c) => [c.id, c]));
      const mapped = (tasksRes.tasks || [])
        .filter((t: KanbanTask) => !t.completed_at)
        .map((t) => mapKanbanTaskToBoardTask(t, columnById));
      setTasks(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setApiColumns([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  async function moveTask(taskId: string, status: TaskStatus) {
    const columnId = statusToColumnId(status, apiColumns);
    if (!columnId) return;
    const prev = tasks;
    setTasks((current) =>
      current.map((t) => (t.id === taskId ? { ...t, status, column_id: columnId } : t)),
    );
    const res = await patchKanbanTask(taskId, { column_id: columnId });
    if (!res.ok) {
      setTasks(prev);
      setError(res.error || "Move failed");
    }
  }

  function selectTask(task: BoardTask) {
    setSelectedTaskId(task.id);
  }

  return (
    <section className="flex min-w-0 w-full flex-col overflow-hidden text-slate-100">
      <div className="shrink-0 border-b border-white/10 bg-[var(--dashboard-canvas)]/95 px-4 py-4 backdrop-blur-xl sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
              <Layers3 className="h-4 w-4" />
              Workspace Kanban
            </div>
            <p className="mt-1 text-xs text-slate-500">{boardName ? boardName : "No board in this workspace"}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300 hover:bg-white/[0.07]"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="shrink-0 px-4 py-2 text-sm text-rose-200 sm:px-5">{error}</div> : null}

      {loading ? (
        <div className="px-4 py-8 text-sm text-slate-500 sm:px-5">Loading kanban…</div>
      ) : !apiColumns.length ? (
        <div className="px-4 py-8 text-sm text-slate-500 sm:px-5">No kanban board configured for this workspace.</div>
      ) : (
        <>
          <div className="min-h-0 min-w-0 w-full overflow-x-auto overflow-y-hidden overscroll-x-contain px-3 py-4 sm:px-4">
            <KanbanBoard
              tasks={tasks}
              columns={KANBAN_COLUMNS}
              selectedTaskId={selectedTaskId}
              onSelectTask={selectTask}
              onMove={moveTask}
              workspaceLayout
            />
          </div>
          <div className="shrink-0 border-t border-white/10 px-3 py-4 sm:px-4">
            <TaskDetailPanel task={selectedTask} />
          </div>
        </>
      )}
    </section>
  );
}
