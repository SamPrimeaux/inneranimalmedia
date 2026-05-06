function safeJsonStringify(value) {
  if (value == null) return '{}';
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return '{}';
    try {
      JSON.parse(s);
      return s;
    } catch {
      return JSON.stringify({ value: s });
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

/**
 * @param {any} env
 * @param {{ jobName: string, cronExpression?: string|null, tenantId?: string|null, workspaceId?: string|null, metadata?: any }} args
 */
export async function startCronRun(env, args) {
  if (!env?.DB) return null;
  const jobName = args?.jobName != null ? String(args.jobName) : '';
  if (!jobName) return null;

  const cronExpression = args?.cronExpression != null ? String(args.cronExpression) : null;
  const tenantId = args?.tenantId != null ? String(args.tenantId) : null;
  const workspaceId = args?.workspaceId != null ? String(args.workspaceId) : null;
  const metadataJson = safeJsonStringify(args?.metadata ?? {});

  try {
    const row = await env.DB.prepare(
      `INSERT INTO agentsam_cron_runs (job_name, cron_expression, status, tenant_id, workspace_id, metadata_json)
       VALUES (?, ?, 'running', ?, ?, ?)
       RETURNING id`,
    )
      .bind(jobName, cronExpression, tenantId, workspaceId, metadataJson)
      .first();
    return row?.id ?? null;
  } catch (e) {
    console.warn('[cron-ledger] startCronRun failed', e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} runId
 * @param {{ rowsRead?: number, rowsWritten?: number, metadata?: any }} result
 */
export async function completeCronRun(env, runId, result = {}) {
  if (!env?.DB || !runId) return false;
  const rowsRead = Number(result?.rowsRead ?? 0) || 0;
  const rowsWritten = Number(result?.rowsWritten ?? 0) || 0;
  const metadataJson = safeJsonStringify(result?.metadata ?? {});

  try {
    await env.DB.prepare(
      `UPDATE agentsam_cron_runs
       SET status = 'completed',
           completed_at = unixepoch(),
           duration_ms = CASE
             WHEN started_at IS NOT NULL THEN (unixepoch() - started_at) * 1000
             ELSE duration_ms
           END,
           rows_read = ?,
           rows_written = ?,
           metadata_json = ?
       WHERE id = ?`,
    )
      .bind(rowsRead, rowsWritten, metadataJson, String(runId))
      .run();
    return true;
  } catch (e) {
    console.warn('[cron-ledger] completeCronRun failed', e?.message ?? e);
    return false;
  }
}

/**
 * @param {any} env
 * @param {string} runId
 * @param {any} error
 * @param {any} [metadata]
 */
export async function failCronRun(env, runId, error, metadata = {}) {
  if (!env?.DB || !runId) return false;
  const msg = error?.message != null ? String(error.message) : String(error ?? 'unknown_error');
  const metadataJson = safeJsonStringify(metadata ?? {});

  try {
    await env.DB.prepare(
      `UPDATE agentsam_cron_runs
       SET status = 'failed',
           completed_at = unixepoch(),
           duration_ms = CASE
             WHEN started_at IS NOT NULL THEN (unixepoch() - started_at) * 1000
             ELSE duration_ms
           END,
           error_message = ?,
           metadata_json = ?
       WHERE id = ?`,
    )
      .bind(msg.slice(0, 4000), metadataJson, String(runId))
      .run();
    return true;
  } catch (e) {
    console.warn('[cron-ledger] failCronRun failed', e?.message ?? e);
    return false;
  }
}

