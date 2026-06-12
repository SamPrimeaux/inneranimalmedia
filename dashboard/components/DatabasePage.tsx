/**
 * DatabasePage — /dashboard/database
 *
 * Overview (default): database observability metrics via DatabasesTab.
 * Studio (on demand): lazy-mounted SQL explorer (DatabaseStudio).
 */

import React, { Suspense, lazy, useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import DatabasesTab from './analytics/tabs/DatabasesTab';

const DatabaseStudio = lazy(() =>
  import('./DatabaseStudio').then((m) => ({ default: m.DatabaseStudio })),
);

type PageMode = 'overview' | 'studio';

function studioDeepLinkParams(params: URLSearchParams): boolean {
  return (
    params.get('studio') === '1'
    || params.has('tab')
    || params.has('table')
    || params.has('source')
    || params.has('q')
  );
}

function DatabaseStudioFallback() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center gap-2 text-[12px] text-[var(--text-muted)]">
      <Loader2 size={16} className="animate-spin" />
      Loading Database Studio…
    </div>
  );
}

export const DatabasePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<PageMode>(() =>
    studioDeepLinkParams(searchParams) ? 'studio' : 'overview',
  );

  const backToOverview = useCallback(() => {
    setMode('overview');
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const onOverviewClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest('a[href^="/dashboard/database"]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      const url = new URL(href, window.location.origin);
      if (!url.pathname.startsWith('/dashboard/database')) return;
      event.preventDefault();
      if (studioDeepLinkParams(url.searchParams)) {
        setSearchParams(Object.fromEntries(url.searchParams.entries()), { replace: true });
      }
      setMode('studio');
    },
    [setSearchParams],
  );

  if (mode === 'studio') {
    return (
      <Suspense fallback={<DatabaseStudioFallback />}>
        <DatabaseStudio onBackToOverview={backToOverview} />
      </Suspense>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-auto px-4 py-4 md:px-6 md:py-5"
      onClickCapture={onOverviewClickCapture}
    >
      <DatabasesTab />
    </div>
  );
};

export default DatabasePage;
