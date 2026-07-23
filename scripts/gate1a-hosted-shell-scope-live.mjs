#!/usr/bin/env node
/**
 * Gate 1a live — hosted shell aimed at workspace/.scratch must fail loud (ok:false)
 * and recover toward workspace tools (no inventable success).
 *
 *   node scripts/gate1a-hosted-shell-scope-live.mjs
 */
import { randomUUID } from 'node:crypto';
import { loadEnvCloudflare } from './lib/load-env-cloudflare.mjs';
import { mintAgentSessionCookie, resolveOperatorUserId } from './lib/mint-agent-session.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const TENANT_ID = (process.env.IAM_TENANT_ID || 'tenant_sam_primeaux').trim();
const TIMEOUT_MS = Number(process.env.IAM_GATE1A_TIMEOUT_MS || 180_000);

const PROMPT = [
  'Gate 1a hosted-shell SCOPE proof — do exactly this:',
  '1) Call the OpenAI hosted shell tool with commands that target the IAM workspace, e.g. ["ls .scratch/"]',
  '   (Do NOT rewrite to /mnt/data for this test — we need the platform to fail loud on workspace targeting.)',
  '2) After the hosted shell result, if needed use fs_write_file or agentsam_terminal_local instead.',
  '3) Reply GATE1A_DONE',
  'Do not invent shell stderr. Do not claim .scratch listing succeeded via hosted shell.',
].join('\n');

function parseSse(raw) {
  const toolNames = [];
  let text = '';
  let sawScopeFail = false;
  let sawRecover = false;
  let sawHostedShell = false;
  for (const line of String(raw || '').split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let ev;
    try {
      ev = JSON.parse(payload);
    } catch {
      continue;
    }
    const t = String(ev.type || ev.event || '');
    if (t === 'text' && typeof ev.text === 'string') text += ev.text;
    if (t === 'tool_call' || t === 'tool_start') {
      const n = String(ev.tool || ev.tool_name || '').trim();
      if (n) toolNames.push(n);
      if (n === 'openai_hosted_shell') {
        sawHostedShell = true;
        if (ev.workspace_targeted === true) sawScopeFail = true;
      }
    }
    if (t === 'tool_result' || t === 'tool_output' || t === 'tool_done') {
      const blob = String(ev.result || ev.output || '');
      if (blob.includes('hosted_shell_workspace_scope_violation') || ev.workspace_targeted === true) {
        sawScopeFail = true;
      }
      if (String(ev.tool || ev.tool_name || '') === 'openai_hosted_shell' && ev.ok === false) {
        if (blob.includes('workspace_scope') || blob.includes('.scratch')) sawScopeFail = true;
      }
    }
    if (t === 'status' && /workspace scope/i.test(String(ev.message || ''))) sawRecover = true;
  }
  return { toolNames, text, sawScopeFail, sawRecover, sawHostedShell };
}

async function postChat(cookie, conversationId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let raw = '';
  let httpStatus = 0;
  try {
    const res = await fetch(`${BASE_URL}/api/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Cookie: cookie,
        'x-iam-workspace-id': WORKSPACE_ID,
        Origin: BASE_URL,
        Referer: `${BASE_URL}/dashboard/agent`,
        'User-Agent': 'inneranimalmedia-gate1a-scope-live/1.0',
      },
      body: JSON.stringify({
        message: PROMPT,
        messages: [{ role: 'user', content: PROMPT }],
        mode: 'agent',
        requestedMode: 'agent',
        workspace_id: WORKSPACE_ID,
        tenant_id: TENANT_ID,
        conversationId,
        conversation_id: conversationId,
        session_id: conversationId,
        stream: true,
      }),
      signal: controller.signal,
    });
    httpStatus = res.status;
    if (!res.body?.getReader) raw = await res.text();
    else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        if (/\ndata:\s*\{[^}]*"type"\s*:\s*"done"/m.test(raw) || /\ndata:\s*\[DONE\]/m.test(raw)) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          break;
        }
      }
      raw += decoder.decode();
    }
    return { httpStatus, raw, ...parseSse(raw) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const userId = resolveOperatorUserId();
  const conversationId = randomUUID();
  console.log(JSON.stringify({ phase: 'mint', userId, conversationId }, null, 2));
  const { cookie } = await mintAgentSessionCookie({ userId, workspaceId: WORKSPACE_ID });
  const chat = await postChat(cookie, conversationId);
  const fabricated = /cannot access|No such file or directory/i.test(chat.text || '');
  const report = {
    gate: '1a',
    kind: 'live',
    conversation_id: conversationId,
    httpStatus: chat.httpStatus,
    toolNames: chat.toolNames,
    saw_hosted_shell: chat.sawHostedShell,
    saw_scope_fail: chat.sawScopeFail,
    saw_recover: chat.sawRecover,
    fabricated_terminal_text: fabricated,
    text_preview: String(chat.text || '').slice(0, 400),
    ok: Boolean(chat.httpStatus === 200 && chat.sawHostedShell && chat.sawScopeFail && !fabricated),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
