/**
 * Integration Layer: GitHub
 * GitHub REST API v3 operations.
 * Auth: GITHUB_TOKEN (personal access token) primary.
 * Handles: file CRUD, repo list, OAuth, webhook verification.
 *
 * NOTE: router.js must route BOTH /api/agent/github AND /api/github to this handler.
 * App.tsx calls /api/github/repos/... directly.
 */
import { jsonResponse } from '../core/responses.js';

const GITHUB_BASE = 'https://api.github.com';

// ─── Auth ─────────────────────────────────────────────────────────────────────

function githubHeaders(env) {
  const token = env.GITHUB_TOKEN;
  return {
    'Accept':               'application/vnd.github.v3+json',
    'Content-Type':         'application/json',
    'User-Agent':           'IAM-Platform/2.0',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

/**
 * Verify a GitHub webhook signature (HMAC-SHA256).
 * Returns true if signature matches.
 */
export async function verifyGitHubWebhookSignature(env, body, signature) {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const sigParts = signature.split('=');
  if (sigParts[0] !== 'sha256' || !sigParts[1]) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex  = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === sigParts[1];
}

// ─── File Operations ──────────────────────────────────────────────────────────

/**
 * Get file contents from a GitHub repo.
 * Returns { name, path, content (base64), sha, type, encoding }.
 */
export async function getFileContents(env, owner, repo, filePath, ref) {
  const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const res = await fetch(
    `${GITHUB_BASE}/repos/${owner}/${repo}/contents/${filePath}${params}`,
    { headers: githubHeaders(env) }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub file fetch failed: ${err.message || res.status}`);
  }

  return res.json();
}

/**
 * Create or update a file in a GitHub repo.
 * content must be base64-encoded.
 * sha is required when updating an existing file.
 */
export async function putFileContents(env, owner, repo, filePath, opts) {
  const { content, message, sha, branch } = opts;

  const res = await fetch(
    `${GITHUB_BASE}/repos/${owner}/${repo}/contents/${filePath}`,
    {
      method:  'PUT',
      headers: githubHeaders(env),
      body:    JSON.stringify({
        message,
        content,
        ...(sha    ? { sha }    : {}),
        ...(branch ? { branch } : {}),
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub file write failed: ${err.message || res.status}`);
  }

  return res.json();
}

/**
 * List repos accessible to the authenticated user.
 */
export async function listRepos(env, opts = {}) {
  const { per_page = 30, page = 1, sort = 'updated', visibility = 'all' } = opts;
  const params = new URLSearchParams({ per_page, page, sort, visibility }).toString();
  const res = await fetch(`${GITHUB_BASE}/user/repos?${params}`, { headers: githubHeaders(env) });
  if (!res.ok) throw new Error(`GitHub repos list failed: ${res.status}`);
  return res.json();
}

/**
 * List branches for a repo.
 */
export async function listBranches(env, owner, repo) {
  const res = await fetch(
    `${GITHUB_BASE}/repos/${owner}/${repo}/branches`,
    { headers: githubHeaders(env) }
  );
  if (!res.ok) throw new Error(`GitHub branches list failed: ${res.status}`);
  return res.json();
}

/**
 * Get a single commit.
 */
export async function getCommit(env, owner, repo, sha) {
  const res = await fetch(
    `${GITHUB_BASE}/repos/${owner}/${repo}/commits/${sha}`,
    { headers: githubHeaders(env) }
  );
  if (!res.ok) throw new Error(`GitHub commit fetch failed: ${res.status}`);
  return res.json();
}

/**
 * List recent commits on a branch.
 */
export async function listCommits(env, owner, repo, branch, perPage = 20) {
  const params = new URLSearchParams({ sha: branch, per_page: perPage }).toString();
  const res = await fetch(
    `${GITHUB_BASE}/repos/${owner}/${repo}/commits?${params}`,
    { headers: githubHeaders(env) }
  );
  if (!res.ok) throw new Error(`GitHub commits list failed: ${res.status}`);
  return res.json();
}

/**
 * List directory contents.
 */
export async function listDirectory(env, owner, repo, dirPath, ref) {
  const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const res = await fetch(
    `${GITHUB_BASE}/repos/${owner}/${repo}/contents/${dirPath}${params}`,
    { headers: githubHeaders(env) }
  );
  if (!res.ok) throw new Error(`GitHub directory list failed: ${res.status}`);
  return res.json();
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

/**
 * Main dispatcher for GitHub API routes.
 * Handles both /api/github/* and /api/agent/github/* paths.
 */
export async function handleGitHubApi(request, env) {
  const url    = new URL(request.url);
  const path   = url.pathname;
  const method = request.method.toUpperCase();

  // Strip either prefix to get the canonical path
  const canonical = path
    .replace(/^\/api\/agent\/github/, '')
    .replace(/^\/api\/github/, '');

  // ── GET /repos/{owner}/{repo}/contents ────────────────────────────────────
  const contentsMatch = canonical.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/?(.*)$/);
  if (contentsMatch && method === 'GET') {
    const [, owner, repo, filePath] = contentsMatch;
    const ref = url.searchParams.get('ref') || url.searchParams.get('branch') || undefined;

    try {
      const data = await (filePath
        ? getFileContents(env, owner, repo, filePath, ref)
        : listDirectory(env, owner, repo, '', ref)
      );
      return jsonResponse(data);
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // ── POST /repos/{owner}/{repo}/contents ───────────────────────────────────
  if (contentsMatch && method === 'POST') {
    const [, owner, repo] = contentsMatch;
    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { path: filePath, message, content, sha, branch } = body;
    if (!filePath || !content || !message) {
      return jsonResponse({ error: 'path, content, and message are required' }, 400);
    }

    try {
      const data = await putFileContents(env, owner, repo, filePath, { content, message, sha, branch });
      return jsonResponse(data);
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // ── GET /repos/{owner}/{repo}/branches ────────────────────────────────────
  const branchesMatch = canonical.match(/^\/repos\/([^/]+)\/([^/]+)\/branches$/);
  if (branchesMatch && method === 'GET') {
    const [, owner, repo] = branchesMatch;
    try {
      return jsonResponse(await listBranches(env, owner, repo));
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // ── GET /repos/{owner}/{repo}/commits ─────────────────────────────────────
  const commitsMatch = canonical.match(/^\/repos\/([^/]+)\/([^/]+)\/commits$/);
  if (commitsMatch && method === 'GET') {
    const [, owner, repo] = commitsMatch;
    const branch  = url.searchParams.get('sha') || url.searchParams.get('branch') || 'main';
    const perPage = parseInt(url.searchParams.get('per_page') || '20', 10);
    try {
      return jsonResponse(await listCommits(env, owner, repo, branch, perPage));
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // ── GET /repos (list user repos) ─────────────────────────────────────────
  if ((canonical === '/repos' || canonical === '') && method === 'GET') {
    const per_page  = parseInt(url.searchParams.get('per_page') || '30', 10);
    const page      = parseInt(url.searchParams.get('page') || '1', 10);
    const sort      = url.searchParams.get('sort') || 'updated';
    const visibility = url.searchParams.get('visibility') || 'all';
    try {
      return jsonResponse(await listRepos(env, { per_page, page, sort, visibility }));
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // ── Webhook (POST /webhook) ───────────────────────────────────────────────
  if (canonical === '/webhook' && method === 'POST') {
    const rawBody  = await request.text();
    const sigHeader = request.headers.get('X-Hub-Signature-256') || '';
    const valid    = await verifyGitHubWebhookSignature(env, rawBody, sigHeader);
    if (!valid) return jsonResponse({ error: 'Invalid webhook signature' }, 401);

    let payload = {};
    try { payload = JSON.parse(rawBody); } catch (_) {}

    const event = request.headers.get('X-GitHub-Event') || 'unknown';
    // Log to D1 for audit
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO github_webhook_events (id, event, payload, received_at)
         VALUES (?, ?, ?, datetime('now'))`
      ).bind(crypto.randomUUID(), event, rawBody.slice(0, 50000)).run().catch(() => {});
    }

    return jsonResponse({ ok: true, event });
  }

  return jsonResponse({ error: 'GitHub route not found', path }, 404);
}
