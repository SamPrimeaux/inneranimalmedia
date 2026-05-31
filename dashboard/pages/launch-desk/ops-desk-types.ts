export type CalView = 'week' | 'month';
export type OpsSurface = 'calendar' | 'day' | 'event';

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

export async function fetchDayEvents(day: Date): Promise<CalEvent[]> {
  const { from, to } = daySqlRange(day);
  const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const data = await apiJson<{ events?: CalEvent[] }>(`/api/calendar/view/day?${q}`);
  return (data.events ?? []).sort(
    (a, b) => parseEventDate(a.start_datetime).getTime() - parseEventDate(b.start_datetime).getTime(),
  );
}
