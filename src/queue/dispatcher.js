/**
 * Routes Cloudflare Queue messages by payload shape (legacy worker.js parity).
 */
import { handleCodebaseIndexSyncFromQueue } from './codebase-index-sync.js';
import { deleteVectorsForDocKey, performDocsBucketVectorizeIndex } from './docs-vectorize.js';
import { handlePlaywrightQueueJob } from './playwright-queue-job.js';

function normalizeQueueBody(msg) {
  if (!msg?.body) return {};
  if (typeof msg.body === 'object') return msg.body;
  if (typeof msg.body === 'string') {
    try {
      return JSON.parse(msg.body || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function recordWebhookEvent(env, tenantId, workspaceId, body) {
  if (!env?.DB || !tenantId || !workspaceId) return;
  env.DB.prepare(`
      INSERT INTO agentsam_webhook_events
        (id, tenant_id, provider, event_type, payload_json, status, processed_at)
      VALUES
        ('whe_'||lower(hex(randomblob(8))), ?, 'my_queue', ?, ?, 'received', datetime('now'))
    `)
    .bind(
      tenantId,
      body?.type ?? 'unknown',
      JSON.stringify({
        ...(typeof body === 'object' && body ? body : {}),
        workspace_id: workspaceId,
      }),
    )
    .run()
    .catch(() => {});
}

/**
 * Handle iam-docs R2 Put/Delete → Vectorize (worker.js queue branch).
 * @param {any} env
 * @param {Record<string, unknown>} body
 */
async function handleIamDocsMdEvent(env, body) {
  const r2SourceOk = body.source === 'r2' || body.source == null || body.source === undefined;
  const objectKey = body.object && typeof body.object.key === 'string' ? body.object.key : null;
  const bucketName = body.bucket;
  const action = body.action;
  if (!r2SourceOk || bucketName !== 'iam-docs' || !objectKey) return false;
  if (!objectKey.endsWith('.md')) return true;

  const putActions = new Set(['PutObject', 'CopyObject', 'CompleteMultipartUpload']);
  const delActions = new Set(['DeleteObject', 'LifecycleDeletion']);
  try {
    if (putActions.has(action)) {
      if (!objectKey.startsWith('screenshots/') && !objectKey.includes('/screenshots/')) {
        await performDocsBucketVectorizeIndex(env, objectKey);
      }
    } else if (delActions.has(action)) {
      await deleteVectorsForDocKey(env, objectKey);
      if (env.DB) {
        await env.DB.prepare(`UPDATE docs_index_log SET deleted_at = datetime('now'), status = 'deleted' WHERE key = ?`)
          .bind(objectKey)
          .run()
          .catch(() => {});
      }
    }
  } catch (e) {
    console.warn('[queue iam-docs]', e?.message ?? e);
  }
  return true;
}

function isPlaywrightJobBody(body) {
  const jobId = body?.jobId;
  const jt = body?.job_type;
  return !!(jobId && (jt === 'screenshot' || jt === 'render'));
}

/**
 * @param {any} env
 * @param {ExecutionContext} ctx
 * @param {import('@cloudflare/workers-types').Message} queueMsg
 * @returns {Promise<{ handled: boolean, kind: string }>}
 */
export async function dispatchQueueMessage(env, ctx, queueMsg) {
  const body = normalizeQueueBody(queueMsg);

  let tenantId = body.tenantId ?? body.tenant_id;
  let workspaceId = body.workspaceId ?? body.workspace_id;
  const isCfSystem = typeof body.type === 'string' && body.type.startsWith('cf.workers');
  if (isCfSystem) {
    tenantId = 'tenant_sam_primeaux';
    workspaceId = 'ws_inneranimalmedia';
  }

  if (body.type === 'codebase_index_sync') {
    if (!tenantId || !workspaceId) {
      console.warn('[queue] missing tenantId/workspaceId for codebase_index_sync');
      return { handled: true, kind: 'codebase_index_sync_skipped' };
    }
    await handleCodebaseIndexSyncFromQueue(env, body, ctx);
    recordWebhookEvent(env, tenantId, workspaceId, body);
    return { handled: true, kind: 'codebase_index_sync' };
  }

  const r2SourceOk = body.source === 'r2' || body.source == null || body.source === undefined;
  const bucketName = body.bucket;
  const objectKey = body.object && typeof body.object.key === 'string' ? body.object.key : null;
  if (r2SourceOk && bucketName === 'iam-docs' && objectKey) {
    await handleIamDocsMdEvent(env, body);
    return { handled: true, kind: 'r2_iam_docs_md' };
  }

  if (isPlaywrightJobBody(body)) {
    try {
      await handlePlaywrightQueueJob(env, body);
    } catch (e) {
      console.warn('[queue playwright]', e?.message ?? e);
    }
    return { handled: true, kind: 'playwright_job' };
  }

  if (tenantId && workspaceId) {
    recordWebhookEvent(env, tenantId, workspaceId, body);
  }

  const kind = typeof body.type === 'string' ? body.type : 'unknown';
  console.warn('[queue] unhandled_message_type', kind, JSON.stringify(body).slice(0, 500));
  return { handled: false, kind };
}
