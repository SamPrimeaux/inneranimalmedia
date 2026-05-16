/**
 * Compact Monaco diff for in-chat code previews (read-only).
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { DiffEditor } from '@monaco-editor/react';

const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  css: 'css',
  html: 'html',
  md: 'markdown',
  py: 'python',
  sql: 'sql',
  sh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
};

function monacoLanguage(lang: string | undefined, path: string | undefined): string {
  if (lang && lang.trim()) {
    const k = lang.trim().toLowerCase();
    return LANG_MAP[k] || k;
  }
  const m = String(path || '').match(/\.([a-z0-9]+)$/i);
  if (m) {
    const ext = m[1].toLowerCase();
    return LANG_MAP[ext] || ext;
  }
  return 'plaintext';
}

export type DiffViewerProps = {
  before: string;
  after: string;
  language?: string;
  path?: string;
  /** Max height for the diff widget */
  heightPx?: number;
  className?: string;
};

export function DiffViewer({
  before,
  after,
  language,
  path,
  heightPx = 200,
  className = '',
}: DiffViewerProps) {
  const monacoLang = useMemo(() => monacoLanguage(language, path), [language, path]);

  return (
    <div
      className={`overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 ${className}`.trim()}
      style={{ height: heightPx, minHeight: 120 }}
    >
      <DiffEditor
        height="100%"
        language={monacoLang}
        theme="meauxcad-dark"
        original={before}
        modified={after}
        options={{
          readOnly: true,
          renderSideBySide: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: 'on',
          folding: false,
          renderOverviewRuler: false,
          automaticLayout: true,
          padding: { top: 8, bottom: 8 },
        }}
      />
    </div>
  );
}
