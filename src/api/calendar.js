/**
 * Calendar API — workspace events, booking pages, insights, working hours.
 */
import { jsonResponse, getAuthUser } from '../core/auth.js';
import { usHolidaysInWindow } from '../core/calendar-holidays.js';
import { insertMeetRoomRow, meetJoinUrl, normalizeInviteEmails, sendMeetInvites } from '../core/meet-shared.js';

function resolveWorkspaceIdLoose(authUser, env, url) {
  const fromSession = authUser?.workspace_id ?? authUser?.workspaceId ?? null;
  if (fromSession && String(fromSession).trim()) return String(fromSession).trim();
  const fromQuery = url?.searchParams?.get('workspace_id') ?? null;
  if (fromQuery && String(fromQuery).trim()) return String(fromQuery).trim();
  const fromEnv = env?.WORKSPACE_ID ?? null;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  return null;
}

function clampView(viewRaw) {
  const v = String(viewRaw || '').toLowerCase();
  return v === 'day' || v === 'week' || v === 'month' || v === 'year' ? v : 'month';
}

function toSqlDateTime(d) {
  return new Date(d.getTime() - d.getMilliseconds()).toISOString().slice(0, 19).replace('T', ' ');
}

function parseSqlDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return new Date(NaN);
  return new Date(s.includes('T') ? s : s.replace(' ', 'T'));
}

function eventDurationMinutes(ev) {
  const start = parseSqlDate(ev.start_datetime);
  const end = parseSqlDate(ev.end_datetime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function computeWindow(view, url, anchorDate) {
  const qpFrom = url.searchParams.get('from');
  const qpTo = url.searchParams.get('to');
  if (qpFrom && qpTo) return { from: qpFrom, to: qpTo };

  const now = anchorDate ? new Date(anchorDate) : new Date();
  const from = new Date(now);
  const to = new Date(now);

  if (view === 'day') {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  } else if (view === 'week') {
    const dow = from.getDay();
    from.setDate(from.getDate() - dow);
    from.setHours(0, 0, 0, 0);
    to.setTime(from.getTime());
    to.setDate(to.getDate() + 7);
    to.setMilliseconds(to.getMilliseconds() - 1);
  } else if (view === 'year') {
    from.setMonth(0, 1);
    from.setHours(0, 0, 0, 0);
    to.setMonth(11, 31);
    to.setHours(23, 59, 59, 999);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    const spill = from.getDay();
    from.setDate(from.getDate() - spill);
    to.setTime(from.getTime());
    to.setDate(to.getDate() + 42);
    to.setMilliseconds(to.getMilliseconds() - 1);
  }

  return { from: toSqlDateTime(from), to: toSqlDateTime(to) };
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function parseSourcesParam(raw) {
  const all = new Set(['primary', 'tasks', 'holidays', 'birthdays']);
  if (!raw || raw === 'all') return all;
  return new Set(
    String(raw)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function createMeetRoomForEvent(env, request, { title, workspaceId, tenantId, createdBy, calendarEventId, status = 'scheduled' }) {
  const roomId = `room_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await insertMeetRoomRow(env, {
    roomId,
    title: title || 'Client call',
    userId: createdBy,
    workspaceId,
    tenantId,
    calendarEventId,
    status,
  });
  return roomId;
}

async function fetchTaskCalendarEvents(env, workspaceId, tenantId, from, to) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, title, description, status, priority, linked_route, notes, due_date, created_at
       FROM agentsam_todo
       WHERE workspace_id = ?
         AND tenant_id = ?
         AND (status IS NULL OR LOWER(TRIM(status)) NOT IN ('done', 'completed', 'cancelled'))
       ORDER BY priority ASC, sort_order ASC
       LIMIT 200`,
    )
      .bind(workspaceId, tenantId)
      .all();
    const fromMs = parseSqlDate(from).getTime();
    const toMs = parseSqlDate(to).getTime();
    return (results || [])
      .map((row) => {
        const dueRaw = row.due_date != null ? String(row.due_date).trim() : '';
        const anchorRaw = dueRaw || (row.created_at != null ? String(row.created_at).trim() : '');
        if (!anchorRaw) return null;
        const parsed = parseSqlDate(anchorRaw);
        if (Number.isNaN(parsed.getTime())) return null;
        const start = new Date(parsed);
        const hasTime = dueRaw.includes(':') || dueRaw.includes('T');
        if (!hasTime) {
          start.setHours(9, 0, 0, 0);
        }
        if (start.getTime() < fromMs || start.getTime() > toMs) return null;
        const end = new Date(start.getTime() + 30 * 60000);
        return {
          id: `task_${row.id}`,
          title: row.title || 'Task',
          description: row.description || row.notes || null,
          event_type: 'task',
          calendar_source: 'tasks',
          start_datetime: toSqlDateTime(start),
          end_datetime: toSqlDateTime(end),
          color: '#4285f4',
          status: row.status || 'open',
          all_day: hasTime ? 0 : 1,
          todo_id: String(row.id),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchBirthdayEvents(env, workspaceId) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT display_name, email FROM workspace_members
       WHERE workspace_id = ? AND COALESCE(is_active, 1) = 1`,
    )
      .bind(workspaceId)
      .all();
    const year = new Date().getFullYear();
    return (results || []).map((m, i) => {
      const day = (i % 28) + 1;
      const month = (i % 12) + 1;
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        id: `bday_${m.email || i}`,
        title: `${m.display_name || m.email || 'Member'} birthday`,
        event_type: 'birthday',
        calendar_source: 'birthdays',
        all_day: 1,
        start_datetime: `${key} 00:00:00`,
        end_datetime: `${key} 23:59:59`,
        color: '#33a852',
        status: 'scheduled',
      };
    });
  } catch {
    return [];
  }
}

function computeInsights(events, workingHours) {
  const byType = {
    focus: 0,
    task: 0,
    one_on_one: 0,
    multi_guest: 0,
    need_response: 0,
    meeting: 0,
    event: 0,
    other: 0,
  };
  const people = new Map();

  for (const ev of events) {
    if (ev.calendar_source === 'holidays') continue;
    const mins = eventDurationMinutes(ev);
    const type = String(ev.event_type || 'event').toLowerCase();
    if (type === 'focus') byType.focus += mins;
    else if (type === 'task') byType.task += mins;
    else if (type === 'meeting' || type === 'client_call') byType.meeting += mins;
    else if (type === 'event') byType.event += mins;
    else byType.other += mins;

    let attendees = [];
    try {
      attendees = ev.attendees ? (typeof ev.attendees === 'string' ? JSON.parse(ev.attendees) : ev.attendees) : [];
    } catch {
      attendees = [];
    }
    if (Array.isArray(attendees)) {
      if (attendees.length === 1) byType.one_on_one += mins;
      if (attendees.length >= 3) byType.multi_guest += mins;
      for (const email of attendees) {
        const key = String(email).toLowerCase();
        people.set(key, (people.get(key) || 0) + mins);
      }
    }
  }

  const workMins =
    workingHours?.start_minutes != null && workingHours?.end_minutes != null
      ? Math.max(0, Number(workingHours.end_minutes) - Number(workingHours.start_minutes))
      : 480;

  return {
    breakdown_minutes: byType,
    meeting_minutes: byType.meeting + byType.one_on_one + byType.multi_guest,
    people: [...people.entries()]
      .map(([email, minutes]) => ({ email, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 12),
    working_minutes_per_day: workMins,
  };
}

async function getWorkingHours(env, workspaceId, userId) {
  try {
    const row = await env.DB.prepare(
      `SELECT timezone, start_minutes, end_minutes, work_days_json
       FROM calendar_working_hours WHERE workspace_id = ? AND user_id = ? LIMIT 1`,
    )
      .bind(workspaceId, userId)
      .first();
    if (row) return row;
  } catch {
    /* table may not exist yet */
  }
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago',
    start_minutes: 540,
    end_minutes: 1020,
    work_days_json: '[1,2,3,4,5]',
  };
}

async function upsertWorkingHours(env, workspaceId, userId, body) {
  const id = `cwh_${workspaceId}_${userId}`.slice(0, 64);
  const timezone = String(body.timezone || 'America/Chicago').slice(0, 64);
  const start_minutes = Number(body.start_minutes ?? 540);
  const end_minutes = Number(body.end_minutes ?? 1020);
  const work_days_json =
    typeof body.work_days_json === 'string'
      ? body.work_days_json
      : JSON.stringify(body.work_days_json || [1, 2, 3, 4, 5]);
  await env.DB.prepare(
    `INSERT INTO calendar_working_hours (id, workspace_id, user_id, timezone, start_minutes, end_minutes, work_days_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(workspace_id, user_id) DO UPDATE SET
       timezone = excluded.timezone,
       start_minutes = excluded.start_minutes,
       end_minutes = excluded.end_minutes,
       work_days_json = excluded.work_days_json,
       updated_at = datetime('now')`,
  )
    .bind(id, workspaceId, userId, timezone, start_minutes, end_minutes, work_days_json)
    .run();
  return getWorkingHours(env, workspaceId, userId);
}

export async function handleCalendarApi(request, url, env, ctx) {
  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/\/$/, '');
  const parts = path.replace('/api/calendar', '').split('/').filter(Boolean);

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const workspaceId = resolveWorkspaceIdLoose(authUser, env, url);
  const tenantId =
    authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
      ? String(authUser.tenant_id).trim()
      : null;
  const userId = String(authUser?.id || authUser?.user_id || authUser?.email || '').trim();

  if (!workspaceId && parts[0] !== 'book') {
    return jsonResponse({ events: [] }, 200);
  }

  // GET /api/calendar/view/:view
  if (parts[0] === 'view' && method === 'GET') {
    const view = clampView(parts[1] || 'month');
    const anchor = url.searchParams.get('anchor');
    const { from, to } = computeWindow(view, url, anchor);
    const sources = parseSourcesParam(url.searchParams.get('sources'));

    let events = [];
    if (sources.has('primary')) {
      const { results } = await env.DB.prepare(
        `SELECT ce.*, mr.id AS room_id, mr.status AS room_status
         FROM calendar_events ce
         LEFT JOIN meet_rooms mr ON mr.id = ce.meet_room_id
         WHERE ce.workspace_id = ?
           AND ce.start_datetime >= ?
           AND ce.start_datetime <= ?
           AND (ce.calendar_source IS NULL OR ce.calendar_source = 'primary' OR ce.calendar_source = '')
         ORDER BY ce.start_datetime ASC`,
      )
        .bind(workspaceId, from, to)
        .all();
      events = events.concat(results || []);
    }

    if (sources.has('tasks') && tenantId) {
      events = events.concat(await fetchTaskCalendarEvents(env, workspaceId, tenantId, from, to));
    }
    if (sources.has('holidays')) {
      events = events.concat(usHolidaysInWindow(from, to));
    }
    if (sources.has('birthdays')) {
      events = events.concat(await fetchBirthdayEvents(env, workspaceId));
    }

    return jsonResponse({ events, window: { from, to }, view }, 200);
  }

  // GET /api/calendar/insights
  if (parts[0] === 'insights' && method === 'GET') {
    const anchor = url.searchParams.get('anchor');
    const { from, to } = computeWindow('week', url, anchor);
    const viewUrl = new URL(url);
    viewUrl.searchParams.set('from', from);
    viewUrl.searchParams.set('to', to);
    const sources = parseSourcesParam('primary,tasks');
    let events = [];
    if (sources.has('primary')) {
      const { results } = await env.DB.prepare(
        `SELECT * FROM calendar_events
         WHERE workspace_id = ? AND start_datetime >= ? AND start_datetime <= ?
         ORDER BY start_datetime ASC`,
      )
        .bind(workspaceId, from, to)
        .all();
      events = results || [];
    }
    if (tenantId) {
      events = events.concat(await fetchTaskCalendarEvents(env, workspaceId, tenantId, from, to));
    }
    const workingHours = await getWorkingHours(env, workspaceId, userId);
    const insights = computeInsights(events, workingHours);

    const weeks = [];
    const anchorDate = anchor ? new Date(anchor) : new Date();
    for (let i = -2; i <= 2; i += 1) {
      const wStart = new Date(anchorDate);
      wStart.setDate(wStart.getDate() - wStart.getDay() + i * 7);
      wStart.setHours(0, 0, 0, 0);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 7);
      const wFrom = toSqlDateTime(wStart);
      const wTo = toSqlDateTime(wEnd);
      const { results } = await env.DB.prepare(
        `SELECT start_datetime, end_datetime, event_type FROM calendar_events
         WHERE workspace_id = ? AND start_datetime >= ? AND start_datetime < ?`,
      )
        .bind(workspaceId, wFrom, wTo)
        .all();
      const mins = (results || []).reduce((sum, ev) => sum + eventDurationMinutes(ev), 0);
      weeks.push({
        label: `${wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(wEnd.getTime() - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        minutes: mins,
        active: i === 0,
      });
    }

    return jsonResponse({ window: { from, to }, insights, weeks, working_hours: workingHours }, 200);
  }

  // GET /api/calendar/tasks-insights — today/week time by project + task
  if (parts[0] === 'tasks-insights' && method === 'GET') {
    const anchor = url.searchParams.get('anchor');
    const dayWindow = computeWindow('day', url, anchor);
    const weekWindow = computeWindow('week', url, anchor);
    const userIds = [...new Set([userId, userId ? `user_${userId}` : null].filter(Boolean))];

    let todayMinutes = 0;
    let activeTracking = false;
    const byProjectMap = new Map();
    const byTaskMap = new Map();

    try {
      const placeholders = userIds.map(() => '?').join(',');
      const { results: entries } = await env.DB.prepare(
        `SELECT id, project_id, duration_seconds, is_active, description, start_time
         FROM project_time_entries
         WHERE user_id IN (${placeholders})
           AND date(start_time) >= date(?)
           AND date(start_time) <= date(?)
         ORDER BY start_time DESC`,
      )
        .bind(...userIds, dayWindow.from.slice(0, 10), dayWindow.to.slice(0, 10))
        .all();

      for (const row of entries || []) {
        const secs = Number(row.duration_seconds || 0);
        const mins = Math.round(secs / 60);
        todayMinutes += mins;
        if (Number(row.is_active) === 1) activeTracking = true;
        const pid = String(row.project_id || 'inneranimalmedia');
        byProjectMap.set(pid, (byProjectMap.get(pid) || 0) + mins);
        const desc = String(row.description || '');
        const todoMatch = desc.match(/todo_[a-z0-9]+/i);
        if (todoMatch) {
          const tid = todoMatch[0];
          byTaskMap.set(tid, (byTaskMap.get(tid) || 0) + mins);
        }
      }
    } catch {
      /* project_time_entries may be absent or schema variant */
    }

    // Calendar task events for the week add scheduled task minutes
    try {
      let taskEvents = [];
      if (tenantId) {
        taskEvents = await fetchTaskCalendarEvents(env, workspaceId, tenantId, weekWindow.from, weekWindow.to);
      }
      for (const ev of taskEvents) {
        const mins = eventDurationMinutes(ev);
        const tid = ev.todo_id || String(ev.id || '').replace(/^task_/, '');
        if (tid.startsWith('todo_')) {
          byTaskMap.set(tid, (byTaskMap.get(tid) || 0) + mins);
        }
      }
    } catch {
      /* non-fatal */
    }

    const projectIds = [...byProjectMap.keys()];
    const projectNames = new Map();
    if (projectIds.length) {
      try {
        const placeholders = projectIds.map(() => '?').join(',');
        const { results: prows } = await env.DB.prepare(
          `SELECT id, name FROM projects WHERE id IN (${placeholders})`,
        )
          .bind(...projectIds)
          .all();
        for (const p of prows || []) projectNames.set(String(p.id), String(p.name || p.id));
      } catch {
        /* ignore */
      }
    }

    const todoIds = [...byTaskMap.keys()].filter((id) => id.startsWith('todo_'));
    const todoTitles = new Map();
    if (todoIds.length) {
      try {
        const placeholders = todoIds.map(() => '?').join(',');
        const { results: todos } = await env.DB.prepare(
          `SELECT id, title FROM agentsam_todo WHERE id IN (${placeholders})`,
        )
          .bind(...todoIds)
          .all();
        for (const t of todos || []) todoTitles.set(String(t.id), String(t.title || t.id));
      } catch {
        /* ignore */
      }
    }

    const by_project = [...byProjectMap.entries()]
      .map(([project_id, minutes]) => ({
        project_id,
        name: projectNames.get(project_id) || project_id,
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    const by_task = [...byTaskMap.entries()]
      .map(([todo_id, minutes]) => ({
        todo_id,
        title: todoTitles.get(todo_id) || todo_id,
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    return jsonResponse(
      {
        today_minutes: todayMinutes,
        active_tracking: activeTracking,
        by_project,
        by_task,
        window: dayWindow,
      },
      200,
    );
  }

  // POST /api/calendar/activity/heartbeat — autonomous active time while on collaborate
  if (parts[0] === 'activity' && parts[1] === 'heartbeat' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const projectId = String(body.project_id || 'inneranimalmedia').trim().slice(0, 120) || 'inneranimalmedia';
    const todoId = body.todo_id ? String(body.todo_id).trim().slice(0, 64) : null;
    const surface = String(body.surface || 'collaborate').trim().slice(0, 64);
    const beatSeconds = 60;
    const now = toSqlDateTime(new Date());
    const description = `${surface}${todoId ? ` · ${todoId}` : ''} · ${projectId}`;

    try {
      const userIds = [...new Set([userId, userId ? `user_${userId}` : null].filter(Boolean))];
      let activeRow = null;
      for (const uid of userIds) {
        activeRow = await env.DB.prepare(
          `SELECT id FROM project_time_entries
           WHERE user_id = ? AND is_active = 1
           ORDER BY start_time DESC LIMIT 1`,
        )
          .bind(uid)
          .first();
        if (activeRow) break;
      }

      if (activeRow?.id) {
        await env.DB.prepare(
          `UPDATE project_time_entries
           SET duration_seconds = COALESCE(duration_seconds, 0) + ?,
               description = ?,
               project_id = ?
           WHERE id = ?`,
        )
          .bind(beatSeconds, description, projectId, activeRow.id)
          .run();
      } else {
        const entryId = `pte_${userId || 'user'}_${Date.now()}`;
        await env.DB.prepare(
          `INSERT INTO project_time_entries
            (id, user_id, project_id, start_time, duration_seconds, is_active, description)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
        )
          .bind(entryId, userId, projectId, now, beatSeconds, description)
          .run();
      }
      return jsonResponse({ ok: true, tracked_seconds: beatSeconds }, 200);
    } catch (e) {
      console.warn('[calendar/activity/heartbeat]', e?.message ?? e);
      return jsonResponse({ ok: false, error: 'activity_unavailable' }, 200);
    }
  }

  // GET /api/calendar/people?q=
  if (parts[0] === 'people' && method === 'GET') {
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const { results } = await env.DB.prepare(
      `SELECT id, display_name, email, role, user_id
       FROM workspace_members
       WHERE workspace_id = ? AND COALESCE(is_active, 1) = 1
       ORDER BY display_name ASC, email ASC`,
    )
      .bind(workspaceId)
      .all();
    const filtered = (results || []).filter((m) => {
      if (!q) return true;
      return (
        String(m.display_name || '').toLowerCase().includes(q) ||
        String(m.email || '').toLowerCase().includes(q)
      );
    });
    return jsonResponse({ people: filtered.slice(0, 20) }, 200);
  }

  // GET|PUT /api/calendar/preferences
  if (parts[0] === 'preferences') {
    if (method === 'GET') {
      const wh = await getWorkingHours(env, workspaceId, userId);
      return jsonResponse({ working_hours: wh, timezone: wh.timezone }, 200);
    }
    if (method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      const wh = await upsertWorkingHours(env, workspaceId, userId, body.working_hours || body);
      return jsonResponse({ working_hours: wh }, 200);
    }
  }

  // GET|POST /api/calendar/booking-pages
  if (parts[0] === 'booking-pages' && !parts[1]) {
    if (method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT id, slug, title, duration_min, description, location, is_active, created_at
         FROM calendar_booking_pages WHERE workspace_id = ? ORDER BY title ASC`,
      )
        .bind(workspaceId)
        .all();
      return jsonResponse({ pages: results || [] }, 200);
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const title = String(body.title || '').trim().slice(0, 200);
      const slug = String(body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 80);
      const duration_min = Number(body.duration_min || 30);
      if (!title || !slug) return jsonResponse({ error: 'title and slug required' }, 400);
      const id = newId('cbp');
      await env.DB.prepare(
        `INSERT INTO calendar_booking_pages (id, workspace_id, tenant_id, user_id, slug, title, duration_min, description, location, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
        .bind(
          id,
          workspaceId,
          tenantId,
          userId,
          slug,
          title,
          duration_min,
          body.description || null,
          body.location || null,
        )
        .run();
      return jsonResponse({ success: true, id, slug }, 201);
    }
  }

  // POST /api/calendar/book/:slug — public book flow (auth required)
  if (parts[0] === 'book' && parts[1] && method === 'POST') {
    const slug = String(parts[1]).trim();
    const body = await request.json().catch(() => ({}));
    const page = await env.DB.prepare(
      `SELECT * FROM calendar_booking_pages WHERE workspace_id = ? AND slug = ? AND is_active = 1 LIMIT 1`,
    )
      .bind(workspaceId, slug)
      .first();
    if (!page) return jsonResponse({ error: 'Booking page not found' }, 404);
    const start_datetime = String(body.start_datetime || '').trim();
    if (!start_datetime) return jsonResponse({ error: 'start_datetime required' }, 400);
    const start = parseSqlDate(start_datetime);
    const end = new Date(start.getTime() + Number(page.duration_min || 30) * 60000);
    const title = `${page.title} · ${authUser.email || userId}`;
    const id = newId('cev');
    await env.DB.prepare(
      `INSERT INTO calendar_events
        (id, tenant_id, workspace_id, event_type, title, description, location,
         start_datetime, end_datetime, status, attendees, created_by, calendar_source, created_at, updated_at)
       VALUES (?, ?, ?, 'meeting', ?, ?, ?, ?, ?, 'scheduled', ?, ?, 'primary', datetime('now'), datetime('now'))`,
    )
      .bind(
        id,
        tenantId,
        workspaceId,
        title,
        page.description,
        page.location,
        toSqlDateTime(start),
        toSqlDateTime(end),
        JSON.stringify([authUser.email].filter(Boolean)),
        page.user_id || userId,
      )
      .run();
    const meetRoomId = await createMeetRoomForEvent(env, request, {
      title,
      workspaceId,
      tenantId,
      createdBy: page.user_id || userId,
      calendarEventId: id,
    });
    await env.DB.prepare(`UPDATE calendar_events SET meet_room_id = ? WHERE id = ?`).bind(meetRoomId, id).run();
    return jsonResponse({
      success: true,
      id,
      meet_room_id: meetRoomId,
      join_url: meetJoinUrl(env, meetRoomId, request),
    }, 201);
  }

  // POST /api/calendar/events
  if (parts[0] === 'events' && !parts[1] && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const title = String(body?.title || '').trim().slice(0, 200);
    const description = body?.description != null ? String(body.description).slice(0, 4000) : null;
    const location = body?.location != null ? String(body.location).slice(0, 400) : null;
    const start_datetime = body?.start_datetime != null ? String(body.start_datetime).trim() : null;
    const end_datetime = body?.end_datetime != null ? String(body.end_datetime).trim() : null;
    const status = body?.status != null ? String(body.status).trim().slice(0, 40) : 'scheduled';
    const event_type = body?.event_type != null ? String(body.event_type).trim().slice(0, 40) : 'event';
    const color = body?.color != null ? String(body.color).trim().slice(0, 20) : null;
    const all_day = body?.all_day === true || body?.all_day === 1 ? 1 : 0;
    const timezone = body?.timezone != null ? String(body.timezone).slice(0, 64) : null;
    const recurrence_rule = body?.recurrence_rule != null ? String(body.recurrence_rule).slice(0, 200) : null;
    const calendar_source = body?.calendar_source != null ? String(body.calendar_source).slice(0, 40) : 'primary';
    const guest_permissions_json =
      body?.guest_permissions != null
        ? JSON.stringify(body.guest_permissions)
        : body?.guest_permissions_json != null
          ? typeof body.guest_permissions_json === 'string'
            ? body.guest_permissions_json
            : JSON.stringify(body.guest_permissions_json)
          : null;
    const attendeesJson =
      body?.attendees != null
        ? typeof body.attendees === 'string'
          ? body.attendees
          : JSON.stringify(body.attendees)
        : null;

    if (!title || !start_datetime || !end_datetime) {
      return jsonResponse({ success: false, error: 'title, start_datetime, end_datetime required' }, 400);
    }

    const id = newId('cev');
    await env.DB.prepare(
      `INSERT INTO calendar_events
        (id, tenant_id, workspace_id, event_type, title, description, location,
         start_datetime, end_datetime, color, status, attendees, created_by,
         all_day, timezone, recurrence_rule, calendar_source, guest_permissions_json,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        id,
        tenantId,
        workspaceId,
        event_type,
        title,
        description,
        location,
        start_datetime,
        end_datetime,
        color,
        status,
        attendeesJson,
        userId,
        all_day,
        timezone,
        recurrence_rule,
        calendar_source,
        guest_permissions_json,
      )
      .run();

    let attendeeList = [];
    try {
      if (Array.isArray(body?.attendees)) attendeeList = body.attendees;
      else if (attendeesJson) attendeeList = JSON.parse(attendeesJson);
    } catch {
      attendeeList = [];
    }
    const attendees = normalizeInviteEmails(attendeeList);
    const withMeet =
      body?.with_meet === true ||
      event_type === 'meeting' ||
      event_type === 'client_call' ||
      body?.add_meet === true;

    let meetRoomId = null;
    if (withMeet) {
      meetRoomId = await createMeetRoomForEvent(env, request, {
        title,
        workspaceId,
        tenantId,
        createdBy: userId,
        calendarEventId: id,
      });
      await env.DB.prepare(`UPDATE calendar_events SET meet_room_id = ? WHERE id = ?`).bind(meetRoomId, id).run();
      if (attendees.length > 0) {
        await sendMeetInvites(env, {
          roomId: meetRoomId,
          emails: attendees,
          invitedBy: userId,
          workspaceId,
          tenantId,
          calendarEventId: id,
          meetingName: title,
          inviterLabel: authUser?.email || userId,
          link: meetJoinUrl(env, meetRoomId, request),
          scheduledLabel: `${start_datetime} → ${end_datetime}`,
          description,
        }).catch(() => {});
      }
    }

    return jsonResponse({
      success: true,
      id,
      meet_room_id: meetRoomId,
      join_url: meetRoomId ? meetJoinUrl(env, meetRoomId, request) : null,
    }, 200);
  }

  // GET /api/calendar/events/:id
  if (parts[0] === 'events' && parts[1] && !parts[2] && method === 'GET') {
    const id = String(parts[1]).trim();
    const row = await env.DB.prepare(
      `SELECT ce.*, mr.id AS room_id FROM calendar_events ce
       LEFT JOIN meet_rooms mr ON mr.id = ce.meet_room_id
       WHERE ce.id = ? AND ce.workspace_id = ? LIMIT 1`,
    )
      .bind(id, workspaceId)
      .first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    return jsonResponse({ event: row }, 200);
  }

  // PUT /api/calendar/events/:id
  if (parts[0] === 'events' && parts[1] && method === 'PUT') {
    const id = String(parts[1] || '').trim();
    const body = await request.json().catch(() => ({}));
    const existing = await env.DB.prepare(
      `SELECT id FROM calendar_events WHERE id = ? AND workspace_id = ? LIMIT 1`,
    )
      .bind(id, workspaceId)
      .first();
    if (!existing) return jsonResponse({ error: 'Not found' }, 404);

    const fields = [];
    const binds = [];

    const setField = (col, val) => {
      if (val !== undefined) {
        fields.push(`${col} = ?`);
        binds.push(val);
      }
    };

    setField('title', body.title != null ? String(body.title).trim().slice(0, 200) : undefined);
    setField('description', body.description != null ? String(body.description).slice(0, 4000) : undefined);
    setField('location', body.location != null ? String(body.location).slice(0, 400) : undefined);
    setField('start_datetime', body.start_datetime != null ? String(body.start_datetime).trim() : undefined);
    setField('end_datetime', body.end_datetime != null ? String(body.end_datetime).trim() : undefined);
    setField('status', body.status != null ? String(body.status).trim().slice(0, 40) : undefined);
    setField('completed_at', body.completed_at != null ? String(body.completed_at).trim() : undefined);
    setField('event_type', body.event_type != null ? String(body.event_type).trim().slice(0, 40) : undefined);
    setField('color', body.color != null ? String(body.color).slice(0, 20) : undefined);
    setField('all_day', body.all_day != null ? (body.all_day ? 1 : 0) : undefined);
    setField('timezone', body.timezone != null ? String(body.timezone).slice(0, 64) : undefined);
    setField('recurrence_rule', body.recurrence_rule != null ? String(body.recurrence_rule).slice(0, 200) : undefined);
    if (body.attendees != null) {
      setField(
        'attendees',
        typeof body.attendees === 'string' ? body.attendees : JSON.stringify(body.attendees),
      );
    }
    if (body.guest_permissions != null || body.guest_permissions_json != null) {
      setField(
        'guest_permissions_json',
        body.guest_permissions_json != null
          ? typeof body.guest_permissions_json === 'string'
            ? body.guest_permissions_json
            : JSON.stringify(body.guest_permissions_json)
          : JSON.stringify(body.guest_permissions),
      );
    }

    if (!fields.length) return jsonResponse({ success: false, error: 'No fields to update' }, 400);

    fields.push("updated_at = datetime('now')");
    binds.push(id, workspaceId);
    await env.DB.prepare(
      `UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`,
    )
      .bind(...binds)
      .run();

    if (body.with_meet === true) {
      const ev = await env.DB.prepare(`SELECT * FROM calendar_events WHERE id = ?`).bind(id).first();
      if (ev && !ev.meet_room_id) {
        const meetRoomId = await createMeetRoomForEvent(env, request, {
          title: ev.title,
          workspaceId,
          tenantId,
          createdBy: userId,
          calendarEventId: id,
        });
        await env.DB.prepare(`UPDATE calendar_events SET meet_room_id = ? WHERE id = ?`).bind(meetRoomId, id).run();
      }
    }

    return jsonResponse({ success: true }, 200);
  }

  // DELETE /api/calendar/events/:id
  if (parts[0] === 'events' && parts[1] && method === 'DELETE') {
    const id = String(parts[1] || '').trim();
    await env.DB.prepare(`DELETE FROM calendar_events WHERE id = ? AND workspace_id = ?`)
      .bind(id, workspaceId)
      .run();
    return jsonResponse({ success: true }, 200);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
