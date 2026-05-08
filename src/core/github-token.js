/**
 * Shared GitHub OAuth token resolution for Workers API routes.
 * @param {{ id: string, email?: string|null }} authUser
 * @param {any} env
 */
export async function resolveGitHubToken(authUser, env) {
  const row = await env.DB.prepare(
    `SELECT access_token, expires_at FROM user_oauth_tokens
     WHERE provider = 'github' AND (user_id = ? OR user_id = ?)
     ORDER BY expires_at DESC LIMIT 1`,
  )
    .bind(authUser.id, authUser.email ?? '')
    .first();

  if (!row?.access_token) {
    return { error: 'No GitHub token. Re-authenticate via GitHub OAuth.', status: 401 };
  }

  if (row.expires_at && Math.floor(Date.now() / 1000) > row.expires_at) {
    return { error: 'GitHub token expired. Re-authenticate via GitHub OAuth.', status: 401 };
  }

  return { token: row.access_token };
}
