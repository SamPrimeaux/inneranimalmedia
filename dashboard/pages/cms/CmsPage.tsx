import React, { Suspense, lazy, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCmsWorkspaceContext } from '../../hooks/useCmsWorkspaceContext';
import { buildCmsPath, parseCmsRoute, readStoredCmsProjectSlug, type CmsView } from './cmsRoute';
import ClientWorkerCmsStudio from './ClientWorkerCmsStudio';

const CmsRoot = lazy(() =>
  import('../../../src/dashboard/cms/CmsRoot.jsx').then((m) => ({
    default: m.CmsRoot ?? m.default,
  })),
);

type CmsPageProps = {
  workspaceId?: string;
};

export default function CmsPage({ workspaceId }: CmsPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
    enabled: parsed.view !== 'sites',
  });

  const isClientWorker = context?.cms_mode === 'client_worker';

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
      : parsed.panel === 'templates'
        ? 'templates'
        : parsed.panel === 'imports'
          ? 'imports'
          : 'pages';

  const needsSitePick =
    parsed.view !== 'sites' &&
    !loading &&
    !context?.project_slug &&
    (context?.sites?.length || 0) !== 1;

  const siteCount = context?.sites?.length || 0;

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden bg-[var(--dashboard-canvas)]">
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
      {!needsSitePick && !isClientWorker ? (
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
              Loading CMS Suite…
            </div>
          }
        >
          <CmsRoot
            workspaceId={workspaceId}
            workspaceLabel={context?.ui_label || context?.workspace_name || null}
            view={viewForRoot}
            projectSlug={context?.project_slug || null}
            pageId={parsed.pageId}
            studioPanel={parsed.panel}
            addToPageId={searchParams.get('add_to_page')}
            loadingProject={loading}
            projectError={error}
            onNavigate={cmsNavigate}
            onNavigatePath={cmsNavigatePath}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
