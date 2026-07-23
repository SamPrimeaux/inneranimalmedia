#!/usr/bin/env node
/**
 * Fire the first phone-email IDE loop outbound:
 *  - mint conversation id
 *  - send sam@ mail with [ref:as_<id>] via Resend
 *  - INSERT deployment_notifications tied to latest successful deployments.id
 *
 * Usage: ./scripts/with-cloudflare-env.sh node scripts/phone-loop-kickoff.mjs
 */
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const INBOX = 'sam@inneranimalmedia.com';
const D1 = 'inneranimalmedia-business';
const CFG = 'wrangler.production.toml';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function sqlString(v) {
  return `'${String(v ?? '').replace(/'/g, "''")}'`;
}

function d1Json(command) {
  const out = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      D1,
      '--remote',
      '-c',
      CFG,
      '--command',
      command,
      '--json',
    ],
    { cwd: root, encoding: 'utf8', env: process.env },
  );
  const parsed = JSON.parse(out);
  if (parsed?.error) throw new Error(JSON.stringify(parsed.error));
  return parsed?.[0]?.results ?? [];
}

async function main() {
  loadEnvFile(resolve(root, '.env.cloudflare'));
  loadEnvFile(resolve(root, '.env'));

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.RESEND_FROM || 'sam@inneranimalmedia.com').trim();
  if (!apiKey) {
    console.error('[phone-loop-kickoff] RESEND_API_KEY missing');
    process.exit(1);
  }

  const depRows = d1Json(
    `SELECT id FROM deployments
     WHERE lower(COALESCE(status,'')) IN ('success','succeeded','ok','complete','completed')
     ORDER BY datetime(COALESCE(created_at, updated_at)) DESC LIMIT 1`,
  );
  const deploymentId = depRows[0]?.id
    ? String(depRows[0].id)
    : `phone_loop_${Date.now()}`;

  const conversationId = randomUUID();
  const ref = `[ref:as_${conversationId}]`;
  const subject = '[Agent Sam] Phone loop kickoff — reply with your next instruction';
  const text = [
    'Phone-email IDE loop is live.',
    '',
    'Reply to this email (from info@inneranimals.com or sam@inneranimalmedia.com) with your next instruction.',
    'Keep the ref token below so the thread stays bound to this conversation.',
    '',
    '---',
    'Reply with your next instruction.',
    ref,
    '',
  ].join('\n');
  const html = `<pre style="white-space:pre-wrap;font-family:system-ui,sans-serif">${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')}</pre>\n<!-- agentsam:thread:${conversationId} -->`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [INBOX],
      subject,
      text,
      html,
    }),
  });
  const resJson = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[phone-loop-kickoff] Resend failed', res.status, resJson);
    process.exit(1);
  }
  const resendId = resJson?.id ? String(resJson.id) : null;

  const dnId = `dn_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const message = [
    text.slice(0, 4000),
    '',
    `conversation_id=${conversationId}`,
    `deep_link=/dashboard/agent/${conversationId}`,
    'resend_ok=1',
    resendId ? `resend_id=${resendId}` : '',
    'kickoff=1',
  ]
    .filter(Boolean)
    .join('\n');

  d1Json(
    `INSERT INTO deployment_notifications (
       id, deployment_id, notification_type, recipient, subject, message,
       status, sent_at, error_message, created_at, updated_at
     ) VALUES (
       ${sqlString(dnId)},
       ${sqlString(deploymentId)},
       'phone_loop_email',
       ${sqlString(INBOX)},
       ${sqlString(subject)},
       ${sqlString(message)},
       'sent',
       datetime('now'),
       NULL,
       datetime('now'),
       datetime('now')
     )`,
  );

  // Seed chat session so inbound reply has a home.
  try {
    d1Json(
      `INSERT OR IGNORE INTO agentsam_chat_sessions (
         conversation_id, tenant_id, user_id, workspace_id, title, created_at, updated_at
       ) VALUES (
         ${sqlString(conversationId)},
         'tenant_sam_primeaux',
         'au_871d920d1233cbd1',
         'ws_inneranimalmedia',
         ${sqlString('Phone loop kickoff')},
         unixepoch(),
         unixepoch()
       )`,
    );
  } catch (e) {
    console.warn('[phone-loop-kickoff] chat session seed skipped', e?.message || e);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        deployment_id: deploymentId,
        notification_id: dnId,
        conversation_id: conversationId,
        resend_id: resendId,
        to: INBOX,
        subject,
        ref,
        reply_hint:
          'Reply to the email at sam@ (allowlisted senders: info@inneranimals.com, sam@inneranimalmedia.com). Keep the [ref:as_…] token.',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error('[phone-loop-kickoff]', e?.message || e);
  process.exit(1);
});
