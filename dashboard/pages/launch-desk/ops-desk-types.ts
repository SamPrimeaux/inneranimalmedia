export type CalView = 'week' | 'month' | 'day';
export type QuickEventType = 'event' | 'task' | 'out_of_office' | 'focus' | 'working_location' | 'meeting';

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
  attendees?: string | null;
  all_day?: number | boolean | null;
  timezone?: string | null;
  recurrence_rule?: string | null;
  calendar_source?: string | null;
  guest_permissions_json?: string | null;
}

export interface BookingPage {
  id: string;
  slug: string;
  title: string;
  duration_min: number;
  description?: string | null;
  location?: string | null;
  is_active?: number;
}

export interface CalendarPerson {
  id?: string;
  display_name?: string | null;
  email?: string | null;
  role?: string | null;
  user_id?: string | null;
}

export interface CalendarInsightsPayload {
  window: { from: string; to: string };
  insights: {
    breakdown_minutes: Record<string, number>;
    meeting_minutes: number;
    people: { email: string; minutes: number }[];
    working_minutes_per_day: number;
  };
  weeks: { label: string; minutes: number; active: boolean }[];
  working_hours: {
    timezone: string;
    start_minutes: number;
    end_minutes: number;
    work_days_json: string;
  };
}

export interface AgentTodo {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  tags?: string | null;
  category?: string | null;
  project_key?: string | null;
  notes?: string | null;
  linked_route?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  sort_order?: number | null;
}

export function parseTodoTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function isTodoStarred(todo: AgentTodo) {
  return parseTodoTags(todo.tags).includes('starred');
}

export function todoListName(todo: AgentTodo) {
  const name = String(todo.category || todo.project_key || '').trim();
  return name || 'My Tasks';
}

export function formatTodoDue(raw: string | null | undefined) {
  if (!raw) return null;
  const s = String(raw).trim();
  const d = s.includes('T') ? new Date(s) : new Date(s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  const hasTime = s.includes(':') || s.includes('T');
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export async function createTodo(payload: {
  title: string;
  description?: string;
  due_date?: string;
  category?: string;
  starred?: boolean;
  notes?: string;
  project_id?: string;
  project_key?: string;
}) {
  return apiJson<{ ok: boolean; todo: AgentTodo }>('/api/agent/todo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function patchTodo(id: string, payload: Record<string, unknown>) {
  return apiJson<{ ok: boolean; todo: AgentTodo }>(`/api/agent/todo/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
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

export function isSyntheticEvent(ev: CalEvent) {
  const id = String(ev.id || '');
  const src = String(ev.calendar_source || '').toLowerCase();
  return id.startsWith('task_') || id.startsWith('bday_') || id.startsWith('hol_') || src === 'holidays';
}

export function isAllDay(ev: CalEvent) {
  return ev.all_day === true || ev.all_day === 1;
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
  const d = new Date(isoLocal);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function daySqlRange(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: `${key} 00:00:00`, to: `${key} 23:59:59` };
}

export async function fetchDayEvents(day: Date): Promise<CalEvent[]> {
  const { from, to } = daySqlRange(day);
  const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const data = await apiJson<{ events?: CalEvent[] }>(`/api/calendar/view/day?${q}`);
  return (data.events ?? []).sort(
    (a, b) => parseEventDate(a.start_datetime).getTime() - parseEventDate(b.start_datetime).getTime(),
  );
}

export function anchorIso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfWeek(d: Date) {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

export function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
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

export function sourcesParam(enabled: Record<string, boolean>) {
  const keys = Object.entries(enabled)
    .filter(([, on]) => on)
    .map(([k]) => k);
  return keys.length ? keys.join(',') : 'primary';
}

export async function fetchWeekEvents(anchor: Date, sources: Record<string, boolean>) {
  const q = new URLSearchParams({
    anchor: anchorIso(anchor),
    sources: sourcesParam(sources),
  });
  const data = await apiJson<{ events?: CalEvent[] }>(`/api/calendar/view/week?${q}`);
  return data.events ?? [];
}

export async function fetchInsights(anchor: Date) {
  const q = new URLSearchParams({ anchor: anchorIso(anchor) });
  return apiJson<CalendarInsightsPayload>(`/api/calendar/insights?${q}`);
}

export async function fetchBookingPages() {
  const data = await apiJson<{ pages?: BookingPage[] }>('/api/calendar/booking-pages');
  return data.pages ?? [];
}

export async function fetchPeople(q: string) {
  const data = await apiJson<{ people?: CalendarPerson[] }>(
    `/api/calendar/people?q=${encodeURIComponent(q)}`,
  );
  return data.people ?? [];
}

export async function fetchTodos(opts?: {
  projectId?: string | null;
  category?: string | null;
  includeLegacy?: boolean;
}) {
  const params = new URLSearchParams();
  if (opts?.projectId?.trim()) params.set('project_id', opts.projectId.trim());
  if (opts?.category?.trim()) params.set('category', opts.category.trim());
  if (opts?.includeLegacy) params.set('include_legacy', '1');
  const qs = params.toString();
  const data = await apiJson<{ todos?: AgentTodo[] }>(`/api/agent/todo${qs ? `?${qs}` : ''}`);
  return data.todos ?? [];
}
