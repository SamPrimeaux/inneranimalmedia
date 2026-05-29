/**
 * After agentsam_webhook_events insert — trigger registry workflow_key when configured.
 */
import { pragmaTableInfo } from './retention.js';
import { executeWorkflowGraph } from './workflow-executor.js';

const DISPATCH_PROVIDERS = new Set(['github', 'cloudflare', 'cursor', 'supabase']);

/**
 * @param {any} env
 * @param {any} [ctx]
 * @param {{
 *   eventId: string,
 *   provider: string,
 *   eventType: string,
 *   payload?: unknown,
 *   tenantId?: string | null,
 *   workspaceId?: string | null,
 * }} opts
 */
export async function dispatchWebhookRegistryWorkflow(env, ctx, opts) {
  if (!env?.DB) return { ok: false, reason: 'no_db' };
  const provider = String(opts.provider || '').trim().toLowerCase();
  const eventType = String(opts.eventType || '').trim();
  const eventId = String(opts.eventId || '').trim();
  if (!provider || !eventId) return { ok: false, reason: 'missing_ids' };

  if (!DISPATCH_PROVIDERS.has(provider)) {
    return { ok: false, reason: 'provider_not_dispatch_enabled' };
  }

  const githubDispatch =
    provider === 'github' &&
    ['push', 'pull_request', 'check_suite', 'check_run', 'workflow_run'].includes(eventType);
  const cfDispatch =
    provider === 'cloudflare' &&
    (eventType.includes('build') || eventType.includes('deploy') || eventType.includes('success'));
  const cursorDispatch =
    provider === 'cursor' &&
    ['agent_finish', 'commit', 'deploy', 'review_complete', 'status_change'].includes(eventType);
  if (!githubDispatch && !cfDispatch && !cursorDispatch && provider !== 'supabase') {
    return { ok: false, reason: 'event_type_skipped' };
  }

  let workflowKey = null;
  let endpointRow = null;
  try {
    endpointRow = await env.DB.prepare(
      `SELECT id, workflow_key, tenant_id, workspace_id
       FROM agentsam_webhooks
       WHERE provider = ? AND is_active = 1
         AND workflow_key IS NOT NULL AND TRIM(workflow_key) != ''
       ORDER BY rowid ASC LIMIT 1`,
    )
      .bind(provider)
      .first();
    workflowKey =
      endpointRow?.workflow_key != null ? String(endpointRow.workflow_key).trim() : null;
  } catch (e) {
    console.warn('[webhook-workflow] registry lookup', e?.message ?? e);
    return { ok: false, reason: 'registry_lookup_failed' };
  }

  if (!workflowKey) return { ok: false, reason: 'no_workflow_key' };

  const wf = await env.DB.prepare(
    `SELECT workflow_key FROM agentsam_workflows
     WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
  )
    .bind(workflowKey)
    .first()
    .catch(() => null);
  if (!wf?.workflow_key) {
    return { ok: false, reason: 'workflow_not_found', workflow_key: workflowKey };
  }

  const tenantId =
    opts.tenantId != null && String(opts.tenantId).trim() !== ''
      ? String(opts.tenantId).trim()
      : endpointRow?.tenant_id != null
        ? String(endpointRow.tenant_id).trim()
        : env.TENANT_ID != null
          ? String(env.TENANT_ID).trim()
          : null;
  const workspaceId =
    opts.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : endpointRow?.workspace_id != null
        ? String(endpointRow.workspace_id).trim()
        : null;

  const run = async () => {
    try {
      const out = await executeWorkflowGraph(env, {
        workflowKey,
        input: {
          webhook_event_id: eventId,
          provider,
          event_type: eventType,
          payload: opts.payload ?? null,
        },
        tenantId,
        workspaceId,
        userId: null,
        triggerType: 'webhook',
      });
      const workflowRunId =
        out?.workflow_run_id ?? out?.runId ?? out?.run_id ?? out?.id ?? null;
      if (workflowRunId) {
        const cols = await pragmaTableInfo(env.DB, 'agentsam_webhook_events');
        if (cols.has('workflow_run_id')) {
          await env.DB.prepare(
            `UPDATE agentsam_webhook_events SET workflow_run_id = ? WHERE id = ?`,
          )
            .bind(String(workflowRunId), eventId)
            .run()
            .catch(() => {});
        }
        if (cols.has('metadata_json')) {
          const prev = await env.DB.prepare(
            `SELECT metadata_json FROM agentsam_webhook_events WHERE id = ? LIMIT 1`,
          )
            .bind(eventId)
            .first()
            .catch(() => null);
          let meta = {};
          try {
            meta = JSON.parse(String(prev?.metadata_json || '{}'));
          } catch {
            meta = {};
          }
          meta.workflow_run_id = String(workflowRunId);
          meta.workflow_triggered = 1;
          await env.DB.prepare(
            `UPDATE agentsam_webhook_events SET metadata_json = ? WHERE id = ?`,
          )
            .bind(JSON.stringify(meta).slice(0, 8000), eventId)
            .run()
            .catch(() => {});
        }
      }
      return { ok: true, workflow_key: workflowKey, workflow_run_id: workflowRunId };
    } catch (e) {
      console.warn('[webhook-workflow] execute', workflowKey, e?.message ?? e);
      return { ok: false, reason: String(e?.message || e), workflow_key: workflowKey };
    }
  };

  if (ctx?.waitUntil) {
    ctx.waitUntil(run().catch(() => {}));
    return { ok: true, scheduled: true, workflow_key: workflowKey };
  }
  return run();
}
