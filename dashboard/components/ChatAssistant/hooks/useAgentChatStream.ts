/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized SSE body consumer for POST /api/agent/chat (ReadableStreamDefaultReader).
 */

import type React from 'react';
import { LS_AGENT_CHAT_CONVERSATION_ID, IAM_AGENT_RUN_CONTEXT, IAM_DESIGNSTUDIO_CAD_JOB } from '../../../agentChatConstants';
import { notifyAgentChatSessionsRefresh } from '../../../lib/openAgentConversation';
import { replaceAgentConversationUrl } from '../../../lib/agentRoutes';
import {
  resolveToolApprovalPreview,
} from '../toolApprovalCopy';
import type {
  Message,
  ToolApprovalPayload,
  WorkflowLedgerState,
  AgentPreviewArtifact,
  AgentPreviewArtifactKind,
  ExecutionPlanState,
  ExecutionPlanTask,
  ImageGenerationState,
  AgentGeneratedFile,
} from '../types';
import type { AgentToolTraceRow } from '../execution/types';
import {
  patchTraceRowCadJob,
  preserveLiveCadTraceRows,
  resolveCadJobIdFromSse,
  cadJobOutputLooksInFlight,
} from '../../../lib/cadToolTrace';
import {
  formatToolTraceInput,
  formatToolTraceOutput,
  parseToolTraceReceiptMeta,
} from '../../../lib/formatToolTraceSummary';
import { sanitizeBrowserNavigateUrl } from '../../../lib/sanitizeBrowserUrl';
import {
  extractMonacoInvokesFromBuffer,
  hideIncompleteMonacoInvokeTail,
  looksLikeEmbeddedFileDumpStart,
  looksLikeRawProviderLeak,
  normalizeAssistantSseText,
  normalizeBrowserToolErrorMessage,
  normalizeImageGenerationEvent,
  ssePayloadLooksReasoningOnly,
  isStreamErrorPayload,
} from '../streamParsing';
import { markStreamParserError, patchIamAgentStreamDebug } from '../streamDebug';
import { fulfillClientFsRequest } from '../../../src/lib/library/clientFsFulfill';
import {
  applyTurnOutboxEvents,
  fetchTurnOutboxReplay,
  readTurnOutboxCursor,
  writeTurnOutboxCursor,
} from '../../../lib/chatTurnOutbox';

/** Prefer agentsam_agent_run.id over legacy wrun_* when both appear on SSE payloads. */
function sseSpineRunId(d: { agent_run_id?: unknown; run_id?: unknown }): string {
  if (typeof d.agent_run_id === 'string' && d.agent_run_id.trim()) return d.agent_run_id.trim();
  if (typeof d.run_id === 'string' && d.run_id.trim()) return d.run_id.trim();
  return '';
}

function extForStreamOutput(lang: string): string {
  const map: Record<string, string> = {
    tsx: 'tsx',
    jsx: 'jsx',
    ts: 'ts',
    js: 'js',
    css: 'css',
    html: 'html',
    json: 'json',
    py: 'py',
    sh: 'sh',
  };
  return map[lang] || lang || 'txt';
}

function isBrowserScreenshotToolName(name: string): boolean {
  const n = String(name || '').trim().toLowerCase();
  return n === 'cdt_take_screenshot' || n === 'playwright_screenshot' || n === 'browser_screenshot';
}

function isCdtBrowserToolName(name: string): boolean {
  return String(name || '').trim().toLowerCase().startsWith('cdt_');
}

/** Stateless Browser Run REST tools — no shared CDP session / Live View. */
function isBrowserRunQuickActionToolName(name: string): boolean {
  return String(name || '').trim().toLowerCase().startsWith('browser_run_');
}

/** Session-based browser tools that should surface Agent Live on /dashboard/agent. */
function isAgentLiveBrowserToolName(name: string): boolean {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  if (isBrowserRunQuickActionToolName(n)) return false;
  if (isBrowserScreenshotToolName(n)) return false;
  return n.startsWith('cdt_') || n.startsWith('browser_');
}

function parseBrowserToolUrlFromInput(inputPreview: string | null | undefined): string | null {
  try {
    const inp = JSON.parse(String(inputPreview || '{}')) as Record<string, unknown>;
    const u =
      (typeof inp.url === 'string' && inp.url.trim()) ||
      (typeof inp.href === 'string' && inp.href.trim()) ||
      (typeof inp.target_url === 'string' && inp.target_url.trim()) ||
      (typeof inp.page_url === 'string' && inp.page_url.trim()) ||
      '';
    if (!u) return null;
    return sanitizeBrowserNavigateUrl(u) || u;
  } catch {
    return null;
  }
}

function truncateLines(text: string, maxLines: number): { head: string; truncated: boolean; total: number } {
  const lines = String(text || '').split('\n');
  if (lines.length <= maxLines) return { head: String(text || ''), truncated: false, total: lines.length };
  return { head: lines.slice(0, maxLines).join('\n'), truncated: true, total: lines.length };
}

function truncateCodeFencesForChat(text: string, maxLines = 200): string {
  const src = String(text || '');
  const re = /```(\w+)?\n([\s\S]*?)\n```/g;
  return src.replace(re, (_full, lang, body) => {
    const b = String(body || '');
    const { head, truncated, total } = truncateLines(b, maxLines);
    if (!truncated) return `\`\`\`${lang || ''}\n${b}\n\`\`\``;
    return `\`\`\`${lang || ''}\n${head}\n\`\`\`\n_(truncated: showing first ${maxLines} of ${total} lines — open Monaco for full content)_`;
  });
}

function parseBrowserToolAutomationFlag(inp: Record<string, unknown>): boolean {
  return inp.automation === true || inp.use_automation === true || inp.automate === true;
}

function resolveAgentFileKind(filename: string): AgentGeneratedFile['kind'] {
  const ext = String(filename || '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md') return 'md';
  if (ext === 'sql') return 'sql';
  if (ext === 'ts' || ext === 'tsx') return 'ts';
  if (ext === 'js' || ext === 'jsx') return 'js';
  if (ext === 'json') return 'json';
  if (ext === 'txt') return 'txt';
  return 'other';
}

function mapTaskCompleteStatus(status: string | undefined): ExecutionPlanTask['status'] {
  if (status === 'done') return 'done';
  if (status === 'skipped') return 'skipped';
  if (status === 'blocked') return 'blocked';
  if (status === 'in_progress') return 'running';
  return 'failed';
}

function planStatusFromSummary(status: string | undefined, failed: number): ExecutionPlanState['status'] {
  const s = String(status || '').toLowerCase();
  if (s === 'complete' || s === 'completed' || s === 'ok') return failed > 0 ? 'partial' : 'complete';
  if (s === 'partial') return 'partial';
  if (s === 'failed') return 'failed';
  return failed > 0 ? 'partial' : 'complete';
}

function mergeImageGenerationState(
  prev: ImageGenerationState | null | undefined,
  patch: Partial<ImageGenerationState>,
  eventType: string,
): ImageGenerationState {
  const generationId = patch.generationId || prev?.generationId || '';
  const base: ImageGenerationState = prev ?? {
    generationId,
    phase: 'initializing',
    progress: 0,
    message: 'Creating image…',
    previewFrames: [],
    activeFrameIndex: 0,
    failed: false,
  };

  let previewFrames = base.previewFrames;
  if (eventType === 'image_generation_preview' && patch.previewFrames?.length) {
    const next = [...base.previewFrames];
    for (const frame of patch.previewFrames) {
      const idx = next.findIndex((f) => f.frameIndex === frame.frameIndex);
      if (idx >= 0) next[idx] = frame;
      else next.push(frame);
    }
    next.sort((a, b) => a.frameIndex - b.frameIndex);
    previewFrames = next;
  }

  const activeFrameIndex =
    patch.activeFrameIndex != null ? patch.activeFrameIndex : base.activeFrameIndex;

  return {
    ...base,
    ...patch,
    generationId,
    previewFrames,
    activeFrameIndex,
    imageUrl: patch.imageUrl ?? base.imageUrl,
    message: patch.message !== undefined ? patch.message : base.message,
  };
}

function patchAssistantImageGeneration(
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  assistantContent: string,
  patch: Partial<ImageGenerationState>,
  eventType: string,
) {
  setMessages((prev) => {
    const next = [...prev];
    const idx = next.length - 1;
    if (idx < 0 || next[idx].role !== 'assistant') return prev;
    const merged = mergeImageGenerationState(next[idx].imageGenerationState, patch, eventType);
    // Prefer prompt from prior user turn when SSE didn't include one.
    if (!merged.prompt) {
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (next[i].role === 'user' && next[i].content?.trim()) {
          merged.prompt = next[i].content.trim();
          break;
        }
      }
    }
    let content = assistantContent;
    if (eventType === 'image_generation_complete') {
      const url = merged.previewUrl || merged.imageUrl || '';
      if (url) {
        const alt = (merged.prompt || 'Generated image').replace(/\s+/g, ' ').trim().slice(0, 120);
        content = `![${alt}](${url})`;
      }
    }
    next[idx] = { ...next[idx], content, imageGenerationState: merged };
    return next;
  });
}

function parseScreenshotUrlFromToolPayload(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const candidates = [
      parsed.screenshot_url,
      parsed.result_url,
      parsed.screenshotUrl,
      parsed.image_url,
      parsed.public_url,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) {
        const v = c.trim();
        if (/^https?:/i.test(v) || v.startsWith('data:')) return v;
      }
    }
    if (typeof parsed.data_url === 'string' && parsed.data_url.trim()) {
      return parsed.data_url.trim();
    }
    const nested = parsed.result;
    if (nested && typeof nested === 'object') {
      const r = nested as Record<string, unknown>;
      for (const c of [r.screenshot_url, r.result_url, r.url]) {
        if (typeof c === 'string' && c.trim() && /^https?:/i.test(c.trim())) return c.trim();
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function parseBrowserNavigatePreview(raw: string | null | undefined): {
  screenshot_url?: string;
  page_text?: string;
  title?: string;
} {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const shot =
      parseScreenshotUrlFromToolPayload(raw) ||
      (typeof parsed.screenshot_url === 'string' ? parsed.screenshot_url : null);
    const page_text =
      (typeof parsed.page_text === 'string' && parsed.page_text) ||
      (typeof parsed.text === 'string' && parsed.text) ||
      undefined;
    const title = typeof parsed.title === 'string' ? parsed.title : undefined;
    return {
      ...(shot ? { screenshot_url: shot } : {}),
      ...(page_text ? { page_text } : {}),
      ...(title ? { title } : {}),
    };
  } catch {
    return {};
  }
}

function parseBrowserLiveSessionFromToolPayload(raw: string | null | undefined): {
  live_view_url?: string;
  session_id?: string;
  url?: string;
} | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const body =
      parsed.body && typeof parsed.body === 'object'
        ? (parsed.body as Record<string, unknown>)
        : parsed;
    const live =
      body.live_session && typeof body.live_session === 'object'
        ? (body.live_session as Record<string, unknown>)
        : body;
    const liveViewUrl =
      (typeof live.devtools_frontend_url === 'string' && live.devtools_frontend_url) ||
      (typeof body.devtools_frontend_url === 'string' && body.devtools_frontend_url) ||
      undefined;
    const sessionId =
      (typeof live.session_id === 'string' && live.session_id) ||
      (typeof body.session_id === 'string' && body.session_id) ||
      undefined;
    const url = typeof live.url === 'string' ? live.url : typeof body.url === 'string' ? body.url : undefined;
    if (!liveViewUrl && !sessionId) return null;
    return { live_view_url: liveViewUrl, session_id: sessionId, url };
  } catch {
    return null;
  }
}

function resolveToolTraceRowId(
  prev: AgentToolTraceRow[],
  toolCallId: string | null | undefined,
  activeId: string | null,
  toolName: string,
): string | null {
  const cid = toolCallId?.trim();
  if (cid) {
    const hit = prev.find((r) => r.id === cid || r.toolCallId === cid);
    if (hit) return hit.id;
  }
  if (activeId && prev.some((r) => r.id === activeId)) return activeId;
  const oldest = prev.find((r) => r.status === 'running' && r.toolName === toolName);
  return oldest?.id ?? activeId;
}

export type ConsumeAgentChatSseContext = {
  signal: AbortSignal;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  streamFinalizedRef: React.MutableRefObject<boolean>;
  streamReaderRef: React.MutableRefObject<ReadableStreamDefaultReader<Uint8Array> | null>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkflowLedger: React.Dispatch<React.SetStateAction<WorkflowLedgerState>>;
  /** Optional: Agent Sam tool / terminal trace rows (replaces legacy single exec panel). */
  setToolTraceRows?: React.Dispatch<React.SetStateAction<AgentToolTraceRow[]>>;
  /** When a streamed monaco invoke opens a `.py` draft in the editor. */
  onPythonDraftOpened?: (fileName: string) => void;
  /** Budget handoff — child session + cheaper model tier. */
  onAgentHandoff?: (payload: {
    next_session_id: string;
    fallback_model_key?: string;
    reason?: string;
  }) => void;
  setConversationId: React.Dispatch<React.SetStateAction<string>>;
  stripEmptyAssistantTail: (prev: Message[]) => Message[];
  loadSessions: () => void;
  onThinkingEvent?: (event: { type: string; tool_name?: string; text?: string; ok?: boolean; output_preview?: string; command_run_id?: string; approval_id?: string; plan_id?: string }) => void;
  /** Multitask/subagent structured events (fanout start, run progress, merge/result, action required). */
  onSubagentEvent?: (event: {
    type: string;
    fanout_id?: string;
    subagent_slug?: string;
    subagent_run_id?: string;
    status?: string;
    conversation_id?: string;
    task_title?: string;
  }) => void;
  /** First SSE context payload — lifts `agentsam_agent_run.id` to host (BrowserView playwright metadata). */
  onAgentRunContext?: (agentRunId: string | null) => void;
  /** Resolved model key from SSE context / runtime_context (for run chip). */
  onStreamModel?: (modelKey: string | null) => void;
  onBrowserNavigate?: (event: {
    type: 'browser_navigate';
    url: string;
    automation?: boolean;
    agent_live?: boolean;
    screenshot_url?: string;
    page_text?: string;
    title?: string;
  }) => void;
  onR2FileUpdated?: (event: { type: 'r2_file_updated'; bucket: string; key: string }) => void;
  onFileSelect?: (file: { name: string; content: string; originalContent?: string; workspacePath?: string }) => void;
  /** Full tool-approval side effects (state + queue drain), matching prior ChatAssistant inline behavior. */
  onToolApprovalRequest: (tool: ToolApprovalPayload) => void;
  /** When true, merge streamed text into the existing last assistant bubble (e.g. plan-task resume after Allow). */
  mergeIntoLastAssistant?: boolean;
  /** Required when mergeIntoLastAssistant — starting text of the last assistant message. */
  initialAssistantBuffer?: string;
};

/** Create or patch the trailing assistant bubble (deferred until first SSE payload). */
function upsertAssistantTail(
  prev: Message[],
  patch: Partial<Message> & { content?: string },
): Message[] {
  const next = [...prev];
  const idx = next.length - 1;
  if (idx >= 0 && next[idx].role === 'assistant') {
    next[idx] = { ...next[idx], ...patch, role: 'assistant' };
    return next;
  }
  return [...next, { ...patch, role: 'assistant', content: patch.content ?? '' }];
}

/**
 * Read NDJSON/SSE chunks from the chat response body until done or error.
 * Mutates assistant bubble via setMessages; throws on fatal stream errors for outer catch.
 */
export async function consumeAgentChatSseBody(ctx: ConsumeAgentChatSseContext): Promise<void> {
  const {
    signal,
    reader,
    streamFinalizedRef,
    streamReaderRef,
    setMessages,
    setIsLoading,
    setWorkflowLedger,
    setToolTraceRows,
    onPythonDraftOpened,
    onAgentHandoff,
    setConversationId,
    stripEmptyAssistantTail,
    loadSessions,
    onBrowserNavigate,
    onR2FileUpdated,
    onFileSelect,
    onToolApprovalRequest,
    onThinkingEvent,
    onSubagentEvent,
    onAgentRunContext,
    onStreamModel,
    mergeIntoLastAssistant = false,
    initialAssistantBuffer = '',
  } = ctx;

  const decoder = new TextDecoder();
  let assistantContent = '';
  let assistantStreamBuf = mergeIntoLastAssistant ? String(initialAssistantBuffer || '') : '';
  let sseCarry = '';
  let fileEchoSuppress = false;
  /** Set when SSE assigns conversation_id; URL sync runs after stream so /agent/new stays put. */
  let pendingConversationUrlSync: string | null = null;

  const streamStartedAt = Date.now();
  let readCount = 0;
  let emptyRun = 0;
  const MAX_STREAM_MS = 900000;
  /** No SSE bytes for this long → surface error instead of infinite spinner. */
  const MAX_IDLE_MS = 90000;
  let lastSseByteAt = Date.now();
  let idleTimedOut = false;
  /** Raised for long artifact/HTML streams (many small SSE reads). */
  const MAX_READS = 12000;
  const MAX_EMPTY_RUN = 200;
  const CODE_ARTIFACT_CHAR_LIMIT = 48000;
  const CODE_ARTIFACT_RE = /<!doctype|<!DOCTYPE|\bfunction\s|\bconst\s|export default|\bclass\s/;

  const isCodeArtifactStream = () => CODE_ARTIFACT_RE.test(assistantStreamBuf);

  const stopStreamForSafety = (reason: 'max_ms' | 'max_reads' | 'max_empty_run') => {
    console.error('[stream-limit] triggered:', {
      reason,
      outputLength: assistantStreamBuf.length,
      sessionType: isCodeArtifactStream() ? 'code_artifact' : 'default',
      model: 'client_sse',
      readCount,
      emptyRun,
    });
    console.warn('[useAgentChatStream] safety_stop', {
      reason,
      readCount,
      emptyRun,
      fileEchoSuppress,
      elapsedMs: Date.now() - streamStartedAt,
      bufLen: assistantStreamBuf.length,
    });
    if (typeof window !== 'undefined') {
      patchIamAgentStreamDebug({
        safety_stop_reason: reason,
        safety_stop_at: Date.now(),
        read_count: readCount,
        empty_run: emptyRun,
        file_echo_suppress: fileEchoSuppress,
      });
    }
    const suffix =
      reason === 'max_empty_run'
        ? '\n\n[Stream stopped: too many non-text chunks.]'
        : reason === 'max_ms' || reason === 'max_reads'
          ? '\n\n[Generation paused — reply to continue]'
          : `\n\n[Stream stopped: exceeded safety limits (${reason}).]`;
    assistantStreamBuf += suffix;
    assistantContent = assistantStreamBuf;
    setMessages((prev) => upsertAssistantTail(prev, { content: assistantContent }));
  };

  /** Active SSE tool row id for tool_output / tool_done / tool_error pairing. */
  let activeToolTraceId: string | null = null;
  /** URL from browser tool `tool_start` input_preview — used on `tool_done`. */
  let pendingBrowserToolUrl: string | null = null;
  /** `browser_open_url` with automation=true — MYBROWSER preview; passive opens use embedded iframe only. */
  let pendingBrowserToolAutomation = false;
  /** Last `tool_output` chunk for the active browser navigation tool. */
  let lastBrowserToolOutputChunk: string | null = null;
  let activeBrowserNavTool = false;
  /** Last `tool_output` chunk for the active browser screenshot tool. */
  let lastBrowserScreenshotOutputChunk: string | null = null;
  /** Accumulated `tool_output` for the active tool (terminal receipt parsing). */
  let lastActiveToolOutputChunk: string | null = null;
  let activeBrowserScreenshotTool = false;
  /** First session-based browser tool in this stream — opens Agent Live once. */
  let browserAgentLiveSurfaced = false;
  let activeAgentRunId: string | null = null;
  let executionPlan: ExecutionPlanState | null = null;
  let doneReceived = false;
  let activeTurnId = '';
  let activeConversationId = '';

  const applySsePayloadToAssistant = (data: unknown) => {
    const delta = normalizeAssistantSseText(data);
    if (!delta && ssePayloadLooksReasoningOnly(data)) {
      if (!fileEchoSuppress) {
        emptyRun += 1;
      }
      return;
    }
    if (delta) {
      emptyRun = 0;
      if (typeof window !== 'undefined') {
        const dbg = window.__IAM_AGENT_LAST_STREAM_DEBUG;
        if (dbg && dbg.first_text_at == null) {
          patchIamAgentStreamDebug({ first_text_at: Date.now() });
        }
      }
    }
    const sseText = normalizeAssistantSseText(data);
    const trialBuf = assistantStreamBuf + sseText;
    const extracted = extractMonacoInvokesFromBuffer(trialBuf);
    const nextBuf = extracted.text;
    const nextVisible = hideIncompleteMonacoInvokeTail(nextBuf);

    if (!fileEchoSuppress && looksLikeEmbeddedFileDumpStart(nextVisible)) {
      fileEchoSuppress = true;
      if (typeof window !== 'undefined') {
        patchIamAgentStreamDebug({ artifact_echo_suppress: true, artifact_echo_at: Date.now() });
      }
    }

    assistantStreamBuf = nextBuf;
    assistantContent = truncateCodeFencesForChat(nextVisible, 200);
    setMessages((prev) => upsertAssistantTail(prev, { content: assistantContent, executionPlan }));
  };

  const idleTimer =
    typeof window !== 'undefined'
      ? window.setInterval(() => {
          if (signal.aborted || idleTimedOut) return;
          if (Date.now() - lastSseByteAt > MAX_IDLE_MS) {
            idleTimedOut = true;
            patchIamAgentStreamDebug({ idle_timeout_at: Date.now() });
            void reader.cancel().catch(() => {});
          }
        }, 2000)
      : null;

  const clearIdleTimer = () => {
    if (idleTimer != null) window.clearInterval(idleTimer);
  };

  const pushExecutionPlan = (next: ExecutionPlanState | null) => {
    executionPlan = next;
    setMessages((prev) => upsertAssistantTail(prev, { content: assistantContent, executionPlan: next }));
  };

  if (!mergeIntoLastAssistant) {
    activeToolTraceId = null;
    setToolTraceRows?.((prev) => preserveLiveCadTraceRows(prev));
  }
  assistantContent = assistantStreamBuf;

  try {
  sseLoop: while (true) {
    if (signal.aborted) break sseLoop;
    if (idleTimedOut) {
      if (activeTurnId && activeConversationId) {
        try {
          const sinceSeq = readTurnOutboxCursor(activeTurnId);
          const replay = await fetchTurnOutboxReplay(
            activeConversationId,
            activeTurnId,
            sinceSeq,
          );
          const { terminal } = applyTurnOutboxEvents(replay.events, (payload) => {
            applySsePayloadToAssistant(payload);
          });
          if (terminal === 'done') {
            doneReceived = true;
            break sseLoop;
          }
          if (terminal === 'error') {
            break sseLoop;
          }
          if (replay.latest_seq > sinceSeq && assistantStreamBuf.trim()) {
            patchIamAgentStreamDebug({ outbox_resume_at: Date.now(), outbox_resume_seq: replay.latest_seq });
            break sseLoop;
          }
        } catch {
          /* fall through to idle error */
        }
      }
      throw new Error(
        'No response from Agent Sam (stream idle timeout). Try again or switch to Ask mode for quick questions.',
      );
    }
    const overMs = Date.now() - streamStartedAt > MAX_STREAM_MS;
    const artifact = isCodeArtifactStream();
    const readCap =
      artifact && assistantStreamBuf.length < CODE_ARTIFACT_CHAR_LIMIT
        ? MAX_READS * 2
        : MAX_READS;
    const overReads = !fileEchoSuppress && readCount >= readCap;
    const overEmpty = !fileEchoSuppress && emptyRun >= MAX_EMPTY_RUN;
    if (overMs || overReads || overEmpty) {
      stopStreamForSafety(overMs ? 'max_ms' : overReads ? 'max_reads' : 'max_empty_run');
      break sseLoop;
    }

    const { done, value } = await reader.read();
    readCount += 1;
    if (value?.byteLength) lastSseByteAt = Date.now();
    if (done) break;

    sseCarry += decoder.decode(value, { stream: true });
    const parts = sseCarry.split('\n\n');
    sseCarry = parts.pop() || '';

    for (const block of parts) {
      for (const rawLine of block.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (!/^data:/i.test(line)) continue;
        const dataStr = line.replace(/^data:\s*/i, '').trim();
        if (dataStr === '[DONE]') break sseLoop;
        let data: unknown;
        try {
          data = JSON.parse(dataStr);
        } catch (e) {
          markStreamParserError(e instanceof Error ? e.message : String(e));
          continue;
        }
        if (signal.aborted) break sseLoop;

        const markFirstSse = () => {
          if (typeof window === 'undefined') return;
          const cur = window.__IAM_AGENT_LAST_STREAM_DEBUG;
          if (!cur || cur.first_sse_event_at != null) return;
          patchIamAgentStreamDebug({ first_sse_event_at: Date.now() });
        };
        markFirstSse();

        const evType = (data as { type?: string }).type;
        if (evType === 'turn_meta' && data && typeof data === 'object') {
          const d = data as { turn_id?: string; conversation_id?: string };
          if (typeof d.turn_id === 'string' && d.turn_id.trim()) {
            activeTurnId = d.turn_id.trim();
            writeTurnOutboxCursor(activeTurnId, 0);
          }
          if (typeof d.conversation_id === 'string' && d.conversation_id.trim()) {
            activeConversationId = d.conversation_id.trim();
          }
          continue;
        }
        if (typeof evType === 'string' && evType.startsWith('antigravity_') && data && typeof data === 'object') {
          emptyRun = 0;
          onSubagentEvent?.({ type: evType, subagent_slug: 'antigravity_scout' });
          if (evType === 'antigravity_step') {
            const step = (data as { step?: { title?: string; detail?: string } }).step;
            const title = step?.title ? String(step.title).trim() : 'Remote sandbox';
            const detail = step?.detail ? String(step.detail).trim() : '';
            if (detail) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                const line = `**${title}:** ${detail.slice(0, 400)}`;
                if (last?.role === 'assistant') {
                  next[next.length - 1] = {
                    ...last,
                    content: `${last.content}${last.content.trim() ? '\n\n' : ''}${line}`,
                  };
                } else {
                  next.push({ role: 'assistant', content: line });
                }
                return next;
              });
            }
          } else if (evType === 'antigravity_interaction_started') {
            onSubagentEvent?.({ type: 'agentsam_subagent_run_started', subagent_slug: 'antigravity_scout' });
          } else if (evType === 'antigravity_interaction_complete') {
            onSubagentEvent?.({ type: 'agentsam_subagent_run_result', subagent_slug: 'antigravity_scout', status: 'ok' });
          } else if (evType === 'antigravity_interaction_error') {
            onSubagentEvent?.({ type: 'agentsam_subagent_run_result', subagent_slug: 'antigravity_scout', status: 'failed' });
          }
          continue;
        }
        if (typeof evType === 'string' && evType.startsWith('agentsam_subagent_') && data && typeof data === 'object') {
          // Multitask emits structured non-text events; surface a short line and
          // reset emptyRun so the stream isn't treated as "stuck".
          emptyRun = 0;
          const d = data as Record<string, unknown>;
          const fanoutId = typeof d.fanout_id === 'string' ? d.fanout_id.trim() : '';
          const slug = typeof d.subagent_slug === 'string' ? d.subagent_slug.trim() : '';
          const status = typeof d.status === 'string' ? d.status.trim() : '';
          const subagentRunId = typeof d.subagent_run_id === 'string' ? d.subagent_run_id.trim() : '';
          const conversationId =
            typeof d.conversation_id === 'string'
              ? d.conversation_id.trim()
              : typeof d.session_id === 'string'
                ? d.session_id.trim()
                : '';
          const taskTitle =
            typeof (d.task as { title?: string } | undefined)?.title === 'string'
              ? String((d.task as { title?: string }).title).trim()
              : typeof d.task_title === 'string'
                ? d.task_title.trim()
                : '';
          onSubagentEvent?.({
            type: evType,
            fanout_id: fanoutId || undefined,
            subagent_slug: slug || undefined,
            subagent_run_id: subagentRunId || undefined,
            status: status || undefined,
            conversation_id: conversationId || undefined,
            task_title: taskTitle || undefined,
          });
          const line = (() => {
            if (evType === 'agentsam_subagent_fanout_started')
              return `Subagents: fanout started${fanoutId ? ` (${fanoutId})` : ''}.`;
            if (evType === 'agentsam_subagent_run_started') return `Subagent started${slug ? ` (${slug})` : ''}.`;
            if (evType === 'agentsam_subagent_run_progress') return `Subagent progress${slug ? ` (${slug})` : ''}.`;
            if (evType === 'agentsam_subagent_run_result')
              return `Subagent result${slug ? ` (${slug})` : ''}: ${status || 'ok'}.`;
            if (evType === 'agentsam_subagent_action_required') return `Subagent action required.`;
            if (evType === 'agentsam_subagent_fanout_result')
              return `Subagents: fanout ${status || 'done'}.`;
            return `Subagents event: ${evType}.`;
          })();

          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: `${last.content}${last.content.trim() ? '\n\n' : ''}${line}`,
              };
            } else {
              next.push({ role: 'assistant', content: line });
            }
            return next;
          });
          continue;
        }
        if (evType === 'handoff' && data && typeof data === 'object') {
          const h = data as {
            type?: string;
            next_session_id?: string;
            fallback_model_key?: string;
            reason?: string;
          };
          const nextId =
            typeof h.next_session_id === 'string' && h.next_session_id.trim()
              ? h.next_session_id.trim()
              : '';
          if (nextId) {
            try {
              localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, nextId);
            } catch {
              /* ignore */
            }
            setConversationId(nextId);
            replaceAgentConversationUrl(nextId);
            loadSessions();
            notifyAgentChatSessionsRefresh(nextId);
            onAgentHandoff?.({
              next_session_id: nextId,
              fallback_model_key:
                typeof h.fallback_model_key === 'string' ? h.fallback_model_key.trim() : undefined,
              reason: typeof h.reason === 'string' ? h.reason.trim() : undefined,
            });
          }
          onThinkingEvent?.({
            type: 'handoff',
            text:
              h.fallback_model_key && h.reason
                ? `Handoff → ${h.fallback_model_key} (${h.reason})`
                : 'Handoff to cheaper model tier…',
          });
          continue;
        }
        if (evType === 'context' && data && typeof data === 'object') {
          const ctx = data as Record<string, unknown>;
          const spineRunId =
            typeof ctx.agent_run_id === 'string'
              ? ctx.agent_run_id.trim()
              : typeof ctx.agentRunId === 'string'
                ? ctx.agentRunId.trim()
                : '';
          onAgentRunContext?.(spineRunId || null);
          const mk =
            typeof ctx.model === 'string'
              ? ctx.model.trim()
              : typeof ctx.model_key === 'string'
                ? ctx.model_key.trim()
                : '';
          if (mk) onStreamModel?.(mk);
          activeAgentRunId = spineRunId || null;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent(IAM_AGENT_RUN_CONTEXT, { detail: { id: spineRunId || null } }),
            );
          }
          patchIamAgentStreamDebug({
            context_event_at: Date.now(),
            context: { ...ctx },
          });
          continue;
        }
        if (evType === 'runtime_context' && data && typeof data === 'object') {
          const rc = data as Record<string, unknown>;
          const mk =
            typeof rc.model === 'string'
              ? rc.model.trim()
              : typeof rc.model_key === 'string'
                ? rc.model_key.trim()
                : '';
          if (mk) onStreamModel?.(mk);
          continue;
        }
        if (evType === 'error') {
          const d = data as { message?: string; error?: string; detail?: string; code?: string };
          if (d.code === 'agent_run_cancelled') {
            streamFinalizedRef.current = true;
            setIsLoading(false);
            continue;
          }
          streamFinalizedRef.current = true;
          const partsErr = [d.message, d.error, d.detail].filter(Boolean);
          throw new Error(partsErr.join(' — ') || 'Agent stream error');
        }
        if (evType === 'done') {
          doneReceived = true;
          patchIamAgentStreamDebug({ done_at: Date.now(), done_received: true });
          if (!streamFinalizedRef.current) {
            streamFinalizedRef.current = true;
            setIsLoading(false);
          }
          // emailArtifactFromText: render email card from assistant text, no tool call needed
          try {
            const _subjMatch = assistantContent.match(/^subject[:\s]+(.+)$/im);
            if (_subjMatch && assistantContent.length > 100) {
              const _subj = _subjMatch[1].trim();
              const _subjLineEnd = assistantContent.indexOf(_subjMatch[0]) + _subjMatch[0].length;
              const _body = assistantContent.slice(_subjLineEnd).replace(/^[\n\r]+/, '').trim();
              const _toMatch = assistantContent.match(/^to[:\s]+([^\n]+)/im);
              const _to = _toMatch ? _toMatch[1].trim() : undefined;
              if (_body.length > 20) {
                setMessages((prev) => {
                  const _last = [...prev];
                  const _lm = _last[_last.length - 1];
                  if (_lm && _lm.role === 'assistant' && !_lm.emailArtifact) {
                    _last[_last.length - 1] = {
                      ..._lm,
                      emailArtifact: { subject: _subj, body: _body, to: _to },
                    };
                  }
                  return _last;
                });
              }
            }
          } catch (_) { /* non-fatal */ }
          continue;
        }
        if (streamFinalizedRef.current && evType === 'error') {
          continue;
        }

        if (data && typeof data === 'object' && Array.isArray((data as { choices?: unknown }).choices)) {
          const ch0 = (data as { choices: Array<{ delta?: { content?: string | null; reasoning_content?: unknown } }> })
            .choices[0];
          const del = ch0?.delta;
          if (del) {
            if (del.reasoning_content) continue;
            if (del.content === null) continue;
          }
        }
        if (looksLikeRawProviderLeak(data)) {
          emptyRun += 1;
          continue;
        }
        if (isStreamErrorPayload(data)) {
          streamFinalizedRef.current = true;
          const partsErr = [data.error, data.detail, data.provider, data.model].filter(Boolean);
          throw new Error(partsErr.join(' — '));
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'tool_approval_request') {
          const t = data as { type: string; tool?: ToolApprovalPayload };
          if (t.tool && typeof t.tool.name === 'string') {
            onToolApprovalRequest(t.tool);
            streamFinalizedRef.current = true;
            setIsLoading(false);
          }
          continue;
        }
        if (evType === 'thinking_start') {
          onThinkingEvent?.({ type: 'thinking_start' });
          continue;
        }
        if (evType === 'status' && data && typeof data === 'object') {
          const phase = String((data as { phase?: string }).phase || '').trim();
          if (phase === 'preflight') {
            onThinkingEvent?.({ type: 'thinking', text: 'Starting…' });
          } else if (phase === 'context') {
            onThinkingEvent?.({ type: 'thinking', text: 'Gathering context…' });
          }
          continue;
        }
        if (evType === 'thinking') {
          const d = data as { text?: string };
          onThinkingEvent?.({ type: 'thinking', text: d.text || '' });
          continue;
        }
        if (
          evType === 'image_generation_started' ||
          evType === 'image_generation_progress' ||
          evType === 'image_generation_preview' ||
          evType === 'image_generation_complete'
        ) {
          const normalized = normalizeImageGenerationEvent(data);
          if (normalized) {
            patchAssistantImageGeneration(
              setMessages,
              assistantContent,
              normalized.patch,
              normalized.eventType,
            );
          }
          continue;
        }
        if (evType === 'email_draft') {
          const d = data as { subject?: string; body?: string; to?: string; from?: string };
          setMessages((prev) => {
            const last = [...prev];
            const lastMsg = last[last.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              last[last.length - 1] = {
                ...lastMsg,
                emailArtifact: {
                  subject: d.subject ?? '',
                  body: d.body ?? '',
                  to: d.to,
                  from: d.from,
                },
              };
            }
            return last;
          });
          continue;
        }
        // tool_start / tool_done: handled below (trace rows + browser nav). Do not continue here or browser wiring never runs.
        if (evType === 'tool_error') {
          const d = data as { tool_name?: string; node_key?: string };
          onThinkingEvent?.({ type: 'tool_error', tool_name: d.tool_name || d.node_key || '' });
          continue;
        }
        if (evType === 'tool_blocked') {
          const d = data as { tool_name?: string; node_key?: string };
          onThinkingEvent?.({ type: 'tool_blocked', tool_name: d.tool_name || d.node_key || '' });
          continue;
        }
        if (evType === 'approval_required') {
          const d = data as {
            command_run_id?: string;
            approval_id?: string;
            proposal_id?: string;
            tool_name?: string;
            tool_args?: Record<string, unknown>;
            risk_level?: string;
            message?: string;
            action_summary?: string;
            command_preview?: string;
          };
          const toolName = typeof d.tool_name === 'string' ? d.tool_name.trim() : '';
          const approvalId =
            (typeof d.proposal_id === 'string' && d.proposal_id.trim()) ||
            (typeof d.approval_id === 'string' && d.approval_id.trim()) ||
            '';
          if (toolName && approvalId && !d.command_run_id) {
            const toolPayload: ToolApprovalPayload = {
              name: toolName,
              description: d.action_summary || d.message || undefined,
              parameters:
                d.tool_args && typeof d.tool_args === 'object' ? d.tool_args : undefined,
              preview: d.command_preview || undefined,
              approval_id: approvalId,
              proposal_id: approvalId,
              risk_level: d.risk_level,
            };
            if (!toolPayload.preview) {
              toolPayload.preview = resolveToolApprovalPreview(toolPayload);
            }
            onToolApprovalRequest(toolPayload);
            streamFinalizedRef.current = true;
            setIsLoading(false);
          }
          onThinkingEvent?.({
            type: 'approval_required',
            command_run_id: d.command_run_id || d.approval_id || d.proposal_id,
          });
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          ((data as { type?: string }).type === 'capability_selected' ||
            (data as { type?: string }).type === 'agent_capability_selected')
        ) {
          const d = data as { decision?: Record<string, unknown> };
          const dec = d.decision;
          if (dec && typeof dec === 'object') {
            patchIamAgentStreamDebug({ capability_decision: dec });
          }
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          ((data as { type?: string }).type === 'surface_open' ||
            (data as { type?: string }).type === 'agent_surface_open')
        ) {
          const d = data as {
            surface?: string;
            url?: string;
            reason?: string;
            load_url?: string;
            artifact_id?: string;
            artifact_type?: string;
            project_slug?: string;
            page_id?: string;
            panel?: string;
            bucket?: string;
            key?: string;
            workspace_path?: string;
            github_repo?: string;
            github_path?: string;
            github_branch?: string;
            port?: number;
            domain?: string;
            target?: Record<string, unknown>;
          };
          window.dispatchEvent(
            new CustomEvent('iam:agent-open-surface', {
              detail: {
                surface: d.surface,
                url: d.url,
                reason: d.reason,
                load_url: d.load_url,
                artifact_id: d.artifact_id,
                artifact_type: d.artifact_type,
                project_slug: d.project_slug,
                page_id: d.page_id,
                panel: d.panel,
                bucket: d.bucket,
                key: d.key,
                workspace_path: d.workspace_path,
                github_repo: d.github_repo,
                github_path: d.github_path,
                github_branch: d.github_branch,
                port: d.port,
                domain: d.domain,
                target: d.target,
                ...(d.surface === 'browser' && activeAgentRunId
                  ? { agent_live: true }
                  : {}),
              },
            }),
          );
          if (d.surface === 'browser' && typeof d.url === 'string' && d.url.trim()) {
            const navUrl = sanitizeBrowserNavigateUrl(d.url);
            if (navUrl && !/\/api\/r2\/file\b/i.test(navUrl)) {
              onBrowserNavigate?.({
                type: 'browser_navigate',
                url: navUrl,
                agent_live: Boolean(activeAgentRunId),
                automation: Boolean(activeAgentRunId),
              });
            }
          }
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          ((data as { type?: string }).type === 'monaco_files_generated' ||
            (data as { type?: string }).type === 'monaco_file_generated')
        ) {
          const payload = data as { type?: string; files?: unknown[]; plan_id?: string };
          const batch = Array.isArray(payload.files) && payload.files.length ? payload.files : [data];
          const openMonacoFiles = async () => {
            for (const raw of batch) {
              if (!raw || typeof raw !== 'object') continue;
              const f = raw as {
                filename?: string;
                path?: string;
                language?: string;
                content?: string;
                plan_id?: string;
                r2_url?: string;
              };
              const batchPlanId =
                typeof (data as { plan_id?: string }).plan_id === 'string'
                  ? (data as { plan_id: string }).plan_id.trim()
                  : '';
              let content = typeof f.content === 'string' ? f.content : '';
              const path = typeof f.path === 'string' ? f.path.trim() : '';
              const filename =
                (typeof f.filename === 'string' && f.filename.trim()) ||
                path.split('/').pop() ||
                'untitled';
              const planId =
                (typeof f.plan_id === 'string' && f.plan_id.trim()) || batchPlanId || '';
              const r2Url = typeof f.r2_url === 'string' ? f.r2_url.trim() : '';
              if (!content && r2Url) {
                try {
                  const r = await fetch(r2Url, { credentials: 'include' });
                  if (r.ok) content = await r.text();
                } catch {
                  /* ignore fetch errors */
                }
              }
              if (!content) continue;
              try {
                const workspacePath = planId
                  ? `agent-draft:${planId}:${path || filename}`
                  : path || filename;
                onFileSelect?.({
                  name: filename,
                  workspacePath,
                  content,
                  originalContent: '',
                });
              } catch (e) {
                console.warn('[ChatAssistant] onFileSelect failed for monaco_file_generated', e);
              }
            }
            window.dispatchEvent(
              new CustomEvent('iam:agent-open-surface', {
                detail: { surface: 'code', reason: 'monaco_file_generated' },
              }),
            );
          };
          void openMonacoFiles();
          fileEchoSuppress = true;

          // Stamp file entries onto the current assistant message for the files panel
          const genFiles: AgentGeneratedFile[] = batch
            .filter((raw): raw is NonNullable<typeof raw> => raw != null && typeof raw === 'object')
            .map((raw) => {
              const f = raw as { filename?: string; path?: string; content?: string; r2_url?: string };
              const path = typeof f.path === 'string' ? f.path.trim() : '';
              const filename =
                (typeof f.filename === 'string' && f.filename.trim()) ||
                path.split('/').pop() ||
                'output';
              const r2Url = typeof f.r2_url === 'string' ? f.r2_url.trim() : undefined;
              const content = typeof f.content === 'string' && f.content.length < 32000 ? f.content : undefined;
              return {
                filename,
                r2Url,
                content,
                workspacePath: path || filename,
                kind: resolveAgentFileKind(filename),
              };
            })
            .filter((gf) => gf.filename);

          if (genFiles.length) {
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.length - 1;
              if (idx < 0 || next[idx].role !== 'assistant') return prev;
              const existing = next[idx].agentFiles ?? [];
              const seen = new Set(existing.map((x) => x.workspacePath ?? x.filename));
              const fresh = genFiles.filter((gf) => !seen.has(gf.workspacePath ?? gf.filename));
              if (!fresh.length) return prev;
              next[idx] = { ...next[idx], agentFiles: [...existing, ...fresh] };
              return next;
            });
          }

          continue;
        }
        if (evType === 'code_diff') {
          const d = data as {
            path?: string;
            before?: string;
            after?: string;
            language?: string;
          };
          const path = typeof d.path === 'string' ? d.path.trim() : '';
          const before = typeof d.before === 'string' ? d.before : '';
          const after = typeof d.after === 'string' ? d.after : '';
          if (path && before !== after) {
            const art: AgentPreviewArtifact = {
              id: `diff_${path.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40)}_${Date.now().toString(36)}`,
              kind: 'diff',
              path,
              before,
              content: after,
              language: typeof d.language === 'string' ? d.language : undefined,
              title: path,
            };
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.length - 1;
              if (idx < 0 || next[idx].role !== 'assistant') return prev;
              const prevArts = next[idx].previewArtifacts || [];
              if (prevArts.some((x) => x.id === art.id)) return prev;
              next[idx] = { ...next[idx], previewArtifacts: [...prevArts, art] };
              return next;
            });
          }
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'preview_artifact') {
          const d = data as {
            type: string;
            artifact?: {
              id?: string;
              kind?: string;
              title?: string;
              content?: string;
              language?: string;
              imageUrl?: string;
            };
          };
          const raw = d.artifact;
          if (raw && typeof raw.id === 'string' && raw.id.trim()) {
            const k = String(raw.kind || 'code');
            const kind: AgentPreviewArtifactKind =
              k === 'sql' || k === 'diff' || k === 'code' || k === 'image' || k === 'table' ? k : 'code';
            const art: AgentPreviewArtifact = {
              id: raw.id.trim(),
              kind,
              title: typeof raw.title === 'string' ? raw.title : undefined,
              content: typeof raw.content === 'string' ? raw.content : undefined,
              language: typeof raw.language === 'string' ? raw.language : undefined,
              imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : undefined,
              before: typeof (raw as { before?: string }).before === 'string' ? (raw as { before: string }).before : undefined,
              path: typeof (raw as { path?: string }).path === 'string' ? (raw as { path: string }).path : undefined,
            };
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.length - 1;
              if (idx < 0 || next[idx].role !== 'assistant') return prev;
              const prevArts = next[idx].previewArtifacts || [];
              if (prevArts.some((x) => x.id === art.id)) return prev;
              next[idx] = { ...next[idx], previewArtifacts: [...prevArts, art] };
              return next;
            });
          }
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'plan_thinking') {
          const d = data as { type: string; message?: string };
          onThinkingEvent?.({ type: 'plan_thinking', text: String(d.message || 'Creating plan…') });
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          ((data as { type?: string }).type === 'plan_explore_start' ||
            (data as { type?: string }).type === 'plan_explore_progress' ||
            (data as { type?: string }).type === 'plan_explore_step')
        ) {
          const d = data as {
            type: string;
            message?: string;
            synthesis?: string;
            files_searched?: number;
            searches?: number;
            label?: string;
          };
          const label =
            d.type === 'plan_explore_step'
              ? String(d.label || '').trim() || 'Exploring…'
              : String(d.synthesis || d.message || '').trim() ||
                (d.files_searched != null
                  ? `Explored ${d.files_searched} files…`
                  : 'Exploring codebase and context…');
          onThinkingEvent?.({ type: 'plan_thinking', text: label });
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'plan_questions_batch') {
          const d = data as {
            type: string;
            batch_id?: string;
            phase?: string;
            plan_id?: string;
            explore_summary?: { synthesis?: string; files_searched?: number; searches?: number };
            questions?: Array<{
              id: string;
              question: string;
              choices?: Array<{ key: string; label: string }>;
              multi_select?: boolean;
            }>;
            allow_skip?: boolean;
          };
          const batchId = typeof d.batch_id === 'string' ? d.batch_id.trim() : '';
          if (batchId) {
            const phase =
              d.phase === 'roadblock' || d.phase === 'mid_plan' ? d.phase : 'pre_plan';
            const batch = {
              batch_id: batchId,
              phase,
              plan_id: typeof d.plan_id === 'string' ? d.plan_id.trim() : null,
              explore_summary: d.explore_summary,
              questions: (d.questions || []).map((q) => ({
                id: String(q.id || ''),
                question: String(q.question || ''),
                choices: Array.isArray(q.choices)
                  ? q.choices.map((c) => ({ key: String(c.key), label: String(c.label) }))
                  : [],
                multi_select: Boolean(q.multi_select),
              })),
              allow_skip: d.allow_skip !== false,
            };
            setMessages((prev) => {
              const next = [...prev];
              next.push({
                role: 'assistant',
                content: '',
                planQuestionsBatch: batch,
              });
              return next;
            });
            onThinkingEvent?.({ type: 'plan_thinking', text: 'Waiting for your answers…', plan_id: batchId });
          }
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'approval_required') {
          const d = data as {
            type: string;
            task_id?: string;
            command_run_id?: string;
            approval_id?: string;
            title?: string;
            command_preview?: string;
            risk_level?: string;
            action_summary?: string;
            plan_id?: string;
          };
          const pid = typeof d.plan_id === 'string' ? d.plan_id.trim() : '';
          const taskId = typeof d.task_id === 'string' ? d.task_id.trim() : '';
          const crid = typeof d.command_run_id === 'string' ? d.command_run_id.trim() : '';
          const aid = typeof d.approval_id === 'string' ? d.approval_id.trim() : '';
          if (pid && taskId && aid && crid) {
            onToolApprovalRequest({
              name: 'terminal.plan_task',
              description: d.action_summary || 'Run proposed terminal command for this plan task.',
              preview: d.command_preview || '',
              plan_terminal: {
                plan_id: pid,
                task_id: taskId,
                command_run_id: crid,
                approval_id: aid,
              },
            });
          }
          onThinkingEvent?.({
            type: 'approval_required',
            text: `Waiting for approval: ${String(d.title || 'Terminal')}`,
            command_run_id: crid || aid,
          });
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'plan_created') {
          const d = data as {
            type: string;
            plan_title?: string;
            plan_id?: string;
            approval_id?: string;
            auto_execute?: boolean;
            workflow_run_id?: string;
            task_count?: number;
            visual_map?: { artifact_id: string; r2_key?: string; public_url: string } | null;
            plan_markdown?: { artifact_id: string; r2_key?: string; public_url: string } | null;
            tasks?: Array<{
              id: string;
              title: string;
              order_index: number;
              handler_type?: string | null;
              handler_key?: string | null;
              capability_type?: string | null;
              execution_step_id?: string | null;
              command_run_id?: string | null;
              approval_id?: string | null;
              workflow_run_id?: string | null;
              files_involved?: string[];
            }>;
          };
          const pid = typeof d.plan_id === 'string' ? d.plan_id.trim() : '';
          const planTasks: ExecutionPlanTask[] = (d.tasks || []).map((t) => ({
            id: String(t.id || ''),
            title: String(t.title || '').slice(0, 200),
            order_index: Number(t.order_index ?? 0),
            status: 'todo',
            parent_task_id:
              (t as { parent_task_id?: string | null }).parent_task_id ?? null,
            handler_type: t.handler_type ?? null,
            trace: {
              execution_step_id: t.execution_step_id ?? null,
              command_run_id: t.command_run_id ?? null,
              workflow_run_id: t.workflow_run_id ?? d.workflow_run_id ?? null,
              capability_type: t.capability_type ?? null,
              handler_key: t.handler_key ?? null,
              files_involved: Array.isArray(t.files_involved) ? t.files_involved : undefined,
            },
          }));
          executionPlan = {
            plan_id: pid,
            plan_title: String(d.plan_title || 'Plan'),
            status: d.auto_execute === false ? 'ready' : 'running',
            tasks: planTasks,
            workflow_run_id: d.workflow_run_id ?? null,
          };
          onThinkingEvent?.({
            type: 'plan_created',
            plan_id: pid,
            text: d.auto_execute === false ? 'Plan ready — click Run plan to execute.' : `Running task 1 of ${planTasks.length || Number(d.task_count || 0) || '?' }…`,
          });
          const vm = d.visual_map;
          const pm = d.plan_markdown;
          const vmOk =
            pid &&
            vm &&
            typeof vm === 'object' &&
            typeof vm.artifact_id === 'string' &&
            vm.artifact_id.trim() &&
            typeof vm.public_url === 'string' &&
            vm.public_url.trim();
          const pmOk =
            pid &&
            pm &&
            typeof pm === 'object' &&
            typeof pm.artifact_id === 'string' &&
            pm.artifact_id.trim() &&
            typeof pm.public_url === 'string' &&
            pm.public_url.trim();
          let chip:
            | {
                plan_id: string;
                plan_title?: string;
                visual_map?: { artifact_id: string; r2_key?: string; public_url: string };
                plan_markdown?: { artifact_id: string; r2_key?: string; public_url: string };
              }
            | undefined;
          if (vmOk || pmOk) {
            const visual_map = vmOk
              ? {
                  artifact_id: String(vm.artifact_id).trim(),
                  r2_key: typeof vm.r2_key === 'string' ? vm.r2_key : undefined,
                  public_url: String(vm.public_url).trim(),
                }
              : undefined;
            const plan_markdown = pmOk
              ? {
                  artifact_id: String(pm.artifact_id).trim(),
                  r2_key: typeof pm.r2_key === 'string' ? pm.r2_key : undefined,
                  public_url: String(pm.public_url).trim(),
                }
              : undefined;
            chip = {
              plan_id: pid,
              plan_title: d.plan_title,
              ...(visual_map ? { visual_map } : {}),
              ...(plan_markdown ? { plan_markdown } : {}),
            };
          }
          const summaryText =
            typeof (d as { summary?: string }).summary === 'string'
              ? String((d as { summary: string }).summary).trim()
              : '';
          setMessages((prev) => {
            const last = [...prev];
            const idx = last.length - 1;
            const content =
              assistantContent ||
              summaryText ||
              (d.auto_execute === false ? 'Plan ready — edit in the editor, then Run plan.' : '');
            const patch = {
              content,
              executionPlan,
              planConfirmation: undefined,
              implementationPlan: pmOk
                ? {
                    plan_id: pid,
                    plan_title: d.plan_title,
                    plan_markdown: chip?.plan_markdown,
                  }
                : null,
            };
            if (idx >= 0 && last[idx].role === 'assistant') {
              last[idx] = { ...last[idx], ...patch };
            } else {
              last.push({ role: 'assistant', ...patch });
            }
            return last;
          });
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'plan_confirmation_required') {
          const d = data as {
            type: string;
            approval_id?: string;
            plan_id?: string;
            plan_title?: string;
            summary?: string;
            message?: string;
            tasks?: Array<{ title: string; order_index: number }>;
          };
          onThinkingEvent?.({
            type: 'plan_confirmation_required',
            approval_id: d.approval_id ?? '',
            plan_id: d.plan_id ?? '',
            text: d.summary ?? d.message ?? 'Review the plan and confirm to continue.',
          });
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.length - 1;
            const bubble: (typeof next)[number] = {
              role: 'assistant',
              content: d.message || d.summary || 'Plan ready for review.',
              planConfirmation: {
                plan_id: String(d.plan_id || '').trim(),
                approval_id: String(d.approval_id || '').trim(),
                plan_title: d.plan_title,
                message: d.message || d.summary,
                tasks: d.tasks,
              },
            };
            if (idx >= 0 && next[idx].role === 'assistant' && !next[idx].content.trim()) {
              next[idx] = { ...next[idx], ...bubble };
            } else {
              next.push(bubble);
            }
            return next;
          });
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          [
            'needs_input',
            'agent_question',
            'attached_question',
            'clarification_required',
            'user_question',
          ].includes(String((data as { type?: string }).type || ''))
        ) {
          const d = data as {
            type: string;
            question?: string;
            text?: string;
            message?: string;
            options?: string[];
            choices?: string[];
            question_id?: string;
          };
          const questionText = String(d.question || d.text || d.message || '').trim();
          const options = Array.isArray(d.options)
            ? d.options.map((o) => String(o).trim()).filter(Boolean)
            : Array.isArray(d.choices)
              ? d.choices.map((o) => String(o).trim()).filter(Boolean)
              : undefined;
          if (questionText) {
            const isAttached = String(d.type || '') === 'attached_question';
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.length - 1;
              const bubble: (typeof next)[number] = {
                role: 'assistant',
                content: isAttached ? '' : questionText,
                agentQuestion: {
                  question: questionText,
                  options: options?.length ? options : undefined,
                  questionId: typeof d.question_id === 'string' ? d.question_id : undefined,
                },
              };
              if (
                !isAttached &&
                idx >= 0 &&
                next[idx].role === 'assistant' &&
                !next[idx].content.trim()
              ) {
                next[idx] = { ...next[idx], ...bubble };
              } else {
                next.push(bubble);
              }
              return next;
            });
          }
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'plan_execute_start') {
          const d = data as { type: string; plan_id?: string };
          const pid = typeof d.plan_id === 'string' ? d.plan_id.trim() : '';
          if (executionPlan && pid && executionPlan.plan_id === pid) {
            executionPlan = { ...executionPlan, status: 'running' };
            pushExecutionPlan(executionPlan);
          }
          onThinkingEvent?.({
            type: 'plan_progress',
            plan_id: pid,
            text: 'Executing plan tasks…',
          });
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'task_start') {
          const d = data as {
            type: string;
            task_id?: string;
            title?: string;
            order_index?: number;
            handler_type?: string;
            total_tasks?: number;
          };
          if (executionPlan) {
            const idx = Number(d.order_index ?? 0);
            const total = Number(d.total_tasks ?? executionPlan.tasks.length) || executionPlan.tasks.length;
            executionPlan = {
              ...executionPlan,
              status: 'running',
              tasks: executionPlan.tasks.map((t) =>
                t.id === d.task_id || t.order_index === idx
                  ? { ...t, status: 'running' as const }
                  : t,
              ),
            };
            pushExecutionPlan(executionPlan);
            onThinkingEvent?.({
              type: 'plan_progress',
              text: d.title || `Running task ${idx + 1} of ${total}…`,
            });
          }
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'task_complete') {
          const d = data as {
            type: string;
            task_id?: string;
            title?: string;
            status?: string;
            output?: string;
            error?: string;
            order_index?: number;
          };
          const taskStatus = mapTaskCompleteStatus(d.status);
          const detail = String(d.output || d.error || '').slice(0, 1200);
          if (executionPlan) {
            const idx = Number(d.order_index ?? 0);
            executionPlan = {
              ...executionPlan,
              tasks: executionPlan.tasks.map((t) =>
                t.id === d.task_id || t.order_index === idx
                  ? { ...t, status: taskStatus, detail: detail || t.detail }
                  : t,
              ),
            };
            pushExecutionPlan(executionPlan);
          }
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'plan_task_resume_complete') {
          const d = data as {
            type: string;
            plan_id?: string;
            task_id?: string;
            tasks_completed?: number;
            tasks_failed?: number;
            tasks_skipped?: number;
            status?: string;
          };
          if (executionPlan) {
            const failed = Number(d.tasks_failed || 0);
            executionPlan = {
              ...executionPlan,
              status: planStatusFromSummary(d.status, failed),
              tasks_completed: Number(d.tasks_completed || 0),
              tasks_failed: failed,
              tasks_skipped: Number(d.tasks_skipped || 0),
            };
            pushExecutionPlan(executionPlan);
          }
          onThinkingEvent?.({ type: 'workflow_complete' });
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'plan_complete') {
          const d = data as {
            type: string;
            plan_id?: string;
            tasks_completed?: number;
            tasks_failed?: number;
            tasks_skipped?: number;
            status?: string;
          };
          if (executionPlan) {
            const failed = Number(d.tasks_failed || 0);
            executionPlan = {
              ...executionPlan,
              status: planStatusFromSummary(d.status, failed),
              tasks_completed: Number(d.tasks_completed || 0),
              tasks_failed: failed,
              tasks_skipped: Number(d.tasks_skipped || 0),
            };
            pushExecutionPlan(executionPlan);
          }
          onThinkingEvent?.({ type: 'workflow_complete' });
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'workflow_start') {
          const w = data as {
            type: string;
            run_id?: string;
            agent_run_id?: string;
            steps_total?: number | null;
            workflow_key?: string;
            ledger_kind?: string;
          };
          const isChatToolSession = w.ledger_kind === 'chat_tool_session';
          if (typeof w.workflow_key === 'string' && w.workflow_key.trim() && !isChatToolSession) {
            onThinkingEvent?.({ type: 'plan_progress', text: 'Running workflow…' });
          }
          const spineRunId = sseSpineRunId(w);
          setWorkflowLedger((prev) => ({
            ...prev,
            runId: spineRunId || prev.runId,
            stepsTotal: w.steps_total != null ? Number(w.steps_total) : prev.stepsTotal,
            lastError: null,
            status: 'running' as const,
          }));
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'workflow_step') {
          const w = data as {
            type: string;
            run_id?: string;
            agent_run_id?: string;
            node_key?: string;
            current_node_key?: string;
            steps_completed?: number;
            steps_total?: number;
            cost_usd?: number;
            input_tokens?: number;
            output_tokens?: number;
            ok?: boolean;
          };
          const spineRunId = sseSpineRunId(w);
          const nk =
            (typeof w.current_node_key === 'string' && w.current_node_key) ||
            (typeof w.node_key === 'string' && w.node_key) ||
            '';
          if (nk) {
            onThinkingEvent?.({
              type: 'workflow_step',
              tool_name: nk,
              ok: w.ok !== false,
              output_preview:
                typeof (w as { output_preview?: string }).output_preview === 'string'
                  ? (w as { output_preview: string }).output_preview
                  : undefined,
            });
          }
          const wfPreview =
            typeof (w as { output_preview?: string }).output_preview === 'string'
              ? (w as { output_preview: string }).output_preview
              : null;
          const wfJobId = resolveCadJobIdFromSse(nk, {
            job_id: (w as { job_id?: string }).job_id,
            cad_job_id: (w as { cad_job_id?: string }).cad_job_id,
            output_preview: wfPreview,
          });
          if (wfJobId && nk) {
            setToolTraceRows?.((prev) =>
              prev.map((r) => {
                if (r.id !== activeToolTraceId && r.toolName !== nk) return r;
                return patchTraceRowCadJob(r, nk, {
                  jobId: wfJobId,
                  outputPreview: wfPreview,
                });
              }),
            );
          }
          setWorkflowLedger((prev) => ({
            ...prev,
            runId: spineRunId || prev.runId,
            currentNodeKey:
              (typeof w.current_node_key === 'string' && w.current_node_key) ||
              (typeof w.node_key === 'string' && w.node_key) ||
              prev.currentNodeKey,
            stepsCompleted: w.steps_completed != null ? Number(w.steps_completed) : prev.stepsCompleted,
            stepsTotal: w.steps_total != null ? Number(w.steps_total) : prev.stepsTotal,
            runCost: w.cost_usd != null ? Number(w.cost_usd) : prev.runCost,
            runTokensIn: w.input_tokens != null ? Number(w.input_tokens) : prev.runTokensIn,
            runTokensOut: w.output_tokens != null ? Number(w.output_tokens) : prev.runTokensOut,
          }));
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          ((data as { type?: string }).type === 'workflow_complete' ||
            (data as { type?: string }).type === 'workflow_error' ||
            (data as { type?: string }).type === 'workflow_approval_required')
        ) {
          const w = data as {
            type: string;
            run_id?: string;
            agent_run_id?: string;
            message?: string;
            status?: string;
          };
          const spineRunId = sseSpineRunId(w);
          setWorkflowLedger((prev) => ({
            ...prev,
            runId: w.type === 'workflow_complete' ? null : spineRunId || prev.runId,
            lastError: w.type === 'workflow_error' ? String(w.message || 'workflow_error') : null,
            status:
              w.type === 'workflow_complete'
                ? ('completed' as const)
                : w.type === 'workflow_error'
                  ? ('failed' as const)
                  : prev.status,
            stepsCompleted:
              w.type === 'workflow_complete' && typeof (w as { steps_completed?: number }).steps_completed === 'number'
                ? Number((w as { steps_completed: number }).steps_completed)
                : prev.stepsCompleted,
            stepsTotal:
              typeof (w as { steps_total?: number }).steps_total === 'number'
                ? Number((w as { steps_total: number }).steps_total)
                : prev.stepsTotal,
          }));
          if (w.type === 'workflow_complete') {
            onThinkingEvent?.({ type: 'workflow_complete' });
          } else if (w.type === 'workflow_approval_required') {
            onThinkingEvent?.({ type: 'approval_required', text: 'Waiting for approval…' });
          } else {
            onThinkingEvent?.({ type: 'workflow_error' });
          }
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'r2_file_updated' &&
          typeof (data as { bucket?: string }).bucket === 'string' &&
          typeof (data as { key?: string }).key === 'string'
        ) {
          const r2evt = data as { type: 'r2_file_updated'; bucket: string; key: string };
          onR2FileUpdated?.(r2evt);
          fileEchoSuppress = false;
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'client_fs_request'
        ) {
          const fsEvt = data as {
            call_id?: string;
            callId?: string;
            path?: string;
            operation?: string;
            content?: string | null;
            conversation_id?: string;
          };
          const lsConv =
            typeof localStorage !== 'undefined'
              ? String(localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID) || '').trim()
              : '';
          void fulfillClientFsRequest(fsEvt, {
            conversationId:
              fsEvt.conversation_id ||
              activeConversationId ||
              lsConv ||
              pendingConversationUrlSync ||
              null,
          });
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'browser_trust_required'
        ) {
          const d = data as { origin?: string; url?: string; tool_name?: string };
          const origin = typeof d.origin === 'string' ? d.origin : '';
          const url =
            origin ||
            (typeof d.url === 'string' && d.url.trim() ? d.url.trim() : '');
          if (url && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('iam-browser-trust-required', {
                detail: { origin: url, url, tool_name: d.tool_name },
              }),
            );
          }
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'browser_live_view_ready'
        ) {
          const d = data as {
            type: 'browser_live_view_ready';
            url?: string;
            live_view_url?: string;
            session_id?: string;
            target_id?: string;
            title?: string;
          };
          onThinkingEvent?.({
            type: 'browser_live_view_ready',
            url: d.url,
            live_view_url: d.live_view_url,
            title: d.title,
          });
          if (typeof window !== 'undefined' && (d.live_view_url || d.session_id)) {
            window.dispatchEvent(
              new CustomEvent('iam-browser-agent-live', {
                detail: {
                  url: d.url || 'about:blank',
                  live_view_url: d.live_view_url,
                  session_id: d.session_id,
                  agent_run_id: d.agent_run_id,
                },
              }),
            );
          }
          if (d.url && onBrowserNavigate) {
            const navUrl = sanitizeBrowserNavigateUrl(String(d.url));
            if (navUrl && !/\/api\/r2\/file\b/i.test(navUrl)) {
              onBrowserNavigate({
                type: 'browser_navigate',
                url: navUrl,
                automation: true,
                agent_live: true,
                live_view_url: d.live_view_url,
                session_id: d.session_id,
              });
            }
          }
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'browser_human_input_required'
        ) {
          const d = data as {
            type: 'browser_human_input_required';
            reason?: string;
            live_view_url?: string;
            url?: string;
            resume_when?: string;
            session_id?: string;
          };
          onThinkingEvent?.({
            type: 'browser_human_input_required',
            reason: d.reason,
            live_view_url: d.live_view_url,
            url: d.url,
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('iam-browser-human-input-required', {
                detail: {
                  reason: d.reason,
                  live_view_url: d.live_view_url,
                  url: d.url,
                  resume_when: d.resume_when,
                  session_id: d.session_id,
                },
              }),
            );
          }
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'browser_human_input_resumed'
        ) {
          onThinkingEvent?.({ type: 'browser_human_input_resumed' });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('iam-browser-human-input-resumed'));
          }
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          [
            'browser_session_starting',
            'browser_session_ready',
            'browser_action_started',
            'browser_action_done',
            'browser_live_view_refresh',
            'browser_session_closed',
            'browser_human_input_cancelled',
            'browser_navigated',
            'browser_scrolled',
          ].includes(String((data as { type?: string }).type || ''))
        ) {
          const d = data as {
            type: string;
            tool_name?: string;
            url?: string;
            title?: string;
            live_view_url?: string;
            direction?: string;
            ok?: boolean;
            reason?: string;
          };
          onThinkingEvent?.({
            type: d.type,
            tool_name: d.tool_name,
            url: d.url,
            title: d.title,
            live_view_url: d.live_view_url,
            ok: d.ok,
            reason: d.reason,
          });
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'browser_verification_failed'
        ) {
          const d = data as {
            type: 'browser_verification_failed';
            tool_name?: string;
            tool_call_id?: string;
            requested_url?: string;
            url?: string;
            error?: string;
          };
          onThinkingEvent?.({
            type: 'browser_verification_failed',
            tool_name: d.tool_name || 'browser_navigate',
            message: d.error || 'Navigation was requested but not verified.',
          });
          const failMsg = String(d.error || 'Navigation was requested but not verified.').slice(0, 4000);
          const toolLabel = String(d.tool_name || 'browser_navigate');
          setToolTraceRows?.((prev) => {
            const closedRowId = resolveToolTraceRowId(
              prev,
              d.tool_call_id,
              activeToolTraceId,
              toolLabel,
            );
            if (closedRowId && prev.some((r) => r.id === closedRowId)) {
              return prev.map((r) =>
                r.id === closedRowId
                  ? {
                      ...r,
                      status: 'error' as const,
                      lines: [...r.lines, failMsg],
                    }
                  : r,
              );
            }
            return prev;
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('iam-browser-url-verification-failed', {
                detail: {
                  requested_url: d.requested_url,
                  url: d.url,
                  tool_call_id: d.tool_call_id ?? null,
                },
              }),
            );
          }
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'browser_url_committed'
        ) {
          const d = data as {
            type: 'browser_url_committed';
            url?: string;
            title?: string;
            verified?: boolean;
            session_id?: string;
            live_view_url?: string;
            agent_run_id?: string;
            smoke_debug?: Record<string, unknown> | null;
          };
          const navUrl = sanitizeBrowserNavigateUrl(String(d.url || ''));
          onThinkingEvent?.({
            type: 'browser_url_committed',
            tool_name: 'browser_navigate',
            url: navUrl || d.url,
            title: d.title,
            ok: d.verified === true,
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('iam-browser-url-committed', {
                detail: {
                  url: navUrl || d.url,
                  title: d.title,
                  verified: d.verified !== false,
                  session_id: d.session_id,
                  live_view_url: d.live_view_url,
                  agent_run_id: d.agent_run_id,
                  smoke_debug: d.smoke_debug ?? null,
                },
              }),
            );
          }
          if (navUrl && d.verified === true && !/\/api\/r2\/file\b/i.test(navUrl)) {
            onBrowserNavigate?.({
              type: 'browser_navigate',
              url: navUrl,
              automation: true,
              agent_live: true,
              live_view_url: d.live_view_url,
              session_id: d.session_id,
              title: d.title,
              verified: true,
            } as Parameters<NonNullable<typeof onBrowserNavigate>>[0] & { verified?: boolean });
          }
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'browser_navigate' &&
          typeof (data as { url?: string }).url === 'string'
        ) {
          const d = data as {
            url: string;
            screenshot_url?: string;
            page_text?: string;
            title?: string;
          };
          const navUrl = sanitizeBrowserNavigateUrl(String(d.url));
          if (navUrl && !/\/api\/r2\/file\b/i.test(navUrl)) {
            onBrowserNavigate?.({
              type: 'browser_navigate',
              url: navUrl,
              agent_live: Boolean(activeAgentRunId),
              automation: Boolean(activeAgentRunId),
              page_text: typeof d.page_text === 'string' ? d.page_text : undefined,
              title: typeof d.title === 'string' ? d.title : undefined,
            } as Parameters<NonNullable<typeof onBrowserNavigate>>[0] & {
              agent_live?: boolean;
            });
          }
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'tool_start') {
          const d = data as {
            type: 'tool_start';
            tool_name?: string;
            node_key?: string;
            tool_call_id?: string;
            input_preview?: string | null;
          };
          const tn = String(d.tool_name || d.node_key || '');
          onThinkingEvent?.({ type: 'tool_start', tool_name: tn });
          patchIamAgentStreamDebug({ last_tool_name: tn || null });
          pendingBrowserToolUrl = null;
          pendingBrowserToolAutomation = false;
          lastBrowserToolOutputChunk = null;
          lastBrowserScreenshotOutputChunk = null;
          activeBrowserScreenshotTool = isBrowserScreenshotToolName(tn);
          activeBrowserNavTool =
            !activeBrowserScreenshotTool &&
            (tn === 'browser_open_url' || tn === 'cdt_navigate_page' || tn === 'browser_navigate');
          if (activeBrowserNavTool) {
            try {
              const inp = JSON.parse(String(d.input_preview || '{}')) as Record<string, unknown>;
              const u =
                (typeof inp.url === 'string' && inp.url.trim()) ||
                (typeof inp.href === 'string' && inp.href.trim()) ||
                (typeof inp.target_url === 'string' && inp.target_url.trim()) ||
                (typeof inp.page_url === 'string' && inp.page_url.trim()) ||
                '';
              if (u) pendingBrowserToolUrl = sanitizeBrowserNavigateUrl(u) || u;
              pendingBrowserToolAutomation =
                parseBrowserToolAutomationFlag(inp) || isCdtBrowserToolName(tn);
              if (typeof window !== 'undefined' && pendingBrowserToolUrl) {
                window.dispatchEvent(
                  new CustomEvent('iam-browser-url-pending', {
                    detail: { url: pendingBrowserToolUrl, tool_call_id: d.tool_call_id ?? null },
                  }),
                );
              }
            } catch {
              /* ignore */
            }
          }
          if (
            typeof window !== 'undefined' &&
            (tn.startsWith('cdt_') || tn.startsWith('browser_') || tn === 'playwright_screenshot')
          ) {
            window.dispatchEvent(
              new CustomEvent('iam:agent-browser-tool-active', {
                detail: { tool_name: tn, phase: 'start' },
              }),
            );
          }
          if (typeof window !== 'undefined' && isAgentLiveBrowserToolName(tn)) {
            const toolUrl =
              pendingBrowserToolUrl || parseBrowserToolUrlFromInput(d.input_preview) || null;
            window.dispatchEvent(
              new CustomEvent('iam:agent-open-surface', {
                detail: {
                  surface: 'browser',
                  agent_live: true,
                  ...(toolUrl ? { url: toolUrl } : {}),
                },
              }),
            );
            if (!browserAgentLiveSurfaced) {
              browserAgentLiveSurfaced = true;
              window.dispatchEvent(
                new CustomEvent('iam-browser-agent-live', {
                  detail: {
                    url: toolUrl || 'about:blank',
                    agent_run_id: activeAgentRunId || undefined,
                  },
                }),
              );
            }
          }
          const toolCallId =
            typeof d.tool_call_id === 'string' && d.tool_call_id.trim() ? d.tool_call_id.trim() : null;
          const rowId = toolCallId || `sse-tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          activeToolTraceId = rowId;
          lastActiveToolOutputChunk = null;
          const isSql =
            !!d.tool_name &&
            (d.tool_name.includes('d1') || d.tool_name.includes('sql') || d.tool_name.includes('query'));
          const preview = d.input_preview != null ? String(d.input_preview) : '';
          const { summaryLines, detailsJson } = formatToolTraceInput(tn, preview);
          const startIntegrationLabel =
            /terminal|mcp/i.test(tn) && tn.includes('mcp')
              ? 'inneranimalmedia-mcp-server'
              : /terminal/.test(tn)
                ? 'Agent Sam'
                : undefined;
          setMessages((prev) => upsertAssistantTail(prev, { content: assistantContent, executionPlan }));
          setToolTraceRows?.((prev) => [
            ...prev,
            {
              id: rowId,
              toolCallId: toolCallId || rowId,
              toolName: d.tool_name || 'tool',
              status: 'running',
              lines: summaryLines,
              detailsJson,
              integrationLabel: startIntegrationLabel,
              startedAtLabel: new Date().toLocaleTimeString(),
              isSql,
            },
          ]);
          if (tn) {
            setWorkflowLedger((prev) => (prev.runId ? { ...prev, currentNodeKey: tn } : prev));
          }
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'tool_error') {
          const d = data as { type?: string; tool?: string; tool_call_id?: string; error?: string };
          const rawMsg = String(d.error || 'tool_error').slice(0, 4000);
          const toolLabel = String(d.tool || 'tool');
          const normalized = normalizeBrowserToolErrorMessage(toolLabel, rawMsg);
          let closedRowId: string | null = null;
          setToolTraceRows?.((prev) => {
            closedRowId = resolveToolTraceRowId(prev, d.tool_call_id, activeToolTraceId, toolLabel);
            const traceLine = `${normalized.short}${normalized.detail !== rawMsg ? `\n${normalized.detail}` : ''}`;
            if (closedRowId && prev.some((r) => r.id === closedRowId)) {
              return prev.map((r) =>
                r.id === closedRowId
                  ? {
                      ...r,
                      status: 'error' as const,
                      lines: [...r.lines, `[${toolLabel}] ${traceLine}`],
                    }
                  : r,
              );
            }
            const id = d.tool_call_id?.trim() || `sse-tool-err-${Date.now()}`;
            return [
              ...prev,
              {
                id,
                toolCallId: id,
                toolName: toolLabel,
                status: 'error',
                lines: [traceLine],
                startedAtLabel: new Date().toLocaleTimeString(),
              },
            ];
          });
          if (closedRowId && activeToolTraceId === closedRowId) activeToolTraceId = null;
          onThinkingEvent?.({ type: 'tool_error', tool_name: toolLabel });
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.length - 1;
            if (idx < 0 || next[idx].role !== 'assistant') return prev;
            const ig = next[idx].imageGenerationState;
            if (!ig || ig.phase === 'completed') return prev;
            next[idx] = {
              ...next[idx],
              imageGenerationState: {
                ...ig,
                phase: 'failed',
                failed: true,
                progress: ig.progress,
                message: 'Image generation failed',
              },
            };
            return next;
          });
          activeToolTraceId = null;
          pendingBrowserToolUrl = null;
          pendingBrowserToolAutomation = false;
          lastBrowserToolOutputChunk = null;
          lastBrowserScreenshotOutputChunk = null;
          activeBrowserNavTool = false;
          activeBrowserScreenshotTool = false;
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'tool_output' &&
          typeof (data as { chunk?: unknown }).chunk === 'string'
        ) {
          const d = data as { type: 'tool_output'; chunk: string };
          if (activeBrowserNavTool) {
            lastBrowserToolOutputChunk = d.chunk;
          }
          if (activeBrowserScreenshotTool) {
            lastBrowserScreenshotOutputChunk = d.chunk;
          }
          lastActiveToolOutputChunk = d.chunk;
          const chunkToolName =
            typeof (d as { tool_name?: string }).tool_name === 'string'
              ? (d as { tool_name: string }).tool_name
              : '';
          const chunkJobId = chunkToolName
            ? resolveCadJobIdFromSse(chunkToolName, { chunk: d.chunk })
            : null;
          setToolTraceRows?.((prev) => {
            const patchRow = (r: AgentToolTraceRow) => {
              if (!chunkToolName) return r;
              if (r.id !== activeToolTraceId && r.toolName !== chunkToolName) return r;
              return patchTraceRowCadJob(r, chunkToolName, {
                jobId: chunkJobId,
                outputPreview: d.chunk,
              });
            };
            if (activeToolTraceId) {
              return prev.map((r) =>
                r.id === activeToolTraceId
                  ? { ...patchRow(r), lines: [...r.lines, d.chunk] }
                  : r,
              );
            }
            if (!prev.length) return prev;
            const last = prev[prev.length - 1];
            if (last.status === 'running') {
              return prev.map((r, i) =>
                i === prev.length - 1 ? { ...patchRow(r), lines: [...r.lines, d.chunk] } : r,
              );
            }
            return prev;
          });
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'tool_done') {
          const d = data as {
            type: 'tool_done';
            tool_name?: string;
            node_key?: string;
            tool_call_id?: string;
            status?: string;
            ok?: boolean;
            output_preview?: string;
            duration_ms?: number;
            rows?: Record<string, unknown>[] | null;
            error?: string;
            artifact_type?: string;
            artifact_id?: string;
            public_url?: string | null;
            job_id?: string;
            cad_job_id?: string;
            cad_job_live?: boolean;
          };
          const doneToolName = String(d.tool_name || d.node_key || '');
          const doneOk =
            d.status != null ? d.status !== 'error' : d.ok !== false;
          const outputPreview =
            typeof d.output_preview === 'string'
              ? d.output_preview
              : lastActiveToolOutputChunk ||
                lastBrowserToolOutputChunk ||
                lastBrowserScreenshotOutputChunk;
          const receiptMeta = parseToolTraceReceiptMeta(doneToolName, outputPreview);
          const integrationLabel =
            /terminal|mcp/i.test(doneToolName) && doneToolName.includes('mcp')
              ? 'inneranimalmedia-mcp-server'
              : /terminal/.test(doneToolName)
                ? 'Agent Sam'
                : undefined;
          const { summaryLines, detailsJson: outputDetailsJson } = formatToolTraceOutput(
            doneToolName,
            outputPreview,
          );
          let parsedSqlRows = d.rows ?? undefined;
          if (!parsedSqlRows && outputPreview) {
            try {
              const parsedOut = JSON.parse(outputPreview) as { rows?: Record<string, unknown>[] };
              if (Array.isArray(parsedOut?.rows)) parsedSqlRows = parsedOut.rows;
            } catch {
              /* ignore */
            }
          }
          let smokeDebug: Record<string, unknown> | null = null;
          try {
            const parsed = outputPreview ? JSON.parse(outputPreview) : null;
            if (parsed && typeof parsed === 'object' && parsed.smoke_debug) {
              smokeDebug = parsed.smoke_debug as Record<string, unknown>;
            }
          } catch {
            /* ignore */
          }
          onThinkingEvent?.({
            type: 'tool_done',
            tool_name: doneToolName,
            ok: doneOk,
            output_preview:
              summaryLines.join(' · ') ||
              (d.error ? String(d.error).slice(0, 120) : undefined),
          });
          const rawToolOutput =
            typeof d.output_preview === 'string'
              ? d.output_preview
              : outputPreview || lastActiveToolOutputChunk;
          const cadJobId = resolveCadJobIdFromSse(doneToolName, {
            job_id: d.job_id,
            cad_job_id: d.cad_job_id,
            output_preview: rawToolOutput,
            chunk: lastActiveToolOutputChunk,
          });
          const cadJobLive =
            d.cad_job_live === true ||
            (cadJobId != null && cadJobOutputLooksInFlight(doneToolName, rawToolOutput));
          if (doneOk && typeof window !== 'undefined') {
            if (cadJobId) {
              window.dispatchEvent(
                new CustomEvent(IAM_DESIGNSTUDIO_CAD_JOB, { detail: { job_id: cadJobId } }),
              );
            }
          }
          if (
            d.status !== 'error' &&
            d.tool_name === 'excalidraw_plan_map_create' &&
            d.artifact_type === 'excalidraw' &&
            typeof d.artifact_id === 'string' &&
            d.artifact_id.trim()
          ) {
            const loadUrl =
              typeof d.public_url === 'string' && d.public_url.trim()
                ? d.public_url.trim()
                : `/api/artifacts/${encodeURIComponent(d.artifact_id.trim())}/content`;
            window.dispatchEvent(
              new CustomEvent('iam:agent-open-surface', {
                detail: {
                  surface: 'excalidraw',
                  reason: 'excalidraw_plan_map_tool_done',
                  load_url: loadUrl,
                  artifact_id: d.artifact_id.trim(),
                  artifact_type: 'excalidraw',
                },
              }),
            );
          }
          if (
            doneOk &&
            (doneToolName === 'browser_open_url' ||
              doneToolName === 'cdt_navigate_page' ||
              doneToolName === 'browser_navigate')
          ) {
            /* BrowserView URL updates from browser_url_committed (verified), not optimistic tool_done. */
            pendingBrowserToolUrl = null;
            pendingBrowserToolAutomation = false;
            lastBrowserToolOutputChunk = null;
            activeBrowserNavTool = false;
          } else if (
            doneToolName === 'browser_open_url' ||
            doneToolName === 'cdt_navigate_page' ||
            doneToolName === 'browser_navigate'
          ) {
            pendingBrowserToolUrl = null;
            pendingBrowserToolAutomation = false;
            lastBrowserToolOutputChunk = null;
            activeBrowserNavTool = false;
          }
          if (doneOk && isBrowserScreenshotToolName(doneToolName)) {
            const shotUrl =
              parseScreenshotUrlFromToolPayload(
                typeof d.output_preview === 'string' ? d.output_preview : null,
              ) ||
              parseScreenshotUrlFromToolPayload(lastBrowserScreenshotOutputChunk) ||
              (typeof d.public_url === 'string' && /^https?:/i.test(d.public_url.trim())
                ? d.public_url.trim()
                : null);
            if (shotUrl && typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('iam-browser-screenshot', {
                  detail: { screenshot_url: shotUrl, tool_name: doneToolName },
                }),
              );
            }
            lastBrowserScreenshotOutputChunk = null;
            activeBrowserScreenshotTool = false;
          } else if (isBrowserScreenshotToolName(doneToolName)) {
            lastBrowserScreenshotOutputChunk = null;
            activeBrowserScreenshotTool = false;
          }
          let closedRowId: string | null = null;
          setToolTraceRows?.((prev) => {
            closedRowId = resolveToolTraceRowId(
              prev,
              d.tool_call_id,
              activeToolTraceId,
              doneToolName,
            );
            if (!closedRowId || !prev.some((r) => r.id === closedRowId)) return prev;
            return prev.map((r) =>
              r.id === closedRowId
                ? patchTraceRowCadJob(
                    {
                      ...r,
                      status:
                        d.status === 'error' || !doneOk
                          ? 'error'
                          : cadJobLive
                            ? 'running'
                            : 'done',
                      durationMs: d.duration_ms,
                      sqlRows: parsedSqlRows ?? undefined,
                      isSql:
                        r.isSql ||
                        /d1|sql|query/i.test(doneToolName),
                      integrationLabel: integrationLabel ?? r.integrationLabel,
                      connectionResolution:
                        receiptMeta?.connectionResolution ?? r.connectionResolution,
                      connectionId: receiptMeta?.connectionId ?? r.connectionId,
                      execHost: receiptMeta?.execHost ?? r.execHost,
                      lines:
                        d.status === 'error' && d.error
                          ? [...summaryLines, String(d.error).slice(0, 4000)]
                          : summaryLines.length
                            ? summaryLines
                            : r.lines,
                      detailsJson: r.detailsJson,
                      outputDetailsJson: outputDetailsJson ?? r.outputDetailsJson,
                      smokeDebug: smokeDebug ?? r.smokeDebug,
                    },
                    doneToolName,
                    {
                      jobId: cadJobId,
                      outputPreview: rawToolOutput,
                      cadJobLive: cadJobLive,
                    },
                  )
                : r,
            );
          });
          if (closedRowId && activeToolTraceId === closedRowId) activeToolTraceId = null;
          lastActiveToolOutputChunk = null;
        }
        if (data && typeof data === 'object' && 'conversation_id' in data) {
          const cid = (data as { conversation_id?: string }).conversation_id;
          if (typeof cid === 'string' && cid) {
            activeConversationId = cid;
            setConversationId(cid);
            // Persist id immediately, but defer URL navigate until the stream ends.
            // Navigating /agent/new → /agent/{id} mid-SSE force-hydrates the tab and
            // cancels the fetch (image gen pick_model runs server-side; UI never sees it).
            try {
              localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, cid);
            } catch {
              /* ignore */
            }
            void loadSessions();
            notifyAgentChatSessionsRefresh(cid);
            pendingConversationUrlSync = cid;
          }
        }
        const delta = normalizeAssistantSseText(data);
        if (!delta && ssePayloadLooksReasoningOnly(data)) {
          if (!fileEchoSuppress) {
            emptyRun += 1;
            if (emptyRun >= MAX_EMPTY_RUN) {
              stopStreamForSafety('max_empty_run');
              break sseLoop;
            }
          }
        } else if (delta) {
          emptyRun = 0;
          if (typeof window !== 'undefined') {
            const dbg = window.__IAM_AGENT_LAST_STREAM_DEBUG;
            if (dbg && dbg.first_text_at == null) {
              patchIamAgentStreamDebug({ first_text_at: Date.now() });
            }
          }
        }
        const sseText = normalizeAssistantSseText(data);
        const trialBuf = assistantStreamBuf + sseText;
        const extracted = extractMonacoInvokesFromBuffer(trialBuf);
        const nextBuf = extracted.text;
        const nextVisible = hideIncompleteMonacoInvokeTail(nextBuf);

        if (!fileEchoSuppress && looksLikeEmbeddedFileDumpStart(nextVisible)) {
          fileEchoSuppress = true;
          if (typeof window !== 'undefined') {
            patchIamAgentStreamDebug({ artifact_echo_suppress: true, artifact_echo_at: Date.now() });
          }
        }

        // Always accumulate — artifact/HTML must reach code-block + monaco invoke handlers even when chat echo is suppressed.
        assistantStreamBuf = nextBuf;

        for (const f of extracted.files) {
          try {
            if (/\.py$/i.test(f.name)) {
              onPythonDraftOpened?.(f.name);
            }
            onFileSelect?.({ name: f.name, content: f.content, originalContent: '' });
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('iam:agent-open-surface', {
                  detail: { surface: 'code', reason: 'monaco_invoke' },
                }),
              );
            }
          } catch (e) {
            console.warn('[ChatAssistant] onFileSelect failed for monaco invoke', e);
          }
        }

        if (!fileEchoSuppress) {
          assistantContent = truncateCodeFencesForChat(nextVisible, 200);
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
        }
      }
    }
  }
  } finally {
    clearIdleTimer();
    if (pendingConversationUrlSync && !signal.aborted) {
      replaceAgentConversationUrl(pendingConversationUrlSync);
    }
  }

  if (typeof window !== 'undefined' && window.__IAM_AGENT_LAST_STREAM_DEBUG) {
    patchIamAgentStreamDebug({
      assistant_text_length: assistantContent.length,
      assistant_stream_buf_length: assistantStreamBuf.length,
      file_echo_suppress: fileEchoSuppress,
    });
  }

  if (!assistantContent.trim() && !fileEchoSuppress) {
    if (doneReceived) {
      // Image / artifact turns are the reply — don't inject a false "no reply" line.
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          const ig = last.imageGenerationState;
          if (
            ig &&
            (ig.phase === 'completed' ||
              ig.phase === 'failed' ||
              Boolean(ig.previewUrl || ig.imageUrl || ig.previewFrames?.length))
          ) {
            return prev;
          }
          if (last.previewArtifacts?.length || last.emailArtifact) return prev;
        }
        assistantContent =
          'Agent finished without a visible reply. Try Ask mode for quick questions, or send again.';
        if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: assistantContent };
        else next.push({ role: 'assistant', content: assistantContent });
        return next;
      });
    } else {
      setMessages((prev) => stripEmptyAssistantTail(prev));
    }
  }

  const fullStreamText = hideIncompleteMonacoInvokeTail(assistantStreamBuf);
  const artifactExtractionSource = fileEchoSuppress ? fullStreamText : assistantContent;

  if (fileEchoSuppress) {
    const preview = truncateCodeFencesForChat(fullStreamText, 200);
    assistantContent =
      preview.trim() ||
      'Writing file… (full content opens in the editor or artifacts when the stream completes.)';
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: assistantContent };
      return next;
    });
  }

  // Enforce chat preview rule: cap code fences to ~10 lines.
  // Full content is still opened via monaco invokes / monaco_file_generated / code-block extraction below.
  const truncatedForChat = truncateCodeFencesForChat(assistantContent, 200);
  if (truncatedForChat !== assistantContent) {
    assistantContent = truncatedForChat;
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: assistantContent };
      return next;
    });
  }

  const codeBlockRegex2 = /```(\w+)?\n([\s\S]*?)\n```/g;
  let firstMatch = codeBlockRegex2.exec(artifactExtractionSource);
  if (firstMatch) {
    const lang = firstMatch[1] || 'txt';
    const code = firstMatch[2];
    const isShell = ['sh', 'bash', 'zsh', 'shell'].includes(lang);
    if (!isShell && (code.split('\n').length > 5 || code.length > 200) && onFileSelect) {
      const ext = extForStreamOutput(lang);
      onFileSelect({ name: `agent_output.${ext}`, content: code });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('iam:agent-open-surface', {
            detail: { surface: 'code', reason: 'assistant_code_block' },
          }),
        );
      }
    }
  }
}
