/**
 * Mint automation session cookie via POST /api/auth/agent-session/mint
 */
import { loadEnvCloudflare } from './load-env-cloudflare.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();

export function resolveOperatorUserId() {
  for (const raw of [
    process.env.USER_ID,
    process.env.AGENT_SESSION_USER_ID,
    process.env.AGENT_SESSION_DEFAULT_USER_ID,
    'au_871d920d1233cbd1',
  ]) {
    const s = String(raw || '').trim();
    if (s.startsWith('au_')) return s;
  }
  return 'au_871d920d1233cbd1';
}

/**
 * @param {{ userId?: string; workspaceId?: string; ttlSeconds?: number; baseUrl?: string }} [opts]
 */
export async function mintAgentSessionCookie(opts = {}) {
  const secret = process.env.AGENT_SESSION_MINT_SECRET?.trim();
  if (!secret) {
    throw new Error('AGENT_SESSION_MINT_SECRET missing in .env.cloudflare');
  }
  const userId = (opts.userId || resolveOperatorUserId()).trim();
  const workspaceId = (opts.workspaceId || WORKSPACE_ID).trim();
  const baseUrl = (opts.baseUrl || BASE_URL).replace(/\/$/, '');
  const ttlSeconds = Number(opts.ttlSeconds || process.env.AGENT_SESSION_TTL_SECONDS || 900);

  const r = await fetch(`${baseUrl}/api/auth/agent-session/mint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
      'X-Agent-Session-Mint-Secret': secret,
    },
    body: JSON.stringify({
      ttl_seconds: ttlSeconds,
      user_id: userId,
      workspace_id: workspaceId,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) {
    const err = j.error || j.message || `mint HTTP ${r.status}`;
    const code = j.code || '';
    if (r.status === 401 && code === 'SESSION_MISSING') {
      throw new Error(
        `${err} — Worker front door blocked mint before handler (deploy fix: isAutomationApiPath for /api/auth/agent-session/mint)`,
      );
    }
    if (r.status === 401 && code === 'MINT_SECRET_INVALID') {
      throw new Error(
        `${err} — AGENT_SESSION_MINT_SECRET mismatch (Worker secret vs .env.cloudflare). Run: npm run sync:agent-session-mint -- --generate`,
      );
    }
    if (r.status === 401 && code === 'NOT_WORKSPACE_OWNER') {
      throw new Error(
        `${err} — user ${j.user_id || userId} is not owner of workspace ${j.workspace_id || workspaceId}. Fix workspace_members.role='owner' in D1.`,
      );
    }
    if (r.status === 401) {
      throw new Error(
        `${err} — AGENT_SESSION_MINT_SECRET mismatch or not workspace owner (deploy auth.js for distinct codes). Run: npm run sync:agent-session-mint -- --generate`,
      );
    }
    throw new Error(err);
  }
  const cookie = j.cookie_header || (j.session_id ? `session=${j.session_id}` : '');
  if (!cookie) throw new Error('mint missing session cookie');
  return { cookie, sessionId: j.session_id, json: j };
}
