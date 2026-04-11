/**
 * API Layer: Deployment Tracking & Quality Gates
 * Handles deployment records, CI/CD pipeline runs, quality gate execution,
 * health checks, and Agent Sam learning feedback loops.
 *
 * Tables: deployments, cicd_pipeline_runs, cicd_run_steps, cicd_events,
 *         quality_runs, quality_results, quality_gates, quality_gate_sets,
 *         deployment_health_checks, deployment_tracking, agent_memory_index
 */
import { jsonResponse }                        from '../core/responses.js';
import { getAuthUser, tenantIdFromEnv,
         isIngestSecretAuthorized, projectIdFromEnv } from '../core/auth.js';
import { handleGitStatusRequest }              from './git-status.js';
import { notifySam }                           from '../core/notifications.js';

// ─── CIDI Pipeline Mirror ─────────────────────────────────────────────────────

/**
 * Mirror a deployment outcome to cicd_pipeline_runs for historical audit.
 * Called fire-and-forget after every successful deploy insert.
 */
export function appendCidiPipelineRunFromDeploy(env, { deploymentId, environment, gitHash, versionId, description }) {
  if (!env?.DB) return;
  const now = new Date().toISOString();
  env.DB.prepare(
    `INSERT OR IGNORE INTO cicd_pipeline_runs
     (run_id, env, status, branch, commit_hash, notes, triggered_at, completed_at)
     VALUES (?, ?, 'passed', 'main', ?, ?, ?, ?)`
  ).bind(
    deploymentId,
    environment || 'production',
    gitHash     || 'unknown',
    description || 'Automated deploy',
    now, now
  ).run().catch(() => {});
}

// ─── Quality Gate Execution ───────────────────────────────────────────────────

/**
 * Evaluate a single gate metric by running the appropriate check.
 * Returns { actual_value: string, passed: boolean }.
 */
async function evaluateGate(env, gate, context) {
  const { metric_key, comparator, expected_value } = gate;
  const origin = (env.IAM_ORIGIN || env.SANDBOX_ORIGIN || '').replace(/\/$/, '');

  try {
    // ── HTTP health check ─────────────────────────────────────────────────
    if (metric_key === 'http_status' || metric_key === 'health_status') {
      const url = context.url_under_test || `${origin}/health`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const actual = String(res.status);
      return { actual_value: actual, passed: compare(actual, comparator, expected_value) };
    }

    // ── Response time ─────────────────────────────────────────────────────
    if (metric_key === 'response_time_ms' || metric_key === 'latency_ms') {
      const url   = context.url_under_test || `${origin}/health`;
      const start = Date.now();
      await fetch(url, { signal: AbortSignal.timeout(15000) });
      const actual = String(Date.now() - start);
      return { actual_value: actual, passed: compare(actual, comparator, expected_value) };
    }

    // ── D1 availability ───────────────────────────────────────────────────
    if (metric_key === 'd1_available' || metric_key === 'd1_query_ok') {
      if (!env.DB) return { actual_value: 'false', passed: compare('false', comparator, expected_value) };
      await env.DB.prepare('SELECT 1').first();
      return { actual_value: 'true', passed: compare('true', comparator, expected_value) };
    }

    // ── API route check ───────────────────────────────────────────────────
    if (metric_key.startsWith('api_route:')) {
      const route = metric_key.replace('api_route:', '').trim();
      const res   = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(10000) });
      const actual = String(res.status);
      return { actual_value: actual, passed: compare(actual, comparator, expected_value) };
    }

    // ── Deploy record count (rollback detection) ──────────────────────────
    if (metric_key === 'recent_deploy_failures') {
      if (!env.DB) return { actual_value: '0', passed: true };
      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM deployments
         WHERE status = 'failed' AND datetime(timestamp) > datetime('now', '-1 hour')`
      ).first();
      const actual = String(row?.cnt || 0);
      return { actual_value: actual, passed: compare(actual, comparator, expected_value) };
    }

    // ── Error rate from telemetry ─────────────────────────────────────────
    if (metric_key === 'error_rate_1h') {
      if (!env.DB) return { actual_value: '0', passed: true };
      const row = await env.DB.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) AS errors
         FROM agent_telemetry
         WHERE created_at > unixepoch() - 3600`
      ).first();
      const total  = row?.total || 1;
      const errors = row?.errors || 0;
      const rate   = String((errors / total).toFixed(4));
      return { actual_value: rate, passed: compare(rate, comparator, expected_value) };
    }

    // ── Worker version matches expected ───────────────────────────────────
    if (metric_key === 'worker_version') {
      if (!env.DB) return { actual_value: 'unknown', passed: false };
      const row = await env.DB.prepare(
        `SELECT version FROM deployments WHERE status = 'success' ORDER BY timestamp DESC LIMIT 1`
      ).first();
      const actual = row?.version || 'unknown';
      return { actual_value: actual, passed: compare(actual, comparator, expected_value) };
    }

    // ── Unknown metric — skip ─────────────────────────────────────────────
    return { actual_value: 'skip', passed: true, skipped: true };

  } catch (e) {
    return { actual_value: `error: ${e.message.slice(0, 200)}`, passed: false };
  }
}

/**
 * Compare actual vs expected using the gate comparator.
 */
function compare(actual, comparator, expected) {
  const a = parseFloat(actual);
  const e = parseFloat(expected);
  const numericOk = Number.isFinite(a) && Number.isFinite(e);

  switch (comparator) {
    case '>=': return numericOk ? a >= e : actual >= expected;
    case '>':  return numericOk ? a >  e : actual >  expected;
    case '<=': return numericOk ? a <= e : actual <= expected;
    case '<':  return numericOk ? a <  e : actual <  expected;
    case '=':  return String(actual) === String(expected);
    case 'contains': return String(actual).includes(String(expected));
    default:   return false;
  }
}

/**
 * Run all quality gates for a given gate_set_id (or all gates if null).
 * Writes results to quality_runs + quality_results + deployment_health_checks.
 * Returns { run_id, status, pass_count, fail_count, warn_count, results }.
 */
export async function runQualityGates(env, opts = {}) {
  const {
    deploymentId   = null,
    pipelineRunId  = null,
    workspaceId    = null,
    environment    = env.ENVIRONMENT || 'production',
    urlUnderTest   = null,
    commitSha      = null,
    gateSetId      = null,
    initiatedBy    = 'cicd_pipeline',
  } = opts;

  if (!env.DB) throw new Error('DB not configured');

  // Find gates to run
  let gates = [];
  try {
    const query = gateSetId
      ? env.DB.prepare(`SELECT * FROM quality_gates WHERE gate_set_id = ? ORDER BY severity DESC, metric_key ASC`).bind(gateSetId)
      : env.DB.prepare(`SELECT qg.* FROM quality_gates qg JOIN quality_gate_sets qgs ON qgs.id = qg.gate_set_id ORDER BY qg.severity DESC, qg.metric_key ASC`);
    const { results } = await query.all();
    gates = results || [];
  } catch (e) {
    console.warn('[deployments] quality_gates lookup failed:', e?.message);
  }

  // Create quality_runs row
  const runId = 'qrun_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await env.DB.prepare(
    `INSERT INTO quality_runs
     (id, workspace_id, gate_set_id, run_context, commit_sha, url_under_test,
      initiated_by, deployment_id, pipeline_run_id, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', unixepoch())`
  ).bind(runId, workspaceId, gateSetId, environment, commitSha, urlUnderTest, initiatedBy, deploymentId, pipelineRunId).run();

  const context = { url_under_test: urlUnderTest };
  const results = [];
  let passCount = 0, failCount = 0, warnCount = 0;

  // Execute each gate
  for (const gate of gates) {
    const { actual_value, passed, skipped } = await evaluateGate(env, gate, context);
    const status = skipped ? 'skip' : passed ? 'pass' : gate.severity === 'warn' ? 'warn' : 'fail';

    if (status === 'pass')      passCount++;
    else if (status === 'fail') failCount++;
    else if (status === 'warn') warnCount++;

    // Write quality_results row
    const resultId = 'qres_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await env.DB.prepare(
      `INSERT INTO quality_results
       (id, run_id, gate_id, metric_key, check_name, actual_value, expected_value, status, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      resultId, runId, gate.id, gate.metric_key,
      `${gate.category}: ${gate.metric_key}`,
      actual_value, gate.expected_value, status,
      gate.guidance || null
    ).run().catch(() => {});

    // Mirror critical checks to deployment_health_checks
    if (deploymentId && (gate.category === 'reliability' || gate.category === 'performance')) {
      await env.DB.prepare(
        `INSERT INTO deployment_health_checks
         (deployment_id, check_type, check_url, status, error_message, metadata_json, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        deploymentId, gate.metric_key, urlUnderTest || null,
        status === 'pass' ? 'healthy' : 'unhealthy',
        status === 'fail' ? `Expected ${gate.comparator} ${gate.expected_value}, got ${actual_value}` : null,
        JSON.stringify({ gate_id: gate.id, actual: actual_value, run_id: runId })
      ).run().catch(() => {});
    }

    results.push({ gate_id: gate.id, metric_key: gate.metric_key, status, actual_value, expected_value: gate.expected_value, severity: gate.severity });
  }

  // Final run status: fail if any hard failures, warn if only warnings
  const runStatus = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : passCount > 0 ? 'pass' : 'skip';

  await env.DB.prepare(
    `UPDATE quality_runs SET
       status       = ?,
       pass_count   = ?,
       fail_count   = ?,
       warn_count   = ?,
       completed_at = unixepoch()
     WHERE id = ?`
  ).bind(runStatus, passCount, failCount, warnCount, runId).run();

  // Feed results into Agent Sam memory so it can learn
  if (failCount > 0 && env.DB) {
    const tenantId = tenantIdFromEnv(env);
    if (tenantId) {
      const summary = results
        .filter(r => r.status === 'fail')
        .map(r => `${r.metric_key}: expected ${r.expected_value}, got ${r.actual_value}`)
        .join('; ');

      await env.DB.prepare(
        `INSERT INTO agent_memory_index
         (tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at)
         VALUES (?, 'agent-sam-primary', 'execution_outcome', ?, ?, 0.9, unixepoch(), unixepoch())
         ON CONFLICT(key) DO UPDATE SET
           value            = excluded.value,
           importance_score = excluded.importance_score,
           updated_at       = unixepoch()`
      ).bind(
        tenantId,
        `quality_gate_fail:${runId}`,
        JSON.stringify({ run_id: runId, deployment_id: deploymentId, environment, failures: summary, fail_count: failCount })
      ).run().catch(() => {});
    }
  }

  return { run_id: runId, status: runStatus, pass_count: passCount, fail_count: failCount, warn_count: warnCount, results };
}

// ─── Post-Deploy Quality Run ──────────────────────────────────────────────────

/**
 * Trigger quality gates after a deploy. Runs async via ctx.waitUntil.
 * Notifies Sam on failure.
 */
export async function runPostDeployQualityChecks(env, deploymentId, opts = {}) {
  if (!env?.DB) return;

  try {
    // Log gate trigger intent
    await env.DB.prepare(
      `INSERT INTO cicd_events
       (source, event_type, git_commit_sha, raw_payload_json)
       VALUES ('worker_post_deploy', 'quality_gate_triggered', ?, ?)`
    ).bind(
      deploymentId,
      JSON.stringify({ triggered_at: new Date().toISOString(), deployment_id: deploymentId })
    ).run();

    const result = await runQualityGates(env, {
      deploymentId,
      environment:   opts.environment || env.ENVIRONMENT || 'production',
      urlUnderTest:  opts.url || (env.IAM_ORIGIN || '').replace(/\/$/, '') + '/health',
      commitSha:     opts.gitHash || null,
      initiatedBy:   'post_deploy_auto',
    });

    // Notify Sam if gates failed
    if (result.status === 'fail') {
      notifySam(env, {
        subject: `Quality gate FAILED — deployment ${deploymentId}`,
        body: `Environment: ${opts.environment || env.ENVIRONMENT}\nFailed: ${result.fail_count} | Warned: ${result.warn_count} | Passed: ${result.pass_count}\nRun ID: ${result.run_id}\n\nFailed checks:\n${result.results.filter(r => r.status === 'fail').map(r => `  ${r.metric_key}: expected ${r.expected_value}, got ${r.actual_value}`).join('\n')}`,
        category: 'quality_gate',
      });
    }

    return result;
  } catch (e) {
    console.error('[deployments] post-deploy quality checks failed:', e?.message ?? e);
  }
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

/**
 * Main dispatcher for /api/deployments/* routes.
 */
export async function handleDeploymentsApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  // ── /api/internal/git-status ──────────────────────────────────────────────
  if (path === '/api/internal/git-status' && method === 'GET') {
    return handleGitStatusRequest(request, env, ctx);
  }

  // ── GET /api/deployments/recent ───────────────────────────────────────────
  if (path === '/api/deployments/recent' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, timestamp, version, git_hash, description, status,
                deployed_by, environment, worker_name, notes, triggered_by
         FROM deployments ORDER BY timestamp DESC LIMIT ?`
      ).bind(limit).all();
      return jsonResponse({ deployments: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/deployments/pipeline-runs ────────────────────────────────────
  if (path === '/api/deployments/pipeline-runs' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
    try {
      const { results } = await env.DB.prepare(
        `SELECT pr.*, COUNT(s.id) AS step_count
         FROM cicd_pipeline_runs pr
         LEFT JOIN cicd_run_steps s ON s.run_id = pr.run_id
         GROUP BY pr.run_id
         ORDER BY pr.triggered_at DESC LIMIT ?`
      ).bind(limit).all();
      return jsonResponse({ runs: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/deployments/pipeline-runs/:run_id ────────────────────────────
  const pipelineRunMatch = path.match(/^\/api\/deployments\/pipeline-runs\/([^/]+)$/);
  if (pipelineRunMatch && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    const runId = pipelineRunMatch[1];
    try {
      const [run, steps] = await Promise.all([
        env.DB.prepare(`SELECT * FROM cicd_pipeline_runs WHERE run_id = ? LIMIT 1`).bind(runId).first(),
        env.DB.prepare(`SELECT * FROM cicd_run_steps WHERE run_id = ? ORDER BY tested_at ASC`).bind(runId).all().then(r => r.results || []),
      ]);
      if (!run) return jsonResponse({ error: 'Pipeline run not found' }, 404);
      return jsonResponse({ run, steps });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/deployments/quality-runs ─────────────────────────────────────
  if (path === '/api/deployments/quality-runs' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    const limit        = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
    const deploymentId = url.searchParams.get('deployment_id') || null;

    try {
      const query = deploymentId
        ? env.DB.prepare(`SELECT * FROM quality_runs WHERE deployment_id = ? ORDER BY started_at DESC LIMIT ?`).bind(deploymentId, limit)
        : env.DB.prepare(`SELECT * FROM quality_runs ORDER BY started_at DESC LIMIT ?`).bind(limit);
      const { results } = await query.all();
      return jsonResponse({ runs: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/deployments/quality-runs/:id ────────────────────────────────
  const qualityRunMatch = path.match(/^\/api\/deployments\/quality-runs\/([^/]+)$/);
  if (qualityRunMatch && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    const runId = qualityRunMatch[1];
    try {
      const [run, results] = await Promise.all([
        env.DB.prepare(`SELECT * FROM quality_runs WHERE id = ? LIMIT 1`).bind(runId).first(),
        env.DB.prepare(`SELECT * FROM quality_results WHERE run_id = ? ORDER BY status DESC`).bind(runId).all().then(r => r.results || []),
      ]);
      if (!run) return jsonResponse({ error: 'Quality run not found' }, 404);
      return jsonResponse({ run, results });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── POST /api/deployments/quality-run ─────────────────────────────────────
  // Trigger a quality gate run manually (Agent Sam or CI/CD)
  if (path === '/api/deployments/quality-run' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    try {
      const result = await runQualityGates(env, {
        deploymentId:  body.deployment_id  || null,
        pipelineRunId: body.pipeline_run_id || null,
        workspaceId:   body.workspace_id   || null,
        environment:   body.environment    || env.ENVIRONMENT || 'production',
        urlUnderTest:  body.url            || null,
        commitSha:     body.commit_sha     || null,
        gateSetId:     body.gate_set_id    || null,
        initiatedBy:   body.initiated_by   || 'manual',
      });
      return jsonResponse(result, result.status === 'fail' ? 424 : 200);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/deployments/health-checks ───────────────────────────────────
  if (path === '/api/deployments/health-checks' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    const deploymentId = url.searchParams.get('deployment_id') || null;
    const limit        = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    try {
      const query = deploymentId
        ? env.DB.prepare(`SELECT * FROM deployment_health_checks WHERE deployment_id = ? ORDER BY checked_at DESC LIMIT ?`).bind(deploymentId, limit)
        : env.DB.prepare(`SELECT * FROM deployment_health_checks ORDER BY checked_at DESC LIMIT ?`).bind(limit);
      const { results } = await query.all();
      return jsonResponse({ checks: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── POST /api/internal/record-deploy ─────────────────────────────────────
  if (path === '/api/internal/record-deploy' && method === 'POST') {
    const secretOk = isIngestSecretAuthorized(request, env);
    if (!secretOk) return jsonResponse({ error: 'Unauthorized system access' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB unavailable' }, 503);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const workerName  = projectIdFromEnv(env) || 'unknown';
    const environment = env.ENVIRONMENT || body.environment || 'production';
    const gitHash     = (body.git_hash  || body.gitHash  || '').trim();
    const versionId   = (body.version_id || body.version || '').trim();
    const triggeredBy = body.triggered_by || 'api_record_deploy';
    const notes       = body.notes || body.deployment_notes || '';
    const deployId    = 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);

    try {
      await env.DB.prepare(
        `INSERT INTO deployments
         (id, timestamp, version, git_hash, description, status, deployed_by,
          environment, deploy_time_seconds, worker_name, triggered_by, notes)
         VALUES (?, datetime('now'), ?, ?, 'Internal record-deploy (API)', 'success', ?,
                 ?, 0, ?, ?, ?)`
      ).bind(
        deployId,
        versionId   || deployId,
        gitHash     || null,
        triggeredBy,
        environment,
        workerName,
        triggeredBy,
        notes       || null
      ).run();

      appendCidiPipelineRunFromDeploy(env, {
        deploymentId: deployId,
        environment,
        gitHash:      gitHash || 'unknown',
        versionId:    versionId || deployId,
        description:  notes || 'deploy via script',
      });

      if (ctx?.waitUntil) {
        ctx.waitUntil(
          runPostDeployQualityChecks(env, deployId, { environment, gitHash })
            .catch(e => console.warn('[deployments] post-deploy checks:', e?.message))
        );
      }

      return jsonResponse({ ok: true, deployment_id: deployId });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/deployments/gates ────────────────────────────────────────────
  // Let Agent Sam inspect what gates exist
  if (path === '/api/deployments/gates' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    try {
      const [sets, gates] = await Promise.all([
        env.DB.prepare(`SELECT * FROM quality_gate_sets ORDER BY name ASC`).all().then(r => r.results || []),
        env.DB.prepare(`SELECT * FROM quality_gates ORDER BY gate_set_id, severity DESC, metric_key ASC`).all().then(r => r.results || []),
      ]);
      return jsonResponse({ gate_sets: sets, gates });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/deployments/tracking ─────────────────────────────────────────
  if (path === '/api/deployments/tracking' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM deployment_tracking ORDER BY created_at DESC LIMIT ?`
      ).bind(limit).all();
      return jsonResponse({ tracking: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: 'Deployment route not found', path }, 404);
}
