import { getSession } from '../core/auth.js';
import { ensureOauthTokenColumns } from './oauth.js';

/**
 * Build canonical /api/auth/me payload for dashboard shells.
 * @param {*} env
 * @param {Request} request
 * @param {*} authUser from getAuthUser
 */
export async function buildCanonicalAuthMe(env, request, authUser) {
  const session = await getSession(env, request).catch(() => null);
  const expiresAt = session?.expires_at
    ? typeof session.expires_at === 'number'
      ? new Date(session.expires_at).toISOString()
      : String(session.expires_at)
    : null;

  let workspaces = [];
  let primary = null;
  const uid = authUser?.id;
  const preferredWorkspaceId =
    (authUser?.active_workspace_id != null && String(authUser.active_workspace_id).trim()) ||
    (session?.workspace_id != null && String(session.workspace_id).trim()) ||
    (session?.workspaceId != null && String(session.workspaceId).trim()) ||
    null;
  if (env?.DB && uid) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT w.id, w.name, w.handle AS slug, wm.role
         FROM workspace_members wm
         JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = ? AND COALESCE(wm.is_active, 1) = 1
         ORDER BY wm.joined_at ASC`,
      )
        .bind(uid)
        .all();
      workspaces = (results || []).map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug || r.id,
        role: r.role || 'member',
      }));
      primary =
        (preferredWorkspaceId &&
          workspaces.find((w) => w.id === preferredWorkspaceId)) ||
        workspaces[0] ||
        null;
    } catch (e) {
      console.warn('[buildCanonicalAuthMe] workspaces', e?.message ?? e);
    }
  }

  const integrations_summary = await buildIntegrationsSummary(env, authUser);

  return {
    authenticated: true,
    user: {
      id: authUser.id ?? null,
      email: authUser.email ?? null,
      name: authUser.name ?? authUser.display_name ?? null,
      avatar_url: authUser.avatar_url ?? null,
      supabase_user_id: authUser.supabase_user_id ?? null,
      tenant_id: authUser.tenant_id ?? null,
    },
    workspace: primary
      ? { id: primary.id, name: primary.name, slug: primary.slug, role: primary.role }
      : null,
    workspaces,
    integrations_summary,
    session: { expires_at: expiresAt },
  };
}

async function buildIntegrationsSummary(env, authUser) {
  const out = {
    providers: {},
  };
  if (!env?.DB || !authUser?.id) return out;

  try {
    await ensureOauthTokenColumns(env.DB);
  } catch {
    /* ignore */
  }

  const userId = String(authUser.id);
  try {
    const { results } = await env.DB.prepare(
      `SELECT provider, account_identifier, scope, expires_at, updated_at
       FROM user_oauth_tokens WHERE user_id = ?`,
    )
      .bind(userId)
      .all();
    const now = Math.floor(Date.now() / 1000);
    for (const r of results || []) {
      const p = String(r.provider || '').toLowerCase();
      const exp = Number(r.expires_at);
      let state = 'connected';
      if (Number.isFinite(exp) && exp < now) state = 'expired';
      out.providers[p] = {
        status: state,
        account_identifier: r.account_identifier || '',
        has_scopes: !!String(r.scope || '').trim(),
        expires_at: Number.isFinite(exp) ? new Date(exp * 1000).toISOString() : null,
        last_updated: r.updated_at ?? null,
      };
    }
  } catch (e) {
    console.warn('[buildIntegrationsSummary]', e?.message ?? e);
  }

  return out;
}
