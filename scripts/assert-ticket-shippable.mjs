#!/usr/bin/env node
/**
 * Refuse to mark a ticket shipped unless consecutive_pass_count >= required_pass_count
 * and a recent green agentsam_gate_runs row exists. Deploy alone is not enough.
 *
 *   npm run assert:ticket-shippable -- --ticket=tkt_routing_tool_ssot
 *   npm run assert:ticket-shippable -- --ticket=tkt_routing_tool_ssot --set-shipped
 */
import { loadEnvCloudflare } from './lib/load-env-cloudflare.mjs';
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';
import { randomUUID } from 'node:crypto';

loadEnvCloudflare();

function arg(name, fallback = null) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : fallback;
}

const ticketId = arg('ticket');
const setShipped = process.argv.includes('--set-shipped');

if (!ticketId) {
  console.error('Usage: npm run assert:ticket-shippable -- --ticket=tkt_… [--set-shipped]');
  process.exit(2);
}

const row = d1Query(
  `SELECT id, status, consecutive_pass_count, required_pass_count, last_gate_run_id, last_gate_ok_at, doc_path
   FROM agentsam_tickets WHERE id = ${sqlQuote(ticketId)} LIMIT 1`,
)[0];

if (!row) {
  console.error(`ticket not found: ${ticketId}`);
  process.exit(1);
}

const need = Number(row.required_pass_count ?? 2);
const have = Number(row.consecutive_pass_count ?? 0);
const gates = d1Query(
  `SELECT id, ok, git_sha, created_at FROM agentsam_gate_runs
   WHERE ticket_id = ${sqlQuote(ticketId)} AND ok = 1
   ORDER BY created_at DESC LIMIT 5`,
);

console.log(
  JSON.stringify(
    {
      ticket: row,
      green_gates: gates,
      shippable: have >= need && gates.length >= need,
      law: 'Deploy success does not count. Need consecutive gate passes with receipts.',
    },
    null,
    2,
  ),
);

if (have < need || gates.length < need) {
  console.error(
    `\nNOT SHIPPABLE: consecutive_pass_count=${have} required=${need} green_gate_rows=${gates.length}`,
  );
  process.exit(1);
}

if (setShipped) {
  const from = row.status;
  d1Query(
    `UPDATE agentsam_tickets
     SET status = 'shipped',
         status_reason = ${sqlQuote(`Gate proof x${have} (last=${row.last_gate_run_id})`)},
         closed_at = unixepoch(),
         updated_at = unixepoch()
     WHERE id = ${sqlQuote(ticketId)}`,
  );
  d1Query(
    `INSERT INTO agentsam_ticket_events (
       id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
     ) VALUES (
       ${sqlQuote(`tev_${randomUUID().replace(/-/g, '').slice(0, 16)}`)},
       ${sqlQuote(ticketId)},
       'status_change',
       ${sqlQuote(from)},
       'shipped',
       ${sqlQuote(JSON.stringify({ proof: 'assert:ticket-shippable', consecutive_pass_count: have, gates: gates.map((g) => g.id) }))},
       ${sqlQuote(gates[0]?.git_sha || null)},
       unixepoch()
     )`,
  );
  console.log(`\nSHIPPED ${ticketId} with gate proof`);
}

process.exit(0);
