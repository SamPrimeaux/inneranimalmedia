// Handles all CICD lifecycle events and fans out to correct D1 tables.
import { fallbackSystemTenantId } from '../core/auth.js';
import { dispatchComplete } from '../core/provider.js';
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
      return await handleSessionEnd(payload, env, ctx);
    default:
      return Response.json({ error: `Unknown event: ${event}` }, { status: 400 });
  }
}

async function handlePostPromote(p, env) {
  const db = env.DB;
  const ts = Math.floor(Date.now() / 1000);
  const systemActor =
    (typeof env?.SYSTEM_ACTOR_ID === 'string' && env.SYSTEM_ACTOR_ID.trim()) ||
    (typeof p?.deployed_by === 'string' && p.deployed_by.trim()) ||
    'system';

  // 1. deployments
  await db.prepare(`
    INSERT OR IGNORE INTO deployments
      (id, timestamp, status, deployed_by, environment, worker_name,
       triggered_by, git_hash, version, deploy_duration_ms, created_at)
    VALUES (?, datetime('now'), 'success', ?, 'production',
            'inneranimalmedia', ?, ?, ?, ?, datetime('now'))
  `).bind(p.worker_version_id, systemActor, p.triggered_by, p.git_hash, p.dashboard_version, p.ms_worker).run();

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
  const systemActor =
    (typeof env?.SYSTEM_ACTOR_ID === 'string' && env.SYSTEM_ACTOR_ID.trim()) ||
    (typeof p?.deployed_by === 'string' && p.deployed_by.trim()) ||
    'system';
  // Use worker_version_id as the deployment id when available (matches post_promote pattern)
  const deployId = p.worker_version_id || `sandbox-${ts}`;

  // 1. deployments
  await db.prepare(`
    INSERT OR IGNORE INTO deployments
      (id, timestamp, status, deployed_by, environment, worker_name, git_hash, version, created_at)
    VALUES (?, datetime('now'), 'success', ?, 'sandbox',
            'inneranimal-dashboard', ?, ?, datetime('now'))
  `).bind(deployId, systemActor, p.git_hash, p.dashboard_version).run();

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
      'https://dash.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2/r2/buckets/inneranimalmedia',
      ?, 'active', ?, unixepoch(), unixepoch()
    )
  `  ).bind(
    `ps-cicd-event-${deployId}`,
    'inneranimalmedia',
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
  const systemActor =
    (typeof p?.user_id === 'string' && p.user_id.trim()) ||
    (typeof env?.SYSTEM_ACTOR_ID === 'string' && env.SYSTEM_ACTOR_ID.trim()) ||
    null;
  await env.DB.prepare(`
    INSERT INTO project_time_entries
      (id, project_id, tenant_id, user_id, date, hours, description, created_at)
    VALUES (?, 'inneranimalmedia', ?, ?, date('now'), 0, ?, unixepoch())
  `).bind(entryId, tenantRow, systemActor, `Session started — ${p.context || 'agent session'}`).run();

  await env.KV.put(`session_time_entry:${p.session_id}`, entryId, { expirationTtl: 86400 });
  return Response.json({ ok: true, entry_id: entryId });
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(input ?? '')));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Cheapest active catalog row (agentsam_ai.sort_order + size_class). */
async function resolveCheapestModelKey(env) {
  if (!env?.DB) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND lower(COALESCE(size_class, '')) = 'small'
       ORDER BY sort_order ASC, name ASC
       LIMIT 1`,
    ).first();
    if (row?.model_key) return String(row.model_key).trim();
    const fallback = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
       ORDER BY sort_order ASC, name ASC
       LIMIT 1`,
    ).first();
    return fallback?.model_key ? String(fallback.model_key).trim() : null;
  } catch {
    return null;
  }
}

function parseJsonSafe(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

/**
 * Summarize session tool use + chat, upsert agentsam_context_digest (digest_type=session).
 * @param {any} env
 * @param {Record<string, unknown>} payload session_end payload
 */
export async function writeSessionContextDigest(env, payload) {
  if (!env?.DB) return;
  const workspaceId =
    payload?.workspace_id != null && String(payload.workspace_id).trim()
      ? String(payload.workspace_id).trim()
      : '';
  const sessionId =
    payload?.session_id != null && String(payload.session_id).trim()
      ? String(payload.session_id).trim()
      : '';
  if (!workspaceId || !sessionId) return;

  const userId =
    payload?.user_id != null && String(payload.user_id).trim()
      ? String(payload.user_id).trim()
      : null;

  const toolLimit = 24;
  const msgLimit = 32;
  let toolRows = [];
  let messageRows = [];

  try {
    const tools = await env.DB.prepare(
      `SELECT tool_name, tool_key, success, created_at, input_json
       FROM agentsam_mcp_tool_execution
       WHERE session_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
      .bind(sessionId, toolLimit)
      .all();
    toolRows = tools.results || [];
  } catch {
    toolRows = [];
  }

  try {
    const msgs = await env.DB.prepare(
      `SELECT role, content, created_at
       FROM agent_messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
      .bind(sessionId, msgLimit)
      .all();
    messageRows = (msgs.results || []).reverse();
  } catch {
    messageRows = [];
  }

  const toolLines = toolRows.map((r) => {
    const name = String(r.tool_key || r.tool_name || 'tool');
    const st = Number(r.success) === 1 ? 'ok' : 'error';
    const inp = parseJsonSafe(r.input_json, {});
    const pathHints = [
      inp?.path,
      inp?.workspacePath,
      inp?.workspace_path,
      inp?.r2Key,
      inp?.r2_key,
      inp?.githubPath,
      inp?.github_path,
    ]
      .filter((x) => x != null && String(x).trim())
      .map((x) => String(x).trim());
    const paths = pathHints.length ? ` paths=${pathHints.join(', ')}` : '';
    return `- ${name} (${st})${paths}`;
  });

  const msgLines = messageRows.map((m) => {
    const role = String(m.role || 'unknown');
    const text = String(m.content || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    return `- [${role}] ${text}`;
  });

  const sourceMaterial = [
    `session_id: ${sessionId}`,
    `workspace_id: ${workspaceId}`,
    payload?.summary != null ? `session_summary: ${String(payload.summary).slice(0, 500)}` : '',
    payload?.duration_ms != null ? `duration_ms: ${payload.duration_ms}` : '',
    'tool_calls:',
    toolLines.length ? toolLines.join('\n') : '(none recorded)',
    'conversation:',
    msgLines.length ? msgLines.join('\n') : '(no messages)',
  ]
    .filter(Boolean)
    .join('\n');

  const sourceHash = await sha256Hex(sourceMaterial);
  const digestHash = await sha256Hex(`${workspaceId}:session`);

  let digestText = '';
  const modelKey = await resolveCheapestModelKey(env);
  const summarizePrompt = [
    'Summarize this Agent Sam chat session for the next session system prompt.',
    'Include: what was worked on, files/paths touched, tools used, current state, and open items.',
    'Use concise markdown bullets. Max ~400 words.',
    '',
    sourceMaterial,
  ].join('\n');

  if (modelKey) {
    try {
      const result = await dispatchComplete(env, {
        modelKey,
        systemPrompt: 'You write compact workspace session digests for an AI coding agent.',
        messages: [{ role: 'user', content: summarizePrompt }],
        tools: [],
        userId,
        options: { reasoningEffort: 'none', verbosity: 'low' },
      });
      digestText =
        (typeof result?.text === 'string' && result.text) ||
        result?.choices?.[0]?.message?.content ||
        result?.output_text ||
        '';
    } catch (e) {
      console.warn('[context_digest] summarize', e?.message ?? e);
    }
  }

  if (!String(digestText).trim()) {
    digestText = [
      '# Session digest (deterministic fallback)',
      payload?.summary ? `- ${String(payload.summary).slice(0, 400)}` : '',
      toolLines.length ? `## Tools\n${toolLines.slice(0, 12).join('\n')}` : '',
      msgLines.length ? `## Recent messages\n${msgLines.slice(-6).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  digestText = String(digestText).trim().slice(0, 12000);
  if (!digestText) return;

  const rawBytes = new TextEncoder().encode(sourceMaterial).length;
  const reducedBytes = new TextEncoder().encode(digestText).length;
  const tokenEstimate = Math.ceil(reducedBytes / 4);
  const digestId = `cd_${digestHash.slice(0, 16)}`;

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_context_digest (
         id, workspace_id, digest_type, source_hash, digest_hash,
         raw_size_bytes, reduced_size_bytes, token_count, digest_text,
         generation_model, namespace, updated_at
       ) VALUES (?, ?, 'session', ?, ?, ?, ?, ?, ?, ?, 'agent_session', datetime('now'))
       ON CONFLICT(digest_hash) DO UPDATE SET
         digest_text = excluded.digest_text,
         source_hash = excluded.source_hash,
         raw_size_bytes = excluded.raw_size_bytes,
         reduced_size_bytes = excluded.reduced_size_bytes,
         token_count = excluded.token_count,
         generation_model = excluded.generation_model,
         updated_at = datetime('now')`,
    )
      .bind(
        digestId,
        workspaceId,
        sourceHash,
        digestHash,
        rawBytes,
        reducedBytes,
        tokenEstimate,
        digestText,
        modelKey || 'fallback',
      )
      .run();
  } catch (e) {
    console.warn('[context_digest] upsert', e?.message ?? e);
  }
}

async function handleSessionEnd(p, env, ctx) {
  const entryId = await env.KV.get(`session_time_entry:${p.session_id}`);
  if (!entryId) return Response.json({ ok: false, reason: 'no open entry' });

  const hours = parseFloat(((p.duration_ms || 0) / 3600000).toFixed(2));
  await env.DB.prepare(`
    UPDATE project_time_entries SET hours = ?, description = ? WHERE id = ?
  `).bind(hours, p.summary || 'Agent session', entryId).run();

  await env.KV.delete(`session_time_entry:${p.session_id}`);

  const digestPromise = writeSessionContextDigest(env, p).catch((e) =>
    console.warn('[context_digest] session_end', e?.message ?? e),
  );
  if (ctx?.waitUntil) {
    ctx.waitUntil(digestPromise);
  } else {
    await digestPromise;
  }

  return Response.json({ ok: true, hours });
}

export async function fireHooks(trigger, payload, env, isExplicitId = false) {
  let query = `SELECT id, command, user_id FROM agentsam_hook WHERE trigger = ? AND is_active = 1`;
  if (isExplicitId) {
    query = `SELECT id, command, user_id FROM agentsam_hook WHERE id = ? AND is_active = 1`;
  }

  const hooks = await env.DB.prepare(query).bind(trigger).all();

  for (const hook of hooks.results || []) {
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
        const to = typeof env.RESEND_TO === 'string' && env.RESEND_TO.trim() ? env.RESEND_TO.trim() : '';
        const from = typeof env.RESEND_FROM === 'string' && env.RESEND_FROM.trim() ? env.RESEND_FROM.trim() : '';
        if (resendKey && to && from) {
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
          output = 'notify:imessage — RESEND_* not configured, skipped';
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

      } else if (cmd === 'trigger:agent_sam_deploy_hook' || cmd === 'trigger:workers_deploy_hook') {
        const { postAgentSamDeployHook } = await import('../core/workers-deploy-hook.js');
        const pr = await postAgentSamDeployHook(env);
        if (pr.error === 'AGENT_SAM_DEPLOY_HOOK_URL not configured') {
          output = pr.error;
          status = 'fail';
        } else if (!pr.ok) {
          output = `deploy hook HTTP ${pr.status}: ${(pr.raw || pr.error || '').slice(0, 280)}`;
          status = 'fail';
        } else {
          const uuid = pr.json?.result?.build_uuid;
          output = `Workers deploy hook OK HTTP ${pr.status}${uuid ? ` build_uuid=${uuid}` : ''}`;
        }

      } else {
        // Generic command — log it
        output = `Trigger: ${trigger} | ${summaryText} | cmd: ${cmd.slice(0, 80)}`;
        console.log(`[Hook] Firing ${hook.id}: ${output}`);
      }

    } catch (e) {
      status = 'fail';
      error = e.message;
    }

    const executionId = `hexec_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const runUserId =
      (typeof payload?.user_id === 'string' && payload.user_id.trim()) ||
      (typeof hook.user_id === 'string' && hook.user_id.trim()) ||
      (typeof env?.SYSTEM_ACTOR_ID === 'string' && env.SYSTEM_ACTOR_ID.trim()) ||
      'system_post_deploy';

    await env.DB.prepare(`
      INSERT INTO agentsam_hook_execution (
        id, tenant_id, workspace_id, hook_id, user_id, 
        agent_id, session_id, plan_id, todo_id, command_run_id, 
        source, event_type, action, actor, 
        payload_json, status, duration_ms, output, error, 
        ran_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), unixepoch())
    `).bind(
      executionId,
      payload?.tenant_id || payload?.tenantId || null,
      payload?.workspace_id || payload?.workspaceId || null,
      hook.id,
      runUserId,
      payload?.agent_id || payload?.agentId || null,
      payload?.session_id || payload?.sessionId || null,
      payload?.plan_id || payload?.planId || null,
      payload?.todo_id || payload?.todoId || null,
      payload?.command_run_id || payload?.commandRunId || null,
      'cicd_event',
      trigger,
      hook.command,
      runUserId,
      JSON.stringify(payload || {}),
      status,
      Date.now() - start,
      output,
      error
    ).run();

    await env.DB.prepare(`
      UPDATE agentsam_hook
      SET run_count = COALESCE(run_count, 0) + 1,
          last_run_at = datetime('now')
      WHERE id = ?
    `)
      .bind(hook.id)
      .run()
      .catch(() => {});

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
