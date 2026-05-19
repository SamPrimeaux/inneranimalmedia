/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized SSE body consumer for POST /api/agent/chat (ReadableStreamDefaultReader).
 */

import type React from 'react';
import { LS_AGENT_CHAT_CONVERSATION_ID } from '../../../agentChatConstants';
import type { Message, ToolApprovalPayload, WorkflowLedgerState, AgentPreviewArtifact, AgentPreviewArtifactKind } from '../types';
import type { AgentToolTraceRow } from '../execution/types';
import {
  extractMonacoInvokesFromBuffer,
  hideIncompleteMonacoInvokeTail,
  looksLikeEmbeddedFileDumpStart,
  looksLikeRawProviderLeak,
  normalizeAssistantSseText,
  ssePayloadLooksReasoningOnly,
  isStreamErrorPayload,
} from '../streamParsing';
import { markStreamParserError, patchIamAgentStreamDebug } from '../streamDebug';

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
  /** Optional: Agent Sam tool / terminal trace rows (replaces legacy single exec panel). */
  setToolTraceRows?: React.Dispatch<React.SetStateAction<AgentToolTraceRow[]>>;
  /** When a streamed monaco invoke opens a `.py` draft in the editor. */
  onPythonDraftOpened?: (fileName: string) => void;
  setConversationId: React.Dispatch<React.SetStateAction<string>>;
  stripEmptyAssistantTail: (prev: Message[]) => Message[];
  loadSessions: () => void;
  onThinkingEvent?: (event: { type: string; tool_name?: string; text?: string; ok?: boolean; output_preview?: string; command_run_id?: string }) => void;
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
    setToolTraceRows,
    onPythonDraftOpened,
    setConversationId,
    stripEmptyAssistantTail,
    loadSessions,
    onBrowserNavigate,
    onR2FileUpdated,
    onFileSelect,
    onToolApprovalRequest,
    onThinkingEvent,
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
  /** Last `tool_output` chunk for the active browser navigation tool. */
  let lastBrowserToolOutputChunk: string | null = null;
  let activeBrowserNavTool = false;

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
        if (evType === 'context' && data && typeof data === 'object') {
          const ctx = data as Record<string, unknown>;
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
        if (evType === 'tool_start') {
          const d = data as { tool_name?: string; node_key?: string };
          onThinkingEvent?.({ type: 'tool_start', tool_name: d.tool_name || d.node_key || '' });
          continue;
        }
        if (evType === 'tool_done') {
          const d = data as { tool_name?: string; node_key?: string; ok?: boolean; output_preview?: string };
          onThinkingEvent?.({ type: 'tool_done', tool_name: d.tool_name || d.node_key || '', ok: d.ok !== false, output_preview: d.output_preview });
          continue;
        }
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
            onBrowserNavigate?.({ type: 'browser_navigate', url: d.url.trim() });
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
          const wr = d.workflow_run_id ? `\n_workflow run:_ \`${d.workflow_run_id}\`\n` : '';
          const lines = (d.tasks || []).map((t, i) => {
            const cap = t.capability_type ? ` · **${t.capability_type}**` : '';
            const step = t.execution_step_id ? ` · step \`${String(t.execution_step_id).slice(0, 18)}…\`` : '';
            const cr = t.command_run_id ? ` · cmd \`${String(t.command_run_id).slice(0, 14)}…\`` : '';
            const files =
              Array.isArray(t.files_involved) && t.files_involved.length
                ? ` · files: ${t.files_involved.slice(0, 4).join(', ')}${t.files_involved.length > 4 ? '…' : ''}`
                : '';
            return `${i + 1}. [ ] **${String(t.title || '').slice(0, 200)}** _(${String(t.handler_type || 'agent')})_${cap}${step}${cr}${files}`;
          });
          assistantStreamBuf += `\n\n### ${String(d.plan_title || 'Plan')}\n_plan ${String(d.plan_id || '').slice(0, 14)}…_${wr}_${Number(d.task_count || lines.length)} tasks_\n\n${lines.join('\n')}\n`;
          assistantContent = assistantStreamBuf;
          const pid = typeof d.plan_id === 'string' ? d.plan_id.trim() : '';
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
              };
            } else {
              last.push({
                role: 'assistant',
                content: assistantContent,
                ...(chip ? { implementationPlan: chip } : {}),
              });
            }
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
          continue;
        }
        if (data && typeof data === 'object' && (data as { type?: string }).type === 'tool_start') {
          const d = data as { type: 'tool_start'; tool_name?: string; input_preview?: string | null };
          const tn = String(d.tool_name || '');
          patchIamAgentStreamDebug({ last_tool_name: tn || null });
          pendingBrowserToolUrl = null;
          lastBrowserToolOutputChunk = null;
          activeBrowserNavTool =
            tn === 'browser_open_url' || tn === 'cdt_navigate_page' || tn === 'browser_navigate';
          if (activeBrowserNavTool) {
            try {
              const inp = JSON.parse(String(d.input_preview || '{}')) as Record<string, unknown>;
              const u =
                (typeof inp.url === 'string' && inp.url.trim()) ||
                (typeof inp.href === 'string' && inp.href.trim()) ||
                (typeof inp.target_url === 'string' && inp.target_url.trim()) ||
                (typeof inp.page_url === 'string' && inp.page_url.trim()) ||
                '';
              if (u) pendingBrowserToolUrl = u;
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
          const msg = String(d.error || 'tool_error').slice(0, 4000);
          const toolLabel = String(d.tool || 'tool');
          setToolTraceRows?.((prev) => {
            if (activeToolTraceId && prev.some((r) => r.id === activeToolTraceId)) {
              return prev.map((r) =>
                r.id === activeToolTraceId
                  ? {
                      ...r,
                      status: 'error' as const,
                      lines: [...r.lines, `[${toolLabel}] ${msg}`],
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
                lines: [msg],
                startedAtLabel: new Date().toLocaleTimeString(),
              },
            ];
          });
          activeToolTraceId = null;
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
          if (activeBrowserNavTool) {
            lastBrowserToolOutputChunk = d.chunk;
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
            status?: string;
            duration_ms?: number;
            rows?: Record<string, unknown>[] | null;
            error?: string;
            artifact_type?: string;
            artifact_id?: string;
            public_url?: string | null;
          };
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
            d.status !== 'error' &&
            (d.tool_name === 'browser_open_url' ||
              d.tool_name === 'cdt_navigate_page' ||
              d.tool_name === 'browser_navigate')
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
            if (navUrl) {
              onBrowserNavigate?.({ type: 'browser_navigate', url: navUrl });
            }
            pendingBrowserToolUrl = null;
            lastBrowserToolOutputChunk = null;
            activeBrowserNavTool = false;
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

  if (typeof window !== 'undefined' && window.__IAM_AGENT_LAST_STREAM_DEBUG) {
    patchIamAgentStreamDebug({
      assistant_text_length: assistantContent.length,
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
    }
  }
}
