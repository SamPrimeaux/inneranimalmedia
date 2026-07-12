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
import {
  getTicketPlaybook,
  TICKET_PLAYBOOK_DEPS,
  TICKET_PLAYBOOK_EXEC_ORDER,
  TICKET_PLAYBOOK_NEXT_BATCH,
  type TicketPlaybookEntry,
} from '../../lib/ticketPlaybookCatalog';

type Props = {
  onToast?: (msg: string) => void;
};

type Tab = 'open' | 'blocked' | 'backlog' | 'done';
type ViewMode = 'board' | 'playbook';

const OPEN_STATUSES = new Set<TicketStatus>(['active', 'in_review']);
const DONE_STATUSES = new Set<TicketStatus>(['shipped', 'abandoned']);
const WORKABLE = new Set(['active', 'in_review', 'blocked', 'backlog']);

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

function priorityRank(p: string | null): number {
  const u = String(p || '').toUpperCase();
  if (u === 'P0') return 0;
  if (u === 'P1') return 1;
  if (u === 'P2') return 2;
  if (u === 'P3') return 3;
  return 4;
}

function statusRank(s: string): number {
  if (s === 'blocked') return 0;
  if (s === 'active') return 1;
  if (s === 'in_review') return 2;
  if (s === 'backlog') return 3;
  return 4;
}

function sortPlaybookTickets(a: PlatformTicket, b: PlatformTicket): number {
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  const sr = statusRank(a.status) - statusRank(b.status);
  if (sr !== 0) return sr;
  return String(a.id).localeCompare(String(b.id));
}

function PlaybookCard({
  ticket,
  playbook,
  selected,
  onSelect,
}: {
  ticket: PlatformTicket;
  playbook: TicketPlaybookEntry | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`lib-playbook-card${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <header className="lib-playbook-card__head">
        <code>{ticket.id}</code>
        <div className="lib-playbook-card__pills">
          <span className={`lib-ticket-pri lib-ticket-pri--${(ticket.priority || 'px').toLowerCase()}`}>
            {ticket.priority || '—'}
          </span>
          <span className={`lib-ticket-status ${statusBadgeClass(ticket.status)}`}>{ticket.status}</span>
          {ticket.subsystem ? <span className="lib-playbook-pill">{ticket.subsystem}</span> : null}
        </div>
      </header>
      <h3>{ticket.title}</h3>
      {playbook ? (
        <div className="lib-playbook-card__body">
          <section>
            <strong>What it is</strong>
            <p>{playbook.what}</p>
          </section>
          <section>
            <strong>Needed</strong>
            <p>{playbook.needed}</p>
          </section>
          <div className="lib-playbook-card__pf">
            <section>
              <strong>Pass</strong>
              <p>{playbook.pass}</p>
            </section>
            <section>
              <strong>Fail</strong>
              <p>{playbook.fail}</p>
            </section>
          </div>
          <section>
            <strong>Deliverable</strong>
            <p>{playbook.deliverable}</p>
          </section>
          <section>
            <strong>Recommended steps</strong>
            <p>{playbook.steps}</p>
          </section>
          {(ticket.doc_path || ticket.blocked_by?.length || ticket.blocks?.length) && (
            <p className="lib-playbook-card__meta">
              {ticket.blocked_by?.length ? `Blocked by: ${ticket.blocked_by.join(', ')}` : ''}
              {ticket.blocked_by?.length && ticket.blocks?.length ? ' · ' : ''}
              {ticket.blocks?.length ? `Blocks: ${ticket.blocks.join(', ')}` : ''}
              {(ticket.blocked_by?.length || ticket.blocks?.length) && ticket.doc_path ? ' · ' : ''}
              {ticket.doc_path ? `Doc: ${ticket.doc_path}` : ''}
            </p>
          )}
        </div>
      ) : (
        <p className="lib-playbook-card__fallback">
          {ticket.status_reason ||
            'No playbook contract yet — use title, status reason, and plan path until one is authored.'}
          {ticket.doc_path ? (
            <>
              <br />
              <code>{ticket.doc_path}</code>
            </>
          ) : null}
        </p>
      )}
    </article>
  );
}

function PlaybookSection({
  title,
  tickets,
  selectedId,
  onSelect,
  defaultOpen = true,
}: {
  title: string;
  tickets: PlatformTicket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!tickets.length) return null;
  return (
    <section className="lib-playbook-section">
      <button
        type="button"
        className="lib-playbook-section__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? '▾' : '▸'}</span>
        {title}
        <em>{tickets.length}</em>
      </button>
      {open ? (
        <div className="lib-playbook-section__cards">
          {tickets.map((t) => (
            <PlaybookCard
              key={t.id}
              ticket={t}
              playbook={getTicketPlaybook(t.id)}
              selected={selectedId === t.id}
              onSelect={() => onSelect(t.id)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function LibraryTicketsSurface({ onToast }: Props) {
  const [tickets, setTickets] = useState<PlatformTicket[]>([]);
  const [analytics, setAnalytics] = useState<TicketAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [viewMode, setViewMode] = useState<ViewMode>('playbook');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('P2');
  const [newProject, setNewProject] = useState('');
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

  const priorityStats = useMemo(() => {
    const openish = tickets.filter((t) => WORKABLE.has(t.status));
    let p0 = 0;
    let p1 = 0;
    let p2p3 = 0;
    let blocked = 0;
    for (const t of openish) {
      if (t.status === 'blocked') blocked += 1;
      const u = String(t.priority || '').toUpperCase();
      if (u === 'P0') p0 += 1;
      else if (u === 'P1') p1 += 1;
      else p2p3 += 1;
    }
    return { p0, p1, p2p3, blocked, total: openish.length };
  }, [tickets]);

  const playbookGroups = useMemo(() => {
    const openish = tickets.filter((t) => WORKABLE.has(t.status)).sort(sortPlaybookTickets);
    return {
      inReview: openish.filter((t) => t.status === 'in_review'),
      active: openish.filter((t) => t.status === 'active'),
      p0Backlog: openish.filter(
        (t) => t.status === 'backlog' && String(t.priority || '').toUpperCase() === 'P0',
      ),
      p1Blocked: openish.filter(
        (t) =>
          (t.status === 'backlog' || t.status === 'blocked') &&
          String(t.priority || '').toUpperCase() === 'P1',
      ),
      p2p3: openish.filter((t) => {
        const p = String(t.priority || '').toUpperCase();
        return (p === 'P2' || p === 'P3' || !p) && (t.status === 'backlog' || t.status === 'blocked');
      }),
    };
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
  const selectedPlaybook = selected ? getTicketPlaybook(selected.id) : null;

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
      const project = newProject.trim() || undefined;
      const ticket = await createTicket({
        title,
        priority: newPriority,
        status: 'backlog',
        ...(project ? { project } : {}),
        subsystem: 'platform',
      });
      setNewTitle('');
      setNewProject('');
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
          Infra / Agent Sam / telemetry work. Playbook view is the in-app acceptance contract (pass /
          fail / deliverable) — same idea as the Cursor Canvas prototype, backed by live D1 rows.
        </span>
      </div>

      <div className="lib-tickets__toolbar">
        <div className="lib-tickets__tabs" role="tablist" aria-label="View mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'playbook'}
            className={`lib-tickets__tab${viewMode === 'playbook' ? ' is-active' : ''}`}
            onClick={() => setViewMode('playbook')}
          >
            Playbook
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'board'}
            className={`lib-tickets__tab${viewMode === 'board' ? ' is-active' : ''}`}
            onClick={() => setViewMode('board')}
          >
            Board
          </button>
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
          <input
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
            placeholder="projects.id (optional — e.g. inneranimalmedia)"
            aria-label="Project id"
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
          <button
            type="button"
            className="lib-connect-action primary"
            disabled={busy}
            onClick={() => void handleCreate()}
          >
            Create
          </button>
        </div>
      ) : null}

      {error ? <div className="lib-error">{error}</div> : null}

      {viewMode === 'playbook' ? (
        <div className="lib-playbook">
          {loading ? (
            <div className="lib-loading">Loading playbook…</div>
          ) : (
            <>
              <div className="lib-playbook__stats">
                <div className="lib-playbook__stat is-p0">
                  <strong>{priorityStats.p0}</strong>
                  <span>P0 open</span>
                </div>
                <div className="lib-playbook__stat is-p1">
                  <strong>{priorityStats.p1}</strong>
                  <span>P1 open</span>
                </div>
                <div className="lib-playbook__stat">
                  <strong>{priorityStats.p2p3}</strong>
                  <span>P2/P3</span>
                </div>
                <div className="lib-playbook__stat is-blocked">
                  <strong>{priorityStats.blocked}</strong>
                  <span>Blocked</span>
                </div>
              </div>

              <div className="lib-playbook__callout">
                <strong>Recommended execution order</strong>
                <p>{TICKET_PLAYBOOK_EXEC_ORDER}</p>
              </div>

              <div className="lib-playbook__batch">
                <h2>Suggested next batch</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Why now</th>
                      <th>Validation shortcut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TICKET_PLAYBOOK_NEXT_BATCH.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <code>{row.id}</code>
                        </td>
                        <td>{row.why}</td>
                        <td>{row.validation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lib-playbook__deps">
                <h2>Dependency sketch</h2>
                <ul>
                  {TICKET_PLAYBOOK_DEPS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>

              <PlaybookSection
                title="In review — close with proof"
                tickets={playbookGroups.inReview}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <PlaybookSection
                title="Active — work in flight"
                tickets={playbookGroups.active}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <PlaybookSection
                title="P0 backlog"
                tickets={playbookGroups.p0Backlog}
                selectedId={selectedId}
                onSelect={setSelectedId}
                defaultOpen={false}
              />
              <PlaybookSection
                title="P1 backlog + blocked"
                tickets={playbookGroups.p1Blocked}
                selectedId={selectedId}
                onSelect={setSelectedId}
                defaultOpen={false}
              />
              <PlaybookSection
                title="P2 / P3"
                tickets={playbookGroups.p2p3}
                selectedId={selectedId}
                onSelect={setSelectedId}
                defaultOpen={false}
              />

              <p className="lib-playbook__howto">
                How to mark pass: attach concrete proof in status_reason (session id, decision id,
                SQL COUNT, or commit SHA). Set shipped only after Gate 1–4 if code changed.
                Process-only tickets need a written checkpoint note, not a deploy.
              </p>

              {selected ? (
                <aside className="lib-playbook__selected">
                  <h2>Update status · {selected.id}</h2>
                  {selectedPlaybook ? (
                    <p className="lib-playbook__selected-pass">
                      <strong>Pass gate:</strong> {selectedPlaybook.pass}
                    </p>
                  ) : null}
                  <label className="lib-tickets__reason">
                    Status reason (required for blocked / abandoned; use for proof on ship)
                    <input
                      value={blockReason}
                      onChange={(e) => setBlockReason(e.target.value)}
                      placeholder="Proof or reason…"
                    />
                  </label>
                  <div className="lib-tickets__status-actions">
                    {(
                      ['active', 'blocked', 'backlog', 'in_review', 'shipped', 'abandoned'] as TicketStatus[]
                    ).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="lib-connect-action"
                        disabled={busy || selected.status === s}
                        onClick={() => void handleStatus(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </aside>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <>
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
          </div>

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

                  {selectedPlaybook ? (
                    <div className="lib-tickets__playbook-snip">
                      <strong>Playbook pass</strong>
                      <p>{selectedPlaybook.pass}</p>
                    </div>
                  ) : null}

                  <label className="lib-tickets__reason">
                    Status reason (required for blocked / abandoned)
                    <input
                      value={blockReason}
                      onChange={(e) => setBlockReason(e.target.value)}
                      placeholder="Why is this blocked or abandoned?"
                    />
                  </label>

                  <div className="lib-tickets__status-actions">
                    {(
                      ['active', 'blocked', 'backlog', 'in_review', 'shipped', 'abandoned'] as TicketStatus[]
                    ).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="lib-connect-action"
                        disabled={busy || selected.status === s}
                        onClick={() => void handleStatus(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="lib-empty">Select a ticket to view details and update status</div>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
