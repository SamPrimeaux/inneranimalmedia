/**
 * In-chat “mini workstation” for fenced SQL / diff / code: scrollable preview + Copy + Open in Monaco.
 * Shell blocks stay in AgentMessageList (Run in Terminal + Monaco).
 *
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { Copy, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import type { ActiveFile } from '../../../types';

const FENCE_LABEL: Record<string, string> = {
  sql: 'SQL query',
  postgres: 'SQL query',
  postgresql: 'SQL query',
  mysql: 'SQL query',
  sqlite: 'SQL query',
  plpgsql: 'SQL query',
  graphql: 'GraphQL',
  diff: 'Diff',
  patch: 'Patch',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  markdown: 'Markdown',
  mermaid: 'Mermaid',
  html: 'HTML',
  css: 'CSS',
  ts: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  jsx: 'JSX',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  toml: 'TOML',
};

function labelForLang(lang: string) {
  const k = String(lang || 'text').toLowerCase().trim();
  return FENCE_LABEL[k] || (k ? `${k}` : 'Code');
}

export type AgentCodeFencePreviewProps = {
  lang: string;
  code: string;
  /** Suggested Monaco tab name without extension */
  fileBase: string;
  fileExt: string;
  onOpenMonaco?: (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile>) => void;
  /** Lines before collapse toggle (still full content in Monaco) */
  collapseLines?: number;
  /** Max preview height */
  maxPreviewHeightPx?: number;
};

export function AgentCodeFencePreview({
  lang,
  code,
  fileBase,
  fileExt,
  onOpenMonaco,
  collapseLines = 14,
  maxPreviewHeightPx = 280,
}: AgentCodeFencePreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const lines = code.split('\n');
  const long = lines.length > collapseLines;
  const shown = !expanded && long ? lines.slice(0, collapseLines).join('\n') + '\n…' : code;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* ignore */
    }
  }, [code]);

  const openMonaco = useCallback(() => {
    const name = `${fileBase}.${fileExt}`.replace(/[^a-zA-Z0-9._-]+/g, '_');
    onOpenMonaco?.({ name, content: code });
  }, [code, fileBase, fileExt, onOpenMonaco]);

  return (
    <div className="my-3 rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] overflow-hidden max-w-full min-w-0 shadow-inner">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--dashboard-panel)] border-b border-[var(--dashboard-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.65rem] font-mono font-bold tracking-wide text-[var(--text-heading)] truncate">
            &lt; &gt; {labelForLang(lang).toUpperCase()}
          </span>
          <span className="text-[0.6rem] text-[var(--dashboard-muted)] shrink-0">
            {lines.length} lines
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="Copy"
            onClick={() => void copy()}
            className="p-1.5 rounded-md border border-transparent text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--dashboard-border)] hover:bg-[var(--scene-bg)] transition-colors"
          >
            <Copy size={15} aria-hidden />
          </button>
          <button
            type="button"
            title="Open in Monaco"
            onClick={openMonaco}
            disabled={!onOpenMonaco}
            className="p-1.5 rounded-md border border-transparent text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--dashboard-border)] hover:bg-[var(--scene-bg)] transition-colors disabled:opacity-40"
          >
            <ExternalLink size={15} aria-hidden />
          </button>
        </div>
      </div>
      <pre
        className="m-0 px-3 py-2.5 text-[0.6875rem] font-mono leading-relaxed text-[var(--solar-cyan)] bg-[var(--bg-code-pre)] overflow-x-auto whitespace-pre border-b border-[var(--dashboard-border)]/60 max-w-full min-w-0"
        style={{ maxHeight: expanded ? maxPreviewHeightPx : Math.min(maxPreviewHeightPx, 220) }}
      >
        {shown}
      </pre>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[0.625rem] font-medium text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/5 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp size={14} /> Show less
            </>
          ) : (
            <>
              <ChevronDown size={14} /> Show full preview
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}
