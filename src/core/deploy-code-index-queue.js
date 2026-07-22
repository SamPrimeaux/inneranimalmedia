/**
 * Queue agentsam_code_index_job for chunk RAG (skip if chunk job already running).
 * Never touches canonical AST rows (`cidx_*` / source_type=ast_rag).
 * @param {any} env
 * @param {{
 *   workspaceId?: string|null,
 *   triggeredBy?: string,
 *   repoFullName?: string|null,
 *   userId?: string|null,
 *   branch?: string|null,
 * }} [opts]
 */
export async function queueCodeIndexJobAfterDeploy(env, opts = {}) {
  if (!env?.DB) return { ok: false, skipped: true, reason: 'no_db' };

  const ws = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  if (!ws) return { ok: false, skipped: true, reason: 'no_workspace' };

  try {
    const running = await env.DB.prepare(
      `SELECT id FROM agentsam_code_index_job
       WHERE status = 'running'
         AND COALESCE(workspace_id, '') = ?
         AND id NOT LIKE 'cidx_%'
         AND COALESCE(source_type, '') NOT IN ('ast_rag', 'ast_symbol_reembed')
       LIMIT 1`,
    )
      .bind(ws)
      .first()
      .catch(() => null);
    if (running?.id) {
      return { ok: true, skipped: true, reason: 'already_running', job_id: running.id };
    }

    let repo =
      opts.repoFullName != null && String(opts.repoFullName).trim()
        ? String(opts.repoFullName).trim()
        : '';
    if (!repo) {
      const aw = await env.DB.prepare(
        `SELECT github_repo FROM agentsam_workspace WHERE id = ? AND status = 'active' LIMIT 1`,
      )
        .bind(ws)
        .first()
        .catch(() => null);
      if (aw?.github_repo) repo = String(aw.github_repo).trim();
    }
    if (!repo) {
      const w = await env.DB.prepare(`SELECT github_repo FROM workspaces WHERE id = ? LIMIT 1`)
        .bind(ws)
        .first()
        .catch(() => null);
      if (w?.github_repo) repo = String(w.github_repo).trim();
    }
    if (!repo) {
      return { ok: false, error: 'repo_full_name_required', workspace_id: ws };
    }

    const id = `cij_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const cols = await env.DB.prepare(`PRAGMA table_info(agentsam_code_index_job)`)
      .all()
      .catch(() => ({ results: [] }));
    const names = new Set((cols.results || []).map((r) => String(r.name).toLowerCase()));
    const triggeredBy = opts.triggeredBy || 'deploy';
    let userId = opts.userId != null ? String(opts.userId).trim() : '';
    if (!userId) {
      const owner = await env.DB.prepare(
        `SELECT user_id FROM workspaces WHERE id = ? LIMIT 1`,
      )
        .bind(ws)
        .first()
        .catch(() => null);
      if (owner?.user_id) userId = String(owner.user_id).trim();
    }
    if (!userId) {
      const awOwner = await env.DB.prepare(
        `SELECT tenant_id FROM agentsam_workspace WHERE id = ? LIMIT 1`,
      )
        .bind(ws)
        .first()
        .catch(() => null);
      void awOwner;
    }
    if (!userId) {
      return { ok: false, error: 'user_id_required', workspace_id: ws };
    }

    // Prefer a full typed insert when columns exist (production schema).
    if (
      names.has('triggered_by') &&
      names.has('repo_full_name') &&
      names.has('source_type') &&
      names.has('user_id')
    ) {
      const hasIdx = names.has('indexed_file_count');
      const hasPct = names.has('progress_percent');
      const hasChunks = names.has('chunk_count');
      const hasVb = names.has('vector_backend');

      const colList = [
        'id',
        'user_id',
        'workspace_id',
        'status',
        'triggered_by',
        'repo_full_name',
        'source_type',
        ...(hasVb ? ['vector_backend'] : []),
        ...(hasIdx ? ['indexed_file_count'] : []),
        ...(hasPct ? ['progress_percent'] : []),
        ...(hasChunks ? ['chunk_count'] : []),
        'updated_at',
      ];
      const placeholders = colList.map((c) =>
        c === 'updated_at' ? "datetime('now')" : c === 'status' ? "'idle'" : '?',
      );
      const binds = [];
      for (const c of colList) {
        if (c === 'updated_at' || c === 'status') continue;
        if (c === 'id') binds.push(id);
        else if (c === 'user_id') binds.push(userId);
        else if (c === 'workspace_id') binds.push(ws);
        else if (c === 'triggered_by') binds.push(triggeredBy);
        else if (c === 'repo_full_name') binds.push(repo);
        else if (c === 'source_type') binds.push('chunks');
        else if (c === 'vector_backend') binds.push('supabase_pgvector');
        else if (c === 'indexed_file_count' || c === 'progress_percent' || c === 'chunk_count')
          binds.push(0);
      }

      await env.DB.prepare(
        `INSERT INTO agentsam_code_index_job (${colList.join(', ')})
         VALUES (${placeholders.join(', ')})`,
      )
        .bind(...binds)
        .run();
    } else if (names.has('triggered_by') && names.has('user_id')) {
      await env.DB.prepare(
        `INSERT INTO agentsam_code_index_job (id, user_id, workspace_id, status, triggered_by, updated_at)
         VALUES (?, ?, ?, 'idle', ?, datetime('now'))`,
      )
        .bind(id, userId, ws, triggeredBy)
        .run();
    } else if (names.has('user_id')) {
      await env.DB.prepare(
        `INSERT INTO agentsam_code_index_job (id, user_id, workspace_id, status, updated_at)
         VALUES (?, ?, ?, 'idle', datetime('now'))`,
      )
        .bind(id, userId, ws)
        .run();
    } else {
      return { ok: false, error: 'agentsam_code_index_job_schema_unsupported' };
    }

    console.log('[compaction]', 'agentsam_code_index_job', {
      table: 'agentsam_code_index_job',
      job_id: id,
      workspace_id: ws,
      repo,
    });
    return { ok: true, job_id: id, workspace_id: ws, repo_full_name: repo };
  } catch (e) {
    console.warn('[deploy-code-index-queue]', e?.message ?? e);
    return { ok: false, error: String(e?.message || e) };
  }
}
