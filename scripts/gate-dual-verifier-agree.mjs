#!/usr/bin/env node
/**
 * Offline / ops entry for N-of-M dual-verifier agreement.
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/gate-dual-verifier-agree.mjs \
 *     --ticket=tkt_… \
 *     --a-verdict=pass --a-evidence='SELECT … → 1 row' \
 *     --b-verdict=pass --b-evidence='rg … → match at L42'
 */
import { randomUUID } from 'node:crypto';
import { loadEnvCloudflare } from './lib/load-env-cloudflare.mjs';
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';
import { evaluateDualVerifierAgreement } from '../src/core/dual-verifier-gate.js';

loadEnvCloudflare();

function arg(name, fallback = null) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : fallback;
}

const ticketId = arg('ticket');
const aVerdict = arg('a-verdict', 'fail');
const bVerdict = arg('b-verdict', 'fail');
const aEvidence = arg('a-evidence', '');
const bEvidence = arg('b-evidence', '');
const minAgree = Number(arg('min-agree', '2')) || 2;
const dryRun = process.argv.includes('--dry-run');

if (!ticketId) {
  console.error(
    'Usage: node scripts/gate-dual-verifier-agree.mjs --ticket=tkt_… --a-verdict=pass|fail --a-evidence=… --b-verdict=… --b-evidence=… [--dry-run]',
  );
  process.exit(2);
}

const decision = evaluateDualVerifierAgreement({
  minAgree,
  verifiers: [
    {
      label: 'verifier_a',
      passed: aVerdict === 'pass',
      failed: aVerdict !== 'pass',
      evidence: aEvidence,
      raw: {},
    },
    {
      label: 'verifier_b',
      passed: bVerdict === 'pass',
      failed: bVerdict !== 'pass',
      evidence: bEvidence,
      raw: {},
    },
  ],
});

console.log(JSON.stringify({ ticket: ticketId, decision, dry_run: dryRun }, null, 2));

if (dryRun) process.exit(decision.ok ? 0 : 1);

const ticket = d1Query(
  `SELECT id, status FROM agentsam_tickets WHERE id = ${sqlQuote(ticketId)} LIMIT 1`,
)[0];
if (!ticket) {
  console.error('ticket not found');
  process.exit(1);
}

const fromStatus = ticket.status;
const detailBase = {
  gate: 'agentsam.gate.dual_verifier_agree',
  reason: decision.reason,
  agree_count: decision.agree_count,
  min_agree: decision.min_agree,
  verifiers: (decision.verifiers || []).map((v) => ({
    label: v.label,
    passed: v.passed,
    evidence_preview: String(v.evidence || '').slice(0, 400),
  })),
  source: 'scripts/gate-dual-verifier-agree.mjs',
};

for (const v of decision.verifiers || []) {
  const id = `tevt_vfy_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  d1Query(
    `INSERT INTO agentsam_ticket_events (
       id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
     ) VALUES (
       ${sqlQuote(id)},
       ${sqlQuote(ticketId)},
       ${sqlQuote(decision.passed ? 'verifier_pass' : 'verifier_fail')},
       ${sqlQuote(fromStatus)},
       ${sqlQuote(fromStatus)},
       ${sqlQuote(
         JSON.stringify({
           ...detailBase,
           verifier: v.label,
           verdict: v.passed ? 'pass' : 'fail',
           evidence: String(v.evidence || '').slice(0, 1500),
         }).slice(0, 4000),
       )},
       NULL,
       unixepoch()
     )`,
  );
}

const gateEventId = `tevt_dvg_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
d1Query(
  `INSERT INTO agentsam_ticket_events (
     id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
   ) VALUES (
     ${sqlQuote(gateEventId)},
     ${sqlQuote(ticketId)},
     ${sqlQuote(decision.passed ? 'dual_verifier_pass' : 'dual_verifier_fail')},
     ${sqlQuote(fromStatus)},
     ${sqlQuote(decision.passed && fromStatus !== 'shipped' ? 'in_review' : fromStatus)},
     ${sqlQuote(JSON.stringify(detailBase).slice(0, 4000))},
     NULL,
     unixepoch()
   )`,
);

if (decision.passed && fromStatus !== 'shipped') {
  d1Query(
    `UPDATE agentsam_tickets
     SET status = 'in_review',
         status_reason = ${sqlQuote(
           `dual_verifier ${decision.agree_count}/${decision.min_agree} agree (${gateEventId})`.slice(0, 900),
         )},
         last_gate_ok_at = unixepoch(),
         updated_at = unixepoch()
     WHERE id = ${sqlQuote(ticketId)}`,
  );
}

console.log(JSON.stringify({ persist: { event_id: gateEventId, ok: decision.ok } }, null, 2));
process.exit(decision.ok ? 0 : 1);
