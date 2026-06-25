import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Mail,
  MessageSquareText,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  Video,
  X,
} from 'lucide-react';
import { OpsDeskDayView } from './launch-desk/OpsDeskDayView';
import { OpsDeskEventView } from './launch-desk/OpsDeskEventView';
import {
  apiJson,
  CalEvent,
  CalView,
  fetchDayEvents,
  meetRoomId,
  OpsSurface,
  parseEventDate,
  parseInviteEmails,
  sameDay,
  toDatetimeLocalValue,
  toSqlDatetime,
} from './launch-desk/ops-desk-types';
import './launch-desk/launch-desk.css';

type QuickCreateMode = 'meeting' | 'event';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

function startOfWeek(d: Date) {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function timeLabel(hour: number) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function shortTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function isMeeting(ev: CalEvent) {
  return Boolean(meetRoomId(ev)) || ev.event_type === 'meeting';
}

function cleanTitle(title: string | null | undefined) {
  const t = String(title || '').trim();
  return t || 'Untitled';
}

export function LaunchDeskPage() {
  const routerNavigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<CalView>('month');
  const [surface, setSurface] = useState<OpsSurface>('calendar');
  const [date, setDate] = useState(() => new Date());
  const [focusDay, setFocusDay] = useState<Date | null>(null);
  const [dayEvents, setDayEvents] = useState<CalEvent[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState<{ start: string; end: string } | null>(null);
  const [quickMode, setQuickMode] = useState<QuickCreateMode>('meeting');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      setEvents((data.events ?? []).sort((a, b) => parseEventDate(a.start_datetime).getTime() - parseEventDate(b.start_datetime).getTime()));
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [view]);

  const loadDayEvents = useCallback(async (day: Date) => {
    setDayLoading(true);
    try {
      setDayEvents(await fetchDayEvents(day));
    } catch {
      setDayEvents([]);
    } finally {
      setDayLoading(false);
    }
  }, []);

  useEffect(() => {
    if (surface === 'calendar') void fetchEvents();
  }, [fetchEvents, surface]);

  useEffect(() => {
    if (surface === 'day' && focusDay) void loadDayEvents(focusDay);
  }, [focusDay, loadDayEvents, surface]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const refreshAll = useCallback(async () => {
    await fetchEvents();
    if (focusDay) {
      const fresh = await fetchDayEvents(focusDay);
      setDayEvents(fresh);
      if (selected) {
        const updated = fresh.find((e) => e.id === selected.id);
        if (updated) setSelected(updated);
      }
    }
  }, [fetchEvents, focusDay, selected]);

  const eventsForDay = useCallback((d: Date) => events.filter((e) => sameDay(parseEventDate(e.start_datetime), d)), [events]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)), [date]);

  const weekEvents = useMemo(() => {
    const keys = new Set(weekDays.map(dayKey));
    return events.filter((ev) => keys.has(dayKey(parseEventDate(ev.start_datetime))));
  }, [events, weekDays]);

  const todayEvents = useMemo(() => eventsForDay(today), [eventsForDay, today]);
  const meetingCount = useMemo(() => weekEvents.filter(isMeeting).length, [weekEvents]);
  const bookedMinutesToday = useMemo(() => todayEvents.reduce((sum, ev) => sum + minutesBetween(parseEventDate(ev.start_datetime), parseEventDate(ev.end_datetime)), 0), [todayEvents]);
  const upcomingEvents = useMemo(() => events.filter((ev) => parseEventDate(ev.end_datetime).getTime() >= Date.now()).slice(0, 6), [events]);

  const titleText = () => {
    if (view === 'week') {
      const s = startOfWeek(date);
      const e = addDays(s, 6);
      return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const openDayView = (day: Date) => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    setFocusDay(d);
    setDate(d);
    setSelected(null);
    setSurface('day');
  };

  const openEventView = (ev: CalEvent) => {
    setSelected(ev);
    setSurface('event');
  };

  const backToCalendar = () => {
    setSurface('calendar');
    setFocusDay(null);
    setSelected(null);
  };

  const backToDay = () => {
    setSurface('day');
    setSelected(null);
  };

  const shiftFocusDay = (dir: 1 | -1) => {
    if (!focusDay) return;
    const d = addDays(focusDay, dir);
    setFocusDay(d);
    setDate(d);
  };

  const shiftCalendar = (dir: 1 | -1) => {
    setDate((prev) => {
      const d = new Date(prev);
      if (view === 'week') d.setDate(d.getDate() + 7 * dir);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const openSchedule = (start?: Date) => {
    const base = start ? new Date(start) : focusDay ? new Date(focusDay) : new Date();
    if (!start && !focusDay) {
      base.setMinutes(0, 0, 0);
      base.setHours(base.getHours() + 1);
    } else if (!start) {
      base.setHours(9, 0, 0, 0);
    }
    setMeetForm({ title: '', scheduled_at: toDatetimeLocalValue(base), duration_min: 60, invite_emails: '', description: '' });
    setQuickMode('meeting');
    setFormError(null);
    setScheduleOpen(true);
  };

  const openNewEvent = (start: Date, withMeet = false) => {
    const end = new Date(start.getTime() + 3600000);
    setEventForm({ title: '', start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end), description: '', withMeet, invite_emails: '' });
    setQuickMode(withMeet ? 'meeting' : 'event');
    setFormError(null);
    setEventOpen({ start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) });
  };

  const submitSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await apiJson('/api/meet/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: meetForm.title.trim(),
          scheduled_at: meetForm.scheduled_at.slice(0, 16),
          duration_min: meetForm.duration_min,
          invite_emails: parseInviteEmails(meetForm.invite_emails),
          description: meetForm.description.trim() || undefined,
        }),
      });
      setScheduleOpen(false);
      setToast('Meeting scheduled');
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
      setToast(eventForm.withMeet ? 'Event + meeting created' : 'Event created');
      await refreshAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const updateEventStatus = async (id: string, status: string) => {
    await apiJson(`/api/calendar/events/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    setSelected((prev) => (prev?.id === id ? { ...prev, status } : prev));
    setToast(status === 'completed' ? 'Marked complete' : 'Event updated');
    await refreshAll();
  };

  const deleteEvent = async (id: string) => {
    if (!window.confirm('Delete this event?')) return;
    await apiJson(`/api/calendar/events/${id}`, { method: 'DELETE' });
    setSelected(null);
    setSurface(focusDay ? 'day' : 'calendar');
    setToast('Event deleted');
    await refreshAll();
  };

  const EventChip = ({ event }: { event: CalEvent }) => (
    <button type="button" className={`ops-desk-event-chip ${isMeeting(event) ? 'ops-desk-meeting-chip' : ''}`} onClick={(ev) => { ev.stopPropagation(); openEventView(event); }}>
      <span className="ops-desk-event-time">{shortTime(parseEventDate(event.start_datetime))}</span>
      <span className="ops-desk-event-title">{cleanTitle(event.title)}</span>
    </button>
  );

  const MiniCalendar = () => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    return (
      <div className="ops-desk-mini-cal">
        <div className="ops-desk-mini-head">
          <span>{date.toLocaleDateString('en-US', { month: 'long' })}</span>
          <span>{date.getFullYear()}</span>
        </div>
        <div className="ops-desk-mini-grid ops-desk-mini-weekdays">{WEEKDAYS.map((d) => <span key={d}>{d[0]}</span>)}</div>
        <div className="ops-desk-mini-grid">
          {days.map((d) => {
            const current = d.getMonth() === date.getMonth();
            const active = sameDay(d, date);
            const has = eventsForDay(d).length > 0;
            return (
              <button key={dayKey(d)} type="button" className={`${current ? '' : 'muted'} ${active ? 'active' : ''} ${has ? 'has-dot' : ''}`} onClick={() => setDate(d)}>
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const MonthView = () => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    return (
      <div className="ops-desk-month flex-1 min-h-0 overflow-hidden">
        <div className="ops-desk-month-head-row">{WEEKDAYS.map((d) => <div key={d} className="ops-desk-month-head">{d}</div>)}</div>
        <div className="ops-desk-month-grid flex-1 min-h-0">
          {days.map((day) => {
            const dayEvs = eventsForDay(day);
            const current = day.getMonth() === date.getMonth();
            const active = sameDay(day, today);
            return (
              <div key={dayKey(day)} role="button" tabIndex={0} className={`ops-desk-month-cell ${current ? 'current' : 'other'} ${active ? 'today' : ''}`} onClick={() => openDayView(day)} onKeyDown={(ev) => { if (ev.key === 'Enter') openDayView(day); }}>
                <div className="ops-desk-month-cell-top">
                  <span className="ops-desk-month-day">{day.getDate()}</span>
                  <button type="button" className="ops-desk-cell-add" aria-label="Add event" onClick={(ev) => { ev.stopPropagation(); const s = new Date(day); s.setHours(9, 0, 0, 0); openNewEvent(s); }}><Plus size={12} /></button>
                </div>
                <div className="ops-desk-month-events">
                  {dayEvs.slice(0, 4).map((ev) => <EventChip key={ev.id} event={ev} />)}
                  {dayEvs.length > 4 ? <div className="ops-desk-month-more">+{dayEvs.length - 4} more</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const WeekView = () => (
    <div className="ops-desk-week flex-1 min-h-0 overflow-auto">
      <div className="ops-desk-week-grid">
        <div className="ops-desk-week-corner" />
        {weekDays.map((d) => (
          <button key={dayKey(d)} type="button" className={`ops-desk-week-day-head ${sameDay(d, today) ? 'today' : ''}`} onClick={() => openDayView(d)}>
            <span>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <strong>{d.getDate()}</strong>
          </button>
        ))}
        {HOURS.map((h) => (
          <React.Fragment key={h}>
            <div className="ops-desk-week-hour-label">{timeLabel(h)}</div>
            {weekDays.map((d) => {
              const cellEvs = events.filter((e) => {
                const ed = parseEventDate(e.start_datetime);
                return sameDay(ed, d) && ed.getHours() === h;
              });
              return (
                <button key={`${dayKey(d)}-${h}`} type="button" className="ops-desk-week-cell" onClick={() => { const s = new Date(d); s.setHours(h, 0, 0, 0); openNewEvent(s); }}>
                  {cellEvs.map((ev) => <EventChip key={ev.id} event={ev} />)}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  const renderCalendarSurface = () => (
    <>
      <header className="ops-desk-header">
        <div className="ops-desk-title-block">
          <div className="ops-desk-kicker"><Sparkles size={13} /> Command workspace</div>
          <h1>Collaborate</h1>
          <p>Calendar, mail, meetings, and the next useful action in one clean surface.</p>
        </div>
        <div className="ops-desk-command-cards">
          <button type="button" className="ops-desk-command-card" onClick={() => routerNavigate('/dashboard/mail')}>
            <Mail size={16} /><span><strong>Mail</strong><small>Inbox & replies</small></span>
          </button>
          <button type="button" className="ops-desk-command-card" onClick={() => routerNavigate('/dashboard/meet')}>
            <Video size={16} /><span><strong>Meet</strong><small>Rooms & calls</small></span>
          </button>
          <button type="button" className="ops-desk-command-card primary" onClick={() => openSchedule()}>
            <CalendarPlus size={16} /><span><strong>Schedule</strong><small>Create invite</small></span>
          </button>
        </div>
      </header>

      <div className="ops-desk-shell">
        <aside className="ops-desk-left-panel">
          <button type="button" className="ops-desk-create-btn" onClick={() => openSchedule()}><Plus size={16} /> Create</button>
          <MiniCalendar />
          <div className="ops-desk-side-card">
            <div className="ops-desk-side-card-head"><Clock3 size={14} /> Today</div>
            <div className="ops-desk-stat-row"><span>Events</span><strong>{todayEvents.length}</strong></div>
            <div className="ops-desk-stat-row"><span>Booked</span><strong>{Math.floor(bookedMinutesToday / 60)}h {bookedMinutesToday % 60}m</strong></div>
            <div className="ops-desk-stat-row"><span>Meetings this week</span><strong>{meetingCount}</strong></div>
          </div>
          <div className="ops-desk-side-card">
            <div className="ops-desk-side-card-head"><Send size={14} /> Quick actions</div>
            <button type="button" className="ops-desk-side-action" onClick={() => routerNavigate('/dashboard/mail')}>Draft reply</button>
            <button type="button" className="ops-desk-side-action" onClick={() => routerNavigate('/dashboard/meet')}>Start room</button>
          </div>
        </aside>

        <section className="ops-desk-center-panel">
          <div className="ops-desk-toolbar">
            <div className="ops-desk-cal-nav">
              <button type="button" className="ops-desk-btn" onClick={() => setDate(new Date())}>Today</button>
              <button type="button" className="ops-desk-btn icon" aria-label="Previous" onClick={() => shiftCalendar(-1)}><ChevronLeft size={15} /></button>
              <button type="button" className="ops-desk-btn icon" aria-label="Next" onClick={() => shiftCalendar(1)}><ChevronRight size={15} /></button>
              <span className="ops-desk-cal-title">{titleText()}</span>
            </div>
            <div className="ops-desk-toolbar-right">
              <div className="ops-desk-view-tabs">
                <button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
                <button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
              </div>
              <button type="button" className="ops-desk-btn icon" title="Refresh" onClick={() => void refreshAll()}><RefreshCw size={14} /></button>
            </div>
          </div>
          <div className="ops-desk-cal-body">
            {loading ? <div className="ops-desk-loading"><div /></div> : view === 'month' ? <MonthView /> : <WeekView />}
          </div>
        </section>

        <aside className="ops-desk-right-panel">
          <div className="ops-desk-insight-card hero">
            <div className="ops-desk-insight-title"><CalendarDays size={15} /> Time insights</div>
            <div className="ops-desk-ring" style={{ '--ops-ring': `${Math.min(100, Math.max(8, meetingCount * 12))}%` } as React.CSSProperties}><span>{meetingCount}</span><small>meets</small></div>
            <p>{meetingCount ? 'Meeting load is visible. Keep the center view for planning, then jump into Meet when it is time.' : 'No meeting load yet. Schedule the first conversation when you are ready.'}</p>
          </div>
          <div className="ops-desk-insight-card">
            <div className="ops-desk-insight-title"><Users size={15} /> Upcoming</div>
            <div className="ops-desk-upcoming-list">
              {upcomingEvents.length ? upcomingEvents.map((ev) => (
                <button type="button" key={ev.id} className="ops-desk-upcoming-item" onClick={() => openEventView(ev)}>
                  <span className={isMeeting(ev) ? 'meet-dot' : 'event-dot'} />
                  <span><strong>{cleanTitle(ev.title)}</strong><small>{parseEventDate(ev.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {shortTime(parseEventDate(ev.start_datetime))}</small></span>
                </button>
              )) : <div className="ops-desk-empty-mini">Nothing scheduled yet.</div>}
            </div>
          </div>
          <div className="ops-desk-insight-card">
            <div className="ops-desk-insight-title"><CheckCircle2 size={15} /> Collab health</div>
            <div className="ops-desk-health-row"><span>Mail access</span><button onClick={() => routerNavigate('/dashboard/mail')}>Open</button></div>
            <div className="ops-desk-health-row"><span>Meeting room</span><button onClick={() => routerNavigate('/dashboard/meet')}>Join</button></div>
            <div className="ops-desk-health-row"><span>Calendar route</span><strong>Active</strong></div>
          </div>
        </aside>
      </div>
    </>
  );

  return (
    <div className="ops-desk">
      {surface === 'calendar' ? renderCalendarSurface() : null}

      {surface === 'day' && focusDay ? (
        <div className="ops-desk-detail-host">
          <OpsDeskDayView day={focusDay} events={dayEvents} loading={dayLoading} onBack={backToCalendar} onPrevDay={() => shiftFocusDay(-1)} onNextDay={() => shiftFocusDay(1)} onOpenEvent={openEventView} onAddEvent={openNewEvent} onScheduleMeeting={openSchedule} />
        </div>
      ) : null}

      {surface === 'event' && selected ? (
        <div className="ops-desk-detail-host">
          <OpsDeskEventView event={selected} onBack={backToDay} onComplete={(id) => { void updateEventStatus(id, 'completed'); }} onDelete={(id) => { void deleteEvent(id); }} />
        </div>
      ) : null}

      {scheduleOpen ? (
        <div className="ops-desk-modal-backdrop" onClick={() => setScheduleOpen(false)}>
          <div className="ops-desk-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="schedule-title">
            <div className="ops-desk-modal-head"><span><Video size={16} /><h2 id="schedule-title">Schedule meeting</h2></span><button type="button" className="ops-desk-btn icon" aria-label="Close" onClick={() => setScheduleOpen(false)}><X size={14} /></button></div>
            <form className="ops-desk-modal-form" onSubmit={submitSchedule}>
              {formError ? <div className="ops-desk-error">{formError}</div> : null}
              <div className="ops-desk-field"><label htmlFor="meet-title">Title</label><input id="meet-title" required value={meetForm.title} onChange={(e) => setMeetForm((f) => ({ ...f, title: e.target.value }))} placeholder="Client sync, launch review, planning call" /></div>
              <div className="ops-desk-form-grid"><div className="ops-desk-field"><label htmlFor="meet-when">Start</label><input id="meet-when" type="datetime-local" required value={meetForm.scheduled_at} onChange={(e) => setMeetForm((f) => ({ ...f, scheduled_at: e.target.value }))} /></div><div className="ops-desk-field"><label htmlFor="meet-dur">Duration</label><select id="meet-dur" value={meetForm.duration_min} onChange={(e) => setMeetForm((f) => ({ ...f, duration_min: Number(e.target.value) }))}><option value={30}>30 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option></select></div></div>
              <div className="ops-desk-field"><label htmlFor="meet-invites">Invite emails</label><textarea id="meet-invites" value={meetForm.invite_emails} onChange={(e) => setMeetForm((f) => ({ ...f, invite_emails: e.target.value }))} placeholder="sam@example.com, guest@example.com" /></div>
              <div className="ops-desk-field"><label htmlFor="meet-desc">Notes</label><textarea id="meet-desc" value={meetForm.description} onChange={(e) => setMeetForm((f) => ({ ...f, description: e.target.value }))} placeholder="Agenda, links, prep notes" /></div>
              <div className="ops-desk-modal-foot"><button type="button" className="ops-desk-btn" onClick={() => setScheduleOpen(false)}>Cancel</button><button type="submit" className="ops-desk-btn ops-desk-btn-primary" disabled={submitting}>{submitting ? 'Scheduling…' : 'Schedule meeting'}</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {eventOpen ? (
        <div className="ops-desk-modal-backdrop" onClick={() => setEventOpen(null)}>
          <div className="ops-desk-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="event-title">
            <div className="ops-desk-modal-head"><span><CalendarPlus size={16} /><h2 id="event-title">New event</h2></span><button type="button" className="ops-desk-btn icon" aria-label="Close" onClick={() => setEventOpen(null)}><X size={14} /></button></div>
            <form className="ops-desk-modal-form" onSubmit={submitEvent}>
              {formError ? <div className="ops-desk-error">{formError}</div> : null}
              <div className="ops-desk-mode-switch"><button type="button" className={quickMode === 'event' ? 'active' : ''} onClick={() => { setQuickMode('event'); setEventForm((f) => ({ ...f, withMeet: false })); }}><CalendarDays size={14} /> Event</button><button type="button" className={quickMode === 'meeting' ? 'active' : ''} onClick={() => { setQuickMode('meeting'); setEventForm((f) => ({ ...f, withMeet: true })); }}><Video size={14} /> Meeting</button></div>
              <div className="ops-desk-field"><label htmlFor="ev-title">Title</label><input id="ev-title" required value={eventForm.title} onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} /></div>
              <div className="ops-desk-form-grid"><div className="ops-desk-field"><label htmlFor="ev-start">Start</label><input id="ev-start" type="datetime-local" required value={eventForm.start} onChange={(e) => setEventForm((f) => ({ ...f, start: e.target.value }))} /></div><div className="ops-desk-field"><label htmlFor="ev-end">End</label><input id="ev-end" type="datetime-local" required value={eventForm.end} onChange={(e) => setEventForm((f) => ({ ...f, end: e.target.value }))} /></div></div>
              <div className="ops-desk-field"><label htmlFor="ev-desc">Description</label><textarea id="ev-desc" value={eventForm.description} onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))} /></div>
              {eventForm.withMeet ? <div className="ops-desk-field"><label htmlFor="ev-invites">Invite emails</label><textarea id="ev-invites" value={eventForm.invite_emails} onChange={(e) => setEventForm((f) => ({ ...f, invite_emails: e.target.value }))} /></div> : null}
              <div className="ops-desk-modal-foot"><button type="button" className="ops-desk-btn" onClick={() => setEventOpen(null)}>Cancel</button><button type="submit" className="ops-desk-btn ops-desk-btn-primary" disabled={submitting}>{submitting ? 'Creating…' : 'Create'}</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {toast ? <div className="ops-desk-toast"><CheckCircle2 size={15} /> {toast}</div> : null}
    </div>
  );
}

export default LaunchDeskPage;
