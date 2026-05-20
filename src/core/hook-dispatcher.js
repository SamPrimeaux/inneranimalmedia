/**
 * hook-dispatcher.js
 * Fires registered agentsam_hook rows for a given event_type (or legacy trigger).
 * Writes to agentsam_hook_execution with tenant/workspace scope.
 */

const HOOK_SELECT = `
  SELECT
    id,
    COALESCE(NULLIF(trim(hook_key), ''), id) AS hook_key,
    COALESCE(NULLIF(trim(handler_type), ''),
      CASE
        WHEN command LIKE 'notify:webhook:%' THEN 'webhook'
        WHEN command IN ('trigger:agent_sam_deploy_hook', 'trigger:workers_deploy_hook') THEN 'workers_deploy'
        WHEN command LIKE 'log:%' OR command IN ('notify:imessage', 'notify:email') THEN 'log_only'
        WHEN COALESCE(trim(command), '') = ''
          AND COALESCE(event_type, trigger) IN ('agent_run_complete', 'stop') THEN 'usage_event'
        ELSE 'log_only'
      END
    ) AS handler_type,
    COALESCE(NULLIF(trim(handler_config), ''),
      CASE
        WHEN command LIKE 'notify:webhook:%' THEN json_object('url', substr(command, length('notify:webhook:') + 1))
        ELSE json_object('command', COALESCE(command, ''))
      END
    ) AS handler_config,
    COALESCE(event_type, trigger) AS event_type,
    workspace_id,
    tenant_id,
    command
  FROM agentsam_hook
  WHERE COALESCE(event_type, trigger) = ?
    AND is_active = 1
  ORDER BY COALESCE(priority, 100) ASC, created_at ASC
`;

export async function fireAgentHooks(env, ctx, eventType, payload = {}) {
  if (!env?.DB) return;

  try {
    const { results: hooks } = await env.DB.prepare(HOOK_SELECT).bind(eventType).all();

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

      if (ctx?.waitUntil) {
        ctx.waitUntil(
          env.DB.prepare(
            `INSERT INTO agentsam_hook_execution
             (id, hook_id, event_type, tenant_id, workspace_id, status, error,
              payload_json, duration_ms, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          )
            .bind(
              exId,
              hook.id,
              eventType,
              payload.tenant_id ?? hook.tenant_id ?? null,
              payload.workspace_id ?? hook.workspace_id ?? null,
              outcome,
              errorMsg,
              JSON.stringify(payload).slice(0, 4096),
              Date.now() - t0,
            )
            .run()
            .catch((e) => console.warn('[hook-dispatcher] execution write', e?.message)),
        );
        ctx.waitUntil(
          env.DB.prepare(
            `UPDATE agentsam_hook
             SET run_count = COALESCE(run_count, 0) + 1,
                 last_run_at = datetime('now')
             WHERE id = ?`,
          )
            .bind(hook.id)
            .run()
            .catch(() => {}),
        );
      }
    }
  } catch (e) {
    console.warn('[hook-dispatcher] fireAgentHooks failed', e?.message ?? e);
  }
}

async function dispatchHook(env, hook, payload) {
  let cfg = {};
  try {
    cfg =
      typeof hook.handler_config === 'string'
        ? JSON.parse(hook.handler_config || '{}')
        : hook.handler_config || {};
  } catch {
    cfg = {};
  }
  if (!cfg.command && hook.command) cfg.command = hook.command;

  switch (hook.handler_type) {
    case 'webhook': {
      const url = cfg.url || (hook.command?.startsWith('notify:webhook:')
        ? hook.command.slice('notify:webhook:'.length)
        : null);
      if (!url) return;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cfg.headers ?? {}) },
        body: JSON.stringify({ event: hook.event_type, ...payload }),
      });
      break;
    }
    case 'workers_deploy': {
      const { postAgentSamDeployHook } = await import('./workers-deploy-hook.js');
      const pr = await postAgentSamDeployHook(env);
      if (pr.error) throw new Error(pr.error);
      if (!pr.ok) throw new Error(`deploy hook HTTP ${pr.status}`);
      break;
    }
    case 'log_only':
      console.log('[hook]', hook.hook_key, JSON.stringify({ ...payload, command: cfg.command }).slice(0, 400));
      break;
    case 'usage_event':
      break;
    default:
      console.warn('[hook-dispatcher] unknown handler_type', hook.handler_type, hook.hook_key);
  }
}
