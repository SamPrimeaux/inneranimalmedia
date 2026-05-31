export type OpsDeskTodo = {
  id: string;
  title: string;
  status?: string;
  execution_status?: string;
  priority?: string;
};

export type OpsDeskKanbanDue = {
  id: string;
  title: string;
  priority?: string;
  due_date?: number | null;
  column_id?: string | null;
  category?: string | null;
};

export type OpsDeskDayResponse = {
  ok?: boolean;
  date: string;
  todos?: OpsDeskTodo[];
  kanban_due?: OpsDeskKanbanDue[];
  error?: string;
};

export async function fetchOpsDeskDay(date: string): Promise<OpsDeskDayResponse> {
  const r = await fetch(`/api/ops-desk/day?date=${encodeURIComponent(date)}`, { credentials: "same-origin" });
  const j = (await r.json()) as OpsDeskDayResponse;
  if (!r.ok) return { ...j, error: j.error || `HTTP ${r.status}` };
  return j;
}

export async function patchOpsDeskTodo(id: string, status = "done"): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/ops-desk/todos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const j = (await r.json()) as { ok?: boolean; error?: string };
  if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
  return { ok: true };
}

export async function patchOpsDeskPlanTask(id: string, status = "done"): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/ops-desk/plan-tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const j = (await r.json()) as { ok?: boolean; error?: string };
  if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
  return { ok: true };
}
