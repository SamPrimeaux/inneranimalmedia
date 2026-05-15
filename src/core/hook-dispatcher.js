/**
 * hook-dispatcher.js
 * Fires registered agentsam_hook rows for a given event_type.
 * Writes to agentsam_hook_execution with full scope linkage.
 */

export async function fireAgentHooks(env, ctx, eventType, payload = {}) {
  if (!env?.DB) return;

  try {
    const { results: hooks } = await env.DB.prepare(
      `SELECT id, hook_key, handler_type, handler_config, event_type, workspace_id, tenant_id
       FROM agentsam_hook
       WHERE event_type = ? AND is_active = 1
       ORDER BY priority ASC`
    ).bind(eventType).all();

    if (!hooks?.length) return;

    for (const hook of hooks) {
      const exId = 'hex_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      const t0 = Date.now();
      let outcome = 'success';
      let errorMsg = null;

      try {
        await dispatchHook(env, hook, payload);
      } catch (e) {
        outcome = 'error';
        errorMsg = e?.message ?? String(e);
        console.warn('[hook-dispatcher]', hook.hook_key, errorMsg);
      }

      // Write hook_execution with full scope
      if (ctx?.waitUntil) {
        ctx.waitUntil(
          env.DB.prepare(
            `INSERT INTO agentsam_hook_execution
             (id, hook_id, event_type, tenant_id, workspace_id, status, error_message,
              payload_json, duration_ms, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          ).bind(
            exId,
            hook.id,
            eventType,
            payload.tenant_id ?? hook.tenant_id ?? null,
            payload.workspace_id ?? hook.workspace_id ?? null,
            status: outcome,
            errorMsg,
            JSON.stringify(payload).slice(0, 4096),
            Date.now() - t0,
          ).run().catch(e => console.warn('[hook-dispatcher] execution write', e?.message))
        );
      }
    }
  } catch (e) {
    console.warn('[hook-dispatcher] fireAgentHooks failed', e?.message ?? e);
  }
}

async function dispatchHook(env, hook, payload) {
  const cfg = typeof hook.handler_config === 'string'
    ? JSON.parse(hook.handler_config || '{}')
    : (hook.handler_config || {});

  switch (hook.handler_type) {
    case 'webhook': {
      if (!cfg.url) return;
      await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cfg.headers ?? {}) },
        body: JSON.stringify({ event: hook.event_type, ...payload }),
      });
      break;
    }
    case 'log_only':
      console.log('[hook]', hook.hook_key, JSON.stringify(payload).slice(0, 200));
      break;
    case 'usage_event':
      // Handled by writeUsageEvent — hook is informational
      break;
    default:
      console.warn('[hook-dispatcher] unknown handler_type', hook.handler_type);
  }
}
