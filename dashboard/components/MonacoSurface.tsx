import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

const MONACO_BUILTIN = new Set(['vs', 'vs-dark', 'hc-black', 'hc-light']);

function rgbToHex(color: string): string {
  if (color.startsWith('#')) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#1e293b';
  return `#${[m[1], m[2], m[3]].map((n) => parseInt(n, 10).toString(16).padStart(2, '0')).join('')}`;
}

function resolveMonacoThemeData(): object | null {
  const raw = document.documentElement.getAttribute('data-monaco-theme-data')?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as object;
  } catch {
    return null;
  }
}

function resolveMonacoTheme(monacoTheme?: string): string {
  const fromProp = monacoTheme?.trim();
  if (fromProp) return fromProp;
  const attr = document.documentElement.getAttribute('data-monaco-theme')?.trim();
  if (attr) return attr;
  return document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs';
}

function resolveMonacoBg(monacoBg?: string): string {
  const fromProp = monacoBg?.trim();
  if (fromProp) return fromProp;
  const attr = document.documentElement.getAttribute('data-monaco-bg')?.trim();
  if (attr) return attr;
  const st = getComputedStyle(document.documentElement);
  for (const name of ['--dashboard-panel', '--bg-panel', '--scene-bg', '--bg-canvas', '--bg']) {
    const v = st.getPropertyValue(name).trim();
    if (v) return v;
  }
  const fallback = st.getPropertyValue('background-color').trim();
  return fallback || 'transparent';
}

function isUsableMonacoThemeDefinition(data: object | null): data is Record<string, unknown> {
  return (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Object.keys(data).length > 0
  );
}

function applyNonBuiltinMonacoTheme(monaco: Monaco, resolvedTheme: string, resolvedBg: string): void {
  if (MONACO_BUILTIN.has(resolvedTheme)) return;
  const themeData = resolveMonacoThemeData();
  if (isUsableMonacoThemeDefinition(themeData)) {
    monaco.editor.defineTheme(resolvedTheme, themeData as any);
  } else {
    monaco.editor.defineTheme(resolvedTheme, {
      base:
        resolvedTheme.includes('light') || document.documentElement.classList.contains('light')
          ? 'vs'
          : 'vs-dark',
      inherit: true,
      rules: [],
      colors: { 'editor.background': rgbToHex(resolvedBg) },
    });
  }
}

export type MonacoSurfaceProps = {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  height?: string | number;
  readOnly?: boolean;
  /** Optional; defaults to the document element's `data-monaco-theme`. */
  monacoTheme?: string;
  /** Optional; defaults to `data-monaco-bg` and CSS vars. */
  monacoBg?: string;
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
};

export const MonacoSurface: React.FC<MonacoSurfaceProps> = ({
  value,
  onChange,
  language = 'sql',
  height = '100%',
  readOnly = false,
  monacoTheme,
  monacoBg,
  onMount,
}) => {
  const [themeRev, setThemeRev] = useState(0);
  const onMountRef = useRef(onMount);
  onMountRef.current = onMount;
  const bridgeRef = useRef<{ monaco: Monaco } | null>(null);

  useEffect(() => {
    const bump = () => setThemeRev((n) => n + 1);
    window.addEventListener('iam:cms-theme-applied', bump);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'data-monaco-theme',
        'data-monaco-bg',
        'data-monaco-theme-data',
        'class',
        'data-dashboard-theme-ready',
        'data-cms-theme',
      ],
    });
    return () => {
      window.removeEventListener('iam:cms-theme-applied', bump);
      mo.disconnect();
    };
  }, []);

  const resolvedTheme = resolveMonacoTheme(monacoTheme);
  const resolvedBg = resolveMonacoBg(monacoBg);

  const syncMonacoTheme = useCallback(() => {
    const monaco = bridgeRef.current?.monaco;
    if (!monaco) return;
    const rt = resolveMonacoTheme(monacoTheme);
    const bg = resolveMonacoBg(monacoBg);
    if (MONACO_BUILTIN.has(rt)) {
      monaco.editor.setTheme(rt);
      return;
    }
    applyNonBuiltinMonacoTheme(monaco, rt, bg);
    monaco.editor.setTheme(rt);
  }, [monacoTheme, monacoBg, themeRev]);

  useEffect(() => {
    syncMonacoTheme();
  }, [syncMonacoTheme]);

  const handleBeforeMount = useCallback(
    (monaco: Monaco) => {
      const rt = resolveMonacoTheme(monacoTheme);
      const bg = resolveMonacoBg(monacoBg);
      applyNonBuiltinMonacoTheme(monaco, rt, bg);
    },
    [monacoTheme, monacoBg],
  );

  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      bridgeRef.current = { monaco };
      onMountRef.current?.(ed, monaco);
      queueMicrotask(() => syncMonacoTheme());
    },
    [syncMonacoTheme],
  );

  return (
    <Editor
      height={height}
      language={language}
      theme={resolvedTheme}
      value={value}
      onChange={(v) => onChange?.(v ?? '')}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
        scrollBeyondLastLine: false,
      }}
    />
  );
};

export default MonacoSurface;
