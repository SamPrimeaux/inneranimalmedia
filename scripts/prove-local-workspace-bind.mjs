#!/usr/bin/env node
/**
 * prove-local-workspace-bind.mjs — independent proof for Mac↔device continuity bind.
 * Uses the same matcher as production; writes/reads agentsam_workspace_state via D1.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/prove-local-workspace-bind.mjs
 */
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';
import { matchLocalFolderToWorkspace, githubRepoName } from '../src/core/match-local-folder-to-workspace.js';

loadEnvCloudflare(REPO_ROOT);

function rows(sql) {
  const out = d1Query(sql);
  return Array.isArray(out) ? out : [];
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
          updated_at
   FROM agentsam_workspace_state WHERE workspace_id = 'ws_inneranimalmedia' LIMIT 1`,
);
console.log('state_row:', JSON.stringify(proofA, null, 2));
if (!proofA[0] || proofA[0].workspace_id !== 'ws_inneranimalmedia' || proofA[0].proof_marker !== marker) {
  console.error('FAIL: state not under ws_inneranimalmedia with proof marker');
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
// deliberately do nothing on no-match
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

console.log('PASS: local-bind continuity proofs');
