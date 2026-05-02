#!/usr/bin/env node
/**
 * Send the IAM morning work-plan email via Resend.
 *
 * Requires: RESEND_API_KEY in environment (e.g. source .env.cloudflare)
 *
 * Scheduling (Resend API):
 *   --now              send immediately (no scheduled_at)
 *   default            schedule using MORNING_BRIEF_SCHEDULED_AT or built-in default
 *
 * Env:
 *   MORNING_BRIEF_SCHEDULED_AT  natural language or ISO 8601 (see Resend schedule docs)
 *   default: "today at 8:30am America/Chicago"
 *
 *   MORNING_BRIEF_FROM   default support@inneranimalmedia.com
 *   MORNING_BRIEF_TO     default support@inneranimalmedia.com (comma-separated for multiple)
 */

import process from 'node:process';

const DEFAULT_SCHEDULE = process.env.MORNING_BRIEF_SCHEDULED_AT || 'today at 8:30am America/Chicago';
const FROM = process.env.MORNING_BRIEF_FROM || 'support@inneranimalmedia.com';
const TO = (process.env.MORNING_BRIEF_TO || 'support@inneranimalmedia.com').split(',').map((s) => s.trim()).filter(Boolean);

function buildMorningBriefHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Morning brief</title></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:24px auto;line-height:1.45;color:#111;background:#fafafa;padding:24px">
<h1 style="margin-top:0;font-size:1.35rem">Morning work plan</h1>
<p style="color:#444">Inner Animal Media / Agent Sam — priorities for today. Full detail: <code>docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md</code></p>

<h2 style="font-size:1rem;margin-top:1.5rem;border-bottom:1px solid #ddd;padding-bottom:6px">Last night baseline (done)</h2>
<ul style="color:#333">
<li>Webhooks: 8 endpoints, 15 subscriptions; GitHub events + hook_executions verified</li>
<li>Worker: CloudConvert + Meshy, cron cleanup 6am UTC, d1_write agent_memory_index fix</li>
<li>Secrets + D1 synced; Solarized Dark in D1; TURN configured</li>
</ul>

<h2 style="font-size:1rem;margin-top:1.5rem;border-bottom:1px solid #ddd;padding-bottom:6px">Priority order today</h2>
<ol style="font-weight:600;color:#222">
<li>Sprint 1 — Terminal session (~30 min) — sessionId / WS vs worker lookup (FloatingPreviewPanel surgical)</li>
<li>Sprint 2 — SettingsPanel.jsx (2–3h) — two-column nav, live saves, Env / Agents / Providers / Webhooks / Deploy / Cursor</li>
<li>Sprint 3 — Agent Sam polish (~2h) — docked input (CSS vars), icons, multi-panel, welcome cards, v=123 after R2</li>
</ol>

<h2 style="font-size:1rem;margin-top:1.5rem;border-bottom:1px solid #ddd;padding-bottom:6px">Sprint 1 checklist</h2>
<ul style="color:#333">
<li>Grep sessionId / WebSocket in agent-dashboard + runTerminalCommand in worker</li>
<li>Align one canonical id client + worker</li>
<li>Verify: pwd, cd, pwd persists; tail clean</li>
</ul>

<h2 style="font-size:1rem;margin-top:1.5rem;border-bottom:1px solid #ddd;padding-bottom:6px">Sprint 2 reminders</h2>
<ul style="color:#333">
<li>Mask secrets (last4); debounce saves; Webhooks + Deploy tabs new</li>
<li>Cursor tab: connection, last hook, sessions, spend_ledger monthly</li>
</ul>

<h2 style="font-size:1rem;margin-top:1.5rem;border-bottom:1px solid #ddd;padding-bottom:6px">End of day</h2>
<p style="color:#333">Terminal persistence OK; Settings usable without raw D1; polish shipped or scoped; session log + deploy/R2 notes if you ship UI.</p>

<p style="margin-top:2rem;font-size:0.85rem;color:#666">Sent from IAM automation (scheduled morning brief).</p>
</body></html>`;
}

async function main() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY not set. Example: set -a; . ./.env.cloudflare; set +a');
    process.exit(2);
  }

  const sendNow = process.argv.includes('--now');
  const subject =
    process.env.MORNING_BRIEF_SUBJECT ||
    '[IAM] Morning to-do — terminal, Settings, Agent polish';

  const body = {
    from: FROM,
    to: TO,
    subject,
    html: buildMorningBriefHtml(),
  };

  if (!sendNow) {
    body.scheduled_at = DEFAULT_SCHEDULE;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('Resend error', res.status, text);
    process.exit(1);
  }

  console.log(sendNow ? 'Sent immediately:' : `Scheduled (${body.scheduled_at}):`, text);
}

main();
