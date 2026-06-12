/**
 * Cloudflare D1 GraphQL Analytics — mirrors CF dashboard metrics.
 * @see https://developers.cloudflare.com/d1/observability/metrics-analytics/
 */

export const IAM_D1_DATABASE_ID = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49';
export const IAM_D1_DATABASE_NAME = 'inneranimalmedia-business';

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const CACHE_TTL_SEC = 600;

/** @param {string} range */
export function rangeSecondsForAnalytics(range) {
  if (range === '1h') return 3600;
  if (range === '24h') return 86400;
  if (range === '7d') return 7 * 86400;
  if (range === '30d') return 30 * 86400;
  return 86400;
}

/** @param {string} range */
function rangeWindow(range) {
  const endMs = Date.now();
  const sec = rangeSecondsForAnalytics(range);
  const startMs = endMs - sec * 1000;
  const prevStartMs = startMs - sec * 1000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    prevStart: new Date(prevStartMs).toISOString(),
    startDate: new Date(startMs).toISOString().slice(0, 10),
    endDate: new Date(endMs).toISOString().slice(0, 10),
    prevStartDate: new Date(prevStartMs).toISOString().slice(0, 10),
  };
}

/**
 * @param {string} iso
 * @param {string} range
 */
function formatBucketLabel(iso, range) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  if (range === '1h' || range === '24h') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * @param {any} env
 * @param {string} accountId
 * @param {string} token
 * @param {string} query
 * @param {Record<string, unknown>} variables
 */
async function cloudflareGraphql(env, accountId, token, query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { accountTag: accountId, ...variables } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.errors?.[0]?.message || json?.message || `GraphQL HTTP ${res.status}`);
  }
  if (json?.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json?.data ?? null;
}

/**
 * @param {any} kv
 * @param {string} key
 * @param {() => Promise<T>} fetchFn
 * @template T
 */
async function cachedFetch(kv, key, fetchFn) {
  if (kv) {
    try {
      const raw = await kv.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.cachedAt && Date.now() - parsed.cachedAt < CACHE_TTL_SEC * 1000) {
          return /** @type {T} */ (parsed.data);
        }
      }
    } catch {
      /* ignore cache read errors */
    }
  }
  const data = await fetchFn();
  if (kv) {
    try {
      await kv.put(key, JSON.stringify({ cachedAt: Date.now(), data }), {
        expirationTtl: CACHE_TTL_SEC,
      });
    } catch {
      /* ignore cache write errors */
    }
  }
  return data;
}

/**
 * @param {any} env
 * @param {{ accountId: string, token: string, databaseId: string, range: string }} opts
 */
export async function fetchD1AnalyticsOverview(env, opts) {
  const { accountId, token, databaseId, range } = opts;
  const win = rangeWindow(range);
  const kv = env?.SESSION_CACHE || env?.KV || null;
  const cacheKey = `d1_gql:v1:${databaseId}:${range}`;

  return cachedFetch(kv, cacheKey, async () => {
    const useDatetime = range === '1h' || range === '24h';
    const filterKey = useDatetime ? 'datetime' : 'date';
    const startKey = useDatetime ? 'datetime_geq' : 'date_geq';
    const endKey = useDatetime ? 'datetime_leq' : 'date_leq';
    const orderBy = useDatetime ? 'datetime_ASC' : 'date_ASC';
    const dimKey = useDatetime ? 'datetime' : 'date';
    const startVal = useDatetime ? win.start : win.startDate;
    const endVal = useDatetime ? win.end : win.endDate;
    const prevStartVal = useDatetime ? win.prevStart : win.prevStartDate;

    const analyticsQuery = `
      query D1AnalyticsOverview($accountTag: string!, $databaseId: string!, $start: ${useDatetime ? 'DateTime' : 'Date'}!, $end: ${useDatetime ? 'DateTime' : 'Date'}!, $prevStart: ${useDatetime ? 'DateTime' : 'Date'}!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            current: d1AnalyticsAdaptiveGroups(
              limit: 10000
              filter: { databaseId: $databaseId, ${startKey}: $start, ${endKey}: $end }
              orderBy: [${orderBy}]
            ) {
              sum { readQueries writeQueries rowsRead rowsWritten }
              quantiles { queryBatchTimeMsP50 queryBatchTimeMsP90 queryBatchTimeMsP99 }
              dimensions { ${dimKey} }
            }
            previous: d1AnalyticsAdaptiveGroups(
              limit: 10000
              filter: { databaseId: $databaseId, ${startKey}: $prevStart, ${endKey}: $start }
            ) {
              sum { readQueries writeQueries rowsRead rowsWritten }
            }
            storage: d1StorageAdaptiveGroups(
              limit: 1
              filter: { databaseId: $databaseId }
              orderBy: [date_DESC]
            ) {
              max { databaseSizeBytes }
            }
            topQueries: d1QueriesAdaptiveGroups(
              limit: 20
              filter: { databaseId: $databaseId, ${startKey}: $start, ${endKey}: $end }
              orderBy: [sum_queryBatchTimeMs_DESC]
            ) {
              dimensions { query }
              sum { count rowsRead rowsWritten queryBatchTimeMs }
              quantiles { queryBatchTimeMsP50 queryBatchTimeMsP99 }
            }
          }
        }
      }`;

    const data = await cloudflareGraphql(env, accountId, token, analyticsQuery, {
      databaseId,
      start: startVal,
      end: endVal,
      prevStart: prevStartVal,
    });

    const account = data?.viewer?.accounts?.[0] ?? {};
    const currentRows = account.current ?? [];
    const previousRows = account.previous ?? [];
    const storageRows = account.storage ?? [];
    const queryRows = account.topQueries ?? [];

    const sumRows = (rows, pick) =>
      rows.reduce(
        (acc, row) => {
          const s = row?.sum ?? {};
          for (const k of pick) acc[k] += Number(s[k]) || 0;
          return acc;
        },
        { readQueries: 0, writeQueries: 0, rowsRead: 0, rowsWritten: 0 },
      );

    const currentSum = sumRows(currentRows, ['readQueries', 'writeQueries', 'rowsRead', 'rowsWritten']);
    const previousSum = sumRows(previousRows, ['readQueries', 'writeQueries', 'rowsRead', 'rowsWritten']);

    const labels = [];
    const readQueries = [];
    const writeQueries = [];
    const totalQueries = [];
    const rowsReadSeries = [];
    const rowsWrittenSeries = [];
    const latencyP50 = [];
    const latencyP95 = [];
    const latencyP99 = [];

    for (const row of currentRows) {
      const dim = row?.dimensions ?? {};
      const raw = dim[filterKey] ?? dim.datetime ?? dim.date ?? '';
      labels.push(formatBucketLabel(String(raw), range));
      const rq = Number(row?.sum?.readQueries) || 0;
      const wq = Number(row?.sum?.writeQueries) || 0;
      readQueries.push(rq);
      writeQueries.push(wq);
      totalQueries.push(rq + wq);
      rowsReadSeries.push(Number(row?.sum?.rowsRead) || 0);
      rowsWrittenSeries.push(Number(row?.sum?.rowsWritten) || 0);
      latencyP50.push(Number(row?.quantiles?.queryBatchTimeMsP50) || 0);
      latencyP95.push(Number(row?.quantiles?.queryBatchTimeMsP90) || 0);
      latencyP99.push(Number(row?.quantiles?.queryBatchTimeMsP99) || 0);
    }

    const storageBytes = Number(storageRows[0]?.max?.databaseSizeBytes) || 0;

    const totalRuntimeMs = queryRows.reduce(
      (s, r) => s + (Number(r?.sum?.queryBatchTimeMs) || 0),
      0,
    );

    const queries = queryRows
      .map((row) => {
        const q = String(row?.dimensions?.query || '').trim();
        if (!q) return null;
        const count = Number(row?.sum?.count) || 0;
        const totalMs = Number(row?.sum?.queryBatchTimeMs) || 0;
        const p50 = Number(row?.quantiles?.queryBatchTimeMsP50) || 0;
        const p99 = Number(row?.quantiles?.queryBatchTimeMsP99) || 0;
        const rowsRead = Number(row?.sum?.rowsRead) || 0;
        const rowsWritten = Number(row?.sum?.rowsWritten) || 0;
        return {
          fingerprint: q.slice(0, 240),
          tool_name: 'd1',
          datasource: 'd1',
          call_count: count,
          runtime_pct:
            totalRuntimeMs > 0
              ? Math.round((totalMs / totalRuntimeMs) * 1000) / 10
              : 0,
          avg_ms: count > 0 ? Math.round(totalMs / count) : 0,
          p50_ms: Math.round(p50),
          p99_ms: Math.round(p99),
          rows_read: rowsRead,
          rows_written: rowsWritten,
          rows_per_run: count > 0 ? Math.round(rowsRead / count) : 0,
          errors: 0,
          last_seen: null,
        };
      })
      .filter(Boolean);

    const latHeadline = {
      p50: latencyP50.filter((v) => v > 0).slice(-1)[0] ?? 0,
      p95: latencyP95.filter((v) => v > 0).slice(-1)[0] ?? 0,
      p99: latencyP99.filter((v) => v > 0).slice(-1)[0] ?? 0,
    };

    return {
      source: 'cloudflare_graphql',
      wired: currentSum.readQueries + currentSum.writeQueries > 0 || storageBytes > 0,
      kpis: {
        queries: currentSum.readQueries + currentSum.writeQueries,
        queriesPrev: previousSum.readQueries + previousSum.writeQueries,
        rowsRead: currentSum.rowsRead,
        rowsReadPrev: previousSum.rowsRead,
        rowsWritten: currentSum.rowsWritten,
        rowsWrittenPrev: previousSum.rowsWritten,
        storageBytes,
        p95Ms: latHeadline.p95,
      },
      charts: {
        labels,
        totalQueries,
        readQueries,
        writeQueries,
        rowsRead: rowsReadSeries,
        rowsWritten: rowsWrittenSeries,
        latencyP50,
        latencyP95,
        latencyP99,
        headlineMs: latHeadline,
      },
      queries,
    };
  });
}

/**
 * Resolve platform Cloudflare credentials from env.
 * @param {any} env
 */
export function resolveCloudflareAnalyticsCreds(env) {
  const token = env?.CLOUDFLARE_API_TOKEN != null ? String(env.CLOUDFLARE_API_TOKEN).trim() : '';
  const accountId =
    env?.CLOUDFLARE_ACCOUNT_ID != null ? String(env.CLOUDFLARE_ACCOUNT_ID).trim() : '';
  if (!token || !accountId) {
    return null;
  }
  return { token, accountId };
}
