#!/usr/bin/env node
/**
 * Purge all agentsam_artifacts (+ R2 objects) for a workspace — clean-slate library UX.
 *
 * Dry-run (default):
 *   node scripts/purge-workspace-artifacts.mjs --workspace ws_inneranimalmedia
 *
 * Apply:
 *   node scripts/purge-workspace-artifacts.mjs --workspace ws_inneranimalmedia --apply
 *
 * Auth: INTERNAL_API_SECRET from .env.cloudflare (X-Internal-Secret).
 */
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';

const PURGE_CONFIRM = 'PURGE_WORKSPACE_ARTIFACTS';

function parseArgs(argv) {
  const out = { workspace: 'ws_inneranimalmedia', apply: false, origin: 'https://inneranimalmedia.com' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--workspace' && argv[i + 1]) {
      out.workspace = argv[++i];
    } else if (a === '--origin' && argv[i + 1]) {
      out.origin = argv[++i].replace(/\/$/, '');
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/purge-workspace-artifacts.mjs [--workspace ID] [--apply] [--origin URL]`);
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  loadEnvCloudflare(REPO_ROOT);
  const { workspace, apply, origin } = parseArgs(process.argv);
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret) {
    console.error('INTERNAL_API_SECRET missing — add to .env.cloudflare');
    process.exit(1);
  }

  const url = `${origin}/api/agent/artifacts/purge`;
  const body = {
    confirm: PURGE_CONFIRM,
    workspace_id: workspace,
    dry_run: !apply,
    delete_r2: true,
  };

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} → POST ${url}`);
  console.log(`workspace_id=${workspace}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': secret,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  console.log(JSON.stringify(data, null, 2));

  if (!res.ok || !data.ok) {
    process.exit(1);
  }

  if (!apply) {
    console.log('\nRe-run with --apply to delete D1 rows and R2 objects.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
