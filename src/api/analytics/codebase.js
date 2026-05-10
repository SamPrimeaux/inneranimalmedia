import { parseRange, analyticsResponse } from './sources/normalize.js';
import { isHyperdriveUsable, runHyperdriveQuery } from '../../core/hyperdrive-query.js';

function safeTableIdent(ident) {
  const s = String(ident || '').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new Error('invalid identifier');
  return `"${s.replace(/"/g, '""')}"`;
}

async function hyperdriveQuery(env, sql, params = []) {
  if (!isHyperdriveUsable(env)) return { ok: false, rows: [], warning: 'hyperdrive_missing' };
  const r = await runHyperdriveQuery(env, sql, params);
  if (!r.ok) return { ok: false, rows: [], warning: r.error || 'query_failed' };
  return { ok: true, rows: r.rows ?? [] };
}

async function hasColumn(env, tableName, colName) {
  const out = await hyperdriveQuery(
    env,
    `SELECT 1 AS ok
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     LIMIT 1`,
    [String(tableName), String(colName)],
  );
  return out.ok && (out.rows || []).length > 0;
}

function intervalForRange(range) {
  if (range === '24h') return `interval '24 hours'`;
  if (range === '30d') return `interval '30 days'`;
  if (range === 'all') return null;
  return `interval '7 days'`;
}

function coerceIsoOrNull(v) {
  if (v == null) return null;
  const s = String(v);
  if (!s.trim()) return null;
  return s;
}

export async function handleAnalyticsCodebase(_request, url, env, { tenantId }) {
  const range = parseRange(url);
  const warnings = [];
  const tid = tenantId && String(tenantId).trim() ? String(tenantId).trim() : null;

  if (!isHyperdriveUsable(env)) {
    return analyticsResponse({
      ok: true,
      backend: 'supabase',
      range,
      summary: {},
      rows: [],
      breakdowns: [],
      series: [],
      warnings: [
        {
          code: 'HYPERDRIVE_BINDING_MISSING',
          message:
            'Hyperdrive is not usable (binding missing or no .query / connectionString); Supabase-backed codebase analytics are unavailable.',
          backend: 'supabase',
          severity: 'critical',
        },
      ],
    });
  }

  const snapshotsTable = 'codebase_snapshots';
  const filesTable = 'codebase_files';
  const chunksTable = 'codebase_chunks';
  const symbolsTable = 'codebase_symbols';

  const rangeInterval = intervalForRange(range);

  const [snapHasTenant, fileHasTenant, chunkHasTenant, symHasTenant] = await Promise.all([
    hasColumn(env, snapshotsTable, 'tenant_id'),
    hasColumn(env, filesTable, 'tenant_id'),
    hasColumn(env, chunksTable, 'tenant_id'),
    hasColumn(env, symbolsTable, 'tenant_id'),
  ]);

  const [snapTimeCol, fileHasCreatedAt, chunkHasCreatedAt, symHasCreatedAt] = await Promise.all([
    (async () => {
      if (await hasColumn(env, snapshotsTable, 'captured_at')) return 'captured_at';
      if (await hasColumn(env, snapshotsTable, 'created_at')) return 'created_at';
      if (await hasColumn(env, snapshotsTable, 'generated_at')) return 'generated_at';
      return null;
    })(),
    hasColumn(env, filesTable, 'created_at'),
    hasColumn(env, chunksTable, 'created_at'),
    hasColumn(env, symbolsTable, 'created_at'),
  ]);

  const [fileHasContent, fileHasBytes, fileHasLineCount, fileHasMetadata, chunkHasLanguage] = await Promise.all([
    hasColumn(env, filesTable, 'content'),
    hasColumn(env, filesTable, 'bytes'),
    hasColumn(env, filesTable, 'line_count'),
    hasColumn(env, filesTable, 'metadata_jsonb'),
    hasColumn(env, chunksTable, 'language'),
  ]);

  const symCols = await (async () => {
    const out = await hyperdriveQuery(
      env,
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1`,
      [symbolsTable],
    );
    return new Set((out.rows || []).map((r) => String(r.column_name || '').trim()).filter(Boolean));
  })();

  const snapWhere = [];
  const snapParams = [];
  if (snapHasTenant && tid) {
    snapParams.push(tid);
    snapWhere.push(`tenant_id = $${snapParams.length}`);
  }
  if (rangeInterval && snapTimeCol) {
    snapWhere.push(`${snapTimeCol} >= now() - ${rangeInterval}`);
  }
  const snapWhereSql = snapWhere.length ? `WHERE ${snapWhere.join(' AND ')}` : '';

  const fileWhere = [];
  const fileParams = [];
  if (fileHasTenant && tid) {
    fileParams.push(tid);
    fileWhere.push(`tenant_id = $${fileParams.length}`);
  }
  if (rangeInterval && fileHasCreatedAt) fileWhere.push(`created_at >= now() - ${rangeInterval}`);
  const fileWhereSql = fileWhere.length ? `WHERE ${fileWhere.join(' AND ')}` : '';

  const chunkWhere = [];
  const chunkParams = [];
  if (chunkHasTenant && tid) {
    chunkParams.push(tid);
    chunkWhere.push(`tenant_id = $${chunkParams.length}`);
  }
  if (rangeInterval && chunkHasCreatedAt) chunkWhere.push(`created_at >= now() - ${rangeInterval}`);
  const chunkWhereSql = chunkWhere.length ? `WHERE ${chunkWhere.join(' AND ')}` : '';

  const symWhere = [];
  const symParams = [];
  if (symHasTenant && tid) {
    symParams.push(tid);
    symWhere.push(`tenant_id = $${symParams.length}`);
  }
  if (rangeInterval && symHasCreatedAt) symWhere.push(`created_at >= now() - ${rangeInterval}`);
  const symWhereSql = symWhere.length ? `WHERE ${symWhere.join(' AND ')}` : '';

  const snapsIdent = safeTableIdent(snapshotsTable);
  const filesIdent = safeTableIdent(filesTable);
  const chunksIdent = safeTableIdent(chunksTable);
  const symIdent = safeTableIdent(symbolsTable);

  const snapshotAggP = hyperdriveQuery(
    env,
    `SELECT COUNT(*)::int AS snapshot_count, ${snapTimeCol ? `MAX(${snapTimeCol}) AS latest_snapshot_at` : 'NULL AS latest_snapshot_at'}
     FROM public.${snapsIdent} ${snapWhereSql}`,
    snapParams,
  );
  const snapshotsP = hyperdriveQuery(
    env,
    `SELECT * FROM public.${snapsIdent} ${snapWhereSql} ORDER BY ${snapTimeCol || 'id'} DESC LIMIT 10`,
    snapParams,
  );

  const fileCountP = hyperdriveQuery(env, `SELECT COUNT(*)::int AS c FROM public.${filesIdent} ${fileWhereSql}`, fileParams);
  const chunkCountP = hyperdriveQuery(env, `SELECT COUNT(*)::int AS c FROM public.${chunksIdent} ${chunkWhereSql}`, chunkParams);
  const symbolCountP = hyperdriveQuery(env, `SELECT COUNT(*)::int AS c FROM public.${symIdent} ${symWhereSql}`, symParams);

  const totalBytesP = fileHasBytes
    ? hyperdriveQuery(env, `SELECT COALESCE(SUM(bytes),0)::bigint AS total_bytes FROM public.${filesIdent} ${fileWhereSql}`, fileParams)
    : fileHasContent
      ? hyperdriveQuery(
          env,
          `SELECT COALESCE(SUM(OCTET_LENGTH(content)),0)::bigint AS total_bytes FROM public.${filesIdent} ${fileWhereSql}`,
          fileParams,
        )
      : Promise.resolve({ ok: true, rows: [{ total_bytes: null }] });

  const totalLinesP = fileHasLineCount
    ? hyperdriveQuery(env, `SELECT COALESCE(SUM(line_count),0)::bigint AS total_lines FROM public.${filesIdent} ${fileWhereSql}`, fileParams)
    : fileHasContent
      ? hyperdriveQuery(
          env,
          `SELECT COALESCE(SUM(1 + LENGTH(content) - LENGTH(REPLACE(content, E'\\n', ''))),0)::bigint AS total_lines
           FROM public.${filesIdent} ${fileWhereSql}`,
          fileParams,
        )
      : Promise.resolve({ ok: true, rows: [{ total_lines: null }] });

  const languageDistP = chunkHasLanguage
    ? hyperdriveQuery(
        env,
        `SELECT COALESCE(NULLIF(language,''),'unknown') AS language, COUNT(*)::int AS count
         FROM public.${chunksIdent}
         ${chunkWhereSql}
         GROUP BY COALESCE(NULLIF(language,''),'unknown')
         ORDER BY COUNT(*) DESC
         LIMIT 12`,
        chunkParams,
      )
    : Promise.resolve({ ok: true, rows: [] });

  const largestFilesP = fileHasContent
    ? hyperdriveQuery(
        env,
        `SELECT file_path,
                ${fileHasLineCount ? 'line_count' : 'NULL AS line_count'},
                ${fileHasBytes ? 'bytes' : 'OCTET_LENGTH(content) AS bytes'}
         FROM public.${filesIdent}
         ${fileWhereSql}
         ORDER BY ${fileHasBytes ? 'bytes' : 'OCTET_LENGTH(content)'} DESC
         LIMIT 10`,
        fileParams,
      )
    : hyperdriveQuery(
        env,
        `SELECT file_path, ${fileHasLineCount ? 'line_count' : 'NULL AS line_count'}, ${fileHasBytes ? 'bytes' : 'NULL AS bytes'}
         FROM public.${filesIdent}
         ${fileWhereSql}
         ORDER BY COALESCE(${fileHasBytes ? 'bytes' : '0'},0) DESC
         LIMIT 10`,
        fileParams,
      );

  const priorityFilesP = fileHasMetadata
    ? hyperdriveQuery(
        env,
        `SELECT file_path,
                ${fileHasLineCount ? 'line_count' : 'NULL AS line_count'},
                ${fileHasBytes ? 'bytes' : fileHasContent ? 'OCTET_LENGTH(content) AS bytes' : 'NULL AS bytes'},
                metadata_jsonb
         FROM public.${filesIdent}
         ${fileWhereSql}${fileWhereSql ? ' AND' : 'WHERE'} (metadata_jsonb->>'kind') IN ('priority_file','route_map')
         ORDER BY file_path ASC
         LIMIT 25`,
        fileParams,
      )
    : Promise.resolve({ ok: true, rows: [] });

  const symNameCol = symCols.has('name') ? 'name' : symCols.has('symbol_name') ? 'symbol_name' : null;
  const symTypeCol =
    symCols.has('symbol_type')
      ? 'symbol_type'
      : symCols.has('type')
        ? 'type'
        : symCols.has('kind')
          ? 'kind'
          : symCols.has('category')
            ? 'category'
            : null;
  const symFileCol = symCols.has('file_path') ? 'file_path' : symCols.has('path') ? 'path' : null;
  const symLineCol = symCols.has('line') ? 'line' : symCols.has('line_start') ? 'line_start' : null;

  const selectCols = [
    symNameCol ? `${symNameCol} AS name` : `NULL AS name`,
    symTypeCol ? `${symTypeCol} AS symbol_type` : `NULL AS symbol_type`,
    symFileCol ? `${symFileCol} AS file_path` : `NULL AS file_path`,
    symLineCol ? `${symLineCol} AS line` : `NULL AS line`,
  ].join(', ');

  const functionSymbolsP = hyperdriveQuery(
    env,
    `SELECT ${selectCols}
     FROM public.${symIdent}
     ${symWhereSql}
     ${
       symTypeCol
         ? `AND LOWER(COALESCE(${symTypeCol}::text,'')) IN ('function','fn','method')`
         : ''
     }
     ORDER BY ${symNameCol || 'id'} ASC
     LIMIT 25`,
    symParams,
  );

  const routeSymbolsP = hyperdriveQuery(
    env,
    `SELECT ${selectCols}
     FROM public.${symIdent}
     ${symWhereSql}
     ${
       symTypeCol
         ? `AND (LOWER(COALESCE(${symTypeCol}::text,'')) IN ('route','router','endpoint') OR LOWER(COALESCE(${symTypeCol}::text,'')) LIKE '%route%')`
         : ''
     }
     ORDER BY ${symNameCol || 'id'} ASC
     LIMIT 25`,
    symParams,
  );

  const [
    snapAgg,
    snaps,
    fileCount,
    totalBytes,
    totalLines,
    chunkCount,
    symbolCount,
    langDist,
    largestFiles,
    priorityFiles,
    fnSymbols,
    rtSymbols,
  ] = await Promise.all([
    snapshotAggP,
    snapshotsP,
    fileCountP,
    totalBytesP,
    totalLinesP,
    chunkCountP,
    symbolCountP,
    languageDistP,
    largestFilesP,
    priorityFilesP,
    functionSymbolsP,
    routeSymbolsP,
  ]);

  if (!tid) {
    warnings.push({
      code: 'TENANT_ID_MISSING',
      message: 'No tenant_id resolved; codebase metrics may be unscoped.',
      backend: 'supabase',
      severity: 'warn',
    });
  }

  const snapRow = snapAgg?.rows?.[0] || {};
  const snapshotCount = Number(snapRow.snapshot_count ?? 0) || 0;
  const latestSnapshotAt = coerceIsoOrNull(snapRow.latest_snapshot_at);

  const fileCountN = Number(fileCount?.rows?.[0]?.c ?? 0) || 0;
  const chunkCountN = Number(chunkCount?.rows?.[0]?.c ?? 0) || 0;
  const symbolCountN = Number(symbolCount?.rows?.[0]?.c ?? 0) || 0;

  const totalBytesN = totalBytes?.rows?.[0]?.total_bytes;
  const totalLinesN = totalLines?.rows?.[0]?.total_lines;

  const langRows = (langDist?.rows || []).map((r) => ({
    language: String(r.language || 'unknown'),
    count: Number(r.count ?? 0) || 0,
  }));

  return analyticsResponse({
    ok: true,
    backend: 'supabase',
    range,
    summary: {
      snapshot_count: snapshotCount,
      latest_snapshot_at: latestSnapshotAt,
      file_count: fileCountN,
      total_lines: totalLinesN != null ? Number(totalLinesN) : null,
      total_bytes: totalBytesN != null ? Number(totalBytesN) : null,
      chunk_count: chunkCountN,
      symbol_count: symbolCountN,
      language_distribution: langRows,
      largest_files: (largestFiles?.rows || []).map((r) => ({
        file_path: r.file_path != null ? String(r.file_path) : null,
        line_count: r.line_count != null ? Number(r.line_count) : null,
        bytes: r.bytes != null ? Number(r.bytes) : null,
      })),
      priority_files: (priorityFiles?.rows || []).map((r) => ({
        file_path: r.file_path != null ? String(r.file_path) : null,
        line_count: r.line_count != null ? Number(r.line_count) : null,
        bytes: r.bytes != null ? Number(r.bytes) : null,
        kind:
          r.metadata_jsonb && typeof r.metadata_jsonb === 'object'
            ? r.metadata_jsonb.kind ?? null
            : null,
      })),
      route_symbols: (rtSymbols?.rows || []).map((r) => ({
        name: r.name != null ? String(r.name) : null,
        symbol_type: r.symbol_type != null ? String(r.symbol_type) : null,
        file_path: r.file_path != null ? String(r.file_path) : null,
        line: r.line != null ? Number(r.line) : null,
      })),
      function_symbols: (fnSymbols?.rows || []).map((r) => ({
        name: r.name != null ? String(r.name) : null,
        symbol_type: r.symbol_type != null ? String(r.symbol_type) : null,
        file_path: r.file_path != null ? String(r.file_path) : null,
        line: r.line != null ? Number(r.line) : null,
      })),
    },
    breakdowns: [
      {
        key: 'languages',
        backend: 'supabase',
        rows: langRows,
      },
    ],
    rows: [
      ...(snaps?.rows || []).map((r) => ({ kind: 'snapshot', backend: 'supabase', ...r })),
      ...(largestFiles?.rows || []).map((r) => ({ kind: 'largest_file', backend: 'supabase', ...r })),
      ...(priorityFiles?.rows || []).map((r) => ({ kind: 'priority_file', backend: 'supabase', ...r })),
      ...(rtSymbols?.rows || []).map((r) => ({ kind: 'route_symbol', backend: 'supabase', ...r })),
      ...(fnSymbols?.rows || []).map((r) => ({ kind: 'function_symbol', backend: 'supabase', ...r })),
    ],
    warnings,
  });
}

