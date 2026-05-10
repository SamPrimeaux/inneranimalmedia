/**
 * Kanban is identity-scoped: each user has their own boards (kanban_boards.owner_id).
 * Tenant + workspace still constrain rows for tenancy; never substitute another user's owner_id from the client.
 *
 * Realtime RLS should require the same: mirror.owner_id = auth.jwt() ->> 'sub' (see Supabase migration).
 */

/**
 * @param {Record<string, any>} identity — from resolveIdentity / requireDashboardIdentity
 * @returns {{ tenantId: string, workspaceId: string | null, ownerId: string, isSuperadmin: boolean }}
 */
export function kanbanActor(identity) {
  return {
    tenantId: String(identity.tenantId),
    workspaceId: identity.workspaceId != null ? String(identity.workspaceId) : null,
    ownerId: String(identity.userId),
    isSuperadmin: !!identity.isSuperadmin,
  };
}

/**
 * Superadmin can access any board in tenant (optional ops); normal users only their owner_id.
 * @param {Record<string, unknown> | null | undefined} boardRow
 * @param {ReturnType<typeof kanbanActor>} actor
 */
export function boardWritableByActor(boardRow, actor) {
  if (!boardRow) return false;
  if (String(boardRow.tenant_id) !== actor.tenantId) return false;
  if (actor.isSuperadmin) return true;
  return boardRow.owner_id != null && String(boardRow.owner_id) === actor.ownerId;
}
