#!/usr/bin/env node
/**
 * Codemode install smoke (no @cloudflare/codemode import — uses cloudflare: scheme in Node).
 * - workspace policy helpers
 * - wrangler dry-run shows env.LOADER
 * Run: node scripts/codemode-smoke.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const {
  CODEMODE_COMPANIONS_READ_TOOL_KEYS,
  CODEMODE_IAM_INFRA_HANDLER_TYPES,
  companionsReadToolAllowed,
  codemodeRowAllowedForWorkspace,
} = await import(pathToFileURL(path.join(REPO, 'src/core/codemode-workspace-policy.js')).href);

const { CODEMODE_TOOL_NAME, shouldUseCodemodeForRequest } = await import(
  pathToFileURL(path.join(REPO, 'src/core/codemode-constants.js')).href
);

let failed = 0;
function ok(msg) {
  console.log(`ok: ${msg}`);
}
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}

if (CODEMODE_TOOL_NAME !== 'codemode') fail('CODEMODE_TOOL_NAME');
else ok('CODEMODE_TOOL_NAME');

if (!CODEMODE_IAM_INFRA_HANDLER_TYPES.has('d1')) fail('IAM infra handler types');
else ok('IAM infra handler types');

if (!companionsReadToolAllowed({ tool_key: 'search_web' })) fail('companions read allow');
else ok('companions read allow');

if (codemodeRowAllowedForWorkspace({ tool_key: 'd1_query', handler_type: 'd1' }, true)) {
  fail('isolated workspace blocks d1');
} else ok('isolated workspace blocks d1');

if (
  !shouldUseCodemodeForRequest(
    { LOADER: {}, DB: {} },
    { agentLikeTooling: true, resolvedRoutingTaskType: 'agent', rawBodyTaskType: 'tool_chain_planning' },
  )
) {
  fail('shouldUseCodemodeForRequest raw tool_chain_planning');
} else ok('shouldUseCodemodeForRequest raw tool_chain_planning');

const dry = spawnSync(
  'bash',
  [
    '-lc',
    './scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml --dry-run 2>&1',
  ],
  { cwd: REPO, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
);
const dryOut = `${dry.stdout || ''}\n${dry.stderr || ''}`;
if (dryOut.includes('Build failed')) fail(`wrangler build failed:\n${dryOut.slice(0, 800)}`);
else ok('wrangler build succeeded');
if (!/env\.LOADER|Worker Loader/i.test(dryOut)) fail('wrangler dry-run missing env.LOADER');
else ok('wrangler dry-run lists env.LOADER');

if (failed) process.exit(1);
console.log('codemode-smoke: pass');
