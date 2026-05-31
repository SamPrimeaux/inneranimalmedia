import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOpsDeskDay, type OpsDeskExecutionQueueItem } from "../../../api/ops-desk";
import { cx, planPriorityToP, priorityClass, statusTone } from "../kanban/types";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function queuePriorityClass(priority: string) {
  return priorityClass[planPriorityToP(priority)] || priorityClass.P2;
}

function statusChipClass(status: string) {
  if (status === "blocked") return statusTone("blocked");
  if (status === "in_progress") return statusTone("in_progress");
  if (status === "due_today") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
  return "border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] text-[var(--dashboard-muted)]";
}

type Props = {
  onHighlightKanbanTask?: (taskId: string | null) => void;
};

export default function TodaysWorkPanel({ onHighlightKanbanTask }: Props) {
  const [items, setItems] = useState<OpsDeskExecutionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const date = useMemo(() => todayIso(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOpsDeskDay(date, { limit: 5, source: "kanban_due,focus_plans" });
      if (data.error) throw new Error(data.error);
      setItems((data.execution_queue || []).slice(0, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectRow(item: OpsDeskExecutionQueueItem) {
    setActiveId(item.id);
    const highlightId = item.highlight_id || item.kanban_task_id || null;
    onHighlightKanbanTask?.(highlightId);
  }

  return (
    <section className="flex h-[248px] flex-col overflow-hidden rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-card)]/90">
      <div className="shrink-0 border-b border-[var(--dashboard-border)] px-5 py-3">
        <h2 className="text-sm font-semibold text-[var(--dashboard-text)]">Execution Queue</h2>
        <p className="text-xs text-[var(--dashboard-muted)]">{date}</p>
      </div>

      <div className="min-h-0 flex-1 px-5 py-2">
        {error ? <div className="text-sm text-rose-200">{error}</div> : null}
        {loading ? (
          <div className="text-sm text-[var(--dashboard-muted)]">Loading…</div>
        ) : !items.length ? (
          <p className="text-sm text-[var(--dashboard-muted)]">Nothing due today.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => selectRow(item)}
                  className={cx(
                    "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition",
                    activeId === item.id
                      ? "border-cyan-300/35 bg-[var(--dashboard-panel)]"
                      : "border-transparent hover:border-[var(--dashboard-border)] hover:bg-[var(--dashboard-panel)]/50",
                    !item.highlight_id && !item.kanban_task_id ? "cursor-default opacity-90" : "",
                  )}
                >
                  <span
                    className={cx(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      queuePriorityClass(item.priority),
                    )}
                  >
                    {item.priority}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--dashboard-text)]">{item.title}</span>
                  <span
                    className={cx(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] capitalize",
                      statusChipClass(item.status),
                    )}
                  >
                    {item.status_label || item.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--dashboard-border)] px-5 py-2">
        <Link to="/dashboard/launch-desk" className="text-xs font-medium text-cyan-300 hover:text-cyan-200">
          Open Launch Desk →
        </Link>
      </div>
    </section>
  );
}
