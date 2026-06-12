/**
 * PrimeTech CMS Lite — iframe studio + optional Excalidraw sketch overlay (same shell, no /draw route).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';

const ExcalidrawView = lazy(() =>
  import('../../../dashboard/components/ExcalidrawView').then((m) => ({
    default: m.ExcalidrawView,
  })),
);

const STUDIO_BASE = '/static/dashboard/app/cms/designstudiocmslite.html';

export function CmsStudioEditor({
  projectSlug,
  pageId = null,
  panel = 'pages',
  workspaceId = '',
}) {
  const [sketchOpen, setSketchOpen] = useState(false);

  const src = useMemo(() => {
    const q = new URLSearchParams();
    q.set('project', projectSlug || 'inneranimalmedia');
    if (pageId) q.set('page', pageId);
    if (panel && panel !== 'pages') q.set('panel', panel);
    if (workspaceId) q.set('workspace_id', workspaceId);
    return `${STUDIO_BASE}?${q.toString()}`;
  }, [projectSlug, pageId, panel, workspaceId]);

  const onMessage = useCallback((event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'iam-primetech-sketch') setSketchOpen(true);
    if (data.type === 'iam-primetech-sketch-close') setSketchOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onMessage]);

  return (
    <div
      className="iam-cms-studio-shell"
      style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <iframe
        title="CMS Studio Lite"
        src={src}
        className="iam-cms-studio-frame"
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          border: 0,
          minHeight: 0,
          background: '#F6F2EA',
        }}
        allow="clipboard-read; clipboard-write"
      />

      {sketchOpen && (
        <div
          className="iam-cms-sketch-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--dashboard-canvas, #0b1418)',
            borderLeft: '1px solid var(--dashboard-border, rgba(255,255,255,0.08))',
          }}
        >
          <div
            style={{
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              borderBottom: '1px solid var(--dashboard-border, rgba(255,255,255,0.08))',
              background: 'var(--dashboard-panel, #0f1a20)',
              fontSize: 12,
              color: 'var(--text-muted, #94a3b8)',
            }}
          >
            <span>
              Sketch · <strong style={{ color: 'var(--solar-cyan, #2dd4bf)' }}>{projectSlug}</strong>
            </span>
            <button
              type="button"
              onClick={() => setSketchOpen(false)}
              style={{
                border: '1px solid var(--dashboard-border)',
                background: 'transparent',
                color: 'inherit',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Close sketch
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                  Loading sketch canvas…
                </div>
              }
            >
              <ExcalidrawView />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

export default CmsStudioEditor;
