/**
 * Queue agentsam_code_index_job after successful deploy (skip if already running).
 * @param {any} env
 * @param {{ workspaceId?: string|null, triggeredBy?: string }} [opts]
 */
export async function queueCodeIndexJobAfterDeploy(env, opts = {}) {
  if (!env?.DB) return { ok: false, skipped: true, reason: 'no_db' };

  const ws = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  if (!ws) return { ok: false, skipped: true, reason: 'no_workspace' };

  try {
    const running = await env.DB.prepare(
      `SELECT id FROM agentsam_code_index_job
       WHERE status = 'running' AND COALESCE(workspace_id, '') = ?
       LIMIT 1`,
    )
      .bind(ws)
      .first()
      .catch(() => null);
    if (running?.id) {
      return { ok: true, skipped: true, reason: 'already_running', job_id: running.id };
    }

    const id = `cij_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const cols = await env.DB.prepare(`PRAGMA table_info(agentsam_code_index_job)`).all().catch(() => ({ results: [] }));
    const names = new Set((cols.results || []).map((r) => String(r.name).toLowerCase()));

    if (names.has('triggered_by')) {
      await env.DB.prepare(
        `INSERT INTO agentsam_code_index_job (id, workspace_id, status, triggered_by, updated_at)
         VALUES (?, ?, 'idle', ?, datetime('now'))`,
      )
        .bind(id, ws, opts.triggeredBy || 'deploy')
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO agentsam_code_index_job (id, workspace_id, status, updated_at)
         VALUES (?, ?, 'idle', datetime('now'))`,
      )
        .bind(id, ws)
        .run();
    }

    console.log('[compaction]', 'agentsam_code_index_job', { table: 'agentsam_code_index_job', job_id: id });
    return { ok: true, job_id: id };
  } catch (e) {
    console.warn('[deploy-code-index-queue]', e?.message ?? e);
    return { ok: false, error: String(e?.message || e) };
  }
}
