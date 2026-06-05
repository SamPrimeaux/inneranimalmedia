import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import { cronTenantId } from '../cron-tenant.js';

const OVERNIGHT_EVERY_PAGE = ['overview', 'finance', 'chats', 'mcp', 'cloud', 'time-tracking', 'agent', 'billing', 'clients', 'tools', 'calendar', 'images', 'draw', 'meet', 'kanban', 'cms', 'mail', 'pipelines', 'onboarding', 'user-settings', 'settings'];

/** R2 key for the overnight Node script (full pipeline). Stored in bucket agent-sam; include in validate/start emails. */
const OVERNIGHT_SCRIPT_R2_KEY = 'scripts/overnight.js';

function arrayBufferToBase64(ab) {
  const u8 = new Uint8Array(ab);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function loadScreenshotAttachments(env, beforeDir) {
  const attachments = [];
  if (!env.ASSETS || !beforeDir) return attachments;
  for (const page of OVERNIGHT_EVERY_PAGE) {
    try {
      const obj = await env.ASSETS.get(`reports/screenshots/${beforeDir}/${page}.jpg`);
      if (obj && obj.body) {
        const ab = await new Response(obj.body).arrayBuffer();
        if (ab && ab.byteLength) attachments.push({ filename: page + '.jpg', content: arrayBufferToBase64(ab) });
      }
    } catch (_) { }
  }
  return attachments;
}

/** Cron every 30 min: send 30min, hourly, and morning progress emails when OVERNIGHT_STATUS is RUNNING. */
export async function runOvernightCronStep(env) {
  if (!env.DB || !env.RESEND_API_KEY) return;

  const begun = await startCronRun(env, {
    jobName: 'overnight_progress_step',
    cronExpression: '0 0 * * *',
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();

  const finish = async (metadata = {}) => {
    if (runId) await completeCronRun(env, runId, startedAt, { rowsRead: 0, rowsWritten: 0, metadata });
  };

  let row;
  try {
    row = await env.DB.prepare(
      `SELECT value FROM project_memory WHERE project_id = 'inneranimalmedia' AND key = 'OVERNIGHT_STATUS'`,
    ).first();
  } catch (_) {
    await finish({ skip: 'overnight_status_read_failed' });
    return;
  }
  if (!row || !row.value) {
    await finish({ skip: 'no_overnight_status_row' });
    return;
  }
  let status;
  try {
    status = JSON.parse(row.value);
  } catch (_) {
    await finish({ skip: 'overnight_status_json_invalid' });
    return;
  }
  if (status.status !== 'RUNNING') {
    await finish({ skip: 'not_running', status: status.status });
    return;
  }

  const _cronPmTid = cronTenantId(env);

  const now = new Date();
  const nowIso = now.toISOString();
  const startedMs = new Date(status.started || 0).getTime();
  const elapsedMin = (now.getTime() - startedMs) / (60 * 1000);

  // Check for user cancel
  try {
    const cancelRow = await env.DB.prepare(
      `SELECT value FROM project_memory WHERE project_id = 'inneranimalmedia' AND key = 'OVERNIGHT_USER_ACTION'`
    ).first();
    if (cancelRow && cancelRow.value) {
      const v = JSON.parse(cancelRow.value);
      if (v && v.cancel === true) {
        if (_cronPmTid) {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', ?, 'workflow', 'OVERNIGHT_STATUS', ?, 1.0, 1.0, 'agent_sam')`
          ).bind(_cronPmTid, JSON.stringify({ status: 'CANCELLED', at: nowIso })).run().catch(() => { });
        }
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: (typeof env.RESEND_FROM === 'string' && env.RESEND_FROM.trim()) ? env.RESEND_FROM.trim() : '',
            to: (typeof env.RESEND_TO === 'string' && env.RESEND_TO.trim()) ? env.RESEND_TO.trim() : '',
            subject: '🛑 Overnight Pipeline Cancelled',
            html: `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px"><h1 style="color:#f59e0b">Pipeline cancelled by user</h1><p>${nowIso}</p></div>`,
          }),
        }).catch(() => { });
        await finish({ cancelled: true });
        return;
      }
    }
  } catch (_) { }

  try {
  const beforeDir = status.before_dir || `before-${now.toISOString().slice(0, 10)}`;
  const phase = status.phase || 0;
  const last30 = status.last_30min_at ? new Date(status.last_30min_at).getTime() : 0;
  const lastHour = status.last_hour_at ? new Date(status.last_hour_at).getTime() : last30 || startedMs;
  const hourNum = status.hour_number || 0;

  // Phase 0: send 30min update after 30 min
  if (phase === 0 && elapsedMin >= 30) {
    const attachments = await loadScreenshotAttachments(env, beforeDir);
    const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 auto">
      <h1 style="color:#38bdf8">time 30min progress</h1>
      <p style="color:#64748b">${now.toLocaleString('en-US', { timeZone: 'America/Chicago', timeStyle: 'short' })}</p>
      <p style="color:#cbd5e1">Before screenshots (${attachments.length} attached). Patch/theme checks and hourly updates follow.</p>
    </div>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: (typeof env.RESEND_FROM === 'string' && env.RESEND_FROM.trim()) ? env.RESEND_FROM.trim() : '',
        to: (typeof env.RESEND_TO === 'string' && env.RESEND_TO.trim()) ? env.RESEND_TO.trim() : '',
        subject: 'time Overnight 30min update -- Inner Animal Media',
        html,
        attachments: attachments.length ? attachments : undefined
      }),
    }).catch(() => { });
    if (_cronPmTid) {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', ?, 'workflow', 'OVERNIGHT_STATUS', ?, 1.0, 1.0, 'agent_sam')`
      ).bind(_cronPmTid, JSON.stringify({ ...status, phase: 1, last_30min_at: nowIso, last_hour_at: nowIso, hour_number: 1 })).run().catch(() => { });
    }
    await finish({ phase: 0, email: '30min' });
    return;
  }

  // Phase >= 1: send hour N update every 60 min (cron runs every 30 so we check elapsed)
  if (phase >= 1 && (now.getTime() - lastHour) >= 60 * 60 * 1000) {
    const nextHour = hourNum + 1;
    if (nextHour > 5) {
      const attachments = await loadScreenshotAttachments(env, beforeDir);
      const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 auto">
        <h1 style="color:#38bdf8">dawn Morning report</h1>
        <p style="color:#64748b">${now.toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' })}</p>
        <p style="color:#22c55e">Pipeline complete. Before screenshots (${attachments.length} attached) in R2 reports/screenshots/${beforeDir}/</p>
      </div>`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: (typeof env.RESEND_FROM === 'string' && env.RESEND_FROM.trim()) ? env.RESEND_FROM.trim() : '',
          to: (typeof env.RESEND_TO === 'string' && env.RESEND_TO.trim()) ? env.RESEND_TO.trim() : '',
          subject: 'dawn Overnight morning report -- Inner Animal Media',
          html,
          attachments: attachments.length ? attachments : undefined
        }),
      }).catch(() => { });
      if (_cronPmTid) {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', ?, 'workflow', 'OVERNIGHT_STATUS', ?, 1.0, 1.0, 'agent_sam')`
        ).bind(_cronPmTid, JSON.stringify({ status: 'COMPLETE', completed: nowIso })).run().catch(() => { });
      }
      await finish({ pipeline: 'complete' });
      return;
    }
    const attachments = await loadScreenshotAttachments(env, beforeDir);
    const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 auto">
      <h1 style="color:#38bdf8">alert Hour ${nextHour} update</h1>
      <p style="color:#64748b">${now.toLocaleString('en-US', { timeZone: 'America/Chicago', timeStyle: 'short' })}</p>
      <p style="color:#cbd5e1">Progress update. Screenshots (${attachments.length} attached).</p>
    </div>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: (typeof env.RESEND_FROM === 'string' && env.RESEND_FROM.trim()) ? env.RESEND_FROM.trim() : '',
        to: (typeof env.RESEND_TO === 'string' && env.RESEND_TO.trim()) ? env.RESEND_TO.trim() : '',
        subject: `alert Overnight Hour ${nextHour} -- Inner Animal Media`,
        html,
        attachments: attachments.length ? attachments : undefined
      }),
    }).catch(() => { });
    if (_cronPmTid) {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', ?, 'workflow', 'OVERNIGHT_STATUS', ?, 1.0, 1.0, 'agent_sam')`
      ).bind(_cronPmTid, JSON.stringify({ ...status, last_hour_at: nowIso, hour_number: nextHour })).run().catch(() => { });
    }
    await finish({ hour_update: nextHour });
    return;
  }

  await finish({ idle: true, phase, elapsedMin });
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[overnight-progress]', e?.message ?? e);
  }
}
