/**
 * API: CI/CD Event Webhook
 * Internal-only endpoint. Called by shell scripts after deploys.
 * Auth: INTERNAL_API_SECRET header (not user auth).
 * No hardcoded tenant IDs, project IDs, or URLs — all read from env.
 *
 * Events:
 *   post_promote   — production deploy completed
 *   post_sandbox   — sandbox deploy completed
 *   session_start  — dev session opened
 *   session_end    — dev session closed
 */

// ---------------------------------------------------------------------------
// Env helpers — resolve runtime values, never hardcode
// ---------------------------------------------------------------------------

function tenantId(env)    { return env.TENANT_ID     || 'tenant_iam'; }
function projectId(env)   { return env.PROJECT_ID    || 'inneranimalmedia'; }
function deployUser(env)  { return env.DEPLOY_USER   || 'system'; }
function iamOrigin(env)   { return (env.IAM_ORIGIN   || 'https://inneranimalmedia.com').replace(/\/$/, ''); }
function sandboxOrigin(env) { return (env.SANDBOX_ORIGIN || 'https://inneranimal-dashboard.meauxbility.workers.dev').replace(/\/$/, ''); }

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function handleCicdEvent(request, env, ctx) {
  const secret = request.headers.get('X-Internal-Secret');
  if (!secret || secret !== env.INTERNAL_API_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { event, payload } = body;
  if (!event)   return Response.json({ error: 'event is required' }, { status: 400 });
  if (!payload) return Response.json({ error: 'payload is required' }, { status: 400 });

  switch (event) {
    case 'post_promote':   return handlePostPromote(payload, env, ctx);
    case 'post_sandbox':   return handlePostSandbox(payload, env, ctx);
    case 'session_start':  return handleSessionStart(payload, env);
    case 'session_end':    return handleSessionEnd(payload, env);
    default:
      return Response.json({ error: `Unknown event: ${event}` }, { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// post_promote — production deploy
// ---------------------------------------------------------------------------

async function handlePostPromote(p, env, ctx) {
  const db  = env.DB;
  const ts  = Math.floor(Date.now() / 1000);
  const tid = tenantId(env);
  const pid = projectId(env);
  const who = deployUser(env);

  // 1. deployments
  await db.prepare(`
    INSERT OR IGNORE INTO deployments
      (id, timestamp, status, deployed_by, environment, worker_name,
       triggered_by, git_hash, version, deploy_duration_ms, created_at)
    VALUES (?, datetime('now'), 'success', ?, 'production', 'inneranimalmedia',
            ?, ?, ?, ?, datetime('now'))
  `).bind(
    p.worker_version_id, who,
    p.triggered_by || who, p.git_hash,
    p.dashboard_version, p.ms_worker || 0
  ).run();

  // 2. deployment_health_checks
  const hcStatus = parseInt(p.health_status || '0', 10);
  const hcLabel  = hcStatus >= 200 && hcStatus < 300 ? 'healthy'
    : hcStatus >= 300 ? 'degraded' : 'unknown';

  await db.prepare(`
    INSERT INTO deployment_health_checks
      (deployment_id, check_type, check_url, status_code, status,
       response_time_ms, checked_at)
    VALUES (?, 'http', ?, ?, ?, ?, datetime('now'))
  `).bind(
    p.worker_version_id,
    `${iamOrigin(env)}/dashboard/agent`,
    hcStatus, hcLabel, p.health_ms || 0
  ).run().catch(e => console.warn('[post_promote] health_checks:', e.message));

  // 3. tracking_metrics
  const metrics = [
    ['r2_files_uploaded', 'r2',    p.r2_files,  'files'],
    ['r2_bytes_uploaded', 'r2',    p.r2_bytes,  'bytes'],
    ['worker_deploy_ms',  'deploy', p.ms_worker, 'ms'],
    ['r2_push_ms',        'deploy', p.ms_push,   'ms'],
    ['r2_pull_ms',        'deploy', p.ms_pull,   'ms'],
    ['health_check_code', 'quality', hcStatus,   'count'],
  ];
  const mStmt = db.prepare(`
    INSERT INTO tracking_metrics
      (id, metric_name, metric_type, metric_value, metric_unit,
       environment, source, commit_sha, worker_version, recorded_at)
    VALUES (?, ?, ?, ?, ?, 'production', 'promote_to_prod', ?, ?, ?)
  `);
  await db.batch(
    metrics.map(([name, type, val, unit]) =>
      mStmt.bind(
        `tm-${p.worker_version_id}-${name}`, name, type,
        val || 0, unit, p.git_hash, p.worker_version_id, ts
      )
    )
  ).catch(e => console.warn('[post_promote] metrics:', e.message));

  // 4. deployment_changes
  if (Array.isArray(p.changes) && p.changes.length > 0) {
    const cStmt = db.prepare(`
      INSERT INTO deployment_changes
        (id, deployment_id, file_path, change_type, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    await db.batch(
      p.changes.map(c =>
        cStmt.bind(`dc-${p.worker_version_id}-${c.path}`, p.worker_version_id, c.path, c.type)
      )
    ).catch(e => console.warn('[post_promote] changes:', e.message));
  }

  // 5. project_storage
  if (p.r2_pruned_files != null) {
    await db.prepare(`
      INSERT INTO project_storage
        (id, project_id, resource_id, resource_type, storage_bytes, file_count, metadata_json, created_at)
      VALUES (?, ?, 'r2-production', 'r2_bucket', ?, ?, ?, datetime('now'))
    `).bind(
      `ps-prod-${ts}`, pid,
      p.r2_bytes || 0, p.r2_files || 0,
      JSON.stringify({ pruned_files: p.r2_pruned_files, pruned_bytes: p.r2_pruned_bytes })
    ).run().catch(() => {});
  }

  // 6. hooks
  ctx.waitUntil(fireHooks('post_deploy', p, env));
  ctx.waitUntil(fireHooks('e2e-hook-1', p, env, true));

  return Response.json({ ok: true, event: 'post_promote', tables_written: 5 });
}

// ---------------------------------------------------------------------------
// post_sandbox — sandbox deploy
// ---------------------------------------------------------------------------

async function handlePostSandbox(p, env, ctx) {
  const db       = env.DB;
  const ts       = Math.floor(Date.now() / 1000);
  const pid      = projectId(env);
  const who      = deployUser(env);
  const deployId = p.worker_version_id || `sandbox-${ts}`;

  // 1. deployments
  await db.prepare(`
    INSERT OR IGNORE INTO deployments
      (id, timestamp, status, deployed_by, environment, worker_name,
       git_hash, version, created_at)
    VALUES (?, datetime('now'), 'success', ?, 'sandbox',
            'inneranimal-dashboard', ?, ?, datetime('now'))
  `).bind(deployId, who, p.git_hash, p.dashboard_version).run();

  // 2. deployment_health_checks
  const hcStatus = parseInt(p.health_status || '0', 10);
  const hcLabel  = hcStatus >= 200 && hcStatus < 300 ? 'healthy'
    : hcStatus >= 300 && hcStatus < 500 ? 'degraded' : 'down';

  if (hcStatus > 0) {
    await db.prepare(`
      INSERT INTO deployment_health_checks
        (deployment_id, check_type, check_url, status_code, status,
         response_time_ms, checked_at)
      VALUES (?, 'http', ?, ?, ?, ?, datetime('now'))
    `).bind(
      deployId,
      `${sandboxOrigin(env)}/dashboard/agent`,
      hcStatus, hcLabel, p.health_ms || 0
    ).run().catch(e => console.warn('[post_sandbox] health_checks:', e.message));
  }

  // 3. tracking_metrics
  const metrics = [
    ['r2_files_uploaded', 'r2',    p.r2_files || 0,  'files'],
    ['r2_bytes_uploaded', 'r2',    p.r2_bytes || 0,  'bytes'],
    ['r2_pruned',         'cleanup', p.r2_pruned || p.r2_pruned_files || 0, 'files'],
    ['ms_build',          'deploy', p.ms_build  || 0, 'ms'],
    ['ms_r2',             'deploy', p.ms_r2     || 0, 'ms'],
    ['ms_worker',         'deploy', p.ms_worker || 0, 'ms'],
    ['ms_wall',           'deploy', p.ms_wall   || 0, 'ms'],
  ];
  const mStmt = db.prepare(`
    INSERT INTO tracking_metrics
      (id, metric_name, metric_type, metric_value, metric_unit,
       environment, source, commit_sha, recorded_at)
    VALUES (?, ?, ?, ?, ?, 'sandbox', 'deploy_sandbox', ?, ?)
  `);
  await db.batch(
    metrics.map(([name, type, val, unit]) =>
      mStmt.bind(`tm-sandbox-${ts}-${name}`, name, type, val, unit, p.git_hash, ts)
    )
  ).catch(() => {});

  // 4. project_storage
  await db.prepare(`
    INSERT OR IGNORE INTO project_storage
      (id, storage_id, storage_name, storage_type, storage_url,
       tenant_id, status, metadata_json, created_at, updated_at)
    VALUES (?, ?, 'Sandbox CICD Bucket', 'r2',
            'https://dash.cloudflare.com/r2/agent-sam-sandbox-cicd',
            ?, 'active', ?, unixepoch(), unixepoch())
  `).bind(
    `ps-cicd-event-${deployId}`,
    'agent-sam-sandbox-cicd',
    tenantId(env),
    JSON.stringify({
      r2_files:           p.r2_files || 0,
      r2_bytes:           p.r2_bytes || 0,
      r2_objects_before:  p.r2_objects_before || 0,
      r2_objects_after:   p.r2_objects_after  || 0,
      r2_pruned:          p.r2_pruned || 0,
      change_count:       p.change_count || 0,
      deploy_version:     p.dashboard_version,
      worker_version_id:  deployId,
    })
  ).run().catch(() => {});

  // 5. hooks
  ctx.waitUntil(fireHooks('post_deploy', p, env));

  return Response.json({ ok: true, event: 'post_sandbox', tables_written: 4 });
}

// ---------------------------------------------------------------------------
// session_start / session_end
// ---------------------------------------------------------------------------

async function handleSessionStart(p, env) {
  const entryId = `pte-${p.user_id || 'system'}-${Math.floor(Date.now() / 1000)}`;
  await env.DB.prepare(`
    INSERT INTO project_time_entries
      (id, project_id, tenant_id, user_id, date, hours, description, created_at)
    VALUES (?, ?, ?, ?, date('now'), 0, ?, unixepoch())
  `).bind(
    entryId, projectId(env), tenantId(env),
    p.user_id || deployUser(env),
    `Session started — ${p.context || 'agent session'}`
  ).run();

  await env.KV.put(`session_time_entry:${p.session_id}`, entryId, { expirationTtl: 86400 });
  return Response.json({ ok: true, entry_id: entryId });
}

async function handleSessionEnd(p, env) {
  const entryId = await env.KV.get(`session_time_entry:${p.session_id}`);
  if (!entryId) return Response.json({ ok: false, reason: 'no open entry' });

  const hours = parseFloat(((p.duration_ms || 0) / 3_600_000).toFixed(2));
  await env.DB.prepare(
    `UPDATE project_time_entries SET hours = ?, description = ? WHERE id = ?`
  ).bind(hours, p.summary || 'Agent session', entryId).run();

  await env.KV.delete(`session_time_entry:${p.session_id}`);
  return Response.json({ ok: true, hours });
}

// ---------------------------------------------------------------------------
// Hook runner
// ---------------------------------------------------------------------------

async function fireHooks(trigger, payload, env, matchById = false) {
  const query = matchById
    ? `SELECT id, command FROM agentsam_hook WHERE id = ? AND is_active = 1`
    : `SELECT id, command FROM agentsam_hook WHERE trigger = ? AND is_active = 1`;

  const hooks = await env.DB.prepare(query).bind(trigger).all().catch(() => ({ results: [] }));

  const envLabel  = (payload.environment || 'sandbox').toUpperCase();
  const ver       = payload.dashboard_version || payload.worker_version_id || 'unknown';
  const health    = payload.health_status
    ? `HTTP ${payload.health_status} in ${payload.health_ms || 0}ms`
    : 'skipped';
  const wall      = payload.ms_wall ? `${Math.round(payload.ms_wall / 1000)}s` : '?';
  const r2        = `${payload.r2_objects_before ?? '?'} → ${payload.r2_objects_after ?? '?'} objects (${payload.r2_pruned ?? 0} pruned)`;
  const git       = payload.git_hash ? payload.git_hash.slice(0, 8) : 'unknown';
  const changes   = payload.change_count != null ? `${payload.change_count} file(s) changed` : '';

  const summary = [
    `IAM ${envLabel} DEPLOY — ${ver}`,
    `Health: ${health}`,
    `Wall time: ${wall}`,
    `R2: ${r2}`,
    `Git: ${git}${changes ? ' · ' + changes : ''}`,
  ].join('\n');

  for (const hook of hooks.results || []) {
    const start = Date.now();
    let status = 'success', error = null, output = null;

    try {
      const cmd = (hook.command || '').trim();

      if (cmd === 'notify:imessage' || cmd === 'notify:email') {
        const resendKey = env.RESEND_API_KEY;
        const to        = env.RESEND_TO   || '';
        const from      = env.RESEND_FROM || '';

        if (!resendKey || !to || !from) {
          output = 'notify skipped — RESEND_API_KEY, RESEND_TO, or RESEND_FROM not set';
        } else {
          const subject = `[IAM] ${envLabel} ${ver} — ${health}`;
          const html    = `<pre style="font-family:monospace;background:#0f1117;color:#e2e8f0;padding:16px;border-radius:6px;white-space:pre-wrap">${summary}</pre>`;
          const resp    = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to: [to], subject, html }),
          });
          output = `notify → Resend ${resp.status} (${to})`;
          if (!resp.ok) { status = 'fail'; error = `Resend HTTP ${resp.status}`; }
        }

      } else if (cmd.startsWith('notify:webhook:')) {
        const webhookUrl = cmd.slice('notify:webhook:'.length);
        const resp       = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: summary, payload }),
        });
        output = `notify:webhook → ${webhookUrl} HTTP ${resp.status}`;
        if (!resp.ok) { status = 'fail'; error = `webhook HTTP ${resp.status}`; }

      } else {
        output = `trigger=${trigger} cmd=${cmd.slice(0, 80)}`;
        console.log(`[Hook] ${hook.id}: ${output}`);
      }

    } catch (err) {
      status = 'fail';
      error  = err.message;
    }

    const execId = `hke-${hook.id}-${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO agentsam_hook_execution
        (id, hook_id, user_id, status, duration_ms, output, error, ran_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(execId, hook.id, deployUser(env), status, Date.now() - start, output, error)
      .run().catch(() => {});

    await env.DB.prepare(`
      UPDATE hook_subscriptions SET
        total_fired     = total_fired + 1,
        last_fired_at   = datetime('now'),
        total_succeeded = total_succeeded + CASE WHEN ? = 'success' THEN 1 ELSE 0 END,
        total_failed    = total_failed    + CASE WHEN ? != 'success' THEN 1 ELSE 0 END
      WHERE id = ?
    `).bind(status, status, hook.id).run().catch(() => {});
  }
}
