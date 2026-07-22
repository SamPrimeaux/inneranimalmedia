import { useCallback, useEffect, useState } from 'react';
import {
  deleteTicket,
  fetchTicket,
  fetchTicketEvents,
  postTicketEvent,
  setTicketStatus,
  updateTicket,
  type PlatformTicket,
  type TicketEvent,
  type TicketStatus,
} from '../../../api/tickets';
import { getTicketPlaybook } from '../../lib/ticketPlaybookCatalog';

type Props = {
  ticketId: string;
  onBack: () => void;
  onToast?: (msg: string) => void;
  onDeleted?: (id: string) => void;
};

const STATUSES: TicketStatus[] = [
  'active',
  'blocked',
  'backlog',
  'in_review',
  'shipped',
  'abandoned',
];

const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];

function statusBadgeClass(status: string): string {
  if (status === 'active' || status === 'in_review') return 'is-active';
  if (status === 'blocked') return 'is-blocked';
  if (status === 'shipped') return 'is-shipped';
  if (status === 'abandoned') return 'is-abandoned';
  return 'is-backlog';
}

function formatTs(sec: number): string {
  if (!sec) return '—';
  try {
    return new Date(sec * 1000).toLocaleString();
  } catch {
    return String(sec);
  }
}

export function TicketDetailView({ ticketId, onBack, onToast, onDeleted }: Props) {
  const [ticket, setTicket] = useState<PlatformTicket | null>(null);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('P2');
  const [project, setProject] = useState('');
  const [subsystem, setSubsystem] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [docPath, setDocPath] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [note, setNote] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const playbook = ticket ? getTicketPlaybook(ticket.id) : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, ev] = await Promise.all([fetchTicket(ticketId), fetchTicketEvents(ticketId)]);
      setTicket(t);
      setEvents(ev);
      setTitle(t.title || '');
      setPriority(t.priority || 'P2');
      setProject(t.project || '');
      setSubsystem(t.subsystem || '');
      setTagsText((t.tags || []).join(', '));
      setDocPath(t.doc_path || '');
      setStatusReason(t.status_reason || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ticket');
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveFields = async () => {
    if (!ticket) return;
    const trimmed = title.trim();
    if (!trimmed) {
      onToast?.('Title required');
      return;
    }
    setBusy(true);
    try {
      const tags = tagsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await updateTicket(ticket.id, {
        title: trimmed,
        priority: priority || null,
        project: project.trim() || null,
        subsystem: subsystem.trim() || null,
        tags,
        doc_path: docPath.trim() || null,
      });
      setTicket(updated);
      onToast?.('Saved');
      const ev = await fetchTicketEvents(ticket.id);
      setEvents(ev);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (status: TicketStatus) => {
    if (!ticket) return;
    if ((status === 'blocked' || status === 'abandoned') && !statusReason.trim()) {
      onToast?.('Status reason required for blocked / abandoned');
      return;
    }
    setBusy(true);
    try {
      const updated = await setTicketStatus(ticket.id, {
        status,
        status_reason: statusReason.trim() || undefined,
      });
      setTicket(updated);
      onToast?.(`Marked ${status}`);
      const ev = await fetchTicketEvents(ticket.id);
      setEvents(ev);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Status update failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAddNote = async () => {
    if (!ticket) return;
    const detail = note.trim();
    if (!detail) return;
    setBusy(true);
    try {
      await postTicketEvent(ticket.id, { event_type: 'note', detail });
      setNote('');
      onToast?.('Note added');
      const ev = await fetchTicketEvents(ticket.id);
      setEvents(ev);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Note failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!ticket) return;
    if (deleteConfirm.trim() !== ticket.id) {
      onToast?.(`Type ${ticket.id} to confirm permanent delete`);
      return;
    }
    setBusy(true);
    try {
      await deleteTicket(ticket.id);
      onToast?.(`Deleted ${ticket.id}`);
      onDeleted?.(ticket.id);
      onBack();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="lib-ticket-detail">
        <button type="button" className="lib-ticket-detail__back" onClick={onBack}>
          ← Back to list
        </button>
        <div className="lib-loading">Loading ticket…</div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="lib-ticket-detail">
        <button type="button" className="lib-ticket-detail__back" onClick={onBack}>
          ← Back to list
        </button>
        <div className="lib-error">{error || 'Ticket not found'}</div>
      </div>
    );
  }

  return (
    <div className="lib-ticket-detail">
      <header className="lib-ticket-detail__top">
        <button type="button" className="lib-ticket-detail__back" onClick={onBack}>
          ← Back to list
        </button>
        <code className="lib-ticket-detail__id">{ticket.id}</code>
        <span className={`lib-ticket-status ${statusBadgeClass(ticket.status)}`}>{ticket.status}</span>
      </header>

      <div className="lib-ticket-detail__grid">
        <section className="lib-ticket-detail__main">
          <label className="lib-ticket-detail__field">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
          </label>

          <div className="lib-ticket-detail__row">
            <label className="lib-ticket-detail__field">
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="lib-ticket-detail__field">
              Project
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="projects.id"
                aria-label="Project"
              />
            </label>
            <label className="lib-ticket-detail__field">
              Subsystem
              <input
                value={subsystem}
                onChange={(e) => setSubsystem(e.target.value)}
                placeholder="e.g. billing"
                aria-label="Subsystem"
              />
            </label>
          </div>

          <label className="lib-ticket-detail__field">
            Tags (comma-separated)
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="infra, agent, telemetry"
              aria-label="Tags"
            />
          </label>

          <label className="lib-ticket-detail__field">
            Plan path (doc_path)
            <input
              value={docPath}
              onChange={(e) => setDocPath(e.target.value)}
              placeholder="plans/active/…"
              aria-label="Doc path"
            />
          </label>

          <div className="lib-ticket-detail__actions">
            <button
              type="button"
              className="lib-connect-action primary"
              disabled={busy}
              onClick={() => void handleSaveFields()}
            >
              Save fields
            </button>
          </div>

          {(ticket.blocked_by?.length || ticket.blocks?.length) ? (
            <div className="lib-ticket-detail__links">
              {ticket.blocked_by?.length ? (
                <div>
                  <strong>Blocked by</strong>
                  <div className="lib-ticket-detail__chips">
                    {ticket.blocked_by.map((id) => (
                      <span key={id} className="lib-ticket-chip">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {ticket.blocks?.length ? (
                <div>
                  <strong>Blocks</strong>
                  <div className="lib-ticket-detail__chips">
                    {ticket.blocks.map((id) => (
                      <span key={id} className="lib-ticket-chip">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {playbook ? (
            <div className="lib-ticket-detail__playbook">
              <strong>Queue contract</strong>
              <p>
                <em>Pass:</em> {playbook.pass}
              </p>
              <p>
                <em>Deliverable:</em> {playbook.deliverable}
              </p>
            </div>
          ) : null}

          <section className="lib-ticket-detail__status-block">
            <h3>Status</h3>
            <label className="lib-ticket-detail__field">
              Status reason (required for blocked / abandoned)
              <input
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Proof or reason…"
              />
            </label>
            <div className="lib-tickets__status-actions">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="lib-connect-action"
                  disabled={busy || ticket.status === s}
                  onClick={() => void handleStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>

          <section className="lib-ticket-detail__danger">
            <h3>Delete permanently</h3>
            <p>
              Hard delete removes this ticket and its events. Type the ticket id to confirm. Prefer
              deleting closed work older than ~90 days so metrics stay meaningful.
            </p>
            <div className="lib-ticket-detail__delete-row">
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={ticket.id}
                aria-label="Confirm delete id"
              />
              <button
                type="button"
                className="lib-connect-action danger"
                disabled={busy || deleteConfirm.trim() !== ticket.id}
                onClick={() => void handleDelete()}
              >
                Delete forever
              </button>
            </div>
          </section>
        </section>

        <aside className="lib-ticket-detail__side">
          <h3>Activity</h3>
          <label className="lib-ticket-detail__field">
            Add note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Checkpoint, proof, or context…"
            />
          </label>
          <button
            type="button"
            className="lib-connect-action primary"
            disabled={busy || !note.trim()}
            onClick={() => void handleAddNote()}
          >
            Add note
          </button>

          <ul className="lib-ticket-detail__timeline">
            {events.length === 0 ? (
              <li className="lib-empty">No events yet</li>
            ) : (
              events.map((ev) => (
                <li key={ev.id}>
                  <div className="lib-ticket-detail__ev-head">
                    <strong>{ev.event_type}</strong>
                    <time>{formatTs(ev.created_at)}</time>
                  </div>
                  {ev.from_status || ev.to_status ? (
                    <span className="lib-ticket-detail__ev-status">
                      {ev.from_status || '—'} → {ev.to_status || '—'}
                    </span>
                  ) : null}
                  {ev.detail ? <p>{ev.detail}</p> : null}
                  {ev.commit_sha ? <code>{ev.commit_sha}</code> : null}
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}

export default TicketDetailView;
