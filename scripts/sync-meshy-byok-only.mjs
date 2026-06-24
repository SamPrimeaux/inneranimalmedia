#!/usr/bin/env node
/**
 * Upsert Meshy BYOK row only (user_api_keys provider=meshy) from MESHYAI_API_KEY in .env.cloudflare.
 */
import { mintAgentSessionCookie } from './lib/mint-agent-session.mjs';

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const meshyKey = String(process.env.MESHYAI_API_KEY || process.env.MESHY_API_KEY || '').trim();

function apiHeaders(cookie) {
  return {
    'Content-Type': 'application/json',
    Cookie: cookie,
    'X-IAM-Workspace-Id': WORKSPACE_ID,
  };
}

async function listMeshyKeys(cookie) {
  const r = await fetch(`${BASE_URL}/api/settings/keys?category=provider`, {
    headers: apiHeaders(cookie),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `list keys ${r.status}`);
  const items = Array.isArray(j.items) ? j.items : [];
  return items.filter(
    (i) =>
      String(i.provider || '').toLowerCase() === 'meshy' &&
      String(i.status || '').toLowerCase() === 'active',
  );
}

async function upsertMeshy(cookie, existing) {
  const payload = {
    category: 'provider',
    provider: 'meshy',
    label: 'Meshy (synced from .env.cloudflare)',
    api_key: meshyKey,
    scope: 'workspace',
    validate: false,
  };
  const match = existing[0];
  const path = match?.id
    ? `${BASE_URL}/api/settings/keys/${encodeURIComponent(match.id)}/rotate`
    : `${BASE_URL}/api/settings/keys`;
  const r = await fetch(path, {
    method: 'POST',
    headers: apiHeaders(cookie),
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `BYOK upsert ${r.status}`);
  console.log(match?.id ? `[ok] BYOK rotated meshy (${match.id})` : '[ok] BYOK created meshy');
}

async function main() {
  if (!meshyKey) throw new Error('MESHYAI_API_KEY empty — run npm run sync:meshy first');
  const { cookie, sessionId } = await mintAgentSessionCookie();
  console.log(`→ Meshy BYOK upsert workspace=${WORKSPACE_ID} session=${String(sessionId).slice(0, 12)}...`);
  const existing = await listMeshyKeys(cookie);
  await upsertMeshy(cookie, existing);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
