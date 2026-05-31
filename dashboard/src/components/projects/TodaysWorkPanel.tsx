import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchOpsDeskDay, patchOpsDeskTodo } from "../../../api/ops-desk";
import { patchKanbanTask } from "../../../api/kanban";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type ChecklistItem = {
  key: string;
  id: string;
  title: string;
  kind: "todo" | "kanban";
  done: boolean;
};

export default function TodaysWorkPanel() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const date = useMemo(() => todayIso(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOpsDeskDay(date);
      if (data.error) throw new Error(data.error);
      const todos = (data.todos || []).map((t) => ({
        key: `todo:${t.id}`,
        id: t.id,
        title: t.title,
        kind: "todo" as const,
        done: false,
      }));
      const kanban = (data.kanban_due || []).map((t) => ({
        key: `kanban:${t.id}`,
        id: t.id,
        title: t.title,
        kind: "kanban" as const,
        done: false,
      }));
      setItems([...todos, ...kanban]);
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

  async function toggle(item: ChecklistItem) {
    if (item.done) return;
    setItems((current) => current.map((row) => (row.key === item.key ? { ...row, done: true } : row)));
    const res =
      item.kind === "todo"
        ? await patchOpsDeskTodo(item.id, "done")
        : await patchKanbanTask(item.id, { status: "complete" });
    if (!res.ok) {
      setItems((current) => current.map((row) => (row.key === item.key ? { ...row, done: false } : row)));
      setError(res.error || "Could not mark complete");
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-card)]/90">
      <div className="border-b border-[var(--dashboard-border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--dashboard-text)]">Today&apos;s Work</h2>
        <p className="mt-1 text-xs text-[var(--dashboard-muted)]">{date}</p>
      </div>
      <div className="p-5">
        {error ? <div className="mb-3 text-sm text-rose-200">{error}</div> : null}
        {loading ? (
          <div className="text-sm text-[var(--dashboard-muted)]">Loading…</div>
        ) : !items.length ? (
          <div className="text-sm text-[var(--dashboard-muted)]">Nothing due today.</div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.key}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/50 px-3 py-2.5 hover:bg-[var(--dashboard-panel)]">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => void toggle(item)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--dashboard-border)]"
                  />
                  <span className={item.done ? "text-sm text-[var(--dashboard-muted)] line-through" : "text-sm text-[var(--dashboard-text)]"}>
                    {item.title}
                  </span>
                  <span className="ml-auto shrink-0 rounded-full border border-[var(--dashboard-border)] px-2 py-0.5 text-[10px] text-[var(--dashboard-muted)]">
                    {item.kind}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
