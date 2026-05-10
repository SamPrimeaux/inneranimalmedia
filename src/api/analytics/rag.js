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

function safePct(num, den) {
  const n = Number(num);
  const d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((n / d) * 1000) / 10));
}

export async function handleAnalyticsRag(_request, url, env, { tenantId }) {
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
            'Hyperdrive is not usable (binding missing or no .query / connectionString); Supabase-backed RAG analytics are unavailable.',
          backend: 'supabase',
          severity: 'critical',
        },
      ],
    });
  }

  const docsTable = 'documents';
  const logTable = 'semantic_search_log';
  const edgesTable = 'knowledge_edges';
  const tenantCtxTable = 'tenant_context';
  const memoryTable = 'agent_memory';
  const sessionSummariesTable = 'session_summaries';

  const [docsHasTenant, logHasTenant, docsHasEmbedding, docsHasProjectId, docsHasCreatedAt, logHasCreatedAt, docsHasMetadata] =
    await Promise.all([
      hasColumn(env, docsTable, 'tenant_id'),
      hasColumn(env, logTable, 'tenant_id'),
      hasColumn(env, docsTable, 'embedding'),
      hasColumn(env, docsTable, 'project_id'),
      hasColumn(env, docsTable, 'created_at'),
      hasColumn(env, logTable, 'created_at'),
      hasColumn(env, docsTable, 'metadata'),
    ]);

  const rangeInterval = intervalForRange(range);

  const docsWhere = [];
  const docsParams = [];
  if (docsHasTenant && tid) {
    docsParams.push(tid);
    docsWhere.push(`tenant_id = $${docsParams.length}`);
  }
  if (rangeInterval && docsHasCreatedAt) {
    docsWhere.push(`created_at >= now() - ${rangeInterval}`);
  }
  const docsWhereSql = docsWhere.length ? `WHERE ${docsWhere.join(' AND ')}` : '';

  const logWhere = [];
  const logParams = [];
  if (logHasTenant && tid) {
    logParams.push(tid);
    logWhere.push(`tenant_id = $${logParams.length}`);
  }
  if (rangeInterval && logHasCreatedAt) {
    logWhere.push(`created_at >= now() - ${rangeInterval}`);
  }
  const logWhereSql = logWhere.length ? `WHERE ${logWhere.join(' AND ')}` : '';

  const docsIdent = safeTableIdent(docsTable);
  const logIdent = safeTableIdent(logTable);
  const edgesIdent = safeTableIdent(edgesTable);
  const tenantCtxIdent = safeTableIdent(tenantCtxTable);
  const memoryIdent = safeTableIdent(memoryTable);
  const sessIdent = safeTableIdent(sessionSummariesTable);

  const docsCountP = hyperdriveQuery(env, `SELECT COUNT(*)::int AS c FROM public.${docsIdent} ${docsWhereSql}`, docsParams);

  const embeddedCountP =
    docsHasEmbedding
      ? hyperdriveQuery(
          env,
          `SELECT COUNT(*)::int AS c FROM public.${docsIdent} ${docsWhereSql}${docsWhereSql ? ' AND' : 'WHERE'} embedding IS NOT NULL`,
          docsParams,
        )
      : Promise.resolve({ ok: true, rows: [{ c: null }] });

  const sourcesP = hyperdriveQuery(
    env,
    `SELECT source AS key, COUNT(*)::int AS count
     FROM public.${docsIdent}
     ${docsWhereSql}
     GROUP BY source
     ORDER BY COUNT(*) DESC
     LIMIT 20`,
    docsParams,
  );

  const logAggP = hyperdriveQuery(
    env,
    `SELECT
       COUNT(*)::int AS c,
       ROUND(AVG(latency_ms))::int AS avg_latency_ms,
       MAX(top_similarity) AS top_similarity,
       AVG(avg_similarity) AS avg_similarity
     FROM public.${logIdent}
     ${logWhereSql}`,
    logParams,
  );

  const recentDocsP = hyperdriveQuery(
    env,
    `SELECT id, source, title, ${
      docsHasProjectId ? 'project_id,' : ''
    } ${docsHasCreatedAt ? 'created_at,' : 'NULL AS created_at,'} ${
      docsHasEmbedding ? 'CASE WHEN embedding IS NULL THEN false ELSE true END AS has_embedding,' : 'NULL AS has_embedding,'
    } ${
      docsHasMetadata ? 'metadata' : 'NULL AS metadata'
    }
     FROM public.${docsIdent}
     ${docsWhereSql}
     ORDER BY ${docsHasCreatedAt ? 'created_at DESC' : 'id DESC'}
     LIMIT 10`,
    docsParams,
  );

  const recentLogP = hyperdriveQuery(
    env,
    `SELECT created_at, search_fn, query_preview, latency_ms, top_similarity, avg_similarity, match_count_returned
     FROM public.${logIdent}
     ${logWhereSql}
     ORDER BY ${logHasCreatedAt ? 'created_at DESC' : 'id DESC'}
     LIMIT 10`,
    logParams,
  );

  const edgesCountP = hyperdriveQuery(env, `SELECT COUNT(*)::int AS c FROM public.${edgesIdent}`, []);
  const memoryCountP = hyperdriveQuery(env, `SELECT COUNT(*)::int AS c FROM public.${memoryIdent}`, []);
  const tenantCtxCountP = hyperdriveQuery(env, `SELECT COUNT(*)::int AS c FROM public.${tenantCtxIdent}`, []);
  const sessCountP = hyperdriveQuery(env, `SELECT COUNT(*)::int AS c FROM public.${sessIdent}`, []);

  const [
    docsCount,
    embeddedCount,
    sources,
    logAgg,
    recentDocs,
    recentLog,
    edgesCount,
    memoryCount,
    tenantCtxCount,
    sessCount,
  ] = await Promise.all([
    docsCountP,
    embeddedCountP,
    sourcesP,
    logAggP,
    recentDocsP,
    recentLogP,
    edgesCountP,
    memoryCountP,
    tenantCtxCountP,
    sessCountP,
  ]);

  if (!tid) {
    warnings.push({
      code: 'TENANT_ID_MISSING',
      message: 'No tenant_id resolved; RAG metrics may be unscoped.',
      backend: 'supabase',
      severity: 'warn',
    });
  }

  const documentCount = Number(docsCount?.rows?.[0]?.c ?? 0) || 0;
  const embeddedDocumentCountRaw = embeddedCount?.rows?.[0]?.c;
  const embeddedDocumentCount =
    embeddedDocumentCountRaw == null ? null : (Number(embeddedDocumentCountRaw ?? 0) || 0);

  const embeddingCoveragePercent =
    embeddedDocumentCount == null ? null : safePct(embeddedDocumentCount, documentCount);

  const logRow = logAgg?.rows?.[0] || {};
  const searchLogCount = Number(logRow.c ?? 0) || 0;

  if (documentCount > 100 && searchLogCount < 10) {
    warnings.push({
      code: 'RAG_QUERY_LOG_LOW',
      message:
        'Documents exist, but semantic search logging volume is low. Confirm the RAG query path writes to semantic_search_log.',
      backend: 'supabase',
      data_source_key: 'supabaseSemanticSearch',
      severity: 'warn',
    });
  }

  const sourceBreakdown = (sources?.rows || [])
    .map((r) => ({
      key: r.key != null ? String(r.key) : 'unknown',
      count: Number(r.count ?? 0) || 0,
      backend: 'supabase',
      table: 'documents',
    }))
    .filter((r) => r.key && r.key !== 'null');

  const sourceCount = sourceBreakdown.length;

  const avgSearchLatencyMs = Number(logRow.avg_latency_ms);
  const avgSearchLatencyMsOut = Number.isFinite(avgSearchLatencyMs) ? avgSearchLatencyMs : null;
  const topSimilarity = logRow.top_similarity != null ? Number(logRow.top_similarity) : null;
  const avgSimilarity = logRow.avg_similarity != null ? Number(logRow.avg_similarity) : null;

  return analyticsResponse({
    ok: true,
    backend: 'supabase',
    range,
    summary: {
      document_count: documentCount,
      embedded_document_count: embeddedDocumentCount,
      embedding_coverage_percent: embeddingCoveragePercent,
      source_count: sourceCount,
      search_log_count: searchLogCount,
      avg_search_latency_ms: avgSearchLatencyMsOut,
      top_similarity: Number.isFinite(topSimilarity) ? Math.round(topSimilarity * 1000) / 1000 : null,
      avg_similarity: Number.isFinite(avgSimilarity) ? Math.round(avgSimilarity * 1000) / 1000 : null,
      knowledge_edge_count: Number(edgesCount?.rows?.[0]?.c ?? 0) || 0,
      memory_count: Number(memoryCount?.rows?.[0]?.c ?? 0) || 0,
      tenant_context_count: Number(tenantCtxCount?.rows?.[0]?.c ?? 0) || 0,
      session_summary_count: Number(sessCount?.rows?.[0]?.c ?? 0) || 0,
    },
    breakdowns: [
      {
        key: 'sources',
        backend: 'supabase',
        rows: sourceBreakdown,
      },
    ],
    rows: [
      ...(recentLog?.rows || []).map((r) => ({ kind: 'search_log', backend: 'supabase', ...r })),
      ...(recentDocs?.rows || []).map((r) => ({ kind: 'document', backend: 'supabase', ...r })),
    ],
    warnings,
  });
}

