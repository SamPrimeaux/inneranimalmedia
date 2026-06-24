#!/usr/bin/env node
/**
 * Mint smoke with retries (Worker secrets can take ~30s to propagate after wrangler secret put).
 */
import { mintAgentSessionCookie } from './lib/mint-agent-session.mjs';

const maxAttempts = Number(process.env.MINT_VERIFY_ATTEMPTS || 6);
const delayMs = Number(process.env.MINT_VERIFY_DELAY_MS || 5000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastErr;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    const r = await mintAgentSessionCookie();
    console.log(`mint ok session_id=${String(r.sessionId || '').slice(0, 16)}... (attempt ${attempt})`);
    process.exit(0);
  } catch (e) {
    lastErr = e;
    const msg = String(e?.message || e);
    const retryable =
      msg.includes('MINT_SECRET_INVALID') ||
      msg.includes('mismatch') ||
      msg.includes('Unauthorized');
    if (!retryable || attempt >= maxAttempts) break;
    console.log(`mint attempt ${attempt}/${maxAttempts} failed — retry in ${delayMs / 1000}s (${msg.slice(0, 80)}…)`);
    await sleep(delayMs);
  }
}

console.error(String(lastErr?.message || lastErr || 'mint verify failed'));
process.exit(1);
