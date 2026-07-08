import React, { useMemo } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import type { CmsWorkspaceContext, CmsWorkspaceSite } from '../../hooks/useCmsWorkspaceContext';
import { CmsDashboard, type CmsDashboardSetupMode } from './CmsDashboard';
import { CmsGuidedChatHero } from './CmsGuidedChatHero';
import { CmsHubImportStrip } from './CmsHubImportStrip';
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

  const setupMode: CmsDashboardSetupMode = useMemo(() => {
    if (loading) return 'loading';
    if (sites.length === 0) return 'deploy';
    if (sites.length > 1 && !activeSiteSlug) return 'pick-site';
    if (activeSiteSlug) return 'active';
    if (sites.length === 1) return 'active';
    return 'deploy';
  }, [loading, sites.length, activeSiteSlug]);

  const effectiveSiteSlug =
    activeSiteSlug || (sites.length === 1 ? sites[0]?.slug : null) || null;

  return (
    <div className="iam-cms-shell iam-cms-hub-page">
      <div className="iam-cms-hub-page__scroll">
        <CmsGuidedChatHero
          siteSlug={effectiveSiteSlug}
          siteName={activeSite?.name || context?.project_name}
        />

        <div className="iam-cms-hub-page__body">
          <div className="iam-cms-hub-page__toolbar iam-cms-hub-page__toolbar--compact">
            <p className="iam-cms-shell__kicker">CMS command center</p>
            <div className="iam-cms-shell__actions">
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

          {error ? (
            <div className="iam-cms-empty-card iam-cms-empty-card--inline">
              <p className="iam-cms-empty-card__title">Could not load workspace CMS context</p>
              <p className="iam-cms-muted">{error}</p>
              <button type="button" className="iam-cms-shell__nav-link mt-4" onClick={() => onRetry()}>
                Retry
              </button>
            </div>
          ) : null}

          {effectiveSiteSlug && setupMode === 'active' ? (
            <CmsHubImportStrip projectSlug={effectiveSiteSlug} />
          ) : null}

          <CmsDashboard
            siteSlug={effectiveSiteSlug}
            setupMode={setupMode}
            site={activeSite}
            sites={sites}
            context={context}
            onNavigate={onNavigate}
            onSelectSite={onSelectSite}
            onOpenDeployWizard={onOpenDeployWizard}
          />
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
