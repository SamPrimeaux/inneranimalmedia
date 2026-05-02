#!/usr/bin/env node
/**
 * Validate overnight setup: capture first before-screenshots and send one proof email.
 * Run once to prove D1, R2, Resend, and /api/browser/screenshot are wired correctly.
 * Does NOT run the full pipeline (no 30min wait, no patches). Use run-overnight-pipeline.sh for that.
 */

const RESEND_KEY = process.env.RESEND_API_KEY;
const CF_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT    = 'ede6590ac0d2fb7daf155b35653457b2';
const DB_ID      = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49';
const BUCKET     = 'inneranimalmedia';
const FROM       = process.env.RESEND_FROM || 'support@inneranimalmedia.com';
const TO         = process.env.RESEND_TO || 'support@inneranimalmedia.com';
const BASE       = 'https://inneranimalmedia.com';

const EVERY_PAGE = ['overview','finance','chats','mcp','cloud','time-tracking','agent','billing','clients','tools','calendar','images','draw','meet','kanban','cms','mail','pipelines','onboarding','user-settings','settings'];

async function d1(sql) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
  const d = await r.json();
  return d?.result?.[0]?.results || [];
}

async function screenshotToPath(page, subdir) {
  try {
    const url = encodeURIComponent(`${BASE}/dashboard/${page}`);
    const r = await fetch(`${BASE}/api/browser/screenshot?url=${url}`, {
      headers: { 'Authorization': `Bearer ${CF_TOKEN}` }
    });
    if (!r.ok) return { page, ok: false, error: `HTTP ${r.status}` };
    const buf = await r.arrayBuffer();
    const key = `reports/screenshots/${subdir}/${page}.jpg`;
    const put = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'image/jpeg' },
      body: buf
    });
    if (!put.ok) return { page, ok: false, error: `R2 PUT ${put.status}` };
    return { page, ok: true, key };
  } catch (e) {
    return { page, ok: false, error: e.message };
  }
}

async function sendEmail(subject, html) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: TO, subject, html })
  });
  const d = await r.json();
  return d;
}

function row(label, val, pass) {
  const c = pass ? '#22c55e' : '#ef4444';
  return `<tr><td style="padding:6px 10px;border:1px solid #334155;color:#94a3b8">${label}</td><td style="padding:6px 10px;border:1px solid #334155;color:${c};font-weight:bold">${val}</td></tr>`;
}

function table(rows) {
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0">${rows}</table>`;
}

function card(content) {
  return `<div style="background:#1e293b;border-radius:8px;padding:16px;margin:16px 0">${content}</div>`;
}

function shell(content) {
  return `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 auto">${content}</div>`;
}

async function run() {
  console.log('VALIDATE OVERNIGHT SETUP —', new Date().toISOString());

  const dateTag = new Date().toISOString().slice(0, 10);
  const beforeDir = `before-${dateTag}`;

  // 1) Prove D1
  let d1Ok = false;
  try {
    const rows = await d1(`SELECT 1 as ok`);
    d1Ok = Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    console.log('D1 check failed:', e.message);
  }
  console.log('D1:', d1Ok ? 'OK' : 'FAIL');

  // 2) Prove R2 + screenshot: capture before-screenshots for every page
  console.log('Capturing before-screenshots for', EVERY_PAGE.length, 'pages →', beforeDir);
  const beforeShots = await Promise.all(EVERY_PAGE.map(p => screenshotToPath(p, beforeDir)));
  const ok = beforeShots.filter(s => s.ok).length;
  const failed = beforeShots.filter(s => !s.ok);
  if (failed.length) failed.forEach(s => console.log('  FAIL', s.page, s.error));
  console.log('Screenshots:', ok + '/' + EVERY_PAGE.length);

  const shotRows = beforeShots.map(s => row(s.page, s.ok ? '✓ ' + (s.key || 'saved') : ('✗ ' + (s.error || '')), s.ok)).join('');

  // 3) Send one proof email
  const plan = `
    <ol style="color:#cbd5e1;line-height:2;padding-left:20px">
      <li>Before screenshots (this run) → R2 reports/screenshots/${beforeDir}/</li>
      <li>Pull broken pages from D1 theme_repair_status</li>
      <li>Patch unpatched fragments via R2 CF API, verify each with read-back</li>
      <li>Smoke test dashboard + API routes</li>
      <li>30min email, then hourly updates</li>
      <li>After screenshots → reports/screenshots/after-${dateTag}/</li>
      <li>Morning report with first action and before/after paths</li>
    </ol>
  `;

  if (!RESEND_KEY) {
    console.log('RESEND_API_KEY not set — skipping email. Screenshots and D1 check still ran.');
    console.log('R2 path: inneranimalmedia/reports/screenshots/' + beforeDir + '/');
    process.exit(0);
    return;
  }

  const res = await sendEmail(
    '✅ Overnight setup validated — before screenshots captured',
    shell(`
      <h1 style="color:#38bdf8;margin:0 0 4px">Setup validated</h1>
      <p style="color:#64748b;margin:0 0 24px">${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' })}</p>
      ${card(`
        <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase">Proof</p>
        <p style="margin:8px 0 0;font-size:18px;color:${d1Ok ? '#22c55e' : '#ef4444'}">D1: ${d1Ok ? 'OK' : 'FAIL'}</p>
        <p style="margin:4px 0 0;font-size:18px;color:${ok === EVERY_PAGE.length ? '#22c55e' : '#f59e0b'}">Before screenshots: ${ok}/${EVERY_PAGE.length} → R2 inneranimalmedia/reports/screenshots/${beforeDir}/</p>
      `)}
      <h2 style="color:#e2e8f0;font-size:13px;margin:16px 0 6px">Screenshot results</h2>
      ${table(shotRows)}
      <h2 style="color:#e2e8f0;font-size:13px;margin:16px 0 6px">Full pipeline plan (when you run overnight)</h2>
      ${plan}
      <p style="color:#475569;font-size:12px;margin-top:16px">
        To run the full pipeline: <code>./scripts/run-overnight-pipeline.sh</code><br>
        Cancel: D1 project_memory OVERNIGHT_USER_ACTION = {"cancel":true}
      </p>
    `)
  );

  if (res.id) {
    console.log('Email sent:', res.id);
  } else {
    console.log('Email failed:', res.message || JSON.stringify(res));
  }

  console.log('DONE. R2 path: inneranimalmedia/reports/screenshots/' + beforeDir + '/');
}

run().catch(e => {
  console.error('VALIDATE FAILED:', e.message);
  process.exit(1);
});
