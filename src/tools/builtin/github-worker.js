/**
 * GitHub tools — user OAuth from D1 (no cookie round-trip to dashboard).
 */
import { getUserGithubToken, githubCommitHandshake } from '../../integrations/github.js';
import { resolveIntegrationUserId } from '../../core/integration-user-id.js';

function authUserFromParams(params, canonicalUserId) {
  const uid = canonicalUserId || (params.user_id != null ? String(params.user_id).trim() : '');
  if (!uid) return null;
  return { id: uid, user_id: uid };
}

async function ghGetToken(env, params) {
  const rawUid = params.user_id != null ? String(params.user_id).trim() : '';
  if (!rawUid) return { error: 'user_id required for GitHub tools' };
  const canonicalUserId = (await resolveIntegrationUserId(env, { id: rawUid })) || rawUid;
  const account = params.account != null ? String(params.account) : params.account_identifier != null ? String(params.account_identifier) : '';
  const row = await getUserGithubToken(env, canonicalUserId, account);
  if (!row?.token) {
    return { error: 'GitHub account not linked — sign in with GitHub or connect in Integrations' };
  }
  return {
    token: row.token,
    account_identifier: row.account_identifier || '',
    user: authUserFromParams(params, canonicalUserId),
  };
}

async function ghJson(token, method, path, body) {
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
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: `GitHub ${method} ${path} → ${res.status}: ${json.message || JSON.stringify(json).slice(0, 200)}` };
  }
  return json;
}

export const handlers = {
  async github_repos(params, env) {
    const t = await ghGetToken(env, params);
    if (t.error) return t;
    const data = await ghJson(t.token, 'GET', '/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator,organization_member', null);
    if (data.error) return data;
    return { success: true, repos: Array.isArray(data) ? data : [] };
  },

  async github_file(params, env) {
    return await handlers.github_get_file(params, env);
  },

  async github_get_file(params, env) {
    const repo = params.repo != null ? String(params.repo).trim() : '';
    const path = params.path != null ? String(params.path).trim() : '';
    if (!repo || !path) return { error: 'repo and path required' };
    const t = await ghGetToken(env, params);
    if (t.error) return t;
    const enc = path
      .split('/')
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const data = await ghJson(t.token, 'GET', `/repos/${repo}/contents/${enc}`, null);
    if (data.error) return data;
    let content = '';
    if (typeof data.content === 'string' && data.encoding === 'base64') {
      try {
        content = new TextDecoder().decode(
          Uint8Array.from(atob(data.content.replace(/\n/g, '')), (c) => c.charCodeAt(0)),
        );
      } catch {
        content = '';
      }
    }
    return {
      success: true,
      path,
      repo,
      sha: data.sha || null,
      size: data.size ?? null,
      content,
    };
  },

  async github_update_file(params, env) {
    const repo = params.repo != null ? String(params.repo).trim() : '';
    const path = params.path != null ? String(params.path).trim() : '';
    const content = params.content != null ? String(params.content) : '';
    const message = params.message != null ? String(params.message).trim() : '';
    const branch = params.branch != null ? String(params.branch).trim() : '';
    if (!repo || !path || !content || !message) return { error: 'repo, path, content, message required' };
    const u = authUserFromParams(params);
    if (!u) return { error: 'user_id required' };
    try {
      const res = await githubCommitHandshake(env, u, repo, {
        path,
        content,
        message,
        ...(branch ? { branch } : {}),
      });
      return { success: true, ...res };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },

  async github_create_pr(params, env) {
    const repo = params.repo != null ? String(params.repo).trim() : '';
    const title = params.title != null ? String(params.title).trim() : '';
    const head = params.head != null ? String(params.head).trim() : '';
    const base = params.base != null ? String(params.base).trim() : 'main';
    const body = params.body != null ? String(params.body) : '';
    if (!repo || !title || !head) return { error: 'repo, title, head required' };
    const t = await ghGetToken(env, params);
    if (t.error) return t;
    const data = await ghJson(t.token, 'POST', `/repos/${repo}/pulls`, {
      title,
      head,
      base: base || 'main',
      body: body || undefined,
    });
    if (data.error) return data;
    return { success: true, html_url: data.html_url, number: data.number, state: data.state };
  },
};
