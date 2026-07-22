/** Platform engineering tickets (`agentsam_tickets`) — not Collaborate client tasks. */

export type TicketStatus =
  | 'backlog'
  | 'active'
  | 'blocked'
  | 'in_review'
  | 'shipped'
  | 'abandoned';

export type PlatformTicket = {
  id: string;
  title: string;
  status: TicketStatus;
  status_reason: string | null;
  project: string | null;
  subsystem: string | null;
  tags: string[];
  priority: string | null;
  doc_path: string | null;
  blocks: string[];
  blocked_by: string[];
  supersedes: string | null;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
};

export type TicketEvent = {
  id: string;
  ticket_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
  commit_sha: string | null;
  created_at: number;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data;
}

export async function fetchTickets(params?: {
  status?: string;
  workable?: boolean;
  limit?: number;
}): Promise<PlatformTicket[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.workable) q.set('workable', '1');
  if (params?.limit) q.set('limit', String(params.limit));
  const res = await fetch(`/api/tickets${q.toString() ? `?${q}` : ''}`, {
    credentials: 'same-origin',
  });
  const data = await parseJson<{ ok: boolean; tickets: PlatformTicket[] }>(res);
  return data.tickets || [];
}

export async function createTicket(body: {
  title: string;
  status?: TicketStatus;
  priority?: string;
  project?: string;
  subsystem?: string;
  doc_path?: string;
  tags?: string[];
}): Promise<PlatformTicket> {
  const res = await fetch('/api/tickets', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ ok: boolean; ticket: PlatformTicket }>(res);
  return data.ticket;
}

export async function setTicketStatus(
  id: string,
  body: { status: TicketStatus; status_reason?: string },
): Promise<PlatformTicket> {
  const res = await fetch(`/api/tickets/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ ok: boolean; ticket: PlatformTicket }>(res);
  return data.ticket;
}

export async function fetchTicket(id: string): Promise<PlatformTicket> {
  const res = await fetch(`/api/tickets/${encodeURIComponent(id)}`, {
    credentials: 'same-origin',
  });
  const data = await parseJson<{ ok: boolean; ticket: PlatformTicket }>(res);
  return data.ticket;
}

export async function updateTicket(
  id: string,
  patch: {
    title?: string;
    priority?: string | null;
    project?: string | null;
    subsystem?: string | null;
    tags?: string[];
    doc_path?: string | null;
    blocks?: string[];
    blocked_by?: string[];
    supersedes?: string | null;
  },
): Promise<PlatformTicket> {
  const res = await fetch(`/api/tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parseJson<{ ok: boolean; ticket: PlatformTicket }>(res);
  return data.ticket;
}

export async function postTicketEvent(
  id: string,
  body: {
    event_type: 'note' | 'commit_linked' | 'gate_passed' | 'gate_failed';
    detail?: string | null;
    commit_sha?: string | null;
  },
): Promise<{ ok: boolean; event_id: string; ticket_id: string }> {
  const res = await fetch(`/api/tickets/${encodeURIComponent(id)}/events`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function deleteTicket(id: string): Promise<{ ok: boolean; deleted_id: string }> {
  const res = await fetch(`/api/tickets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  return parseJson(res);
}

export async function fetchTicketEvents(id: string): Promise<TicketEvent[]> {
  const res = await fetch(`/api/tickets/${encodeURIComponent(id)}/events`, {
    credentials: 'same-origin',
  });
  const data = await parseJson<{ ok: boolean; events: TicketEvent[] }>(res);
  return data.events || [];
}

export type TicketAnalytics = {
  completion_rate: number;
  avg_cycle_days: number | null;
  oldest_active_days: number;
  by_status: Record<string, number>;
  throughput: { week: string; shipped: number }[];
  aging: {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    days_in_status: number;
  }[];
};

export async function fetchTicketAnalytics(): Promise<TicketAnalytics> {
  const res = await fetch('/api/tickets/analytics', { credentials: 'same-origin' });
  const data = await parseJson<{ ok: boolean; analytics: TicketAnalytics }>(res);
  return data.analytics;
}
