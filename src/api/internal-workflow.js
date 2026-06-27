/**
 * Internal workflow endpoints — service-binding only (iam-workflows → platform).
 */

import { jsonResponse } from '../core/auth.js';
import {
  isWorkflowInternalAuthorized,
  executeWorkflowNodeInternal,
  finalizeWorkflowRunInternal,
} from '../core/workflow-node-execute.js';

export async function handleInternalWorkflowRequest(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (!isWorkflowInternalAuthorized(request, env)) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  if (path === '/api/internal/workflow/execute-node' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid json' }, 400);
    }
    const result = await executeWorkflowNodeInternal(env, body);
    const status = result.ok ? 200 : result.error === 'run_not_found' ? 404 : 500;
    return jsonResponse(result, status);
  }

  if (path === '/api/internal/workflow/finalize-run' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid json' }, 400);
    }
    const result = await finalizeWorkflowRunInternal(env, body);
    return jsonResponse(result, result.ok ? 200 : 500);
  }

  return null;
}
