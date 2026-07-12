/**
 * Platform tickets tools — same writers as /api/tickets/* (agentsam-tickets.js).
 * actor_type distinguishes dashboard_user | claude_mcp | chatgpt_mcp | agent_sam.
 */

import {
  addTicketEvent,
  createTicket,
  getTicket,
  listTickets,
  setTicketStatus,
} from '../../core/agentsam-tickets.js';

/**
 * @param {Record<string, unknown>} runContext
 * @returns {{ actor_type: string, actor_id: string|null }}
 */
function actorFromContext(runContext = {}) {
  const surface = String(runContext.surface || runContext.client || runContext.source || '')
    .trim()
    .toLowerCase();
  const userId =
    runContext.userId != null
      ? String(runContext.userId)
      : runContext.user_id != null
        ? String(runContext.user_id)
        : null;
  if (surface.includes('chatgpt')) return { actor_type: 'chatgpt_mcp', actor_id: userId };
  if (surface.includes('claude')) return { actor_type: 'claude_mcp', actor_id: userId };
  if (surface.includes('mcp')) return { actor_type: 'claude_mcp', actor_id: userId };
  if (surface.includes('dashboard')) return { actor_type: 'dashboard_user', actor_id: userId };
  return { actor_type: 'agent_sam', actor_id: userId };
}

/** @param {Record<string, unknown>} params @param {unknown} env @param {Record<string, unknown>} [runContext] */
export async function agentsam_ticket_list(params = {}, env, runContext = {}) {
  const tickets = await listTickets(env, {
    status: params.status ?? null,
    project: params.project ?? null,
    subsystem: params.subsystem ?? null,
    priority: params.priority ?? null,
    workable: params.workable === true || params.workable === 1 || params.workable === '1',
    limit: params.limit != null ? Number(params.limit) : 100,
  });
  return { ok: true, tickets, actor: actorFromContext(runContext) };
}

/** @param {Record<string, unknown>} params @param {unknown} env @param {Record<string, unknown>} [runContext] */
export async function agentsam_ticket_get(params = {}, env, runContext = {}) {
  const id = String(params.id || params.ticket_id || '').trim();
  if (!id) return { ok: false, error: 'id required' };
  const ticket = await getTicket(env, id);
  if (!ticket) return { ok: false, error: 'ticket_not_found' };
  return { ok: true, ticket, actor: actorFromContext(runContext) };
}

/** @param {Record<string, unknown>} params @param {unknown} env @param {Record<string, unknown>} [runContext] */
export async function agentsam_ticket_create(params = {}, env, runContext = {}) {
  const actor = actorFromContext(runContext);
  const ticket = await createTicket(env, {
    title: params.title,
    status: params.status || 'backlog',
    status_reason: params.status_reason,
    project: params.project != null && String(params.project).trim()
      ? String(params.project).trim()
      : null,
    subsystem: params.subsystem,
    tags: params.tags,
    priority: params.priority || 'P2',
    doc_path: params.doc_path,
    blocks: params.blocks,
    blocked_by: params.blocked_by,
    supersedes: params.supersedes,
    id: params.id,
    dedup_key: params.dedup_key,
    actor_type: actor.actor_type,
    actor_id: actor.actor_id,
  });
  return { ok: true, ticket };
}

/** @param {Record<string, unknown>} params @param {unknown} env @param {Record<string, unknown>} [runContext] */
export async function agentsam_ticket_set_status(params = {}, env, runContext = {}) {
  const id = String(params.id || params.ticket_id || '').trim();
  if (!id) return { ok: false, error: 'id required' };
  const actor = actorFromContext(runContext);
  const ticket = await setTicketStatus(env, id, {
    status: params.status,
    status_reason: params.status_reason,
    actor_type: actor.actor_type,
    actor_id: actor.actor_id,
  });
  return { ok: true, ticket };
}

/** @param {Record<string, unknown>} params @param {unknown} env @param {Record<string, unknown>} [runContext] */
export async function agentsam_ticket_add_note(params = {}, env, runContext = {}) {
  const id = String(params.id || params.ticket_id || '').trim();
  if (!id) return { ok: false, error: 'id required' };
  const detail = String(params.note || params.detail || '').trim();
  if (!detail) return { ok: false, error: 'note required' };
  const actor = actorFromContext(runContext);
  const out = await addTicketEvent(env, id, {
    event_type: 'note',
    detail,
    actor_type: actor.actor_type,
    actor_id: actor.actor_id,
  });
  return { ok: true, ...out };
}

export const handlers = {
  agentsam_ticket_list,
  agentsam_ticket_get,
  agentsam_ticket_create,
  agentsam_ticket_set_status,
  agentsam_ticket_add_note,
};
