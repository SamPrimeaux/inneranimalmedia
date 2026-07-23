#!/usr/bin/env node
/**
 * Live repro / proof for tkt_search_tools_rank_media_last.
 *
 * Classic handoff failure: “styled HTML / visual” → agentsam_search_tools hydrates
 * imgx_* / veo_* and may call image gen. Must NOT hydrate or invoke media tools
 * unless the user explicitly asked for an image/video.
 *
 *   node scripts/gate-search-tools-rank-media-last.mjs
 *   EXPECT_FAIL=1 node scripts/gate-search-tools-rank-media-last.mjs   # repro mode (exit 1 when bug present)
 */
import { randomUUID } from 'node:crypto';
import { loadEnvCloudflare } from './lib/load-env-cloudflare.mjs';
import { mintAgentSessionCookie, resolveOperatorUserId } from './lib/mint-agent-session.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const TENANT_ID = (process.env.IAM_TENANT_ID || 'tenant_sam_primeaux').trim();
const TIMEOUT_MS = Number(process.env.IAM_MEDIA_RANK_TIMEOUT_MS || 180_000);
const EXPECT_FAIL = String(process.env.EXPECT_FAIL || '') === '1';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

/** Same class of prompt as AGENTSAM-FILE-CREATE-HTML-FAILURES conversation B. */
const PROMPT = [
  'Create a single fully styled HTML landing page under .scratch/ so I can get a visual of the proposal.',
  `Path: .scratch/media-rank-repro-${STAMP}.html`,
  'Use fs_write_file (or equivalent file write). Do NOT generate an image or video unless I explicitly ask for a PNG/photo/generate image.',
  'Reply MEDIA_RANK_DONE when the HTML file is written.',
].join('\n');

const MEDIA_RE = /^(imgx_|veo_|moviemode_)/i;

function parseSse(raw) {
  const toolNames = [];
  /** @type {string[]} */
  const hydrated = [];
  let text = '';
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
    }
    if (t === 'tools_hydrated' && Array.isArray(ev.added)) {
      for (const a of ev.added) hydrated.push(String(a));
    }
  }
  return { toolNames, hydrated, text };
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
        'User-Agent': 'inneranimalmedia-gate-search-tools-rank-media-last/1.0',
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
  console.log(JSON.stringify({ phase: 'mint', userId, conversationId, expect_fail: EXPECT_FAIL }, null, 2));
  const { cookie } = await mintAgentSessionCookie({ userId, workspaceId: WORKSPACE_ID });
  const chat = await postChat(cookie, conversationId);

  const mediaHydrated = chat.hydrated.filter((k) => MEDIA_RE.test(k));
  const mediaCalled = chat.toolNames.filter((k) => MEDIA_RE.test(k));
  const wroteHtml = chat.toolNames.some((k) => /fs_write_file|fs_edit_file|apply_patch/i.test(k));
  const bugPresent = mediaHydrated.length > 0 || mediaCalled.length > 0;

  const report = {
    ticket: 'tkt_search_tools_rank_media_last',
    conversation_id: conversationId,
    httpStatus: chat.httpStatus,
    toolNames: chat.toolNames,
    hydrated: chat.hydrated,
    media_hydrated: mediaHydrated,
    media_called: mediaCalled,
    wrote_html_tool: wroteHtml,
    text_preview: String(chat.text || '').slice(0, 240),
    bug_present: bugPresent,
    ok: EXPECT_FAIL ? bugPresent : !bugPresent && chat.httpStatus === 200,
    note: EXPECT_FAIL
      ? bugPresent
        ? 'REPRO confirmed: media tools entered the HTML/visual session'
        : 'REPRO missed — media not hydrated this run (retry or check ranking)'
      : bugPresent
        ? 'FAIL: media tools still ranked into non-image HTML request'
        : 'PASS: no imgx_/veo_ hydrate or call on HTML/visual prompt',
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
