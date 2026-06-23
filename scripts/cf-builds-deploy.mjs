/**
 * Workers Builds deploy step — pinned wrangler via npm exec; retries transient 100146.
 * Use: npm run deploy:cf-builds (CF Builds has Node but not always bash).
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const CONFIG = process.env.CF_BUILDS_WRANGLER_CONFIG || 'wrangler.production.toml';
const MAX_ATTEMPTS = Number.parseInt(process.env.CF_BUILDS_DEPLOY_ATTEMPTS || '3', 10);
const SLEEP_SECS = Number.parseInt(process.env.CF_BUILDS_DEPLOY_RETRY_SLEEP || '8', 10);
const TRANSIENT_RE = /100146|Worker version could not be found/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWranglerDeploy() {
  const child = spawn('npm', ['exec', '--', 'wrangler', 'deploy', '-c', CONFIG], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stderr.write(text);
  });

  const [code] = await once(child, 'close');
  return { code: code ?? 1, output };
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  console.log(`[cf-builds-deploy] attempt ${attempt}/${MAX_ATTEMPTS}: wrangler deploy -c ${CONFIG}`);
  const { code, output } = await runWranglerDeploy();
  if (code === 0) process.exit(0);

  if (TRANSIENT_RE.test(output) && attempt < MAX_ATTEMPTS) {
    console.error(`[cf-builds-deploy] transient 100146 — retrying in ${SLEEP_SECS}s…`);
    await sleep(SLEEP_SECS * 1000);
    continue;
  }

  process.exit(code);
}

console.error(`[cf-builds-deploy] failed after ${MAX_ATTEMPTS} attempts`);
process.exit(1);
