/**
 * Monaco loader init with cancelation-safe promise handling.
 * @monaco-editor/react useMonaco() rejects with { type: 'cancelation' } on unmount
 * without a .catch — surfaces as Uncaught (in promise) in the console.
 */
import { useEffect, useState } from 'react';
import loader from '@monaco-editor/loader';
import type * as Monaco from 'monaco-editor';

function isMonacoCancelation(err: unknown): boolean {
  return (
    err != null &&
    typeof err === 'object' &&
    (err as { type?: string }).type === 'cancelation'
  );
}

export function useMonacoSafe(): typeof Monaco | null {
  const [monaco, setMonaco] = useState<typeof Monaco | null>(() => {
    const existing = loader.__getMonacoInstance?.() as typeof Monaco | null | undefined;
    return existing ?? null;
  });

  useEffect(() => {
    const existing = loader.__getMonacoInstance?.() as typeof Monaco | null | undefined;
    if (existing) {
      setMonaco(existing);
      return;
    }

    const pending = loader.init();
    pending
      .then((api) => {
        setMonaco(api as typeof Monaco);
      })
      .catch((err: unknown) => {
        if (isMonacoCancelation(err)) return;
        console.error('[useMonacoSafe] Monaco init failed:', err);
      });

    return () => {
      pending.cancel?.();
    };
  }, []);

  return monaco;
}
