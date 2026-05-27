#!/usr/bin/env node
/**
 * Full Cursor-path MCP OAuth: MCP /auth/authorize → IAM consent → callback → MCP tools/list
 *
 *   export IAM_SESSION_COOKIE="session=<auth_sessions.id>"
 *   node scripts/cursor-mcp-oauth-connect-e2e.mjs
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const MCP_ORIGIN = (process.env.MCP_ORIGIN || 'https://mcp.inneranimalmedia.com').replace(/\/$/, '');
const IAM_ORIGIN = (process.env.IAM_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');

function mergeCookieHeader(baseCookie, response) {
  const jar = new Map();
  for (const part of String(baseCookie || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  const setCookies =
    typeof response?.headers?.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];
  for (const sc of setCookies) {
    const nameValue = String(sc).split(';')[0].trim();
    const eq = nameValue.indexOf('=');
    if (eq > 0) jar.set(nameValue.slice(0, eq), nameValue.slice(eq + 1));
  }
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function sessionCookie() {
  let v = process.env.IAM_SESSION_COOKIE || '';
  if (!v && existsSync(`${process.env.HOME}/.iam-session-cookie`)) {
    v = readFileSync(`${process.env.HOME}/.iam-session-cookie`, 'utf8').trim();
  }
  if (!v) return null;
  return v.includes('=') ? v : `session=${v}`;
}

function parseMcpSseJson(text, wantId = null) {
  const payloads = [];
  let acc = '';
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trimEnd();
    if (line.startsWith('data:')) {
      if (acc) payloads.push(acc);
      acc = '';
      const piece = line.replace(/^data:\s*/, '').trim();
      if (piece) payloads.push(piece);
      continue;
    }
    if (line === '') {
      if (acc) payloads.push(acc);
      acc = '';
      continue;
    }
    if (!line.startsWith('event:') && !line.startsWith(':')) {
      acc += line;
    }
  }
  if (acc.trim()) payloads.push(acc.trim());

  for (const chunk of payloads.reverse()) {
    try {
      const j = JSON.parse(chunk);
      if (wantId == null || j.id === wantId) return j;
    } catch {
      /* incomplete chunk — try earlier payload */
    }
  }
  try {
    const j = JSON.parse(String(text || '').trim());
    if (wantId == null || j.id === wantId) return j;
  } catch {
    /* fall through */
  }
  return {};
}

function consentWorkspaceId(consentJson) {
  return consentJson.workspace_id || consentJson.workspaces?.[0]?.id || null;
}

async function followRedirectChain(startUrl, cookie, max = 12) {
  let url = startUrl;
  for (let i = 0; i < max; i++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { Cookie: cookie, Accept: 'application/json,text/html' },
    });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).href;
      continue;
    }
    const text = await res.text();
    return { url, status: res.status, body: text, headers: res.headers };
  }
  throw new Error('redirect chain exceeded');
}

async function main() {
  const cookie = await sessionCookie();
  if (!cookie) {
    console.error('Set IAM_SESSION_COOKIE or ~/.iam-session-cookie');
    process.exit(1);
  }

  const report = { at: new Date().toISOString(), steps: [], ok: false };

  // 1) MCP authorize → IAM → consent page
  const start = `${MCP_ORIGIN}/auth/authorize`;
  let step = await followRedirectChain(start, cookie);
  report.steps.push({ step: 'mcp_authorize_chain', final_url: step.url, status: step.status });

  if (!step.url.includes('authorization_id=oaa_')) {
    console.error('Expected oaa_ consent URL, got', step.url);
    writeReport(report);
    process.exit(1);
  }

  const consentUrl = new URL(step.url);
  const authorizationId = consentUrl.searchParams.get('authorization_id');

  // 2) Consent GET — CSRF token + Set-Cookie for approve POST
  const consentRes = await fetch(
    `${IAM_ORIGIN}/api/oauth/mcp/consent?authorization_id=${encodeURIComponent(authorizationId)}`,
    { headers: { Cookie: cookie, Accept: 'application/json' } },
  );
  const consentJson = await consentRes.json().catch(() => ({}));
  const consentCsrf = consentJson.consent_csrf || consentJson.consentCsrf;
  const workspaceId = consentWorkspaceId(consentJson);
  const cookieWithCsrf = mergeCookieHeader(cookie, consentRes);
  report.steps.push({
    step: 'consent_get',
    status: consentRes.status,
    client: consentJson.client?.display_name || consentJson.client?.name,
    has_consent_csrf: !!consentCsrf,
    error: consentJson.error,
  });

  if (!consentRes.ok || !consentCsrf) {
    console.error('Consent GET failed or missing consent_csrf', consentJson);
    writeReport(report);
    process.exit(1);
  }

  // 3) Approve → MCP callback with code (CSRF cookie + body required)
  const approveRes = await fetch(`${IAM_ORIGIN}/api/oauth/mcp/consent`, {
    method: 'POST',
    headers: {
      Cookie: cookieWithCsrf,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      authorization_id: authorizationId,
      workspace_id: workspaceId,
      action: 'approve',
      consent_csrf: consentCsrf,
    }),
  });
  const approveJson = await approveRes.json().catch(() => ({}));
  const callbackUrl = approveJson.redirect_url;
  report.steps.push({
    step: 'consent_approve',
    status: approveRes.status,
    callbackUrl: callbackUrl || null,
    error: approveJson.error,
    reason: approveJson.reason,
  });

  if (!approveRes.ok || !callbackUrl) {
    console.error('consent approve missing redirect_url', approveJson);
    writeReport(report);
    process.exit(1);
  }

  // 4) MCP callback exchanges code (PKCE verifier stored at MCP /auth/authorize)
  const cbRes = await fetch(callbackUrl, {
    headers: { Accept: 'application/json' },
  });
  const cbJson = await cbRes.json().catch(() => ({}));
  const accessToken = cbJson.access_token;
  report.steps.push({
    step: 'mcp_callback',
    status: cbRes.status,
    has_token: !!accessToken,
    email: cbJson.email,
  });

  if (!accessToken) {
    console.error('MCP callback missing access_token', cbJson);
    writeReport(report);
    process.exit(1);
  }

  // 5) MCP auth/status + tools/list (Cursor uses same Bearer)
  const statusRes = await fetch(`${MCP_ORIGIN}/auth/status`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const statusJson = await statusRes.json().catch(() => ({}));
  report.steps.push({ step: 'mcp_auth_status', status: statusRes.status, body: statusJson });

  const mcpHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  await fetch(`${MCP_ORIGIN}/mcp`, {
    method: 'POST',
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'cursor-mcp-oauth-e2e', version: '1' },
      },
    }),
  });

  const toolsRes = await fetch(`${MCP_ORIGIN}/mcp`, {
    method: 'POST',
    headers: mcpHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  const toolsText = await toolsRes.text();
  const toolsJson = parseMcpSseJson(toolsText, 2);
  const toolCount = toolsJson?.result?.tools?.length ?? 0;
  report.steps.push({
    step: 'mcp_tools_list',
    status: toolsRes.status,
    tool_count: toolCount,
    mcp_error: toolsJson?.error ?? null,
    raw_preview: toolCount ? null : String(toolsText || '').slice(0, 400),
  });

  report.access_token_prefix = accessToken.slice(0, 12) + '…';
  report.ok =
    consentRes.ok &&
    approveRes.ok &&
    cbRes.ok &&
    statusRes.ok &&
    toolsRes.ok &&
    toolCount > 0;

  writeReport(report);
  console.log(JSON.stringify(report, null, 2));

  if (accessToken && process.env.PRINT_OAUTH_TOKEN === '1') {
    console.error(`\nexport OAUTH_TOKEN=${JSON.stringify(accessToken)}`);
  } else if (accessToken && report.ok) {
    console.error(
      '\nOAuth token minted. Re-run smoke with:\n  export OAUTH_TOKEN=<paste access_token from mcp_callback step>\n  node scripts/smoke-mcp-live.mjs\n(Set PRINT_OAUTH_TOKEN=1 to print the bearer here — do not commit.)',
    );
  }

  if (process.env.WRITE_CURSOR_MCP_JSON === '1') {
    const mcpPath = path.join(process.env.HOME, '.cursor', 'mcp.json');
    if (existsSync(mcpPath)) {
      const cfg = JSON.parse(readFileSync(mcpPath, 'utf8'));
      if (cfg.mcpServers?.inneranimalmedia?.headers) {
        cfg.mcpServers.inneranimalmedia.headers.Authorization = `Bearer ${accessToken}`;
        writeFileSync(mcpPath, `${JSON.stringify(cfg, null, 2)}\n`);
        console.error('Updated', mcpPath, 'inneranimalmedia Authorization bearer');
      }
    }
  }

  process.exit(report.ok ? 0 : 1);
}

function writeReport(report) {
  const dir = path.join(REPO_ROOT, 'reports', 'cursor-mcp-oauth-e2e');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${report.at.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.error('Wrote', file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
