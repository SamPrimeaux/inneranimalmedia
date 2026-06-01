/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized SSE body consumer for POST /api/agent/chat (ReadableStreamDefaultReader).
 */

import type React from 'react';
import { LS_AGENT_CHAT_CONVERSATION_ID } from '../../../agentChatConstants';
import type {
  Message,
  ToolApprovalPayload,
  WorkflowLedgerState,
  AgentPreviewArtifact,
  AgentPreviewArtifactKind,
  ExecutionPlanState,
  ExecutionPlanTask,
  ImageGenerationState,
} from '../types';
import type { AgentToolTraceRow } from '../execution/types';
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

function truncateLines(text: string, maxLines: number): { head: string; truncated: boolean; total: number } {
  const lines = String(text || '').split('\n');
  if (lines.length <= maxLines) return { head: String(text || ''), truncated: false, total: lines.length };
  return { head: lines.slice(0, maxLines).join('\n'), truncated: true, total: lines.length };
}

function truncateCodeFencesForChat(text: string, maxLines = 10): string {
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

function mapTaskCompleteStatus(status: string | undefined): ExecutionPlanTask['status'] {
  if (status === 'done') return 'done';
  if (status === 'skipped') return 'skipped';
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
    next[idx] = { ...next[idx], content: assistantContent, imageGenerationState: merged };
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
      if (typeof c === 'string' && c.trim() && /^https?:/i.test(c.trim())) return c.trim();
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
  /** First SSE context payload — lifts `agentsam_agent_run.id` to host (BrowserView playwright metadata). */
  onAgentRunContext?: (agentRunId: string | null) => void;
  onBrowserNavigate?: (event: {
    type: 'browser_navigate';
    url: string;
    automation?: boolean;
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
    onAgentRunContext,
    mergeIntoLastAssistant = false,
    initialAssistantBuffer = '',
  } = ctx;

  const decoder = new TextDecoder();
  let assistantContent = '';
  let assistantStreamBuf = mergeIntoLastAssistant ? String(initialAssistantBuffer || '') : '';
  let sseCarry = '';
  let fileEchoSuppress = false;

  const streamStartedAt = Date.now();
  let readCount = 0;
  let emptyRun = 0;
  const MAX_STREAM_MS = 900000;
  const MAX_READS = 2000;
  const MAX_EMPTY_RUN = 200;

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
  let activeBrowserScreenshotTool = false;
  let executionPlan: ExecutionPlanState | null = null;

  const pushExecutionPlan = (next: ExecutionPlanState | null) => {
    executionPlan = next;
    setMessages((prev) => {
      const last = [...prev];
      const idx = last.length - 1;
      if (idx < 0 || last[idx].role !== 'assistant') return prev;
      last[idx] = { ...last[idx], content: assistantContent, executionPlan: next };
      return last;
    });
  };

  if (!mergeIntoLastAssistant) {
    activeToolTraceId = null;
    setToolTraceRows?.([]);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
  }
  assistantContent = assistantStreamBuf;

  sseLoop: while (true) {
    if (signal.aborted) break sseLoop;
    if (Date.now() - streamStartedAt > MAX_STREAM_MS || readCount >= MAX_READS || emptyRun >= MAX_EMPTY_RUN) {
      assistantStreamBuf += '\n\n[Stream stopped: exceeded safety limits.]';
      assistantContent = assistantStreamBuf;
      setMessages((prev) => {
        const last = [...prev];
        last[last.length - 1] = { role: 'assistant', content: assistantContent };
        return last;
      });
      break sseLoop;
    }

    const { done, value } = await reader.read();
    readCount += 1;
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
        if (typeof evType === 'string' && evType.startsWith('agentsam_subagent_') && data && typeof data === 'object') {
          // Multitask emits structured non-text events; surface a short line and
          // reset emptyRun so the stream isn't treated as "stuck".
          emptyRun = 0;
          const d = data as Record<string, unknown>;
          const fanoutId = typeof d.fanout_id === 'string' ? d.fanout_id.trim() : '';
          const slug = typeof d.subagent_slug === 'string' ? d.subagent_slug.trim() : '';
          const status = typeof d.status === 'string' ? d.status.trim() : '';
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
            loadSessions();
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
          patchIamAgentStreamDebug({
            context_event_at: Date.now(),
            context: { ...ctx },
          });
          continue;
        }
        if (evType === 'done') {
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
          }
          continue;
        }
        if (evType === 'thinking_start') {
          onThinkingEvent?.({ type: 'thinking_start' });
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
        if (evType === 'workflow_step') {
          const d = data as { node_key?: string; tool_name?: string; ok?: boolean; output_preview?: string };
          onThinkingEvent?.({ type: 'workflow_step', tool_name: d.node_key || d.tool_name || '', ok: d.ok !== false, output_preview: d.output_preview });
          continue;
        }
        if (evType === 'workflow_complete') {
          onThinkingEvent?.({ type: 'workflow_complete' });
          continue;
        }
        if (evType === 'workflow_error') {
          onThinkingEvent?.({ type: 'workflow_error' });
          continue;
        }
        if (evType === 'approval_required') {
          const d = data as { command_run_id?: string; approval_id?: string };
          onThinkingEvent?.({ type: 'approval_required', command_run_id: d.command_run_id || d.approval_id });
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
              },
            }),
          );
          if (d.surface === 'browser' && typeof d.url === 'string' && d.url.trim()) {
            const navUrl = sanitizeBrowserNavigateUrl(d.url);
            if (navUrl && !/\/api\/r2\/file\b/i.test(navUrl)) {
              onBrowserNavigate?.({ type: 'browser_navigate', url: navUrl });
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
          for (const raw of batch) {
            if (!raw || typeof raw !== 'object') continue;
            const f = raw as {
              filename?: string;
              path?: string;
              language?: string;
              content?: string;
              plan_id?: string;
            };
            const batchPlanId =
              typeof (data as { plan_id?: string }).plan_id === 'string'
                ? (data as { plan_id: string }).plan_id.trim()
                : '';
            const content = typeof f.content === 'string' ? f.content : '';
            const path = typeof f.path === 'string' ? f.path.trim() : '';
            const filename =
              (typeof f.filename === 'string' && f.filename.trim()) ||
              path.split('/').pop() ||
              'untitled';
            const planId =
              (typeof f.plan_id === 'string' && f.plan_id.trim()) || batchPlanId || '';
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
          fileEchoSuppress = true;
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
            status: 'running',
            tasks: planTasks,
            workflow_run_id: d.workflow_run_id ?? null,
          };
          onThinkingEvent?.({
            type: 'plan_created',
            text: `Running task 1 of ${planTasks.length || Number(d.task_count || 0) || '?' }…`,
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
          setMessages((prev) => {
            const last = [...prev];
            const idx = last.length - 1;
            if (idx >= 0 && last[idx].role === 'assistant') {
              last[idx] = {
                ...last[idx],
                content: assistantContent,
                implementationPlan: chip ?? null,
                executionPlan,
              };
            } else {
              last.push({
                role: 'assistant',
                content: assistantContent,
                ...(chip ? { implementationPlan: chip } : {}),
                executionPlan,
              });
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
            summary?: string;
            tasks?: Array<{ title: string; order_index: number }>;
          };
          onThinkingEvent?.({
            type: 'plan_confirmation_required',
            approval_id: d.approval_id ?? '',
            plan_id: d.plan_id ?? '',
            text: d.summary ?? 'Review the plan and confirm to continue.',
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
            });
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
            runId: spineRunId || prev.runId,
            lastError: w.type === 'workflow_error' ? String(w.message || 'workflow_error') : null,
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
              page_text: typeof d.page_text === 'string' ? d.page_text : undefined,
              title: typeof d.title === 'string' ? d.title : undefined,
            });
          }
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'tool_start') {
          const d = data as {
            type: 'tool_start';
            tool_name?: string;
            node_key?: string;
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
          const rowId = `sse-tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          activeToolTraceId = rowId;
          const isSql =
            !!d.tool_name &&
            (d.tool_name.includes('d1') || d.tool_name.includes('sql') || d.tool_name.includes('query'));
          const preview = d.input_preview != null ? String(d.input_preview) : '';
          setToolTraceRows?.((prev) => [
            ...prev,
            {
              id: rowId,
              toolName: d.tool_name || 'tool',
              status: 'running',
              lines: preview ? [preview] : [],
              startedAtLabel: new Date().toLocaleTimeString(),
              isSql,
            },
          ]);
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'tool_error') {
          const d = data as { type?: string; tool?: string; error?: string };
          const rawMsg = String(d.error || 'tool_error').slice(0, 4000);
          const toolLabel = String(d.tool || 'tool');
          const normalized = normalizeBrowserToolErrorMessage(toolLabel, rawMsg);
          setToolTraceRows?.((prev) => {
            const traceLine = `${normalized.short}${normalized.detail !== rawMsg ? `\n${normalized.detail}` : ''}`;
            if (activeToolTraceId && prev.some((r) => r.id === activeToolTraceId)) {
              return prev.map((r) =>
                r.id === activeToolTraceId
                  ? {
                      ...r,
                      status: 'error' as const,
                      lines: [...r.lines, `[${toolLabel}] ${traceLine}`],
                    }
                  : r,
              );
            }
            const id = `sse-tool-err-${Date.now()}`;
            return [
              ...prev,
              {
                id,
                toolName: toolLabel,
                status: 'error',
                lines: [traceLine],
                startedAtLabel: new Date().toLocaleTimeString(),
              },
            ];
          });
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
          setToolTraceRows?.((prev) => {
            if (activeToolTraceId) {
              return prev.map((r) =>
                r.id === activeToolTraceId ? { ...r, lines: [...r.lines, d.chunk] } : r,
              );
            }
            if (!prev.length) return prev;
            const last = prev[prev.length - 1];
            if (last.status === 'running') {
              return prev.map((r, i) =>
                i === prev.length - 1 ? { ...r, lines: [...r.lines, d.chunk] } : r,
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
            status?: string;
            ok?: boolean;
            output_preview?: string;
            duration_ms?: number;
            rows?: Record<string, unknown>[] | null;
            error?: string;
            artifact_type?: string;
            artifact_id?: string;
            public_url?: string | null;
          };
          const doneToolName = String(d.tool_name || d.node_key || '');
          const doneOk =
            d.status != null ? d.status !== 'error' : d.ok !== false;
          onThinkingEvent?.({
            type: 'tool_done',
            tool_name: doneToolName,
            ok: doneOk,
            output_preview:
              typeof d.output_preview === 'string'
                ? d.output_preview
                : d.error
                  ? String(d.error).slice(0, 120)
                  : undefined,
          });
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
            let navUrl = pendingBrowserToolUrl || '';
            if (!navUrl && lastBrowserToolOutputChunk) {
              try {
                const parsed = JSON.parse(lastBrowserToolOutputChunk) as Record<string, unknown>;
                const u =
                  (typeof parsed.url === 'string' && parsed.url.trim()) ||
                  (typeof parsed.result === 'object' &&
                  parsed.result !== null &&
                  typeof (parsed.result as Record<string, unknown>).url === 'string'
                    ? String((parsed.result as Record<string, unknown>).url).trim()
                    : '') ||
                  '';
                if (u) navUrl = u;
              } catch {
                /* ignore */
              }
            }
            const safeNav = sanitizeBrowserNavigateUrl(navUrl);
            if (safeNav && !/\/api\/r2\/file\b/i.test(safeNav)) {
              const preview = parseBrowserNavigatePreview(
                typeof d.output_preview === 'string' ? d.output_preview : lastBrowserToolOutputChunk,
              );
              const automation =
                pendingBrowserToolAutomation ||
                isCdtBrowserToolName(doneToolName) ||
                doneToolName === 'browser_navigate' ||
                Boolean(preview.screenshot_url);
              onBrowserNavigate?.({
                type: 'browser_navigate',
                url: safeNav,
                automation,
                ...preview,
              });
            }
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
          setToolTraceRows?.((prev) => {
            if (!activeToolTraceId || !prev.some((r) => r.id === activeToolTraceId)) return prev;
            return prev.map((r) =>
              r.id === activeToolTraceId
                ? {
                    ...r,
                    status: d.status === 'error' ? 'error' : 'done',
                    durationMs: d.duration_ms,
                    sqlRows: d.rows ?? undefined,
                    lines:
                      d.status === 'error' && d.error
                        ? [...r.lines, String(d.error).slice(0, 4000)]
                        : r.lines,
                  }
                : r,
            );
          });
          activeToolTraceId = null;
        }
        if (data && typeof data === 'object' && 'conversation_id' in data) {
          const cid = (data as { conversation_id?: string }).conversation_id;
          if (typeof cid === 'string' && cid) {
            setConversationId(cid);
            localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, cid);
            void loadSessions();
          }
        }
        const delta = normalizeAssistantSseText(data);
        if (!delta && ssePayloadLooksReasoningOnly(data)) {
          emptyRun += 1;
          if (emptyRun >= MAX_EMPTY_RUN) {
            assistantStreamBuf += '\n\n[Stream stopped: too many non-text chunks.]';
            assistantContent = assistantStreamBuf;
            setMessages((prev) => {
              const last = [...prev];
              last[last.length - 1] = { role: 'assistant', content: assistantContent };
              return last;
            });
            break sseLoop;
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
        if (!fileEchoSuppress) {
          const trialBuf = assistantStreamBuf + normalizeAssistantSseText(data);
          const extracted = extractMonacoInvokesFromBuffer(trialBuf);
          const nextBuf = extracted.text;
          const nextVisible = hideIncompleteMonacoInvokeTail(nextBuf);
          if (looksLikeEmbeddedFileDumpStart(nextVisible)) {
            fileEchoSuppress = true;
          } else {
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
            assistantContent = truncateCodeFencesForChat(nextVisible, 10);
            setMessages((prev) => {
              const last = [...prev];
              last[last.length - 1] = { role: 'assistant', content: assistantContent };
              return last;
            });
          }
        }
      }
    }
  }

  if (typeof window !== 'undefined' && window.__IAM_AGENT_LAST_STREAM_DEBUG) {
    patchIamAgentStreamDebug({
      assistant_text_length: assistantContent.length,
    });
  }

  // Enforce chat preview rule: cap code fences to ~10 lines.
  // Full content is still opened via monaco invokes / monaco_file_generated / code-block extraction below.
  const truncatedForChat = truncateCodeFencesForChat(assistantContent, 10);
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
  let firstMatch = codeBlockRegex2.exec(assistantContent);
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
