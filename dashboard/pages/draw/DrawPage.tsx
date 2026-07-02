import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DrawEntryScreen } from './DrawEntryScreen';
import {
  fetchDrawLibraryCatalog,
  fetchDrawLibraryPrefs,
  hydrateLibraryItemsForSlugs,
  resolveEnabledLibrarySlugs,
  type ExcalidrawLibraryItem,
} from '../../lib/excalidrawLibraries';
import './draw-entry.css';

const ExcalidrawView = lazy(() =>
  import('../../components/ExcalidrawView').then((m) => ({ default: m.ExcalidrawView })),
);

export type DrawPageProps = {
  onEntryPhaseChange?: (entry: boolean) => void;
  onComposerHost?: (el: HTMLDivElement | null) => void;
  onMessagesHost?: (el: HTMLDivElement | null) => void;
};

export default function DrawPage({
  onEntryPhaseChange,
  onComposerHost,
  onMessagesHost,
}: DrawPageProps) {
  const [phase, setPhase] = useState<'entry' | 'canvas'>('entry');
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [enabledLibrarySlugs, setEnabledLibrarySlugs] = useState<string[]>([]);
  const [libraryItems, setLibraryItems] = useState<ExcalidrawLibraryItem[]>([]);
  const [librariesReady, setLibrariesReady] = useState(false);
  const [clearOnOpen, setClearOnOpen] = useState(false);

  useEffect(() => {
    onEntryPhaseChange?.(phase === 'entry');
  }, [phase, onEntryPhaseChange]);

  const hydrateLibraries = useCallback(async (slugs?: string[]) => {
    const [catalog, prefs] = await Promise.all([fetchDrawLibraryCatalog(), fetchDrawLibraryPrefs()]);
    const resolved = slugs ?? resolveEnabledLibrarySlugs(catalog, prefs);
    setEnabledLibrarySlugs(resolved);
    const items = await hydrateLibraryItemsForSlugs(catalog, resolved);
    setLibraryItems(items);
    setLibrariesReady(true);
    return resolved;
  }, []);

  useEffect(() => {
    void hydrateLibraries();
  }, [hydrateLibraries]);

  const openCanvas = useCallback(() => {
    setClearOnOpen(false);
    setPhase('canvas');
  }, []);

  const openNewSketch = useCallback(() => {
    setClearOnOpen(true);
    setPhase('canvas');
  }, []);

  const handleLibrariesApply = useCallback(
    (slugs: string[]) => {
      setLibrariesReady(false);
      void hydrateLibraries(slugs);
    },
    [hydrateLibraries],
  );

  // Agent / deep-link: auto-open canvas when a document is pushed to Excalidraw.
  useEffect(() => {
    const openIfNeeded = () => setPhase('canvas');
    window.addEventListener('iam:excalidraw_load_document', openIfNeeded);
    window.addEventListener('iam:excalidraw_action', openIfNeeded);
    return () => {
      window.removeEventListener('iam:excalidraw_load_document', openIfNeeded);
      window.removeEventListener('iam:excalidraw_action', openIfNeeded);
    };
  }, []);

  if (phase === 'entry') {
    return (
      <DrawEntryScreen
        onOpenCanvas={openCanvas}
        onNewSketch={openNewSketch}
        libraryPanelOpen={libraryPanelOpen}
        onLibraryPanelOpenChange={setLibraryPanelOpen}
        onLibrariesApply={handleLibrariesApply}
        onComposerHost={onComposerHost}
        onMessagesHost={onMessagesHost}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 h-full overflow-hidden bg-[var(--dashboard-canvas)] isolate">
      <div className="draw-canvas-toolbar">
        <button type="button" className="draw-canvas-toolbar__back" onClick={() => setPhase('entry')}>
          ← Back
        </button>
        <span className="draw-canvas-toolbar__label">
          {enabledLibrarySlugs.length > 0
            ? `${enabledLibrarySlugs.length} librar${enabledLibrarySlugs.length === 1 ? 'y' : 'ies'} loaded`
            : 'Excalidraw canvas'}
        </span>
      </div>
      <Suspense
        fallback={
          <div className="draw-canvas-loading">
            <Loader2 size={18} className="draw-entry__spin" aria-hidden />
            Loading Excalidraw…
          </div>
        }
      >
        {librariesReady ? (
          <ExcalidrawView
            libraryItems={libraryItems}
            clearOnMount={clearOnOpen}
          />
        ) : (
          <div className="draw-canvas-loading">
            <Loader2 size={18} className="draw-entry__spin" aria-hidden />
            Loading shape libraries…
          </div>
        )}
      </Suspense>
    </div>
  );
}
