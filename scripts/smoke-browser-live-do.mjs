#!/usr/bin/env node
/**
 * Agent Browser Live DO — focused smoke helper (documented commands).
 *
 * Usage:
 *   BASE=https://inneranimalmedia.com \
 *   SMOKE_AGENT_RUN_ID=ar_xxx \
 *   SMOKE_SESSION_COOKIE='session=...' \
 *   node scripts/smoke-browser-live-do.mjs
 *
 * Without cookie/run id: prints checklist only (exit 0).
 */
const BASE = (process.env.BASE || 'https://inneranimalmedia.com').replace(/\/$/, '');
const RUN_ID = String(process.env.SMOKE_AGENT_RUN_ID || '').trim();
const COOKIE = String(process.env.SMOKE_SESSION_COOKIE || '').trim();

async function hit(path, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (COOKIE) headers.Cookie = COOKIE;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  console.log('=== Agent Browser Live DO smoke ===');
  console.log(`BASE=${BASE}`);
  console.log(`RUN_ID=${RUN_ID || '(not set)'}`);
  console.log('');

  const steps = [
    'Deploy with BROWSER_SESSION + migration v7',
    'Apply migrations/500_browser_request_human_input_tool.sql',
    'Start agent run → browser_navigate with agent_run_id',
    'GET /api/browser/live/:id/health → ok',
    'GET /api/browser/live/:id → live_session.session_id',
    'BrowserView agentLive → Live View iframe',
    'Second browser tool → same session_id',
    'browser_request_human_input → HITL banner',
    'POST /api/browser/session/human-resume → resumed',
    'DELETE /api/browser/session { agent_run_id } → closed',
    'WS /api/browser/live/ws?agent_run_id= → session_snapshot + events_bootstrap',
  ];
  steps.forEach((s, i) => console.log(`${i + 1}. ${s}`));
  console.log('');

  if (!RUN_ID || !COOKIE) {
    console.log('Set SMOKE_AGENT_RUN_ID + SMOKE_SESSION_COOKIE to run live HTTP checks.');
    process.exit(0);
  }

  let failed = 0;

  const health = await hit(`/api/browser/live/${encodeURIComponent(RUN_ID)}/health`);
  console.log('health:', health.status, health.json);
  if (!health.ok) failed++;

  const session = await hit(`/api/browser/live/${encodeURIComponent(RUN_ID)}`);
  console.log('session:', session.status, session.json?.live_session?.session_id || session.json);
  if (!session.ok) failed++;

  const events = await hit(`/api/browser/live/${encodeURIComponent(RUN_ID)}/events?limit=10`);
  console.log('events:', events.status, Array.isArray(events.json?.events) ? events.json.events.length : events.json);
  if (!events.ok) failed++;

  const liveUrl = await hit(`/api/browser/live/${encodeURIComponent(RUN_ID)}/live-url`);
  console.log('live-url:', liveUrl.status, liveUrl.json?.devtools_frontend_url ? 'ok' : liveUrl.json);
  if (!liveUrl.ok) failed++;

  console.log('');
  if (failed) {
    console.error(`✗ ${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('✓ HTTP smoke passed (WS + HITL require manual/browser verification)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
