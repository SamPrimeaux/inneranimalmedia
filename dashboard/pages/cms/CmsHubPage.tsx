import React, { useMemo } from 'react';
import { ChevronDown, Plus, RefreshCw } from 'lucide-react';
import type { CmsWorkspaceContext, CmsWorkspaceSite } from '../../hooks/useCmsWorkspaceContext';
import { CmsDashboard } from './CmsDashboard';
import { CmsGuidedChatHero } from './CmsGuidedChatHero';
import { CmsSiteLauncherGrid } from './CmsSiteLauncherGrid';
import { buildCmsHubPath } from './cmsRoute';
import './cmsShell.css';

type Props = {
  context: CmsWorkspaceContext | null;
  sites: CmsWorkspaceSite[];
  activeSiteSlug: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectSite: (slug: string, path: string) => void | Promise<void>;
  onNavigate: (path: string) => void;
  onOpenDeployWizard: () => void;
};

export function CmsHubPage({
  context,
  sites,
  activeSiteSlug,
  loading,
  error,
  onRetry,
  onSelectSite,
  onNavigate,
  onOpenDeployWizard,
}: Props) {
  const activeSite = useMemo(() => {
    const rows = Array.isArray(sites) ? sites : [];
    return rows.find((s) => s.slug === activeSiteSlug) || null;
  }, [sites, activeSiteSlug]);

  const showSitePicker = sites.length > 1 && !activeSiteSlug;

  return (
    <div className="iam-cms-shell iam-cms-hub-page">
      <div className="iam-cms-hub-page__scroll">
        <CmsGuidedChatHero siteSlug={activeSiteSlug} siteName={activeSite?.name || context?.project_name} />

        <div className="iam-cms-hub-page__body">
          <div className="iam-cms-hub-page__toolbar">
            <div className="iam-cms-hub-page__toolbar-copy">
              <p className="iam-cms-shell__kicker">CMS command center</p>
              <h2 className="iam-cms-hub-page__heading">
                {activeSite?.name || context?.project_name || context?.ui_label || 'Your sites'}
              </h2>
            </div>
            <div className="iam-cms-shell__actions">
              {sites.length > 1 && activeSiteSlug ? (
                <details className="iam-cms-hub-page__site-menu">
                  <summary>
                    Switch site
                    <ChevronDown size={14} aria-hidden />
                  </summary>
                  <div className="iam-cms-hub-page__site-menu-list">
                    {sites.map((site) => (
                      <button
                        key={site.slug}
                        type="button"
                        className={site.slug === activeSiteSlug ? 'is-active' : ''}
                        onClick={() => void onSelectSite(site.slug, buildCmsHubPath(site.slug))}
                      >
                        {site.name || site.slug}
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
              <button type="button" className="iam-cms-shell__nav-link" onClick={() => onRetry()} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden />
                Refresh
              </button>
              <button type="button" className="iam-cms-shell__agent-btn" onClick={onOpenDeployWizard}>
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                New site
              </button>
            </div>
          </div>

          {loading ? (
            <div className="iam-cms-loading">Loading CMS…</div>
          ) : error ? (
            <div className="iam-cms-empty-card">
              <p className="font-medium text-[var(--text-heading)]">Could not load CMS</p>
              <p className="mt-1 text-sm text-muted">{error}</p>
              <button type="button" className="iam-cms-shell__nav-link mt-4" onClick={() => onRetry()}>
                Retry
              </button>
            </div>
          ) : sites.length === 0 ? (
            <div className="iam-cms-empty-card">
              <p className="text-sm text-muted">No CMS sites are configured for this workspace yet.</p>
              <button type="button" className="iam-cms-shell__agent-btn mt-4" onClick={onOpenDeployWizard}>
                Deploy your first site
              </button>
            </div>
          ) : showSitePicker ? (
            <>
              <p className="iam-cms-sites-hub__lead">Choose a site to open its command center.</p>
              <CmsSiteLauncherGrid
                sites={sites}
                onSelectSite={(site) => {
                  void onSelectSite(site.slug, buildCmsHubPath(site.slug));
                }}
              />
            </>
          ) : activeSiteSlug ? (
            <CmsDashboard
              siteSlug={activeSiteSlug}
              site={activeSite}
              context={context}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>

      <footer className="iam-cms-hub-page__foot">
        <div className="iam-cms-hub-page__foot-tags">
          <span>Multi-model AI</span>
          <span>Enterprise ready</span>
          <span>Open &amp; extensible</span>
          <span>Built for scale</span>
        </div>
        <p className="iam-cms-hub-page__foot-tagline">One request. An entire team on it.</p>
      </footer>
    </div>
  );
}
