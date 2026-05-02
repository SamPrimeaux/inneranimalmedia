/**
 * src/api/meet.js
 * Cloudflare Calls SFU proxy + room signaling + chat + invite
 */

import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';

const CALLS_BASE = 'https://rtc.live.cloudflare.com/v1';
const TURN_BASE  = 'https://rtc.live.cloudflare.com/v1/turn/keys';

function resolveWorkspaceIdLoose(authUser, env, body = null, url = null) {
  const fromSession = authUser?.workspace_id ?? authUser?.workspaceId ?? null;
  if (fromSession && String(fromSession).trim()) return String(fromSession).trim();
  const fromBody = body?.workspace_id ?? body?.workspaceId ?? null;
  if (fromBody && String(fromBody).trim()) return String(fromBody).trim();
  const fromQuery = url?.searchParams?.get('workspace_id') ?? null;
  if (fromQuery && String(fromQuery).trim()) return String(fromQuery).trim();
  const fromEnv = env?.WORKSPACE_ID ?? null;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  return null;
}

function resolveTenantIdLoose(authUser) {
  const tid = authUser?.tenant_id ?? authUser?.tenantId ?? null;
  return tid != null && String(tid).trim() !== '' ? String(tid).trim() : null;
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

async function getUserId(request, env) {
  const user = await getAuthUser(request, env);
  const userId = user?.id || user?.userId || user?.user_id;
  return { user, userId };
}

async function callsRequest(env, path, method = 'GET', body = null) {
  const url  = `${CALLS_BASE}/apps/${env.CLOUDFLARE_CALLS_APP_ID}${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${env.CLOUDFLARE_CALLS_APP_SECRET}`,
      'Content-Type':  'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calls API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function ensureMeetMessagesTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS meet_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      room_id TEXT NOT NULL,
      channel_id TEXT,
      workspace_id TEXT,
      user_id TEXT,
      display_name TEXT,
      content TEXT NOT NULL,
      message_type TEXT DEFAULT 'chat' CHECK(message_type IN ('chat','system','reaction','file')),
      is_archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}

async function ensureMeetChatChannelId(db, { workspaceId, tenantId, createdBy }) {
  if (!workspaceId) return null;

  // Try the "desired" schema first (workspace_id + type + slug).
  try {
    const row = await db.prepare(
      "SELECT id FROM channels WHERE workspace_id=? AND type='system' AND slug='meet-chat' LIMIT 1"
    ).bind(workspaceId).first();
    if (row?.id) return row.id;
  } catch { /* continue */ }

  // Fallback: workspace_id + slug only
  try {
    const row = await db.prepare(
      "SELECT id FROM channels WHERE workspace_id=? AND slug='meet-chat' LIMIT 1"
    ).bind(workspaceId).first();
    if (row?.id) return row.id;
  } catch { /* continue */ }

  // Fallback: workspace_id + name
  try {
    const row = await db.prepare(
      "SELECT id FROM channels WHERE workspace_id=? AND name='Meet Chat' LIMIT 1"
    ).bind(workspaceId).first();
    if (row?.id) return row.id;
  } catch { /* continue */ }

  // Create (best-effort with multiple column sets).
  const chId = newId('ch');
  const tId = tenantId ?? null;
  const by = createdBy ?? null;

  const inserts = [
    {
      sql: `INSERT OR IGNORE INTO channels
              (id, workspace_id, tenant_id, name, slug, description, type, created_by)
            VALUES (?, ?, ?, 'Meet Chat', 'meet-chat', 'Persistent chat from video sessions', 'system', ?)`,
      binds: [chId, workspaceId, tId, by],
    },
    {
      sql: `INSERT OR IGNORE INTO channels
              (id, workspace_id, tenant_id, name, slug, type, created_by)
            VALUES (?, ?, ?, 'Meet Chat', 'meet-chat', 'system', ?)`,
      binds: [chId, workspaceId, tId, by],
    },
    {
      sql: `INSERT OR IGNORE INTO channels
              (id, workspace_id, tenant_id, name, slug, type)
            VALUES (?, ?, ?, 'Meet Chat', 'meet-chat', 'system')`,
      binds: [chId, workspaceId, tId],
    },
    {
      sql: `INSERT OR IGNORE INTO channels
              (workspace_id, tenant_id, name, slug, type)
            VALUES (?, ?, 'Meet Chat', 'meet-chat', 'system')`,
      binds: [workspaceId, tId],
    },
  ];

  for (const q of inserts) {
    try {
      await db.prepare(q.sql).bind(...q.binds).run();
      break;
    } catch { /* keep trying */ }
  }

  // Re-select after insert attempts
  try {
    const row = await db.prepare(
      "SELECT id FROM channels WHERE workspace_id=? AND slug='meet-chat' LIMIT 1"
    ).bind(workspaceId).first();
    return row?.id ?? null;
  } catch {
    return null;
  }
}

async function upsertParticipant(db, { roomId, userId, displayName, sessionId, tracksJson }) {
  await db.prepare(`
    INSERT INTO meet_participants (room_id, user_id, display_name, session_id, tracks_json, joined_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(room_id, user_id) DO UPDATE SET
      session_id   = excluded.session_id,
      tracks_json  = excluded.tracks_json,
      display_name = excluded.display_name,
      last_seen_at = datetime('now')
  `).bind(roomId, userId, displayName, sessionId, tracksJson || '[]').run();
}

async function pruneStale(db, roomId) {
  await db.prepare(`
    DELETE FROM meet_participants
    WHERE room_id = ? AND last_seen_at < datetime('now', '-15 seconds')
  `).bind(roomId).run();
}

export async function handleMeetApi(request, env, ctx) {
  const url    = new URL(request.url);
  const parts  = url.pathname.replace('/api/meet', '').split('/').filter(Boolean);
  const method = request.method;

  if (parts[0] === 'turn' && method === 'POST')
    return handleTurn(request, env);

  if (parts[0] === 'room' && !parts[1] && method === 'POST')
    return handleRoomJoin(request, env);

  if (parts[0] === 'room' && parts[1] && !parts[2] && method === 'GET')
    return handleRoomPoll(request, env, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'session' && method === 'POST')
    return handleSession(request, env, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'publish' && method === 'POST')
    return handlePublish(request, env, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'subscribe' && method === 'POST')
    return handleSubscribe(request, env, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'renegotiate' && method === 'POST')
    return handleRenegotiate(request, env, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'heartbeat' && method === 'POST')
    return handleHeartbeat(request, env, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'chat' && method === 'POST')
    return handleChat(request, env, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'leave' && method === 'POST')
    return handleLeave(request, env, parts[1]);

  if (parts[0] === 'room' && parts[2] === 'invite' && method === 'POST')
    return handleInvite(request, env, parts[1]);

  if (parts[0] === 'recording' && parts[1] === 'save' && method === 'POST')
    return handleRecordingSave(request, env);

  if (parts[0] === 'schedule' && method === 'POST')
    return handleSchedule(request, env);

  return jsonResponse({ error: 'Not found' }, 404);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleTurn(request, env) {
  try {
    const tokenParts = (env.REALTIME_TURN_API_TOKEN || '').split(':');
    const keyId      = tokenParts[0];
    const keyToken   = tokenParts.slice(1).join(':');

    if (!keyId || !keyToken) {
      return jsonResponse({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }, 200);
    }

    // Correct CF endpoint: generate-ice-servers (not generate)
    const res = await fetch(`${TURN_BASE}/${keyId}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keyToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ ttl: 86400 }),
    });

    if (!res.ok) {
      return jsonResponse({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }, 200);
    }

    const data = await res.json();
    // CF returns { iceServers: [...] } directly
    return jsonResponse({ iceServers: data.iceServers }, 200);
  } catch {
    return jsonResponse({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }, 200);
  }
}

async function handleRoomJoin(request, env) {
  const url    = new URL(request.url);
  const body   = await request.json().catch(() => ({}));
  const roomId = body.roomId || crypto.randomUUID();
  const name   = body.name   || `Meeting ${new Date().toLocaleTimeString()}`;
  const { user, userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!roomId) return jsonResponse({ error: 'Missing required fields' }, 400);

  const workspaceId = resolveWorkspaceIdLoose(user, env, body, url);
  const tenantId = resolveTenantIdLoose(user);
  const cfAppId = env?.CLOUDFLARE_CALLS_APP_ID ?? null;

  await env.DB.prepare(`
    INSERT INTO meet_rooms (id, name, workspace_id, tenant_id, cf_app_id, created_by, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'active')
    ON CONFLICT(id) DO NOTHING
  `).bind(roomId, name, workspaceId, tenantId, cfAppId, userId).run();

  return jsonResponse({ roomId, name }, 200);
}

async function handleRoomPoll(request, env, roomId) {
  const { userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  const db = env.DB;
  await ensureMeetMessagesTable(db);
  await pruneStale(db, roomId);

  const [participants, messages, room] = await Promise.all([
    db.prepare(`
      SELECT user_id, display_name, session_id, tracks_json, joined_at
      FROM meet_participants WHERE room_id = ?
    `).bind(roomId).all(),
    db.prepare(`
      SELECT id, user_id, display_name, content, created_at
      FROM meet_messages WHERE room_id = ? ORDER BY created_at ASC
    `).bind(roomId).all(),
    db.prepare(`SELECT id, name, created_by FROM meet_rooms WHERE id = ?`).bind(roomId).first(),
  ]);

  if (!room) return jsonResponse({ error: 'Not found' }, 404);

  return jsonResponse({
    room,
    participants: (participants.results || []).map(p => ({
      ...p, tracks: JSON.parse(p.tracks_json || '[]'),
    })),
    messages: (messages.results || []).map((m) => ({
      ...m,
      created_at: m?.created_at ? new Date(`${String(m.created_at).replace(' ', 'T')}Z`).toISOString() : null,
    })),
  }, 200);
}

async function handleSession(request, env, roomId) {
  const { user, userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const data = await callsRequest(env, '/sessions/new', 'POST');

  await upsertParticipant(env.DB, {
    roomId,
    userId,
    displayName: body.displayName || user?.email || userId,
    sessionId:   data.sessionId,
    tracksJson:  '[]',
  });

  return jsonResponse({ sessionId: data.sessionId }, 200);
}

async function handlePublish(request, env, roomId) {
  const { userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  const body = await request.json();
  const { sessionId, offer, tracks } = body;
  if (!sessionId || !offer || !tracks?.length) return jsonResponse({ error: 'sessionId, offer, tracks required' }, 400);

  const data = await callsRequest(env, `/sessions/${sessionId}/tracks/new`, 'POST', {
    sessionDescription: offer, tracks,
  });

  const trackNames = tracks.map(t => t.trackName);
  await env.DB.prepare(`
    UPDATE meet_participants SET tracks_json = ?, last_seen_at = datetime('now')
    WHERE room_id = ? AND user_id = ?
  `).bind(JSON.stringify(trackNames), roomId, userId).run();

  return jsonResponse({ answer: data.sessionDescription, trackList: data.tracks }, 200);
}

async function handleSubscribe(request, env, roomId) {
  const { userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  const body = await request.json();
  const { sessionId, remoteTracks } = body;
  if (!sessionId || !remoteTracks?.length) return jsonResponse({ error: 'sessionId and remoteTracks required' }, 400);

  const data = await callsRequest(env, `/sessions/${sessionId}/tracks/new`, 'POST', {
    tracks: remoteTracks.map(t => ({
      location:  'remote',
      sessionId: t.sessionId,
      trackName: t.trackName,
    })),
  });

  if (data.requiresImmediateRenegotiation) {
    return jsonResponse({ requiresRenegotiation: true, tracks: data.tracks }, 200);
  }
  return jsonResponse({ answer: data.sessionDescription, tracks: data.tracks }, 200);
}

async function handleRenegotiate(request, env, roomId) {
  const { userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  const body = await request.json();
  const { sessionId, offer } = body;
  if (!sessionId || !offer) return jsonResponse({ error: 'sessionId and offer required' }, 400);

  const data = await callsRequest(env, `/sessions/${sessionId}/renegotiate`, 'PUT', {
    sessionDescription: offer,
  });
  return jsonResponse({ answer: data.sessionDescription }, 200);
}

async function handleHeartbeat(request, env, roomId) {
  const { userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  await env.DB.prepare(`
    UPDATE meet_participants SET last_seen_at = datetime('now')
    WHERE room_id = ? AND user_id = ?
  `).bind(roomId, userId).run();
  return jsonResponse({ ok: true }, 200);
}

async function handleChat(request, env, roomId) {
  const { user, userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  const body    = await request.json().catch(() => ({}));
  const content = (body.content || '').trim().slice(0, 2000);
  if (!content) return jsonResponse({ error: 'content required' }, 400);
  await ensureMeetMessagesTable(env.DB);

  const participant = await env.DB.prepare(`
    SELECT display_name FROM meet_participants WHERE room_id = ? AND user_id = ?
  `).bind(roomId, userId).first();

  const displayName = participant?.display_name || user?.email || userId;

  const msgId = crypto.randomUUID();

  // Resolve room workspace/tenant for channel routing + persistence.
  let wsId = null;
  let tenantId = null;
  try {
    const room = await env.DB.prepare(
      `SELECT workspace_id, tenant_id FROM meet_rooms WHERE id = ? LIMIT 1`
    ).bind(roomId).first();
    wsId = room?.workspace_id ?? null;
    tenantId = room?.tenant_id ?? null;
  } catch { /* ignore */ }

  await env.DB.prepare(`
    INSERT INTO meet_messages (id, room_id, workspace_id, user_id, display_name, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(msgId, roomId, wsId, userId, displayName, content).run();

  // Dual-write to persistent messages table (best-effort).
  try {
    const chId = await ensureMeetChatChannelId(env.DB, { workspaceId: wsId, tenantId, createdBy: userId });
    if (chId) {
      const persistentId = newId('msg');
      await env.DB.prepare(`
        INSERT INTO messages
          (id, channel_id, workspace_id, tenant_id, user_id,
           content, content_type, metadata_json, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,unixepoch(),unixepoch())
      `).bind(
        persistentId,
        chId,
        wsId,
        tenantId,
        userId,
        content,
        'text',
        JSON.stringify({ room_id: roomId, source: 'meet_chat', meet_message_id: msgId })
      ).run();

      await env.DB.prepare(`UPDATE meet_messages SET channel_id = ? WHERE id = ?`)
        .bind(chId, msgId).run().catch(() => {});
    }
  } catch { /* ignore */ }

  return jsonResponse({ ok: true }, 200);
}

async function handleLeave(request, env, roomId) {
  const { userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  await env.DB.prepare(`
    DELETE FROM meet_participants WHERE room_id = ? AND user_id = ?
  `).bind(roomId, userId).run();

  const { count } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM meet_participants WHERE room_id = ?
  `).bind(roomId).first();

  if (count === 0) {
    await env.DB.prepare(`
      UPDATE meet_rooms SET
        ended_at = datetime('now'),
        duration_sec = (unixepoch() - unixepoch(created_at)),
        status = 'ended'
      WHERE id = ?
    `).bind(roomId).run();
  }
  return jsonResponse({ ok: true }, 200);
}

async function handleInvite(request, env, roomId) {
  const { user, userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  const body  = await request.json().catch(() => ({}));
  const email = (body.email || '').trim();
  const link  = (body.link  || '').trim();

  if (!email || !link) return jsonResponse({ error: 'email and link required' }, 400);

  const room = await env.DB.prepare(`SELECT name FROM meet_rooms WHERE id = ?`).bind(roomId).first();
  const meetingName = room?.name || 'a meeting';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    `Inner Animal Media <${env.RESEND_FROM || 'support@inneranimalmedia.com'}>`,
      to:      [email],
      subject: `You've been invited to ${meetingName}`,
      html: `
        <div style="font-family:monospace;background:#07100f;color:#c9d8d6;padding:32px;border-radius:12px;max-width:480px">
          <div style="color:#2dd4bf;font-weight:700;font-size:16px;margin-bottom:8px">InnerAnimalMedia</div>
          <h2 style="color:#e2efed;margin:0 0 12px">You're invited to join a meeting</h2>
          <p style="color:#6b9e99">${user?.email || userId} has invited you to <strong style="color:#c9d8d6">${meetingName}</strong>.</p>
          <a href="${link}" style="display:inline-block;background:#2dd4bf;color:#07100f;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:12px">Join Meeting</a>
          <p style="color:#4a7a75;font-size:11px;margin-top:16px">Or copy this link: ${link}</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return jsonResponse({ error: `Resend failed: ${err}` }, 500);
  }

  return jsonResponse({ ok: true }, 200);
}

async function handleRecordingSave(request, env) {
  const form = await request.formData().catch(() => null);
  if (!form) return jsonResponse({ error: 'FormData required' }, 400);
  const file = form.get('recording');
  const roomId = form.get('roomId') || 'unknown';
  if (!file || typeof file === 'string') return jsonResponse({ error: 'recording file required' }, 400);
  const { userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  const r2Key = `meet/recordings/${userId}/${roomId}_${Date.now()}.webm`;
  await env.DASHBOARD.put(r2Key, file.stream(), {
    httpMetadata: { contentType: 'video/webm' },
  });
  return jsonResponse({ ok: true, r2_key: r2Key }, 200);
}

async function handleSchedule(request, env) {
  const url = new URL(request.url);
  const { user, userId } = await getUserId(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));

  const title = String(body.title || '').trim().slice(0, 200);
  const scheduledAt = String(body.scheduledAt || body.scheduled_at || '').trim();
  const durationMin = Number(body.durationMin || body.duration_min || 30);
  const emails = Array.isArray(body.inviteEmails) ? body.inviteEmails : (Array.isArray(body.invite_emails) ? body.invite_emails : []);

  if (!title || !scheduledAt) return jsonResponse({ error: 'title and scheduledAt required' }, 400);

  const workspaceId = resolveWorkspaceIdLoose(user, env, body, url);
  const tenantId = resolveTenantIdLoose(user);

  // 1) Insert calendar_events first (workspace-aware).
  const calendarEventId = newId('cev');
  const endExpr = `datetime(?, '+' || ? || ' minutes')`;
  await env.DB.prepare(
    `INSERT INTO calendar_events
      (id, tenant_id, workspace_id, event_type, title, start_datetime, end_datetime, created_by, attendees, created_at, updated_at)
     VALUES
      (?,  ?,         ?,           'client_call', ?,     ?,             ${endExpr},   ?,         ?,         datetime('now'), datetime('now'))`
  ).bind(
    calendarEventId,
    tenantId,
    workspaceId,
    title,
    scheduledAt,
    scheduledAt,
    String(Math.max(5, Math.min(720, durationMin || 30))),
    userId,
    JSON.stringify(emails || []),
  ).run();

  // 2) Create meet room and link calendar_events.meet_room_id
  const roomId = `room_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO meet_rooms
      (id, name, workspace_id, tenant_id, calendar_event_id, cf_app_id, status, created_by, created_at)
     VALUES
      (?,  ?,    ?,           ?,        ?,                 ?,        'scheduled', ?,        datetime('now'))`
  ).bind(
    roomId,
    title,
    workspaceId,
    tenantId,
    calendarEventId,
    env?.CLOUDFLARE_CALLS_APP_ID ?? null,
    userId
  ).run();
  await env.DB.prepare(`UPDATE calendar_events SET meet_room_id = ? WHERE id = ?`)
    .bind(roomId, calendarEventId).run();

  // 3) Insert meet_scheduled with calendar_event_id linkage
  const scheduledId = newId('msched');
  await env.DB.prepare(`
    INSERT INTO meet_scheduled
      (id, created_by, title, scheduled_at, invite_emails, status, created_at, calendar_event_id, workspace_id, tenant_id, reminder_sent)
    VALUES
      (?,  ?,          ?,     ?,            ?,            'scheduled', datetime('now'), ?,               ?,            ?,        0)
  `).bind(
    scheduledId,
    userId,
    title,
    scheduledAt,
    JSON.stringify(emails || []),
    calendarEventId,
    workspaceId,
    tenantId,
  ).run();

  const meetUrl = `${url.origin}/dashboard/meet?room=${encodeURIComponent(roomId)}`;
  const fromAddr = env.EMAIL_FROM || 'Inner Animal Media <support@inneranimalmedia.com>';
  const inviteSubject = `You have been invited: ${title}`;

  // 4) Send invites via Resend + log + enqueue notification_outbox (best-effort).
  if (emails.length && env.RESEND_API_KEY) {
    for (const raw of emails) {
      const to = String(raw || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) continue;

      let resendId = null;
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddr,
            to: [to],
            subject: inviteSubject,
            html: `<div style="font-family:system-ui,Segoe UI,sans-serif;background:#07100f;color:#c9d8d6;padding:28px;border-radius:12px;max-width:520px;line-height:1.5">
  <p style="margin:0 0 12px;color:#2dd4bf;font-weight:600">Inner Animal Media</p>
  <p style="margin:0 0 8px;color:#e2efed">You're invited to a call: <strong>${title}</strong></p>
  <p style="margin:0 0 20px;color:#6b9e99;font-size:14px">Join using the link below.</p>
  <a href="${meetUrl}" style="display:inline-block;background:#2dd4bf;color:#07100f;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700">Join Call</a>
  <p style="margin:20px 0 0;font-size:12px;color:#4a7a75">Or copy: <span style="color:#7a9aaa">${meetUrl}</span></p>
</div>`,
          }),
        });
        const j = await res.json().catch(() => ({}));
        resendId = j?.id ?? null;

        // best-effort email_logs
        await env.DB.prepare(
          `INSERT INTO email_logs (id, tenant_id, workspace_id, to_email, subject, provider, provider_message_id, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'resend', ?, ?, datetime('now'))`
        ).bind(
          newId('elog'),
          tenantId,
          workspaceId,
          to,
          inviteSubject,
          resendId,
          res.ok ? 'sent' : 'failed'
        ).run().catch(() => {});
      } catch (e) {
        console.warn('[meet-schedule-invite]', e?.message);
      }
    }

    // Enqueue outbox row (one per schedule)
    await env.DB.prepare(
      `INSERT INTO notification_outbox (id, tenant_id, workspace_id, channel, event_type, source_table, source_id, created_at)
       VALUES (?, ?, ?, 'resend_email', 'meet_scheduled', 'meet_scheduled', ?, datetime('now'))`
    ).bind(newId('nout'), tenantId, workspaceId, scheduledId).run().catch(() => {});
  }

  return jsonResponse({ ok: true, id: scheduledId, calendar_event_id: calendarEventId, room_id: roomId, meet_url: meetUrl }, 200);
}
