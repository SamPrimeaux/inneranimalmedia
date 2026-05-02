import { provisionUserWorkspace } from '../api/provisioning.js';

/**
 * Provision a new user account on first login (Google OAuth, Supabase OAuth, or email signup).
 * Idempotent — safe to call on every login via INSERT OR IGNORE.
 * Creates: users row, user_settings, personal workspace.
 * Returns { user_key, workspace_id } or null on failure.
 *
 * Lifted from worker.js (Google OAuth path) — keep in sync with monolith.
 */
export async function provisionNewUser(env, { email, name, authUserId }) {
  if (!env.DB || !email) return null;

  const localPart = email.split('@')[0].toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const user_key = localPart || 'user_' + crypto.randomUUID().slice(0, 8);
  const workspace_id = 'ws_' + user_key;
  const displayName = name || email.split('@')[0];

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users
         (id, user_key, email, display_name, role, default_workspace_id, auth_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'user', ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      authUserId || ('usr_' + user_key),
      user_key,
      email,
      displayName,
      workspace_id,
      authUserId || null
    ).run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO workspaces
         (id, name, handle, status, category, created_at)
       VALUES (?, ?, ?, 'active', 'personal', unixepoch())`
    ).bind(workspace_id, displayName + "'s Workspace", user_key).run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_settings
         (user_id, theme, default_workspace_id, updated_at)
       VALUES (?, 'meaux-storm-gray', ?, unixepoch())`
    ).bind(authUserId || ('usr_' + user_key), workspace_id).run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO workspace_members
         (workspace_id, user_id, role, joined_at)
       VALUES (?, ?, 'owner', unixepoch())`
    ).bind(workspace_id, authUserId || ('usr_' + user_key)).run();

    await provisionUserWorkspace(env, {
      userId: authUserId || ('usr_' + user_key),
      email,
      planId: 'free',
    }).catch((err) => console.warn('[provisionNewUser] provisionUserWorkspace:', err?.message ?? err));

    return { user_key, workspace_id };
  } catch (e) {
    console.warn('[provisionNewUser] error:', e?.message ?? e);
    return null;
  }
}
