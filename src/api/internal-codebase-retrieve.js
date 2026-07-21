/**
 * POST /api/internal/codebase/retrieve
 * Private signed endpoint — MCP OAuth connectors call AST Graph RAG on main.
 * Auth: INTERNAL_API_SECRET or AGENTSAM_BRIDGE_KEY (Bearer / X-Internal-Secret).
 */
import { verifyInternalApiSecret, jsonResponse } from '../core/auth.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function isInternalAuthorized(request, env) {
  if (verifyInternalApiSecret(request, env)) return true;
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const bridge = env?.AGENTSAM_BRIDGE_KEY != null ? String(env.AGENTSAM_BRIDGE_KEY).trim() : '';
  if (bridge && bearer === bridge) return true;
  const header = (request.headers.get('X-Internal-Secret') || '').trim();
  if (bridge && header === bridge) return true;
  return false;
}

/**
 * @param {Request} request
 * @param {any} env
 */
export async function handleInternalCodebaseRetrieve(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  }
  if (!isInternalAuthorized(request, env)) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const authIn = body.auth && typeof body.auth === 'object' ? body.auth : {};
  const args = body.args && typeof body.args === 'object' ? body.args : body;

  const workspaceId =
    trim(authIn.workspace_id) ||
    trim(body.workspace_id) ||
    trim(args.workspace_id) ||
    'ws_inneranimalmedia';

  const query = trim(args.query || args.q || body.query || '');
  if (!query) {
    return jsonResponse({ ok: false, error: 'query_required' }, 400);
  }

  const { retrieveCodebaseAstContext } = await import('../core/codebase-ast-retrieve.js');
  const out = await retrieveCodebaseAstContext(env, query, {
    topK: Math.min(Math.max(Number(args.top_k ?? args.topK ?? args.limit) || 8, 1), 32),
    repo: args.repo ? String(args.repo) : null,
    expand: args.expand !== false && args.expand !== 'false',
    hydrate: args.hydrate !== false && args.hydrate !== 'false',
    workspaceId,
  });

  return jsonResponse(out);
}
