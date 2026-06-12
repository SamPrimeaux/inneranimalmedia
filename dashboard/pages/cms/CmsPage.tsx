import React, { Suspense, lazy } from 'react';

const CmsRoot = lazy(() =>
  import('../../../src/dashboard/cms/CmsRoot.jsx').then((m) => ({
    default: m.CmsRoot ?? m.default,
  })),
);

type CmsPageProps = {
  workspaceId?: string;
};

export default function CmsPage({ workspaceId }: CmsPageProps) {
  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden bg-[var(--dashboard-canvas)]">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
            Loading CMS Suite…
          </div>
        }
      >
        <CmsRoot workspaceId={workspaceId} />
      </Suspense>
    </div>
  );
}
