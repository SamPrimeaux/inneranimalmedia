/**
 * Simplified webhook ingest for moviemode-service (full registry on main IAM worker).
 */
export async function ingestWebhookEventAndDispatch(env, ctx, opts) {
  if (env?.DB) {
    try {
      const id = `wh_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await env.DB.prepare(
        `INSERT INTO agentsam_webhook_events (
           id, provider, event_type, payload_json, signature_valid, created_at, processed_at
         ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
        .bind(
          id,
          String(opts.provider || 'unknown'),
          String(opts.eventType || 'unknown'),
          JSON.stringify(opts.payload || {}),
          opts.signatureValid ? 1 : 0,
        )
        .run();
      return { ok: true, id };
    } catch (e) {
      console.warn('[webhook-ingest]', e?.message ?? e);
    }
  }
  return { ok: true, id: null, stub: true };
}
