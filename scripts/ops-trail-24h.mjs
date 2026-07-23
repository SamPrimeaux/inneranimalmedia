#!/usr/bin/env node
/**
 * Ops trail last-24h — epoch-only via v_agentsam_ops_trail.ts_unix.
 * Usage: ./scripts/with-cloudflare-env.sh node scripts/ops-trail-24h.mjs
 */
import { d1Query } from './lib/d1-remote.mjs';

const since = Number(d1Query(`SELECT unixepoch() - 86400 AS since`)[0]?.since) || 0;
const counts = d1Query(
  `SELECT source_table, count(*) AS n
   FROM v_agentsam_ops_trail
   WHERE ts_unix >= ${since}
   GROUP BY source_table
   ORDER BY n DESC`,
);
const usageN = d1Query(
  `SELECT count(*) AS n FROM agentsam_usage_events
   WHERE COALESCE(created_at_unix, created_at) >= ${since}`,
)?.[0]?.n;
const recent = d1Query(
  `SELECT source_table, event_id, ts_unix, event_kind, detail, substr(COALESCE(error_message,''),1,120) AS err
   FROM v_agentsam_ops_trail
   WHERE ts_unix >= ${since}
   ORDER BY ts_unix DESC
   LIMIT 25`,
);

console.log(JSON.stringify({ since, counts, usage_events_24h: usageN, recent }, null, 2));
