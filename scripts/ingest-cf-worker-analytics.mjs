#!/usr/bin/env node
/**
 * ingest-cf-worker-analytics.mjs — CF GraphQL Workers invocations → worker_analytics_daily.
 *
 * Fixes zero avg_duration_ms rows by pulling real duration/request metrics from CF Analytics API.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest-cf-worker-analytics.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest-cf-worker-analytics.mjs --since-days=7
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (from .env.cloudflare)
 */
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { loadEnvCloudflare } from './lib/r2-inventory-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

loadEnvCloudflare(REPO_ROOT);

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const DEFAULT_WORKERS = ['inneranimalmedia', 'inneranimalmedia-mcp-server', 'execos'];
const sinceArg = process.argv.find((a) => a.startsWith('--since-days='));
const SINCE_DAYS = Math.max(
  1,
  Number.parseInt(sinceArg?.split('=')[1] || process.env.CF_ANALYTICS_SINCE_DAYS || '7', 10) || 7,
);

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function dayStartMs(isoDay) {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

async function fetchWorkersDailyGroups(accountId, token, sinceDays) {
  const end = new Date();
  const start = new Date(end.getTime() - sinceDays * 86400 * 1000);
  const query = `
    query WorkersDaily($accountTag: string!, $start: Time!, $end: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 10000
            filter: { datetime_geq: $start, datetime_lt: $end }
            orderBy: [datetime_ASC]
          ) {
            dimensions { scriptName datetime }
            sum { requests errors duration cpuTimeUs wallTime }
            quantiles { durationP95 wallTimeP95 }
          }
        }
      }
    }
  `;
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: {
        accountTag: accountId,
        start: start.toISOString(),
        end: end.toISOString(),
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.errors?.length) {
    throw new Error(
      `GraphQL ${res.status}: ${JSON.stringify(json?.errors || json).slice(0, 500)}`,
    );
  }
  return json?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
}

function aggregateDailyRows(groups, workerFilter) {
  /** @type {Map<string, { worker_name: string, day_timestamp: number, total_requests: number, failed_requests: number, duration_sec_sum: number, wall_time_us_sum: number, cpu_us_sum: number, p95_max: number }>} */
  const byKey = new Map();
  const allow = new Set(workerFilter.map((w) => w.toLowerCase()));

  for (const row of groups) {
    const scriptName = trim(row?.dimensions?.scriptName);
    const dayRaw = trim(row?.dimensions?.datetime);
    if (!scriptName || !dayRaw) continue;
    if (allow.size && !allow.has(scriptName.toLowerCase())) continue;

    const dayTs = dayStartMs(dayRaw.slice(0, 10));
    if (dayTs == null) continue;

    const key = `${scriptName}\0${dayTs}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        worker_name: scriptName,
        day_timestamp: dayTs,
        total_requests: 0,
        failed_requests: 0,
        duration_sec_sum: 0,
        wall_time_us_sum: 0,
        cpu_us_sum: 0,
        p95_max: 0,
      });
    }
    const agg = byKey.get(key);
    agg.total_requests += Number(row?.sum?.requests) || 0;
    agg.failed_requests += Number(row?.sum?.errors) || 0;
    agg.duration_sec_sum += Number(row?.sum?.duration) || 0;
    agg.wall_time_us_sum += Number(row?.sum?.wallTime) || 0;
    agg.cpu_us_sum += Number(row?.sum?.cpuTimeUs) || 0;
    const p95Sec = Number(row?.quantiles?.durationP95) || 0;
    const p95Us = Number(row?.quantiles?.wallTimeP95) || 0;
    const p95Ms = p95Us > 0 ? p95Us / 1000 : p95Sec * 1000;
    if (p95Ms > agg.p95_max) agg.p95_max = p95Ms;
  }

  return [...byKey.values()].map((r) => {
    const total = r.total_requests;
    const avgDurationMs =
      total > 0
        ? r.wall_time_us_sum > 0
          ? r.wall_time_us_sum / 1000 / total
          : (r.duration_sec_sum / total) * 1000
        : 0;
    const avgCpuMs = total > 0 ? r.cpu_us_sum / 1000 / total : 0;
    const successful = Math.max(0, total - r.failed_requests);
    return {
      worker_name: r.worker_name,
      environment: 'production',
      day_timestamp: r.day_timestamp,
      total_requests: total,
      successful_requests: successful,
      failed_requests: r.failed_requests,
      avg_duration_ms: avgDurationMs,
      avg_cpu_time_ms: avgCpuMs,
      p95_duration_ms: r.p95_max || avgDurationMs,
      total_errors: r.failed_requests,
      hour_count: 24,
    };
  });
}

function sqlQuote(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function upsertSql(row) {
  return `
INSERT INTO worker_analytics_daily (
  worker_name, environment, day_timestamp,
  total_requests, successful_requests, failed_requests,
  avg_duration_ms, avg_cpu_time_ms, p95_duration_ms, total_errors, hour_count, created_at
) VALUES (
  ${sqlQuote(row.worker_name)},
  ${sqlQuote(row.environment)},
  ${row.day_timestamp},
  ${row.total_requests},
  ${row.successful_requests},
  ${row.failed_requests},
  ${row.avg_duration_ms},
  ${row.avg_cpu_time_ms},
  ${row.p95_duration_ms},
  ${row.total_errors},
  ${row.hour_count},
  unixepoch()
)
ON CONFLICT(worker_name, environment, day_timestamp) DO UPDATE SET
  total_requests = excluded.total_requests,
  successful_requests = excluded.successful_requests,
  failed_requests = excluded.failed_requests,
  avg_duration_ms = excluded.avg_duration_ms,
  avg_cpu_time_ms = excluded.avg_cpu_time_ms,
  p95_duration_ms = excluded.p95_duration_ms,
  total_errors = excluded.total_errors,
  hour_count = excluded.hour_count;
`.trim();
}

async function main() {
  const token = trim(process.env.CLOUDFLARE_API_TOKEN);
  const accountId = trim(process.env.CLOUDFLARE_ACCOUNT_ID);
  if (!token || !accountId) {
    console.error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (use with-cloudflare-env.sh).');
    process.exit(2);
  }

  const workerFilter = trim(process.env.CF_ANALYTICS_WORKERS)
    ? trim(process.env.CF_ANALYTICS_WORKERS).split(',').map((w) => w.trim()).filter(Boolean)
    : DEFAULT_WORKERS;

  console.log(`[ingest-cf-worker-analytics] since_days=${SINCE_DAYS} workers=${workerFilter.join(',')}`);
  const groups = await fetchWorkersDailyGroups(accountId, token, SINCE_DAYS);
  const rows = aggregateDailyRows(groups, workerFilter);
  if (!rows.length) {
    console.warn('[ingest-cf-worker-analytics] no rows from GraphQL — check account tag and worker names');
    process.exit(1);
  }

  const sqlPath = path.join(REPO_ROOT, 'reports', 'ingest-cf-worker-analytics.sql');
  const sqlBody = rows.map(upsertSql).join('\n\n');
  execFileSync('mkdir', ['-p', path.dirname(sqlPath)]);
  execFileSync('bash', ['-lc', `cat > '${sqlPath}' <<'EOF'\n${sqlBody}\nEOF`]);

  execFileSync(
    './scripts/with-cloudflare-env.sh',
    [
      'npx',
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--file',
      sqlPath,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );

  console.log(`[ingest-cf-worker-analytics] upserted ${rows.length} daily row(s)`);
  for (const r of rows.slice(0, 10)) {
    console.log(
      `  ${r.worker_name} ${new Date(r.day_timestamp).toISOString().slice(0, 10)} requests=${r.total_requests} avg_duration_ms=${r.avg_duration_ms.toFixed(1)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
