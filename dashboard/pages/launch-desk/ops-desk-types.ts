export type CalView = 'week' | 'month';
export type OpsSurface = 'calendar' | 'day' | 'event';
export type DayViewTab = 'agenda' | 'sprint' | 'plans' | 'todos';

export interface CalEvent {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start_datetime: string;
  end_datetime: string;
  color?: string | null;
  status?: string | null;
  event_type?: string | null;
  meet_room_id?: string | null;
  room_id?: string | null;
  completed_at?: string | null;
  priority?: string | null;
  attendees?: string | null;
}

export interface FocusPlan {
  id: string;
  title: string;
  plan_type?: string | null;
  plan_date?: string | null;
  status?: string | null;
  tasks_total?: number | null;
  tasks_done?: number | null;
  morning_brief?: string | null;
}

export interface PlanTask {
  id: string;
  plan_id: string;
  title: string;
  status: string;
  priority?: string | null;
  category?: string | null;
  blocked_reason?: string | null;
  estimated_minutes?: number | null;
  completed_at?: number | null;
  plan_title?: string | null;
  plan_type?: string | null;
}

export interface KanbanTask {
  id: string;
  title: string;
  priority?: string | null;
  due_date?: number | null;
  completed_at?: number | null;
  client_name?: string | null;
  tags?: string | null;
  column_id?: string | null;
  category?: string | null;
}

export interface ActivePlanOpenTask {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  category?: string | null;
  blocked_reason?: string | null;
  order_index?: number | null;
}

export interface ActivePlan extends FocusPlan {
  tasks_blocked?: number | null;
  session_notes?: string | null;
  open_count: number;
  open_tasks: ActivePlanOpenTask[];
}

export interface TodoItem {
  id: string;
  title: string;
  status: string;
  execution_status?: string | null;
  priority?: string | null;
  category?: string | null;
  plan_id?: string | null;
  plan_title?: string | null;
  project_key?: string | null;
  linked_route?: string | null;
  linked_commit?: string | null;
  output_summary?: string | null;
  error_trace?: string | null;
  sort_order?: number | null;
}

export interface OpsDeskDayBundle {
  ok: boolean;
  date: string;
  events: CalEvent[];
  focus_plans: FocusPlan[];
  plan_tasks: PlanTask[];
  todos: TodoItem[];
  kanban_due: KanbanTask[];
  active_plans: ActivePlan[];
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function fmtDateTime(d: Date) {
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtDayTitle(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function parseEventDate(raw: string) {
  const s = String(raw || '').trim();
  if (!s) return new Date(NaN);
  if (s.includes('T')) return new Date(s);
  return new Date(s.replace(' ', 'T'));
}

export function meetRoomId(ev: CalEvent) {
  const id = ev.meet_room_id || ev.room_id;
  return id ? String(id) : null;
}

export function parseAttendees(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function parseInviteEmails(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

export function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toSqlDatetime(isoLocal: string) {
  return new Date(isoLocal).toISOString().slice(0, 19).replace('T', ' ');
}

export function toDateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function truncatePlanRef(title: string | null | undefined, planId: string, max = 36) {
  const label = (title || planId).trim();
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export function priorityClass(priority: string | null | undefined) {
  const p = String(priority || 'P2').toUpperCase();
  if (p === 'P0') return 'p0';
  if (p === 'P1') return 'p1';
  return 'p2';
}

export function todoPriorityClass(priority: string | null | undefined) {
  const p = String(priority || 'medium').toLowerCase();
  if (p === 'critical' || p === 'urgent') return 'p0';
  if (p === 'high') return 'p1';
  return 'p2';
}

export function daySqlRange(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: `${key} 00:00:00`, to: `${key} 23:59:59` };
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchOpsDeskDay(day: Date): Promise<OpsDeskDayBundle> {
  const date = toDateKey(day);
  return apiJson<OpsDeskDayBundle>(`/api/ops-desk/day?date=${encodeURIComponent(date)}`);
}
