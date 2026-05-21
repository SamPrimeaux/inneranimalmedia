import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnalyticsShell } from '../components/analytics/AnalyticsShell';
import { ANALYTICS_TABS, type AnalyticsTabId } from '../components/analytics/analyticsRegistry';
import type { AnalyticsLayoutResponse } from '../components/analytics/types';

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function coerceTabId(raw: string | undefined | null): string {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

export const AnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ tab?: string }>();
  const requestedTab = coerceTabId(params.tab);
  const resolvedTab = requestedTab === 'd1' ? 'databases' : requestedTab;

  const fallbackTabIds = useMemo(() => new Set<string>(ANALYTICS_TABS.map((t) => t.id)), []);
  const [layout, setLayout] = useState<AnalyticsLayoutResponse | null>(null);
  const [layoutLoadedAt, setLayoutLoadedAt] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const route = '/dashboard/analytics';
      const l = await getJson<AnalyticsLayoutResponse>(`/api/analytics/layout?route=${encodeURIComponent(route)}`);
      if (!alive) return;
      setLayout(l);
      setLayoutLoadedAt(Date.now());
    })();
    return () => {
      alive = false;
    };
  }, []);

  const effectiveDefaultTab = useMemo(() => {
    const cmsDefault = layout?.page?.defaultTab ? String(layout.page.defaultTab).toLowerCase() : '';
    return cmsDefault || 'overview';
  }, [layout]);

  const effectiveTabIds = useMemo(() => {
    const fromCms = Array.isArray(layout?.tabs) && layout?.tabs?.length ? layout.tabs.map((t) => t.id) : [];
    const keys = fromCms.length ? fromCms : ANALYTICS_TABS.map((t) => t.id);
    return new Set<string>(
      keys.map((k) => {
        const id = String(k).toLowerCase();
        return id === 'd1' ? 'databases' : id;
      }),
    );
  }, [layout]);

  useEffect(() => {
    if (requestedTab === 'd1') {
      navigate('/dashboard/analytics/databases', { replace: true });
      return;
    }
    if (!resolvedTab) {
      navigate(`/dashboard/analytics/${effectiveDefaultTab}`, { replace: true });
      return;
    }
    if (!effectiveTabIds.has(resolvedTab) && resolvedTab !== 'd1') {
      navigate(`/dashboard/analytics/${effectiveDefaultTab}`, { replace: true });
    }
  }, [requestedTab, resolvedTab, effectiveDefaultTab, effectiveTabIds, navigate]);

  const tab: AnalyticsTabId = (resolvedTab && fallbackTabIds.has(resolvedTab)
    ? (resolvedTab as AnalyticsTabId)
    : (effectiveDefaultTab as AnalyticsTabId)) || 'overview';

  const active = useMemo(() => ANALYTICS_TABS.find((t) => t.id === tab) || ANALYTICS_TABS[0], [tab]);
  const ActiveTab = active?.component;

  return (
    <AnalyticsShell
      tabId={resolvedTab || effectiveDefaultTab}
      layout={layout}
      layoutLoadedAt={layoutLoadedAt}
      onTab={(next) => navigate(`/dashboard/analytics/${next}`)}
    >
      <Suspense
        fallback={<div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 text-sm text-[var(--text-muted)]">Loading…</div>}
      >
        {ActiveTab ? <ActiveTab layout={layout} /> : null}
      </Suspense>
    </AnalyticsShell>
  );
};

