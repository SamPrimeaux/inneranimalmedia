import { provisionNewUser } from './provisionNewUser.js';
import { provisionUserWorkspace, ensureUserTerminalConnection } from '../api/provisioning.js';
import { logAuthEvent } from './auth-events.js';
import { ensureUserTenantWorkspace } from './workspace-provisioning.js';

/**
 * Idempotent post-auth provisioning: app profile, default workspace, settings, tenant wiring.
 * Call after every successful signup/login once canonical auth_users.id is known.
 *
 * @param {*} env
 * @param {Request} request
 * @param {{ authUserId: string, email: string, name?: string, source?: string, supabaseUserId?: string | null }} identity
 */
export async function provisionAuthenticatedUser(env, request, identity) {
  const authUserId = String(identity.authUserId || '').trim();
  const email = String(identity.email || '').toLowerCase().trim();
  const name = String(identity.name || email.split('@')[0] || 'User').trim();
  const source = String(identity.source || 'unknown').trim();

  if (!env?.DB || !authUserId || !email) {
    return { ok: false, authUserId: authUserId || null, tenantId: null };
  }

  let tenantId = null;
  try {
    const row = await env.DB.prepare(`SELECT tenant_id FROM auth_users WHERE id = ? LIMIT 1`).bind(authUserId).first();
    tenantId = row?.tenant_id ?? null;
  } catch {
    /* ignore */
  }

  await logAuthEvent(env, {
    request,
    eventType: 'auth_provision_started',
    tenantId,
    userId: authUserId,
    provider: source,
    metadata: { email_domain: email.includes('@') ? email.split('@')[1] : null },
  });

  const prov = await provisionNewUser(env, { email, name, authUserId }).catch((e) => {
    console.warn('[provisionAuthenticatedUser] provisionNewUser', e?.message ?? e);
    return null;
  });

  try {
    await provisionUserWorkspace(env, {
      userId: authUserId,
      email,
      planId: 'free',
    }).catch((err) => console.warn('[provisionAuthenticatedUser] provisionUserWorkspace', err?.message ?? err));
  } catch {
    /* non-fatal */
  }

  // Ensure active tenant/workspace wiring exists for authenticated runtime.
  try {
    const row = await env.DB.prepare(
      `SELECT id, tenant_id, active_tenant_id, active_workspace_id, person_uuid FROM auth_users WHERE id = ? LIMIT 1`,
    )
      .bind(authUserId)
      .first();
    if (row?.id) {
      await ensureUserTenantWorkspace(env, row);
    }
  } catch {
    /* non-fatal */
  }

  try {
    await ensureUserTerminalConnection(env, authUserId);
  } catch (e) {
    console.warn('[provisionAuthenticatedUser] ensureUserTerminalConnection', e?.message ?? e);
  }

  if (identity.supabaseUserId) {
    try {
      await env.DB.prepare(
        `UPDATE auth_users SET supabase_user_id = COALESCE(supabase_user_id, ?), updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(String(identity.supabaseUserId).trim(), authUserId)
        .run();
      await logAuthEvent(env, {
        request,
        eventType: 'supabase_user_id_backfilled',
        tenantId,
        userId: authUserId,
        provider: 'supabase',
        metadata: {},
      });
    } catch (e) {
      console.warn('[provisionAuthenticatedUser] supabase_user_id', e?.message ?? e);
    }
  }

  try {
    const row = await env.DB.prepare(`SELECT tenant_id FROM auth_users WHERE id = ? LIMIT 1`).bind(authUserId).first();
    tenantId = row?.tenant_id ?? tenantId;
  } catch {
    /* ignore */
  }

  await logAuthEvent(env, {
    request,
    eventType: 'workspace_provisioned',
    status: prov ? 'ok' : 'partial',
    tenantId,
    userId: authUserId,
    provider: source,
    metadata: { workspace_id: prov?.workspace_id ?? null },
  });

  return { ok: true, authUserId, tenantId, workspaceId: prov?.workspace_id ?? null };
}
