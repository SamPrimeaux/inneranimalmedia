#!/usr/bin/env node
/**
 * Record one end-to-end validation pass on an agentsam_tickets row.
 * Increments consecutive_pass_count (resets to 1 if you pass --reset-streak).
 *
 * Tiers (plans/active/README.md · rule_ticket_dual_pass_e2e):
 *   1 = implementer proof (hypothesis until 2)
 *   2 = independent raw D1/log pull by a different actor
 *   3 = durable gate / subsequent real run (control-plane tickets)
 *
 *   npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=1 --detail='intent=… tool=…'
 *   npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=2 --detail='d1 row=…' --status=in_review
 */
import { loadEnvCloudflare } from './lib/load-env-cloudflare.mjs';
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

loadEnvCloudflare();

function arg(name, fallback = null) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : fallback;
}

const ticketId = arg('ticket');
const detailRaw = arg('detail', '');
const tierRaw = arg('tier', null);
const setStatus = arg('status', null);
const resetStreak = process.argv.includes('--reset-streak');

if (!ticketId || !detailRaw.trim()) {
  console.error(
    "Usage: npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=1|2|3 --detail='proof ids…' [--status=in_review] [--reset-streak]",
  );
  process.exit(2);
}

const tierNum = tierRaw != null && tierRaw !== '' ? Number(tierRaw) : null;
if (tierRaw != null && ![1, 2, 3].includes(tierNum)) {
  console.error('--tier must be 1, 2, or 3');
  process.exit(2);
}
const detail =
  tierNum != null && !/^\s*TIER\s*[123]\b/i.test(detailRaw)
    ? `TIER${tierNum}: ${detailRaw.trim()}`
    : detailRaw.trim();


const row = d1Query(
  `SELECT id, status, consecutive_pass_count, required_pass_count
   FROM agentsam_tickets WHERE id = ${sqlQuote(ticketId)} LIMIT 1`,
)[0];

if (!row) {
  console.error(`ticket not found: ${ticketId}`);
  process.exit(1);
}

const needRaw = Number(row.required_pass_count);
const need = Number.isFinite(needRaw) && needRaw > 0 ? Math.max(2, needRaw) : 2;
const prev = Number(row.consecutive_pass_count ?? 0);
const next = resetStreak ? 1 : prev + 1;

let gitSha = null;
try {
  gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/i.test(gitSha)) gitSha = null;
} catch {
  /* ignore */
}

const eventId = `tevt_e2e_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const newStatus = setStatus || (row.status === 'shipped' ? 'shipped' : 'in_review');

d1Query(
  `UPDATE agentsam_tickets
   SET consecutive_pass_count = ${next},
       required_pass_count = ${need},
       status = ${sqlQuote(newStatus)},
       last_gate_ok_at = unixepoch(),
       updated_at = unixepoch(),
       status_reason = ${sqlQuote(`e2e_pass ${next}/${need}: ${detail}`.slice(0, 900))}
   WHERE id = ${sqlQuote(ticketId)}`,
);

d1Query(
  `INSERT INTO agentsam_ticket_events (
     id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
   ) VALUES (
     ${sqlQuote(eventId)},
     ${sqlQuote(ticketId)},
     'e2e_pass',
     ${sqlQuote(row.status)},
     ${sqlQuote(newStatus)},
     ${sqlQuote(JSON.stringify({ pass: next, required: need, tier: tierNum, detail }))},
     ${sqlQuote(gitSha)},
     unixepoch()
   )`,
);

console.log(
  JSON.stringify(
    {
      ticket: ticketId,
      pass: next,
      required: need,
      tier: tierNum,
      status: newStatus,
      event_id: eventId,
      commit_sha: gitSha,
      shippable_hint:
        next >= need
          ? `Ready to assert: npm run assert:ticket-shippable -- --ticket=${ticketId} --set-shipped`
          : `Need ${need - next} more independent E2E pass(es) (named tiers T1/T2[/T3])`,
    },
    null,
    2,
  ),
);
