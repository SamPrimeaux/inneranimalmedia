/**
 * CMS Studio — iframe workspace + Excalidraw sketch overlay.
 * Inherits cms_themes from parent shell; quick-start actions route to ChatAssistant.
 * Production loads the dedicated studio lane (studio.inneranimalmedia.com).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ExcalidrawView = lazy(() =>
  import('../../../dashboard/components/ExcalidrawView').then((m) => ({
    default: m.ExcalidrawView,
  })),
);

const DEFAULT_STUDIO_ORIGIN = 'https://studio.inneranimalmedia.com';
const LEGACY_STUDIO_SHELL = '/static/dashboard/app/cms/cms-studio-shell.html';

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

function isLocalDevHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
}

function resolveStudioBase(studioUrl?: string | null): { base: string; origin: string } {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'inneranimalmedia.com' || host === 'www.inneranimalmedia.com') {
      return { base: `${window.location.origin}/studio/editor`, origin: window.location.origin };
    }
  }
  if (studioUrl) {
    try {
      const u = new URL(studioUrl, window.location.origin);
      const origin = u.origin;
      const base =
        u.pathname && u.pathname !== '/'
          ? `${origin}${u.pathname.replace(/\/$/, '')}`
          : `${origin}/editor`;
      return { base, origin };
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== 'undefined' && isLocalDevHost(window.location.hostname)) {
    return { base: LEGACY_STUDIO_SHELL, origin: window.location.origin };
  }
  return { base: `${DEFAULT_STUDIO_ORIGIN}/editor`, origin: DEFAULT_STUDIO_ORIGIN };
}

function isAllowedPostMessageOrigin(origin: string, studioOrigin: string) {
  if (!origin) return false;
  if (origin === studioOrigin || origin === window.location.origin) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === 'inneranimalmedia.com' || host.endsWith('.inneranimalmedia.com');
  } catch {
    return false;
  }
}

function collectDashboardThemeVars() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const vars: Record<string, string> = {};
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
  agentSamCmsShell = false,
  workspaceId = '',
  workspaceLabel = null,
  publicDomain = null,
  studioUrl = null,
  onNavigatePath,
}: {
  projectSlug: string | null | undefined;
  pageId?: string | null;
  panel?: string;
  /** When true, loads the AgentSam CMS three-column editor shell for all CMS panels. */
  agentSamCmsShell?: boolean;
  workspaceId?: string;
  workspaceLabel?: string | null;
  publicDomain?: string | null;
  studioUrl?: string | null;
  onNavigatePath?: (path: string, opts?: { replace?: boolean }) => void;
}) {
  const navigatePath = useCallback(
    (path: string, opts?: { replace?: boolean }) => {
      if (onNavigatePath) {
        onNavigatePath(path, opts);
        return;
      }
      if (opts?.replace) {
        window.history.replaceState(null, '', path);
      } else {
        window.history.pushState(null, '', path);
      }
    },
    [onNavigatePath],
  );
  const [sketchOpen, setSketchOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const isAgentSamCmsShell =
    agentSamCmsShell || panel === 'themeEditor' || panel === 'theme-editor';

  const { base: studioBase, origin: studioOrigin } = useMemo(
    () => resolveStudioBase(studioUrl),
    [studioUrl],
  );

  const src = useMemo(() => {
    if (!projectSlug) return null;
    const q = new URLSearchParams();
    q.set('project', projectSlug);
    if (pageId) q.set('page', pageId);
    if (isAgentSamCmsShell) {
      q.set('view', 'themeEditor');
      if (panel && panel !== 'pages') q.set('panel', panel);
    } else if (panel && panel !== 'pages') {
      q.set('panel', panel);
    }
    if (workspaceId) q.set('workspace_id', workspaceId);
    if (workspaceLabel) q.set('workspace_label', workspaceLabel);
    if (publicDomain) q.set('public_domain', publicDomain);
    if (studioOrigin !== window.location.origin) {
      q.set('parent_origin', window.location.origin);
    }
    const join = studioBase.includes('?') ? '&' : '?';
    return `${studioBase}${join}${q.toString()}`;
  }, [
    projectSlug,
    pageId,
    panel,
    isAgentSamCmsShell,
    workspaceId,
    workspaceLabel,
    publicDomain,
    studioBase,
    studioOrigin,
  ]);

  const postThemeToIframe = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const slug = document.documentElement.getAttribute('data-theme') || '';
    win.postMessage(
      { type: 'iam-cms-theme', slug, vars: collectDashboardThemeVars() },
      studioOrigin,
    );
  }, [studioOrigin]);

  const onMessage = useCallback(
    (event: MessageEvent) => {
      if (!isAllowedPostMessageOrigin(event.origin, studioOrigin)) return;
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

      if (data.type === 'iam-cms-navigate' && data.detail?.path) {
        navigatePath(String(data.detail.path), { replace: data.detail.replace === true });
      }

      if (data.type === 'iam-cms-exit') {
        navigatePath('/dashboard/home');
      }

      if (data.type === 'iam-cms-open-agent') {
        window.dispatchEvent(
          new CustomEvent('iam:agent-chat-compose', {
            detail: {
              message: data.detail?.message || '',
              send: false,
              ensureAgentPanel: true,
            },
          }),
        );
      }
    },
    [projectSlug, pageId, workspaceId, navigatePath, studioOrigin],
  );

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
            background: isAgentSamCmsShell ? '#F9F7F2' : 'var(--dashboard-canvas, var(--bg-canvas, #00212b))',
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
