/**
 * Supabase database webhooks — shared-secret verification + durable audit + routing hooks (D1).
 */
import { jsonResponse } from '../../core/auth.js';

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

  if (env?.DB && ctx?.waitUntil) {
    ctx.waitUntil(
      (async () => {
        const eventType = `${body.type ?? ''}:${body.table ?? ''}`;
        const payloadJson = JSON.stringify(body);

        await env.DB.prepare(
          `INSERT INTO agentsam_webhook_events
           (id, tenant_id, provider, event_type, payload_json, status, endpoint_id, source, received_at)
           VALUES (
             'whe_' || lower(hex(randomblob(8))),
             'tenant_sam_primeaux',
             'supabase',
             ?, ?, 'received',
             'whe_supabase_main',
             'supabase',
             datetime('now')
           )`,
        )
          .bind(eventType, payloadJson)
          .run();

        await env.DB.prepare(
          `UPDATE webhook_endpoints
           SET total_received = total_received + 1, last_received_at = datetime('now')
           WHERE id = 'whe_supabase_main'`,
        ).run();

        switch (body.table) {
          case 'agentsam_routing_decisions': {
            const r = body.record;
            if (!r?.task_type || !r?.selected_model) break;
            await env.DB.prepare(
              `UPDATE model_routing_rules SET
                 avg_latency_ms = ROUND(COALESCE(avg_latency_ms, ?) * 0.9 + ? * 0.1, 2),
                 success_rate   = ROUND(COALESCE(success_rate,   ?) * 0.9 + ? * 0.1, 4),
                 last_evaluated_at = unixepoch(),
                 updated_at = datetime('now')
               WHERE task_type = ?`,
            )
              .bind(
                r.latency_ms,
                r.latency_ms,
                r.success ? 1 : 0,
                r.success ? 1 : 0,
                r.task_type,
              )
              .run();
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
