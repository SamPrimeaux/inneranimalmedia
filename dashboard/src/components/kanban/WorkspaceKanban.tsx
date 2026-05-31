import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { KanbanColumn as ApiKanbanColumn, KanbanTask } from "../../../api/kanban";
import {
  fetchKanbanBoards,
  fetchKanbanColumns,
  fetchKanbanTasks,
  patchKanbanTask,
} from "../../../api/kanban";
import KanbanBoard from "./KanbanBoard";
import TaskDetailPanel from "./TaskDetailPanel";
import {
  buildColumnDefs,
  mapKanbanTaskToBoardTask,
  statusToColumnId,
} from "./kanban-map";
import type { BoardTask, TaskStatus } from "./types";
import { KANBAN_COLUMNS } from "./types";

type Props = {
  workspaceId: string | null;
  highlightedTaskId?: string | null;
};

export default function WorkspaceKanban({ workspaceId, highlightedTaskId }: Props) {
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

  useEffect(() => {
    if (highlightedTaskId) setSelectedTaskId(highlightedTaskId);
  }, [highlightedTaskId]);

  const columnDefs = useMemo(() => {
    const fromApi = buildColumnDefs(apiColumns);
    return fromApi.length ? fromApi : KANBAN_COLUMNS;
  }, [apiColumns]);

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
    <section className="rounded-2xl border border-[var(--dashboard-border)] bg-slate-950/90 text-slate-100">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Workspace Kanban</h2>
          <p className="mt-1 text-xs text-slate-500">{boardName ? boardName : "No board in this workspace"}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/[0.04]"
        >
          Refresh
        </button>
      </div>
      {error ? <div className="px-5 py-3 text-sm text-rose-200">{error}</div> : null}
      {loading ? (
        <div className="px-5 py-8 text-sm text-slate-500">Loading kanban…</div>
      ) : !apiColumns.length ? (
        <div className="px-5 py-8 text-sm text-slate-500">No kanban board configured for this workspace.</div>
      ) : (
        <div className="p-5">
          <KanbanBoard
            tasks={tasks}
            columns={columnDefs}
            selectedTaskId={selectedTaskId}
            highlightedTaskId={highlightedTaskId}
            onSelectTask={selectTask}
            onMove={moveTask}
          />
          <div className="mt-4">
            <TaskDetailPanel task={selectedTask} />
          </div>
        </div>
      )}
    </section>
  );
}
