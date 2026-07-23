/**
 * WAE error spike check — queries Workers Analytics Engine for the last 20 minutes,
 * fires sendPhoneLoopCompletion (push + email) if error rate exceeds threshold.
 *
 * Real data from CF's telemetry layer — not self-reported by the app.
 * Deduplicates via KV so you get at most one alert per 15-minute window.
 */
import { sendPhoneLoopCompletion } from '../../core/email-agent-bridge.js';

const ACCOUNT_ID = 'ede6590ac0d2fb7daf155b35653457b2';
const WAE_SQL_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql`;

// Alert thresholds
const ERROR_5XX_THRESHOLD = 10;     // >10 5xx errors in 20 min = alert
const ERROR_RATE_THRESHOLD = 0.20;  // >20% of requests erroring = alert

/**
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function runWaeErrorSpikeCheck(env, ctx) {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.warn('[wae-spike] CLOUDFLARE_API_TOKEN not set — skipping');
    return { skipped: true, reason: 'no_token' };
  }

  // Dedupe: at most one alert per 15-minute window
  const windowKey = Math.floor(Date.now() / (15 * 60 * 1000));
  const dedupeKey = `wae_spike_notified:${windowKey}`;
  const already = await env.KV?.get(dedupeKey).catch(() => null);
  if (already) {
    console.log('[wae-spike] already notified this window — skipping');
    return { skipped: true, reason: 'dedupe' };
  }

  // Query WAE: error counts by path in last 20 minutes
  const sql = `
    SELECT
      blob1 AS worker,
      blob3 AS path,
      SUM(_sample_interval) AS total_requests,
      SUM(IF(double1 >= 500, _sample_interval, 0)) AS error_5xx,
      SUM(IF(double1 >= 400, _sample_interval, 0)) AS error_4xx
    FROM inneranimalmedia
    WHERE timestamp >= NOW() - INTERVAL '20' MINUTE
      AND index1 = 'worker_error'
    GROUP BY blob1, blob3
    ORDER BY error_5xx DESC
    LIMIT 20
  `;

  let rows = [];
  try {
    const res = await fetch(WAE_SQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
      console.warn('[wae-spike] WAE query HTTP', res.status, await res.text().catch(() => ''));
      return { ok: false, reason: `wae_http_${res.status}` };
    }
    const json = await res.json();
    rows = json?.data ?? [];
  } catch (e) {
    console.warn('[wae-spike] query failed', e?.message ?? e);
    return { ok: false, reason: 'fetch_error', error: e?.message };
  }

  if (!rows.length) {
    console.log('[wae-spike] no error rows in window — all clear');
    return { ok: true, spiking: false, totalErrors5xx: 0 };
  }

  // Aggregate totals
  const totalErrors5xx = rows.reduce((n, r) => n + Number(r.error_5xx || 0), 0);
  const totalErrors4xx = rows.reduce((n, r) => n + Number(r.error_4xx || 0), 0);
  const totalRequests = rows.reduce((n, r) => n + Number(r.total_requests || 0), 0);
  const errorRate = totalRequests > 0 ? totalErrors5xx / totalRequests : 0;

  console.log(`[wae-spike] 5xx=${totalErrors5xx} 4xx=${totalErrors4xx} total=${totalRequests} rate=${(errorRate * 100).toFixed(1)}%`);

  const spiking = totalErrors5xx > ERROR_5XX_THRESHOLD || errorRate > ERROR_RATE_THRESHOLD;
  if (!spiking) {
    return { ok: true, spiking: false, totalErrors5xx, totalRequests, errorRate };
  }

  // Top failing paths
  const topPaths = rows
    .filter((r) => Number(r.error_5xx) > 0)
    .slice(0, 5)
    .map((r) => `  ${r.path || '(unknown)'} → ${r.error_5xx} 5xx`)
    .join('\n');

  // Mark notified in KV before firing so concurrent cron ticks don't double-send
  await env.KV?.put(dedupeKey, '1', { expirationTtl: 15 * 60 }).catch(() => null);

  // Fire push + email via existing phone loop infrastructure
  const conversationId = crypto.randomUUID();
  const subject = `[Agent Sam] ⚠️ Error spike — ${totalErrors5xx} 5xx in last 20min`;
  const body = [
    `Worker error spike detected on inneranimalmedia.`,
    ``,
    `5xx errors:     ${totalErrors5xx}`,
    `4xx errors:     ${totalErrors4xx}`,
    `Total requests: ${totalRequests}`,
    `Error rate:     ${(errorRate * 100).toFixed(1)}%`,
    ``,
    `Top failing paths:`,
    topPaths || `  (no paths isolated)`,
    ``,
    `→ https://dash.cloudflare.com/${ACCOUNT_ID}/workers/analytics`,
  ].join('\n');

  await sendPhoneLoopCompletion(env, ctx, {
    conversationId,
    subject,
    body,
    pushTitle: `⚠️ ${totalErrors5xx} Worker 5xx errors`,
    pushBody: `${(errorRate * 100).toFixed(0)}% error rate last 20min — tap to investigate`,
  }).catch((e) => console.warn('[wae-spike] sendPhoneLoopCompletion failed', e?.message ?? e));

  // Write to agentsam_error_log so it lands in the audit trail
  await env.DB?.prepare(`
    INSERT INTO agentsam_error_log
      (id, workspace_id, tenant_id, error_code, error_type, error_message, source, context_json, resolved, created_at)
    VALUES (?, 'ws_inneranimalmedia', 'tenant_sam_primeaux', 'wae_error_spike', 'critical', ?, 'wae_cron', ?, 0, unixepoch())
  `).bind(
    `aerr_wae_${Date.now()}`,
    `${totalErrors5xx} 5xx errors in 20min window (rate: ${(errorRate * 100).toFixed(1)}%)`,
    JSON.stringify({ totalErrors5xx, totalErrors4xx, totalRequests, errorRate, topPaths }),
  ).run().catch((e) => console.warn('[wae-spike] error_log insert failed', e?.message ?? e));

  return { ok: true, spiking: true, totalErrors5xx, totalErrors4xx, totalRequests, errorRate };
}
