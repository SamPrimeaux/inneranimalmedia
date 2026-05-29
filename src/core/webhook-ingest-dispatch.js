/**
 * Canonical webhook ingest: D1 audit row + optional registry workflow dispatch.
 */
import {
  insertAgentsamWebhookEvent,
  markAgentsamWebhookEventProcessed,
} from './webhook-events-writer.js';
import { dispatchWebhookRegistryWorkflow } from './webhook-workflow-dispatch.js';

/**
 * @param {any} env
 * @param {any} [ctx]
 * @param {Parameters<typeof insertAgentsamWebhookEvent>[1]} opts
 * @param {{ skipDispatch?: boolean }} [extra]
 */
export async function ingestWebhookEventAndDispatch(env, ctx, opts, extra = {}) {
  const ins = await insertAgentsamWebhookEvent(env, opts);
  if (!ins?.ok || !ins?.id) {
    return { ok: false, reason: ins?.reason ?? 'insert_failed', id: ins?.id ?? null };
  }

  await markAgentsamWebhookEventProcessed(env, ins.id);

  if (!extra.skipDispatch) {
    await dispatchWebhookRegistryWorkflow(env, ctx, {
      eventId: ins.id,
      provider: opts.provider,
      eventType: opts.eventType,
      payload:
        opts.payload ??
        (opts.payloadJson
          ? (() => {
              try {
                return JSON.parse(String(opts.payloadJson));
              } catch {
                return { _raw: String(opts.payloadJson).slice(0, 4000) };
              }
            })()
          : null),
      tenantId: opts.tenantId ?? null,
      workspaceId: opts.workspaceId ?? null,
    });
  }

  return { ok: true, id: ins.id, endpointId: ins.endpointId ?? null };
}
