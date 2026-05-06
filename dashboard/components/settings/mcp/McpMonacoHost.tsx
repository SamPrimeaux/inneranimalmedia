import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { applyMonacoThemeFromDocument } from '../../MonacoSurface';

function readMonacoThemeIdFromDom(): string {
  return document.documentElement.getAttribute('data-monaco-theme')?.trim() || 'vs';
}

export type McpMonacoHostProps = {
  onEditorReady?: (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
};

/**
 * Single Monaco surface for MCP config / tool JSON. Uncontrolled document; parent swaps models via setModel.
 */
export const McpMonacoHost = forwardRef<editor.IStandaloneCodeEditor | null, McpMonacoHostProps>(function McpMonacoHost(
  { onEditorReady },
  ref,
) {
  const [editorThemeProp, setEditorThemeProp] = useState(readMonacoThemeIdFromDom);
  const bridgeRef = useRef<{ monaco: Monaco } | null>(null);
  const edRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const onReadyRef = useRef(onEditorReady);
  onReadyRef.current = onEditorReady;

  const syncFromDom = useCallback(() => {
    setEditorThemeProp(readMonacoThemeIdFromDom());
    const monaco = bridgeRef.current?.monaco;
    const ed = edRef.current;
    if (monaco) applyMonacoThemeFromDocument(monaco, ed);
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

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    applyMonacoThemeFromDocument(monaco, null);
  }, []);

  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      edRef.current = ed;
      bridgeRef.current = { monaco };
      if (typeof ref === 'function') ref(ed);
      else if (ref && typeof ref === 'object') (ref as React.MutableRefObject<editor.IStandaloneCodeEditor | null>).current = ed;
      applyMonacoThemeFromDocument(monaco, ed);
      setEditorThemeProp(readMonacoThemeIdFromDom());
      onReadyRef.current?.(ed, monaco);
    },
    [ref],
  );

  useEffect(() => {
    return () => {
      if (typeof ref === 'function') ref(null);
      else if (ref && typeof ref === 'object') (ref as React.MutableRefObject<editor.IStandaloneCodeEditor | null>).current = null;
    };
  }, [ref]);

  return (
    <Editor
      height="100%"
      defaultLanguage="json"
      theme={editorThemeProp}
      defaultValue=""
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
