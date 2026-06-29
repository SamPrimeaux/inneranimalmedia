/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Claude-style Request/Result mini window — ~9 line viewport, syntax highlight, Monaco handoff.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import {
  highlightToolTraceCode,
  shouldOfferMonacoHandoff,
  type ToolTracePreviewLang,
} from '../../../lib/toolTracePreview';

export type ToolTraceCodeBlockProps = {
  label: 'Request' | 'Result' | 'Output';
  text: string;
  lang?: ToolTracePreviewLang;
  onOpenInEditor?: (file: { name: string; content: string }) => void;
  editorFilename?: string;
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
      className="flex items-center gap-1 text-[10px] text-muted hover:text-[var(--solar-cyan)] transition-colors"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export const ToolTraceCodeBlock: React.FC<ToolTraceCodeBlockProps> = ({
  label,
  text,
  lang,
  onOpenInEditor,
  editorFilename,
}) => {
  const html = useMemo(() => highlightToolTraceCode(text, lang), [text, lang]);
  const showEditor = Boolean(onOpenInEditor && editorFilename && shouldOfferMonacoHandoff(text, lang));

  return (
    <div className="tool-trace-code-block">
      <div className="tool-trace-code-block__head">
        <span className="tool-trace-code-block__label">{label}</span>
        <div className="flex items-center gap-2">
          {showEditor ? (
            <button
              type="button"
              title="Open in editor"
              aria-label="Open in editor"
              className="p-1 rounded-md text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onOpenInEditor?.({ name: editorFilename!, content: text });
              }}
            >
              <ExternalLink size={13} aria-hidden />
            </button>
          ) : null}
          <CopyButton text={text} />
        </div>
      </div>
      <div className="tool-trace-code-viewport" role="region" aria-label={`${label} preview`}>
        <pre
          className="tool-trace-code-pre m-0"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
};
