/**
 * Web Push subscription storage via agentsam_hook (handler_type = web_push).
 * POST /api/push/subscribe — session auth required.
 */

import { getAuthUser, jsonResponse } from '../core/auth.js';
import { sha256Hex } from '../core/cms-theme-hashing.js';

function newHookId() {
  return `hook_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

async function endpointFingerprint(endpoint) {
  const hash = await sha256Hex(endpoint);
  return hash.slice(-16);
}

export async function handlePushSubscribe(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

  const authUser = await getAuthUser(request, env);
  if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const endpoint = String(body.endpoint || '').trim();
  const keys = body.keys && typeof body.keys === 'object' ? body.keys : {};
  const p256dh = String(keys.p256dh || '').trim();
  const auth = String(keys.auth || '').trim();
  const userAgent =
    typeof body.user_agent === 'string'
      ? body.user_agent.trim()
      : (request.headers.get('User-Agent') || '').trim() || null;

  if (!endpoint || !p256dh || !auth) {
    return jsonResponse({ error: 'Invalid subscription object' }, 400);
  }

  const tenantId = String(authUser.active_tenant_id || authUser.tenant_id || '').trim() || 'unknown';
  const workspaceId = String(authUser.active_workspace_id || '').trim() || null;
  const userId = String(authUser.id);
  const hookKey = `push:${userId}:${await endpointFingerprint(endpoint)}`;

  const handlerConfig = JSON.stringify({
    endpoint,
    keys: { p256dh, auth },
    user_agent: userAgent,
  });

  const id = newHookId();
  await env.DB.prepare(`
    INSERT INTO agentsam_hook (
      id, tenant_id, workspace_id, user_id, provider, trigger, command,
      target_id, handler_type, handler_config, hook_key, event_type, is_active,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'browser', 'notification.push', '',
      ?, 'web_push', ?, ?, '*', 1,
      datetime('now'), datetime('now')
    )
    ON CONFLICT(tenant_id, hook_key) DO UPDATE SET
      handler_config = excluded.handler_config,
      workspace_id = excluded.workspace_id,
      user_id = excluded.user_id,
      target_id = excluded.target_id,
      is_active = 1,
      updated_at = datetime('now')
  `)
    .bind(id, tenantId, workspaceId, userId, userId, handlerConfig, hookKey)
    .run();

  return jsonResponse({ ok: true, hook_key: hookKey });
}

export async function handlePushVapidPublicKey(_request, env) {
  const key = env?.VAPID_PUBLIC_KEY && String(env.VAPID_PUBLIC_KEY).trim();
  if (!key) return jsonResponse({ error: 'Web Push not configured' }, 503);
  return jsonResponse({ publicKey: key });
}

export async function handlePushUnsubscribe(request, env) {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

  const authUser = await getAuthUser(request, env);
  if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* DELETE may have no body */
  }

  const endpoint = String(body.endpoint || '').trim();
  const hookKeyInput = String(body.hook_key || '').trim();
  const tenantId = String(authUser.active_tenant_id || authUser.tenant_id || '').trim() || 'unknown';
  const userId = String(authUser.id);

  let hookKey = hookKeyInput;
  if (!hookKey && endpoint) {
    hookKey = `push:${userId}:${await endpointFingerprint(endpoint)}`;
  }
  if (!hookKey) return jsonResponse({ error: 'endpoint or hook_key required' }, 400);

  await env.DB.prepare(`
    UPDATE agentsam_hook
    SET is_active = 0, updated_at = datetime('now')
    WHERE tenant_id = ? AND hook_key = ? AND user_id = ? AND handler_type = 'web_push'
  `)
    .bind(tenantId, hookKey, userId)
    .run();

  return jsonResponse({ ok: true });
}
