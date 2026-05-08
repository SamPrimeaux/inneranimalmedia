function pgQuoteIdent(ident) {
  const s = String(ident || '').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
    throw new Error('invalid table or column identifier');
  }
  return `"${s.replace(/"/g, '""')}"`;
}

async function pgHasColumn(env, tableName, colName) {
  if (!env?.HYPERDRIVE || typeof env.HYPERDRIVE.query !== 'function') return false;
  try {
    const res = await env.HYPERDRIVE.query(
      `SELECT 1 AS ok
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
       LIMIT 1`,
      [tableName, colName],
    );
    return (res?.rows || []).length > 0;
  } catch {
    return false;
  }
}

export async function supabaseCountLatest(env, tableName, { tenantId = null, range = null } = {}) {
  if (!env?.HYPERDRIVE || typeof env.HYPERDRIVE.query !== 'function') {
    return { ok: false, count: 0, latest: null, time_col: null, has_tenant: false, warning: 'hyperdrive_missing' };
  }

  const safeTable = String(tableName).trim();
  let ident;
  try {
    ident = pgQuoteIdent(safeTable);
  } catch {
    return { ok: false, count: 0, latest: null, time_col: null, has_tenant: false, warning: 'invalid_table' };
  }

  const hasTenant = await pgHasColumn(env, safeTable, 'tenant_id');
  const timeCandidates = ['created_at', 'started_at', 'updated_at', 'captured_at', 'checked_at', 'forecast_date'];
  let timeCol = null;
  for (const c of timeCandidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await pgHasColumn(env, safeTable, c)) {
      timeCol = c;
      break;
    }
  }

  const where = [];
  const params = [];
  if (hasTenant && tenantId) {
    params.push(String(tenantId));
    where.push(`tenant_id = $${params.length}`);
  }
  if (range && timeCol) {
    if (range === '24h') where.push(`${pgQuoteIdent(timeCol)} >= now() - interval '24 hours'`);
    if (range === '7d') where.push(`${pgQuoteIdent(timeCol)} >= now() - interval '7 days'`);
    if (range === '30d') where.push(`${pgQuoteIdent(timeCol)} >= now() - interval '30 days'`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const countRes = await env.HYPERDRIVE.query(
      `SELECT COUNT(*)::int AS c FROM public.${ident} ${whereSql}`,
      params,
    );
    const count = Number(countRes?.rows?.[0]?.c ?? 0) || 0;
    let latest = null;
    if (timeCol) {
      const latestRes = await env.HYPERDRIVE.query(
        `SELECT MAX(${pgQuoteIdent(timeCol)}) AS latest FROM public.${ident} ${whereSql}`,
        params,
      );
      latest = latestRes?.rows?.[0]?.latest ?? null;
    }
    return { ok: true, count, latest, time_col: timeCol, has_tenant: hasTenant };
  } catch (e) {
    return {
      ok: false,
      count: 0,
      latest: null,
      time_col: timeCol,
      has_tenant: hasTenant,
      warning: e?.message ? String(e.message) : 'query_failed',
    };
  }
}

