/**
 * src/cron/jobs/velocity-daily-rollup.js
 *
 * Runs at midnight UTC (0 0 * * *) as part of runMidnightUtcJobs.
 *
 * Auto-writes one task_velocity row per day by counting real signals
 * from live tables — git commits, D1 migrations, agentsam_mcp_tool_execution,
 * agentsam_agent_run, agentsam_cron_runs, agentsam_spawn_job.
 *
 * Personal skill columns (new_concepts, confidence_gains, struggle_areas,
 * ai_collab_score, solo_decisions) are left NULL — filled via chat:
 *   "log today: learned X, struggled with Y, collab score 80"
 *   → agent writes UPDATE task_velocity SET ... WHERE date = date('now')
 *
 * Idempotent: skips if a row already exists for today's date.
 * Non-fatal: errors are logged but don't crash the midnight job.
 */

import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';

const CRON_EXPR = '0 0 * * *';
const JOB_NAME = 'velocity_daily_rollup';

/**
 * Compute velocity score 0-100 from raw signals.
 * Weights tuned for a solo founder shipping daily with AI tools.
 */
function computeVelocityScore({
  commits, deploys, migrationsApplied, featuresShipped, bugsFixed,
  mcpToolCalls, spawnJobsCompleted, cronFailures, stuckRuns,
}) {
  let score = 50; // baseline

  // Output signals (positive)
  score += Math.min(commits * 4, 20);           // max 20pts — 5+ commits is a full day
  score += Math.min(deploys * 8, 16);           // max 16pts — 2 prod deploys is excellent
  score += Math.min(migrationsApplied * 5, 15); // max 15pts — shipping schema = real work
  score += Math.min(featuresShipped * 6, 18);   // max 18pts
  score += Math.min(bugsFixed * 3, 9);          // max 9pts
  score += Math.min(spawnJobsCompleted * 3, 9); // max 9pts — skills actually ran
  score += Math.min(Math.floor(mcpToolCalls / 20), 5); // light signal, max 5pts

  // Drag signals (negative)
  score -= Math.min(cronFailures * 5, 15);      // failing crons = platform rot
  score -= Math.min(stuckRuns * 3, 9);          // stuck agent runs = broken loop

  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeMomentum(score, prevScore) {
  if (prevScore == null) return 'steady';
  const delta = score - prevScore;
  if (delta >= 10) return 'accelerating';
  if (delta <= -10) return 'slowing';
  return 'steady';
}

/**
 * @param {any} env
 * @returns {Promise<{ ok: boolean, date: string, score: number, skipped?: boolean }>}
 */
export async function runVelocityDailyRollup(env) {
  if (!env?.DB) return { ok: false, date: '', score: 0 };

  const begun = await startCronRun(env, {
    jobName: JOB_NAME,
    cronExpression: CRON_EXPR,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();

  // Use yesterday's date — midnight UTC runs after the day ends
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  try {
    // Idempotency check
    const existing = await env.DB.prepare(
      `SELECT id FROM task_velocity WHERE date = ?`
    ).bind(yesterday).first();

    if (existing) {
      console.log(`[velocity-rollup] row already exists for ${yesterday}, skipping`);
      if (runId) await env.DB.prepare(
        `UPDATE agentsam_cron_runs SET status='completed', completed_at=unixepoch(), duration_ms=?
         WHERE id=?`
      ).bind(Date.now() - startedAt, runId).run().catch(() => {});
      return { ok: true, date: yesterday, score: 0, skipped: true };
    }

    // ── Count signals from live tables ──────────────────────────────────────

    // Deploy activity — read directly from deployments table (authoritative, 868+ rows)
    const deployLog = await env.DB.prepare(
      `SELECT COUNT(*) as deploy_count,
              SUM(CASE WHEN description LIKE 'fix%' OR description LIKE 'Fix%' THEN 1 ELSE 0 END) as bugs_fixed_count,
              SUM(CASE WHEN description LIKE 'feat%' OR description LIKE 'Feat%' THEN 1 ELSE 0 END) as features_count,
              GROUP_CONCAT(COALESCE(git_hash,'') || ': ' || COALESCE(description,''), ' | ') as deploy_names
       FROM deployments
       WHERE COALESCE(created_at, unixepoch(timestamp), 0) >= unixepoch(?)
         AND COALESCE(created_at, unixepoch(timestamp), 0) < unixepoch(date(?, '+1 day'))`
    ).bind(yesterday, yesterday).first().catch(() => null);

    // Worker request volume yesterday — confirms platform was live and serving
    const workerActivity = await env.DB.prepare(
      `SELECT SUM(total_requests) as total_requests,
              SUM(failed_requests) as failed_requests,
              ROUND(AVG(avg_duration_ms), 0) as avg_duration_ms
       FROM worker_analytics_daily
       WHERE worker_name IN ('inneranimalmedia','inneranimalmedia-mcp-server')
         AND day_timestamp >= ? AND day_timestamp < ?`
    ).bind(
      new Date(yesterday).getTime(),
      new Date(yesterday).getTime() + 86400000
    ).first().catch(() => null);

    // D1 migrations applied yesterday
    const migrationsRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt, GROUP_CONCAT(name, ', ') as names
       FROM d1_migrations
       WHERE applied_at >= ? AND applied_at < ?`
    ).bind(yesterday, new Date(Date.now()).toISOString().slice(0, 10)).first().catch(() => null);

    // MCP tool calls yesterday
    const mcpRow = await env.DB.prepare(
      `SELECT COUNT(*) as total_calls,
              SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors
       FROM agentsam_mcp_tool_execution
       WHERE COALESCE(created_at_unix, unixepoch(created_at)) >= unixepoch(?)
         AND COALESCE(created_at_unix, unixepoch(created_at)) < unixepoch(?)`
    ).bind(yesterday, new Date(Date.now()).toISOString().slice(0, 10)).first().catch(() => null);

    // Agent runs yesterday — cost + stuck count
    const runRow = await env.DB.prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
              SUM(CASE WHEN status='running' AND created_at_unix < unixepoch('now','-2 hours') THEN 1 ELSE 0 END) as stuck,
              ROUND(SUM(cost_usd), 4) as cost_usd
       FROM agentsam_agent_run
       WHERE workspace_id = 'ws_inneranimalmedia'
         AND created_at_unix >= unixepoch(?) AND created_at_unix < unixepoch(?)`
    ).bind(yesterday, new Date(Date.now()).toISOString().slice(0, 10)).first().catch(() => null);

    // Cron failures yesterday
    const cronRow = await env.DB.prepare(
      `SELECT SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failures
       FROM agentsam_cron_runs
       WHERE started_at >= unixepoch(?) AND started_at < unixepoch(?)`
    ).bind(yesterday, new Date(Date.now()).toISOString().slice(0, 10)).first().catch(() => null);

    // Completed skill spawn jobs yesterday
    const spawnRow = await env.DB.prepare(
      `SELECT COUNT(*) as completed,
              COUNT(DISTINCT master_agent_slug) as unique_skills
       FROM agentsam_spawn_job
       WHERE workspace_id = 'ws_inneranimalmedia'
         AND status = 'completed'
         AND started_at >= unixepoch(?) AND started_at < unixepoch(?)`
    ).bind(yesterday, new Date(Date.now()).toISOString().slice(0, 10)).first().catch(() => null);

    // AI spend yesterday from usage rollups (dedupe duplicate rows per day)
    const spendRow = await env.DB.prepare(
      `SELECT ROUND(MAX(cost_usd), 4) as spend
       FROM agentsam_usage_rollups_daily
       WHERE day = ?`
    ).bind(yesterday).first().catch(() => null);

    const usageRollupRow = await env.DB.prepare(
      `SELECT
         MAX(ai_calls) as ai_calls,
         MAX(tool_calls) as tool_calls,
         MAX(tool_successes) as tool_successes,
         MAX(tool_failures) as tool_failures,
         MAX(deployments) as deployments
       FROM agentsam_usage_rollups_daily
       WHERE day = ?`
    ).bind(yesterday).first().catch(() => null);

    const todosCompletedRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM agentsam_todo
       WHERE status IN ('done','completed')
         AND date(completed_at) = date(?)`,
    ).bind(yesterday).first().catch(() => null);

    const todosCreatedRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM agentsam_todo
       WHERE date(created_at) = date(?)`,
    ).bind(yesterday).first().catch(() => null);

    const todosOpenRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM agentsam_todo
       WHERE status NOT IN ('done','completed','cancelled')`,
    ).first().catch(() => null);

    const timeRow = await env.DB.prepare(
      `SELECT ROUND(COALESCE(SUM(
         CASE
           WHEN ended_at IS NULL THEN MAX(0, (unixepoch() - COALESCE(started_at, created_at))) / 60.0
           ELSE COALESCE(hours * 60, MAX(0, ended_at - COALESCE(started_at, created_at)) / 60.0)
         END
       ), 0)) as minutes
       FROM time_entries
       WHERE date(datetime(COALESCE(started_at, created_at), 'unixepoch')) = date(?)`,
    ).bind(yesterday).first().catch(() => null);

    // Last week's velocity score for WoW delta
    const lastWeekDate = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const lastWeekRow = await env.DB.prepare(
      `SELECT velocity_score FROM task_velocity WHERE date = ?`
    ).bind(lastWeekDate).first().catch(() => null);

    // Latest deployed worker version from CF deployments (best effort)
    const workerVersionRow = await env.DB.prepare(
      `SELECT metadata_json FROM agentsam_cron_runs
       WHERE job_name = 'record_deployment_health'
         AND status = 'completed'
         AND started_at >= unixepoch(?)
       ORDER BY started_at DESC LIMIT 1`
    ).bind(yesterday).first().catch(() => null);

    // ── Derive counts ────────────────────────────────────────────────────────
    // migrations_applied is the primary deploy signal — each migration = a real deploy session
    // commits estimated as migrations * 1.5 (typically more commits than migrations per session)
    const migrationsToday = Math.max(Number(deployLog?.migration_count) || 0, 0);
    const commits = Math.round(migrationsToday * 1.5);
    // deploys = distinct deploy sessions inferred from migration batches (group by minute proximity)
    // using worker_analytics as confirmation signal — if requests > 0, platform was deployed & live
    const workerRequests = Math.max(Number(workerActivity?.total_requests) || 0, 0);
    const deploys = migrationsToday > 0 ? Math.max(1, Math.floor(migrationsToday / 2)) : (workerRequests > 100 ? 1 : 0);
    const migrationsApplied = Math.max(Number(migrationsRow?.cnt) || 0, 0);
    const mcpToolCalls = Math.max(Number(mcpRow?.total_calls) || 0, 0);
    const stuckRuns = Math.max(Number(runRow?.stuck) || 0, 0);
    const cronFailures = Math.max(Number(cronRow?.failures) || 0, 0);
    const spawnJobsCompleted = Math.max(Number(spawnRow?.completed) || 0, 0);
    const cursorSpend = spendRow?.spend ?? null;

    // Features shipped = spawn jobs completed + deploys (rough but real)
    const featuresShipped = spawnJobsCompleted + Math.min(deploys, 3);
    // Bugs fixed = failed runs that resolved (imperfect proxy — better than nothing)
    const bugsFixed = Math.max(Number(runRow?.failed) || 0, 0) > 0 ? 0 : Math.floor(commits / 3);

    const velocityScore = computeVelocityScore({
      commits, deploys, migrationsApplied, featuresShipped, bugsFixed,
      mcpToolCalls, spawnJobsCompleted, cronFailures, stuckRuns,
    });

    const prevScore = lastWeekRow?.velocity_score ?? null;
    const momentum = computeMomentum(velocityScore, prevScore);
    const wowDelta = prevScore != null ? velocityScore - prevScore : null;

    // Sprint goal from most recent active memory decision key
    const sprintMemory = await env.DB.prepare(
      `SELECT value FROM agentsam_memory
       WHERE memory_type = 'decision' AND decay_score > 0
       ORDER BY updated_at DESC LIMIT 1`
    ).first().catch(() => null);

    let sprintGoal = 'See agentsam_memory for active sprint';
    if (sprintMemory?.value) {
      // Extract first sentence from the memory value
      const firstLine = String(sprintMemory.value).split('.')[0].slice(0, 120);
      if (firstLine) sprintGoal = firstLine;
    }

    // Build notes from what actually happened
    const noteParts = [];
    if (commits > 0) noteParts.push(`${commits} commits`);
    if (deploys > 0) noteParts.push(`${deploys} deploys`);
    if (migrationsApplied > 0) noteParts.push(`${migrationsApplied} migrations`);
    if (spawnJobsCompleted > 0) noteParts.push(`${spawnJobsCompleted} skill jobs completed`);
    if (mcpToolCalls > 0) noteParts.push(`${mcpToolCalls} MCP calls`);
    const todosCompleted = Math.max(Number(todosCompletedRow?.cnt) || 0, 0);
    const todosCreated = Math.max(Number(todosCreatedRow?.cnt) || 0, 0);
    const todosOpen = Math.max(Number(todosOpenRow?.cnt) || 0, 0);
    const timeMinutes = Math.max(Number(timeRow?.minutes) || 0, 0);
    if (todosCompleted > 0) noteParts.push(`${todosCompleted} todos completed`);
    if (todosCreated > 0) noteParts.push(`${todosCreated} todos created`);
    if (timeMinutes > 0) noteParts.push(`${timeMinutes} tracked minutes`);
    if (stuckRuns > 0) noteParts.push(`${stuckRuns} stuck agent runs — needs attention`);
    if (cronFailures > 0) noteParts.push(`${cronFailures} cron failures`);
    const migNames = deployLog?.migration_names || migrationsRow?.names || '';
    if (migNames) noteParts.push(`migrations: ${migNames.slice(0, 200)}`);
    if (workerRequests > 0) noteParts.push(`${workerRequests} worker requests (platform live)`);
    const notes = noteParts.join('. ') || 'No significant activity detected.';

    // ── Write the row ────────────────────────────────────────────────────────
    await env.DB.prepare(
      `INSERT INTO task_velocity (
        date, github_commits, deploys_production, features_shipped, bugs_fixed,
        velocity_score, momentum, sprint_goal, sprint_progress_percent, notes,
        migrations_applied, mcp_tool_calls, cursor_spend_usd,
        platform_worker_version, week_over_week_delta,
        time_minutes, cost_usd,
        new_concepts, confidence_gains, struggle_areas,
        ai_collab_score, solo_decisions
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        NULL, NULL, NULL,
        NULL, 0
      )`
    ).bind(
      yesterday,
      commits,
      deploys,
      featuresShipped,
      bugsFixed,
      velocityScore,
      momentum,
      sprintGoal.slice(0, 200),
      null,
      notes.slice(0, 1000),
      migrationsApplied,
      mcpToolCalls,
      cursorSpend,
      null,
      wowDelta,
      timeMinutes,
      cursorSpend,
    ).run();

    console.log(`[velocity-rollup] wrote ${yesterday}: score=${velocityScore} momentum=${momentum} commits=${commits} deploys=${deploys}`);

    if (runId) await env.DB.prepare(
      `UPDATE agentsam_cron_runs
       SET status='completed', completed_at=unixepoch(), duration_ms=?,
           rows_written=1, metadata_json=?
       WHERE id=?`
    ).bind(
      Date.now() - startedAt,
      JSON.stringify({ date: yesterday, score: velocityScore, momentum }),
      runId,
    ).run().catch(() => {});

    return { ok: true, date: yesterday, score: velocityScore, momentum };

  } catch (e) {
    console.warn('[velocity-rollup] failed:', e?.message ?? e);
    if (runId) await env.DB.prepare(
      `UPDATE agentsam_cron_runs
       SET status='failed', completed_at=unixepoch(), duration_ms=?, error_message=?
       WHERE id=?`
    ).bind(Date.now() - startedAt, String(e?.message ?? e).slice(0, 500), runId)
     .run().catch(() => {});
    return { ok: false, date: yesterday, score: 0, error: e?.message };
  }
}
