/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, Bot, ChevronRight, FileText, ShieldAlert } from 'lucide-react';
import { SetiFileIcon } from '../../../src/components/SetiFileIcon';
import type { ActiveFile } from '../../../types';
import type {
  Message,
  ImplementationPlanMarkdown,
  AgentPreviewArtifact,
  ActiveSubagentRow,
} from '../types';
import type { ThinkingCardState } from '../../../src/components/ThinkingCard';
import { IAM_AGENT_CHAT_CONVERSATION_CHANGE } from '../../../agentChatConstants';
import { simplifyToolName } from '../../../features/agent-chat/formatThinkingStepName';
import { AgentChatMarkdown } from './AgentChatMarkdown';
import { AgentCodeFencePreview } from './AgentCodeFencePreview';
import { AgentCodeDiffPreview } from './AgentCodeDiffPreview';
import type { WorkflowLedgerState } from '../types';
import type { AgentToolTraceRow } from '../execution/types';
import { ExecutionTimeline } from '../execution/ExecutionTimeline';
import { AgentPresenceInline } from '../../../features/mode-presence/AgentPresenceInline';
import { WorkflowRunPresenceBanner } from './WorkflowRunBoard';
import { ArtifactChipList } from '../execution/ArtifactChipList';
import type { AgentMode } from '../types';
import { AgentPlanChecklist } from './AgentPlanChecklist';
import { AgentQuestionsCard } from './AgentQuestionsCard';
import { AgentImageGenerationCard } from '../../../components/AgentImageGenerationCard';
import { EmailArtifactCard } from '../artifacts/EmailArtifactCard';
import { ToolApprovalCard } from './ToolApprovalCard';
import type { ToolApprovalPayload } from '../types';

const LANG_TO_EXT: Record<string, string> = {
  sql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  mysql: 'sql',
  sqlite: 'sql',
  plpgsql: 'sql',
  graphql: 'graphql',
  diff: 'diff',
  patch: 'patch',
  yaml: 'yaml',
  yml: 'yml',
  toml: 'toml',
  md: 'md',
  markdown: 'md',
  mermaid: 'mmd',
  tsx: 'tsx',
  jsx: 'jsx',
  ts: 'ts',
  js: 'js',
  css: 'css',
  html: 'html',
  json: 'json',
  py: 'py',
  sh: 'sh',
  bash: 'sh',
  zsh: 'sh',
  shell: 'sh',
  rust: 'rs',
  go: 'go',
  java: 'java',
  php: 'php',
  vue: 'vue',
  svelte: 'svelte',
};

const getLangMeta = (lang: string) => {
  const ext = LANG_TO_EXT[lang.toLowerCase()] ?? (lang || 'txt');
  return {
    ext,
    icon: <SetiFileIcon filename={`preview.${ext}`} size={15} />,
  };
};

/** Fenced blocks that always use the preview workstation (even when short). */
const PREVIEW_LANGS = new Set([
  'sql',
  'postgres',
  'postgresql',
  'mysql',
  'sqlite',
  'plpgsql',
  'graphql',
  'diff',
  'patch',
  'json',
  'yaml',
  'yml',
]);

export type AgentMessageListProps = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  showEmptyThreadPlaceholder: boolean;
  displayMessages: Message[];
  isLoading: boolean;
  mode: AgentMode;
  presenceState: string;
  presenceLabel?: string;
  thinkingState?: ThinkingCardState | null;
  showInlinePresence?: boolean;
  isNarrow?: boolean;
  isDarkTheme: boolean;
  toolTraceRows: AgentToolTraceRow[];
  setToolTraceRows: React.Dispatch<React.SetStateAction<AgentToolTraceRow[]>>;
  workspaceId: string | null;
  workflowLedger: WorkflowLedgerState;
  activeSubagents?: ActiveSubagentRow[];
  onStopSubagent?: (id: string) => void;
  onSendUserMessage?: (text: string) => void;
  onFileSelect?: (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile>) => void;
  onRunInTerminal?: (cmd: string) => void;
  /** Optional: assistant markdown images delegate here (default: new tab). */
  onImagePreview?: (src: string) => void;
  onRunPlan?: (planId: string) => void;
  runPlanBusy?: boolean;
  onPlanIntakeSubmit?: (payload: {
    batchId: string;
    selections: Record<string, string>;
    optionalDetails: string;
    skip: boolean;
  }) => void;
  planIntakeBusy?: boolean;
  /** Inline pre-flight gate — rendered in-thread before tool execution. */
  pendingToolApproval?: ToolApprovalPayload | null;
  approvalBusy?: boolean;
  onApprovePendingTool?: () => void;
  onDenyPendingTool?: () => void;
  /** Mobile agent home renders history elsewhere — skip centered empty state. */
  suppressEmptyPlaceholder?: boolean;
};

function renderMessageContent(
  content: string,
  msgIndex: number,
  onFileSelect?: AgentMessageListProps['onFileSelect'],
  onRunInTerminal?: AgentMessageListProps['onRunInTerminal'],
  /** Assistant replies often use headings/lists; user paste may need literal newlines. */
  renderTextAsMarkdown = false,
  onImagePreview?: AgentMessageListProps['onImagePreview'],
): React.ReactNode {
  const imgHandler =
    onImagePreview ?? ((u: string) => window.open(u, '_blank', 'noopener,noreferrer'));

  let display = content
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '')
    .replace(/<antml:invoke[\s\S]*?<\/antml:invoke>/gi, '')
    .replace(/<invoke[\s\S]*?<\/antml:invoke>/gi, '')
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, '')
    .trim();
  display = display.replace(/\[FILE_CREATED:(.+?)\]/g, (_, key: string) => `Created ${key} — opened in editor`);

  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let codeCount = 0;

  while ((match = codeBlockRegex.exec(display)) !== null) {
    if (match.index > lastIndex) {
      const text = display.substring(lastIndex, match.index);
      parts.push(
        renderTextAsMarkdown ? (
          <AgentChatMarkdown
            key={`text-${lastIndex}`}
            source={text}
            onImageClick={imgHandler}
          />
        ) : (
          <span
            key={`text-${lastIndex}`}
            className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full"
          >
            {text}
          </span>
        ),
      );
    }

    const lang = match[1] || 'text';
    const code = match[2];
    const { ext, icon } = getLangMeta(lang);
    const isShell = ['sh', 'bash', 'zsh', 'shell'].includes(lang);
    codeCount++;

    const langLower = lang.toLowerCase();
    const isLarge = code.split('\n').length > 5 || code.length > 200;
    const useFencePreview = !isShell && (isLarge || PREVIEW_LANGS.has(langLower));

    if (isShell && isLarge) {
      parts.push(
        <div
          key={`code-${match.index}`}
          className="my-3 p-3 bg-[var(--scene-bg)] border border-[var(--dashboard-border)] rounded-xl group hover:border-[var(--solar-green)]/50 transition-all max-w-full min-w-0"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-[var(--dashboard-panel)] border border-[var(--dashboard-border)] rounded-lg flex items-center justify-center text-[var(--solar-green)]">
              <span className="text-[0.6875rem] font-bold font-mono">$_</span>
            </div>
            <div>
              <span className="text-[0.75rem] font-bold text-[var(--text-heading)] tracking-tight">Shell Script</span>
              <span className="text-[0.625rem] text-[var(--dashboard-muted)] ml-2">
                {code.split('\n').length} lines · {lang}
              </span>
            </div>
          </div>
          <pre className="text-[0.6875rem] font-mono text-[var(--solar-green)] bg-[var(--bg-code-pre)] rounded-lg p-3 overflow-x-auto overflow-y-hidden whitespace-pre border border-[var(--dashboard-border)] max-w-full min-w-0">
            {code}
          </pre>
          <p className="text-[0.625rem] text-[var(--dashboard-muted)] mt-2 mb-0">
            Stop with Ctrl+C when you have enough logs.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => onRunInTerminal?.(code)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--solar-green)]/10 hover:bg-[var(--solar-green)]/20 border border-[var(--solar-green)]/30 text-[var(--solar-green)] rounded-lg text-[0.6875rem] font-bold transition-colors"
            >
              <span className="font-mono">$</span> Run in Terminal
            </button>
            <button
              type="button"
              onClick={() => onFileSelect?.({ name: `script_${msgIndex}_${codeCount}.${ext}`, content: code })}
              className="flex items-center gap-2 px-3 py-1.5 bg-[var(--dashboard-panel)] border border-[var(--dashboard-border)] hover:border-[var(--solar-cyan)]/40 text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] rounded-lg text-[0.6875rem] transition-colors"
            >
              Open in Monaco
            </button>
          </div>
        </div>,
      );
    } else if (useFencePreview) {
      parts.push(
        <AgentCodeFencePreview
          key={`code-${match.index}`}
          lang={lang}
          code={code}
          fileBase={`agent_output_${msgIndex}_${codeCount}`}
          fileExt={ext}
          onOpenMonaco={onFileSelect}
        />,
      );
    } else if (!isShell && isLarge) {
      parts.push(
        <div
          key={`code-${match.index}`}
          className="my-3 p-3 bg-[var(--scene-bg)] border border-[var(--dashboard-border)] rounded-xl flex items-center justify-between group hover:border-[var(--solar-cyan)] transition-all cursor-pointer shadow-inner max-w-full min-w-0"
          onClick={() => onFileSelect?.({ name: `agent_output_${msgIndex}_${codeCount}.${ext}`, content: code })}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[var(--dashboard-panel)] border border-[var(--dashboard-border)] rounded-lg flex items-center justify-center text-[var(--solar-cyan)]">
              {icon}
            </div>
            <div className="flex flex-col">
              <span className="text-[0.75rem] font-bold text-[var(--text-heading)] tracking-tight">agent_output.{ext}</span>
              <span className="text-[0.625rem] text-[var(--dashboard-muted)] mt-0.5">
                {code.split('\n').length} lines · {lang}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.625rem] text-[var(--solar-cyan)] opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase tracking-wider">
              Open in Monaco
            </span>
            <ChevronRight size={14} className="text-[var(--dashboard-muted)] group-hover:text-[var(--solar-cyan)] transition-colors" />
          </div>
        </div>,
      );
    } else {
      parts.push(
        <pre
          key={`code-${match.index}`}
          className="my-2 p-3 bg-[var(--scene-bg)] rounded-lg border border-[var(--dashboard-border)] overflow-x-auto max-w-full min-w-0 text-[0.75rem] font-mono whitespace-pre text-[var(--solar-cyan)]"
        >
          <code>{code}</code>
        </pre>,
      );
    }

    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < display.length) {
    const tail = display.substring(lastIndex);
    parts.push(
      renderTextAsMarkdown ? (
        <AgentChatMarkdown key="text-end" source={tail} onImageClick={imgHandler} />
      ) : (
        <span key="text-end" className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">
          {tail}
        </span>
      ),
    );
  }

  return parts.length > 0 ? (
    <>{parts}</>
  ) : renderTextAsMarkdown ? (
    <AgentChatMarkdown source={display} onImageClick={imgHandler} />
  ) : (
    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">{display}</span>
  );
}

function openImplementationPlanMarkdown(
  planMarkdown: ImplementationPlanMarkdown,
  planId: string,
  onFileSelect?: AgentMessageListProps['onFileSelect'],
) {
  const pub = typeof planMarkdown.public_url === 'string' ? planMarkdown.public_url.trim() : '';
  const aid = typeof planMarkdown.artifact_id === 'string' ? planMarkdown.artifact_id.trim() : '';
  const url =
    pub ||
    (aid ? `/api/artifacts/${encodeURIComponent(aid)}/content` : '');
  if (!url || !onFileSelect) return;
  void (async () => {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return;
      const text = await r.text();
      const safeId = planId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
      onFileSelect({ name: `plan-${safeId || 'export'}.md`, content: text });
    } catch {
      /* ignore */
    }
  })();
}

function AssistantPreviewArtifactsBar({
  artifacts,
  onFileSelect,
  onImagePreview,
}: {
  artifacts: AgentPreviewArtifact[];
  onFileSelect?: AgentMessageListProps['onFileSelect'];
  onImagePreview?: AgentMessageListProps['onImagePreview'];
}) {
  const diffArts = artifacts.filter(
    (a) => a.kind === 'diff' && typeof a.before === 'string' && typeof a.content === 'string',
  );
  const chipArts = artifacts.filter((a) => !diffArts.includes(a));

  return (
  <>
      {diffArts.map((a) => (
        <AgentCodeDiffPreview
          key={a.id}
          path={a.path || a.title || a.id}
          before={a.before!}
          after={a.content!}
          language={a.language}
          onOpenMonaco={(file) =>
            onFileSelect?.({
              ...file,
              originalContent: file.originalContent ?? a.before,
            })
          }
        />
      ))}
      {chipArts.length > 0 ? (
        <ArtifactChipList
          artifacts={chipArts}
          onOpenArtifact={(a) =>
            onFileSelect?.({
              name: `sse-preview-${a.kind}-${a.id.slice(0, 8)}.${a.kind === 'sql' ? 'sql' : a.kind === 'diff' ? 'diff' : a.language || 'txt'}`,
              content: a.content || `# ${a.title || a.kind}\n`,
              originalContent: a.before,
            })
          }
          onOpenImageUrl={onImagePreview}
        />
      ) : null}
    </>
  );
}

function formatSubagentMeta(row: ActiveSubagentRow): string {
  if (row.stepCount != null && row.stepCount > 0) return `${row.stepCount} steps`;
  const elapsed = Math.max(0, Math.floor((Date.now() - row.startedAt) / 1000));
  if (elapsed < 60) return `${elapsed}s`;
  return `${Math.floor(elapsed / 60)}m`;
}

function AgentQuestionBubble({
  question,
  options,
  onSend,
}: {
  question: string;
  options?: string[];
  onSend?: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div className="flex flex-col gap-2 min-w-0 rounded-lg border border-[var(--dashboard-border)]/80 bg-[var(--scene-bg)]/60 px-3 py-2.5">
      <p className="text-[18px] leading-snug text-[var(--dashboard-text)] m-0">{question}</p>
      {options && options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onSend?.(opt)}
              className="px-2.5 py-1 rounded-full text-[11px] text-[var(--dashboard-text)] border border-[var(--color-border-secondary,var(--dashboard-border))] bg-transparent hover:bg-[var(--bg-hover)] transition-colors"
              style={{ borderWidth: '0.5px' }}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            onSend?.(t);
            setDraft('');
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your answer…"
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[12px] bg-[var(--scene-bg)] border border-[var(--dashboard-border)] text-[var(--dashboard-text)]"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}

function PlanReadyActions({
  planId,
  planMarkdown,
  onViewPlan,
  onRunPlan,
  runPlanBusy,
}: {
  planId: string;
  planMarkdown?: ImplementationPlanMarkdown;
  onViewPlan?: (planId: string, planMarkdown?: ImplementationPlanMarkdown) => void;
  onRunPlan?: (planId: string) => void;
  runPlanBusy?: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {planMarkdown ? (
        <button
          type="button"
          onClick={() => onViewPlan?.(planId, planMarkdown)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dashboard-border)]/90 bg-[var(--scene-bg)]/80 px-3 py-1.5 text-[11px] font-medium text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/35 transition-colors"
        >
          <FileText size={14} className="shrink-0" />
          View Plan
        </button>
      ) : null}
      <button
        type="button"
        disabled={runPlanBusy}
        onClick={() => onRunPlan?.(planId)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--solar-cyan)]/40 bg-[var(--solar-cyan)]/10 px-3 py-1.5 text-[11px] font-semibold text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/15 disabled:opacity-40 transition-colors"
      >
        {runPlanBusy ? 'Running plan…' : 'Run plan'}
      </button>
    </div>
  );
}

export const AgentMessageList: React.FC<AgentMessageListProps> = ({
  scrollRef,
  showEmptyThreadPlaceholder,
  displayMessages,
  isLoading,
  mode,
  presenceState,
  presenceLabel = '',
  thinkingState = null,
  showInlinePresence = false,
  isNarrow = false,
  isDarkTheme,
  toolTraceRows,
  setToolTraceRows,
  workspaceId,
  workflowLedger,
  activeSubagents = [],
  onStopSubagent,
  onSendUserMessage,
  onFileSelect,
  onRunInTerminal,
  onImagePreview,
  onRunPlan,
  runPlanBusy = false,
  onPlanIntakeSubmit,
  planIntakeBusy = false,
  pendingToolApproval = null,
  approvalBusy = false,
  onApprovePendingTool,
  onDenyPendingTool,
  suppressEmptyPlaceholder = false,
}) => {
  return (
    <div
      ref={scrollRef}
      className="order-4 flex flex-col flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain px-3 sm:px-4 pt-6 pb-4 space-y-6 w-full max-w-full chat-hide-scroll"
    >
      {showEmptyThreadPlaceholder && !suppressEmptyPlaceholder ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6">
          <img
            src={
              isDarkTheme
                ? 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/dbb316af-9c97-4959-f09f-bf58b2783d00/avatar'
                : 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar'
            }
            alt="Inner Animal Media"
            width={100}
            height={100}
            style={{ objectFit: 'contain' }}
          />
          <p className="text-[13px] font-semibold text-[var(--dashboard-text)]">What should we work on?</p>
          <p className="text-[11px] text-[var(--dashboard-muted)] text-center leading-relaxed">
            Type below to start a conversation with Agent Sam.
          </p>
        </div>
      ) : (
        displayMessages.map((msg, i) => (
          <div key={i} className={`flex w-full min-w-0 max-w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`flex gap-2.5 min-w-0 ${
                msg.role === 'user' ? 'flex-row-reverse max-w-[min(85%,100%)]' : 'max-w-full w-full'
              }`}
            >
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-1 ${
                  msg.role === 'user'
                    ? 'bg-[var(--dashboard-border)]'
                    : 'bg-[var(--solar-cyan)]/20 border border-[var(--solar-cyan)]/30'
                }`}
              >
                {msg.role === 'user' ? (
                  <User size={11} className="text-[var(--dashboard-muted)]" />
                ) : (
                  <Bot size={11} className="text-[var(--solar-cyan)]" />
                )}
              </div>
              {msg.role === 'assistant' ? (
                <div className="flex flex-col min-w-0 flex-1 gap-0">
                  {msg.imageGenerationState ? (
                    <div className="mb-3">
                      <AgentImageGenerationCard
                        state={msg.imageGenerationState}
                        onImagePreview={onImagePreview}
                      />
                    </div>
                  ) : null}
                  {msg.emailArtifact ? (
                    <div className="mb-3">
                      <EmailArtifactCard artifact={msg.emailArtifact} />
                    </div>
                  ) : null}
                  {msg.previewArtifacts &&
                  msg.previewArtifacts.filter((a) => !(msg.imageGenerationState && a.kind === 'image')).length >
                    0 ? (
                    <AssistantPreviewArtifactsBar
                      artifacts={msg.previewArtifacts.filter(
                        (a) => !(msg.imageGenerationState && a.kind === 'image'),
                      )}
                      onFileSelect={onFileSelect}
                      onImagePreview={onImagePreview}
                    />
                  ) : null}
                  {msg.content.trim() ? (
                    <div className="agent-content text-[0.8125rem] leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] text-[var(--dashboard-text)] w-full">
                      {renderMessageContent(msg.content, i, onFileSelect, onRunInTerminal, true, onImagePreview)}
                    </div>
                  ) : null}
                  {msg.planQuestionsBatch && !msg.planQuestionsBatch.submitted ? (
                    <div className="agent-content min-w-0 w-full mt-2 mb-1">
                      <AgentQuestionsCard
                        batch={msg.planQuestionsBatch}
                        busy={planIntakeBusy}
                        isNarrow={isNarrow}
                        onSubmit={(payload) => onPlanIntakeSubmit?.(payload)}
                      />
                    </div>
                  ) : null}
                  {msg.agentQuestion ? (
                    <div className="agent-content min-w-0 break-words w-full mt-2 mb-1">
                      <AgentQuestionBubble
                        question={msg.agentQuestion.question}
                        options={msg.agentQuestion.options}
                        onSend={onSendUserMessage}
                      />
                    </div>
                  ) : null}
                  {msg.executionPlan?.status === 'ready' && msg.executionPlan.plan_id ? (
                    <PlanReadyActions
                      planId={msg.executionPlan.plan_id}
                      planMarkdown={msg.implementationPlan?.plan_markdown}
                      onViewPlan={(planId, planMarkdown) => {
                        if (planMarkdown) openImplementationPlanMarkdown(planMarkdown, planId, onFileSelect);
                      }}
                      onRunPlan={onRunPlan}
                      runPlanBusy={runPlanBusy}
                    />
                  ) : null}
                  {msg.executionPlan && msg.executionPlan.tasks.length > 0 && msg.executionPlan.status !== 'ready' ? (
                    <AgentPlanChecklist
                      plan={msg.executionPlan}
                      mode={mode}
                      onRunPlan={onRunPlan}
                      runPlanBusy={runPlanBusy}
                    />
                  ) : null}
                </div>
              ) : (
                <div
                  className={`agent-content text-[0.8125rem] leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] bg-[var(--scene-bg)] border border-[var(--dashboard-border)] px-4 py-3 rounded-2xl rounded-tr-sm text-[var(--dashboard-text)]`}
                >
                  {msg.role === 'user' && msg.attachmentPreviews && msg.attachmentPreviews.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.attachmentPreviews.map((ap, j) =>
                        ap.type === 'image' && ap.previewUrl ? (
                          <img
                            key={j}
                            src={ap.previewUrl}
                            alt=""
                            className="max-h-40 max-w-full rounded-lg border border-[var(--dashboard-border)] object-contain"
                          />
                        ) : (
                          <span
                            key={j}
                            className="text-[0.6875rem] text-[var(--dashboard-muted)] px-2 py-1 rounded border border-[var(--dashboard-border)]/60"
                          >
                            {ap.name}
                          </span>
                        ),
                      )}
                    </div>
                  ) : null}
                  {renderMessageContent(msg.content, i, onFileSelect, onRunInTerminal, false, onImagePreview)}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {activeSubagents.map((row) => (
        <div key={row.id} className="flex justify-start w-full min-w-0">
          <AgentPresenceInline
            mode={mode}
            state={row.state}
            title={row.label.slice(0, 40)}
            meta={formatSubagentMeta(row)}
            size="sm"
            onStop={onStopSubagent ? () => onStopSubagent(row.id) : undefined}
            onClick={
              row.conversationId
                ? () => {
                    window.dispatchEvent(
                      new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, {
                        detail: { id: row.conversationId },
                      }),
                    );
                  }
                : undefined
            }
          />
        </div>
      ))}

      {workflowLedger.runId ? (
        <div className="mx-0 mb-1">
          <WorkflowRunPresenceBanner ledger={workflowLedger} mode={mode} />
        </div>
      ) : null}

      {pendingToolApproval && onApprovePendingTool && onDenyPendingTool ? (
        <div className="flex w-full min-w-0 max-w-full justify-start">
          <div className="flex gap-2.5 min-w-0 w-full max-w-full">
            <div className="flex-shrink-0 w-6 h-6 rounded-md bg-amber-500/15 border border-amber-400/25 flex items-center justify-center mt-1">
              <ShieldAlert size={11} className="text-amber-200/90" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <ToolApprovalCard
                tool={pendingToolApproval}
                busy={approvalBusy}
                onAllow={onApprovePendingTool}
                onDeny={onDenyPendingTool}
              />
            </div>
          </div>
        </div>
      ) : null}

      {showInlinePresence ? (
        <div className="flex justify-start w-full min-w-0" role="status" aria-live="polite">
          <AgentPresenceInline
            mode={mode}
            state={presenceState}
            title={
              presenceLabel ||
              (() => {
                const runningStep = thinkingState?.steps.find((s) => s.status === 'running');
                if (runningStep?.name) return simplifyToolName(runningStep.name);
                return simplifyToolName(thinkingState?.thinkingText || 'working');
              })()
            }
            size="sm"
            titleFontSizePx={thinkingState?.surface === 'plan' ? 16 : undefined}
            cardStatus={
              thinkingState?.status === 'blocked'
                ? 'blocked'
                : thinkingState?.status === 'error'
                  ? 'error'
                  : thinkingState?.status === 'done'
                    ? 'done'
                    : 'working'
            }
          />
        </div>
      ) : null}

      <ExecutionTimeline
        rows={toolTraceRows}
        mode={mode}
        compact={isNarrow}
        onDismissRow={(id) => setToolTraceRows((prev) => prev.filter((r) => r.id !== id))}
        onClear={() => setToolTraceRows([])}
      />
    </div>
  );
};
