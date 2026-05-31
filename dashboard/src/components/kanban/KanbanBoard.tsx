import React, { useEffect, useMemo, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import KanbanColumn from "./KanbanColumn";
import TaskCard from "./TaskCard";
import type { BoardTask, ColumnDef, TaskStatus } from "./types";
import { KANBAN_COLUMNS } from "./types";

type Props = {
  tasks: BoardTask[];
  columns?: ColumnDef[];
  selectedTaskId: string | null;
  highlightedTaskId?: string | null;
  onSelectTask: (task: BoardTask) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
};

export default function KanbanBoard({
  tasks,
  columns = KANBAN_COLUMNS,
  selectedTaskId,
  highlightedTaskId,
  onSelectTask,
  onMove,
}: Props) {
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const columnOptions = useMemo(
    () => columns.map((column) => ({ id: column.id, title: column.title })),
    [columns],
  );

  useEffect(() => {
    if (!highlightedTaskId) return;
    const el = cardRefs.current[highlightedTaskId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [highlightedTaskId, tasks]);

  const blockedTasks = tasks.filter((task) => task.status === "blocked");

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((column) => {
        const colTasks = tasks.filter((task) => task.status === column.id);
        return (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={colTasks}
            selectedTaskId={selectedTaskId}
            highlightedTaskId={highlightedTaskId}
            onSelectTask={onSelectTask}
            onMove={onMove}
            columnOptions={columnOptions}
            cardRefs={cardRefs}
          />
        );
      })}

      <div className="flex max-h-[calc(100vh-320px)] min-h-[560px] w-[320px] shrink-0 flex-col rounded-2xl border border-rose-400/20 bg-rose-400/[0.035]">
        <div className="flex items-start justify-between gap-3 border-b border-rose-400/15 p-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-rose-100">Blocked</h2>
              <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-xs text-rose-100">{blockedTasks.length}</span>
            </div>
            <p className="mt-1 text-xs text-rose-200/60">Requires action</p>
          </div>
          <AlertTriangle className="h-4 w-4 text-rose-300" />
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {blockedTasks.map((task) => (
            <TaskCard
              key={task.id}
              ref={(el) => {
                cardRefs.current[task.id] = el;
              }}
              task={task}
              selected={selectedTaskId === task.id}
              highlighted={highlightedTaskId === task.id}
              onSelect={() => onSelectTask(task)}
              onMove={onMove}
              columnOptions={columnOptions}
            />
          ))}
          {blockedTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rose-400/20 p-6 text-center text-xs text-rose-200/60">
              No blocked tasks.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
