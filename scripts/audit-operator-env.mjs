#!/usr/bin/env node
/**
 * Audit platform operator build env (.env.cloudflare) vs D1 BYOK for canonical au_*.
 *
 * Usage:
 *   npm run audit:operator-env
 *   npm run audit:operator-env -- --remote
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';
import {
  BUILD_ENV_FILE,
  BRIDGE_ENV_FILE,
  REQUIRED_WRAPPER_VARS,
  REQUIRED_DEPLOY_VARS,
  REQUIRED_SYNC_VARS,
  INFRA_ENV_VARS,
  PROVIDER_ENV_MAP,
  PERSONAL_ENV_MAP,
  auditEnvPresence,
  providersWithEnvKeys,
  loadOperatorLaneIds,
} from './lib/operator-env-manifest.mjs';
import { resolveOperatorUserId } from './lib/resolve-operator-user-id.mjs';

loadEnvCloudflare();

const remote = process.argv.includes('--remote') || !process.argv.includes('--local');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();

function d1Query(sql) {
  const args = [
    'd1',
    'execute',
    'inneranimalmedia-business',
    remote ? '--remote' : '--local',
    '-c',
    'wrangler.production.toml',
    '--command',
    sql,
    '--json',
  ];
  const r = spawnSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'wrangler d1 failed');
  const parsed = JSON.parse(r.stdout);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results ?? [];
}

function section(title) {
  console.log(`\n## ${title}`);
}

function main() {
  const envPath = path.join(REPO_ROOT, BUILD_ENV_FILE);
  const bridgePath = path.join(REPO_ROOT, BRIDGE_ENV_FILE);

  section('Build env SSOT');
  console.log(`Primary:  ${BUILD_ENV_FILE} ${existsSync(envPath) ? '✓' : '✗ MISSING'}`);
  console.log(`Bridge:   ${BRIDGE_ENV_FILE} ${existsSync(bridgePath) ? '✓' : '(optional)'}`);
  console.log(`Wrapper:  ./scripts/with-cloudflare-env.sh <cmd>`);
  console.log(`BYOK sync: npm run sync:operator-keys`);

  if (!existsSync(envPath)) {
    console.error('\n✗ Copy .env.cloudflare.example → .env.cloudflare and fill real values.');
    process.exit(1);
  }

  const { userId, source, warnings } = resolveOperatorUserId({ lookupD1: remote, remote });
  section(`Operator au_* (${source})`);
  console.log(`user_id:     ${userId}`);
  console.log(`workspace:   ${WORKSPACE_ID}`);
  const laneIds = loadOperatorLaneIds();
  console.log(`lane ids:    ${laneIds.join(', ')}`);
  for (const w of warnings) console.warn(`⚠ ${w}`);

  section('Wrapper / deploy required vars');
  for (const [label, vars] of [
    ['with-cloudflare-env (minimum)', REQUIRED_WRAPPER_VARS],
    ['deploy:full / deploy-frontend', REQUIRED_DEPLOY_VARS],
    ['sync:operator-keys', REQUIRED_SYNC_VARS],
  ]) {
    const a = auditEnvPresence(process.env, vars);
    console.log(`\n${label}:`);
    console.log(`  present: ${a.present.join(', ') || '(none)'}`);
    if (a.missing.length) console.log(`  missing: ${a.missing.join(', ')}`);
    if (a.placeholder.length) console.log(`  placeholder: ${a.placeholder.join(', ')}`);
  }

  section('Infra / bridge (not all synced to BYOK)');
  const infra = auditEnvPresence(process.env, INFRA_ENV_VARS);
  console.log(`present: ${infra.present.join(', ') || '(none)'}`);
  if (infra.missing.length) console.log(`missing: ${infra.missing.join(', ')}`);

  const envProviders = providersWithEnvKeys(process.env);
  section('Providers with env values (→ sync:operator-keys)');
  console.log(envProviders.join(', ') || '(none)');

  section(`D1 BYOK rows (user_id=${userId})`);
  const d1Rows = d1Query(
    `SELECT provider, key_name, category FROM user_api_keys WHERE user_id='${userId}' AND is_active=1 ORDER BY category, provider`,
  );
  const d1Providers = new Set(
    d1Rows.filter((r) => r.category === 'provider').map((r) => String(r.provider).toLowerCase()),
  );
  for (const row of d1Rows) {
    console.log(`  [${row.category}] ${row.provider} — ${row.key_name}`);
  }
  if (!d1Rows.length) console.log('  (no active user_api_keys)');

  section('Env vs D1 gaps');
  for (const p of envProviders) {
    if (!d1Providers.has(p)) console.log(`  env has ${p} but D1 missing → run npm run sync:operator-keys`);
  }
  for (const p of d1Providers) {
    if (!envProviders.includes(p)) console.log(`  D1 has ${p} but no env value (stale row?)`);
  }

  section('Other Sam lane au_* without BYOK');
  for (const otherId of laneIds.filter((id) => id !== userId)) {
    const n = d1Query(
      `SELECT COUNT(*) AS n FROM user_api_keys WHERE user_id='${otherId}' AND is_active=1`,
    )[0]?.n;
    if (Number(n) === 0) {
      console.log(`  ${otherId}: no keys (login as this email won't see dashboard BYOK — use ${userId} or sync)`);
    }
  }

  section('Personal secrets');
  for (const row of PERSONAL_ENV_MAP) {
    const val = row.envKeys.map((k) => process.env[k]).find((v) => v && String(v).trim());
    const inD1 = d1Rows.some(
      (r) =>
        r.category === 'personal' &&
        String(r.key_name || '').toLowerCase().includes(row.secret_name.replace(/_/g, ' ').split(' ')[0]),
    );
    console.log(`  ${row.secret_name}: env=${val ? '✓' : '—'} d1=${inD1 ? '✓' : '—'}`);
  }

  const wrapperOk = auditEnvPresence(process.env, REQUIRED_WRAPPER_VARS);
  const deployOk = auditEnvPresence(process.env, REQUIRED_DEPLOY_VARS);
  const hasGaps = wrapperOk.missing.length || wrapperOk.placeholder.length;
  console.log('\n---');
  if (hasGaps) {
    console.log('✗ Fix missing/placeholder vars in .env.cloudflare');
    process.exit(1);
  }
  if (deployOk.missing.length) {
    console.log('⚠ Deploy vars incomplete — git/wrangler OK; full deploy may fail until filled');
  } else {
    console.log('✓ Build env aligned for operator lane');
  }
}

main();
