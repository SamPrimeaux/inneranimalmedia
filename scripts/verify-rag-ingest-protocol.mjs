#!/usr/bin/env node
/**
 * verify-rag-ingest-protocol.mjs — quality gates before deploy / after ingest.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/verify-rag-ingest-protocol.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/verify-rag-ingest-protocol.mjs --require-fresh --max-age-hours=168
 */
import { execFileSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { assertLaneContract, LANE_CONTRACTS } from './lib/rag-ingest-protocol.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WRAPPER = join(ROOT, 'scripts', 'with-cloudflare-env.sh');

const args = process.argv.slice(2);
const REQUIRE_FRESH = args.includes('--require-fresh');
const maxAgeArg = args.find((a) => a.startsWith('--max-age-hours='));
const MAX_AGE_HOURS = maxAgeArg ? Number(maxAgeArg.split('=')[1]) : 168;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.warn(`⚠ ${msg}`);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function gitStatusShort() {
  try {
    return execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function queryD1(sql) {
  const out = execFileSync(
    WRAPPER,
    [
      'npx',
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--json',
      '--command',
      sql,
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out);
  const results = parsed?.[0]?.results;
  if (Array.isArray(results) && results[0]?.results) return results[0].results;
  if (Array.isArray(results)) return results;
  return [];
}

console.log('\nverify-rag-ingest-protocol.mjs\n');

// Lane contracts
for (const [key, contract] of Object.entries(LANE_CONTRACTS)) {
  try {
    assertLaneContract(contract);
    ok(`lane contract: ${key} (${contract.vectorize_index} @ ${contract.embed_dims}d)`);
  } catch (e) {
    fail(`lane contract ${key}: ${e.message}`);
  }
}

// Git hygiene (warn only unless require-clean added later)
const dirty = gitStatusShort();
if (dirty) {
  warn(`inneranimalmedia working tree not clean:\n${dirty}`);
} else {
  ok('inneranimalmedia git working tree clean');
}

try {
  const pwaRoot = resolve(ROOT, '..', 'iam-pwa-services');
  const pwaDirty = execFileSync('git', ['status', '--short'], { cwd: pwaRoot, encoding: 'utf8' }).trim();
  if (pwaDirty) {
    warn(`iam-pwa-services has unrelated dirty files (do not mix commits):\n${pwaDirty}`);
  }
} catch {
  /* sibling repo optional */
}

// Recent receipts
const rows = queryD1(
  `SELECT chunk_id, vectorize_index, status, synced_at, details_json
   FROM vectorize_sync_log
   WHERE chunk_id LIKE 'run:%'
   ORDER BY synced_at DESC
   LIMIT 10`,
);

if (!rows.length) {
  warn('no run:* receipts in vectorize_sync_log yet');
  if (REQUIRE_FRESH) fail('--require-fresh: no ingest run receipts found');
} else {
  ok(`found ${rows.length} run receipt(s)`);
  for (const row of rows.slice(0, 5)) {
    let details = {};
    try {
      details = row.details_json ? JSON.parse(row.details_json) : {};
    } catch {
      warn(`invalid details_json on ${row.chunk_id}`);
    }
    const ageHours = (Date.now() / 1000 - Number(row.synced_at)) / 3600;
    const sha = details.git_commit_sha || '(no sha)';
    console.log(
      `  ${row.chunk_id} status=${row.status} index=${row.vectorize_index} sha=${sha.slice(0, 12)} age=${ageHours.toFixed(1)}h`,
    );
    if (details.files_indexed != null) {
      console.log(
        `    indexed=${details.files_indexed} skipped=${details.files_skipped} chunks=${details.chunks_embedded} deleted=${details.files_deleted ?? 0}`,
      );
    }
    if (REQUIRE_FRESH && row.status !== 'ok') {
      fail(`--require-fresh: receipt ${row.chunk_id} status=${row.status}`);
    }
    if (REQUIRE_FRESH && ageHours > MAX_AGE_HOURS) {
      fail(`--require-fresh: newest receipt older than ${MAX_AGE_HOURS}h (${row.chunk_id})`);
    }
  }
}

console.log('\nProtocol gates passed.\n');
