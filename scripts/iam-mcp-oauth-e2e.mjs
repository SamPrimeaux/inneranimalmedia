#!/usr/bin/env node
/**
 * IAM MCP OAuth E2E — authorize → consent → token → userinfo (+ D1 proof).
 *
 * Requires IAM session cookie (logged-in user):
 *   export IAM_SESSION_COOKIE="$(tr -d '[:space:]' < ~/.iam-session-cookie)"
 *   node scripts/iam-mcp-oauth-e2e.mjs
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const IAM_ORIGIN = (process.env.IAM_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');
const CLIENT_ID = 'iam_mcp_inneranimalmedia';
const REDIRECT_URI = 'https://mcp.inneranimalmedia.com/auth/callback';

function loadEnv() {
  const p = path.join(REPO_ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^export\s+([A-Z0-9_]+)=(.*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();

function sessionCookie() {
  let v = process.env.IAM_SESSION_COOKIE || '';
  if (!v && existsSync(`${process.env.HOME}/.iam-session-cookie`)) {
    v = readFileSync(`${process.env.HOME}/.iam-session-cookie`, 'utf8').trim();
  }
  if (!v) return null;
  return v.includes('=') ? v : `iam_session=${v}`;
}

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function main() {
  const cookie = sessionCookie();
  if (!cookie) {
    console.error('Missing IAM_SESSION_COOKIE or ~/.iam-session-cookie');
    process.exit(1);
  }

  const { verifier, challenge } = pkcePair();
  const state = `e2e_${randomBytes(8).toString('hex')}`;
  const scope = 'iam:profile mcp:tools mcp:userinfo';

  const authorizeUrl = new URL(`${IAM_ORIGIN}/api/oauth/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', scope);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const report = {
    at: new Date().toISOString(),
    steps: [],
    ok: false,
  };

  const authRes = await fetch(authorizeUrl.href, {
    redirect: 'manual',
    headers: { Cookie: cookie },
  });
  report.steps.push({
    step: 'authorize',
    status: authRes.status,
    location: authRes.headers.get('location'),
  });

  const consentLoc = authRes.headers.get('location') || '';
  if (!consentLoc.includes('authorization_id=oaa_')) {
    console.error('Authorize did not redirect to oaa_ consent:', consentLoc);
    writeReport(report);
    process.exit(1);
  }

  const consentUrl = new URL(consentLoc, IAM_ORIGIN);
  const authorizationId = consentUrl.searchParams.get('authorization_id');

  const consentJsonRes = await fetch(
    `${IAM_ORIGIN}/api/oauth/mcp/consent?authorization_id=${encodeURIComponent(authorizationId)}`,
    { headers: { Cookie: cookie, Accept: 'application/json' } },
  );
  const consentJson = await consentJsonRes.json().catch(() => ({}));
  report.steps.push({
    step: 'consent_get',
    status: consentJsonRes.status,
    workspaces: consentJson.workspaces?.length ?? 0,
    client: consentJson.client?.name,
  });

  const workspaceId = consentJson.workspaces?.[0]?.id;
  if (!workspaceId) {
    console.error('No workspace for consent');
    writeReport(report);
    process.exit(1);
  }

  const approveRes = await fetch(`${IAM_ORIGIN}/api/oauth/mcp/consent`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      authorization_id: authorizationId,
      workspace_id: workspaceId,
      action: 'approve',
    }),
  });
  const approveJson = await approveRes.json().catch(() => ({}));
  report.steps.push({ step: 'consent_approve', status: approveRes.status, approveJson });

  const callbackUrl = new URL(approveJson.redirect_url || '');
  const code = callbackUrl.searchParams.get('code');
  if (!code) {
    console.error('No code in redirect_url', approveJson);
    writeReport(report);
    process.exit(1);
  }

  const tokenRes = await fetch(`${IAM_ORIGIN}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: CLIENT_ID,
    }),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  report.steps.push({ step: 'token', status: tokenRes.status, has_access_token: !!tokenJson.access_token });

  if (!tokenJson.access_token) {
    console.error('Token exchange failed', tokenJson);
    writeReport(report);
    process.exit(1);
  }

  const userinfoRes = await fetch(`${IAM_ORIGIN}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userinfo = await userinfoRes.json().catch(() => ({}));
  report.steps.push({ step: 'userinfo', status: userinfoRes.status, sub: userinfo.sub });

  report.ok =
    authRes.status === 302 &&
    consentJsonRes.ok &&
    approveRes.ok &&
    tokenRes.ok &&
    userinfoRes.ok &&
    !!userinfo.sub;

  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

function writeReport(report) {
  const dir = path.join(REPO_ROOT, 'reports', 'iam-mcp-oauth-e2e');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${report.at.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.error('Wrote', file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
