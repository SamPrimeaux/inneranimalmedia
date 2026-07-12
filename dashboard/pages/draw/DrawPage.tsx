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
import { parseDrawEngine, type DrawEngine } from './drawEngine';
import './draw-entry.css';

const ExcalidrawView = lazy(() =>
  import('../../components/ExcalidrawView').then((m) => ({ default: m.ExcalidrawView })),
);
const WireframeStudio = lazy(() =>
  import('./wireframe/WireframeStudio').then((m) => ({ default: m.WireframeStudio })),
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
  const [searchParams, setSearchParams] = useSearchParams();
  const planDeepLink = useMemo(
    () => isDrawPlanDeepLink(`?${searchParams.toString()}`),
    [searchParams],
  );
  const engineFromUrl = parseDrawEngine(searchParams.get('engine'));
  const [engine, setEngine] = useState<DrawEngine>(engineFromUrl);
  const [phase, setPhase] = useState<'entry' | 'canvas'>(() =>
    planDeepLink || searchParams.get('engine') ? 'canvas' : 'entry',
  );
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [enabledLibrarySlugs, setEnabledLibrarySlugs] = useState<string[]>([]);
  const [libraryItems, setLibraryItems] = useState<ExcalidrawLibraryItem[]>([]);
  const [librariesReady, setLibrariesReady] = useState(false);
  const [clearOnOpen, setClearOnOpen] = useState(false);

  const [libraryItemCount, setLibraryItemCount] = useState(0);

  useEffect(() => {
    setEngine(parseDrawEngine(searchParams.get('engine')));
  }, [searchParams]);

  useEffect(() => {
    if (planDeepLink || searchParams.get('engine')) setPhase('canvas');
  }, [planDeepLink, searchParams]);

  useEffect(() => {
    onEntryPhaseChange?.(phase === 'entry');
  }, [phase, onEntryPhaseChange]);

  const setEngineAndUrl = useCallback(
    (next: DrawEngine) => {
      setEngine(next);
      const sp = new URLSearchParams(searchParams);
      sp.set('engine', next);
      setSearchParams(sp, { replace: true });
    },
    [searchParams, setSearchParams],
  );

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
    if (engine === 'excalidraw') void hydrateLibraries();
    else setLibrariesReady(true);
  }, [hydrateLibraries, engine]);

  const openCanvas = useCallback(
    (nextEngine: DrawEngine = 'excalidraw') => {
      setClearOnOpen(false);
      setEngineAndUrl(nextEngine);
      setPhase('canvas');
    },
    [setEngineAndUrl],
  );

  const openNewSketch = useCallback(() => {
    setClearOnOpen(true);
    setEngineAndUrl('excalidraw');
    setPhase('canvas');
  }, [setEngineAndUrl]);

  const openWireframeStudio = useCallback(() => {
    setClearOnOpen(false);
    setEngineAndUrl('wireframe');
    setPhase('canvas');
  }, [setEngineAndUrl]);

  const handleLibrariesApply = useCallback(
    (slugs: string[]) => {
      setLibrariesReady(false);
      void hydrateLibraries(slugs);
    },
    [hydrateLibraries],
  );

  useEffect(() => {
    const openIfNeeded = () => {
      setEngineAndUrl('excalidraw');
      setPhase('canvas');
    };
    window.addEventListener('iam:excalidraw_load_document', openIfNeeded);
    window.addEventListener('iam:excalidraw_action', openIfNeeded);
    return () => {
      window.removeEventListener('iam:excalidraw_load_document', openIfNeeded);
      window.removeEventListener('iam:excalidraw_action', openIfNeeded);
    };
  }, [setEngineAndUrl]);

  if (phase === 'entry') {
    return (
      <DrawEntryScreen
        onOpenCanvas={() => openCanvas('excalidraw')}
        onOpenWireframe={openWireframeStudio}
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
        <div className="draw-engine-toggle" role="tablist" aria-label="Draw engine">
          <button
            type="button"
            role="tab"
            aria-selected={engine === 'excalidraw'}
            className={`draw-engine-toggle__btn${engine === 'excalidraw' ? ' is-active' : ''}`}
            onClick={() => setEngineAndUrl('excalidraw')}
          >
            Excalidraw
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={engine === 'wireframe'}
            className={`draw-engine-toggle__btn${engine === 'wireframe' ? ' is-active' : ''}`}
            onClick={() => setEngineAndUrl('wireframe')}
          >
            Wireframe
          </button>
        </div>
        <span className="draw-canvas-toolbar__label">
          {engine === 'wireframe'
            ? 'Wireframe studio · Figma-like UI canvas'
            : planDeepLink
              ? 'Plan sketch · Design Studio'
              : !librariesReady
                ? 'Loading libraries…'
                : enabledLibrarySlugs.length > 0
                  ? libraryItemCount > 0
                    ? `${libraryItemCount} shapes · ${enabledLibrarySlugs.length} pack${enabledLibrarySlugs.length === 1 ? '' : 's'}`
                    : `${enabledLibrarySlugs.length} pack${enabledLibrarySlugs.length === 1 ? '' : 's'} (empty — retry Libraries)`
                  : 'Excalidraw canvas'}
        </span>
      </div>
      {planDeepLink && engine === 'excalidraw' ? (
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
            {engine === 'wireframe' ? 'Loading Wireframe studio…' : 'Loading Excalidraw…'}
          </div>
        }
      >
        {engine === 'wireframe' ? (
          <WireframeStudio />
        ) : librariesReady ? (
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
