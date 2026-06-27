import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCmsWorkspaceContext } from '../../hooks/useCmsWorkspaceContext';
import { buildCmsPath, parseCmsRoute, readStoredCmsProjectSlug, type CmsView } from './cmsRoute';
import { SiteDeployWizard } from './SiteDeployWizard';
import ClientWorkerCmsStudio from './ClientWorkerCmsStudio';

const CmsRoot = lazy(() =>
  import('../../../src/dashboard/cms/CmsRoot').then((m) => ({
    default: m.CmsRoot ?? m.default,
  })),
);

const CmsStudioEditor = lazy(() =>
  import('../../../src/dashboard/cms/CmsStudioEditor').then((m) => ({
    default: m.CmsStudioEditor,
  })),
);

function StudioShellFallback({ themeEditor = false }: { themeEditor?: boolean }) {
  if (themeEditor) {
    return (
      <div className="flex flex-1 flex-col min-h-0 bg-[#F9F7F2]">
        <div className="h-11 border-b border-[#e8e4dc] bg-white flex items-center px-4 gap-3 shrink-0">
          <div className="h-3 w-20 rounded bg-stone-200 animate-pulse" />
          <div className="h-3 w-28 rounded bg-stone-100 animate-pulse" />
          <div className="flex-1" />
          <div className="h-7 w-14 rounded bg-stone-100 animate-pulse" />
          <div className="h-7 w-16 rounded bg-teal-700/20 animate-pulse" />
        </div>
        <div className="h-11 border-b border-[#e8e4dc] bg-white/90 flex items-center px-3 gap-2 shrink-0">
          <div className="h-3 w-16 rounded bg-stone-200 animate-pulse" />
          <div className="flex-1 h-8 rounded-lg border border-dashed border-stone-300 bg-stone-50 animate-pulse" />
        </div>
        <div className="flex flex-1 min-h-0">
          <aside className="hidden md:flex w-60 border-r border-[#e8e4dc] bg-white flex-col gap-2 p-3 shrink-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 rounded-lg bg-stone-100 animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
            ))}
          </aside>
          <main className="flex-1 flex items-center justify-center p-6 min-w-0">
            <div className="w-full max-w-3xl aspect-[16/10] rounded-xl border border-[#e8e4dc] bg-white shadow-sm p-4 flex flex-col gap-3">
              <div className="h-[28%] rounded-lg bg-stone-100 animate-pulse" />
              <div className="h-[12%] rounded-md bg-stone-100 animate-pulse" />
              <div className="h-[12%] rounded-md bg-stone-100/80 animate-pulse w-[75%]" />
            </div>
          </main>
          <aside className="hidden lg:flex w-72 border-l border-[#e8e4dc] bg-white flex-col gap-3 p-3 shrink-0">
            <div className="h-3 w-12 rounded bg-stone-200 animate-pulse" />
            <div className="h-9 rounded-lg bg-stone-100 animate-pulse" />
            <div className="h-9 rounded-lg bg-stone-100/80 animate-pulse" />
          </aside>
        </div>
        <div className="h-9 border-t border-[#e8e4dc] bg-white flex items-center px-4 gap-2 text-xs text-stone-500 shrink-0">
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-stone-300 border-t-teal-700 animate-spin" />
          Opening theme editor…
        </div>
      </div>
    );
  }
  return (
    <div className={`flex flex-1 flex-col min-h-0 ${themeEditor ? 'bg-[#F9F7F2]' : 'bg-[#0d1117]'}`}>
      <div className={`h-11 border-b flex items-center px-4 gap-3 ${themeEditor ? 'border-[#e8e4dc] bg-white' : 'border-white/10 bg-[#161b22]'}`}>
        <div className={`h-3 w-24 rounded animate-pulse ${themeEditor ? 'bg-black/10' : 'bg-white/10'}`} />
        <div className="flex-1" />
        <div className={`h-7 w-16 rounded animate-pulse ${themeEditor ? 'bg-black/10' : 'bg-white/10'}`} />
        <div className={`h-7 w-20 rounded animate-pulse ${themeEditor ? 'bg-teal-600/30' : 'bg-blue-600/40'}`} />
      </div>
      <div className={`flex flex-1 items-center justify-center text-xs ${themeEditor ? 'text-stone-500' : 'text-slate-500'}`}>Opening editor…</div>
    </div>
  );
}

type CmsPageProps = {
  workspaceId?: string;
};

export default function CmsPage({ workspaceId }: CmsPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [wizardOpen, setWizardOpen] = useState(false);

  const parsed = useMemo(
    () => parseCmsRoute(location.pathname, searchParams),
    [location.pathname, searchParams],
  );

  const storedSiteSlug = useMemo(
    () => readStoredCmsProjectSlug(workspaceId),
    [workspaceId],
  );
  const effectiveSiteSlug = parsed.siteSlug || storedSiteSlug;

  const { context, loading, error, persistSite, reload: load } = useCmsWorkspaceContext({
    workspaceId,
    siteSlug: effectiveSiteSlug,
    enabled: true,
  });

  const handleDeployed = useCallback(
    (slug: string) => {
      setWizardOpen(false);
      void persistSite(slug).then(() => {
        navigate(
          buildCmsPath({
            panel: 'pages',
            siteSlug: slug,
          }),
          { replace: true },
        );
        void load();
      });
    },
    [load, navigate, persistSite],
  );

  const isClientWorker = context?.cms_hosting === 'client_worker';

  useEffect(() => {
    if (parsed.legacy && parsed.legacyTarget) {
      navigate(parsed.legacyTarget, { replace: true });
    }
  }, [parsed, navigate]);

  useEffect(() => {
    if (parsed.view === 'sites' || loading || !context?.project_slug || parsed.siteSlug) return;
    navigate(
      buildCmsPath({
        panel: parsed.panel,
        pageId: parsed.pageId,
        siteSlug: context.project_slug,
      }),
      { replace: true },
    );
  }, [parsed.view, parsed.panel, parsed.pageId, parsed.siteSlug, loading, context?.project_slug, navigate]);

  const cmsNavigate = useCallback(
    (target: string) => {
      const [pathPart, queryPart] = target.split('?');
      const legacy = pathPart.replace(/^\//, '').split('/');
      const idx = legacy.indexOf('cms');
      const seg = idx >= 0 ? legacy[idx + 1] : pathPart;
      const q = new URLSearchParams(queryPart || '');
      const site = q.get('project') || q.get('site') || parsed.siteSlug || context?.project_slug || null;

      if (seg === 'editor' || seg === 'templates' || seg === 'imports') {
        if (seg === 'editor') {
          navigate(buildCmsPath({ panel: 'pages', pageId: q.get('page'), siteSlug: site }));
          return;
        }
        navigate(buildCmsPath({ panel: seg === 'templates' ? 'templates' : 'imports', siteSlug: site }));
        return;
      }
      navigate(pathPart.startsWith('/') ? pathPart : `/dashboard/cms/${pathPart}`);
    },
    [navigate, parsed.siteSlug, context?.project_slug],
  );

  const cmsNavigatePath = useCallback(
    (path: string, opts?: { replace?: boolean }) => {
      navigate(path, opts);
    },
    [navigate],
  );

  const viewForRoot: CmsView =
    parsed.view === 'sites'
      ? 'sites'
      : parsed.view === 'online-store'
        ? 'online-store'
        : parsed.view === 'theme-editor'
          ? 'theme-editor'
          : parsed.panel === 'templates'
            ? 'templates'
            : parsed.panel === 'imports'
              ? 'imports'
              : 'pages';

  /** All site-scoped CMS routes use the AgentSam CMS live editor shell (iframe). */
  const isStudioEditorRoute =
    parsed.view !== 'sites' && Boolean(context?.project_slug || effectiveSiteSlug);
  const studioProjectSlug = context?.project_slug || effectiveSiteSlug || null;
  const studioPanel =
    parsed.view === 'theme-editor'
      ? 'theme-editor'
      : parsed.panel || 'pages';

  const needsSitePick =
    parsed.view !== 'sites' &&
    !loading &&
    !context?.project_slug &&
    !effectiveSiteSlug &&
    (context?.sites?.length || 0) !== 1;

  const siteCount = context?.sites?.length || 0;

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden bg-[#F9F7F2] iam-agentsam-cms-host h-full">
      {needsSitePick ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-lg font-semibold text-[var(--text-heading)]">Choose a CMS site</h2>
          <p className="max-w-md text-sm text-[var(--text-muted)]">
            {loading
              ? 'Loading sites for this workspace…'
              : error
                ? `Could not load CMS sites (${error}). Retry or pick a site below if listed.`
                : siteCount > 1
                  ? `${context?.ui_label || 'This workspace'} has ${siteCount} sites. Pick one to open CMS.`
                  : siteCount === 0
                    ? `No CMS sites are configured for ${context?.ui_label || 'this workspace'} yet.`
                    : `${context?.ui_label || 'This workspace'} has multiple sites. Pick one to open CMS.`}
          </p>
          {error ? (
            <button
              type="button"
              className="rounded-md border border-[var(--dashboard-border)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
              onClick={() => {
                void load();
              }}
            >
              Retry
            </button>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            {(context?.sites || []).map((site) => (
              <button
                key={site.slug}
                type="button"
                className="rounded-md border border-[var(--dashboard-border)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                onClick={() => {
                  void persistSite(site.slug).then(() => {
                    navigate(
                      buildCmsPath({
                        panel: parsed.panel,
                        pageId: parsed.pageId,
                        siteSlug: site.slug,
                      }),
                      { replace: true },
                    );
                  });
                }}
              >
                {site.name || site.slug}
                {context?.sites?.length === 1 ? null : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {!needsSitePick && isClientWorker && context?.project_slug ? (
        <ClientWorkerCmsStudio
          workspaceId={workspaceId}
          projectSlug={context.project_slug}
          projectName={context.project_name}
          studioUrl={context.studio_url}
          publicDomain={context.public_domain}
          bridgeSupported={context.bridge_supported}
          apiProfile={context.api_profile}
        />
      ) : null}
      {!needsSitePick && !isClientWorker && isStudioEditorRoute && studioProjectSlug ? (
        <Suspense fallback={<StudioShellFallback themeEditor={studioPanel === 'theme-editor'} />}>
          <CmsStudioEditor
            projectSlug={studioProjectSlug}
            pageId={parsed.pageId}
            panel={studioPanel}
            agentSamCmsShell
            workspaceId={workspaceId || context?.workspace_id || ''}
            workspaceLabel={context?.ui_label || context?.workspace_name || null}
            publicDomain={context?.public_domain || null}
            studioUrl={context?.studio_url || null}
            onNavigatePath={cmsNavigatePath}
          />
        </Suspense>
      ) : null}
      {!needsSitePick && !isClientWorker && parsed.view === 'sites' ? (
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
              Loading…
            </div>
          }
        >
          <CmsRoot
            workspaceId={workspaceId}
            workspaceLabel={context?.ui_label || context?.workspace_name || null}
            workspaceSlug={context?.workspace_slug || null}
            publicDomain={context?.public_domain || null}
            sites={context?.sites || []}
            primaryProjectSlug={context?.project_slug || null}
            loadingSites={loading && parsed.view === 'sites'}
            sitesError={parsed.view === 'sites' ? error : null}
            onRetrySites={() => {
              void load();
            }}
            view={viewForRoot}
            projectSlug={context?.project_slug || effectiveSiteSlug}
            pageId={parsed.pageId}
            studioPanel={parsed.panel}
            addToPageId={searchParams.get('add_to_page')}
            loadingProject={loading && parsed.view !== 'sites'}
            projectError={error}
            onNavigate={cmsNavigate}
            onNavigatePath={cmsNavigatePath}
            onOpenDeployWizard={() => setWizardOpen(true)}
          />
        </Suspense>
      ) : null}
      {wizardOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl h-[min(80vh,820px)] rounded-2xl overflow-hidden shadow-2xl bg-[#fafaf7] ring-1 ring-stone-300/80">
            <SiteDeployWizard
              workspaceId={workspaceId || context?.workspace_id || ''}
              onClose={() => setWizardOpen(false)}
              onDeployed={handleDeployed}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// NOTE: iam-cms-navigate postMessage handler is registered in CmsStudioEditor
// via window.addEventListener('message', ...) — no additional wiring needed here.
// The parent cmsNavigate callback is already passed to CmsRoot as onNavigate.
