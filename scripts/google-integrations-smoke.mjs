#!/usr/bin/env node
/**
 * google-integrations-smoke.mjs — Gmail + Google Calendar connect routes (no OAuth session).
 *
 * Usage:
 *   node scripts/google-integrations-smoke.mjs
 *   BASE_URL=https://inneranimalmedia.com node scripts/google-integrations-smoke.mjs
 *
 * Expects unauthenticated connect → 302 to Google or 401/503 (never 404).
 * Expects /api/health → 200.
 */

const BASE = String(process.env.BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');

const ROUTES = [
  { name: 'health', url: `${BASE}/api/health`, expect: (s) => s === 200 },
  { name: 'gmail_connect', url: `${BASE}/api/integrations/gmail/connect`, expect: (s) => [302, 401, 503].includes(s) },
  {
    name: 'google_calendar_connect',
    url: `${BASE}/api/integrations/google-calendar/connect?return_to=/dashboard/collaborate`,
    expect: (s) => [302, 401, 503].includes(s),
  },
  {
    name: 'gmail_oauth_callback_missing_state',
    url: `${BASE}/api/oauth/gmail/callback`,
    expect: (s) => [302, 400].includes(s),
  },
  {
    name: 'gcal_oauth_callback_missing_state',
    url: `${BASE}/api/oauth/google-calendar/callback`,
    expect: (s) => [302, 400].includes(s),
  },
];

async function probe(route) {
  const res = await fetch(route.url, { redirect: 'manual' });
  const ok = route.expect(res.status);
  return { ...route, status: res.status, ok, location: res.headers.get('location') || null };
}

async function main() {
  const results = [];
  for (const route of ROUTES) {
    try {
      results.push(await probe(route));
    } catch (e) {
      results.push({ ...route, ok: false, error: e?.message || String(e) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ base: BASE, ok: failed.length === 0, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main();
