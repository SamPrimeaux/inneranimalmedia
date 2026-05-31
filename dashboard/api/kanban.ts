export type KanbanBoard = {
  id: string;
  name: string;
  workspace_id?: string | null;
  project_id?: string | null;
  board_type?: string | null;
};

export type KanbanColumn = {
  id: string;
  board_id: string;
  name: string;
  position: number;
  color?: string | null;
  config_json?: string | null;
};

export type KanbanTask = {
  id: string;
  board_id: string | null;
  column_id: string | null;
  project_id?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  priority: string;
  assignee_id?: string | null;
  client_name?: string | null;
  tags?: string | null;
  position: number;
  due_date?: number | null;
  completed_at?: number | null;
  todo_id?: string | null;
};

function qs(params: Record<string, string | null | undefined>) {
  const parts = Object.entries(params)
    .filter(([, v]) => v != null && String(v).trim())
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v).trim())}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export async function fetchKanbanBoards(workspaceId: string | null): Promise<{ ok: boolean; boards?: KanbanBoard[]; error?: string }> {
  const r = await fetch(`/api/kanban/boards${qs({ workspace_id: workspaceId })}`, { credentials: "same-origin" });
  const j = (await r.json()) as { ok: boolean; boards?: KanbanBoard[]; error?: string };
  if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
  return j;
}

export async function fetchKanbanColumns(boardId: string): Promise<{ ok: boolean; columns?: KanbanColumn[]; error?: string }> {
  const r = await fetch(`/api/kanban/columns${qs({ board_id: boardId })}`, { credentials: "same-origin" });
  const j = (await r.json()) as { ok: boolean; columns?: KanbanColumn[]; error?: string };
  if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
  return j;
}

export async function fetchKanbanTasks(opts: {
  boardId?: string | null;
  projectId?: string | null;
}): Promise<{ ok: boolean; tasks?: KanbanTask[]; error?: string }> {
  const r = await fetch(
    `/api/kanban/tasks${qs({ board_id: opts.boardId, project_id: opts.projectId })}`,
    { credentials: "same-origin" },
  );
  const j = (await r.json()) as { ok: boolean; tasks?: KanbanTask[]; error?: string };
  if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
  return j;
}

export async function patchKanbanTask(
  id: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; task?: KanbanTask; error?: string }> {
  const r = await fetch(`/api/kanban/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await r.json()) as { ok: boolean; task?: KanbanTask; error?: string };
  if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
  return j;
}
