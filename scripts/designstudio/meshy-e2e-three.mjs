#!/usr/bin/env node
/**
 * End-to-end Meshy smoke: mint session → 3 text-to-3d jobs → poll until GLB URLs.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/designstudio/meshy-e2e-three.mjs
 */
import { mintAgentSessionCookie } from '../lib/mint-agent-session.mjs';

const BASE = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const POLL_MS = Number(process.env.MESHY_E2E_POLL_MS || 15000);
const TIMEOUT_MS = Number(process.env.MESHY_E2E_TIMEOUT_MS || 20 * 60 * 1000);

const PROMPTS = [
  'steampunk octopus desk lamp with brass gears and warm glow',
  'minimalist ceramic coffee mug with teal geometric patterns',
  'low-poly medieval treasure chest with gold trim and iron hinges',
];

function log(...args) {
  console.log(`[meshy-e2e ${new Date().toISOString()}]`, ...args);
}

async function api(cookie, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function waitJob(cookie, jobId, prompt) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { ok, data } = await api(cookie, `/api/cad/meshy/status/${encodeURIComponent(jobId)}`);
    if (!ok) throw new Error(`status ${jobId}: ${JSON.stringify(data)}`);
    const st = String(data.status || '');
    const url = data.public_url || data.result_url || '';
    log(`${jobId.slice(0, 12)}… ${st} ${data.progress_pct ?? '-'}%`, prompt.slice(0, 40), url ? `→ ${url}` : '');
    if (st === 'done' && url) return { jobId, prompt, ...data };
    if (st === 'running' && url && Number(data.progress_pct) >= 92) {
      return { jobId, prompt, ...data };
    }
    if (st === 'failed' || st === 'stub') {
      throw new Error(`Job ${jobId} ${st}: ${data.error || JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Timeout waiting for ${jobId}`);
}

async function main() {
  log('Base URL:', BASE);
  const { cookie, json: mint } = await mintAgentSessionCookie({ ttlSeconds: 7200 });
  log('Minted session for', mint.user_id || mint.email || 'operator');

  const bal = await api(cookie, '/api/cad/meshy/balance');
  log('Meshy balance:', bal.data.balance, bal.data.key_source || '');

  const created = [];
  for (const prompt of PROMPTS) {
    log('Creating job:', prompt);
    const { ok, status, data } = await api(cookie, '/api/cad/meshy/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        mode: 'text',
        auto_refine: false,
        ai_model: 'meshy-5',
      }),
    });
    if (!ok) {
      throw new Error(`create failed HTTP ${status}: ${JSON.stringify(data)}`);
    }
    log('  →', data.job_id, data.phase, data.status, data.key_source);
    created.push({ jobId: data.job_id, prompt });
    await new Promise((r) => setTimeout(r, 2500));
  }

  log('Polling', created.length, 'jobs (parallel)…');
  const results = await Promise.all(
    created.map(({ jobId, prompt }) => waitJob(cookie, jobId, prompt)),
  );

  console.log('\n========== MESHY E2E RESULTS ==========');
  for (const r of results) {
    console.log(`\nPrompt: ${r.prompt}`);
    console.log(`Job:    ${r.job_id || r.jobId}`);
    console.log(`GLB:    ${r.public_url || r.result_url}`);
    if (r.model_formats) console.log(`Formats:`, JSON.stringify(r.model_formats));
  }
  console.log('\nDone — 3 creations ready.');
}

main().catch((e) => {
  console.error('[meshy-e2e] FAILED:', e?.message || e);
  process.exit(1);
});
