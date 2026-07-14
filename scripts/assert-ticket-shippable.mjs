#!/usr/bin/env node
/**
 * Refuse to mark a ticket shipped unless dual-pass E2E proof exists.
 *
 * Requires consecutive_pass_count >= required_pass_count (default 2)
 * AND either:
 *   - ≥ required green agentsam_gate_runs rows, OR
 *   - ≥ required agentsam_ticket_events with event_type = 'e2e_pass'
 *
 * Deploy alone is never enough.
 *
 *   npm run assert:ticket-shippable -- --ticket=tkt_…
 *   npm run assert:ticket-shippable -- --ticket=tkt_… --set-shipped
 *   SKIP_TICKET_DUAL_PASS=1 … --set-shipped   # operator override (logged)
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
const skipLaw = process.env.SKIP_TICKET_DUAL_PASS === '1';

if (!ticketId) {
  console.error('Usage: npm run assert:ticket-shippable -- --ticket=tkt_… [--set-shipped]');
  process.exit(2);
}

const row = d1Query(
  `SELECT id, status, consecutive_pass_count, required_pass_count, last_gate_run_id, last_gate_ok_at, doc_path, status_reason
   FROM agentsam_tickets WHERE id = ${sqlQuote(ticketId)} LIMIT 1`,
)[0];

if (!row) {
  console.error(`ticket not found: ${ticketId}`);
  process.exit(1);
}

const needRaw = Number(row.required_pass_count);
const need = Number.isFinite(needRaw) && needRaw > 0 ? Math.max(2, needRaw) : 2;

const have = Number(row.consecutive_pass_count ?? 0);
const gates = d1Query(
  `SELECT id, ok, git_sha, created_at FROM agentsam_gate_runs
   WHERE ticket_id = ${sqlQuote(ticketId)} AND ok = 1
   ORDER BY created_at DESC LIMIT 10`,
);
const e2ePasses = d1Query(
  `SELECT id, detail, commit_sha, created_at FROM agentsam_ticket_events
   WHERE ticket_id = ${sqlQuote(ticketId)} AND event_type = 'e2e_pass'
   ORDER BY created_at DESC LIMIT 10`,
);

const proofOk = gates.length >= need || e2ePasses.length >= need;
const countOk = have >= need;
const shippable = skipLaw ? true : countOk && proofOk;

console.log(
  JSON.stringify(
    {
      ticket: row,
      green_gates: gates.length,
      e2e_pass_events: e2ePasses.length,
      e2e_pass_ids: e2ePasses.map((e) => e.id),
      consecutive_pass_count: have,
      required_pass_count: need,
      shippable,
      skip_override: skipLaw,
      law: 'Two independent E2E validations required. Deploy ≠ pass. See rule_ticket_dual_pass_e2e.',
    },
    null,
    2,
  ),
);

if (!shippable) {
  console.error(
    `\nNOT SHIPPABLE: consecutive_pass_count=${have}/${need}, green_gates=${gates.length}, e2e_pass_events=${e2ePasses.length}`,
  );
  console.error(
    `Record passes: npm run record:ticket-e2e-pass -- --ticket=${ticketId} --detail='PASS… proof ids'`,
  );
  process.exit(1);
}

if (setShipped) {
  const from = row.status;
  const reason = skipLaw
    ? `OVERRIDE SKIP_TICKET_DUAL_PASS=1 (ops). Prior status_reason: ${row.status_reason || ''}`
    : `Dual-pass E2E ok: consecutive=${have}/${need}, gates=${gates.length}, e2e_pass=${e2ePasses.length}`;
  d1Query(
    `UPDATE agentsam_tickets
     SET status = 'shipped',
         status_reason = ${sqlQuote(reason.slice(0, 900))},
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
       ${sqlQuote(
         JSON.stringify({
           proof: 'assert:ticket-shippable',
           consecutive_pass_count: have,
           gates: gates.map((g) => g.id),
           e2e_passes: e2ePasses.map((e) => e.id),
           skip_override: skipLaw,
         }),
       )},
       ${sqlQuote(gates[0]?.git_sha || e2ePasses[0]?.commit_sha || null)},
       unixepoch()
     )`,
  );
  console.log(`\nSHIPPED ${ticketId}`);
}

process.exit(0);
