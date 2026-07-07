#!/usr/bin/env node
/**
 * Hard-delete all is_archived=1 rows in agentsam_chat_sessions (D1 + R2 + DO).
 *
 * Dry-run (default):
 *   node scripts/purge-archived-chat-sessions.mjs
 *
 * Apply:
 *   node scripts/purge-archived-chat-sessions.mjs --apply
 *
 * Auth: INTERNAL_API_SECRET from .env.cloudflare (X-Internal-Secret).
 */
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';

const PURGE_CONFIRM = 'PURGE_ARCHIVED_CHAT_SESSIONS';

function parseArgs(argv) {
  const out = { apply: false, origin: 'https://inneranimalmedia.com', limit: 500 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--origin' && argv[i + 1]) {
      out.origin = argv[++i].replace(/\/$/, '');
    } else if (a === '--limit' && argv[i + 1]) {
      out.limit = Number(argv[++i]) || 500;
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/purge-archived-chat-sessions.mjs [--apply] [--origin URL] [--limit N]');
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  loadEnvCloudflare(REPO_ROOT);
  const { apply, origin, limit } = parseArgs(process.argv);
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret) {
    console.error('INTERNAL_API_SECRET missing — add to .env.cloudflare');
    process.exit(1);
  }

  const url = `${origin}/api/internal/chat-sessions/purge-archived`;
  const body = {
    confirm: PURGE_CONFIRM,
    dry_run: !apply,
    limit,
  };

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} → POST ${url}`);
  console.log(`limit=${limit}`);

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
    console.log('\nRe-run with --apply to hard-delete archived chat sessions.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
