/**
 * API Handler: POST /api/internal/post-deploy
 *
 * Called after a successful worker deployment (e.g. promote-to-prod / CI / deploy-frontend.sh).
 * Syncs Agent Sam deploy markers in KV and runs workspace-scoped agentsam_hook rows for post_deploy
 * (see fireAgentHooks in hook-dispatcher.js → agentsam_hook_execution).
 *
 * Auth (any one): X-Ingest-Secret (INGEST_SECRET), X-Internal-Secret or Bearer INTERNAL_API_SECRET,
 *                 or Bearer AGENTSAM_BRIDGE_KEY (same key as MCP bridge).
 * Response: { ok: true, keys_written: N, environment: string }
 *
 * Deployments ledger SSOT: scripts/post-deploy-record.sh only.
 * This handler must NOT INSERT skinny deployments rows (empty changed_files / tenant / run_group).
 */

import { isIngestSecretAuthorized, verifyInternalApiSecret, jsonResponse } from '../core/auth.js';
import { fireAgentHooks } from '../core/hook-dispatcher.js';
import { PLATFORM_WORKSPACE_ID } from '../core/platform-operator-policy.js';
import { getPlatformWorkspaceEnvId } from '../core/platform-workspace-env.js';
import {
  resolvePlatformD1AuthUserId,
  resolvePlatformSupabaseWorkspaceUuid,
} from '../core/platform-identity-constants.js';
import { scheduleMirrorDeployEventToSupabase } from '../core/hyperdrive-write.js';
import { upsertDeployMemoryFacts } from '../core/deploy-memory-fact.js';

function isPostDeployAuthorized(request, env) {
  if (isIngestSecretAuthorized(request, env)) return true;
  if (verifyInternalApiSecret(request, env)) return true;
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const bridge = env?.AGENTSAM_BRIDGE_KEY != null ? String(env.AGENTSAM_BRIDGE_KEY).trim() : '';
  if (bridge && bearer === bridge) return true;
  return false;
}

const PRODUCTION_WORKER_NAME = 'inneranimalmedia';

/**
 * Optionally refresh github_repositories.default_branch — never writes deployments.
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
async function syncGithubDefaultBranch(db, branchName) {
  if (!branchName) return;
  await db
    .prepare(
      `UPDATE github_repositories SET default_branch = ?
       WHERE cloudflare_worker_name = ?`,
    )
    .bind(branchName, PRODUCTION_WORKER_NAME)
    .run()
    .catch(() => {});
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
  try {
    body = await request.json();
  } catch (_) {}

  const environment = body.environment || 'production';
  const gitHash = body.git_hash || body.gitHash || 'unknown';
  const version = body.version || body.dashboard_version || 'unknown';
  const workerVersion = body.worker_version_id || 'unknown';
  const deployDurationMs =
    typeof body.deploy_duration_ms === 'number' && Number.isFinite(body.deploy_duration_ms)
      ? body.deploy_duration_ms
      : undefined;
  const branchName =
    typeof body.branch_name === 'string' && body.branch_name.trim()
      ? body.branch_name.trim()
      : typeof body.branch === 'string' && body.branch.trim()
        ? body.branch.trim()
        : null;
  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : typeof body.git_message === 'string' && body.git_message.trim()
        ? body.git_message.trim()
        : null;
  const deployedBy =
    typeof body.deployed_by === 'string' && body.deployed_by.trim()
      ? body.deployed_by.trim()
      : typeof body.user_id === 'string' && body.user_id.trim()
        ? body.user_id.trim()
        : 'deploy:full';

  if (!env.KV) {
    return jsonResponse({ ok: false, error: 'KV not bound' }, 503);
  }

  // ── Knowledge context sync ───────────────────────────────────────────────────
  const now = new Date().toISOString();
  const keysToWrite = [
    {
      key: `agent_sam:deploy:latest:${environment}`,
      value: JSON.stringify({
        environment,
        git_hash: gitHash,
        version,
        worker_version_id: workerVersion,
        deployed_at: now,
      }),
      ttl: 60 * 60 * 24 * 30,
    },
    {
      key: `agent_sam:deploy:last_success`,
      value: JSON.stringify({
        environment,
        version,
        deployed_at: now,
        git_hash: gitHash,
      }),
      ttl: 60 * 60 * 24 * 30,
    },
  ];

  let keysWritten = 0;
  const errors = [];

  await Promise.all(
    keysToWrite.map(async ({ key, value, ttl }) => {
      try {
        await env.KV.put(key, value, { expirationTtl: ttl });
        keysWritten++;
      } catch (e) {
        errors.push(`${key}: ${e?.message}`);
        console.warn('[post-deploy] KV write failed', key, e?.message);
      }
    }),
  );

  // ── D1 side effects (never skinny deployments INSERT) ────────────────────────
  if (env.DB) {
    ctx.waitUntil(
      syncGithubDefaultBranch(env.DB, branchName).catch((e) =>
        console.warn('[post-deploy] github branch sync failed', e?.message || e),
      ),
    );

    ctx.waitUntil(
      upsertDeployMemoryFacts(
        env.DB,
        env,
        {
          tenantId: String(body.tenant_id ?? body.tenantId ?? '').trim(),
          workspaceId: String(body.workspace_id ?? body.d1_workspace_id ?? '').trim(),
          userId: String(body.user_id ?? '').trim(),
          shortSha: version,
          gitHash,
          environment,
          branchName,
          description,
          deployedAt: now,
          workerVersionId: workerVersion,
          deployDurationMs,
          deployedBy,
        },
        body,
      ).catch((e) => console.warn('[post-deploy] deploy memory fact failed', e?.message || e)),
    );

    ctx.waitUntil(
      env.DB.prepare(
        `INSERT OR IGNORE INTO cicd_events
           (source, event_type, git_commit_sha, raw_payload_json)
         VALUES ('post-deploy-handler', 'knowledge_sync', ?, ?)`,
      )
        .bind(gitHash, JSON.stringify({ environment, version, keys_written: keysWritten, synced_at: now }))
        .run()
        .catch(() => {}),
    );

    const workspaceId =
      typeof body.workspace_id === 'string' && body.workspace_id.trim()
        ? body.workspace_id.trim()
        : getPlatformWorkspaceEnvId(env) || PLATFORM_WORKSPACE_ID;
    const operatorUserId =
      (typeof body.user_id === 'string' && body.user_id.trim()) || resolvePlatformD1AuthUserId(env);

    const hookPayload = {
      environment,
      git_hash: gitHash,
      dashboard_version: version,
      worker_version_id: workerVersion,
      workspace_id: workspaceId,
      user_id: operatorUserId,
      supabase_workspace_id: resolvePlatformSupabaseWorkspaceUuid(env),
      ms_wall: deployDurationMs,
      health_status: body.health_status,
      health_ms: body.health_ms,
    };
    ctx.waitUntil(
      fireAgentHooks(env, ctx, 'post_deploy', hookPayload).catch((e) =>
        console.warn('[post-deploy] fireAgentHooks post_deploy', e?.message || e),
      ),
    );

    const gitShort = gitHash !== 'unknown' ? String(gitHash).slice(0, 7) : version;
    ctx.waitUntil(
      (async () => {
        const { broadcastWebPushToActiveSubscriptions } = await import('../core/web-push.js');
        return broadcastWebPushToActiveSubscriptions(env, {
          title: 'Deploy complete',
          body: `IAM production deploy ${gitShort} is live`,
          url: '/dashboard/agent',
          tag: `deploy-${gitShort}`,
        });
      })().catch((e) => console.warn('[post-deploy] web push broadcast', e?.message || e)),
    );

    if (workspaceId) {
      const {
        resolvePlatformSupabaseUserId,
        resolvePlatformD1AuthUserId: resolveD1User,
        resolvePlatformSupabaseWorkspaceUuid: resolveSupaWs,
      } = await import('../core/platform-identity-constants.js');
      scheduleMirrorDeployEventToSupabase(env, ctx, {
        workspace_id: workspaceId,
        user_id: resolvePlatformSupabaseUserId(env),
        d1_user_id: resolveD1User(env),
        worker_name: 'inneranimalmedia',
        worker_version: workerVersion,
        deploy_status: 'success',
        commit_sha: gitHash,
        notes: `post-deploy ${environment} v${version}`,
        metadata: {
          environment,
          git_hash: gitHash,
          dashboard_version: version,
          keys_written: keysWritten,
          sync_source: 'post-deploy-handler',
          d1_user_id: resolveD1User(env),
          d1_workspace_id: workspaceId,
          supabase_workspace_id: resolveSupaWs(env),
        },
        created_at: now,
      });
    }
  }

  return jsonResponse({
    ok: keysWritten > 0 || errors.length === 0,
    keys_written: keysWritten,
    environment,
    version,
    synced_at: now,
    // Ledger truth lives in post-deploy-record.sh — this endpoint does not mint deployments rows.
    deployments_ledger: 'post_deploy_record_ssot',
    errors: errors.length > 0 ? errors : undefined,
  });
}
