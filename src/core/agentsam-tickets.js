/**
 * agentsam_tickets — D1 index over plans/*.md (doc_path = prose SSOT).
 *
 * Domain boundary (LOCKED): platform / infra / Agent Sam engineering only.
 * Collaborate tasks (client & operational) stay in agentsam_todo / project issues / kanban.
 * Do not merge those domains without an explicit product decision.
 */

export const TICKET_STATUSES = Object.freeze([
  'backlog',
  'active',
  'blocked',
  'in_review',
  'shipped',
  'abandoned',
]);

const CLOSED = new Set(['shipped', 'abandoned']);

/**
 * @param {string} status
 */
export function isTicketStatus(status) {
  return TICKET_STATUSES.includes(String(status || '').trim());
}

/**
 * @param {{ from?: string | null, to: string, status_reason?: string | null }} p
 */
export function assertStatusTransition(p) {
  const to = String(p.to || '').trim();
  if (!isTicketStatus(to)) throw new Error(`invalid_status:${to}`);
  if ((to === 'blocked' || to === 'abandoned') && !String(p.status_reason || '').trim()) {
    throw new Error('status_reason required when status is blocked or abandoned');
  }
  return to;
}

/**
 * @param {unknown} v
 * @returns {string[]}
 */
function parseJsonArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  return [];
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapTicketRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    status_reason: row.status_reason ?? null,
    project: row.project ?? null,
    subsystem: row.subsystem ?? null,
    tags: parseJsonArray(row.tags),
    priority: row.priority ?? null,
    doc_path: row.doc_path ?? null,
    blocks: parseJsonArray(row.blocks),
    blocked_by: parseJsonArray(row.blocked_by),
    supersedes: row.supersedes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at ?? null,
  };
}

/**
 * @param {unknown} env
 * @param {{
 *   status?: string | null,
 *   project?: string | null,
 *   subsystem?: string | null,
 *   priority?: string | null,
 *   workable?: boolean,
 *   limit?: number,
 * }} [q]
 */
export async function listTickets(env, q = {}) {
  if (!env?.DB) throw new Error('Database not configured');
  let sql = `SELECT * FROM agentsam_tickets WHERE 1=1`;
  const binds = [];
  if (q.status) {
    sql += ` AND status = ?`;
    binds.push(String(q.status).trim());
  }
  if (q.project) {
    sql += ` AND project = ?`;
    binds.push(String(q.project).trim());
  }
  if (q.subsystem) {
    sql += ` AND subsystem = ?`;
    binds.push(String(q.subsystem).trim());
  }
  if (q.priority) {
    sql += ` AND priority = ?`;
    binds.push(String(q.priority).trim());
  }
  sql += ` ORDER BY
    CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 9 END,
    updated_at DESC
    LIMIT ?`;
  binds.push(Math.min(500, Math.max(1, Number(q.limit) || 100)));

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  let tickets = (results || []).map(mapTicketRow);

  if (q.workable) {
    const byId = new Map(tickets.map((t) => [t.id, t]));
    // Also need blocker status — refetch all non-closed for graph if filtered list incomplete
    const { results: allRows } = await env.DB.prepare(
      `SELECT id, status FROM agentsam_tickets`,
    ).all();
    const statusById = new Map((allRows || []).map((r) => [String(r.id), String(r.status)]));
    tickets = tickets.filter((t) => {
      if (t.status !== 'active' && t.status !== 'in_review') return false;
      const blockers = t.blocked_by || [];
      if (!blockers.length) return true;
      return blockers.every((id) => {
        const st = statusById.get(id);
        return st === 'shipped' || st === 'abandoned';
      });
    });
    void byId;
  }

  return tickets;
}

/**
 * @param {unknown} env
 * @param {string} id
 */
export async function getTicket(env, id) {
  if (!env?.DB) throw new Error('Database not configured');
  const tid = String(id || '').trim();
  if (!tid) return null;
  const row = await env.DB.prepare(`SELECT * FROM agentsam_tickets WHERE id = ? LIMIT 1`)
    .bind(tid)
    .first();
  return mapTicketRow(row);
}

/**
 * @param {unknown} env
 * @param {string} ticketId
 * @param {number} [limit]
 */
export async function listTicketEvents(env, ticketId, limit = 50) {
  if (!env?.DB) throw new Error('Database not configured');
  const { results } = await env.DB.prepare(
    `SELECT * FROM agentsam_ticket_events WHERE ticket_id = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(String(ticketId), Math.min(200, Math.max(1, Number(limit) || 50)))
    .all();
  return results || [];
}

/**
 * @param {unknown} env
 * @param {{
 *   ticket_id: string,
 *   event_type: string,
 *   from_status?: string | null,
 *   to_status?: string | null,
 *   detail?: string | null,
 *   commit_sha?: string | null,
 * }} ev
 */
async function insertEvent(env, ev) {
  const id = `tke_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO agentsam_ticket_events (
       id, ticket_id, event_type, from_status, to_status, detail, commit_sha,
       actor_type, actor_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      ev.ticket_id,
      ev.event_type,
      ev.from_status ?? null,
      ev.to_status ?? null,
      ev.detail != null ? String(ev.detail).slice(0, 4000) : null,
      ev.commit_sha != null ? String(ev.commit_sha).slice(0, 64) : null,
      ev.actor_type != null ? String(ev.actor_type).slice(0, 40) : null,
      ev.actor_id != null ? String(ev.actor_id).slice(0, 120) : null,
      now,
    )
    .run();
  return id;
}

/**
 * @param {unknown} env
 * @param {{
 *   title: string,
 *   status?: string,
 *   status_reason?: string | null,
 *   project?: string | null,
 *   subsystem?: string | null,
 *   tags?: string[] | string | null,
 *   priority?: string | null,
 *   doc_path?: string | null,
 *   blocks?: string[] | null,
 *   blocked_by?: string[] | null,
 *   supersedes?: string | null,
 *   id?: string | null,
 * }} body
 */
export async function createTicket(env, body) {
  if (!env?.DB) throw new Error('Database not configured');
  const title = String(body.title || '').trim();
  if (!title) throw new Error('title required');
  const status = assertStatusTransition({
    to: body.status || 'backlog',
    status_reason: body.status_reason,
  });
  const dedupKey =
    body.dedup_key != null && String(body.dedup_key).trim()
      ? String(body.dedup_key).trim().slice(0, 128)
      : null;
  if (dedupKey) {
    const existing = await env.DB.prepare(
      `SELECT id FROM agentsam_tickets WHERE dedup_key = ? LIMIT 1`,
    )
      .bind(dedupKey)
      .first();
    if (existing?.id) {
      return getTicket(env, existing.id);
    }
  }
  const id =
    (body.id != null && String(body.id).trim()) ||
    `tkt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = Math.floor(Date.now() / 1000);
  const tags = parseJsonArray(body.tags);
  const blocks = parseJsonArray(body.blocks);
  const blockedBy = parseJsonArray(body.blocked_by);

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_tickets (
         id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
         blocks, blocked_by, supersedes, dedup_key, created_at, updated_at, closed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        title.slice(0, 240),
        status,
        body.status_reason != null ? String(body.status_reason).slice(0, 1000) : null,
        body.project != null ? String(body.project).slice(0, 120) : null,
        body.subsystem != null ? String(body.subsystem).slice(0, 120) : null,
        JSON.stringify(tags),
        body.priority != null ? String(body.priority).slice(0, 8) : null,
        body.doc_path != null ? String(body.doc_path).slice(0, 400) : null,
        JSON.stringify(blocks),
        JSON.stringify(blockedBy),
        body.supersedes != null ? String(body.supersedes).slice(0, 64) : null,
        dedupKey,
        now,
        now,
        CLOSED.has(status) ? now : null,
      )
      .run();
  } catch (e) {
    const msg = e?.message != null ? String(e.message) : '';
    if (dedupKey && /UNIQUE|constraint/i.test(msg)) {
      const again = await env.DB.prepare(
        `SELECT id FROM agentsam_tickets WHERE dedup_key = ? LIMIT 1`,
      )
        .bind(dedupKey)
        .first();
      if (again?.id) return getTicket(env, again.id);
    }
    throw e;
  }

  await insertEvent(env, {
    ticket_id: id,
    event_type: 'status_change',
    from_status: null,
    to_status: status,
    detail: 'created',
    actor_type: body.actor_type ?? 'dashboard_user',
    actor_id: body.actor_id ?? null,
  });

  return getTicket(env, id);
}

/**
 * Field update (not status — use setTicketStatus).
 * @param {unknown} env
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export async function updateTicketFields(env, id, patch) {
  if (!env?.DB) throw new Error('Database not configured');
  const tid = String(id || '').trim();
  const existing = await getTicket(env, tid);
  if (!existing) throw new Error('ticket_not_found');

  const title = patch.title != null ? String(patch.title).trim().slice(0, 240) : existing.title;
  const project =
    patch.project !== undefined
      ? patch.project == null
        ? null
        : String(patch.project).slice(0, 120)
      : existing.project;
  const subsystem =
    patch.subsystem !== undefined
      ? patch.subsystem == null
        ? null
        : String(patch.subsystem).slice(0, 120)
      : existing.subsystem;
  const priority =
    patch.priority !== undefined
      ? patch.priority == null
        ? null
        : String(patch.priority).slice(0, 8)
      : existing.priority;
  const docPath =
    patch.doc_path !== undefined
      ? patch.doc_path == null
        ? null
        : String(patch.doc_path).slice(0, 400)
      : existing.doc_path;
  const tags = patch.tags !== undefined ? parseJsonArray(patch.tags) : existing.tags;
  const blocks = patch.blocks !== undefined ? parseJsonArray(patch.blocks) : existing.blocks;
  const blockedBy =
    patch.blocked_by !== undefined ? parseJsonArray(patch.blocked_by) : existing.blocked_by;
  const supersedes =
    patch.supersedes !== undefined
      ? patch.supersedes == null
        ? null
        : String(patch.supersedes).slice(0, 64)
      : existing.supersedes;

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE agentsam_tickets SET
       title = ?, project = ?, subsystem = ?, tags = ?, priority = ?, doc_path = ?,
       blocks = ?, blocked_by = ?, supersedes = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      title,
      project,
      subsystem,
      JSON.stringify(tags),
      priority,
      docPath,
      JSON.stringify(blocks),
      JSON.stringify(blockedBy),
      supersedes,
      now,
      tid,
    )
    .run();

  await insertEvent(env, {
    ticket_id: tid,
    event_type: 'note',
    detail: 'fields_updated',
  });

  return getTicket(env, tid);
}

/**
 * @param {unknown} env
 * @param {string} id
 * @param {{ status: string, status_reason?: string | null }} body
 */
export async function setTicketStatus(env, id, body) {
  if (!env?.DB) throw new Error('Database not configured');
  const tid = String(id || '').trim();
  const existing = await getTicket(env, tid);
  if (!existing) throw new Error('ticket_not_found');

  const to = assertStatusTransition({
    from: existing.status,
    to: body.status,
    status_reason: body.status_reason,
  });
  const reason =
    to === 'blocked' || to === 'abandoned'
      ? String(body.status_reason).trim().slice(0, 1000)
      : body.status_reason != null
        ? String(body.status_reason).trim().slice(0, 1000) || null
        : existing.status_reason;

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE agentsam_tickets SET
       status = ?, status_reason = ?, updated_at = ?, closed_at = ?
     WHERE id = ?`,
  )
    .bind(to, reason, now, CLOSED.has(to) ? now : null, tid)
    .run();

  await insertEvent(env, {
    ticket_id: tid,
    event_type: 'status_change',
    from_status: existing.status,
    to_status: to,
    detail: reason,
    actor_type: body.actor_type ?? null,
    actor_id: body.actor_id ?? null,
  });

  return getTicket(env, tid);
}

/**
 * @param {unknown} env
 * @param {string} id
 * @param {{ event_type: string, detail?: string | null, commit_sha?: string | null }} body
 */
export async function addTicketEvent(env, id, body) {
  if (!env?.DB) throw new Error('Database not configured');
  const tid = String(id || '').trim();
  const existing = await getTicket(env, tid);
  if (!existing) throw new Error('ticket_not_found');

  const eventType = String(body.event_type || '').trim();
  if (!['note', 'commit_linked', 'gate_passed', 'gate_failed'].includes(eventType)) {
    throw new Error('invalid_event_type');
  }

  const eventId = await insertEvent(env, {
    ticket_id: tid,
    event_type: eventType,
    detail: body.detail,
    commit_sha: body.commit_sha,
    actor_type: body.actor_type ?? null,
    actor_id: body.actor_id ?? null,
  });

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`UPDATE agentsam_tickets SET updated_at = ? WHERE id = ?`)
    .bind(now, tid)
    .run();

  return { ok: true, event_id: eventId, ticket_id: tid };
}

/**
 * Analytics for Tickets UI — throughput, cycle time, status mix, aging.
 * @param {unknown} env
 */
export async function getTicketAnalytics(env) {
  if (!env?.DB) throw new Error('Database not configured');

  const statusRows = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM agentsam_tickets GROUP BY status`,
  )
    .all()
    .then((r) => r.results || [])
    .catch(() => []);

  const byStatus = {};
  let total = 0;
  for (const row of statusRows) {
    const s = String(row.status || 'unknown');
    const n = Number(row.n) || 0;
    byStatus[s] = n;
    total += n;
  }
  const shipped = byStatus.shipped || 0;
  const openish = (byStatus.active || 0) + (byStatus.in_review || 0) + (byStatus.blocked || 0);
  const completionRate = total > 0 ? shipped / total : 0;

  // D1 SQLite: use CASE COUNT instead of FILTER for broader compatibility
  const throughput = await env.DB.prepare(
    `SELECT
       strftime('%Y-%W', datetime(created_at, 'unixepoch')) AS week,
       SUM(CASE WHEN event_type = 'status_change' AND to_status = 'shipped' THEN 1 ELSE 0 END) AS shipped
     FROM agentsam_ticket_events
     WHERE created_at >= unixepoch('now', '-56 days')
     GROUP BY week
     ORDER BY week DESC
     LIMIT 8`,
  )
    .all()
    .then((r) => r.results || [])
    .catch(() => []);

  const cycleRows = await env.DB.prepare(
    `SELECT
       t.id,
       (ship.first_shipped - act.first_active) AS cycle_sec
     FROM agentsam_tickets t
     INNER JOIN (
       SELECT ticket_id, MIN(created_at) AS first_active
       FROM agentsam_ticket_events
       WHERE event_type = 'status_change' AND to_status = 'active'
       GROUP BY ticket_id
     ) act ON act.ticket_id = t.id
     INNER JOIN (
       SELECT ticket_id, MIN(created_at) AS first_shipped
       FROM agentsam_ticket_events
       WHERE event_type = 'status_change' AND to_status = 'shipped'
       GROUP BY ticket_id
     ) ship ON ship.ticket_id = t.id
     WHERE ship.first_shipped >= act.first_active`,
  )
    .all()
    .then((r) => r.results || [])
    .catch(() => []);

  let cycleSum = 0;
  let cycleN = 0;
  for (const row of cycleRows) {
    const sec = Number(row.cycle_sec);
    if (Number.isFinite(sec) && sec >= 0) {
      cycleSum += sec;
      cycleN += 1;
    }
  }
  const avgCycleDays = cycleN > 0 ? cycleSum / cycleN / 86400 : null;

  const aging = await env.DB.prepare(
    `SELECT id, title, status, priority,
            CAST((julianday('now') - julianday(datetime(updated_at, 'unixepoch'))) AS INTEGER) AS days_in_status
     FROM agentsam_tickets
     WHERE status IN ('active', 'blocked')
     ORDER BY days_in_status DESC
     LIMIT 20`,
  )
    .all()
    .then((r) => r.results || [])
    .catch(() => []);

  const oldestActiveDays =
    aging.length && Number.isFinite(Number(aging[0].days_in_status))
      ? Number(aging[0].days_in_status)
      : 0;

  return {
    completion_rate: completionRate,
    avg_cycle_days: avgCycleDays,
    oldest_active_days: oldestActiveDays,
    by_status: byStatus,
    throughput: [...throughput].reverse(),
    aging,
  };
}
