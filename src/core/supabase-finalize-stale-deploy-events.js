/**
 * Cancel stale Supabase build_deploy_events stuck in deploy_started/running past cutoff.
 * Uses fetch only — safe for Cloudflare Workers and Node.
 *
 * Ledger hygiene: stale detection uses `created_at < cutoff` (row insertion time is stable for timeouts).
 * Deploy duration elsewhere should use `started_at` / `completed_at`; here we prefer `started_at` when
 * computing `age_minutes` in output_summary (fallback to `created_at`).
 *
 * @param {{
 *   supabaseUrl: string,
 *   serviceKey: string,
 *   tenantId: string,
 *   workspaceId: string,
 *   mode: string,
 *   olderThanMinutes?: number | null,
 *   olderThanHours?: number | null,
 *   dryRun?: boolean,
 *   commitShort?: string | null,
 * }} opts
 * @returns {Promise<{ stale_found: number, cancelled_count: number, skipped_count: number, ids_cancelled: string[], cutoff_iso: string }>}
 */
export async function finalizeStaleDeployEvents(opts) {
  const supabaseUrl = String(opts.supabaseUrl ?? '').trim().replace(/\/$/, '');
  const serviceKey = String(opts.serviceKey ?? '').trim();
  const tenantId = String(opts.tenantId ?? '').trim();
  const workspaceId = String(opts.workspaceId ?? '').trim();
  const mode = String(opts.mode ?? 'manual').trim();
  const dryRun = Boolean(opts.dryRun);
  const commitShort = opts.commitShort != null ? String(opts.commitShort).slice(0, 12) : 'unknown';

  const olderThanHours = opts.olderThanHours != null ? Number(opts.olderThanHours) : null;
  const olderThanMinutes =
    opts.olderThanMinutes != null ? Number(opts.olderThanMinutes) : olderThanHours != null ? null : 30;

  let cutoffMs;
  if (olderThanHours != null && Number.isFinite(olderThanHours) && olderThanHours > 0) {
    cutoffMs = Date.now() - olderThanHours * 3600000;
  } else if (olderThanMinutes != null && Number.isFinite(olderThanMinutes) && olderThanMinutes > 0) {
    cutoffMs = Date.now() - olderThanMinutes * 60000;
  } else {
    cutoffMs = Date.now() - 30 * 60000;
  }

  const cutoffIso = new Date(cutoffMs).toISOString();

  const empty = {
    stale_found: 0,
    cancelled_count: 0,
    skipped_count: 0,
    ids_cancelled: [],
    cutoff_iso: cutoffIso,
  };

  if (!supabaseUrl || !serviceKey || !tenantId || !workspaceId || tenantId === 'system' || workspaceId === 'system') {
    return { ...empty, skipped: true, reason: 'missing_scope_or_supabase' };
  }

  const enc = encodeURIComponent;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
  };

  const listQuery = [
    `tenant_id=eq.${enc(tenantId)}`,
    `workspace_id=eq.${enc(workspaceId)}`,
    `event_type=eq.deploy_started`,
    `status=eq.running`,
    `created_at=lt.${enc(cutoffIso)}`,
    `select=*`,
  ].join('&');

  const listUrl = `${supabaseUrl}/rest/v1/build_deploy_events?${listQuery}`;
  const listRes = await fetch(listUrl, { method: 'GET', headers });
  const listText = await listRes.text();
  let staleRows = [];
  try {
    staleRows = listText ? JSON.parse(listText) : [];
  } catch {
    staleRows = [];
  }
  if (!listRes.ok) {
    throw new Error(`finalize_stale list ${listRes.status}: ${listText.slice(0, 400)}`);
  }
  if (!Array.isArray(staleRows)) staleRows = [];

  let cancelled_count = 0;
  let skipped_count = 0;
  const ids_cancelled = [];

  for (const row of staleRows) {
    const id = row?.id != null ? String(row.id) : '';
    if (!id) continue;

    const runGroupId = extractRunGroupId(row);
    if (!runGroupId) {
      skipped_count += 1;
      continue;
    }

    const rgCol = encodeURIComponent('metadata_jsonb->>run_group_id');
    const termUrl = `${supabaseUrl}/rest/v1/build_deploy_events?tenant_id=eq.${enc(tenantId)}&workspace_id=eq.${enc(workspaceId)}&${rgCol}=eq.${enc(runGroupId)}&or=(status.eq.passed,status.eq.failed,status.eq.cancelled)&select=id`;
    const termRes = await fetch(termUrl, { method: 'GET', headers });
    const termText = await termRes.text();
    let terminals = [];
    try {
      terminals = termText ? JSON.parse(termText) : [];
    } catch {
      terminals = [];
    }
    if (!termRes.ok) {
      skipped_count += 1;
      continue;
    }

    if (Array.isArray(terminals) && terminals.length > 0) {
      skipped_count += 1;
      continue;
    }

    const ageMinutes = deployAgeMinutesForSummary(row);

    let meta = {};
    try {
      meta =
        typeof row.metadata_jsonb === 'object' && row.metadata_jsonb !== null
          ? row.metadata_jsonb
          : JSON.parse(row.metadata_jsonb || '{}');
    } catch {
      meta = {};
    }

    const cleanup = {
      cleaned_at: new Date().toISOString(),
      mode,
      reason: 'stale_running_timeout',
      cutoff: cutoffIso,
      previous_status: 'running',
    };

    const mergedMeta = { ...meta, cleanup };

    const output_summary = [
      'status=cancelled',
      'reason=stale_running_timeout',
      `commit=${commitShort}`,
      `mode=${mode}`,
      `age_minutes=${ageMinutes}`,
    ].join('; ');

    const patchBody = {
      status: 'cancelled',
      output_summary: output_summary.slice(0, 8000),
      metadata_jsonb: mergedMeta,
    };

    if (dryRun) {
      cancelled_count += 1;
      ids_cancelled.push(id);
      continue;
    }

    const patchUrl = `${supabaseUrl}/rest/v1/build_deploy_events?id=eq.${enc(id)}`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(patchBody),
    });
    const patchText = await patchRes.text();
    if (!patchRes.ok) {
      skipped_count += 1;
      continue;
    }

    cancelled_count += 1;
    ids_cancelled.push(id);
  }

  return {
    stale_found: staleRows.length,
    cancelled_count,
    skipped_count,
    ids_cancelled,
    cutoff_iso: cutoffIso,
  };
}

/** Prefer started_at (deploy clock); fallback created_at for summary age only — not used for cutoff. */
function deployAgeMinutesForSummary(row) {
  const started = row?.started_at ? Date.parse(String(row.started_at)) : NaN;
  if (Number.isFinite(started)) {
    return Math.max(0, Math.round((Date.now() - started) / 60000));
  }
  const created = row?.created_at ? Date.parse(String(row.created_at)) : NaN;
  if (Number.isFinite(created)) {
    return Math.max(0, Math.round((Date.now() - created) / 60000));
  }
  return 0;
}

function extractRunGroupId(row) {
  try {
    const m =
      typeof row.metadata_jsonb === 'object' && row.metadata_jsonb !== null
        ? row.metadata_jsonb
        : JSON.parse(row.metadata_jsonb || '{}');
    if (m?.run_group_id) return String(m.run_group_id).trim();
  } catch {
    /* ignore */
  }
  const sid = row?.id != null ? String(row.id) : '';
  if (sid.startsWith('bde_')) return sid.slice(4).trim();
  return '';
}

/**
 * Worker helper: read Supabase + tenant scope from env bindings.
 * @param {any} env
 * @param {{ mode: string, olderThanMinutes?: number, olderThanHours?: number, dryRun?: boolean }} o
 */
export async function finalizeStaleDeployEventsFromWorker(env, o) {
  const supabaseUrl = env?.SUPABASE_URL && String(env.SUPABASE_URL).trim().replace(/\/$/, '');
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY && String(env.SUPABASE_SERVICE_ROLE_KEY).trim();
  // system-scoped: no authenticated user context at this path
  const tenantId =
    env?.TENANT_ID != null && String(env.TENANT_ID).trim() !== ''
      ? String(env.TENANT_ID).trim()
      : 'system';
  const workspaceId =
    env?.WORKSPACE_ID != null && String(env.WORKSPACE_ID).trim() !== ''
      ? String(env.WORKSPACE_ID).trim()
      : 'system';

  return finalizeStaleDeployEvents({
    supabaseUrl,
    serviceKey,
    tenantId,
    workspaceId,
    mode: o.mode,
    olderThanMinutes: o.olderThanMinutes,
    olderThanHours: o.olderThanHours,
    dryRun: o.dryRun,
    commitShort: o.commitShort ?? 'worker',
  });
}
