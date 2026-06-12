import React, { Suspense, lazy, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const CmsRoot = lazy(() =>
  import('../../../src/dashboard/cms/CmsRoot.jsx').then((m) => ({
    default: m.CmsRoot ?? m.default,
  })),
);

const CMS_PROJECT_KEY = 'iam_cms_project';
const PRIMARY_CMS_SLUG = 'inneranimalmedia';

/** Legacy path segments — not project slugs. */
const CMS_RESERVED = new Set(['sites', 'websites', 'editor', 'templates', 'imports', 'pages', 'studio']);

export type CmsView = 'sites' | 'pages' | 'templates' | 'imports';

type ParsedCmsRoute = {
  view: CmsView;
  projectSlug: string | null;
  pageId: string | null;
  panel: 'pages' | 'templates' | 'imports';
  legacy: boolean;
};

function parseCmsRoute(pathname: string, searchParams: URLSearchParams): ParsedCmsRoute {
  const parts = pathname.split('/').filter(Boolean);
  const cmsIdx = parts.indexOf('cms');
  const rest = cmsIdx >= 0 ? parts.slice(cmsIdx + 1) : [];

  const storedProject =
    searchParams.get('project') ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem(CMS_PROJECT_KEY) : null) ||
    PRIMARY_CMS_SLUG;

  if (rest.length === 0 || rest[0] === 'sites' || rest[0] === 'websites') {
    return { view: 'sites', projectSlug: null, pageId: null, panel: 'pages', legacy: false };
  }

  if (rest[0] === 'editor') {
    return {
      view: 'pages',
      projectSlug: storedProject,
      pageId: searchParams.get('page'),
      panel: 'pages',
      legacy: true,
    };
  }
  if (rest[0] === 'templates') {
    return {
      view: 'pages',
      projectSlug: storedProject,
      pageId: searchParams.get('add_to_page'),
      panel: 'templates',
      legacy: true,
    };
  }
  if (rest[0] === 'imports') {
    return {
      view: 'pages',
      projectSlug: storedProject,
      pageId: null,
      panel: 'imports',
      legacy: true,
    };
  }

  const projectSlug = rest[0];
  if (CMS_RESERVED.has(projectSlug)) {
    return { view: 'sites', projectSlug: null, pageId: null, panel: 'pages', legacy: false };
  }

  const seg2 = rest[1];
  const seg3 = rest[2];

  if (!seg2 || seg2 === 'pages' || seg2 === 'studio') {
    return {
      view: 'pages',
      projectSlug,
      pageId: seg3 || searchParams.get('page'),
      panel: 'pages',
      legacy: false,
    };
  }
  if (seg2 === 'templates') {
    return {
      view: 'pages',
      projectSlug,
      pageId: searchParams.get('add_to_page'),
      panel: 'templates',
      legacy: false,
    };
  }
  if (seg2 === 'imports') {
    return {
      view: 'pages',
      projectSlug,
      pageId: null,
      panel: 'imports',
      legacy: false,
    };
  }

  return {
    view: 'pages',
    projectSlug,
    pageId: null,
    panel: 'pages',
    legacy: false,
  };
}

function flatPath(parsed: ParsedCmsRoute): string {
  const slug = parsed.projectSlug || PRIMARY_CMS_SLUG;
  if (parsed.panel === 'templates') return `/dashboard/cms/${slug}/templates`;
  if (parsed.panel === 'imports') return `/dashboard/cms/${slug}/imports`;
  if (parsed.pageId) return `/dashboard/cms/${slug}/pages/${parsed.pageId}`;
  return `/dashboard/cms/${slug}/pages`;
}

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

  useEffect(() => {
    if (parsed.legacy) {
      navigate(flatPath(parsed), { replace: true });
    }
  }, [parsed, navigate]);

  useEffect(() => {
    if (parsed.projectSlug) {
      try {
        localStorage.setItem(CMS_PROJECT_KEY, parsed.projectSlug);
      } catch {
        /* ignore */
      }
    }
  }, [parsed.projectSlug]);

  const cmsNavigate = useCallback(
    (target: string) => {
      const [pathPart, queryPart] = target.split('?');
      const legacy = pathPart.replace(/^\//, '').split('/');
      const idx = legacy.indexOf('cms');
      const seg = idx >= 0 ? legacy[idx + 1] : pathPart;
      if (seg === 'editor' || seg === 'templates' || seg === 'imports') {
        const q = new URLSearchParams(queryPart || '');
        const slug = q.get('project') || parsed.projectSlug || PRIMARY_CMS_SLUG;
        if (seg === 'editor') {
          const page = q.get('page');
          navigate(
            page
              ? `/dashboard/cms/${slug}/pages/${page}`
              : `/dashboard/cms/${slug}/pages`,
          );
          return;
        }
        navigate(`/dashboard/cms/${slug}/${seg}`);
        return;
      }
      navigate(pathPart.startsWith('/') ? pathPart : `/dashboard/cms/${pathPart}`);
    },
    [navigate, parsed.projectSlug],
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
          view={viewForRoot}
          projectSlug={parsed.projectSlug || PRIMARY_CMS_SLUG}
          pageId={parsed.pageId}
          studioPanel={parsed.panel}
          addToPageId={searchParams.get('add_to_page')}
          onNavigate={cmsNavigate}
          onNavigatePath={cmsNavigatePath}
        />
      </Suspense>
    </div>
  );
}
