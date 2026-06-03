/**
 * Canonical webhook ingest: D1 audit row + optional registry workflow dispatch.
 */
import {
  insertAgentsamWebhookEvent,
  markAgentsamWebhookEventProcessed,
  resolveWebhookInsertScope,
} from './webhook-events-writer.js';
import { dispatchWebhookRegistryWorkflow } from './webhook-workflow-dispatch.js';

/**
 * @param {any} env
 * @param {any} [ctx]
 * @param {Parameters<typeof insertAgentsamWebhookEvent>[1]} opts
 * @param {{ skipDispatch?: boolean }} [extra]
 */
export async function ingestWebhookEventAndDispatch(env, ctx, opts, extra = {}) {
  const scope = await resolveWebhookInsertScope(env, opts);
  const merged = {
    ...opts,
    tenantId: scope.tenantId ?? opts.tenantId ?? null,
    workspaceId: scope.workspaceId ?? opts.workspaceId ?? null,
  };
  const ins = await insertAgentsamWebhookEvent(env, merged);
  if (!ins?.ok || !ins?.id) {
    return { ok: false, reason: ins?.reason ?? 'insert_failed', id: ins?.id ?? null };
  }

  await markAgentsamWebhookEventProcessed(env, ins.id);

  if (!extra.skipDispatch) {
    await dispatchWebhookRegistryWorkflow(env, ctx, {
      eventId: ins.id,
      provider: merged.provider,
      eventType: merged.eventType,
      payload:
        merged.payload ??
        (merged.payloadJson
          ? (() => {
              try {
                return JSON.parse(String(merged.payloadJson));
              } catch {
                return { _raw: String(merged.payloadJson).slice(0, 4000) };
              }
            })()
          : null),
      tenantId: merged.tenantId ?? null,
      workspaceId: merged.workspaceId ?? null,
    });
  }

  return { ok: true, id: ins.id, endpointId: ins.endpointId ?? null };
}
