import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import Editor, { useMonaco, type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { applyMonacoThemeFromDocument } from '../../MonacoSurface';
import { IAM_HC_BLACK_THEME_ID } from '../../../src/lib/monacoThemes';
import {
  getOrCreateMonacoModel,
  monacoLanguageForFilename,
  resolveMonacoModelPath,
} from '../../../src/lib/monacoModelRegistry';

/** Choose Monaco language id from a filename (extension-based). */
export function monacoLangFromFilename(filename: string): string {
  return monacoLanguageForFilename(filename);
}

function readMonacoThemeIdFromDom(): string {
  return document.documentElement.getAttribute('data-monaco-theme')?.trim() || IAM_HC_BLACK_THEME_ID;
}

function mcpDocumentPath(filename: string | null | undefined): string {
  const base = filename?.trim() || 'config.json';
  return resolveMonacoModelPath({ id: base, name: base, workspacePath: `inmemory://agent-sam/mcp/${base}` });
}

export type McpMonacoHostProps = {
  onEditorReady?: (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  /** When set, editor language follows file extension (e.g. .py → python). Defaults to JSON. */
  documentFilename?: string | null;
};

/**
 * Monaco surface for MCP config / tool JSON.
 * One model per document URI; tab switches use editor.setModel() (undo preserved per doc).
 */
export const McpMonacoHost = forwardRef<editor.IStandaloneCodeEditor | null, McpMonacoHostProps>(function McpMonacoHost(
  { onEditorReady, documentFilename },
  ref,
) {
  const monaco = useMonaco();
  const [editorThemeProp, setEditorThemeProp] = useState(readMonacoThemeIdFromDom);
  const bridgeRef = useRef<{ monaco: Monaco } | null>(null);
  const edRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const onReadyRef = useRef(onEditorReady);
  onReadyRef.current = onEditorReady;

  const syncFromDom = useCallback(() => {
    setEditorThemeProp(readMonacoThemeIdFromDom());
    const monacoBridge = bridgeRef.current?.monaco;
    const ed = edRef.current;
    if (monacoBridge) applyMonacoThemeFromDocument(monacoBridge, ed);
  }, []);

  useEffect(() => {
    window.addEventListener('iam:cms-theme-applied', syncFromDom);
    const mo = new MutationObserver(() => {
      syncFromDom();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'data-monaco-theme',
        'data-monaco-theme-data',
        'data-monaco-bg',
        'data-cms-theme',
      ],
    });
    return () => {
      window.removeEventListener('iam:cms-theme-applied', syncFromDom);
      mo.disconnect();
    };
  }, [syncFromDom]);

  const handleBeforeMount = useCallback((monacoApi: Monaco) => {
    applyMonacoThemeFromDocument(monacoApi, null);
  }, []);

  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monacoApi: Monaco) => {
      edRef.current = ed;
      bridgeRef.current = { monaco: monacoApi };
      const bootstrap = ed.getModel();
      if (bootstrap) bootstrap.dispose();

      if (typeof ref === 'function') ref(ed);
      else if (ref && typeof ref === 'object') (ref as React.MutableRefObject<editor.IStandaloneCodeEditor | null>).current = ed;
      applyMonacoThemeFromDocument(monacoApi, ed);
      setEditorThemeProp(readMonacoThemeIdFromDom());
      onReadyRef.current?.(ed, monacoApi);
    },
    [ref],
  );

  useEffect(() => {
    const ed = edRef.current;
    const monacoApi = monaco ?? bridgeRef.current?.monaco;
    if (!ed || !monacoApi) return;

    const path = mcpDocumentPath(documentFilename);
    const lang = documentFilename ? monacoLangFromFilename(documentFilename) : 'json';
    const model = getOrCreateMonacoModel({
      monaco: monacoApi,
      path,
      content: ed.getValue() || '',
      language: lang,
    });
    if (ed.getModel() !== model) {
      ed.setModel(model);
    }
  }, [monaco, documentFilename]);

  useEffect(() => {
    return () => {
      if (typeof ref === 'function') ref(null);
      else if (ref && typeof ref === 'object') (ref as React.MutableRefObject<editor.IStandaloneCodeEditor | null>).current = null;
    };
  }, [ref]);

  const editorLang = documentFilename ? monacoLangFromFilename(documentFilename) : 'json';

  return (
    <Editor
      height="100%"
      defaultLanguage={editorLang}
      theme={editorThemeProp}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      options={{
        readOnly: false,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
        scrollBeyondLastLine: false,
      }}
    />
  );
});
