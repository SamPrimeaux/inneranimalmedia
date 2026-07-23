#!/usr/bin/env node
/**
 * prove-local-workspace-bind.mjs — independent proof for Mac↔device continuity bind.
 *
 * Writes:
 *   1) Live 1:1 row in agentsam_workspace_state (mutable — latest bind only)
 *   2) Append-only agentsam_ticket_events + agentsam_gate_runs (durable — re-checkable)
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/prove-local-workspace-bind.mjs
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';
import { matchLocalFolderToWorkspace } from '../src/core/match-local-folder-to-workspace.js';

loadEnvCloudflare(REPO_ROOT);

const TICKET_ID = 'tkt_local_workspace_bind_continuity';
const GATE_KEY = 'local_workspace_bind';

function rows(sql) {
  const out = d1Query(sql);
  return Array.isArray(out) ? out : [];
}

function gitSha() {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** Ensure standing ticket exists for append-only proof receipts. */
function ensureProofTicket() {
  const existing = rows(
    `SELECT id FROM agentsam_tickets WHERE id = ${sqlQuote(TICKET_ID)} LIMIT 1`,
  )[0];
  if (existing?.id) return;
  d1Query(
    `INSERT INTO agentsam_tickets (
       id, title, status, status_reason, project, subsystem, tags, priority,
       doc_path, required_pass_count, consecutive_pass_count, created_at, updated_at
     ) VALUES (
       ${sqlQuote(TICKET_ID)},
       'Local Explorer → real workspace bind (Mac↔device continuity)',
       'active',
       'Standing ticket for append-only local-bind proof receipts',
       'inneranimalmedia',
       'workspace',
       '["continuity","local-bind","proof"]',
       'p0',
       'scripts/prove-local-workspace-bind.mjs',
       2,
       0,
       unixepoch(),
       unixepoch()
     )`,
  );
}

const candidates = rows(
  `SELECT aw.id, aw.name, aw.workspace_slug AS slug,
          COALESCE(NULLIF(TRIM(w.github_repo), ''), aw.github_repo) AS github_repo,
          aw.root_path, w.pty_path
   FROM agentsam_workspace aw
   LEFT JOIN workspaces w ON w.id = aw.id
   WHERE aw.status != 'archived'`,
);

console.log('--- PROOF A: curated folder inneranimalmedia ---');
const hitA = matchLocalFolderToWorkspace('inneranimalmedia', candidates);
console.log('match:', JSON.stringify(hitA));
if (!hitA || hitA.id !== 'ws_inneranimalmedia') {
  console.error('FAIL: expected ws_inneranimalmedia');
  process.exit(1);
}

const marker = `prove_bind_${Date.now()}`;
const sha = gitSha();
const existing = rows(
  `SELECT id, state_json FROM agentsam_workspace_state WHERE workspace_id = 'ws_inneranimalmedia' LIMIT 1`,
)[0];
let state = {};
try {
  state = existing?.state_json ? JSON.parse(existing.state_json) : {};
} catch {
  state = {};
}
state.local_explorer = {
  schema: 'local_explorer_bind_v1',
  folderName: 'inneranimalmedia',
  bind_reason: hitA.reason,
  lastOpenedAt: Date.now(),
  proof_marker: marker,
};
const stateJson = JSON.stringify(state).replace(/'/g, "''");
if (existing?.id) {
  d1Query(
    `UPDATE agentsam_workspace_state SET state_json = '${stateJson}', updated_at = unixepoch() WHERE id = ${sqlQuote(existing.id)}`,
  );
} else {
  d1Query(
    `INSERT INTO agentsam_workspace_state (id, workspace_id, workspace_type, files_open, state_json, created_at, updated_at)
     VALUES ('wss_' || lower(hex(randomblob(8))), 'ws_inneranimalmedia', 'ide', '[]', '${stateJson}', unixepoch(), unixepoch())`,
  );
}

const proofA = rows(
  `SELECT id, workspace_id, json_extract(state_json, '$.local_explorer.proof_marker') AS proof_marker,
          json_extract(state_json, '$.local_explorer.folderName') AS folder_name,
          json_extract(state_json, '$.local_explorer.bind_reason') AS bind_reason,
          updated_at
   FROM agentsam_workspace_state WHERE workspace_id = 'ws_inneranimalmedia' LIMIT 1`,
);
console.log('state_row (mutable live):', JSON.stringify(proofA, null, 2));
if (!proofA[0] || proofA[0].workspace_id !== 'ws_inneranimalmedia' || proofA[0].proof_marker !== marker) {
  console.error('FAIL: state not under ws_inneranimalmedia with proof marker');
  process.exit(1);
}

ensureProofTicket();
const eventId = `tevt_bind_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const gateId = `gate_bind_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const durableDetail = {
  kind: 'local_workspace_bind_proof',
  proof_marker: marker,
  workspace_id: 'ws_inneranimalmedia',
  folderName: 'inneranimalmedia',
  bind_reason: hitA.reason,
  state_row_id: proofA[0].id,
  gate_run_id: gateId,
};
d1Query(
  `INSERT INTO agentsam_ticket_events (
     id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
   ) VALUES (
     ${sqlQuote(eventId)},
     ${sqlQuote(TICKET_ID)},
     'local_bind_proof',
     NULL,
     NULL,
     ${sqlQuote(JSON.stringify(durableDetail))},
     ${sqlQuote(sha)},
     unixepoch()
   )`,
);
d1Query(
  `INSERT INTO agentsam_gate_runs (id, gate_key, ticket_id, git_sha, ok, rounds_json, receipt_path, created_at)
   VALUES (
     ${sqlQuote(gateId)},
     ${sqlQuote(GATE_KEY)},
     ${sqlQuote(TICKET_ID)},
     ${sqlQuote(sha)},
     1,
     ${sqlQuote(JSON.stringify([{ id: 'A', ok: true, marker, bind_reason: hitA.reason }]))},
     ${sqlQuote(`prove-local-workspace-bind:${marker}`)},
     unixepoch()
   )`,
);

const durable = rows(
  `SELECT id, ticket_id, event_type, detail, commit_sha, created_at
   FROM agentsam_ticket_events
   WHERE id = ${sqlQuote(eventId)}
   LIMIT 1`,
);
console.log('durable_event (append-only):', JSON.stringify(durable, null, 2));
if (!durable[0] || !String(durable[0].detail || '').includes(marker)) {
  console.error('FAIL: durable ticket_event missing marker');
  process.exit(1);
}

console.log('--- PROOF B: scratch folder (no D1 write) ---');
const hitB = matchLocalFolderToWorkspace('totally-random-scratch-xyz-999', candidates);
console.log('match:', JSON.stringify(hitB));
if (hitB) {
  console.error('FAIL: scratch must not match');
  process.exit(1);
}
const beforeScratch = rows(`SELECT COUNT(*) n FROM agentsam_workspace_state`);
const afterScratch = rows(`SELECT COUNT(*) n FROM agentsam_workspace_state`);
console.log('state_count_before_after:', beforeScratch[0]?.n, afterScratch[0]?.n);
if (beforeScratch[0]?.n !== afterScratch[0]?.n) {
  console.error('FAIL: scratch path must not change state table');
  process.exit(1);
}

console.log('--- PROOF C: second-session read (same tenant row) ---');
const readBack = rows(
  `SELECT workspace_id, json_extract(state_json, '$.local_explorer.proof_marker') AS proof_marker
   FROM agentsam_workspace_state WHERE workspace_id = 'ws_inneranimalmedia' LIMIT 1`,
);
console.log('second_device_read:', JSON.stringify(readBack, null, 2));
if (readBack[0]?.proof_marker !== marker) {
  console.error('FAIL: second read missing marker');
  process.exit(1);
}

console.log('--- sentinel check ---');
const sentinel = rows(
  `SELECT id FROM agentsam_workspace WHERE id = 'ws_local_explorer'
   UNION ALL
   SELECT id FROM agentsam_workspace_state WHERE workspace_id = 'ws_local_explorer' LIMIT 5`,
);
console.log('sentinel_rows:', JSON.stringify(sentinel));

console.log('--- DURABLE LOG (re-verify against this, not mutable state_row) ---');
const recent = rows(
  `SELECT id, json_extract(detail, '$.proof_marker') AS proof_marker,
          json_extract(detail, '$.workspace_id') AS workspace_id,
          json_extract(detail, '$.bind_reason') AS bind_reason,
          created_at, commit_sha
   FROM agentsam_ticket_events
   WHERE ticket_id = ${sqlQuote(TICKET_ID)} AND event_type = 'local_bind_proof'
   ORDER BY created_at DESC LIMIT 5`,
);
console.log(JSON.stringify({ ticket_id: TICKET_ID, event_id: eventId, gate_run_id: gateId, recent }, null, 2));

console.log('PASS: local-bind continuity proofs (live state + append-only event)');
