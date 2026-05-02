/**
 * src/api/calendar.js
 * Calendar events API (workspace-aware) + meet room linking.
 *
 * Routes (expected by dashboard UI):
 *  - GET    /api/calendar/view/:view
 *  - POST   /api/calendar/events
 *  - PUT    /api/calendar/events/:id
 *  - DELETE /api/calendar/events/:id
 */
import { jsonResponse } from '../core/auth.js';
import { getAuthUser } from '../core/auth.js';

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
  // D1 stores 'YYYY-MM-DD HH:MM:SS'
  return new Date(d.getTime() - d.getMilliseconds())
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

function computeWindow(view, url) {
  const qpFrom = url.searchParams.get('from');
  const qpTo = url.searchParams.get('to');
  if (qpFrom && qpTo) return { from: qpFrom, to: qpTo };

  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);

  if (view === 'day') {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  } else if (view === 'week') {
    // Sunday-start week to match UI grid
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
    // month: include spillover weeks (6-week grid)
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    const spill = from.getDay(); // days before first of month
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

async function createMeetRoomForEvent(env, { title, workspaceId, tenantId, createdBy, calendarEventId }) {
  const roomId = `room_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  const cfAppId = env?.CLOUDFLARE_CALLS_APP_ID ?? null;

  await env.DB.prepare(
    `INSERT OR IGNORE INTO meet_rooms
      (id, name, workspace_id, tenant_id, calendar_event_id, cf_app_id, status, created_by, created_at)
     VALUES
      (?,  ?,    ?,           ?,        ?,                 ?,        'scheduled', ?,        datetime('now'))`
  ).bind(
    roomId,
    title || 'Client call',
    workspaceId,
    tenantId,
    calendarEventId,
    cfAppId,
    createdBy
  ).run();

  return roomId;
}

async function maybeWriteClientCallSystemMessage(env, { workspaceId, tenantId, userId, title, startDatetime, clientId }) {
  if (!clientId) return;

  // Best-effort: if a client->channel mapping exists, write a system message.
  try {
    const row = await env.DB.prepare(
      `SELECT channel_id FROM clients WHERE id = ? LIMIT 1`
    ).bind(String(clientId)).first();
    const channelId = row?.channel_id ?? null;
    if (!channelId) return;

    await env.DB.prepare(
      `INSERT INTO messages
        (id, channel_id, workspace_id, tenant_id, user_id, content, content_type, metadata_json, created_at, updated_at)
       VALUES
        (?,  ?,         ?,           ?,         ?,       ?,       'system',     ?,             unixepoch(), unixepoch())`
    ).bind(
      newId('msg'),
      channelId,
      workspaceId,
      tenantId,
      userId,
      `Client call scheduled: ${String(title || '').slice(0, 180)} at ${String(startDatetime || '').slice(0, 32)}`,
      JSON.stringify({ source: 'calendar', event_type: 'client_call' })
    ).run();
  } catch {
    // ignore if schema differs
  }
}

export async function handleCalendarApi(request, url, env, ctx) {
  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/\/$/, '');
  const parts = path.replace('/api/calendar', '').split('/').filter(Boolean);

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const workspaceId = resolveWorkspaceIdLoose(authUser, env, url);
  const tenantId = authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== '' ? String(authUser.tenant_id).trim() : null;
  const userId = String(authUser?.id || authUser?.user_id || authUser?.email || '').trim();
  if (!workspaceId) return jsonResponse({ events: [] }, 200);

  // GET /api/calendar/view/:view
  if (parts[0] === 'view' && method === 'GET') {
    const view = clampView(parts[1] || 'month');
    const { from, to } = computeWindow(view, url);

    const rows = await env.DB.prepare(
      `SELECT
         ce.*,
         mr.id     AS room_id,
         mr.status AS room_status,
         mr.cf_app_id,
         mr.ended_at AS room_ended_at
       FROM calendar_events ce
       LEFT JOIN meet_rooms mr ON mr.id = ce.meet_room_id
       WHERE ce.workspace_id = ?
         AND ce.start_datetime >= ?
         AND ce.start_datetime <= ?
       ORDER BY ce.start_datetime ASC`
    ).bind(workspaceId, from, to).all();

    return jsonResponse({ events: rows.results || [], window: { from, to }, view }, 200);
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
    const attendeesJson = body?.attendees != null
      ? (typeof body.attendees === 'string' ? body.attendees : JSON.stringify(body.attendees))
      : null;

    if (!title || !start_datetime || !end_datetime) {
      return jsonResponse({ success: false, error: 'title, start_datetime, end_datetime required' }, 400);
    }

    const id = newId('cev');

    await env.DB.prepare(
      `INSERT INTO calendar_events
        (id, tenant_id, workspace_id, event_type, title, description, location,
         start_datetime, end_datetime, color, status, attendees, created_by, created_at, updated_at)
       VALUES
        (?,  ?,         ?,           ?,         ?,     ?,           ?,
         ?,            ?,            ?,     ?,      ?,         ?,          datetime('now'), datetime('now'))`
    ).bind(
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
      userId
    ).run();

    let meetRoomId = null;
    if (event_type === 'client_call') {
      meetRoomId = await createMeetRoomForEvent(env, {
        title,
        workspaceId,
        tenantId,
        createdBy: userId,
        calendarEventId: id,
      });
      await env.DB.prepare(`UPDATE calendar_events SET meet_room_id = ? WHERE id = ?`)
        .bind(meetRoomId, id).run();

      await maybeWriteClientCallSystemMessage(env, {
        workspaceId,
        tenantId,
        userId,
        title,
        startDatetime: start_datetime,
        clientId: body?.client_id ?? null,
      });
    }

    return jsonResponse({ success: true, id, meet_room_id: meetRoomId }, 200);
  }

  // PUT /api/calendar/events/:id
  if (parts[0] === 'events' && parts[1] && method === 'PUT') {
    const id = String(parts[1] || '').trim();
    const body = await request.json().catch(() => ({}));

    const status = body?.status != null ? String(body.status).trim().slice(0, 40) : null;
    const completed_at = body?.completed_at != null ? String(body.completed_at).trim() : null;

    if (!status && !completed_at) return jsonResponse({ success: false, error: 'No fields to update' }, 400);

    await env.DB.prepare(
      `UPDATE calendar_events
         SET status = COALESCE(?, status),
             completed_at = COALESCE(?, completed_at),
             updated_at = datetime('now')
       WHERE id = ? AND workspace_id = ?`
    ).bind(status, completed_at, id, workspaceId).run();

    return jsonResponse({ success: true }, 200);
  }

  // DELETE /api/calendar/events/:id
  if (parts[0] === 'events' && parts[1] && method === 'DELETE') {
    const id = String(parts[1] || '').trim();
    await env.DB.prepare(
      `DELETE FROM calendar_events WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).run();
    return jsonResponse({ success: true }, 200);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

