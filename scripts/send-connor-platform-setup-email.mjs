#!/usr/bin/env node
/**
 * Send Connor's Agent Sam platform setup guide via Resend.
 *
 * Email body: src/email-templates/connor-platform-setup.html (email-client safe)
 *   R2 (ASSETS): email/templates/connor-platform-setup.html
 * Attachment: docs/onboarding/connor-platform-setup.html (interactive checklist)
 *   R2 (ASSETS): email/guides/connor-platform-setup.html
 *
 * Sync templates to R2: ./scripts/upload-email-templates.sh
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/send-connor-platform-setup-email.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/send-connor-platform-setup-email.mjs
 *
 * Env:
 *   RESEND_API_KEY          required to send
 *   CONNOR_SETUP_TO         default connordmcneely@leadershiplegacydigital.com
 *   CONNOR_SETUP_FROM       default EMAIL_FROM or support@inneranimalmedia.com
 *   CONNOR_SETUP_REPLY_TO   default agent@inneranimalmedia.com (screenshots → Agent Sam inbox)
 *   CONNOR_SETUP_NAME       default Connor
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const TO = (process.env.CONNOR_SETUP_TO || 'connordmcneely@leadershiplegacydigital.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const FROM =
  process.env.CONNOR_SETUP_FROM ||
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'Sam Primeaux <support@inneranimalmedia.com>';
const NAME = process.env.CONNOR_SETUP_NAME || 'Connor';
const REPLY_TO = (process.env.CONNOR_SETUP_REPLY_TO || 'agent@inneranimalmedia.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SUBJECT =
  process.env.CONNOR_SETUP_SUBJECT ||
  'Agent Sam — your platform setup guide (GitHub, MCP & terminal)';

const EMAIL_TEMPLATE = path.join(REPO_ROOT, 'src/email-templates/connor-platform-setup.html');
const ATTACHMENT = path.join(REPO_ROOT, 'docs/onboarding/connor-platform-setup.html');

function renderTemplate(html, tokens) {
  return Object.entries(tokens).reduce((out, [key, val]) => {
    return out.replaceAll(`{{${key}}}`, val != null ? String(val) : '');
  }, html);
}

function loadFiles() {
  if (!fs.existsSync(EMAIL_TEMPLATE)) {
    throw new Error(`Missing email template: ${EMAIL_TEMPLATE}`);
  }
  if (!fs.existsSync(ATTACHMENT)) {
    throw new Error(`Missing attachment guide: ${ATTACHMENT}`);
  }
  const emailHtml = fs.readFileSync(EMAIL_TEMPLATE, 'utf8');
  const attachmentBytes = fs.readFileSync(ATTACHMENT);
  return { emailHtml, attachmentBytes };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { emailHtml, attachmentBytes } = loadFiles();

  const html = renderTemplate(emailHtml, {
    USER_NAME: NAME,
    USER_EMAIL: TO[0],
  });

  const text = [
    `Hi ${NAME},`,
    '',
    'Your Agent Sam workspace setup guide is attached (open in Chrome/Edge for the interactive checklist).',
    '',
    'Quick start:',
    '1. Dashboard: https://www.inneranimalmedia.com/dashboard/agent',
    '2. Connect GitHub OAuth (connordmcneely96)',
    '3. ChatGPT MCP: https://mcp.inneranimalmedia.com/mcp',
    '4. Your VM terminal: Settings → Keys & terminal → PTY setup → Start local (not Cloud)',
    '5. Workspace: you should only see ws_connor_mcneely — never Sam\'s repos or workspaces',
    '',
    'Issues or screenshots? Reply to this email (routes to our agent inbox), or send to:',
    '  agent@inneranimalmedia.com',
    '  ai@inneranimalmedia.com',
    'Include: what you clicked, Start local vs Cloud, and a screenshot if something looks wrong.',
    '',
    '— Sam Primeaux, Inner Animal Media',
  ].join('\n');

  const payload = {
    from: FROM,
    to: TO,
    reply_to: REPLY_TO.length === 1 ? REPLY_TO[0] : REPLY_TO,
    subject: SUBJECT,
    html,
    text,
    attachments: [
      {
        filename: 'connor-platform-setup.html',
        content: attachmentBytes.toString('base64'),
      },
    ],
  };

  if (dryRun) {
    console.log('[dry-run] Would send:');
    console.log('  to:', TO.join(', '));
    console.log('  from:', FROM);
    console.log('  reply_to:', REPLY_TO.join(', '));
    console.log('  subject:', SUBJECT);
    console.log('  html bytes:', Buffer.byteLength(html, 'utf8'));
    console.log('  attachment bytes:', attachmentBytes.length);
    return;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY not set. Run: ./scripts/with-cloudflare-env.sh node scripts/send-connor-platform-setup-email.mjs');
    process.exit(2);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error('Resend error', res.status, body);
    process.exit(1);
  }

  console.log('Sent to', TO.join(', '));
  console.log(body);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
