// Handles all CICD lifecycle events and fans out to correct D1 tables.
import { fallbackSystemTenantId } from '../core/auth.js';
// Tables written per event:
//   post_promote  → deployments, deployment_health_checks, deployment_changes,
//                   tracking_metrics, ai_workflow_executions, project_storage
//   post_sandbox  → deployments, tracking_metrics, project_storage
//   pre_deploy    → (read only — runs agentsam_hook pre_deploy commands)
//   error         → (runs agentsam_hook error_diagnose commands)
//   session_start → project_time_entries (open entry), project_memory read

export async function handleCicdEvent(request, env, ctx) {
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_API_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { event, payload } = await request.json();

  // Fan out based on event type
  switch (event) {
    case 'post_promote':
      return await handlePostPromote(payload, env);
    case 'post_sandbox':
      return await handlePostSandbox(payload, env);
    case 'session_start':
      return await handleSessionStart(payload, env);
    case 'session_end':
      return await handleSessionEnd(payload, env);
    default:
      return Response.json({ error: `Unknown event: ${event}` }, { status: 400 });
  }
}

async function handlePostPromote(p, env) {
  const db = env.DB;
  const ts = Math.floor(Date.now() / 1000);

  // 1. deployments
  await db.prepare(`
    INSERT OR IGNORE INTO deployments
      (id, timestamp, status, deployed_by, environment, worker_name,
       triggered_by, git_hash, version, deploy_duration_ms, created_at)
    VALUES (?, datetime('now'), 'success', 'sam_primeaux', 'production',
            'inneranimalmedia', ?, ?, ?, ?, datetime('now'))
  `).bind(p.worker_version_id, p.triggered_by, p.git_hash,
          p.dashboard_version, p.ms_worker).run();

  // 2. deployment_health_checks
  await db.prepare(`
    INSERT INTO deployment_health_checks
      (deployment_id, check_type, check_url, status_code, status,
       response_time_ms, checked_at)
    VALUES (?, 'http', ?, ?, ?, ?, datetime('now'))
  `).bind(p.worker_version_id, 'https://inneranimalmedia.com/dashboard/agent',
          p.health_status, parseInt(p.health_status) >= 200 &&
          parseInt(p.health_status) < 300 ? 'healthy' : 'degraded',
          p.health_ms).run();

  // 3. tracking_metrics (batch)
  const metrics = [
    ['r2_files_uploaded', 'r2', p.r2_files, 'files'],
    ['r2_bytes_uploaded', 'r2', p.r2_bytes, 'bytes'],
    ['worker_deploy_ms', 'deploy', p.ms_worker, 'ms'],
    ['r2_push_ms', 'deploy', p.ms_push, 'ms'],
    ['r2_pull_ms', 'deploy', p.ms_pull, 'ms'],
    ['health_check_code', 'quality', parseInt(p.health_status) || 0, 'count'],
  ];
  const stmt = db.prepare(`
    INSERT INTO tracking_metrics
      (id, metric_name, metric_type, metric_value, metric_unit,
       environment, source, commit_sha, worker_version, recorded_at)
    VALUES (?, ?, ?, ?, ?, 'production', 'promote_to_prod', ?, ?, ?)
  `);
  await db.batch(metrics.map(([name, type, val, unit]) =>
    stmt.bind(`tm-${p.worker_version_id}-${name}`, name, type, val, unit,
              p.git_hash, p.worker_version_id, ts)
  ));

  // 4. deployment_changes (batch)
  if (p.changes && Array.isArray(p.changes) && p.changes.length > 0) {
    const chgStmt = db.prepare(`
      INSERT INTO deployment_changes (id, deployment_id, file_path, change_type, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    await db.batch(p.changes.map(c => 
      chgStmt.bind(`dc-${p.worker_version_id}-${c.path}`, p.worker_version_id, c.path, c.type)
    )).catch(e => console.warn('[post_promote] changes failed:', e.message));
  }

  // 5. project_storage
  if (p.r2_pruned_files != null) {
    await db.prepare(`
      INSERT INTO project_storage (id, project_id, resource_id, resource_type, storage_bytes, file_count, metadata_json, created_at)
      VALUES (?, 'inneranimalmedia', 'r2-production', 'r2_bucket', ?, ?, ?, datetime('now'))
    `).bind(`ps-prod-${ts}`, p.r2_bytes || 0, p.r2_files || 0, JSON.stringify({
      pruned_files: p.r2_pruned_files,
      pruned_bytes: p.r2_pruned_bytes
    })).run().catch(() => {});
  }

  // 6. fire hooks (including e2e-hook-1)
  await fireHooks('post_deploy', p, env);
  await fireHooks('e2e-hook-1', p, env, true); // Explicitly fire e2e-hook-1

  return Response.json({ ok: true, event: 'post_promote', tables_written: 6 });
}

async function handlePostSandbox(p, env) {
  const db = env.DB;
  const ts = Math.floor(Date.now() / 1000);
  // Use worker_version_id as the deployment id when available (matches post_promote pattern)
  const deployId = p.worker_version_id || `sandbox-${ts}`;

  // 1. deployments
  await db.prepare(`
    INSERT OR IGNORE INTO deployments
      (id, timestamp, status, deployed_by, environment, worker_name, git_hash, version, created_at)
    VALUES (?, datetime('now'), 'success', 'sam_primeaux', 'sandbox',
            'inneranimal-dashboard', ?, ?, datetime('now'))
  `).bind(deployId, p.git_hash, p.dashboard_version).run();

  // 2. deployment_health_checks (was missing from post_sandbox — now wired)
  const hcStatus = parseInt(p.health_status || '0', 10);
  const hcLabel = hcStatus >= 200 && hcStatus < 300 ? 'healthy'
    : hcStatus >= 300 && hcStatus < 500 ? 'degraded' : 'down';
  if (hcStatus > 0) {
    await db.prepare(`
      INSERT INTO deployment_health_checks
        (deployment_id, check_type, check_url, status_code, status,
         response_time_ms, checked_at)
      VALUES (?, 'http', ?, ?, ?, ?, datetime('now'))
    `).bind(
      deployId,
      'https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent',
      hcStatus, hcLabel, p.health_ms || 0
    ).run().catch(e => console.warn('[post_sandbox] health_checks failed:', e.message));
  }

  // 3. tracking_metrics
  const metrics = [
    ['r2_files_uploaded', 'r2', p.r2_files, 'files'],
    ['r2_bytes_uploaded', 'r2', p.r2_bytes, 'bytes'],
    ['r2_pruned', 'cleanup', p.r2_pruned || p.r2_pruned_files || 0, 'files'],
    ['ms_build', 'deploy', p.ms_build || 0, 'ms'],
    ['ms_r2', 'deploy', p.ms_r2 || 0, 'ms'],
    ['ms_worker', 'deploy', p.ms_worker || 0, 'ms'],
    ['ms_wall', 'deploy', p.ms_wall || 0, 'ms'],
  ];
  const stmt = db.prepare(`
    INSERT INTO tracking_metrics
      (id, metric_name, metric_type, metric_value, metric_unit, environment, source, commit_sha, recorded_at)
    VALUES (?, ?, ?, ?, ?, 'sandbox', 'deploy_sandbox', ?, ?)
  `);
  await db.batch(metrics.map(([name, type, val, unit]) =>
    stmt.bind(`tm-sandbox-${ts}-${name}`, name, type, val, unit, p.git_hash, ts)
  )).catch(() => {});

  // 4. project_storage — R2 bucket prune snapshot
  // NOTE: project_storage is also written by _r2_prune_sandbox() in the shell script.
  // This write uses the cicd-event payload so both records exist (shell writes before worker deploy,
  // cicd-event writes after, with confirmed worker_version_id as the deployment anchor).
  await db.prepare(`
    INSERT OR IGNORE INTO project_storage
      (id, storage_id, storage_name, storage_type, storage_url,
       tenant_id, status, metadata_json, created_at, updated_at)
    VALUES (
      ?, ?, 'Sandbox CICD Bucket', 'r2',
      'https://dash.cloudflare.com/r2/agent-sam-sandbox-cicd',
      ?, 'active', ?, unixepoch(), unixepoch()
    )
  `  ).bind(
    `ps-cicd-event-${deployId}`,
    'agent-sam-sandbox-cicd',
    fallbackSystemTenantId(env),
    JSON.stringify({
      r2_files: p.r2_files || 0,
      r2_bytes: p.r2_bytes || 0,
      r2_objects_before: p.r2_objects_before || 0,
      r2_objects_after: p.r2_objects_after || 0,
      r2_pruned: p.r2_pruned || 0,
      change_count: p.change_count || 0,
      deploy_version: p.dashboard_version,
      worker_version_id: deployId
    })
  ).run().catch(() => {});

  // 5. fire hooks
  await fireHooks('post_deploy', p, env);

  return Response.json({ ok: true, event: 'post_sandbox', tables_written: 5 });
}

async function handleSessionStart(p, env) {
  const entryId = `pte-${p.user_id}-${Math.floor(Date.now()/1000)}`;
  const tenantRow =
    p.tenant_id != null && String(p.tenant_id).trim() !== ''
      ? String(p.tenant_id).trim()
      : fallbackSystemTenantId(env);
  await env.DB.prepare(`
    INSERT INTO project_time_entries
      (id, project_id, tenant_id, user_id, date, hours, description, created_at)
    VALUES (?, 'inneranimalmedia', ?, ?, date('now'), 0, ?, unixepoch())
  `).bind(entryId, tenantRow, p.user_id || 'sam_primeaux',
          `Session started — ${p.context || 'agent session'}`).run();

  await env.KV.put(`session_time_entry:${p.session_id}`, entryId, { expirationTtl: 86400 });
  return Response.json({ ok: true, entry_id: entryId });
}

async function handleSessionEnd(p, env) {
  const entryId = await env.KV.get(`session_time_entry:${p.session_id}`);
  if (!entryId) return Response.json({ ok: false, reason: 'no open entry' });

  const hours = parseFloat(((p.duration_ms || 0) / 3600000).toFixed(2));
  await env.DB.prepare(`
    UPDATE project_time_entries SET hours = ?, description = ? WHERE id = ?
  `).bind(hours, p.summary || 'Agent session', entryId).run();

  await env.KV.delete(`session_time_entry:${p.session_id}`);
  return Response.json({ ok: true, hours });
}

async function fireHooks(trigger, payload, env, isExplicitId = false) {
  let query = `SELECT id, command FROM agentsam_hook WHERE trigger = ? AND is_active = 1`;
  if (isExplicitId) {
    query = `SELECT id, command FROM agentsam_hook WHERE id = ? AND is_active = 1`;
  }

  const hooks = await env.DB.prepare(query).bind(trigger).all();

  for (const hook of hooks.results) {
    const start = Date.now();
    let status = 'success', error = null, output = null;

    // Build human-readable deploy summary from payload
    const env_label = (payload.environment || 'sandbox').toUpperCase();
    const ver = payload.dashboard_version || payload.worker_version_id || 'unknown';
    const health = payload.health_status || payload.health_ms ? `HTTP ${payload.health_status} in ${payload.health_ms}ms` : 'skipped';
    const wall = payload.ms_wall ? `${Math.round(payload.ms_wall / 1000)}s` : '?';
    const r2 = `${payload.r2_objects_before ?? '?'} → ${payload.r2_objects_after ?? '?'} objects (${payload.r2_pruned ?? 0} pruned)`;
    const git = payload.git_hash ? payload.git_hash.slice(0, 8) : 'unknown';
    const changes = payload.change_count != null ? `${payload.change_count} file(s) changed` : '';
    const summaryText = [
      `IAM ${env_label} DEPLOY — ${ver}`,
      `Health: ${health}`,
      `Wall time: ${wall}`,
      `R2: ${r2}`,
      `Git: ${git}${changes ? ' · ' + changes : ''}`,
    ].join('\n');

    try {
      const cmd = (hook.command || '').trim();

      if (cmd === 'notify:imessage' || cmd === 'notify:email') {
        // Deliver via Resend → your email (which forwards to iMessage via email-to-SMS bridge)
        const resendKey = env.RESEND_API_KEY;
        const to = env.RESEND_TO || 'support@inneranimalmedia.com';
        const from = env.RESEND_FROM || 'support@inneranimalmedia.com';
        if (resendKey) {
          const subject = `[IAM] ${env_label} ${ver} — ${health}`;
          const html = `<pre style="font-family:monospace;background:#0f1117;color:#e2e8f0;padding:16px;border-radius:6px;white-space:pre-wrap">${summaryText}</pre>`;
          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to: [to], subject, html }),
          });
          output = `notify:imessage → Resend ${resp.status} (${to})`;
          if (!resp.ok) { status = 'fail'; error = `Resend HTTP ${resp.status}`; }
        } else {
          output = 'notify:imessage — RESEND_API_KEY not set, skipped';
        }

      } else if (cmd.startsWith('notify:webhook:')) {
        // POST summary to a webhook URL
        const webhookUrl = cmd.slice('notify:webhook:'.length);
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: summaryText, payload }),
        });
        output = `notify:webhook → ${webhookUrl} HTTP ${resp.status}`;
        if (!resp.ok) { status = 'fail'; error = `webhook HTTP ${resp.status}`; }

      } else {
        // Generic command — log it
        output = `Trigger: ${trigger} | ${summaryText} | cmd: ${cmd.slice(0, 80)}`;
        console.log(`[Hook] Firing ${hook.id}: ${output}`);
      }

    } catch (e) {
      status = 'fail';
      error = e.message;
    }

    const executionId = `hke-${hook.id}-${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO agentsam_hook_execution
        (id, hook_id, user_id, status, duration_ms, output, error, ran_at)
      VALUES (?, ?, 'sam_primeaux', ?, ?, ?, ?, datetime('now'))
    `).bind(executionId, hook.id, status,
            Date.now() - start, output, error).run();

    // Update hook_subscriptions counters
    await env.DB.prepare(`
      UPDATE hook_subscriptions
      SET total_fired = total_fired + 1,
          last_fired_at = datetime('now'),
          total_succeeded = total_succeeded + CASE WHEN ? = 'success' THEN 1 ELSE 0 END,
          total_failed = total_failed + CASE WHEN ? != 'success' THEN 1 ELSE 0 END
      WHERE id = ?
    `).bind(status, status, hook.id).run().catch(() => {});

    console.log(`[Hook] ${hook.id} (${trigger}): ${status} — ${output || error || 'no output'}`);
  }
}
