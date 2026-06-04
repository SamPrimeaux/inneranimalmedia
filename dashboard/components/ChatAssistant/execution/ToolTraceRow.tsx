/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, CheckCircle2 } from 'lucide-react';
import type { AgentToolTraceRow } from './types';
import { ScrollablePreviewPanel } from './ScrollablePreviewPanel';

export type ToolTraceRowProps = {
  row: AgentToolTraceRow;
  defaultExpanded?: boolean;
  onDismiss?: () => void;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(text).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [text],
  );
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] transition-colors"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export const ToolTraceRow: React.FC<ToolTraceRowProps> = ({ row, defaultExpanded, onDismiss }) => {
  const failed = row.status === 'error';
  const running = row.status === 'running';
  const hasReceiptMeta = !!(row.connectionResolution || row.execHost || row.connectionId);
  const [open, setOpen] = useState(!!defaultExpanded || failed);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [responseOpen, setResponseOpen] = useState(false);

  useEffect(() => {
    if (failed) setOpen(true);
  }, [failed]);

  const dotColor = running
    ? 'bg-amber-400'
    : failed
      ? 'bg-red-500'
      : 'bg-emerald-500';

  const dotClass = `inline-block h-[7px] w-[7px] shrink-0 rounded-full ${dotColor} ${
    running ? 'animate-pulse' : ''
  }`;

  const summary = row.lines.filter(Boolean).join(' · ') || row.toolName;
  const detailsText = row.detailsJson?.trim() || '';

  return (
    <div
      className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] overflow-hidden"
      data-status={row.status === 'done' ? 'passed' : row.status}
    >
      <button
        type="button"
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[var(--bg-hover)]/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] font-medium text-[var(--text-muted)] tracking-wide truncate">
            {row.integrationLabel || 'Agent Sam'}
            {hasReceiptMeta ? ' · Called tool' : ''}
          </span>
          <span className="text-[12px] font-mono font-medium text-[var(--dashboard-text)] truncate">
            {row.toolName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={dotClass} aria-hidden />
          <span
            className={`text-[10px] font-medium ${
              failed
                ? 'text-red-400'
                : running
                  ? 'text-amber-400'
                  : 'text-[var(--text-muted)]'
            }`}
          >
            {running ? 'running' : failed ? 'error' : 'done'}
          </span>
          {row.durationMs != null && !running && (
            <span className="text-[10px] text-[var(--text-muted)]">
              {row.durationMs < 1000
                ? `${row.durationMs}ms`
                : `${(row.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {open ? (
            <ChevronDown size={13} className="text-[var(--text-muted)]" />
          ) : (
            <ChevronRight size={13} className="text-[var(--text-muted)]" />
          )}
        </div>
      </button>

      {!open && (
        <div className="px-3.5 pb-2.5 text-[11px] text-[var(--text-muted)] truncate">
          {summary}
        </div>
      )}

      {open && (
        <div className="border-t border-[var(--dashboard-border)]/60">
          {hasReceiptMeta ? (
            <div className="px-3.5 py-2 space-y-1 border-b border-[var(--dashboard-border)]/40">
              {row.connectionResolution ? (
                <p className="text-[10px] font-mono text-[var(--dashboard-text)] m-0">
                  <span className="text-[var(--text-muted)]">connection_resolution</span>{' '}
                  {row.connectionResolution}
                </p>
              ) : null}
              {row.connectionId ? (
                <p className="text-[10px] font-mono text-[var(--dashboard-text)] m-0">
                  <span className="text-[var(--text-muted)]">connection_id</span> {row.connectionId}
                </p>
              ) : null}
              {row.execHost ? (
                <p className="text-[10px] font-mono text-[var(--dashboard-text)] m-0 inline-flex items-center gap-1 flex-wrap">
                  <span className="text-[var(--text-muted)]">exec_host</span>{' '}
                  <span>{row.execHost}</span>
                  {!failed && !running ? (
                    <CheckCircle2 size={11} className="text-emerald-400 shrink-0" aria-hidden />
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="px-3.5 py-2.5 space-y-1">
            {row.lines.map((line) => (
              <p key={line} className="text-[11px] text-[var(--dashboard-text)] m-0 font-mono">
                {line}
              </p>
            ))}
            {running && !row.lines.length ? (
              <p className="text-[11px] text-[var(--text-muted)] m-0">Running…</p>
            ) : null}
          </div>

          {row.smokeDebug && Object.keys(row.smokeDebug).length > 0 ? (
            <div className="px-3.5 pb-2 border-t border-[var(--dashboard-border)]/40">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mt-2 mb-1">
                Smoke debug
              </p>
              <pre className="m-0 text-[10px] font-mono text-[var(--text-muted)] whitespace-pre-wrap break-words">
                {JSON.stringify(row.smokeDebug, null, 2)}
              </pre>
            </div>
          ) : null}

          {detailsText ? (
            <div className="px-3.5 pb-2.5 border-t border-[var(--dashboard-border)]/40">
              <div className="flex items-center gap-3 mt-2 mb-1">
                <button
                  type="button"
                  className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setResponseOpen((v) => !v);
                  }}
                >
                  {responseOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  Response
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailsOpen((v) => !v);
                  }}
                >
                  {detailsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  Request
                </button>
              </div>
              {responseOpen ? (
                <ScrollablePreviewPanel>
                  <div className="flex justify-end mb-1">
                    <CopyButton text={detailsText} />
                  </div>
                  <pre className="m-0 p-2.5 whitespace-pre-wrap break-words text-[10px] text-[var(--dashboard-text)] font-mono leading-relaxed">
                    {detailsText}
                  </pre>
                </ScrollablePreviewPanel>
              ) : null}
              {detailsOpen && detailsText !== row.lines.join('\n') ? (
                <ScrollablePreviewPanel>
                  <pre className="m-0 p-2.5 whitespace-pre-wrap break-words text-[10px] text-[var(--dashboard-muted)] font-mono leading-relaxed">
                    {detailsText}
                  </pre>
                </ScrollablePreviewPanel>
              ) : null}
            </div>
          ) : null}

          {onDismiss && !running && (
            <div className="px-3.5 pb-2.5">
              <button
                type="button"
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
