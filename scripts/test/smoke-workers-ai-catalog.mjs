#!/usr/bin/env node
/**
 * Smoke Workers AI lanes: execos demo probe + D1 active picker count.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function run(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const demoRaw = run(
  'curl -sS https://execos.inneranimalmedia.com/api/demo/models -H "X-Demo-Access-Key: 1937"',
);
const demo = JSON.parse(demoRaw);
if (!demo.active_model_id) {
  console.error('FAIL: execos demo models missing active_model_id');
  process.exit(1);
}

const d1Raw = run(
  './scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --json --command "SELECT COUNT(*) AS n FROM agentsam_ai WHERE provider=\'workers_ai\' AND mode=\'model\' AND status=\'active\' AND show_in_picker=1"',
);
const d1 = JSON.parse(d1Raw);
const active = d1[0]?.results?.[0]?.n ?? 0;
if (Number(active) < 10) {
  console.error(`FAIL: expected >=10 active Workers AI picker rows, got ${active}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      execos_active_model: demo.active_model_id,
      agentsam_ai_active_picker: active,
    },
    null,
    2,
  ),
);
