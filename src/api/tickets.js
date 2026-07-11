/**
 * GET    /api/tickets?status=&project=&subsystem=&priority=&workable=1
 * POST   /api/tickets
 * GET    /api/tickets/:id
 * PATCH  /api/tickets/:id
 * POST   /api/tickets/:id/status  { status, status_reason? }
 * POST   /api/tickets/:id/events { event_type, detail?, commit_sha? }
 * GET    /api/tickets/:id/events
 *
 * Index only — prose lives at ticket.doc_path (plans/active|backlog).
 * Platform engineering only — not Collaborate client tasks.
 * Does not replace kanban / agentsam_todo / project_issues.
 */

import { jsonResponse } from '../core/responses.js';
import {
  addTicketEvent,
  createTicket,
  getTicket,
  listTicketEvents,
  listTickets,
  setTicketStatus,
  updateTicketFields,
} from '../core/agentsam-tickets.js';

/**
 * @param {Request} request
 * @param {URL} url
 * @param {unknown} env
 * @param {{ id?: string } | null} authUser
 */
export async function handleTicketsApi(request, url, env, authUser) {
  if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

  const path = url.pathname.replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = request.method.toUpperCase();

  if (pathLower === '/api/tickets' && method === 'GET') {
    try {
      const tickets = await listTickets(env, {
        status: url.searchParams.get('status'),
        project: url.searchParams.get('project'),
        subsystem: url.searchParams.get('subsystem'),
        priority: url.searchParams.get('priority'),
        workable:
          url.searchParams.get('workable') === '1' ||
          url.searchParams.get('workable') === 'true',
        limit: parseInt(url.searchParams.get('limit') || '100', 10),
      });
      return jsonResponse({ ok: true, tickets });
    } catch (e) {
      return jsonResponse({ error: e?.message || 'list failed' }, 500);
    }
  }

  if (pathLower === '/api/tickets' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    try {
      const ticket = await createTicket(env, body);
      return jsonResponse({ ok: true, ticket }, 201);
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : 'create failed';
      const status = msg.includes('required') || msg.startsWith('invalid_') ? 400 : 500;
      return jsonResponse({ error: msg }, status);
    }
  }

  const statusMatch = path.match(/^\/api\/tickets\/([^/]+)\/status$/i);
  if (statusMatch && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    try {
      const ticket = await setTicketStatus(env, statusMatch[1], body);
      return jsonResponse({ ok: true, ticket });
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : 'status failed';
      const status =
        msg === 'ticket_not_found'
          ? 404
          : msg.includes('required') || msg.startsWith('invalid_')
            ? 400
            : 500;
      return jsonResponse({ error: msg }, status);
    }
  }

  const eventsMatch = path.match(/^\/api\/tickets\/([^/]+)\/events$/i);
  if (eventsMatch && method === 'GET') {
    try {
      const events = await listTicketEvents(env, eventsMatch[1]);
      return jsonResponse({ ok: true, events });
    } catch (e) {
      return jsonResponse({ error: e?.message || 'events failed' }, 500);
    }
  }
  if (eventsMatch && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    try {
      const out = await addTicketEvent(env, eventsMatch[1], body);
      return jsonResponse(out);
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : 'event failed';
      const status =
        msg === 'ticket_not_found' ? 404 : msg.startsWith('invalid_') ? 400 : 500;
      return jsonResponse({ error: msg }, status);
    }
  }

  const idMatch = path.match(/^\/api\/tickets\/([^/]+)$/i);
  if (idMatch && method === 'GET') {
    try {
      const ticket = await getTicket(env, idMatch[1]);
      if (!ticket) return jsonResponse({ error: 'ticket_not_found' }, 404);
      return jsonResponse({ ok: true, ticket });
    } catch (e) {
      return jsonResponse({ error: e?.message || 'get failed' }, 500);
    }
  }
  if (idMatch && method === 'PATCH') {
    const body = await request.json().catch(() => ({}));
    if (body.status != null) {
      return jsonResponse({ error: 'use POST /api/tickets/:id/status for status changes' }, 400);
    }
    try {
      const ticket = await updateTicketFields(env, idMatch[1], body);
      return jsonResponse({ ok: true, ticket });
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : 'update failed';
      return jsonResponse({ error: msg }, msg === 'ticket_not_found' ? 404 : 500);
    }
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
