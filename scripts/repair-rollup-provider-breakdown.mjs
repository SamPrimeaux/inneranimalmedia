#!/usr/bin/env node
/**
 * One-off: backfill agentsam_usage_rollups_daily.provider_breakdown_json from usage events.
 * Usage: node scripts/repair-rollup-provider-breakdown.mjs [--days 35]
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const days = process.argv.includes('--days')
  ? process.argv[process.argv.indexOf('--days') + 1]
  : '35';

const sql = `
SELECT COUNT(*) AS n FROM agentsam_usage_rollups_daily
WHERE day >= date('now', '-' || ${Number(days) || 35} || ' days')
  AND cost_usd > 0
  AND (provider_breakdown_json IS NULL OR provider_breakdown_json IN ('{}', ''));
`;

console.log('[repair] rows needing breakdown (estimate):');
execFileSync(
  './scripts/with-cloudflare-env.sh',
  ['npx', 'wrangler', 'd1', 'execute', 'inneranimalmedia-business', '--remote', '-c', 'wrangler.production.toml', '--json', '--command', sql.trim()],
  { cwd: repoRoot, stdio: 'inherit' },
);

console.log('[repair] Deploy worker with repairRollupProviderBreakdowns, then trigger nightly rollup or run from Worker console.');
console.log('[repair] Or apply finance spend chart daily_totals fallback (already in API) until breakdown backfill completes.');
