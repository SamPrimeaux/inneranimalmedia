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

const MCP_ORIGIN = 'https://mcp.inneranimalmedia.com';
const IAM_ORIGIN = 'https://inneranimalmedia.com';

async function sessionCookie() {
  let v = process.env.IAM_SESSION_COOKIE || '';
  if (!v && existsSync(`${process.env.HOME}/.iam-session-cookie`)) {
    v = readFileSync(`${process.env.HOME}/.iam-session-cookie`, 'utf8').trim();
  }
  if (!v) return null;
  return v.includes('=') ? v : `session=${v}`;
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

  // 2) Consent API
  const consentRes = await fetch(
    `${IAM_ORIGIN}/api/oauth/mcp/consent?authorization_id=${encodeURIComponent(authorizationId)}`,
    { headers: { Cookie: cookie, Accept: 'application/json' } },
  );
  const consentJson = await consentRes.json();
  const workspaceId = consentJson.workspaces?.[0]?.id;
  report.steps.push({
    step: 'consent_get',
    status: consentRes.status,
    client: consentJson.client?.display_name || consentJson.client?.name,
    workspaces: consentJson.workspaces?.length,
  });

  // 3) Approve → MCP callback with code
  const approveRes = await fetch(`${IAM_ORIGIN}/api/oauth/mcp/consent`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      authorization_id: authorizationId,
      workspace_id: workspaceId,
      action: 'approve',
    }),
  });
  const approveJson = await approveRes.json();
  const callbackUrl = approveJson.redirect_url;
  report.steps.push({ step: 'consent_approve', status: approveRes.status, callbackUrl });

  // 4) MCP callback exchanges code (no IAM session needed)
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

  const toolsRes = await fetch(`${MCP_ORIGIN}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const toolsText = await toolsRes.text();
  const toolsLine = toolsText.split('\n').find((l) => l.startsWith('data:')) || toolsText;
  let toolsJson = {};
  try {
    toolsJson = JSON.parse(toolsLine.replace(/^data:\s*/, ''));
  } catch {
    toolsJson = JSON.parse(toolsText);
  }
  const toolCount = toolsJson?.result?.tools?.length ?? 0;
  report.steps.push({
    step: 'mcp_tools_list',
    status: toolsRes.status,
    tool_count: toolCount,
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
