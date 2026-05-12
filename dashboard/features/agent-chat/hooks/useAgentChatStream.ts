/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized SSE body consumer for POST /api/agent/chat (ReadableStreamDefaultReader).
 */

import type React from 'react';
import { LS_AGENT_CHAT_CONVERSATION_ID } from '../../../agentChatConstants';
import type { ExecPanelState, Message, ToolApprovalPayload, WorkflowLedgerState } from '../types';
import {
  extractMonacoInvokesFromBuffer,
  hideIncompleteMonacoInvokeTail,
  looksLikeEmbeddedFileDumpStart,
  looksLikeRawProviderLeak,
  normalizeAssistantSseText,
  ssePayloadLooksReasoningOnly,
  isStreamErrorPayload,
} from '../streamParsing';

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

export type ConsumeAgentChatSseContext = {
  signal: AbortSignal;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  streamFinalizedRef: React.MutableRefObject<boolean>;
  streamReaderRef: React.MutableRefObject<ReadableStreamDefaultReader<Uint8Array> | null>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkflowLedger: React.Dispatch<React.SetStateAction<WorkflowLedgerState>>;
  setExecPanel: React.Dispatch<React.SetStateAction<ExecPanelState>>;
  setConversationId: React.Dispatch<React.SetStateAction<string>>;
  stripEmptyAssistantTail: (prev: Message[]) => Message[];
  loadSessions: () => void;
  onBrowserNavigate?: (event: { type: 'browser_navigate'; url: string }) => void;
  onR2FileUpdated?: (event: { type: 'r2_file_updated'; bucket: string; key: string }) => void;
  onFileSelect?: (file: { name: string; content: string; originalContent?: string }) => void;
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
    setExecPanel,
    setConversationId,
    stripEmptyAssistantTail,
    loadSessions,
    onBrowserNavigate,
    onR2FileUpdated,
    onFileSelect,
    onToolApprovalRequest,
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

  if (!mergeIntoLastAssistant) {
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
        } catch {
          continue;
        }
        if (signal.aborted) break sseLoop;

        const evType = (data as { type?: string }).type;
        if (evType === 'done') {
          if (!streamFinalizedRef.current) {
            streamFinalizedRef.current = true;
            setIsLoading(false);
          }
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
        if (
          data &&
          typeof data === 'object' &&
          ((data as { type?: string }).type === 'capability_selected' ||
            (data as { type?: string }).type === 'agent_capability_selected')
        ) {
          const d = data as { decision?: Record<string, unknown> };
          const dec = d.decision;
          if (dec && typeof dec === 'object') {
            const intent = String(dec.intent ?? '—');
            const surf = String(dec.default_surface ?? 'chat');
            const b = dec.should_use_browser ? 'yes' : 'no';
            assistantStreamBuf += `\n\n_Capabilities:_ **${intent}** · surface **${surf}** · browser=${b}\n`;
            assistantContent = assistantStreamBuf;
            setMessages((prev) => {
              const last = [...prev];
              last[last.length - 1] = { role: 'assistant', content: assistantContent };
              return last;
            });
          }
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          ((data as { type?: string }).type === 'surface_open' ||
            (data as { type?: string }).type === 'agent_surface_open')
        ) {
          const d = data as { surface?: string; url?: string; reason?: string };
          window.dispatchEvent(
            new CustomEvent('iam:agent-open-surface', {
              detail: { surface: d.surface, url: d.url, reason: d.reason },
            }),
          );
          if (d.surface === 'browser' && typeof d.url === 'string' && d.url.trim()) {
            onBrowserNavigate?.({ type: 'browser_navigate', url: d.url.trim() });
          }
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'plan_thinking') {
          const d = data as { type: string; message?: string };
          assistantStreamBuf += `\n\n_${String(d.message || 'Planning…')}_\n`;
          assistantContent = assistantStreamBuf;
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
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
          assistantStreamBuf += `\n\n**Approval required:** ${String(d.title || 'Terminal')} (${String(d.risk_level || 'medium')})\n\`\`\`bash\n${String(d.command_preview || '').slice(0, 1500)}\n\`\`\`\n`;
          assistantContent = assistantStreamBuf;
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'plan_created') {
          const d = data as {
            type: string;
            plan_title?: string;
            task_count?: number;
            tasks?: Array<{ id: string; title: string; order_index: number; handler_type?: string | null }>;
          };
          const lines = (d.tasks || []).map(
            (t, i) =>
              `${i + 1}. [ ] **${String(t.title || '').slice(0, 200)}** _(${String(t.handler_type || 'agent')})_`,
          );
          assistantStreamBuf += `\n\n### ${String(d.plan_title || 'Plan')}\n_${Number(d.task_count || lines.length)} tasks_\n\n${lines.join('\n')}\n`;
          assistantContent = assistantStreamBuf;
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'task_start') {
          const d = data as { type: string; title?: string; order_index?: number; handler_type?: string };
          assistantStreamBuf += `\n- **Running** (#${Number(d.order_index ?? 0) + 1}) ${String(d.title || '')} _${String(d.handler_type || '')}_\n`;
          assistantContent = assistantStreamBuf;
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'task_complete') {
          const d = data as {
            type: string;
            title?: string;
            status?: string;
            output?: string;
            error?: string;
            order_index?: number;
          };
          const tag = d.status === 'done' ? 'Done' : d.status === 'skipped' ? 'Skipped' : 'Failed';
          const detail = String(d.output || d.error || '').slice(0, 1200);
          assistantStreamBuf += `\n  → **${tag}** (#${Number(d.order_index ?? 0) + 1}) ${String(d.title || '')}${detail ? ` — ${detail}` : ''}\n`;
          assistantContent = assistantStreamBuf;
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
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
          assistantStreamBuf += `\n\n_Resume ${String(d.status || 'finished')}: ${Number(d.tasks_completed || 0)} completed, ${Number(d.tasks_failed || 0)} failed, ${Number(d.tasks_skipped || 0)} skipped._\n`;
          assistantContent = assistantStreamBuf;
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
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
          assistantStreamBuf += `\n\n_Plan ${String(d.status || 'finished')}: ${Number(d.tasks_completed || 0)} completed, ${Number(d.tasks_failed || 0)} failed, ${Number(d.tasks_skipped || 0)} skipped._\n`;
          assistantContent = assistantStreamBuf;
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'workflow_start') {
          const w = data as {
            type: string;
            run_id?: string;
            steps_total?: number | null;
            workflow_key?: string;
          };
          if (typeof w.workflow_key === 'string' && w.workflow_key.trim()) {
            assistantStreamBuf += `\n\n_Workflow:_ **${w.workflow_key.trim()}** …\n`;
            assistantContent = assistantStreamBuf;
            setMessages((prev) => {
              const last = [...prev];
              last[last.length - 1] = { role: 'assistant', content: assistantContent };
              return last;
            });
          }
          setWorkflowLedger((prev) => ({
            ...prev,
            runId: typeof w.run_id === 'string' ? w.run_id : prev.runId,
            stepsTotal: w.steps_total != null ? Number(w.steps_total) : prev.stepsTotal,
            lastError: null,
          }));
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'workflow_step') {
          const w = data as {
            type: string;
            run_id?: string;
            node_key?: string;
            current_node_key?: string;
            steps_completed?: number;
            steps_total?: number;
            cost_usd?: number;
            input_tokens?: number;
            output_tokens?: number;
            ok?: boolean;
          };
          const nk =
            (typeof w.current_node_key === 'string' && w.current_node_key) ||
            (typeof w.node_key === 'string' && w.node_key) ||
            '';
          if (nk) {
            const st = w.ok === false ? 'failed' : 'ok';
            assistantStreamBuf += `\n_Step ${nk}:_ ${st}\n`;
            assistantContent = assistantStreamBuf;
            setMessages((prev) => {
              const last = [...prev];
              last[last.length - 1] = { role: 'assistant', content: assistantContent };
              return last;
            });
          }
          setWorkflowLedger((prev) => ({
            ...prev,
            runId: typeof w.run_id === 'string' ? w.run_id : prev.runId,
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
          const w = data as { type: string; run_id?: string; message?: string; status?: string };
          setWorkflowLedger((prev) => ({
            ...prev,
            runId: typeof w.run_id === 'string' ? w.run_id : prev.runId,
            lastError: w.type === 'workflow_error' ? String(w.message || 'workflow_error') : null,
          }));
          const tag =
            w.type === 'workflow_complete'
              ? 'complete'
              : w.type === 'workflow_approval_required'
                ? 'approval'
                : 'error';
          assistantStreamBuf += `\n\n_Workflow ${tag}:_ ${String(w.message || w.status || '').slice(0, 800)}\n`;
          assistantContent = assistantStreamBuf;
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
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
          assistantStreamBuf += `\n[FILE_CREATED:${r2evt.key}]\n`;
          assistantContent = assistantStreamBuf;
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'browser_navigate' &&
          typeof (data as { url?: string }).url === 'string'
        ) {
          onBrowserNavigate?.(data as { type: 'browser_navigate'; url: string });
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'tool_start') {
          const d = data as { type: 'tool_start'; tool_name?: string; input_preview?: string | null };
          setExecPanel({
            tool_name: d.tool_name || 'tool',
            status: 'running',
            lines: [d.input_preview ?? ''],
            started: new Date().toLocaleTimeString(),
            is_sql:
              !!d.tool_name &&
              (d.tool_name.includes('d1') || d.tool_name.includes('sql') || d.tool_name.includes('query')),
          });
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'tool_error') {
          const d = data as { type?: string; tool?: string; error?: string };
          const msg = String(d.error || 'tool_error').slice(0, 4000);
          setExecPanel((p) =>
            p
              ? {
                  ...p,
                  status: 'error',
                  lines: [...p.lines, `[${d.tool || 'tool'}] ${msg}`],
                }
              : {
                  tool_name: String(d.tool || 'tool'),
                  status: 'error',
                  lines: [msg],
                  started: new Date().toLocaleTimeString(),
                  is_sql: String(d.tool || '').includes('d1'),
                },
          );
          assistantStreamBuf += `\n\n_Tool error (${String(d.tool || 'tool')}):_ ${msg}\n`;
          assistantContent = assistantStreamBuf;
          setMessages((prev) => {
            const last = [...prev];
            last[last.length - 1] = { role: 'assistant', content: assistantContent };
            return last;
          });
          continue;
        }
        if (
          data &&
          typeof data === 'object' &&
          (data as { type?: string }).type === 'tool_output' &&
          typeof (data as { chunk?: unknown }).chunk === 'string'
        ) {
          const d = data as { type: 'tool_output'; chunk: string };
          setExecPanel((p) => (p ? { ...p, lines: [...p.lines, d.chunk] } : p));
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'tool_done') {
          const d = data as {
            type: 'tool_done';
            status?: string;
            duration_ms?: number;
            rows?: Record<string, unknown>[] | null;
            error?: string;
          };
          setExecPanel((p) =>
            p
              ? {
                  ...p,
                  status: d.status === 'error' ? 'error' : 'done',
                  duration_ms: d.duration_ms,
                  sql_rows: d.rows ?? undefined,
                  lines:
                    d.status === 'error' && d.error
                      ? [...p.lines, String(d.error).slice(0, 4000)]
                      : p.lines,
                }
              : p,
          );
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
                onFileSelect?.({ name: f.name, content: f.content, originalContent: '' });
              } catch (e) {
                console.warn('[ChatAssistant] onFileSelect failed for monaco invoke', e);
              }
            }
            assistantContent = nextVisible;
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

  const codeBlockRegex2 = /```(\w+)?\n([\s\S]*?)\n```/g;
  let firstMatch = codeBlockRegex2.exec(assistantContent);
  if (firstMatch) {
    const lang = firstMatch[1] || 'txt';
    const code = firstMatch[2];
    const isShell = ['sh', 'bash', 'zsh', 'shell'].includes(lang);
    if (!isShell && (code.split('\n').length > 5 || code.length > 200) && onFileSelect) {
      const ext = extForStreamOutput(lang);
      onFileSelect({ name: `agent_output.${ext}`, content: code });
    }
  }
}
