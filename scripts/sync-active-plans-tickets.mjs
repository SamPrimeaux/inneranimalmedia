#!/usr/bin/env node
/**
 * Sync plans/active/*.md → agentsam_tickets (never leave a plan without a D1 ticket).
 * Also prints tickets that look "open forever" or shipped without gate proof.
 *
 *   npm run sync:active-plan-tickets
 *   npm run sync:active-plan-tickets -- --apply
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';

loadEnvCloudflare();

const APPLY = process.argv.includes('--apply');
const ACTIVE = join(REPO_ROOT, 'plans', 'active');

/** Stable ticket id from doc path */
function ticketIdForDoc(docPath) {
  const h = createHash('sha256').update(docPath).digest('hex').slice(0, 12);
  const base = docPath
    .replace(/^plans\/active\//, '')
    .replace(/\.md$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return `tkt_${base || 'plan'}_${h}`.slice(0, 64);
}

function titleFromMd(text, fallback) {
  const m = text.match(/^#\s+(.+)$/m);
  return (m ? m[1] : fallback).trim().slice(0, 200);
}

function main() {
  if (!existsSync(ACTIVE)) {
    console.error('plans/active missing');
    process.exit(1);
  }

  const files = readdirSync(ACTIVE)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort();

  const existing = d1Query(
    `SELECT id, title, status, doc_path, consecutive_pass_count, required_pass_count, last_gate_ok_at
     FROM agentsam_tickets
     WHERE doc_path LIKE 'plans/active/%' OR project = 'iam-core'`,
  );
  const byDoc = new Map(
    existing.filter((r) => r.doc_path).map((r) => [String(r.doc_path), r]),
  );

  console.log(`[sync-plans] scan ${files.length} active plans; apply=${APPLY}`);

  /** @type {object[]} */
  const missing = [];
  for (const f of files) {
    const docPath = `plans/active/${f}`;
    const abs = join(ACTIVE, f);
    const body = readFileSync(abs, 'utf8');
    const title = titleFromMd(body, f);
    if (byDoc.has(docPath)) {
      const row = byDoc.get(docPath);
      console.log(`  OK   ${docPath} → ${row.id} [${row.status}] passes=${row.consecutive_pass_count || 0}/${row.required_pass_count || 2}`);
      continue;
    }
    // also match known seeded ids by filename heuristics
    const seeded = existing.find(
      (r) =>
        String(r.doc_path || '') === docPath ||
        String(r.title || '').includes(f.replace(/\.md$/, '').slice(0, 20)),
    );
    if (seeded) {
      console.log(`  OK   ${docPath} → ${seeded.id} [${seeded.status}] (matched)`);
      continue;
    }
    missing.push({ docPath, title, id: ticketIdForDoc(docPath) });
    console.log(`  MISS ${docPath} → would create ${ticketIdForDoc(docPath)}`);
  }

  if (APPLY && missing.length) {
    for (const m of missing) {
      d1Query(
        `INSERT OR IGNORE INTO agentsam_tickets (
           id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
           blocks, blocked_by, supersedes, created_at, updated_at, closed_at,
           consecutive_pass_count, required_pass_count
         ) VALUES (
           ${sqlQuote(m.id)},
           ${sqlQuote(m.title)},
           'active',
           'Auto-indexed from plans/active — gate proof required before shipped',
           'iam-core',
           'planning',
           '["auto-sync","plans-active"]',
           'P2',
           ${sqlQuote(m.docPath)},
           '[]',
           '[]',
           NULL,
           unixepoch(),
           unixepoch(),
           NULL,
           0,
           2
         )`,
      );
      d1Query(
        `INSERT INTO agentsam_ticket_events (
           id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
         ) VALUES (
           ${sqlQuote(`tev_${randomUUID().replace(/-/g, '').slice(0, 16)}`)},
           ${sqlQuote(m.id)},
           'created',
           NULL,
           'active',
           ${sqlQuote(JSON.stringify({ source: 'sync-active-plans-tickets', doc_path: m.docPath }))},
           NULL,
           unixepoch()
         )`,
      );
      console.log(`  CREATED ${m.id}`);
    }
  } else if (missing.length && !APPLY) {
    console.log(`\n${missing.length} plan(s) lack tickets. Re-run with --apply to insert.`);
  }

  // Shipped-without-proof audit
  console.log('\n[audit] shipped / in_review without enough consecutive gate passes:');
  const risky = d1Query(
    `SELECT id, title, status, consecutive_pass_count, required_pass_count, doc_path
     FROM agentsam_tickets
     WHERE status IN ('shipped', 'in_review')
       AND COALESCE(consecutive_pass_count, 0) < COALESCE(required_pass_count, 2)
       AND doc_path LIKE 'plans/%'
     ORDER BY updated_at DESC
     LIMIT 40`,
  );
  if (!risky.length) {
    console.log('  (none matching proof gap query — or columns missing until migration 840)');
  } else {
    for (const r of risky) {
      console.log(
        `  WARN ${r.id} [${r.status}] passes=${r.consecutive_pass_count}/${r.required_pass_count} ${r.doc_path}`,
      );
    }
  }

  // Open active routing tickets
  console.log('\n[open] routing/workspace active:');
  const open = d1Query(
    `SELECT id, status, consecutive_pass_count, required_pass_count, doc_path
     FROM agentsam_tickets
     WHERE status IN ('active', 'in_review', 'blocked')
       AND (subsystem IN ('routing', 'workspace') OR id LIKE 'tkt_routing%' OR id LIKE 'tkt_workspace%')
     ORDER BY priority, updated_at DESC`,
  );
  for (const r of open) {
    console.log(
      `  ${r.id} [${r.status}] ${r.consecutive_pass_count || 0}/${r.required_pass_count || 2} ${r.doc_path || ''}`,
    );
  }

  if (missing.length && !APPLY) process.exit(2);
  process.exit(0);
}

main();
