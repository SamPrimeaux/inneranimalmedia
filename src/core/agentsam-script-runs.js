/**
 * Insert / finalize rows in agentsam_script_runs whenever a registered agentsam_scripts
 * entry is executed (Worker, CI callback, or manual API). Keeps audit trail aligned with registry.
 *
 * CLI-only runners (e.g. register-agentsam-scripts.mjs) do not pass through the Worker; add
 * optional INSERTs there or in CI if you need the same audit trail for local runs.
 */

/**
 * @param {any} db
 * @param {{
 *   scriptId: string,
 *   workspaceId: string,
 *   triggeredBy?: string,
 *   triggerSource?: 'agent_sam'|'cursor'|'manual'|'github_push'|'scheduled'|'cicd',
 *   environment?: 'production'|'sandbox'|'staging'|'dev',
 *   cicdRunId?: string | null,
 *   gitCommitSha?: string | null,
 *   gitBranch?: string | null,
 * }} row
 * @returns {Promise<{ id: string } | null>}
 */
export async function startAgentsamScriptRun(db, row) {
  if (!db || !row?.scriptId || !row?.workspaceId) return null;
  const triggerSource = row.triggerSource ?? 'agent_sam';
  const triggeredBy = row.triggeredBy ?? 'agent';
  const environment = row.environment ?? 'production';
  try {
    const inserted = await db
      .prepare(
        `INSERT INTO agentsam_script_runs (
           script_id, workspace_id, triggered_by, trigger_source,
           cicd_run_id, git_commit_sha, git_branch, environment,
           status, started_at
         ) VALUES (?,?,?,?,?,?,?,?, 'running', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         RETURNING id`,
      )
      .bind(
        row.scriptId,
        row.workspaceId,
        triggeredBy,
        triggerSource,
        row.cicdRunId ?? null,
        row.gitCommitSha ?? null,
        row.gitBranch ?? 'main',
        environment,
      )
      .first();
    const id = inserted?.id;
    return id ? { id: String(id) } : null;
  } catch (e) {
    console.warn('[agentsam_script_runs] start failed', e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} db
 * @param {string} runId
 * @param {{
 *   status: 'passed'|'failed'|'skipped'|'cancelled',
 *   exitCode?: number | null,
 *   durationMs?: number | null,
 *   outputSummary?: string | null,
 *   errorMessage?: string | null,
 *   costUsd?: number | null,
 * }} fin
 */
export async function finalizeAgentsamScriptRun(db, runId, fin) {
  if (!db || !runId || !fin?.status) return;
  try {
    await db
      .prepare(
        `UPDATE agentsam_script_runs SET
           status = ?,
           exit_code = ?,
           duration_ms = ?,
           output_summary = ?,
           error_message = ?,
           cost_usd = COALESCE(?, cost_usd),
           completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`,
      )
      .bind(
        fin.status,
        fin.exitCode ?? null,
        fin.durationMs ?? null,
        fin.outputSummary ?? null,
        fin.errorMessage ?? null,
        fin.costUsd ?? null,
        runId,
      )
      .run();
  } catch (e) {
    console.warn('[agentsam_script_runs] finalize failed', e?.message ?? e);
  }
}
