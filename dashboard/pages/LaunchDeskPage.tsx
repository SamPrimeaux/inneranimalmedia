import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, CheckSquare, ChevronDown, Clock, MapPin, RefreshCw, Users, Video } from 'lucide-react';
import { CollaboratePageRail } from '../src/components/collaborate/CollaboratePageRail';
import { CollaborateWorkShell } from '../src/components/collaborate/CollaborateWorkShell';
import {
  parseCollaborateSearchParams,
  patchCollaborateSearchParams,
  type CollaborateCalView,
} from '../src/lib/collaborate/collaborateRailNav';
import {
  addDays,
  anchorIso,
  apiJson,
  BookingPage,
  CalEvent,
  CalendarInsightsPayload,
  CalendarPerson,
  fetchBookingPages,
  fetchCalendarViewEvents,
  fetchGoogleCalendarStatus,
  fetchInsights,
  fetchPeople,
  fetchClientProjects,
  fetchProjects,
  fetchTasksInsights,
  fetchTodos,
  fmtMinutes,
  fmtTime,
  isAllDay,
  isEditableCalendarEvent,
  isGoogleSyncedEvent,
  isSyntheticEvent,
  meetRoomId,
  parseAttendees,
  parseEventDate,
  parseInviteEmails,
  postActivityHeartbeat,
  postActivityStop,
  postGoogleCalendarSync,
  publicBookingPageUrl,
  QuickEventType,
  sameDay,
  startOfWeek,
  TasksInsightsPayload,
  toDatetimeLocalValue,
  toSqlDatetime,
  AgentTodo,
  ProjectRow,
} from './launch-desk/ops-desk-types';
import './launch-desk/collaborate-calendar.css';
import {
  CollaborateTasksMain,
  CollaborateTasksSidebar,
  TasksNavView,
} from './launch-desk/CollaborateTasksPanel';
import { CollaborateTasksInsights } from './launch-desk/CollaborateTasksInsights';
import {
  clientDisplayName,
  clientWorkTaskCounts,
  groupClientWorkNav,
  type ClientWorkNavItem,
} from '../src/lib/collaborate/clientWorkNav';

const HOUR_START = 2;
const HOUR_COUNT = 22;
const HOUR_HEIGHT = 52;
const DAY_VIEW_HOUR_HEIGHT = 64;
const MOBILE_DAY_HOUR_HEIGHT = 72;
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const HOURS = Array.from({ length: HOUR_COUNT }, (_, i) => i + HOUR_START);

type MainSeg = 'calendar' | 'tasks';
type PopoverState = {
  x: number;
  y: number;
  day: Date;
  hour: number;
  event?: CalEvent;
};

type PopoverDraft = {
  title: string;
  eventType: QuickEventType;
  startLocal: string;
  endLocal: string;
  withMeet: boolean;
  attendeesRaw: string;
};

type EditorState = {
  mode: 'create' | 'edit';
  event?: CalEvent;
  day: Date;
  hour: number;
  eventType: QuickEventType;
  title: string;
  description: string;
  location: string;
  startLocal: string;
  endLocal: string;
  allDay: boolean;
  attendeesRaw: string;
  withMeet: boolean;
};

function initialCalView(): CollaborateCalView {
  if (typeof window === 'undefined') return 'week';
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') === 'month') return 'month';
  if (params.get('view') === 'day') return 'day';
  if (params.get('view') === 'week') return 'week';
  return window.matchMedia('(max-width: 760px)').matches ? 'day' : 'week';
}

function cleanTitle(title: string | null | undefined) {
  return String(title || '').trim() || 'Untitled';
}

function eventCssClass(ev: CalEvent) {
  const t = String(ev.event_type || '').toLowerCase();
  if (ev.calendar_source === 'google_calendar') return 'gcal';
  if (t === 'meeting' || t === 'client_call' || meetRoomId(ev)) return 'meeting';
  if (t === 'task' || ev.calendar_source === 'tasks') return 'task';
  if (t === 'focus') return 'focus';
  return '';
}

function minutesSinceGridStart(d: Date) {
  return (d.getHours() - HOUR_START) * 60 + d.getMinutes();
}

function eventLayout(ev: CalEvent, day: Date, hourHeight = HOUR_HEIGHT) {
  const start = parseEventDate(ev.start_datetime);
  const end = parseEventDate(ev.end_datetime);
  if (Number.isNaN(start.getTime()) || !sameDay(start, day)) return null;
  const topMin = Math.max(0, minutesSinceGridStart(start));
  const endMin = Number.isNaN(end.getTime()) ? topMin + 30 : minutesSinceGridStart(end);
  const heightMin = Math.max(18, endMin - topMin);
  return {
    top: (topMin / 60) * hourHeight,
    height: (heightMin / 60) * hourHeight,
  };
}

function defaultSlot(day: Date, hour: number) {
  const start = new Date(day);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start);
  end.setHours(hour + 1, 0, 0, 0);
  return { start, end };
}

function donutGradient(breakdown: Record<string, number>) {
  const slices = [
    { key: 'focus', color: '#039be5', val: breakdown.focus || 0 },
    { key: 'task', color: '#4285f4', val: breakdown.task || 0 },
    { key: 'one_on_one', color: '#23a6d5', val: breakdown.one_on_one || 0 },
    { key: 'multi_guest', color: '#b2dfef', val: breakdown.multi_guest || 0 },
    { key: 'meeting', color: '#188038', val: breakdown.meeting || 0 },
  ];
  const total = slices.reduce((s, x) => s + x.val, 0) || 1;
  let acc = 0;
  const stops = slices.map((s) => {
    const pct = (s.val / total) * 100;
    const from = acc;
    acc += pct;
    return `${s.color} ${from}% ${acc}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

export function LaunchDeskPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectFilterId = searchParams.get('project')?.trim() || null;
  const clientFilterId = searchParams.get('client')?.trim() || null;
  const clientWorkFilter = searchParams.get('client_work') === '1';
  const todoFetchOpts = useMemo(
    () => ({
      projectId: projectFilterId,
      clientId: clientFilterId,
      clientWork: clientWorkFilter && !projectFilterId && !clientFilterId,
    }),
    [projectFilterId, clientFilterId, clientWorkFilter],
  );
  const peopleSearchRef = useRef<HTMLInputElement>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);

  const [anchor, setAnchor] = useState(() => new Date());
  const [mainSeg, setMainSeg] = useState<MainSeg>('calendar');
  const [calView, setCalView] = useState<CollaborateCalView>(initialCalView);
  const [tasksNavView, setTasksNavView] = useState<TasksNavView>('list');
  const [tasksActiveList, setTasksActiveList] = useState('My Tasks');
  const [tasksComposing, setTasksComposing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [clientNavItems, setClientNavItems] = useState<ClientWorkNavItem[]>([]);
  const [clientWorkTodos, setClientWorkTodos] = useState<AgentTodo[]>([]);
  const [tasksInsights, setTasksInsights] = useState<TasksInsightsPayload | null>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [insights, setInsights] = useState<CalendarInsightsPayload | null>(null);
  const [bookingPages, setBookingPages] = useState<BookingPage[]>([]);
  const [todos, setTodos] = useState<AgentTodo[]>([]);
  const [peopleQ, setPeopleQ] = useState('');
  const [people, setPeople] = useState<CalendarPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [popoverDraft, setPopoverDraft] = useState<PopoverDraft>({
    title: '',
    eventType: 'event',
    startLocal: '',
    endLocal: '',
    withMeet: false,
    attendeesRaw: '',
  });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [insightsMode, setInsightsMode] = useState<'week' | 'month'>('week');
  const [insightsOpen, setInsightsOpen] = useState(false);
  const closeInsights = useCallback(() => setInsightsOpen(false), []);
  const [leftNavOpen, setLeftNavOpen] = useState(true);

  const [sources, setSources] = useState({
    primary: true,
    tasks: true,
    holidays: true,
    birthdays: true,
    google_calendar: true,
  });
  const [gcalStatus, setGcalStatus] = useState<{ connected: boolean; accounts: { account: string; event_count: number }[] } | null>(null);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalBanner, setGcalBanner] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const monthGridDays = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchor]);
  const gridDays = calView === 'month' ? monthGridDays : weekDays;
  const today = useMemo(() => new Date(), []);

  const monthTitle = anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const pushCollaborateUrl = useCallback(
    (patch: Parameters<typeof patchCollaborateSearchParams>[1]) => {
      const next = patchCollaborateSearchParams(searchParams, patch);
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const selectTask = useCallback(
    (id: string | null) => {
      setSelectedTaskId(id);
      pushCollaborateUrl({ task: id, seg: id ? 'tasks' : null });
    },
    [pushCollaborateUrl],
  );

  const openDayView = useCallback(
    (day: Date) => {
      setAnchor(new Date(day));
      setCalView('day');
      pushCollaborateUrl({ seg: 'calendar', view: 'day' });
    },
    [pushCollaborateUrl],
  );

  useEffect(() => {
    if (clientFilterId || projectFilterId) setTasksNavView('client');
  }, [clientFilterId, projectFilterId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ev, ins, pages, taskList, projectList, taskIns, clientRows, allClientTodos] = await Promise.all([
        fetchCalendarViewEvents(anchor, calView, sources),
        fetchInsights(anchor),
        fetchBookingPages(),
        fetchTodos(todoFetchOpts),
        fetchProjects(
          clientFilterId
            ? { clientId: clientFilterId }
            : clientWorkFilter
              ? { clientWork: true }
              : undefined,
        ).catch(() => []),
        fetchTasksInsights(anchor).catch(() => null),
        fetchClientProjects().catch(() => []),
        fetchTodos({ clientWork: true }).catch(() => []),
      ]);
      setEvents(ev);
      setInsights(ins);
      setBookingPages(pages);
      setTodos(taskList);
      setProjects(projectList);
      setTasksInsights(taskIns);
      setClientNavItems(groupClientWorkNav(clientRows));
      setClientWorkTodos(allClientTodos);
      setTrackingActive(Boolean(taskIns?.active_tracking));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [anchor, calView, sources, todoFetchOpts, clientFilterId, clientWorkFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  const refreshGcalStatus = useCallback(async () => {
    try {
      const st = await fetchGoogleCalendarStatus();
      setGcalStatus(st);
    } catch {
      setGcalStatus(null);
    }
  }, []);

  useEffect(() => {
    refreshGcalStatus();
  }, [refreshGcalStatus]);

  useEffect(() => {
    if (searchParams.get('gcal_connected') === '1') {
      const acct = searchParams.get('account') || 'Google Calendar';
      setGcalBanner(`Connected ${acct} — syncing events…`);
      refreshGcalStatus().then(() => reload());
      const next = new URLSearchParams(searchParams);
      next.delete('gcal_connected');
      next.delete('account');
      navigate({ search: next.toString() ? `?${next}` : '' }, { replace: true });
      window.setTimeout(() => setGcalBanner(null), 8000);
    }
  }, [searchParams, refreshGcalStatus, reload, navigate]);

  const syncGoogleCalendar = useCallback(async () => {
    setGcalSyncing(true);
    try {
      const out = await postGoogleCalendarSync();
      setGcalBanner(`Synced ${out.synced ?? 0} Google Calendar events`);
      await refreshGcalStatus();
      await reload();
    } catch (e) {
      setGcalBanner(e instanceof Error ? e.message : 'Calendar sync failed');
    } finally {
      setGcalSyncing(false);
      window.setTimeout(() => setGcalBanner(null), 6000);
    }
  }, [refreshGcalStatus, reload]);

  useEffect(() => {
    const {
      mainSeg: seg,
      tasksList,
      focusPeople,
      calView: view,
      clientId,
      clientWork,
      taskId,
    } = parseCollaborateSearchParams(searchParams);
    setMainSeg(seg);
    const viewParam = searchParams.get('view');
    if (viewParam === 'month') setCalView('month');
    else if (viewParam === 'day') setCalView('day');
    else if (viewParam === 'week') setCalView('week');
    if (taskId) {
      setSelectedTaskId(taskId);
      setMainSeg('tasks');
    }
    if (seg === 'tasks') {
      if (clientId || clientWork) {
        setTasksNavView('client');
      } else if (tasksList) {
        setTasksActiveList(tasksList);
        setTasksNavView('list');
      } else {
        setTasksNavView('list');
        setTasksActiveList('My Tasks');
      }
    }
    if (focusPeople) {
      setMainSeg('calendar');
      window.setTimeout(() => peopleSearchRef.current?.focus(), 120);
    }
  }, [searchParams]);

  const clientTaskCounts = useMemo(() => clientWorkTaskCounts(clientWorkTodos), [clientWorkTodos]);

  const clientListTitle = useMemo(() => {
    if (clientFilterId) return clientDisplayName(clientFilterId, clientNavItems);
    if (clientWorkFilter) return 'All client work';
    return null;
  }, [clientFilterId, clientWorkFilter, clientNavItems]);

  const stepAnchor = useCallback(
    (delta: number) => {
      setAnchor((prev) => {
        if (calView === 'day') return addDays(prev, delta);
        if (calView === 'month') {
          const d = new Date(prev);
          d.setMonth(d.getMonth() + delta);
          return d;
        }
        return addDays(prev, delta * 7);
      });
    },
    [calView],
  );

  const openCalendarSeg = useCallback(() => {
    setMainSeg('calendar');
    setSelectedTaskId(null);
    pushCollaborateUrl({ seg: 'calendar', view: calView, task: null });
  }, [calView, pushCollaborateUrl]);

  const openTasksSeg = useCallback(() => {
    setMainSeg('tasks');
    setTasksNavView('list');
    setTasksActiveList('My Tasks');
    pushCollaborateUrl({ seg: 'tasks', list: null, view: null });
  }, [pushCollaborateUrl]);

  const setCalendarView = useCallback(
    (view: CollaborateCalView) => {
      setCalView(view);
      pushCollaborateUrl({ view, seg: 'calendar' });
    },
    [pushCollaborateUrl],
  );

  const displayDays = calView === 'day' ? [anchor] : weekDays;
  const dayHourHeight =
    calView === 'day'
      ? typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
        ? MOBILE_DAY_HOUR_HEIGHT
        : DAY_VIEW_HOUR_HEIGHT
      : HOUR_HEIGHT;
  const gridHourHeight = calView === 'day' ? dayHourHeight : HOUR_HEIGHT;
  const calendarHeadTitle =
    calView === 'day'
      ? anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : monthTitle;

  useEffect(() => {
    const t = window.setTimeout(async () => {
      try {
        const rows = await fetchPeople(peopleQ);
        setPeople(rows);
      } catch {
        setPeople([]);
      }
    }, 220);
    return () => window.clearTimeout(t);
  }, [peopleQ]);

  useEffect(() => {
    if (!weekScrollRef.current) return;
    const now = new Date();
    if (!weekDays.some((d) => sameDay(d, now))) return;
    const top = Math.max(0, minutesSinceGridStart(now) / 60) * HOUR_HEIGHT - 120;
    weekScrollRef.current.scrollTop = top;
  }, [weekDays]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, { timed: CalEvent[]; allDay: CalEvent[] }>();
    for (const day of gridDays) {
      map.set(anchorIso(day), { timed: [], allDay: [] });
    }
    for (const ev of events) {
      const start = parseEventDate(ev.start_datetime);
      if (Number.isNaN(start.getTime())) continue;
      const key = anchorIso(start);
      const bucket = map.get(key);
      if (!bucket) continue;
      if (isAllDay(ev)) bucket.allDay.push(ev);
      else bucket.timed.push(ev);
    }
    return map;
  }, [events, gridDays]);

  const miniMonth = useMemo(() => {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(d);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i += 1) cells.push(addDays(start, i));
    return cells;
  }, [anchor]);

  const openCreate = (day: Date, hour: number, x: number, y: number) => {
    const { start, end } = defaultSlot(day, hour);
    setPopover({
      x,
      y,
      day,
      hour,
    });
    setEditor(null);
    setPopoverDraft({
      title: '',
      eventType: 'event',
      startLocal: toDatetimeLocalValue(start),
      endLocal: toDatetimeLocalValue(end),
      withMeet: false,
      attendeesRaw: '',
    });
  };

  const openEditPopover = (ev: CalEvent, x: number, y: number) => {
    const start = parseEventDate(ev.start_datetime);
    const end = parseEventDate(ev.end_datetime);
    setPopover({
      x,
      y,
      day: start,
      hour: start.getHours(),
      event: ev,
    });
    setPopoverDraft({
      title: cleanTitle(ev.title),
      eventType: (String(ev.event_type || 'event') as QuickEventType) || 'event',
      startLocal: toDatetimeLocalValue(start),
      endLocal: toDatetimeLocalValue(end),
      withMeet: Boolean(meetRoomId(ev)),
      attendeesRaw: parseAttendees(ev.attendees).join(', '),
    });
  };

  const openFullEditor = (fromPopover = true) => {
    if (!popover) return;
    setEditor({
      mode: popover.event && isEditableCalendarEvent(popover.event) ? 'edit' : 'create',
      event: popover.event,
      day: popover.day,
      hour: popover.hour,
      eventType: popoverDraft.eventType,
      title: popoverDraft.title,
      description: popover.event?.description || '',
      location: popover.event?.location || '',
      startLocal: popoverDraft.startLocal,
      endLocal: popoverDraft.endLocal,
      allDay: popover.event ? isAllDay(popover.event) : false,
      attendeesRaw: popoverDraft.attendeesRaw,
      withMeet: popoverDraft.withMeet,
    });
    if (fromPopover) setPopover(null);
  };

  const saveEvent = async (draft: {
    mode: 'create' | 'edit';
    event?: CalEvent;
    title: string;
    description: string;
    location: string;
    startLocal: string;
    endLocal: string;
    allDay: boolean;
    attendeesRaw: string;
    withMeet: boolean;
    eventType: QuickEventType;
  }) => {
    const title = draft.title.trim();
    if (!title) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title,
        description: draft.description.trim() || null,
        location: draft.location.trim() || null,
        start_datetime: toSqlDatetime(draft.startLocal),
        end_datetime: toSqlDatetime(draft.endLocal),
        all_day: draft.allDay,
        event_type: draft.eventType === 'meeting' ? 'meeting' : draft.eventType,
        attendees: parseInviteEmails(draft.attendeesRaw),
        with_meet: draft.withMeet || draft.eventType === 'meeting',
      };
      if (draft.mode === 'edit' && draft.event && !isEditableCalendarEvent(draft.event)) {
        setError('This event cannot be edited here.');
        return;
      }
      if (draft.mode === 'edit' && draft.event && isEditableCalendarEvent(draft.event)) {
        await apiJson(`/api/calendar/events/${draft.event.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        showToast('Event updated');
      } else {
        await apiJson('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        showToast('Event created');
      }
      setPopover(null);
      setEditor(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (ev: CalEvent) => {
    if (isSyntheticEvent(ev)) return;
    if (
      isGoogleSyncedEvent(ev) &&
      !window.confirm('Delete this event from Google Calendar and Inner Animal Media?')
    ) {
      return;
    }
    setSaving(true);
    try {
      await apiJson(`/api/calendar/events/${ev.id}`, { method: 'DELETE' });
      showToast('Event deleted');
      setPopover(null);
      setEditor(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const scheduleWithPerson = async (person: CalendarPerson) => {
    const email = String(person.email || '').trim();
    if (!email) return;
    const start = new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
    const end = new Date(start.getTime() + 30 * 60000);
    setSaving(true);
    try {
      await apiJson('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Meet with ${person.display_name || email}`,
          start_datetime: toSqlDatetime(toDatetimeLocalValue(start)),
          end_datetime: toSqlDatetime(toDatetimeLocalValue(end)),
          event_type: 'meeting',
          attendees: [email],
          with_meet: true,
        }),
      });
      showToast('Meeting scheduled');
      setPeopleQ('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not schedule meeting');
    } finally {
      setSaving(false);
    }
  };

  const scheduleTaskOnCalendar = async (todo: AgentTodo) => {
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60000);
    await saveEvent({
      mode: 'create',
      title: todo.title,
      description: todo.description || todo.notes || '',
      location: '',
      startLocal: toDatetimeLocalValue(start),
      endLocal: toDatetimeLocalValue(end),
      allDay: false,
      attendeesRaw: '',
      withMeet: false,
      eventType: 'task',
    });
  };

  const reloadTodos = useCallback(async () => {
    try {
      const taskList = await fetchTodos(todoFetchOpts);
      setTodos(taskList);
    } catch {
      /* parent reload handles errors */
    }
  }, [todoFetchOpts]);

  const copyBookingLink = (slug: string) => {
    const url = publicBookingPageUrl(slug);
    navigator.clipboard.writeText(url).then(
      () => showToast('Booking link copied'),
      () => showToast(url),
    );
  };

  const currentLineTop = useMemo(() => {
    const now = new Date();
    const visibleDays = calView === 'day' ? [anchor] : weekDays;
    if (!visibleDays.some((d) => sameDay(d, now))) return null;
    const hourPx = calView === 'day' ? dayHourHeight : HOUR_HEIGHT;
    return (minutesSinceGridStart(now) / 60) * hourPx;
  }, [weekDays, calView, anchor, dayHourHeight]);

  useEffect(() => {
    if (mainSeg !== 'tasks' && mainSeg !== 'calendar') return undefined;
    let cancelled = false;

    const beat = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const activeTodo = selectedTaskId || null;
        const activeProject =
          projectFilterId ||
          (activeTodo ? todos.find((t) => t.id === activeTodo)?.project_id || todos.find((t) => t.id === activeTodo)?.project_key : null) ||
          null;
        await postActivityHeartbeat({
          project_id: activeProject,
          todo_id: activeTodo,
          surface: mainSeg === 'tasks' ? 'collaborate_tasks' : 'collaborate_calendar',
        });
        if (!cancelled) setTrackingActive(true);
      } catch {
        if (!cancelled) setTrackingActive(false);
      }
    };

    const stop = () => {
      void postActivityStop().catch(() => {});
    };

    void beat();
    const id = window.setInterval(() => void beat(), 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void beat();
      else stop();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, [mainSeg, projectFilterId, selectedTaskId, todos]);

  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const breakdown = insights?.insights.breakdown_minutes || {};
  const workMins = insights?.insights.working_minutes_per_day || 480;
  const scheduledMins = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const remainingMins = Math.max(0, workMins * 5 - scheduledMins);

  return (
    <CollaborateWorkShell
      surface={mainSeg === 'tasks' ? 'tasks' : 'calendar'}
      trailing={
        <>
          <button
            type="button"
            className="colab-cal-hamb"
            aria-label={leftNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={leftNavOpen}
            onClick={() => setLeftNavOpen((v) => !v)}
          >
            <svg
              className={`colab-cal-hamb-icon${leftNavOpen ? ' is-open' : ''}`}
              viewBox="0 0 20 20"
              aria-hidden
            >
              <line className="colab-cal-hamb-bar colab-cal-hamb-bar-top" x1="3" y1="5" x2="17" y2="5" />
              <line className="colab-cal-hamb-bar colab-cal-hamb-bar-mid" x1="3" y1="10" x2="17" y2="10" />
              <line className="colab-cal-hamb-bar colab-cal-hamb-bar-bottom" x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>
          {mainSeg === 'calendar' ? (
            <>
              <button type="button" className="colab-cal-pill-btn" onClick={() => setAnchor(new Date())}>
                Today
              </button>
              <button type="button" className="colab-cal-circle-btn" aria-label="Previous" onClick={() => stepAnchor(-1)}>
                ‹
              </button>
              <button type="button" className="colab-cal-circle-btn" aria-label="Next" onClick={() => stepAnchor(1)}>
                ›
              </button>
              <span className="colab-work-shell-date">{calendarHeadTitle}</span>
              <label className="colab-cal-view-select">
                <select
                  className="colab-cal-view-select-input"
                  value={calView}
                  onChange={(e) => setCalendarView(e.target.value as CollaborateCalView)}
                  aria-label="Calendar view"
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
                <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
              </label>
            </>
          ) : null}
          <button type="button" className="colab-cal-icon-btn" aria-label="Refresh" onClick={() => reload()} disabled={loading}>
            <RefreshCw size={18} strokeWidth={1.75} />
          </button>
        </>
      }
    >
    <div
      className={[
        'colab-cal',
        insightsOpen ? 'insights-open' : '',
        leftNavOpen ? 'left-nav-open' : 'left-nav-closed',
      ].filter(Boolean).join(' ')}
    >
      {projectFilterId && mainSeg === 'tasks' ? (
        <div className="colab-cal-project-banner">
          <span>
            Tasks filtered to project <strong>{projects.find((p) => p.id === projectFilterId)?.name || projectFilterId}</strong>
          </span>
          <button
            type="button"
            className="colab-cal-outline-btn"
            onClick={() => {
              pushCollaborateUrl({ project: null, seg: 'tasks' });
            }}
          >
            Clear filter
          </button>
        </div>
      ) : clientWorkFilter && mainSeg === 'tasks' ? (
        <div className="colab-cal-project-banner">
          <span>Showing <strong>client work</strong> tasks only</span>
          <button
            type="button"
            className="colab-cal-outline-btn"
            onClick={() => pushCollaborateUrl({ client_work: null, seg: 'tasks' })}
          >
            Clear filter
          </button>
        </div>
      ) : clientFilterId && mainSeg === 'tasks' ? (
        <div className="colab-cal-project-banner">
          <span>
            Tasks for <strong>{clientDisplayName(clientFilterId, clientNavItems)}</strong>
          </span>
          <button
            type="button"
            className="colab-cal-outline-btn"
            onClick={() => pushCollaborateUrl({ client: null, seg: 'tasks' })}
          >
            Clear filter
          </button>
        </div>
      ) : null}

      <div className={`colab-cal-layout${mainSeg === 'tasks' ? ' tasks-mode' : ''}`}>
        <aside className="colab-cal-left">
          {mainSeg === 'tasks' ? (
            <CollaborateTasksSidebar
              todos={todos}
              navView={tasksNavView}
              activeList={tasksActiveList}
              onNavViewChange={setTasksNavView}
              onActiveListChange={setTasksActiveList}
              onReload={reloadTodos}
              onCreateClick={() => {
                if (tasksNavView === 'starred') {
                  setTasksNavView('list');
                  setTasksActiveList('My Tasks');
                }
                setTasksComposing(true);
              }}
              clients={clientNavItems}
              clientFilterId={clientFilterId}
              clientWorkFilter={clientWorkFilter}
              clientTaskCounts={clientTaskCounts}
              onSelectAllClientWork={() => {
                setTasksNavView('client');
                pushCollaborateUrl({ client_work: '1', project: null, client: null, seg: 'tasks' });
              }}
              onSelectClient={(clientId) => {
                setTasksNavView('client');
                pushCollaborateUrl({ client: clientId, client_work: null, project: null, seg: 'tasks' });
              }}
            />
          ) : (
            <>
          <button
            type="button"
            className="colab-cal-create-btn"
            onClick={() => {
              const now = new Date();
              const hour = now.getHours();
              openCreate(now, hour, window.innerWidth / 2 - 300, 120);
            }}
          >
            <span className="colab-cal-create-plus">+</span>
            <span>Create</span>
          </button>

          <div className="colab-cal-section">
            <div className="colab-cal-mini-grid">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d[0]}</span>
              ))}
              {miniMonth.map((d) => {
                const inMonth = d.getMonth() === anchor.getMonth();
                const active = sameDay(d, anchor);
                const hasEvent = events.some((ev) => sameDay(parseEventDate(ev.start_datetime), d));
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    className={[inMonth ? '' : 'muted', active ? 'active' : '', hasEvent ? 'has-event' : ''].filter(Boolean).join(' ')}
                    onClick={() => setAnchor(new Date(d))}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="colab-cal-section">
            <div className="colab-cal-section-head">
              <span>Meet with…</span>
            </div>
            <div className="colab-cal-search-wrap">
              <input
                ref={peopleSearchRef}
                className="colab-cal-people-search"
                placeholder="Search people"
                value={peopleQ}
                onChange={(e) => setPeopleQ(e.target.value)}
              />
            </div>
            {people.length > 0 && (
              <div className="colab-cal-people-results">
                {people.map((p) => (
                  <button key={p.email || p.id} type="button" className="colab-cal-people-row" onClick={() => scheduleWithPerson(p)}>
                    {p.display_name || p.email}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="colab-cal-section">
            <div className="colab-cal-section-head">
              <span>Booking pages</span>
            </div>
            {bookingPages.length === 0 ? (
              <p className="colab-cal-booking-empty">No booking pages yet.</p>
            ) : (
              bookingPages.map((p) => (
                <div key={p.id} className="colab-cal-cal-row colab-cal-booking-row">
                  <span>{p.title}</span>
                  <button type="button" className="colab-cal-outline-btn" onClick={() => copyBookingLink(p.slug)}>
                    Share
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="colab-cal-section">
            <div className="colab-cal-section-head">
              <span>My calendars</span>
            </div>
            <div className="colab-cal-calendars">
            <button
              type="button"
              className="colab-cal-cal-row colab-cal-checkbox"
              onClick={() => setSources((s) => ({ ...s, primary: !s.primary }))}
            >
              <span className="colab-cal-box blue">{sources.primary ? '✓' : ''}</span>
              <span>Inner Animal Media</span>
            </button>
            <button
              type="button"
              className="colab-cal-cal-row colab-cal-checkbox"
              onClick={() => setSources((s) => ({ ...s, tasks: !s.tasks }))}
            >
              <span className="colab-cal-box task">{sources.tasks ? '✓' : ''}</span>
              <span>Tasks</span>
            </button>
            <button
              type="button"
              className="colab-cal-cal-row colab-cal-checkbox"
              onClick={() => setSources((s) => ({ ...s, holidays: !s.holidays }))}
            >
              <span className="colab-cal-box holiday">{sources.holidays ? '✓' : ''}</span>
              <span>Holidays</span>
            </button>
            <button
              type="button"
              className="colab-cal-cal-row colab-cal-checkbox"
              onClick={() => setSources((s) => ({ ...s, birthdays: !s.birthdays }))}
            >
              <span className="colab-cal-box green">{sources.birthdays ? '✓' : ''}</span>
              <span>Birthdays</span>
            </button>
            <button
              type="button"
              className="colab-cal-cal-row colab-cal-checkbox"
              onClick={() => setSources((s) => ({ ...s, google_calendar: !s.google_calendar }))}
            >
              <span className="colab-cal-box gcal">{sources.google_calendar ? '✓' : ''}</span>
              <span>Google Calendar</span>
            </button>
            {gcalStatus?.connected ? (
              <div className="colab-cal-gcal-actions">
                <span className="colab-cal-gcal-meta">
                  {gcalStatus.accounts.map((a) => a.account).join(', ')}
                  {' · '}
                  {(gcalStatus.accounts.reduce((n, a) => n + (a.event_count || 0), 0) || 0)} events
                </span>
                <button
                  type="button"
                  className="colab-cal-outline-btn"
                  disabled={gcalSyncing}
                  onClick={() => syncGoogleCalendar()}
                >
                  {gcalSyncing ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
            ) : (
              <a
                className="colab-cal-gcal-connect"
                href="/api/integrations/google-calendar/connect?return_to=/dashboard/collaborate"
              >
                Connect Google Calendar
              </a>
            )}
            </div>
          </div>
            </>
          )}
        </aside>

        {gcalBanner ? <div className="colab-cal-gcal-banner">{gcalBanner}</div> : null}

        {mainSeg === 'calendar' ? (
          calView === 'month' ? (
            <section className="colab-cal-center colab-cal-center--month">
              <div className="colab-cal-month-head-row">
                {WEEKDAYS.map((d) => (
                  <span key={d} className="colab-cal-month-weekday">
                    {d}
                  </span>
                ))}
              </div>
              <div className="colab-cal-month-grid">
                {monthGridDays.map((d) => {
                  const key = anchorIso(d);
                  const inMonth = d.getMonth() === anchor.getMonth();
                  const dayEvents = [
                    ...(eventsByDay.get(key)?.allDay || []),
                    ...(eventsByDay.get(key)?.timed || []),
                  ].slice(0, 4);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={[
                        'colab-cal-month-cell',
                        inMonth ? '' : 'muted',
                        sameDay(d, today) ? 'today' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        setAnchor(new Date(d));
                        if (window.innerWidth <= 760) openDayView(d);
                        else setCalendarView('week');
                      }}
                    >
                      <span className="colab-cal-month-cell-date">{d.getDate()}</span>
                      <div className="colab-cal-month-cell-events">
                        {dayEvents.map((ev) => (
                          <span
                            key={ev.id}
                            className={`colab-cal-month-chip ${eventCssClass(ev)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditPopover(ev, e.clientX, e.clientY);
                            }}
                          >
                            {cleanTitle(ev.title)}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
          <section className={`colab-cal-center${calView === 'day' ? ' colab-cal-center--day' : ''}`}>
            {calView === 'day' ? (
              <div className="colab-cal-day-focus-bar">
                <button type="button" className="colab-cal-text-btn" onClick={() => setCalendarView('week')}>
                  ← Week
                </button>
                <span className="colab-cal-day-focus-label">Single day — tap times to add events</span>
              </div>
            ) : null}
            <div className="colab-cal-head-row">
              <div />
              {displayDays.map((d) => (
                <button
                  key={d.toISOString()}
                  type="button"
                  className={`colab-cal-day-head${sameDay(d, today) ? ' today' : ''}`}
                  onClick={() => {
                    if (calView === 'week') openDayView(d);
                    else setAnchor(new Date(d));
                  }}
                >
                  <span className="colab-cal-day-label">{WEEKDAYS[d.getDay()]}</span>
                  <span className="colab-cal-date-label">{d.getDate()}</span>
                </button>
              ))}
            </div>

            <div className="colab-cal-all-day-row">
              <div />
              {displayDays.map((d) => {
                const key = anchorIso(d);
                const allDay = eventsByDay.get(key)?.allDay || [];
                return (
                  <div key={key} className="colab-cal-all-day-cell">
                    {allDay.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        className="colab-cal-all-day-event"
                        onClick={(e) => openEditPopover(ev, e.clientX, e.clientY)}
                      >
                        {cleanTitle(ev.title)}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="colab-cal-week-scroll" ref={weekScrollRef}>
              <div className="colab-cal-week-grid" style={{ ['--hour' as string]: `${gridHourHeight}px` }}>
                {HOURS.map((h) => (
                  <React.Fragment key={h}>
                    <div className="colab-cal-hour-label">
                      {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                    </div>
                    {displayDays.map((d) => (
                      <button
                        key={`${anchorIso(d)}-${h}`}
                        type="button"
                        className="colab-cal-time-cell"
                        onClick={(e) => openCreate(d, h, e.clientX, e.clientY)}
                      />
                    ))}
                  </React.Fragment>
                ))}

                {currentLineTop != null && (
                  <div className="colab-cal-current-line" style={{ top: currentLineTop }} />
                )}

                <div className="colab-cal-events-layer">
                  {displayDays.map((d) => {
                    const key = anchorIso(d);
                    const timed = eventsByDay.get(key)?.timed || [];
                    return (
                      <div key={key} className="colab-cal-events-col">
                        {timed.map((ev) => {
                          const layout = eventLayout(ev, d, gridHourHeight);
                          if (!layout) return null;
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              className={`colab-cal-event-block ${eventCssClass(ev)}`}
                              style={{ top: layout.top, height: layout.height }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditPopover(ev, e.clientX, e.clientY);
                              }}
                            >
                              <strong>{cleanTitle(ev.title)}</strong>
                              <div>{fmtTime(parseEventDate(ev.start_datetime))}</div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
          )
        ) : (
          <CollaborateTasksMain
            todos={todos}
            loading={loading}
            navView={tasksNavView}
            activeList={tasksActiveList}
            onNavViewChange={setTasksNavView}
            onActiveListChange={setTasksActiveList}
            onReload={async () => {
              await reloadTodos();
              await reload();
            }}
            onSchedule={scheduleTaskOnCalendar}
            composing={tasksComposing}
            onComposingChange={setTasksComposing}
            projectId={
              projectFilterId ||
              (clientFilterId
                ? clientNavItems.find((c) => c.client_id === clientFilterId)?.project_id || null
                : null)
            }
            projects={projects}
            selectedTaskId={selectedTaskId}
            onSelectedTaskChange={selectTask}
            clientListTitle={clientListTitle}
          />
        )}

        {mainSeg === 'tasks' && insightsOpen ? (
          <CollaborateTasksInsights
            insights={insights}
            tasksInsights={tasksInsights}
            insightsMode={insightsMode}
            onInsightsModeChange={setInsightsMode}
            weekLabel={weekLabel}
            donutGradient={donutGradient}
            remainingMins={remainingMins}
            trackingActive={trackingActive}
            projects={projects}
            todos={todos}
            selectedTaskId={selectedTaskId}
            onTimeLogged={reload}
            onClose={closeInsights}
          />
        ) : mainSeg === 'calendar' && insightsOpen ? (
        <aside className="colab-cal-right">
          <div className="colab-cal-insights-head">
            <div>
              <div className="colab-cal-insights-date">
                {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
                {addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="colab-cal-insights-title">Time insights</div>
            </div>
            <button type="button" className="colab-cal-icon-btn colab-cal-insights-close" aria-label="Close insights" onClick={closeInsights}>
              ×
            </button>
          </div>

          <div className="colab-cal-switch">
            <button type="button" className={insightsMode === 'week' ? 'active' : ''} onClick={() => setInsightsMode('week')}>
              Week
            </button>
            <button type="button" className={insightsMode === 'month' ? 'active' : ''} onClick={() => setInsightsMode('month')}>
              Month
            </button>
          </div>

          <div className="colab-cal-donut" style={{ background: donutGradient(breakdown) }} />

          <div className="colab-cal-breakdown">
            <div className="colab-cal-break-row">
              <span className="colab-cal-dot focus" />
              <span>Focus time</span>
              <strong>{fmtMinutes(breakdown.focus || 0)}</strong>
            </div>
            <div className="colab-cal-break-row">
              <span className="colab-cal-dot tasks" />
              <span>Tasks</span>
              <strong>{fmtMinutes(breakdown.task || 0)}</strong>
            </div>
            <div className="colab-cal-break-row">
              <span className="colab-cal-dot one" />
              <span>1:1 meetings</span>
              <strong>{fmtMinutes(breakdown.one_on_one || 0)}</strong>
            </div>
            <div className="colab-cal-break-row">
              <span className="colab-cal-dot guests" />
              <span>Meetings with 3+ guests</span>
              <strong>{fmtMinutes(breakdown.multi_guest || 0)}</strong>
            </div>
            <div className="colab-cal-break-row">
              <span className="colab-cal-dot remaining" />
              <span>Remaining work time</span>
              <strong>{fmtMinutes(remainingMins)}</strong>
            </div>
          </div>

          <div className="colab-cal-rule" />

          <div className="colab-cal-subhead">
            <h3>Meetings</h3>
          </div>
          {(insights?.weeks || []).map((w) => (
            <div key={w.label} className={`colab-cal-meeting-bars${w.active ? ' active' : ''}`}>
              <span>{w.label}</span>
              <span>{fmtMinutes(w.minutes)}</span>
            </div>
          ))}

          <div className="colab-cal-rule" />

          <div className="colab-cal-subhead">
            <h3>People you meet with</h3>
          </div>
          {(insights?.insights.people || []).slice(0, 6).map((p) => (
            <div key={p.email} className="colab-cal-cal-row">
              <span>{p.email}</span>
              <span>{fmtMinutes(p.minutes)}</span>
            </div>
          ))}
        </aside>
        ) : null}

        <CollaboratePageRail
          activeSurface={mainSeg === 'tasks' ? 'tasks' : undefined}
          insightsOpen={insightsOpen}
          onInsightsToggle={() => setInsightsOpen((v) => !v)}
          onTasksClick={() => {
            setMainSeg('tasks');
            setTasksNavView('list');
            setTasksActiveList('My Tasks');
          }}
        />
      </div>

      {error && <div className="colab-cal-toast colab-cal-error">{error}</div>}

      {popover && (
        <div
          className="colab-cal-popover"
          style={{
            left: Math.min(Math.max(16, popover.x - 300), window.innerWidth - 616),
            top: Math.min(Math.max(72, popover.y - 20), window.innerHeight - 420),
          }}
        >
          <div className="colab-cal-popover-top">
            <span>
              {popover.event
                ? isGoogleSyncedEvent(popover.event)
                  ? 'Google Calendar event'
                  : 'Edit event'
                : 'Quick event'}
            </span>
            <button type="button" className="colab-cal-icon-btn" onClick={() => setPopover(null)}>
              ×
            </button>
          </div>
          <div className="colab-cal-popover-body">
            {popover.event && isGoogleSyncedEvent(popover.event) && (
              <p className="colab-cal-sync-badge">Synced with Google Calendar — edits and deletes update Google.</p>
            )}
            <input
              className="colab-cal-title-input"
              placeholder="Add title"
              value={popoverDraft.title}
              onChange={(e) => setPopoverDraft((d) => ({ ...d, title: e.target.value }))}
              autoFocus
            />
            <div className="colab-cal-quick-tabs">
              {(['event', 'task', 'focus', 'meeting', 'out_of_office'] as QuickEventType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={popoverDraft.eventType === t ? 'active' : ''}
                  onClick={() => setPopoverDraft((d) => ({ ...d, eventType: t, withMeet: t === 'meeting' ? true : d.withMeet }))}
                >
                  {t.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            <div className="colab-cal-quick-field">
              <span className="colab-cal-quick-icon" aria-hidden>
                <Clock size={16} strokeWidth={1.75} />
              </span>
              <div>
                <input
                  type="datetime-local"
                  value={popoverDraft.startLocal}
                  onChange={(e) => setPopoverDraft((d) => ({ ...d, startLocal: e.target.value }))}
                />
                <div className="colab-cal-datetime-gap">
                  <input
                    type="datetime-local"
                    value={popoverDraft.endLocal}
                    onChange={(e) => setPopoverDraft((d) => ({ ...d, endLocal: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="colab-cal-quick-field">
              <span className="colab-cal-quick-icon" aria-hidden>
                <Users size={16} strokeWidth={1.75} />
              </span>
              <input
                placeholder="Add guests (emails)"
                value={popoverDraft.attendeesRaw}
                onChange={(e) => setPopoverDraft((d) => ({ ...d, attendeesRaw: e.target.value }))}
              />
            </div>
            <label className="colab-cal-quick-field">
              <span className="colab-cal-quick-icon" aria-hidden>
                <Video size={16} strokeWidth={1.75} />
              </span>
              <input
                type="checkbox"
                checked={popoverDraft.withMeet}
                onChange={(e) => setPopoverDraft((d) => ({ ...d, withMeet: e.target.checked }))}
              />
              <span>Add video conferencing (IAM Meet)</span>
            </label>
            <div className="colab-cal-quick-actions">
              {popover.event && !isSyntheticEvent(popover.event) && (
                <button type="button" className="colab-cal-text-btn" onClick={() => deleteEvent(popover.event!)}>
                  Delete
                </button>
              )}
              <button type="button" className="colab-cal-text-btn" onClick={() => openFullEditor(true)}>
                More options
              </button>
              <button
                type="button"
                className="colab-cal-save-btn"
                disabled={saving}
                onClick={() =>
                  saveEvent({
                    mode: popover.event && isEditableCalendarEvent(popover.event) ? 'edit' : 'create',
                    event: popover.event,
                    title: popoverDraft.title,
                    description: popover.event?.description || '',
                    location: popover.event?.location || '',
                    startLocal: popoverDraft.startLocal,
                    endLocal: popoverDraft.endLocal,
                    allDay: popover.event ? isAllDay(popover.event) : false,
                    attendeesRaw: popoverDraft.attendeesRaw,
                    withMeet: popoverDraft.withMeet,
                    eventType: popoverDraft.eventType,
                  })
                }
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editor && (
        <div className="colab-cal-editor">
          <div className="colab-cal-editor-top">
            <button type="button" className="colab-cal-icon-btn" onClick={() => setEditor(null)}>
              ×
            </button>
            <div className="colab-cal-editor-top-actions">
              {editor.mode === 'edit' && editor.event && !isSyntheticEvent(editor.event) && (
                <button type="button" className="colab-cal-text-btn" onClick={() => deleteEvent(editor.event!)}>
                  Delete
                </button>
              )}
              <button
                type="button"
                className="colab-cal-save-btn"
                disabled={saving}
                onClick={() =>
                  saveEvent({
                    mode: editor.mode,
                    event: editor.event,
                    title: editor.title,
                    description: editor.description,
                    location: editor.location,
                    startLocal: editor.startLocal,
                    endLocal: editor.endLocal,
                    allDay: editor.allDay,
                    attendeesRaw: editor.attendeesRaw,
                    withMeet: editor.withMeet,
                    eventType: editor.eventType,
                  })
                }
              >
                Save
              </button>
            </div>
          </div>
          <div className="colab-cal-editor-shell">
            <div>
              <input
                className="colab-cal-editor-title"
                placeholder="Add title"
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              />
              <div className="colab-cal-quick-tabs">
                {(['event', 'task', 'focus', 'meeting', 'out_of_office', 'working_location'] as QuickEventType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={editor.eventType === t ? 'active' : ''}
                    onClick={() => setEditor({ ...editor, eventType: t, withMeet: t === 'meeting' ? true : editor.withMeet })}
                  >
                    {t.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
              <div className="colab-cal-quick-field">
                <span className="colab-cal-quick-icon" aria-hidden>
                  <Clock size={16} strokeWidth={1.75} />
                </span>
                <div className="colab-cal-quick-field-stack">
                  <label>
                    <input
                      type="checkbox"
                      checked={editor.allDay}
                      onChange={(e) => setEditor({ ...editor, allDay: e.target.checked })}
                    />
                    All day
                  </label>
                  <input
                    type="datetime-local"
                    value={editor.startLocal}
                    onChange={(e) => setEditor({ ...editor, startLocal: e.target.value })}
                  />
                  <input
                    type="datetime-local"
                    value={editor.endLocal}
                    onChange={(e) => setEditor({ ...editor, endLocal: e.target.value })}
                  />
                </div>
              </div>
              <div className="colab-cal-quick-field">
                <span className="colab-cal-quick-icon" aria-hidden>
                  <MapPin size={16} strokeWidth={1.75} />
                </span>
                <input
                  placeholder="Add location"
                  value={editor.location}
                  onChange={(e) => setEditor({ ...editor, location: e.target.value })}
                />
              </div>
              <div className="colab-cal-editor-panel">
                <label className="colab-cal-editor-panel-label">Description</label>
                <textarea
                  rows={4}
                  value={editor.description}
                  onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                />
              </div>
            </div>
            <div>
              <div className="colab-cal-guests-tabs">
                <button type="button" className="active">
                  Guests
                </button>
                <button type="button" onClick={() => navigate('/dashboard/meet')}>
                  Meet link
                </button>
              </div>
              <input
                className="colab-cal-editor-guest-input"
                placeholder="Add guests (comma-separated emails)"
                value={editor.attendeesRaw}
                onChange={(e) => setEditor({ ...editor, attendeesRaw: e.target.value })}
              />
              <label className="colab-cal-quick-field">
                <input
                  type="checkbox"
                  checked={editor.withMeet}
                  onChange={(e) => setEditor({ ...editor, withMeet: e.target.checked })}
                />
                <span>Add IAM Meet video conferencing</span>
              </label>
              {editor.event && meetRoomId(editor.event) && (
                <div className="colab-cal-editor-panel">
                  <div className="colab-cal-muted-caption">Meet room</div>
                  <button type="button" className="colab-cal-outline-btn" onClick={() => navigate(`/dashboard/meet?room=${meetRoomId(editor.event!)}`)}>
                    Join meeting
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="colab-cal-toast">{toast}</div>}
    </div>
    </CollaborateWorkShell>
  );
}
