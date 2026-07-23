#!/usr/bin/env node
/**
 * Gate 1b live — recreate the empty hosted-shell failure mode and assert
 * durable non-success without fabricated "ls: cannot access" text.
 *
 * Prompt mirrors the file-create handoff (HTML ask that historically produced
 * empty commands:[] + inventable shell text).
 *
 *   node scripts/gate1b-empty-shell-live.mjs
 */
import { randomUUID } from 'node:crypto';
import { loadEnvCloudflare } from './lib/load-env-cloudflare.mjs';
import { mintAgentSessionCookie, resolveOperatorUserId } from './lib/mint-agent-session.mjs';
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const TENANT_ID = (process.env.IAM_TENANT_ID || 'tenant_sam_primeaux').trim();
const TIMEOUT_MS = Number(process.env.IAM_GATE1B_TIMEOUT_MS || 180_000);

const PROMPT = [
  'Use OpenAI hosted shell first. If you call it, empty commands are fine for this test — do not invent \'ls: cannot access\'. Then reply DONE.',
].join('\n');

function parseSse(raw) {
  const toolNames = [];
  const events = [];
  let text = '';
  let sawRecover = false;
  let sawEmptyShellFail = false;
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
    events.push(ev);
    const t = String(ev.type || ev.event || '');
    if (t === 'text' && typeof ev.text === 'string') text += ev.text;
    if (t === 'tool_call' || t === 'tool_start') {
      const n = String(ev.tool || ev.tool_name || '').trim();
      if (n) toolNames.push(n);
      if (n === 'openai_hosted_shell' && (ev.empty === true || ev.args?.commands?.length === 0)) {
        sawEmptyShellFail = true;
      }
    }
    if (t === 'tool_result' || t === 'tool_output' || t === 'tool_done') {
      const blob = String(ev.result || ev.output || '');
      if (blob.includes('empty_hosted_shell_commands') || ev.ok === false) {
        if (String(ev.tool || ev.tool_name || '') === 'openai_hosted_shell' || blob.includes('empty_hosted')) {
          sawEmptyShellFail = true;
        }
      }
    }
    if (t === 'status' && /empty hosted shell|recover_halt|hosted shell cap/i.test(String(ev.message || ''))) {
      sawRecover = true;
    }
  }
  return { toolNames, events, text, sawRecover, sawEmptyShellFail };
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
        'User-Agent': 'inneranimalmedia-gate1b-empty-shell-live/1.0',
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
    if (!res.body?.getReader) {
      raw = await res.text();
    } else {
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
  const hasVisibleText = String(chat.text || '').trim().length > 0;
  // Live models may refuse to emit empty commands — still require no fabrication.
  // When empty shell DID fire, require visible text or recover_halt (no silent death).
  const emptyOk =
    !chat.sawEmptyShellFail ||
    chat.sawRecover ||
    hasVisibleText ||
    /hosted shell returned nothing useful/i.test(chat.text || '');
  const report = {
    gate: '1b',
    kind: 'live',
    conversation_id: conversationId,
    httpStatus: chat.httpStatus,
    toolNames: chat.toolNames,
    saw_empty_shell_fail: chat.sawEmptyShellFail,
    saw_recover: chat.sawRecover,
    fabricated_terminal_text: fabricated,
    has_visible_text: hasVisibleText,
    text_preview: String(chat.text || '').slice(0, 400),
    ok: Boolean(chat.httpStatus === 200 && !fabricated && emptyOk && (hasVisibleText || !chat.sawEmptyShellFail)),
    note:
      chat.sawEmptyShellFail
        ? hasVisibleText
          ? 'Empty shell non-success with visible reply (cap or model text)'
          : 'Empty shell seen but no visible text — FAIL (close_done_no_token class)'
        : 'Model did not emit empty commands:[]; pass = no fabricated terminal text this turn',
  };

  // Soft D1 check for recover logs is optional — SSE is source of truth here.
  console.log(JSON.stringify(report, null, 2));

  // Prefer hard fail only when fabrication appears; empty-shell observation is bonus.
  if (!report.ok) process.exit(1);
  if (!chat.sawEmptyShellFail) process.exitCode = 2; // soft: live did not hit empty path
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
