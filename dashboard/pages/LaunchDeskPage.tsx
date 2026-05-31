import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Video, X } from 'lucide-react';
import './launch-desk/launch-desk.css';

type CalView = 'week' | 'month';

interface CalEvent {
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

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtDateTime(d: Date) {
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function parseEventDate(raw: string) {
  const s = String(raw || '').trim();
  if (!s) return new Date(NaN);
  if (s.includes('T')) return new Date(s);
  return new Date(s.replace(' ', 'T'));
}

function meetRoomId(ev: CalEvent) {
  const id = ev.meet_room_id || ev.room_id;
  return id ? String(id) : null;
}

function parseAttendees(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseInviteEmails(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toSqlDatetime(isoLocal: string) {
  return new Date(isoLocal).toISOString().slice(0, 19).replace('T', ' ');
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return data as T;
}

export function LaunchDeskPage() {
  const [view, setView] = useState<CalView>('month');
  const [date, setDate] = useState(() => new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState<{ start: string; end: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [meetForm, setMeetForm] = useState({
    title: '',
    scheduled_at: '',
    duration_min: 60,
    invite_emails: '',
    description: '',
  });

  const [eventForm, setEventForm] = useState({
    title: '',
    start: '',
    end: '',
    description: '',
    withMeet: false,
    invite_emails: '',
  });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ events?: CalEvent[] }>(`/api/calendar/view/${view}`);
      setEvents(data.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const refreshAll = useCallback(async () => {
    await fetchEvents();
  }, [fetchEvents]);

  const navigate = (dir: 1 | -1) => {
    setDate((prev) => {
      const d = new Date(prev);
      if (view === 'week') d.setDate(d.getDate() + 7 * dir);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const titleText = () => {
    if (view === 'week') {
      const s = new Date(date);
      s.setDate(date.getDate() - date.getDay());
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return (
        s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' – ' +
        e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      );
    }
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const openSchedule = (start?: Date) => {
    const base = start ? new Date(start) : new Date();
    if (!start) {
      base.setMinutes(0, 0, 0);
      base.setHours(base.getHours() + 1);
    }
    setMeetForm({
      title: '',
      scheduled_at: toDatetimeLocalValue(base),
      duration_min: 60,
      invite_emails: '',
      description: '',
    });
    setFormError(null);
    setScheduleOpen(true);
  };

  const openNewEvent = (start: Date) => {
    const end = new Date(start.getTime() + 3600000);
    setEventForm({
      title: '',
      start: toDatetimeLocalValue(start),
      end: toDatetimeLocalValue(end),
      description: '',
      withMeet: false,
      invite_emails: '',
    });
    setFormError(null);
    setEventOpen({ start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) });
  };

  const submitSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const scheduled_at = meetForm.scheduled_at.replace('T', 'T').slice(0, 16);
      await apiJson('/api/meet/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: meetForm.title.trim(),
          scheduled_at,
          duration_min: meetForm.duration_min,
          invite_emails: parseInviteEmails(meetForm.invite_emails),
          description: meetForm.description.trim() || undefined,
        }),
      });
      setScheduleOpen(false);
      await refreshAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Schedule failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const attendees = parseInviteEmails(eventForm.invite_emails);
      await apiJson('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: eventForm.title.trim(),
          description: eventForm.description.trim() || null,
          start_datetime: toSqlDatetime(eventForm.start),
          end_datetime: toSqlDatetime(eventForm.end),
          event_type: eventForm.withMeet ? 'meeting' : 'event',
          attendees: eventForm.withMeet ? attendees : undefined,
        }),
      });
      setEventOpen(null);
      await refreshAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const updateEventStatus = async (id: string, status: string) => {
    await apiJson(`/api/calendar/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setSelected((prev) => (prev?.id === id ? { ...prev, status } : prev));
    await fetchEvents();
  };

  const deleteEvent = async (id: string) => {
    if (!window.confirm('Delete this event?')) return;
    await apiJson(`/api/calendar/events/${id}`, { method: 'DELETE' });
    setSelected(null);
    await fetchEvents();
  };

  const eventsForDay = (d: Date) =>
    events.filter((e) => sameDay(parseEventDate(e.start_datetime), d));

  const EventChip = ({ event }: { event: CalEvent }) => {
    const isMeeting = Boolean(meetRoomId(event)) || event.event_type === 'meeting';
    return (
      <div
        role="button"
        tabIndex={0}
        className={`ops-desk-event-chip ${isMeeting ? 'ops-desk-meeting-chip' : ''}`}
        onClick={(ev) => {
          ev.stopPropagation();
          setSelected(event);
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') setSelected(event);
        }}
      >
        {event.title}
      </div>
    );
  };

  const MonthView = () => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const now = new Date();
    const days = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });

    return (
      <div className="ops-desk-month flex-1 min-h-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] flex flex-col">
        <div className="grid grid-cols-7 shrink-0">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="ops-desk-month-head">{d}</div>
          ))}
        </div>
        <div className="ops-desk-month-grid flex-1 min-h-0">
          {days.map((day, i) => {
            const isCurrentMonth = day.getMonth() === date.getMonth();
            const isToday = sameDay(day, now);
            const dayEvs = eventsForDay(day);
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => openNewEvent(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0, 0))}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') openNewEvent(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0, 0));
                }}
                className={`ops-desk-month-cell ${isCurrentMonth ? 'current' : 'other'} ${isToday ? 'today' : ''}`}
              >
                <div className={`ops-desk-month-day ${isToday ? 'today' : ''} ${isCurrentMonth ? '' : 'muted'}`}>
                  {day.getDate()}
                </div>
                <div className="ops-desk-month-events">
                  {dayEvs.slice(0, 5).map((ev) => (
                    <EventChip key={ev.id} event={ev} />
                  ))}
                  {dayEvs.length > 5 ? (
                    <div className="ops-desk-month-more">+{dayEvs.length - 5} more</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const WeekView = () => {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    const now = new Date();
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="ops-desk-week flex-1 min-h-0 overflow-auto rounded-xl border border-[var(--border-subtle)]">
        <div className="ops-desk-week-grid">
          <div className="h-8 border-b border-r border-[var(--border-subtle)] bg-[var(--bg-panel)]" />
          {days.map((d, i) => (
            <div
              key={i}
              className={`h-8 border-b border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[11px] font-semibold text-center pt-1.5
              ${sameDay(d, now) ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'}`}
            >
              {d.toLocaleDateString('en-US', { weekday: 'short' })} {d.getDate()}
            </div>
          ))}
          {hours.map((h) => (
            <React.Fragment key={h}>
              <div className="h-14 border-b border-r border-[var(--border-subtle)] bg-[var(--bg-app)] text-[10px] text-[var(--text-muted)] text-right pr-1 pt-0.5">
                {h === 0 ? '12A' : h < 12 ? `${h}A` : h === 12 ? '12P' : `${h - 12}P`}
              </div>
              {days.map((d, di) => {
                const cellEvs = events.filter((e) => {
                  const ed = parseEventDate(e.start_datetime);
                  return sameDay(ed, d) && ed.getHours() === h;
                });
                return (
                  <div
                    key={di}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const s = new Date(d);
                      s.setHours(h, 0, 0, 0);
                      openNewEvent(s);
                    }}
                    className="ops-desk-week-cell"
                  >
                    {cellEvs.map((ev) => (
                      <EventChip key={ev.id} event={ev} />
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  const selectedRoom = selected ? meetRoomId(selected) : null;
  const selectedAttendees = selected ? parseAttendees(selected.attendees) : [];

  return (
    <div className="ops-desk">
      <header className="ops-desk-header">
        <div className="ops-desk-title-block">
          <h1>Ops Desk</h1>
          <p>Calendar and meetings</p>
        </div>
        <div className="ops-desk-header-actions">
          <div className="ops-desk-cal-nav">
            <button type="button" className="ops-desk-btn" onClick={() => setDate(new Date())}>
              Today
            </button>
            <button type="button" className="ops-desk-btn" aria-label="Previous" onClick={() => navigate(-1)}>
              <ChevronLeft size={14} />
            </button>
            <button type="button" className="ops-desk-btn" aria-label="Next" onClick={() => navigate(1)}>
              <ChevronRight size={14} />
            </button>
            <span className="ops-desk-cal-title">{titleText()}</span>
          </div>
          <div className="ops-desk-view-tabs">
            <button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
              Week
            </button>
            <button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>
              Month
            </button>
          </div>
          <button type="button" className="ops-desk-btn ops-desk-btn-primary" onClick={() => openSchedule()}>
            <Video size={14} />
            Schedule meeting
          </button>
        </div>
      </header>

      <div className="ops-desk-body">
        <div className="ops-desk-main relative">
          <div className="ops-desk-cal-body">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-[var(--solar-cyan)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : view === 'month' ? (
              <MonthView />
            ) : (
              <WeekView />
            )}
          </div>

          {selected ? (
            <>
              <div className="ops-desk-overlay" onClick={() => setSelected(null)} aria-hidden="true" />
              <div className="ops-desk-drawer-wrap">
                <aside className="ops-desk-drawer" aria-label="Event details">
                  <div className="ops-desk-drawer-head">
                    <h2>{selected.title}</h2>
                    <button type="button" className="ops-desk-btn" aria-label="Close" onClick={() => setSelected(null)}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="ops-desk-drawer-body">
                    {selected.status ? (
                      <span className={`ops-desk-badge ${selected.status}`}>{selected.status}</span>
                    ) : null}
                    {selected.description ? (
                      <p className="text-[13px] leading-relaxed">{selected.description}</p>
                    ) : null}
                    <div className="ops-desk-meta-row">
                      Start: <span>{fmtDateTime(parseEventDate(selected.start_datetime))}</span>
                    </div>
                    <div className="ops-desk-meta-row">
                      End: <span>{fmtDateTime(parseEventDate(selected.end_datetime))}</span>
                    </div>
                    {selected.location ? (
                      <div className="ops-desk-meta-row">
                        Location: <span>{selected.location}</span>
                      </div>
                    ) : null}
                    {selectedAttendees.length > 0 ? (
                      <div className="ops-desk-meta-row">
                        Invites: <span>{selectedAttendees.join(', ')}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="ops-desk-drawer-actions">
                    {selectedRoom ? (
                      <Link
                        to={`/dashboard/meet?room=${encodeURIComponent(selectedRoom)}`}
                        className="ops-desk-btn ops-desk-btn-primary"
                      >
                        <Video size={14} />
                        Join meet
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="ops-desk-btn"
                      onClick={() => { void updateEventStatus(selected.id, 'completed'); }}
                    >
                      Complete
                    </button>
                    <button
                      type="button"
                      className="ops-desk-btn"
                      onClick={() => { void deleteEvent(selected.id); }}
                    >
                      Delete
                    </button>
                  </div>
                </aside>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {scheduleOpen ? (
        <div className="ops-desk-modal-backdrop" onClick={() => setScheduleOpen(false)}>
          <div className="ops-desk-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="schedule-title">
            <div className="ops-desk-modal-head">
              <h2 id="schedule-title">Schedule meeting</h2>
              <button type="button" className="ops-desk-btn" aria-label="Close" onClick={() => setScheduleOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <form className="ops-desk-modal-form" onSubmit={submitSchedule}>
              {formError ? <div className="ops-desk-error">{formError}</div> : null}
              <div className="ops-desk-field">
                <label htmlFor="meet-title">Title</label>
                <input
                  id="meet-title"
                  required
                  value={meetForm.title}
                  onChange={(e) => setMeetForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="ops-desk-field">
                <label htmlFor="meet-when">Start</label>
                <input
                  id="meet-when"
                  type="datetime-local"
                  required
                  value={meetForm.scheduled_at}
                  onChange={(e) => setMeetForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                />
              </div>
              <div className="ops-desk-field">
                <label htmlFor="meet-dur">Duration</label>
                <select
                  id="meet-dur"
                  value={meetForm.duration_min}
                  onChange={(e) => setMeetForm((f) => ({ ...f, duration_min: Number(e.target.value) }))}
                >
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                </select>
              </div>
              <div className="ops-desk-field">
                <label htmlFor="meet-invites">Invite emails (comma-separated)</label>
                <textarea
                  id="meet-invites"
                  value={meetForm.invite_emails}
                  onChange={(e) => setMeetForm((f) => ({ ...f, invite_emails: e.target.value }))}
                  placeholder="sam@example.com, guest@example.com"
                />
              </div>
              <div className="ops-desk-field">
                <label htmlFor="meet-desc">Notes</label>
                <textarea
                  id="meet-desc"
                  value={meetForm.description}
                  onChange={(e) => setMeetForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="ops-desk-modal-foot">
                <button type="submit" className="ops-desk-btn ops-desk-btn-primary" disabled={submitting}>
                  {submitting ? 'Scheduling…' : 'Schedule'}
                </button>
                <button type="button" className="ops-desk-btn" onClick={() => setScheduleOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {eventOpen ? (
        <div className="ops-desk-modal-backdrop" onClick={() => setEventOpen(null)}>
          <div className="ops-desk-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="event-title">
            <div className="ops-desk-modal-head">
              <h2 id="event-title">New event</h2>
              <button type="button" className="ops-desk-btn" aria-label="Close" onClick={() => setEventOpen(null)}>
                <X size={14} />
              </button>
            </div>
            <form className="ops-desk-modal-form" onSubmit={submitEvent}>
              {formError ? <div className="ops-desk-error">{formError}</div> : null}
              <div className="ops-desk-field">
                <label htmlFor="ev-title">Title</label>
                <input
                  id="ev-title"
                  required
                  value={eventForm.title}
                  onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="ops-desk-field">
                <label htmlFor="ev-start">Start</label>
                <input
                  id="ev-start"
                  type="datetime-local"
                  required
                  value={eventForm.start}
                  onChange={(e) => setEventForm((f) => ({ ...f, start: e.target.value }))}
                />
              </div>
              <div className="ops-desk-field">
                <label htmlFor="ev-end">End</label>
                <input
                  id="ev-end"
                  type="datetime-local"
                  required
                  value={eventForm.end}
                  onChange={(e) => setEventForm((f) => ({ ...f, end: e.target.value }))}
                />
              </div>
              <div className="ops-desk-field">
                <label htmlFor="ev-desc">Description</label>
                <textarea
                  id="ev-desc"
                  value={eventForm.description}
                  onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={eventForm.withMeet}
                  onChange={(e) => setEventForm((f) => ({ ...f, withMeet: e.target.checked }))}
                />
                Include video call + send invites
              </label>
              {eventForm.withMeet ? (
                <div className="ops-desk-field">
                  <label htmlFor="ev-invites">Invite emails</label>
                  <textarea
                    id="ev-invites"
                    value={eventForm.invite_emails}
                    onChange={(e) => setEventForm((f) => ({ ...f, invite_emails: e.target.value }))}
                  />
                </div>
              ) : null}
              <div className="ops-desk-modal-foot">
                <button type="submit" className="ops-desk-btn ops-desk-btn-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create'}
                </button>
                <button type="button" className="ops-desk-btn" onClick={() => setEventOpen(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LaunchDeskPage;
