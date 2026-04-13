/**
 * API Layer: POST /api/internal/post-deploy
 * Called by deploy-sandbox.sh and promote-to-prod.sh after successful deployment.
 * Syncs Agent Sam's KV knowledge context and writes a D1 cicd_events audit row.
 *
 * Auth: X-Internal-Secret (INTERNAL_API_SECRET)
 */
import { jsonResponse }             from '../core/responses.js';
import { isIngestSecretAuthorized } from '../core/auth.js';

export async function handlePostDeployApi(request, env, ctx) {
  if (!isIngestSecretAuthorized(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const environment   = body.environment                        || 'sandbox';
  const gitHash       = body.git_hash || body.gitHash           || 'unknown';
  const version       = body.version  || body.dashboard_version || 'unknown';
  const workerVersion = body.worker_version_id                  || 'unknown';

  if (!env.KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 503);

  const now         = new Date().toISOString();
  const keysToWrite = [
    {
      key:   `agent_sam:deploy:latest:${environment}`,
      value: JSON.stringify({ environment, git_hash: gitHash, version, worker_version_id: workerVersion, deployed_at: now }),
      ttl:   60 * 60 * 24 * 30,
    },
    {
      key:   `agent_sam:deploy:last_success`,
      value: JSON.stringify({ environment, version, deployed_at: now, git_hash: gitHash }),
      ttl:   60 * 60 * 24 * 30,
    },
  ];

  let keysWritten = 0;
  const errors    = [];

  await Promise.all(keysToWrite.map(async ({ key, value, ttl }) => {
    try {
      await env.KV.put(key, value, { expirationTtl: ttl });
      keysWritten++;
    } catch (e) {
      errors.push(`${key}: ${e?.message}`);
      console.warn('[post-deploy] KV write failed', key, e?.message);
    }
  }));

  if (env.DB) {
    ctx.waitUntil(
      env.DB.prepare(
        `INSERT OR IGNORE INTO cicd_events
         (source, event_type, git_commit_sha, raw_payload_json)
         VALUES ('post-deploy-handler', 'knowledge_sync', ?, ?)`
      ).bind(
        gitHash,
        JSON.stringify({ environment, version, keys_written: keysWritten, synced_at: now })
      ).run().catch(() => {})
    );
  }

  return jsonResponse({
    ok:           keysWritten > 0 || errors.length === 0,
    keys_written: keysWritten,
    environment,
    version,
    synced_at:    now,
    errors:       errors.length ? errors : undefined,
  });
}
