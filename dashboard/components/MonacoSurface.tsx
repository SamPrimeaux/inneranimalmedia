import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

const MONACO_BUILTIN = new Set(['vs', 'vs-dark', 'hc-black', 'hc-light']);

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
  for (const name of ['--bg', '--scene-bg', '--bg-panel']) {
    const v = st.getPropertyValue(name).trim();
    if (v) return v;
  }
  const fallback = st.getPropertyValue('background-color').trim();
  return fallback || 'transparent';
}

function pickComputedCss(...varNames: string[]): string {
  const st = getComputedStyle(document.documentElement);
  for (const n of varNames) {
    const v = st.getPropertyValue(n).trim();
    if (v) return v;
  }
  return '';
}

function buildCustomMonacoTheme(editorBg: string): editor.IStandaloneThemeData {
  const dark = document.documentElement.classList.contains('dark');
  const colors: Record<string, string> = {};

  const put = (key: string, ...cssNames: string[]) => {
    const v = pickComputedCss(...cssNames);
    if (v) colors[key] = v;
  };

  if (editorBg) colors['editor.background'] = editorBg;
  else put('editor.background', '--scene-bg', '--bg', '--bg-panel');

  put('editor.foreground', '--solar-base0', '--text-main');
  put('editor.lineHighlightBackground', '--bg-panel');
  put('editorCursor.foreground', '--solar-cyan', '--color-accent');
  put('editorWhitespace.foreground', '--border-subtle');
  put('editorIndentGuide.background1', '--border-subtle');
  put('editorIndentGuide.activeBackground1', '--solar-cyan', '--color-accent');
  put('editor.selectionBackground', '--editor-selection-bg');
  put('editorGutter.background', '--scene-bg', '--bg');
  put('editorLineNumber.foreground', '--text-chrome-muted');
  put('editorLineNumber.activeForeground', '--solar-cyan', '--color-accent');
  put('scrollbarSlider.background', '--monaco-scrollbar-thumb', '--border-subtle');
  put('scrollbarSlider.hoverBackground', '--monaco-scrollbar-hover');
  put('minimap.background', '--scene-bg', '--bg');
  put('editorOverviewRuler.addedForeground', '--solar-green');
  put('editorOverviewRuler.deletedForeground', '--solar-red');
  put('editorOverviewRuler.modifiedForeground', '--solar-yellow');

  return {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors,
  };
}

function registerOrRefreshCustomTheme(monaco: Monaco, themeId: string, editorBg: string) {
  if (MONACO_BUILTIN.has(themeId)) return;
  monaco.editor.defineTheme(themeId, buildCustomMonacoTheme(editorBg));
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
      attributeFilter: ['data-monaco-theme', 'data-monaco-bg', 'class'],
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
    registerOrRefreshCustomTheme(monaco, rt, bg);
    monaco.editor.setTheme(rt);
  }, [monacoTheme, monacoBg, themeRev]);

  useEffect(() => {
    syncMonacoTheme();
  }, [syncMonacoTheme]);

  const handleBeforeMount = useCallback(
    (monaco: Monaco) => {
      const rt = resolveMonacoTheme(monacoTheme);
      const bg = resolveMonacoBg(monacoBg);
      registerOrRefreshCustomTheme(monaco, rt, bg);
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
