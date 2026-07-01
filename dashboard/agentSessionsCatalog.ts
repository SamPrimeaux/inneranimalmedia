export type AgentSessionRow = {
  id: string;
  conversation_id?: string;
  name_key?: string;
  session_type?: string;
  status?: string;
  started_at?: number | string;
  updated_at?: number | string;
  message_count?: number;
  has_artifacts?: boolean;
  artifact_count?: number;
  name?: string | null;
  title?: string | null;
  github_repo?: string | null;
  workspace_id?: string | null;
  model_used?: string | null;
  model_key?: string | null;
  active_file?: string | null;
  files_open?: string | null;
  is_starred?: boolean;
  project_id?: string | null;
  project_name?: string | null;
  last_turn_status?: string | null;
  total_tokens_out?: number | null;
};

export function sessionDisplayTitle(s: AgentSessionRow): string {
  const title = s.title && String(s.title).replace(/\s+/g, ' ').trim();
  if (title) return title;
  const name = s.name && String(s.name).replace(/\s+/g, ' ').trim();
  if (name) return name;
  const id = (s.conversation_id || s.id || '').trim();
  if (id) return `Chat ${id.slice(0, 8)}`;
  return 'New chat';
}

export function sessionStartedAtMs(s: AgentSessionRow): number {
  const st = s.started_at;
  if (typeof st === 'number') return st < 1e12 ? st * 1000 : st;
  if (typeof st === 'string') {
    const n = Number(st);
    if (!Number.isNaN(n) && n > 0) return n < 1e12 ? n * 1000 : n;
    const p = Date.parse(st);
    if (!Number.isNaN(p)) return p;
  }
  return 0;
}

/** Sort key for chat lists — prefers updated_at, falls back to started_at. */
export function sessionSortMs(s: AgentSessionRow): number {
  const u = s.updated_at;
  if (typeof u === 'number') return u < 1e12 ? u * 1000 : u;
  if (typeof u === 'string') {
    const n = Number(u);
    if (!Number.isNaN(n) && n > 0) return n < 1e12 ? n * 1000 : n;
    const p = Date.parse(u);
    if (!Number.isNaN(p)) return p;
  }
  return sessionStartedAtMs(s);
}

export function conversationIdFromSession(s: AgentSessionRow): string {
  return String(s.conversation_id || s.id || '').trim();
}

/** Human-readable timestamp for /dashboard/chats rows (Claude-style). */
export function chatsListRelativeTime(s: AgentSessionRow): string {
  const t = sessionSortMs(s);
  if (!t) return '';
  const diffMs = Math.max(0, Date.now() - t);
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function relativeSessionTime(s: AgentSessionRow): string {
  const t = sessionStartedAtMs(s);
  if (!t) return '';
  const diffMs = Math.max(0, Date.now() - t);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(d / 365);
  return `${y}y`;
}

function startOfTodayLocal(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMondayLocal(): number {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonthLocal(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sessionGroupLabel(ts: number): 'Today' | 'This Week' | 'This Month' | 'Older' {
  if (!ts) return 'Older';
  const startToday = startOfTodayLocal();
  if (ts >= startToday) return 'Today';
  const startWeek = startOfWeekMondayLocal();
  if (ts >= startWeek) return 'This Week';
  const startMonth = startOfMonthLocal();
  if (ts >= startMonth) return 'This Month';
  return 'Older';
}

export function groupSessionsByBucket(rows: AgentSessionRow[]): { label: string; items: AgentSessionRow[] }[] {
  const withTs = rows.map((r) => ({ row: r, ts: sessionStartedAtMs(r) }));
  withTs.sort((a, b) => b.ts - a.ts);
  const buckets: Record<'Today' | 'This Week' | 'This Month' | 'Older', AgentSessionRow[]> = {
    Today: [],
    'This Week': [],
    'This Month': [],
    Older: [],
  };
  for (const { row, ts } of withTs) {
    buckets[sessionGroupLabel(ts)].push(row);
  }
  const order: ('Today' | 'This Week' | 'This Month' | 'Older')[] = [
    'Today',
    'This Week',
    'This Month',
    'Older',
  ];
  return order.filter((l) => buckets[l].length > 0).map((label) => ({ label, items: buckets[label] }));
}
