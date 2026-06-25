/**
 * CMS Studio — iframe workspace + Excalidraw sketch overlay.
 * Inherits cms_themes from parent shell; quick-start actions route to ChatAssistant.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ExcalidrawView = lazy(() =>
  import('../../../dashboard/components/ExcalidrawView').then((m) => ({
    default: m.ExcalidrawView,
  })),
);

const STUDIO_BASE = '/static/dashboard/app/cms/cms-studio-shell.html';

const DASHBOARD_THEME_KEYS = [
  '--bg-canvas',
  '--bg-app',
  '--bg-panel',
  '--bg-hover',
  '--bg-elevated',
  '--border-subtle',
  '--border-focus',
  '--text-main',
  '--text-muted',
  '--text-heading',
  '--solar-cyan',
  '--solar-orange',
  '--solar-green',
  '--solar-blue',
  '--solar-red',
  '--dashboard-panel',
  '--dashboard-canvas',
  '--dashboard-border',
];

function collectDashboardThemeVars() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const vars = {};
  for (const key of DASHBOARD_THEME_KEYS) {
    const v = cs.getPropertyValue(key).trim();
    if (v) vars[key] = v;
  }
  return vars;
}

export function CmsStudioEditor({
  projectSlug,
  pageId = null,
  panel = 'pages',
  workspaceId = '',
  workspaceLabel = null,
}: {
  projectSlug: string | null | undefined;
  pageId?: string | null;
  panel?: string;
  workspaceId?: string;
  workspaceLabel?: string | null;
}) {
  const [sketchOpen, setSketchOpen] = useState(false);
  const iframeRef = useRef(null);

  const src = useMemo(() => {
    if (!projectSlug) return null;
    const q = new URLSearchParams();
    q.set('project', projectSlug);
    if (pageId) q.set('page', pageId);
    if (panel === 'themeEditor') {
      q.set('view', 'themeEditor');
    } else if (panel && panel !== 'pages') {
      q.set('panel', panel);
    }
    if (workspaceId) q.set('workspace_id', workspaceId);
    if (workspaceLabel) q.set('workspace_label', workspaceLabel);
    return `${STUDIO_BASE}?${q.toString()}`;
  }, [projectSlug, pageId, panel, workspaceId, workspaceLabel]);

  const postThemeToIframe = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const slug = document.documentElement.getAttribute('data-theme') || '';
    win.postMessage(
      { type: 'iam-cms-theme', slug, vars: collectDashboardThemeVars() },
      window.location.origin,
    );
  }, []);

  const onMessage = useCallback((event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'iam-primetech-sketch') setSketchOpen(true);
    if (data.type === 'iam-primetech-sketch-close') setSketchOpen(false);

    if (data.type === 'iam-agent-chat-compose' && data.detail?.message) {
      window.dispatchEvent(
        new CustomEvent('iam:agent-chat-compose', {
          detail: {
            message: data.detail.message,
            send: data.detail.send === true,
            ensureAgentPanel: data.detail.ensureAgentPanel !== false,
          },
        }),
      );
    }

    if (data.type === 'iam-agent-chat-new-thread' && data.detail?.message) {
      window.dispatchEvent(
        new CustomEvent('iam-agent-chat-new-thread', {
          detail: {
            message: data.detail.message,
            task_type: data.detail.task_type,
            route_key: data.detail.route_key,
            ensureAgentPanel: data.detail.ensureAgentPanel !== false,
            force_plan_mode: data.detail.force_plan_mode === true,
            project_slug: data.detail.project_slug || projectSlug,
            page_id: data.detail.page_id || pageId,
            workspace_id: data.detail.workspace_id || workspaceId,
            bootstrap_cache_key: data.detail.bootstrap_cache_key || null,
            collab_room: data.detail.collab_room || (pageId ? `cms:${pageId}` : null),
          },
        }),
      );
    }
  }, [projectSlug, pageId, workspaceId]);

  useEffect(() => {
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onMessage]);

  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => postThemeToIframe());
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => obs.disconnect();
  }, [postThemeToIframe]);

  const onIframeLoad = useCallback(() => {
    postThemeToIframe();
  }, [postThemeToIframe]);

  return (
    <div
      className="iam-cms-studio-shell"
      style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      {src ? (
        <iframe
          ref={iframeRef}
          title="CMS Studio"
          src={src}
          onLoad={onIframeLoad}
          className="iam-cms-studio-frame"
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            border: 0,
            minHeight: 0,
            background: 'var(--dashboard-canvas, var(--bg-canvas, #00212b))',
          }}
          allow="clipboard-read; clipboard-write"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
          CMS site not resolved for this workspace.
        </div>
      )}

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
