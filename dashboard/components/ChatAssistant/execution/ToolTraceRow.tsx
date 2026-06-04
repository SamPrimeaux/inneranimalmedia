/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, CheckCircle2 } from 'lucide-react';
import type { AgentMode } from '../types';
import type { AgentToolTraceRow } from './types';
import { ScrollablePreviewPanel } from './ScrollablePreviewPanel';
import { AgentModePresenceIcon } from '../../../features/mode-presence/AgentModePresenceIcon';
import { resolveToolTracePresence } from '../../../features/agent-run/toolTracePresence';

export type ToolTraceRowProps = {
  row: AgentToolTraceRow;
  mode?: AgentMode;
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

export const ToolTraceRow: React.FC<ToolTraceRowProps> = ({
  row,
  mode = 'agent',
  defaultExpanded,
  onDismiss,
}) => {
  const failed = row.status === 'error';
  const running = row.status === 'running';
  const hasReceiptMeta = !!(row.connectionResolution || row.execHost || row.connectionId);
  const [open, setOpen] = useState(!!defaultExpanded || failed);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [responseOpen, setResponseOpen] = useState(false);

  const tracePresence = useMemo(
    () =>
      resolveToolTracePresence({
        toolName: row.toolName,
        status: row.status,
        mode,
        lines: row.lines,
      }),
    [row.toolName, row.status, row.lines, mode],
  );

  useEffect(() => {
    if (failed) setOpen(true);
  }, [failed]);

  const summary = row.lines.filter(Boolean).join(' · ') || tracePresence.description;
  const detailsText = row.detailsJson?.trim() || '';
  const statusLabel = running ? 'running' : failed ? 'error' : 'done';

  return (
    <div
      className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] overflow-hidden"
      data-status={row.status === 'done' ? 'passed' : row.status}
      data-lane={tracePresence.lane}
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-[var(--bg-hover)]/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span
          className="shrink-0 grid place-items-center"
          style={{
            width: 32,
            height: 32,
            color: failed
              ? 'var(--solar-red, #f87171)'
              : running
                ? 'var(--solar-cyan, #22d3ee)'
                : 'var(--dashboard-muted)',
          }}
          aria-hidden
        >
          <AgentModePresenceIcon
            mode={mode}
            state={tracePresence.presenceState}
            size={30}
            motion={running}
            aria-label=""
          />
        </span>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[12px] font-semibold text-[var(--dashboard-text)] truncate">
            {tracePresence.label}
          </span>
          <span className="text-[10px] font-mono text-[var(--dashboard-muted)] truncate">
            {row.integrationLabel || 'Agent Sam'}
            {' · '}
            {row.toolName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-medium uppercase tracking-wide ${
              failed
                ? 'text-red-400'
                : running
                  ? 'text-amber-400'
                  : 'text-[var(--text-muted)]'
            }`}
          >
            {statusLabel}
          </span>
          {row.durationMs != null && !running && (
            <span className="text-[10px] text-[var(--dashboard-muted)]">
              {row.durationMs < 1000
                ? `${row.durationMs}ms`
                : `${(row.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {open ? (
            <ChevronDown size={13} className="text-[var(--dashboard-muted)]" />
          ) : (
            <ChevronRight size={13} className="text-[var(--dashboard-muted)]" />
          )}
        </div>
      </button>

      {!open && (
        <div className="px-3.5 pb-2.5 pl-[3.25rem] text-[11px] text-[var(--dashboard-muted)] truncate">
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
