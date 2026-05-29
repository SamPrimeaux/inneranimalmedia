/**
 * Supabase database webhooks — shared-secret verification + durable audit + routing hooks (D1).
 */
import { jsonResponse } from '../../core/auth.js';
import {
  overviewDirtySectionsForWebhook,
  setOverviewBundleDirty,
} from '../../core/overview-bundle-kv.js';
import { resolveWebhookTenantId } from '../../core/webhook-events-writer.js';
import { ingestWebhookEventAndDispatch } from '../../core/webhook-ingest-dispatch.js';

/** @param {string} a @param {string} b */
function timingSafeEqualUtf8(a, b) {
  const enc = new TextEncoder();
  const ea = enc.encode(a);
  const eb = enc.encode(b);
  if (ea.length !== eb.length) return false;
  let d = 0;
  for (let i = 0; i < ea.length; i += 1) d |= ea[i] ^ eb[i];
  return d === 0;
}

/**
 * @param {Request} request
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function handleSupabaseWebhook(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const recv = String(request.headers.get('x-supabase-webhook-secret') ?? '');
  const expected = String(env.SUPABASE_DB_WEBHOOK_SECRET ?? '');
  if (!expected || !timingSafeEqualUtf8(recv, expected)) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const raw = await request.text();
  /** @type {Record<string, unknown>} */
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400);
  }

  const routedType =
    (typeof body?.event_type === 'string' && body.event_type) ||
    (typeof body?.type === 'string' && body.type) ||
    '';

  if (routedType === 'workflow_run_stream') {
    await env.DB.prepare(
      `UPDATE agentsam_workflow_runs
       SET supabase_sync_status = 'synced',
           supabase_synced_at   = datetime('now'),
           updated_at           = datetime('now')
       WHERE id = ?`,
    )
      .bind(String(body?.run_id || ''))
      .run()
      .catch((e) => console.warn('[webhook/supabase] run sync:', e?.message));
    return new Response(JSON.stringify({ ok: true, routed: 'workflow_run_stream' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (routedType === 'workflow_eval_result') {
    await ingestWebhookEventAndDispatch(env, ctx, {
      tenantId:
        typeof body?.tenant_id === 'string' && body.tenant_id.trim()
          ? body.tenant_id.trim()
          : resolveWebhookTenantId(env),
      provider: 'supabase',
      eventType: routedType,
      payload: body,
      endpointPath: '/api/webhooks/supabase',
      signatureValid: true,
    });
    return new Response(JSON.stringify({ ok: true, routed: 'workflow_eval_result' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const record = body.record && typeof body.record === 'object' ? body.record : body;
  const webhookTenant =
    (typeof record?.tenant_id === 'string' && record.tenant_id.trim())
      ? record.tenant_id.trim()
      : resolveWebhookTenantId(env);

  const dirtySections = overviewDirtySectionsForWebhook(body.table, body.type);
  if (dirtySections.length && ctx?.waitUntil) {
    ctx.waitUntil(
      (async () => {
        for (const section of dirtySections) {
          await setOverviewBundleDirty(env, section, webhookTenant);
        }
      })(),
    );
  }

  if (env?.DB && ctx?.waitUntil) {
    ctx.waitUntil(
      (async () => {
        const eventType = `${body.type ?? ''}:${body.table ?? ''}`;
        await ingestWebhookEventAndDispatch(env, ctx, {
          tenantId: webhookTenant,
          provider: 'supabase',
          eventType,
          payload: body,
          endpointPath: '/api/webhooks/supabase',
          signatureValid: true,
        });

        try {
          await env.DB.prepare(
            `UPDATE webhook_endpoints
             SET total_received = total_received + 1, last_received_at = datetime('now')
             WHERE id = 'whe_supabase_main'`,
          ).run();
        } catch (_) {
          /* legacy counter; registry is agentsam_webhooks */
        }

        switch (body.table) {
          case 'agentsam_routing_decisions': {
            const r = body.record;
            if (!r?.task_type || !r?.selected_model) break;
            await env.DB.prepare(
              `UPDATE agentsam_routing_arms SET
                 success_alpha = success_alpha + ?,
                 success_beta  = success_beta  + ?,
                 updated_at = unixepoch()
               WHERE task_type = ? AND model_key = ?`,
            )
              .bind(r.success ? 1 : 0, r.success ? 0 : 1, r.task_type, r.selected_model)
              .run();
            break;
          }
          case 'build_deploy_events': {
            const r = body.record;
            if (body.type !== 'INSERT') break;
            const hooks = await env.DB.prepare(
              `SELECT id, user_id FROM agentsam_hook
               WHERE trigger = 'post_deploy' AND is_active = 1`,
            ).all();
            for (const hook of hooks.results ?? []) {
              await env.DB.prepare(
                `INSERT INTO agentsam_hook_execution
                   (id, hook_id, user_id, status, source, event_type, payload_json, ran_at)
                 VALUES (
                   'hexec_' || lower(hex(randomblob(6))),
                   ?, ?, 'success', 'supabase', 'post_deploy', ?, datetime('now')
                 )`,
              )
                .bind(hook.id, hook.user_id, JSON.stringify(r))
                .run();
            }
            break;
          }
          default:
            break;
        }
      })(),
    );
  }

  return jsonResponse({ ok: true });
}
