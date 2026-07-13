import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCmsWorkspaceContext, normalizeCmsSitesList } from '../../hooks/useCmsWorkspaceContext';
import { buildCmsPath, buildCmsHubPath, parseCmsRoute, readStoredCmsProjectSlug } from './cmsRoute';
import { CmsHubPage } from './CmsHubPage';
import { CmsShellLayout, type CmsShellNav } from './CmsShellLayout';
import { SiteDeployWizard } from './SiteDeployWizard';
import { CmsSiteLauncherGrid } from './CmsSiteLauncherGrid';
import { TemplateLibraryStudio } from '../../../src/dashboard/cms/TemplateLibraryStudio';
import { useWorkspace } from '../../src/context/WorkspaceContext';
import './cmsShell.css';

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
  const [composeOpen, setComposeOpen] = useState(false);
  const { workspaceId: ctxWorkspaceId } = useWorkspace();
  const activeWorkspaceId = workspaceId || ctxWorkspaceId || null;

  const parsed = useMemo(
    () => parseCmsRoute(location.pathname, searchParams),
    [location.pathname, searchParams],
  );

  const storedSiteSlug = useMemo(
    () => readStoredCmsProjectSlug(activeWorkspaceId),
    [activeWorkspaceId],
  );
  /** Hub (/dashboard/cms) must not inherit persisted site — only explicit ?site= in URL. */
  const contextSiteSlug =
    parsed.view === 'sites' || parsed.view === 'hub'
      ? parsed.siteSlug || null
      : parsed.siteSlug || storedSiteSlug;
  const effectiveSiteSlug = contextSiteSlug;

  const { context, loading, error, persistSite, reload: load } = useCmsWorkspaceContext({
    workspaceId: activeWorkspaceId,
    siteSlug: contextSiteSlug,
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

  const isHubView = parsed.view === 'sites' || parsed.view === 'hub';

  useEffect(() => {
    if (parsed.legacy && parsed.legacyTarget) {
      navigate(parsed.legacyTarget, { replace: true });
    }
  }, [parsed, navigate]);

  useEffect(() => {
    if (isHubView || loading || !context?.project_slug || parsed.siteSlug) return;
    navigate(
      buildCmsPath({
        panel: parsed.panel,
        pageId: parsed.pageId,
        siteSlug: context.project_slug,
      }),
      { replace: true },
    );
  }, [isHubView, parsed.panel, parsed.pageId, parsed.siteSlug, loading, context?.project_slug, navigate]);

  const handleSelectSite = useCallback(
    async (slug: string, path: string) => {
      await persistSite(slug);
      const deepLink = /\/pages|theme-editor|online-store|templates|imports/.test(path);
      navigate(deepLink ? path : buildCmsHubPath(slug), { replace: true });
    },
    [navigate, persistSite],
  );

  const cmsNavigatePath = useCallback(
    (path: string, opts?: { replace?: boolean }) => {
      navigate(path, opts);
    },
    [navigate],
  );

  const isStudioEditorRoute =
    !isHubView && Boolean(context?.project_slug || effectiveSiteSlug);
  const studioProjectSlug = context?.project_slug || effectiveSiteSlug || null;
  const studioPanel =
    parsed.view === 'theme-editor'
      ? 'theme-editor'
      : parsed.panel || 'pages';

  const sitesList = useMemo(() => normalizeCmsSitesList(context?.sites), [context?.sites]);

  const needsSitePick =
    !isHubView &&
    !loading &&
    !context?.project_slug &&
    !effectiveSiteSlug &&
    sitesList.length !== 1;

  const siteCount = sitesList.length;

  const hubSiteSlug = useMemo(() => {
    if (parsed.siteSlug) return parsed.siteSlug;
    if (!sitesList.length) return null;

    if (context?.is_operator_hub) {
      const candidates = [
        context.workspace_slug,
        'inneranimalmedia',
        context.project_slug,
        storedSiteSlug,
      ]
        .map((s) => (s != null ? String(s).trim() : ''))
        .filter(Boolean);
      for (const slug of candidates) {
        if (sitesList.some((s) => s.slug === slug)) return slug;
      }
      const featured = [...sitesList].sort(
        (a, b) => (Number(b.hub_priority) || 0) - (Number(a.hub_priority) || 0),
      );
      return featured[0]?.slug || null;
    }

    if (context?.project_slug && sitesList.some((s) => s.slug === context.project_slug)) {
      return context.project_slug;
    }
    if (storedSiteSlug && sitesList.some((s) => s.slug === storedSiteSlug)) return storedSiteSlug;
    if (sitesList.length === 1) return sitesList[0].slug;
    return null;
  }, [
    parsed.siteSlug,
    context?.is_operator_hub,
    context?.workspace_slug,
    context?.project_slug,
    storedSiteSlug,
    sitesList,
  ]);

  const shellSiteSlug =
    studioProjectSlug || hubSiteSlug || effectiveSiteSlug || context?.project_slug || '';
  const shellSite = useMemo(
    () => sitesList.find((s) => s.slug === shellSiteSlug) || null,
    [sitesList, shellSiteSlug],
  );
  const shellActiveNav: CmsShellNav = isHubView
    ? 'hub'
    : parsed.panel === 'templates'
      ? 'templates'
      : parsed.panel === 'theme-editor'
        ? 'theme-editor'
        : parsed.panel === 'online-store'
          ? 'online-store'
          : parsed.panel === 'imports'
            ? 'imports'
            : 'pages';

  const isTemplatesShellRoute = !isHubView && parsed.panel === 'templates' && Boolean(shellSiteSlug);
  const isHubShellRoute = isHubView && Boolean(hubSiteSlug);
  const isStudioShellRoute =
    !isHubView && !isTemplatesShellRoute && isStudioEditorRoute && Boolean(studioProjectSlug);

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden bg-[#F9F7F2] iam-agentsam-cms-host h-full">
      {needsSitePick ? (
        <div className="iam-cms-shell iam-cms-hub-page flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center overflow-auto">
          <div className="max-w-lg w-full">
            <h2 className="iam-cms-hub-page__heading">Choose a CMS site</h2>
            <p className="mt-2 text-sm iam-cms-muted">
              {loading
                ? 'Loading sites for this workspace…'
                : error
                  ? `Could not load CMS sites (${error}). Retry or pick a site below if listed.`
                  : siteCount > 0
                    ? `${context?.ui_label || 'Your workspace'} — pick a site to open the CMS editor.`
                    : `No CMS sites are configured for ${context?.ui_label || 'this workspace'} yet.`}
            </p>
            {error ? (
              <button
                type="button"
                className="mt-4 rounded-md border border-[var(--dashboard-border)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                onClick={() => {
                  void load();
                }}
              >
                Retry
              </button>
            ) : null}
            {sitesList.length > 0 ? (
              <div className="mt-6 flex justify-center">
                <CmsSiteLauncherGrid
                  sites={sitesList}
                  onSelectSite={(site) => {
                    void handleSelectSite(site.slug, buildCmsHubPath(site.slug));
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {!needsSitePick && isHubShellRoute ? (
        <CmsShellLayout
          siteSlug={hubSiteSlug || shellSiteSlug}
          site={shellSite}
          sites={sitesList}
          context={context}
          activeNav="hub"
          showComposeBar={composeOpen}
          onComposeToggle={setComposeOpen}
          onSelectSite={handleSelectSite}
          onOpenDeployWizard={() => setWizardOpen(true)}
        >
          <CmsHubPage
            context={context ? { ...context, sites: sitesList } : null}
            sites={sitesList}
            activeSiteSlug={hubSiteSlug}
            loading={loading}
            error={error}
            onRetry={() => {
              void load();
            }}
            onSelectSite={handleSelectSite}
            onNavigate={cmsNavigatePath}
            onOpenDeployWizard={() => setWizardOpen(true)}
          />
        </CmsShellLayout>
      ) : null}
      {!needsSitePick && isHubView && !hubSiteSlug ? (
        <CmsHubPage
          context={context ? { ...context, sites: sitesList } : null}
          sites={sitesList}
          activeSiteSlug={hubSiteSlug}
          loading={loading}
          error={error}
          onRetry={() => {
            void load();
          }}
          onSelectSite={handleSelectSite}
          onNavigate={cmsNavigatePath}
          onOpenDeployWizard={() => setWizardOpen(true)}
        />
      ) : null}
      {!needsSitePick && isTemplatesShellRoute ? (
        <CmsShellLayout
          siteSlug={shellSiteSlug}
          site={shellSite}
          sites={sitesList}
          context={context}
          activeNav="templates"
          editorMode
          onSelectSite={handleSelectSite}
          onOpenDeployWizard={() => setWizardOpen(true)}
        >
          <TemplateLibraryStudio
            projectSlug={shellSiteSlug}
            addToPageId={parsed.pageId}
            onNavigatePath={cmsNavigatePath}
          />
        </CmsShellLayout>
      ) : null}
      {!needsSitePick && isStudioShellRoute && studioProjectSlug ? (
        <CmsShellLayout
          siteSlug={studioProjectSlug}
          site={shellSite}
          sites={sitesList}
          context={context}
          activeNav={shellActiveNav}
          editorMode
          onSelectSite={handleSelectSite}
          onOpenDeployWizard={() => setWizardOpen(true)}
        >
          <Suspense fallback={<StudioShellFallback themeEditor={studioPanel === 'theme-editor'} />}>
            <CmsStudioEditor
              projectSlug={studioProjectSlug}
              pageId={parsed.pageId}
              panel={studioPanel}
              agentSamCmsShell
              workspaceId={activeWorkspaceId || context?.workspace_id || ''}
              workspaceLabel={context?.ui_label || context?.workspace_name || null}
              publicDomain={context?.public_domain || null}
              studioUrl={context?.studio_url || null}
              onNavigatePath={cmsNavigatePath}
            />
          </Suspense>
        </CmsShellLayout>
      ) : null}
      {wizardOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl h-[min(80vh,820px)] rounded-2xl overflow-hidden shadow-2xl bg-[#fafaf7] ring-1 ring-stone-300/80">
            <SiteDeployWizard
              workspaceId={activeWorkspaceId || context?.workspace_id || ''}
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
