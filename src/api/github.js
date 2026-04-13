// src/api/github.js
import { jsonResponse } from '../core/responses.js';
import { getAuthUser }  from '../core/auth.js';
import {
  listRepos, getContents, upsertFile, deleteFile
} from '../integrations/github.js';

export async function handleGithubApi(request, url, env, ctx) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  const path   = url.pathname;
  const method = request.method.toUpperCase();

  // GET /api/integrations/github/repos
  if (path === '/api/integrations/github/repos' && method === 'GET') {
    try {
      const repos = await listRepos(env);
      return jsonResponse(repos);
    } catch (e) { return jsonResponse({ error: e.message }, 500); }
  }

  // GET /api/github/repos/:owner/:repo/contents
  const contentsMatch = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/contents$/);
  if (contentsMatch) {
    const owner  = decodeURIComponent(contentsMatch[1]);
    const repo   = decodeURIComponent(contentsMatch[2]);
    const ref    = url.searchParams.get('ref') || 'main';
    const p      = url.searchParams.get('path') || '';
    if (method === 'GET') {
      try {
        const data = await getContents(env, owner, repo, p, ref);
        return jsonResponse(data);
      } catch (e) { return jsonResponse({ error: e.message }, 500); }
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      try {
        const result = await upsertFile(env, owner, repo, body);
        return jsonResponse(result);
      } catch (e) { return jsonResponse({ error: e.message }, 500); }
    }
    if (method === 'DELETE') {
      const body = await request.json().catch(() => ({}));
      try {
        const result = await deleteFile(env, owner, repo, body);
        return jsonResponse(result);
      } catch (e) { return jsonResponse({ error: e.message }, 500); }
    }
  }

  return jsonResponse({ error: 'GitHub route not found', path }, 404);
}
