import { useCallback, useEffect, useState } from 'react';
import { buildCmsPath, writeStoredCmsProjectSlug } from '../pages/cms/cmsRoute';

export type CmsWorkspaceSite = {
  slug: string;
  name?: string;
  domain?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  page_count?: number;
  source?: string;
  target_workspace_id?: string | null;
  is_featured?: boolean;
  cms_hosting?: 'platform' | 'client_worker' | null;
  updated_at?: string | number | null;
};

export type CmsWorkspaceContext = {
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_slug: string | null;
  ui_label: string | null;
  project_slug: string | null;
  project_name: string | null;
  resolved_from: string | null;
  bootstrap_cache_key: string | null;
  bootstrap_id: string | null;
  sites: CmsWorkspaceSite[];
  cms_hosting?: 'platform' | 'client_worker';
  api_profile?: string | null;
  studio_url?: string | null;
  bridge_supported?: boolean;
  worker_base_url?: string | null;
  public_domain?: string | null;
  error?: string | null;
};

type UseCmsWorkspaceContextOptions = {
  workspaceId?: string | null;
  siteSlug?: string | null;
  enabled?: boolean;
};

export function useCmsWorkspaceContext(opts: UseCmsWorkspaceContextOptions = {}) {
  const [context, setContext] = useState<CmsWorkspaceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (opts.enabled === false) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (opts.siteSlug) qs.set('site', opts.siteSlug);
      const res = await fetch(`/api/cms/workspace-context${qs.size ? `?${qs}` : ''}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await res.json()) as CmsWorkspaceContext & { error?: string; message?: string };
      if (!res.ok) {
        setContext(data);
        setError(data.error || data.message || res.statusText);
        return;
      }
      setContext(data);
      if (data.project_slug && opts.workspaceId) {
        writeStoredCmsProjectSlug(opts.workspaceId, data.project_slug);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CMS workspace context');
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, [opts.enabled, opts.siteSlug, opts.workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistSite = useCallback(
    async (projectSlug: string) => {
      const res = await fetch('/api/cms/workspace-context', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_slug: projectSlug }),
      });
      const data = (await res.json()) as CmsWorkspaceContext & { error?: string };
      if (!res.ok) throw new Error(data.error || res.statusText);
      setContext(data);
      if (opts.workspaceId) writeStoredCmsProjectSlug(opts.workspaceId, projectSlug);
      return data;
    },
    [opts.workspaceId],
  );

  return {
    context,
    loading,
    error,
    reload: load,
    persistSite,
    pagesPath: (pageId?: string | null) =>
      buildCmsPath({
        panel: 'pages',
        pageId,
        siteSlug: context?.project_slug || opts.siteSlug || null,
      }),
  };
}
