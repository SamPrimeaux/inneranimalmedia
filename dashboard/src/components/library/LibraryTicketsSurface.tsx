import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTicket,
  fetchTicketAnalytics,
  fetchTickets,
  setTicketStatus,
  type PlatformTicket,
  type TicketAnalytics,
  type TicketStatus,
} from '../../../api/tickets';
import { conicDonutGradient } from '../../lib/chartDonut';

type Props = {
  onToast?: (msg: string) => void;
};

type Tab = 'open' | 'blocked' | 'backlog' | 'done';

const OPEN_STATUSES = new Set<TicketStatus>(['active', 'in_review']);
const DONE_STATUSES = new Set<TicketStatus>(['shipped', 'abandoned']);

const STATUS_DONUT_COLORS: Record<string, string> = {
  shipped: '#34a853',
  abandoned: '#9aa0a6',
  active: '#1a73e8',
  in_review: '#f9ab00',
  blocked: '#d93025',
  backlog: '#5f6368',
};

function statusBadgeClass(status: string): string {
  if (status === 'active' || status === 'in_review') return 'is-active';
  if (status === 'blocked') return 'is-blocked';
  if (status === 'shipped') return 'is-shipped';
  if (status === 'abandoned') return 'is-abandoned';
  return 'is-backlog';
}

export function LibraryTicketsSurface({ onToast }: Props) {
  const [tickets, setTickets] = useState<PlatformTicket[]>([]);
  const [analytics, setAnalytics] = useState<TicketAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('P2');
  const [busy, setBusy] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, stats] = await Promise.all([
        fetchTickets({ limit: 200 }),
        fetchTicketAnalytics().catch(() => null),
      ]);
      setTickets(rows);
      setAnalytics(stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    let open = 0;
    let blocked = 0;
    let backlog = 0;
    let done = 0;
    for (const t of tickets) {
      if (OPEN_STATUSES.has(t.status)) open += 1;
      else if (t.status === 'blocked') blocked += 1;
      else if (t.status === 'backlog') backlog += 1;
      else if (DONE_STATUSES.has(t.status)) done += 1;
    }
    return { open, blocked, backlog, done };
  }, [tickets]);

  const visible = useMemo(() => {
    return tickets.filter((t) => {
      if (tab === 'open') return OPEN_STATUSES.has(t.status);
      if (tab === 'blocked') return t.status === 'blocked';
      if (tab === 'backlog') return t.status === 'backlog';
      return DONE_STATUSES.has(t.status);
    });
  }, [tickets, tab]);

  const selected = tickets.find((t) => t.id === selectedId) || null;

  const statusDonut = useMemo(() => {
    const by = analytics?.by_status || {};
    const slices = Object.entries(by)
      .filter(([, n]) => Number(n) > 0)
      .map(([key, val]) => ({
        key,
        color: STATUS_DONUT_COLORS[key] || '#dadce0',
        val: Number(val) || 0,
      }));
    if (!slices.length) slices.push({ key: 'empty', color: '#3c4043', val: 1 });
    return conicDonutGradient(slices);
  }, [analytics]);

  const maxShipped = useMemo(() => {
    const rows = analytics?.throughput || [];
    return Math.max(1, ...rows.map((r) => Number(r.shipped) || 0));
  }, [analytics]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      const ticket = await createTicket({
        title,
        priority: newPriority,
        status: 'backlog',
        project: 'inneranimalmedia',
        subsystem: 'platform',
      });
      setNewTitle('');
      setCreateOpen(false);
      setSelectedId(ticket.id);
      onToast?.(`Created ${ticket.id}`);
      await refresh();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (status: TicketStatus) => {
    if (!selected) return;
    if ((status === 'blocked' || status === 'abandoned') && !blockReason.trim()) {
      onToast?.('Status reason required for blocked / abandoned');
      return;
    }
    setBusy(true);
    try {
      await setTicketStatus(selected.id, {
        status,
        status_reason: blockReason.trim() || undefined,
      });
      setBlockReason('');
      onToast?.(`Marked ${status}`);
      await refresh();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Status update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lib-tickets">
      <div className="lib-tickets__banner">
        <strong>Platform engineering tickets</strong>
        <span>
          Infra / Agent Sam / telemetry work. Collaborate tasks stay client &amp; operational — do not
          merge those lists into this index.
        </span>
      </div>

      {analytics ? (
        <div className="lib-tickets__analytics">
          <div className="lib-tickets__stat-tiles">
            <div className="lib-tickets__stat">
              <span>Completion</span>
              <strong>{Math.round((analytics.completion_rate || 0) * 100)}%</strong>
            </div>
            <div className="lib-tickets__stat">
              <span>Avg cycle</span>
              <strong>
                {analytics.avg_cycle_days != null
                  ? `${analytics.avg_cycle_days.toFixed(1)}d`
                  : '—'}
              </strong>
            </div>
            <div className="lib-tickets__stat">
              <span>Oldest active</span>
              <strong>{analytics.oldest_active_days}d</strong>
            </div>
          </div>
          <div className="lib-tickets__charts">
            <div className="lib-tickets__throughput" aria-label="Shipped per week">
              <div className="lib-tickets__chart-label">Throughput (shipped / week)</div>
              <div className="lib-tickets__bars">
                {(analytics.throughput || []).map((row) => {
                  const n = Number(row.shipped) || 0;
                  const h = Math.max(4, Math.round((n / maxShipped) * 64));
                  return (
                    <div key={row.week} className="lib-tickets__bar-col" title={`${row.week}: ${n}`}>
                      <div className="lib-tickets__bar" style={{ height: h }} />
                      <em>{n}</em>
                    </div>
                  );
                })}
                {!analytics.throughput?.length ? (
                  <span className="lib-empty">No shipped events yet</span>
                ) : null}
              </div>
            </div>
            <div className="lib-tickets__donut-wrap">
              <div className="lib-tickets__chart-label">Status mix</div>
              <div className="lib-tickets__donut" style={{ background: statusDonut }} />
              <ul className="lib-tickets__donut-legend">
                {Object.entries(analytics.by_status || {}).map(([k, n]) => (
                  <li key={k}>
                    <i style={{ background: STATUS_DONUT_COLORS[k] || '#dadce0' }} />
                    {k} <em>{n}</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div className="lib-tickets__toolbar">
        <div className="lib-tickets__tabs" role="tablist">
          {(
            [
              ['open', 'Open', counts.open],
              ['blocked', 'Blocked', counts.blocked],
              ['backlog', 'Backlog', counts.backlog],
              ['done', 'Done', counts.done],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`lib-tickets__tab${tab === key ? ' is-active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
              <em>{n}</em>
            </button>
          ))}
        </div>
        <div className="lib-tickets__actions">
          <button type="button" className="lib-connect-action" onClick={() => void refresh()}>
            Refresh
          </button>
          <button
            type="button"
            className="lib-connect-action primary"
            onClick={() => setCreateOpen((v) => !v)}
          >
            New ticket
          </button>
        </div>
      </div>

      {createOpen ? (
        <div className="lib-tickets__create">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Ticket title"
            aria-label="Ticket title"
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            aria-label="Priority"
          >
            {['P0', 'P1', 'P2', 'P3'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button type="button" className="lib-connect-action primary" disabled={busy} onClick={() => void handleCreate()}>
            Create
          </button>
        </div>
      ) : null}

      {error ? <div className="lib-error">{error}</div> : null}

      <div className="lib-tickets__body">
        <div className="lib-tickets__list">
          {loading ? (
            <div className="lib-loading">Loading tickets…</div>
          ) : visible.length === 0 ? (
            <div className="lib-empty">No tickets in this tab</div>
          ) : (
            visible.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`lib-ticket-row${selectedId === t.id ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <span className={`lib-ticket-pri lib-ticket-pri--${(t.priority || 'px').toLowerCase()}`}>
                  {t.priority || '—'}
                </span>
                <span className="lib-ticket-row__main">
                  <strong>{t.title}</strong>
                  <small>
                    {t.id}
                    {t.subsystem ? ` · ${t.subsystem}` : ''}
                    {t.blocked_by?.length ? ` · blocked by ${t.blocked_by.join(', ')}` : ''}
                  </small>
                </span>
                <span className={`lib-ticket-status ${statusBadgeClass(t.status)}`}>{t.status}</span>
              </button>
            ))
          )}
        </div>

        <aside className="lib-tickets__detail">
          {selected ? (
            <>
              <h2>{selected.title}</h2>
              <dl>
                <div>
                  <dt>ID</dt>
                  <dd>
                    <code>{selected.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`lib-ticket-status ${statusBadgeClass(selected.status)}`}>
                      {selected.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{selected.priority || '—'}</dd>
                </div>
                <div>
                  <dt>Project</dt>
                  <dd>{selected.project || '—'}</dd>
                </div>
                <div>
                  <dt>Subsystem</dt>
                  <dd>{selected.subsystem || '—'}</dd>
                </div>
                {selected.doc_path ? (
                  <div>
                    <dt>Plan</dt>
                    <dd>
                      <code>{selected.doc_path}</code>
                    </dd>
                  </div>
                ) : null}
                {selected.status_reason ? (
                  <div>
                    <dt>Reason</dt>
                    <dd>{selected.status_reason}</dd>
                  </div>
                ) : null}
                {selected.blocked_by?.length ? (
                  <div>
                    <dt>Blocked by</dt>
                    <dd>{selected.blocked_by.join(', ')}</dd>
                  </div>
                ) : null}
                {selected.blocks?.length ? (
                  <div>
                    <dt>Blocks</dt>
                    <dd>{selected.blocks.join(', ')}</dd>
                  </div>
                ) : null}
              </dl>

              <label className="lib-tickets__reason">
                Status reason (required for blocked / abandoned)
                <input
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Why is this blocked or abandoned?"
                />
              </label>

              <div className="lib-tickets__status-actions">
                {(['active', 'blocked', 'backlog', 'in_review', 'shipped', 'abandoned'] as TicketStatus[]).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      className="lib-connect-action"
                      disabled={busy || selected.status === s}
                      onClick={() => void handleStatus(s)}
                    >
                      {s}
                    </button>
                  ),
                )}
              </div>
            </>
          ) : (
            <div className="lib-empty">Select a ticket to view details and update status</div>
          )}
        </aside>
      </div>
    </div>
  );
}
