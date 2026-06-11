/**
 * D1 owns canonical app user ids (auth_users.id). Supabase Auth UUID lives in auth_users.supabase_user_id only.
 */
import { resolveAuthUserByEmail, upsertAuthUserEmail } from './resolve-auth-user.js';

/**
 * @returns {string} e.g. au_ + 16 hex chars (8 random bytes)
 */
export function generateAppUserId() {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `au_${hex}`;
}

/**
 * Find or create auth_users row. Never uses Supabase's UUID as auth_users.id.
 *
 * @param {*} env
 * @param {{ email: string, name?: string, supabaseUserId?: string|null, provider?: string, provider_uid?: string, passwordHash?: string, salt?: string, source?: string }} identity
 * @param {{ allowCreate?: boolean }} [options]
 * @returns {Promise<{ authUserId: string, row: object|null, created: boolean }|null>}
 */
export async function ensureAppUser(env, identity, options = {}) {
  const allowCreate = options.allowCreate !== false;
  const email = String(identity.email || '').toLowerCase().trim();
  const name = String(identity.name || email.split('@')[0] || 'User').trim();
  const supabaseUserId =
    identity.supabaseUserId != null && String(identity.supabaseUserId).trim()
      ? String(identity.supabaseUserId).trim()
      : '';
  const provider = identity.provider != null ? String(identity.provider).trim() : '';
  const providerUid =
    identity.provider_uid != null
      ? String(identity.provider_uid).trim()
      : identity.providerUid != null
        ? String(identity.providerUid).trim()
        : '';
  const hasPassword = identity.passwordHash !== undefined && identity.salt !== undefined;

  if (!env?.DB || !email) return null;

  try {
    if (supabaseUserId) {
      const bySb = await env.DB.prepare(
        `SELECT id, email, name, tenant_id, supabase_user_id FROM auth_users WHERE supabase_user_id = ? LIMIT 1`,
      )
        .bind(supabaseUserId)
        .first();
      if (bySb?.id) {
        return {
          authUserId: String(bySb.id),
          row: bySb,
          created: false,
        };
      }
    }

    if (provider && providerUid) {
      const byProvider = await env.DB.prepare(
        `SELECT account_id FROM account_identities WHERE provider = ? AND provider_subject = ? LIMIT 1`,
      )
        .bind(provider, providerUid)
        .first();
      if (byProvider?.account_id) {
        const accountId = String(byProvider.account_id);
        const row = await env.DB.prepare(
          `SELECT id, email, name, tenant_id, supabase_user_id FROM auth_users WHERE id = ? LIMIT 1`,
        )
          .bind(accountId)
          .first();
        if (row?.id) {
          const id = String(row.id);
          if (supabaseUserId) {
            const stored =
              row.supabase_user_id != null ? String(row.supabase_user_id).trim() : '';
            if (!stored) {
              await env.DB.prepare(
                `UPDATE auth_users SET supabase_user_id = ?, updated_at = datetime('now') WHERE id = ?`,
              )
                .bind(supabaseUserId, id)
                .run();
            } else if (stored !== supabaseUserId) {
              console.error(
                '[ensureAppUser] account_identities row supabase_user_id does not match JWT subject',
              );
              return null;
            }
          }
          const refreshed = await env.DB.prepare(
            `SELECT id, email, name, tenant_id, supabase_user_id FROM auth_users WHERE id = ? LIMIT 1`,
          )
            .bind(id)
            .first();
          return {
            authUserId: id,
            row: refreshed || row,
            created: false,
          };
        }
      }
    }

    const byEmail = await resolveAuthUserByEmail(env, email);

    if (byEmail?.id) {
      const id = String(byEmail.id);
      if (supabaseUserId) {
        const stored =
          byEmail.supabase_user_id != null ? String(byEmail.supabase_user_id).trim() : '';
        if (!stored) {
          await env.DB.prepare(
            `UPDATE auth_users SET supabase_user_id = ?, updated_at = datetime('now') WHERE id = ?`,
          )
            .bind(supabaseUserId, id)
            .run();
        } else if (stored !== supabaseUserId) {
          console.error('[ensureAppUser] Existing row supabase_user_id does not match JWT subject');
          return null;
        }
      }

      const row = await env.DB.prepare(
        `SELECT id, email, name, tenant_id, supabase_user_id FROM auth_users WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first();

      return {
        authUserId: id,
        row: row || byEmail,
        created: false,
      };
    }

    if (!allowCreate) return null;

    const id = generateAppUserId();
    const passwordHash = hasPassword ? identity.passwordHash : 'oauth';
    const salt = hasPassword ? identity.salt : 'oauth';

    const localPart = email.split('@')[0].toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    const tenantId = 'tenant_' + (localPart || crypto.randomUUID().slice(0, 8));
    const userKey = localPart || crypto.randomUUID().slice(0, 8);
    const workspaceId = 'ws_' + userKey;

    await env.DB.prepare(
      `INSERT INTO auth_users (id, email, name, password_hash, salt, supabase_user_id, tenant_id, user_key, default_workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(id, email, name, passwordHash, salt, supabaseUserId || null, tenantId, userKey, workspaceId)
      .run();

    await upsertAuthUserEmail(env, {
      authUserId: id,
      email,
      kind: 'primary',
      tenantId,
      isLoginEnabled: true,
    });

    const row = await env.DB.prepare(
      `SELECT id, email, name, tenant_id, supabase_user_id FROM auth_users WHERE id = ? LIMIT 1`,
    )
      .bind(id)
      .first();

    return {
      authUserId: id,
      row,
      created: true,
    };
  } catch (e) {
    console.warn('[ensureAppUser]', e?.message ?? e);
    return null;
  }
}
