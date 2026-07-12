import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { DrawEntryScreen } from './DrawEntryScreen';
import {
  loadDrawLibrariesForCanvas,
  type ExcalidrawLibraryItem,
} from '../../lib/excalidrawLibraries';
import {
  DRAW_PLAN_TEMPLATES,
  drawPlanTemplateEvent,
  isDrawPlanDeepLink,
} from './drawPlanTemplates';
import './draw-entry.css';

const ExcalidrawView = lazy(() =>
  import('../../components/ExcalidrawView').then((m) => ({ default: m.ExcalidrawView })),
);

export type DrawPageProps = {
  onEntryPhaseChange?: (entry: boolean) => void;
  onComposerHost?: (el: HTMLDivElement | null) => void;
  onMessagesHost?: (el: HTMLDivElement | null) => void;
};

/** Excalidraw-only surface at /dashboard/draw */
export default function DrawPage({
  onEntryPhaseChange,
  onComposerHost,
  onMessagesHost,
}: DrawPageProps) {
  const [searchParams] = useSearchParams();
  const planDeepLink = useMemo(
    () => isDrawPlanDeepLink(`?${searchParams.toString()}`),
    [searchParams],
  );
  const [phase, setPhase] = useState<'entry' | 'canvas'>(() => (planDeepLink ? 'canvas' : 'entry'));
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [enabledLibrarySlugs, setEnabledLibrarySlugs] = useState<string[]>([]);
  const [libraryItems, setLibraryItems] = useState<ExcalidrawLibraryItem[]>([]);
  const [librariesReady, setLibrariesReady] = useState(false);
  const [clearOnOpen, setClearOnOpen] = useState(false);
  const [libraryItemCount, setLibraryItemCount] = useState(0);

  useEffect(() => {
    if (planDeepLink) setPhase('canvas');
  }, [planDeepLink]);

  useEffect(() => {
    onEntryPhaseChange?.(phase === 'entry');
  }, [phase, onEntryPhaseChange]);

  const hydrateLibraries = useCallback(async (slugs?: string[]) => {
    setLibrariesReady(false);
    const { slugs: resolved, items, itemCount } = await loadDrawLibrariesForCanvas(slugs);
    setEnabledLibrarySlugs(resolved);
    setLibraryItems(items);
    setLibraryItemCount(itemCount);
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
          {planDeepLink
            ? 'Plan sketch · Design Studio'
            : !librariesReady
              ? 'Loading libraries…'
              : enabledLibrarySlugs.length > 0
                ? libraryItemCount > 0
                  ? `${libraryItemCount} shapes · ${enabledLibrarySlugs.length} pack${enabledLibrarySlugs.length === 1 ? '' : 's'}`
                  : `${enabledLibrarySlugs.length} pack${enabledLibrarySlugs.length === 1 ? '' : 's'} (empty — retry Libraries)`
                : 'Excalidraw · diagrams & flowcharts'}
        </span>
      </div>
      {planDeepLink ? (
        <div className="draw-plan-templates" role="toolbar" aria-label="Plan templates">
          {DRAW_PLAN_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="draw-plan-templates__chip"
              onClick={() => window.dispatchEvent(drawPlanTemplateEvent(t.id))}
            >
              <span className="draw-plan-templates__chip-title">{t.label}</span>
              <span className="draw-plan-templates__chip-sub">{t.subtitle}</span>
            </button>
          ))}
        </div>
      ) : null}
      <Suspense
        fallback={
          <div className="draw-canvas-loading">
            <Loader2 size={18} className="draw-entry__spin" aria-hidden />
            Loading Excalidraw…
          </div>
        }
      >
        {librariesReady ? (
          <ExcalidrawView libraryItems={libraryItems} clearOnMount={clearOnOpen} />
        ) : (
          <div className="draw-canvas-loading draw-canvas-loading--skeleton" aria-busy="true">
            <div className="draw-library-skeleton">
              <div className="draw-library-skeleton__bar draw-library-skeleton__bar--wide" />
              <div className="draw-library-skeleton__bar" />
              <div className="draw-library-skeleton__bar" />
              <div className="draw-library-skeleton__bar draw-library-skeleton__bar--short" />
            </div>
            <p className="draw-canvas-loading__text">
              <Loader2 size={18} className="draw-entry__spin" aria-hidden />
              Loading shape libraries…
            </p>
          </div>
        )}
      </Suspense>
    </div>
  );
}
