export type AgentSessionRow = {
  id: string;
  session_type?: string;
  status?: string;
  started_at?: number | string;
  message_count?: number;
  has_artifacts?: boolean;
  name?: string | null;
};

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
