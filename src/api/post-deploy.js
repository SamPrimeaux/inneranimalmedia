/**
 * API Handler: POST /api/internal/post-deploy
 *
 * Called after a successful worker deployment (e.g. promote-to-prod / CI).
 * Syncs Agent Sam's knowledge context cache
 * in KV so the AI has fresh awareness of the codebase state.
 *
 * Auth (any one): X-Ingest-Secret (INGEST_SECRET), X-Internal-Secret or Bearer INTERNAL_API_SECRET,
 *                 or Bearer AGENTSAM_BRIDGE_KEY (same key as MCP bridge).
 * Response: { ok: true, keys_written: N, environment: string }
 */

import { isIngestSecretAuthorized, verifyInternalApiSecret, jsonResponse } from '../core/auth.js';

function isPostDeployAuthorized(request, env) {
  if (isIngestSecretAuthorized(request, env)) return true;
  if (verifyInternalApiSecret(request, env)) return true;
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const bridge = env?.AGENTSAM_BRIDGE_KEY != null ? String(env.AGENTSAM_BRIDGE_KEY).trim() : '';
  if (bridge && bearer === bridge) return true;
  return false;
}

/**
 * Main handler — registered in src/index.js as:
 *   POST /api/internal/post-deploy → handlePostDeploy(request, env, ctx)
 */
export async function handlePostDeploy(request, env, ctx) {
  // ── Auth gate ────────────────────────────────────────────────────────────────
  if (!isPostDeployAuthorized(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const environment   = body.environment   || 'production';
  const gitHash       = body.git_hash      || body.gitHash || 'unknown';
  const version       = body.version       || body.dashboard_version || 'unknown';
  const workerVersion = body.worker_version_id || 'unknown';

  if (!env.KV) {
    return jsonResponse({ ok: false, error: 'KV not bound' }, 503);
  }

  // ── Knowledge context sync ───────────────────────────────────────────────────
  // Writes a lightweight deploy-context blob into KV so Agent Sam can answer
  // "what version am I on?" and "when was the last deploy?".
  const now = new Date().toISOString();
  const keysToWrite = [
    {
      key: `agent_sam:deploy:latest:${environment}`,
      value: JSON.stringify({
        environment,
        git_hash:         gitHash,
        version,
        worker_version_id: workerVersion,
        deployed_at:      now,
      }),
      ttl: 60 * 60 * 24 * 30, // 30 days
    },
    {
      key: `agent_sam:deploy:last_success`,
      value: JSON.stringify({
        environment,
        version,
        deployed_at: now,
        git_hash:    gitHash,
      }),
      ttl: 60 * 60 * 24 * 30,
    },
  ];

  let keysWritten = 0;
  const errors = [];

  await Promise.all(keysToWrite.map(async ({ key, value, ttl }) => {
    try {
      await env.KV.put(key, value, { expirationTtl: ttl });
      keysWritten++;
    } catch (e) {
      errors.push(`${key}: ${e?.message}`);
      console.warn('[post-deploy] KV write failed', key, e?.message);
    }
  }));

  // ── Optional D1 audit log ────────────────────────────────────────────────────
  if (env.DB) {
    ctx.waitUntil(
      env.DB.prepare(
        `INSERT OR IGNORE INTO cicd_events
           (source, event_type, git_commit_sha, raw_payload_json)
         VALUES ('post-deploy-handler', 'knowledge_sync', ?, ?)`
      )
      .bind(gitHash, JSON.stringify({ environment, version, keys_written: keysWritten, synced_at: now }))
      .run()
      .catch(() => {})
    );
  }

  return jsonResponse({
    ok:           keysWritten > 0 || errors.length === 0,
    keys_written: keysWritten,
    environment,
    version,
    synced_at:    now,
    errors:       errors.length > 0 ? errors : undefined,
  });
}
