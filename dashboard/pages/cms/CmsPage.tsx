import React, { Suspense, lazy, useCallback, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const CmsRoot = lazy(() =>
  import('../../../src/dashboard/cms/CmsRoot.jsx').then((m) => ({
    default: m.CmsRoot ?? m.default,
  })),
);

const CMS_PROJECT_KEY = 'iam_cms_project';
const PRIMARY_CMS_SLUG = 'inneranimalmedia';
const CMS_VIEWS = ['sites', 'editor', 'templates', 'imports'] as const;

function normalizeCmsView(segment: string | undefined): (typeof CMS_VIEWS)[number] {
  if (!segment || segment === 'websites') return 'sites';
  return (CMS_VIEWS as readonly string[]).includes(segment) ? (segment as (typeof CMS_VIEWS)[number]) : 'sites';
}

type CmsPageProps = {
  workspaceId?: string;
};

export default function CmsPage({ workspaceId }: CmsPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const parts = location.pathname.split('/').filter(Boolean);
  const cmsIdx = parts.indexOf('cms');
  const view = normalizeCmsView(cmsIdx >= 0 ? parts[cmsIdx + 1] : 'sites');
  const projectSlug =
    searchParams.get('project') ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem(CMS_PROJECT_KEY) : null) ||
    PRIMARY_CMS_SLUG;
  const pageId = searchParams.get('page');
  const addToPageId = searchParams.get('add_to_page');

  const cmsNavigate = useCallback(
    (target: string) => {
      const [viewPart, queryPart] = target.split('?');
      const normalized = normalizeCmsView(viewPart);
      navigate(`/dashboard/cms/${normalized}${queryPart ? `?${queryPart}` : ''}`);
    },
    [navigate],
  );

  const cmsNavigatePath = useCallback(
    (path: string, opts?: { replace?: boolean }) => {
      navigate(path, opts);
    },
    [navigate],
  );

  useEffect(() => {
    const seg = cmsIdx >= 0 ? parts[cmsIdx + 1] : '';
    if (seg === 'websites') {
      navigate(`/dashboard/cms/sites${location.search}`, { replace: true });
    }
  }, [cmsIdx, parts, location.search, navigate]);

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden bg-[var(--dashboard-canvas)]">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
            Loading CMS Suite…
          </div>
        }
      >
        <CmsRoot
          workspaceId={workspaceId}
          view={view}
          projectSlug={projectSlug}
          pageId={pageId}
          addToPageId={addToPageId}
          onNavigate={cmsNavigate}
          onNavigatePath={cmsNavigatePath}
        />
      </Suspense>
    </div>
  );
}
