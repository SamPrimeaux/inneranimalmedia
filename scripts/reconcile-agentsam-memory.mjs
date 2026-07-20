#!/usr/bin/env node
/**
 * Dry-run memory reconciliation (operator). Does not rewrite memories.
 *
 * Usage:
 *   node scripts/reconcile-agentsam-memory.mjs
 *   node scripts/reconcile-agentsam-memory.mjs --workspace=ws_inneranimalmedia
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile(resolve(process.cwd(), '.env.cloudflare'));
loadEnvFile(resolve(process.cwd(), '.env'));

const workspace =
  process.argv.find((a) => a.startsWith('--workspace='))?.split('=')[1] || 'ws_inneranimalmedia';

async function d1Query(sql) {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'inneranimalmedia-business', '--remote', '--command', sql, '--json'],
    { encoding: 'utf8', cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results || [];
}

async function main() {
  const active = await d1Query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(status,'active')='active' AND COALESCE(is_archived,0)=0 THEN 1 ELSE 0 END) AS active_n,
      SUM(CASE WHEN embedded_at IS NOT NULL THEN 1 ELSE 0 END) AS with_embedded_at,
      SUM(CASE WHEN embedding_id IS NOT NULL AND TRIM(COALESCE(embedding_id,''))!='' THEN 1 ELSE 0 END) AS with_embedding_id,
      SUM(CASE WHEN sync_key IS NULL OR TRIM(COALESCE(sync_key,''))='' THEN 1 ELSE 0 END) AS missing_sync_key,
      SUM(CASE WHEN COALESCE(projection_status,'pending')='ready' THEN 1 ELSE 0 END) AS projection_ready,
      SUM(CASE WHEN COALESCE(projection_status,'pending')='pending' THEN 1 ELSE 0 END) AS projection_pending
    FROM agentsam_memory
    WHERE workspace_id='${workspace.replace(/'/g, "''")}'
  `);

  let receiptCount = 0;
  try {
    const receipts = await d1Query(
      `SELECT COUNT(*) AS n FROM agentsam_memory_projection_receipts WHERE status='ok'`,
    );
    receiptCount = Number(receipts[0]?.n || 0);
  } catch {
    receiptCount = -1;
  }

  let outboxPending = 0;
  try {
    const ob = await d1Query(
      `SELECT COUNT(*) AS n FROM agentsam_memory_outbox WHERE status IN ('pending','partial','failed')`,
    );
    outboxPending = Number(ob[0]?.n || 0);
  } catch {
    outboxPending = -1;
  }

  const report = {
    dry_run: true,
    workspace_id: workspace,
    generated_at: new Date().toISOString(),
    d1_summary: active[0] || {},
    projection_receipts_ok: receiptCount,
    outbox_pending: outboxPending,
    law: {
      ssot: 'D1 agentsam_memory',
      projections: ['agentsam.agentsam_memory', 'agentsam.agentsam_memory_oai3large_1536', 'AGENTSAM_VECTORIZE_MEMORY'],
      embedded_at_trusted: false,
    },
    note: 'Full Hyperdrive drift report runs in-worker via runAgentsamMemoryReconciliation. This CLI is a D1 ledger snapshot only. No rewrites performed.',
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
