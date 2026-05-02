#!/usr/bin/env node
/**
 * Debug script for the Agent page (dashboard/agent).
 * Run: node scripts/debug-agent-page.mjs
 * Or: node scripts/debug-agent-page.mjs https://inneranimalmedia.com/dashboard/agent
 *
 * Use this when:
 * - User reports "stale" or "old" UI on /dashboard/agent
 * - Main content is blank or workstation/editor not visible
 * - You need to verify what the live site is actually serving vs repo
 *
 * Reads: docs/AGENT_PAGE_DEBUG_SUMMARY.md for full context.
 */

const BASE = process.argv[2] || 'https://inneranimalmedia.com';
const AGENT_URL = `${BASE.replace(/\/$/, '')}/dashboard/agent`;
const FRAGMENT_URL = `${BASE.replace(/\/$/, '')}/dashboard/pages/agent.html`;
const CACHE_BUST = `?v=${Date.now()}`;

const checks = [];
function ok(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  const icon = pass ? '✓' : '✗';
  console.log(`${icon} ${name}${detail ? ': ' + detail : ''}`);
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, { ...opts, redirect: 'follow' });
  const text = await res.text();
  return { res, text };
}

async function main() {
  console.log('\n--- Agent page debug ---');
  console.log(`Full page: ${AGENT_URL}${CACHE_BUST}`);
  console.log(`Fragment: ${FRAGMENT_URL}${CACHE_BUST}\n`);

  // 1) Fetch full agent page (with cache bust)
  let fullHtml, fullRes;
  try {
    const out = await fetchText(`${AGENT_URL}${CACHE_BUST}`);
    fullRes = out.res;
    fullHtml = out.text;
  } catch (e) {
    ok('Fetch full agent page', false, e.message);
    fullHtml = '';
    fullRes = null;
  }

  if (fullHtml) {
    ok('Fetch full agent page', fullRes.status === 200, `status ${fullRes.status}`);

    // Cache headers (we expect no-cache for dashboard HTML)
    const cc = fullRes.headers.get('cache-control') || '';
    ok('Cache-Control (no-cache preferred)', cc.includes('no-cache') || cc.includes('no-store'), cc || '(none)');

    // Markers that indicate "fresh" deploy (not stale)
    ok('Has .agent-sam-root', fullHtml.includes('agent-sam-root'));
    const workstationCollapsed = fullHtml.includes('id="agentSamWorkstation"') && fullHtml.includes('agent-sam-workstation collapsed">');
    ok('Workstation NOT collapsed by default', !workstationCollapsed, workstationCollapsed ? 'STALE: workstation has collapsed class' : 'workstation visible by default');
    ok('Root min-height safeguard', fullHtml.includes('min-height: 400px') || fullHtml.includes('min-height: 60vh'), fullHtml.includes('min-height: 400px') ? '400px' : fullHtml.includes('min-height: 60vh') ? '60vh only' : 'missing');
    ok('Footer chat pane markup', fullHtml.includes('agent-footer-chat'));
    ok('Context gauge', fullHtml.includes('agent-footer-context-gauge'));
    ok('Monaco container', fullHtml.includes('agentSamMonacoContainer'));
    ok('Single overlay (no duplicate id)', (fullHtml.match(/id="overlay"/g) || []).length <= 1, (fullHtml.match(/id="overlay"/g) || []).length > 1 ? 'DUPLICATE overlay id' : 'ok');
    ok('No debug strip in markup', !fullHtml.includes('Agent workspace loaded — if you see this'), fullHtml.includes('Agent workspace loaded') ? 'strip still present (old deploy)' : 'ok');
  }

  // 2) Fetch fragment (for shell-injected flow)
  try {
    const { res: fragRes, text: fragHtml } = await fetchText(`${FRAGMENT_URL}${CACHE_BUST}`);
    ok('Fetch fragment (pages/agent.html)', fragRes.status === 200, `status ${fragRes.status}`);
    if (fragRes.status === 200) {
      ok('Fragment has main content', fragHtml.includes('<main') && fragHtml.includes('agent-sam-root'));
      const fragWorkstationCollapsed = fragHtml.includes('agent-sam-workstation collapsed">');
      ok('Fragment workstation not collapsed', !fragWorkstationCollapsed, fragWorkstationCollapsed ? 'STALE' : 'ok');
    }
  } catch (e) {
    ok('Fetch fragment', false, e.message);
  }

  // Summary
  const failed = checks.filter((c) => !c.pass);
  console.log('\n---');
  if (failed.length) {
    console.log(`FAIL: ${failed.length} check(s) failed. Likely stale deploy or wrong R2 key.`);
    console.log('Next: Re-upload dashboard/agent.html and dashboard/pages/agent.html to R2 (see docs/AGENT_PAGE_DEBUG_SUMMARY.md).');
  } else {
    console.log('PASS: All checks. If UI still wrong, debug in browser (Elements, Console).');
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
