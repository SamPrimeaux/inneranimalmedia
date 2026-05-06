import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';

function mondayUtcStart(d = new Date()) {
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = base.getUTCDay();
  base.setUTCDate(base.getUTCDate() - ((day + 6) % 7));
  return base;
}

function normalizeProvider(p) {
  const s = p != null ? String(p).trim() : '';
  return s || 'unknown';
}

function safeJson(value, fallback = '[]') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

export async function runAgentsamWebhookWeeklyRollup(env) {
  if (!env?.DB) return;

  const cronExpression = '10 0 * * 1';
  const runId = await startCronRun(env, {
    jobName: 'agentsam_webhook_weekly_rollup',
    cronExpression,
    tenantId: null,
    workspaceId: null,
    metadata: { scope: 'tenant', note: 'tenant-level until workspace unique migration (263)' },
  });

  const now = new Date();
  const thisMonday = mondayUtcStart(now);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const weekStart = lastMonday.toISOString().slice(0, 10);
  const weekEnd = thisMonday.toISOString().slice(0, 10);

  let rowsRead = 0;
  let rowsWritten = 0;

  try {
    // Tenant-level aggregate (workspace_id = NULL) over last complete UTC week.
    const { results: groups = [] } = await env.DB.prepare(
      `
      SELECT
        COALESCE(tenant_id, 'system') AS tenant_id,
        COALESCE(provider, 'unknown') AS provider,
        COUNT(*) AS total_received,
        SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) AS total_processed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS total_failed,
        COALESCE(SUM(COALESCE(cost_usd, 0)), 0) AS total_cost_usd
      FROM agentsam_webhook_events
      WHERE datetime(COALESCE(processed_at, received_at, created_at, datetime('now'))) >= datetime(?)
        AND datetime(COALESCE(processed_at, received_at, created_at, datetime('now'))) < datetime(?)
      GROUP BY COALESCE(tenant_id, 'system'), COALESCE(provider, 'unknown')
      `,
    )
      .bind(weekStart, weekEnd)
      .all()
      .catch(() => ({ results: [] }));

    rowsRead = groups.length;

    for (const g of groups) {
      const tenantId = g?.tenant_id != null ? String(g.tenant_id) : 'system';
      const provider = normalizeProvider(g?.provider);
      const workspaceId = null;

      const topEventTypes = await env.DB.prepare(
        `
        SELECT COALESCE(event_type, 'unknown') AS key, COUNT(*) AS c
        FROM agentsam_webhook_events
        WHERE datetime(COALESCE(processed_at, received_at, created_at, datetime('now'))) >= datetime(?)
          AND datetime(COALESCE(processed_at, received_at, created_at, datetime('now'))) < datetime(?)
          AND COALESCE(tenant_id, 'system') = ?
          AND COALESCE(provider, 'unknown') = ?
        GROUP BY COALESCE(event_type, 'unknown')
        ORDER BY c DESC
        LIMIT 20
        `,
      )
        .bind(weekStart, weekEnd, tenantId, provider)
        .all()
        .catch(() => ({ results: [] }));

      const topRepos = await env.DB.prepare(
        `
        SELECT COALESCE(repo, 'unknown') AS key, COUNT(*) AS c
        FROM agentsam_webhook_events
        WHERE datetime(COALESCE(processed_at, received_at, created_at, datetime('now'))) >= datetime(?)
          AND datetime(COALESCE(processed_at, received_at, created_at, datetime('now'))) < datetime(?)
          AND COALESCE(tenant_id, 'system') = ?
          AND COALESCE(provider, 'unknown') = ?
        GROUP BY COALESCE(repo, 'unknown')
        ORDER BY c DESC
        LIMIT 20
        `,
      )
        .bind(weekStart, weekEnd, tenantId, provider)
        .all()
        .catch(() => ({ results: [] }));

      const topEventTypesJson = safeJson(
        (topEventTypes.results || []).map((r) => ({ key: r.key, count: Number(r.c) || 0 })),
      );
      const topReposJson = safeJson(
        (topRepos.results || []).map((r) => ({ key: r.key, count: Number(r.c) || 0 })),
      );

      // Live unique key is UNIQUE(tenant_id, week_start, provider). Keep tenant-level only until 263.
      const ins = await env.DB.prepare(
        `
        INSERT INTO agentsam_webhook_weekly (
          tenant_id,
          workspace_id,
          week_start,
          week_end,
          provider,
          total_received,
          total_processed,
          total_failed,
          total_cost_usd,
          top_event_types,
          top_repos,
          notes,
          rolled_up_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
        ON CONFLICT(tenant_id, week_start, provider) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          week_end = excluded.week_end,
          total_received = excluded.total_received,
          total_processed = excluded.total_processed,
          total_failed = excluded.total_failed,
          total_cost_usd = excluded.total_cost_usd,
          top_event_types = excluded.top_event_types,
          top_repos = excluded.top_repos,
          notes = excluded.notes,
          rolled_up_at = excluded.rolled_up_at
        `,
      )
        .bind(
          tenantId,
          workspaceId,
          weekStart,
          weekEnd,
          provider,
          Number(g?.total_received) || 0,
          Number(g?.total_processed) || 0,
          Number(g?.total_failed) || 0,
          Number(g?.total_cost_usd) || 0,
          topEventTypesJson,
          topReposJson,
          'tenant_level_until_workspace_unique_migration_263',
        )
        .run()
        .catch(() => null);

      rowsWritten += Number(ins?.meta?.changes ?? ins?.changes ?? 0) || 0;
    }

    if (runId) {
      await completeCronRun(env, runId, {
        rowsRead,
        rowsWritten,
        metadata: { weekStart, weekEnd, groups: rowsRead },
      });
    }
  } catch (e) {
    if (runId) await failCronRun(env, runId, e, { weekStart, weekEnd, rowsRead, rowsWritten });
    console.warn('[cron] agentsam_webhook_weekly rollup', e?.message ?? e);
  }
}
