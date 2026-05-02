import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';
import { getIntegrationToken } from './tokens.js';

/**
 * GitHub Service Integration.
 * Handles repository discovery, file operations, and API proxying.
 */

/**
 * Main dispatcher for GitHub-related API requests.
 */
export async function handleGitHubApi(request, env) {
    const url = new URL(request.url);
    const pathLower = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();

    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    // Retrieve the GitHub token from Secret/Vault/KV
    const token = await getIntegrationToken(env.DB, authUser.id, 'github');
    if (!token) return jsonResponse({ error: 'GitHub account not linked' }, 403);

    // ── GET /api/agent/github/repos ──────────────────────────────────────────
    if (pathLower === '/api/agent/github/repos' && method === 'GET') {
        try {
            const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50', {
                headers: {
                    'Authorization': `token ${token}`,
                    'User-Agent': 'AgentSam-Dashboard',
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            const repos = await response.json();
            return jsonResponse({ repos: Array.isArray(repos) ? repos : [] });
        } catch (e) {
            return jsonResponse({ error: 'GitHub fetch failed', detail: e.message }, 500);
        }
    }

    // ── GET /api/agent/github/file ───────────────────────────────────────────
    if (pathLower === '/api/agent/github/file' && method === 'GET') {
        const repo = url.searchParams.get('repo');
        const path = url.searchParams.get('path');
        if (!repo || !path) return jsonResponse({ error: 'repo and path required' }, 400);

        try {
            const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'User-Agent': 'AgentSam-Dashboard',
                    'Accept': 'application/vnd.github.v3.raw'
                }
            });
            const content = await response.text();
            return new Response(content, { headers: { 'Content-Type': 'text/plain' } });
        } catch (e) {
            return jsonResponse({ error: 'Failed to fetch GitHub file', detail: e.message }, 500);
        }
    }

    return jsonResponse({ error: 'GitHub route not found' }, 404);
}

// ─── WebCrypto JWT (RS256) for GitHub App auth ───────────────────────────────

async function importAppPrivateKey(pem) {
  const stripped = pem
    .replace(/-----BEGIN[^-]+-----/, '')
    .replace(/-----END[^-]+-----/, '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function b64url(obj) {
  return btoa(JSON.stringify(obj))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function signAppJwt(appId, pem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat: now - 60, exp: now + 540, iss: String(appId) };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const key = await importAppPrivateKey(pem);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signingInput}.${sigB64}`;
}

async function getAppInstallationToken(env, owner) {
  const jwt = await signAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);

  // Find installation ID for this owner/org
  const instRes = await fetch('https://api.github.com/app/installations', {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'InnerAnimalMedia-AgentSam',
    },
  });
  if (!instRes.ok) throw new Error(`App installations lookup failed: ${instRes.status}`);
  const installations = await instRes.json();

  const match = owner
    ? installations.find((i) => i.account?.login?.toLowerCase() === owner.toLowerCase())
    : installations[0];
  if (!match) throw new Error(`No GitHub App installation found for owner: ${owner}`);

  // Exchange for installation access token
  const tokenRes = await fetch(
    `https://api.github.com/app/installations/${match.id}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'InnerAnimalMedia-AgentSam',
      },
    }
  );
  if (!tokenRes.ok) throw new Error(`Installation token exchange failed: ${tokenRes.status}`);
  const { token } = await tokenRes.json();
  return token;
}

// ─── Token Resolution (OAuth → App → PAT) ────────────────────────────────────

export async function resolveGitHubToken(env, authUser, owner) {
  // 1. User OAuth token from D1
  if (authUser?.user_id) {
    const row = await env.DB.prepare(
      `SELECT access_token FROM user_oauth_tokens
       WHERE user_id = ? AND provider = 'github'
       ORDER BY updated_at DESC LIMIT 1`
    )
      .bind(authUser.user_id)
      .first();
    if (row?.access_token) return { token: row.access_token, mode: 'oauth' };
  }

  // 2. GitHub App installation token
  if (env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY) {
    try {
      const token = await getAppInstallationToken(env, owner);
      return { token, mode: 'app' };
    } catch (err) {
      console.warn('[GitHub] App token fallback failed:', err.message);
    }
  }

  // 3. PAT fallback
  if (env.GITHUB_TOKEN) return { token: env.GITHUB_TOKEN, mode: 'pat' };

  throw new Error('No GitHub auth resolved — check OAuth token, App credentials, or GITHUB_TOKEN');
}

// ─── Git Data API Helpers ─────────────────────────────────────────────────────

async function ghFetch(token, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'InnerAnimalMedia-AgentSam',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub ${method} ${path} → ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  }
  return json;
}

// ─── SHA Handshake Commit ─────────────────────────────────────────────────────

/**
 * Performs a full 6-step Git Data API commit:
 *   1. Get Ref        → current branch SHA
 *   2. Get Commit     → parent tree SHA
 *   3. Create Blob    → upload file content
 *   4. Create Tree    → new tree with blob
 *   5. Create Commit  → new commit pointing to new tree
 *   6. Patch Ref      → advance branch pointer
 *
 * @param {object} env         - Worker env bindings
 * @param {object} authUser    - Authenticated user (for OAuth lookup)
 * @param {string} repo        - "owner/repo"
 * @param {object} opts
 * @param {string} opts.branch        - Target branch (default: repo default)
 * @param {string} opts.path          - File path in repo
 * @param {string} opts.content       - UTF-8 file content
 * @param {string} opts.message       - Commit message
 * @param {string} [opts.committer]   - Optional committer name
 * @returns {{ sha, url, mode }} - New commit SHA, HTML URL, and auth mode used
 */
export async function githubCommitHandshake(env, authUser, repo, opts) {
  const { path: filePath, content, message } = opts;
  if (!repo || !filePath || !content || !message) {
    throw new Error('repo, path, content, and message are all required');
  }

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) throw new Error(`Invalid repo format — expected "owner/repo", got "${repo}"`);

  const { token, mode } = await resolveGitHubToken(env, authUser, owner);

  // Resolve branch — use specified or fall back to repo default
  let branch = opts.branch;
  if (!branch) {
    const repoMeta = await ghFetch(token, 'GET', `/repos/${repo}`);
    branch = repoMeta.default_branch;
  }

  // Step 1: Get current ref → branch tip SHA
  const refData = await ghFetch(token, 'GET', `/repos/${repo}/git/refs/heads/${branch}`);
  const latestSha = refData.object.sha;

  // Step 2: Get commit → parent tree SHA
  const commitData = await ghFetch(token, 'GET', `/repos/${repo}/git/commits/${latestSha}`);
  const baseTreeSha = commitData.tree.sha;

  // Step 3: Create blob (base64-encoded content)
  const blobData = await ghFetch(token, 'POST', `/repos/${repo}/git/blobs`, {
    content: btoa(unescape(encodeURIComponent(content))),
    encoding: 'base64',
  });

  // Step 4: Create new tree with blob at target path
  const treeData = await ghFetch(token, 'POST', `/repos/${repo}/git/trees`, {
    base_tree: baseTreeSha,
    tree: [
      {
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      },
    ],
  });

  // Step 5: Create new commit
  const newCommitData = await ghFetch(token, 'POST', `/repos/${repo}/git/commits`, {
    message,
    tree: treeData.sha,
    parents: [latestSha],
    ...(opts.committer && {
      committer: { name: opts.committer, email: 'support@inneranimalmedia.com' },
    }),
  });

  // Step 6: Advance branch ref to new commit
  await ghFetch(token, 'PATCH', `/repos/${repo}/git/refs/heads/${branch}`, {
    sha: newCommitData.sha,
    force: false,
  });

  return {
    sha: newCommitData.sha,
    url: newCommitData.html_url,
    branch,
    mode,
  };
}

// ─── /api/integrations/* dispatcher ──────────────────────────────────────────

export async function handleGithubApi(request, env, authUser) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/integrations/status') {
    if (!authUser) return jsonResponse({ google: false, github: false, github_accounts: [] });
    const integrationUserId = authUser.email || authUser.id;
    let google = false;
    let github = false;
    const githubAccounts = [];
    try {
      const result = await env.DB.prepare(
        `SELECT provider, account_identifier FROM user_oauth_tokens WHERE user_id = ?`
      ).bind(integrationUserId).all();
      for (const r of result.results || []) {
        if (r.provider === 'google_drive') google = true;
        if (r.provider === 'github') {
          github = true;
          if (r.account_identifier) githubAccounts.push({ account_identifier: r.account_identifier });
        }
      }
    } catch (_) { }
    return jsonResponse({ google, github, github_accounts: githubAccounts });
  }

  if (!authUser) return jsonResponse({ error: 'unauthorized' }, 401);
  const integrationUserId = authUser.email || authUser.id;
  const githubAccount = url.searchParams.get('account') || '';

  if (method === 'GET' && path === '/api/integrations/gdrive/files') {
    const folderId = url.searchParams.get('folderId') || 'root';
    const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'google_drive', '');
    if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
    const driveUrl = new URL('https://www.googleapis.com/drive/v3/files');
    driveUrl.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
    driveUrl.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime)');
    driveUrl.searchParams.set('orderBy', 'name');
    const res = await fetch(driveUrl.toString(), {
      headers: { Authorization: `Bearer ${tokenRow.access_token}` }
    });
    if (res.status === 401 && tokenRow.refresh_token && env.GOOGLE_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
          refresh_token: tokenRow.refresh_token,
          grant_type: 'refresh_token'
        })
      });
      const refreshed = await refreshRes.json();
      if (refreshed.access_token) {
        await env.DB.prepare(
          `UPDATE user_oauth_tokens SET access_token = ?, expires_at = ?, updated_at = unixepoch() WHERE user_id = ? AND provider = 'google_drive' AND account_identifier = ''`
        ).bind(refreshed.access_token, Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600), integrationUserId).run();
        const retryUrl = new URL('https://www.googleapis.com/drive/v3/files');
        retryUrl.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
        retryUrl.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime)');
        retryUrl.searchParams.set('orderBy', 'name');
        const retry = await fetch(retryUrl.toString(), { headers: { Authorization: `Bearer ${refreshed.access_token}` } });
        return jsonResponse(await retry.json());
      }
    }
    return jsonResponse(await res.json());
  }

  if (method === 'GET' && path === '/api/integrations/gdrive/file') {
    const fileId = url.searchParams.get('fileId');
    const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'google_drive', '');
    if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
    if (res.status === 401 && tokenRow.refresh_token && env.GOOGLE_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
          refresh_token: tokenRow.refresh_token,
          grant_type: 'refresh_token'
        })
      });
      const refreshed = await refreshRes.json();
      if (refreshed.access_token) {
        await env.DB.prepare(
          `UPDATE user_oauth_tokens SET access_token = ?, expires_at = ?, updated_at = unixepoch() WHERE user_id = ? AND provider = 'google_drive' AND account_identifier = ''`
        ).bind(refreshed.access_token, Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600), integrationUserId).run();
        const retry = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${refreshed.access_token}` } });
        return jsonResponse({ content: await retry.text() });
      }
    }
    return jsonResponse({ content: await res.text() });
  }

  if (method === 'GET' && path === '/api/integrations/github/repos') {
    const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
    if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
    const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member', { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
    return jsonResponse(await res.json());
  }

  if (method === 'GET' && path === '/api/integrations/github/files') {
    const repo = url.searchParams.get('repo');
    const filePath = url.searchParams.get('path') || '';
    const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
    if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
    return jsonResponse(await res.json());
  }

  if (method === 'GET' && path === '/api/integrations/github/file') {
    const repo = url.searchParams.get('repo');
    const filePath = url.searchParams.get('path');
    const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
    if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
    const data = await res.json();
    const content = atob((data.content || '').replace(/\n/g, ''));
    return jsonResponse({ content, sha: data.sha, name: data.name });
  }

  if (method === 'GET' && path === '/api/integrations/github/raw') {
    const repo = url.searchParams.get('repo');
    const filePath = url.searchParams.get('path');
    if (!repo || !filePath) return jsonResponse({ error: 'missing repo or path' }, 400);
    const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
    if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
    const res = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(repo)}/HEAD/${filePath.split('/').map(p => encodeURIComponent(p)).join('/')}`, { headers: { Authorization: `token ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
    if (!res.ok) return jsonResponse({ error: res.statusText || 'Not found' }, res.status);
    const ext = (filePath || '').split('.').pop().toLowerCase();
    const ctMap = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json', md: 'text/markdown', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf', glb: 'model/gltf-binary', gltf: 'model/gltf+json' };
    const contentType = ctMap[ext] || 'application/octet-stream';
    const headers = new Headers({ 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
    return new Response(res.body, { status: 200, headers });
  }

  if (method === 'GET' && path === '/api/integrations/gdrive/raw') {
    const fileId = url.searchParams.get('fileId');
    if (!fileId) return jsonResponse({ error: 'missing fileId' }, 400);
    const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'google_drive', '');
    if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
    if (!res.ok) return jsonResponse({ error: res.statusText || 'Not found' }, res.status);
    const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
    const headers = new Headers({ 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
    return new Response(res.body, { status: 200, headers });
  }

  return jsonResponse({ error: 'Integration route not found' }, 404);
}
