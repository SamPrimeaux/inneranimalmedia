/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User, Bot, Loader2, ChevronRight, FileText, FileCode } from 'lucide-react';
import type { ActiveFile } from '../../../types';
import type { Message, ImplementationPlanVisualMap, ImplementationPlanMarkdown } from '../types';
import { AgentChatMarkdown } from './AgentChatMarkdown';
import type { ExecPanelState, WorkflowLedgerState } from '../types';

const getLangMeta = (lang: string) => {
  const map: Record<string, { ext: string; icon: React.ReactNode }> = {
    tsx: { ext: 'tsx', icon: <FileCode size={15} /> },
    jsx: { ext: 'jsx', icon: <FileCode size={15} /> },
    ts: { ext: 'ts', icon: <FileCode size={15} /> },
    js: { ext: 'js', icon: <FileCode size={15} /> },
    css: { ext: 'css', icon: <FileText size={15} /> },
    html: { ext: 'html', icon: <FileText size={15} /> },
    json: { ext: 'json', icon: <FileText size={15} /> },
    py: { ext: 'py', icon: <FileText size={15} /> },
    sh: { ext: 'sh', icon: <FileText size={15} /> },
  };
  return map[lang] ?? { ext: lang || 'txt', icon: <FileText size={15} /> };
};

export type AgentMessageListProps = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  showEmptyThreadPlaceholder: boolean;
  displayMessages: Message[];
  isLoading: boolean;
  execPanel: ExecPanelState;
  setExecPanel: React.Dispatch<React.SetStateAction<ExecPanelState>>;
  workspaceId: string | null;
  workflowLedger: WorkflowLedgerState;
  onFileSelect?: (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile>) => void;
  onRunInTerminal?: (cmd: string) => void;
};

function renderMessageContent(
  content: string,
  msgIndex: number,
  onFileSelect?: AgentMessageListProps['onFileSelect'],
  onRunInTerminal?: AgentMessageListProps['onRunInTerminal'],
  /** Assistant replies often use headings/lists; user paste may need literal newlines. */
  renderTextAsMarkdown = false,
): React.ReactNode {
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
          <AgentChatMarkdown key={`text-${lastIndex}`} source={text} />
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

    if (code.split('\n').length > 5 || code.length > 200) {
      if (isShell) {
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
      } else {
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
      }
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
        <AgentChatMarkdown key="text-end" source={tail} />
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
    <AgentChatMarkdown source={display} />
  ) : (
    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">{display}</span>
  );
}

function PlanMapGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4.75 3.25h5.35L13.75 6.9v7.85H4.75z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M10.1 3.25V7h3.65" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.5 10.25h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.45" />
      <path d="M6.5 12.35h3.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.35" />
    </svg>
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

function openImplementationPlanMap(visualMap: ImplementationPlanVisualMap) {
  const pub = typeof visualMap.public_url === 'string' ? visualMap.public_url.trim() : '';
  const aid = typeof visualMap.artifact_id === 'string' ? visualMap.artifact_id.trim() : '';
  const loadUrl =
    pub ||
    (aid ? `/api/artifacts/${encodeURIComponent(aid)}/content` : '');
  if (!loadUrl) return;
  window.dispatchEvent(
    new CustomEvent('iam:agent-open-surface', {
      detail: {
        surface: 'excalidraw',
        reason: 'implementation_plan_view',
        load_url: loadUrl,
        artifact_id: aid || null,
        artifact_type: 'excalidraw',
      },
    }),
  );
}

export const AgentMessageList: React.FC<AgentMessageListProps> = ({
  scrollRef,
  showEmptyThreadPlaceholder,
  displayMessages,
  isLoading,
  execPanel,
  setExecPanel,
  workspaceId,
  workflowLedger,
  onFileSelect,
  onRunInTerminal,
}) => {
  return (
    <div
      ref={scrollRef}
      className="order-4 flex flex-col flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain px-3 sm:px-4 pt-6 pb-4 space-y-6 w-full max-w-full chat-hide-scroll"
    >
      {showEmptyThreadPlaceholder ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6">
          <div className="w-10 h-10 rounded-xl bg-[var(--solar-cyan)]/15 border border-[var(--solar-cyan)]/25 flex items-center justify-center">
            <Bot size={18} className="text-[var(--solar-cyan)]" />
          </div>
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
                  <div
                    className="agent-content text-[0.8125rem] leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] text-[var(--dashboard-text)] w-full"
                  >
                    {renderMessageContent(msg.content, i, onFileSelect, onRunInTerminal, true)}
                  </div>
                  {msg.implementationPlan &&
                  (msg.implementationPlan.visual_map || msg.implementationPlan.plan_markdown) ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {msg.implementationPlan.visual_map ? (
                        <button
                          type="button"
                          onClick={() => {
                            const p = msg.implementationPlan;
                            if (p?.visual_map) openImplementationPlanMap(p.visual_map);
                          }}
                          className="group inline-flex items-center gap-2 rounded-lg border border-[var(--dashboard-border)]/90 bg-[var(--scene-bg)]/80 px-2.5 py-1.5 text-[11px] font-medium tracking-tight text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/35 hover:bg-[var(--solar-cyan)]/5 transition-colors"
                          title="Open plan map in Draw"
                        >
                          <PlanMapGlyph className="shrink-0 text-[var(--dashboard-muted)] opacity-90 group-hover:text-[var(--solar-cyan)]" />
                          <span>View implementation plan</span>
                        </button>
                      ) : null}
                      {msg.implementationPlan.plan_markdown ? (
                        <button
                          type="button"
                          onClick={() => {
                            const p = msg.implementationPlan;
                            if (p?.plan_markdown)
                              openImplementationPlanMarkdown(p.plan_markdown, p.plan_id, onFileSelect);
                          }}
                          className="group inline-flex items-center gap-2 rounded-lg border border-[var(--dashboard-border)]/90 bg-[var(--scene-bg)]/80 px-2.5 py-1.5 text-[11px] font-medium tracking-tight text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/35 hover:bg-[var(--solar-cyan)]/5 transition-colors"
                          title="Fetch canonical plan.md and open in Monaco"
                        >
                          <FileText size={15} className="shrink-0 text-[var(--dashboard-muted)] opacity-90 group-hover:text-[var(--solar-cyan)]" />
                          <span>Open plan (.md)</span>
                        </button>
                      ) : null}
                    </div>
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
                  {renderMessageContent(msg.content, i, onFileSelect, onRunInTerminal)}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {isLoading && (
        <div className="flex justify-start">
          <div className="flex gap-2.5">
            <div className="flex-shrink-0 w-6 h-6 rounded-md bg-[var(--solar-cyan)]/20 border border-[var(--solar-cyan)]/30 flex items-center justify-center">
              <Loader2 size={11} className="text-[var(--solar-cyan)] animate-spin" />
            </div>
            <div className="px-4 py-3 bg-[var(--scene-bg)] border border-[var(--dashboard-border)] rounded-2xl rounded-tl-sm">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 bg-[var(--solar-cyan)] rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-[var(--solar-cyan)] rounded-full animate-bounce [animation-delay:0.15s]" />
                <div className="w-1.5 h-1.5 bg-[var(--solar-cyan)] rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {execPanel && (
        <div
          onClick={() => execPanel.status !== 'running' && setExecPanel(null)}
          style={{
            border: `0.5px solid ${
              execPanel.status === 'error' ? 'var(--color-border-danger)' : 'var(--color-border-tertiary)'
            }`,
            borderRadius: 'var(--border-radius-lg)',
            marginTop: 8,
            overflow: 'hidden',
            cursor: execPanel.status !== 'running' ? 'pointer' : 'default',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              background: 'var(--color-background-secondary)',
              fontSize: 12,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background:
                  execPanel.status === 'running'
                    ? 'var(--color-text-warning)'
                    : execPanel.status === 'error'
                      ? 'var(--color-text-danger)'
                      : 'var(--color-text-success)',
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{execPanel.status.toUpperCase()}</span>
            <span style={{ color: 'var(--color-text-tertiary)', flex: 1 }}>tool: {execPanel.tool_name}</span>
            {execPanel.duration_ms != null && (
              <span style={{ color: 'var(--color-text-tertiary)' }}>{(execPanel.duration_ms / 1000).toFixed(1)}s</span>
            )}
          </div>
          {execPanel.is_sql && execPanel.sql_rows?.length ? (
            <div style={{ overflowX: 'auto', padding: 8 }}>
              <table style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {Object.keys(execPanel.sql_rows[0]).map((k) => (
                      <th
                        key={k}
                        style={{
                          textAlign: 'left',
                          padding: '3px 8px',
                          borderBottom: '0.5px solid var(--color-border-tertiary)',
                          color: 'var(--color-text-tertiary)',
                          fontWeight: 500,
                        }}
                      >
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {execPanel.sql_rows.map((row, ri) => (
                    <tr key={ri}>
                      {Object.values(row).map((v, j) => (
                        <td
                          key={j}
                          style={{
                            padding: '3px 8px',
                            borderBottom: '0.5px solid var(--color-border-tertiary)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {String(v ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px 8px' }}>
                {execPanel.sql_rows.length} rows · {execPanel.duration_ms ?? 0}ms
              </div>
            </div>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: '8px 12px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                maxHeight: 180,
                overflowY: 'auto',
                color: 'var(--color-text-primary)',
                background: 'var(--color-background-primary)',
              }}
            >
              {execPanel.lines.join('\n')}
              {execPanel.status === 'running' ? '\n▊' : ''}
            </pre>
          )}
        </div>
      )}
      <ToolApprovalModal
        workspaceId={workspaceId}
        agentRunId={workflowLedger.runId}
        toolExecutionActive={execPanel?.status === 'running'}
      />
    </div>
  );
};
