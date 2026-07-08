import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, MoreHorizontal, Plus } from 'lucide-react';
import type { CmsWorkspaceContext, CmsWorkspaceSite } from '../../hooks/useCmsWorkspaceContext';
import type { CmsBootstrapData } from '../../../src/types/cms';
import { buildCmsHubPath, buildCmsPath } from './cmsRoute';
import { resolveStorefrontUrl, storefrontDisplayHost } from '../../../src/dashboard/cms/cmsStorefrontUrl';
import { CmsConnectedIntegrations } from './CmsConnectedIntegrations';
import { useCmsConnectedIntegrations } from './useCmsConnectedIntegrations';
import './cmsShell.css';

type ActivityRow = {
  id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  created_at?: number | string;
  details?: string;
};

type Props = {
  siteSlug: string;
  site?: CmsWorkspaceSite | null;
  sites?: CmsWorkspaceSite[];
  context?: CmsWorkspaceContext | null;
  onNavigate: (path: string) => void;
  onSelectSite?: (slug: string, path: string) => void | Promise<void>;
  onOpenDeployWizard?: () => void;
};

function formatWhen(value: unknown): string {
  if (value == null || value === '') return 'Recently';
  const n = Number(value);
  const d = Number.isFinite(n) && n > 100000 ? new Date(n * 1000) : new Date(String(value));
  if (Number.isNaN(d.getTime())) return 'Recently';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function CmsDashboard({
  siteSlug,
  site,
  sites = [],
  context,
  onNavigate,
  onSelectSite,
  onOpenDeployWizard,
}: Props) {
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const siteMenuRef = useRef<HTMLDivElement>(null);
  const [boot, setBoot] = useState<CmsBootstrapData | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    items: connectedIntegrations,
    loading: integrationsLoading,
    error: integrationsError,
    refresh: refreshIntegrations,
    connectedCount,
  } = useCmsConnectedIntegrations(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ project_slug: siteSlug });
      const [bootRes, actRes] = await Promise.all([
        fetch(`/api/cms/bootstrap?${q}`, { credentials: 'include', cache: 'no-store' }),
        fetch('/api/cms/activity', { credentials: 'include', cache: 'no-store' }),
      ]);
      const bootJson = (await bootRes.json()) as CmsBootstrapData & { error?: string };
      if (!bootRes.ok) throw new Error(bootJson.error || `Bootstrap HTTP ${bootRes.status}`);
      setBoot(bootJson);
      if (actRes.ok) {
        const actJson = (await actRes.json()) as { activity?: ActivityRow[] };
        setActivity(Array.isArray(actJson.activity) ? actJson.activity.slice(0, 8) : []);
      } else {
        setActivity([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CMS overview');
    } finally {
      setLoading(false);
    }
  }, [siteSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!siteMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (siteMenuRef.current && !siteMenuRef.current.contains(e.target as Node)) {
        setSiteMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [siteMenuOpen]);

  const pages = boot?.pages || [];
  const themes = boot?.themes || [];
  const assets = boot?.assets_3d || boot?.assets || [];
  const imports = boot?.imports || [];
  const navMenus = boot?.nav_menus || [];
  const sections = boot?.sections || Object.values(boot?.sections_by_page || {}).flat();
  const drafts = pages.filter((p) => String(p.status || '').toLowerCase() === 'draft').length;
  const collectionCount = useMemo(() => {
    const sectionTypes = new Set(
      sections.map((s) => String((s as { section_type?: string }).section_type || '').trim()).filter(Boolean),
    );
    if (sectionTypes.size > 0) return sectionTypes.size;
    return navMenus.length;
  }, [sections, navMenus.length]);

  const storefrontUrl = useMemo(
    () =>
      resolveStorefrontUrl({
        projectSlug: siteSlug,
        siteDomain: site?.domain,
        publicDomain: context?.public_domain,
      }),
    [siteSlug, site?.domain, context?.public_domain],
  );

  const modules = useMemo(
    () => [
      {
        id: 'content',
        title: 'Content',
        sub: `${drafts} draft${drafts === 1 ? '' : 's'}`,
        path: buildCmsPath({ panel: 'pages', siteSlug }),
        cta: 'Manage content',
      },
      {
        id: 'media',
        title: 'Media',
        sub: `${assets.length} asset${assets.length === 1 ? '' : 's'}`,
        path: buildCmsPath({ panel: 'pages', siteSlug }),
        cta: 'Open media library',
      },
      {
        id: 'structure',
        title: 'Structure',
        sub: `${navMenus.length || pages.length} menu${(navMenus.length || pages.length) === 1 ? '' : 's'}`,
        path: buildCmsPath({ panel: 'theme-editor', siteSlug }),
        cta: 'View structure',
      },
      {
        id: 'settings',
        title: 'Settings',
        sub: `${connectedCount} integration${connectedCount === 1 ? '' : 's'} connected`,
        path: '/dashboard/settings?section=integrations',
        cta: 'Site settings',
        external: true,
      },
    ],
    [drafts, assets.length, navMenus.length, pages.length, connectedCount, siteSlug],
  );

  const quickActions = useMemo(
    () => [
      { label: 'Create new page', path: buildCmsPath({ panel: 'pages', siteSlug }) },
      { label: 'Browse templates', path: buildCmsPath({ panel: 'templates', siteSlug }) },
      { label: 'Open theme editor', path: buildCmsPath({ panel: 'theme-editor', siteSlug }) },
      { label: 'Import theme (drop above)', action: 'import' as const },
      { label: 'Online store preview', path: buildCmsPath({ panel: 'online-store', siteSlug }) },
    ],
    [siteSlug],
  );

  if (loading) {
    return <div className="iam-cms-loading">Loading command center…</div>;
  }

  if (error) {
    return (
      <div className="iam-cms-dashboard">
        <div className="iam-cms-card iam-cms-site-hero">
          <p className="iam-cms-site-hero__meta">{error}</p>
          <button type="button" className="iam-cms-btn" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="iam-cms-dashboard">
      <div className="iam-cms-dashboard__hero">
        <section className="iam-cms-card iam-cms-site-hero">
          <div className="iam-cms-site-hero__head">
            <div>
              <p className="iam-cms-site-hero__suite">CMS Suite</p>
              <h2 className="iam-cms-site-hero__name">{site?.name || context?.project_name || siteSlug}</h2>
              <p className="iam-cms-site-hero__meta">
                {storefrontDisplayHost(storefrontUrl) || siteSlug}
              </p>
            </div>
            <div className="iam-cms-site-hero__head-actions">
              <span className="iam-cms-site-hero__live">
                <i aria-hidden />
                Live
              </span>
              {sites.length > 1 && onSelectSite ? (
                <div className="iam-cms-site-menu" ref={siteMenuRef}>
                  <button
                    type="button"
                    className="iam-cms-site-menu__trigger"
                    aria-label="Switch site"
                    aria-expanded={siteMenuOpen}
                    onClick={() => setSiteMenuOpen((v) => !v)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {siteMenuOpen ? (
                    <div className="iam-cms-site-menu__list" role="menu">
                      {sites.map((row) => (
                        <button
                          key={row.slug}
                          type="button"
                          role="menuitem"
                          className={row.slug === siteSlug ? 'is-active' : ''}
                          onClick={() => {
                            setSiteMenuOpen(false);
                            void onSelectSite(row.slug, buildCmsHubPath(row.slug));
                          }}
                        >
                          {row.name || row.slug}
                        </button>
                      ))}
                      {onOpenDeployWizard ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="iam-cms-site-menu__new"
                          onClick={() => {
                            setSiteMenuOpen(false);
                            onOpenDeployWizard();
                          }}
                        >
                          <Plus size={14} aria-hidden />
                          New site
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="iam-cms-site-hero__stats">
            <div className="iam-cms-stat">
              <div className="iam-cms-stat__label">Pages</div>
              <div className="iam-cms-stat__value">{pages.length}</div>
            </div>
            <div className="iam-cms-stat">
              <div className="iam-cms-stat__label">Collections</div>
              <div className="iam-cms-stat__value">{collectionCount}</div>
            </div>
            <div className="iam-cms-stat">
              <div className="iam-cms-stat__label">Integrations</div>
              <div className="iam-cms-stat__value">{connectedCount}</div>
            </div>
            <div className="iam-cms-stat">
              <div className="iam-cms-stat__label">Themes</div>
              <div className="iam-cms-stat__value">{themes.length}</div>
            </div>
          </div>
          <div className="iam-cms-site-hero__actions">
            <button
              type="button"
              className="iam-cms-btn iam-cms-btn--primary"
              onClick={() => onNavigate(buildCmsPath({ panel: 'theme-editor', siteSlug }))}
            >
              Open CMS
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className="iam-cms-btn"
              onClick={() => onNavigate(buildCmsPath({ panel: 'pages', siteSlug }))}
            >
              Edit site
            </button>
            {storefrontUrl ? (
              <a
                className="iam-cms-btn"
                href={storefrontUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View site
                <ExternalLink size={14} strokeWidth={2} aria-hidden />
              </a>
            ) : null}
          </div>
        </section>

        <div className="iam-cms-modules">
          {modules.map((m) =>
            (m as { external?: boolean }).external ? (
              <a key={m.id} className="iam-cms-card iam-cms-module" href={m.path}>
                <h3 className="iam-cms-module__title">{m.title}</h3>
                <p className="iam-cms-module__sub">{m.sub}</p>
                <span className="iam-cms-module__cta">{m.cta}</span>
              </a>
            ) : (
              <button
                key={m.id}
                type="button"
                className="iam-cms-card iam-cms-module"
                onClick={() => onNavigate(m.path)}
              >
                <h3 className="iam-cms-module__title">{m.title}</h3>
                <p className="iam-cms-module__sub">{m.sub}</p>
                <span className="iam-cms-module__cta">{m.cta}</span>
              </button>
            ),
          )}
        </div>
      </div>

      <div className="iam-cms-dashboard__grid iam-cms-dashboard__grid--three">
        <section className="iam-cms-card">
          <div className="iam-cms-panel-head">Recent activity</div>
          {activity.length ? (
            <ul className="iam-cms-activity">
              {activity.map((row, i) => (
                <li key={row.id || i}>
                  <span className="iam-cms-activity__action">
                    {row.action || row.resource_type || 'Update'}
                    {row.resource_id ? ` · ${row.resource_id}` : ''}
                  </span>
                  <span className="iam-cms-activity__when">{formatWhen(row.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="iam-cms-site-hero__meta" style={{ padding: '16px' }}>
              No recent platform activity yet — edits on federated client sites appear in their runtime.
            </p>
          )}
        </section>

        <section className="iam-cms-card">
          <div className="iam-cms-panel-head">Quick actions</div>
          <ul className="iam-cms-quick">
            {quickActions.map((a) => (
              <li key={a.label}>
                <button
                  type="button"
                  onClick={() => {
                    if ('action' in a && a.action === 'import') {
                      document.querySelector('.iam-cms-import-strip')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      return;
                    }
                    if ('path' in a && a.path) onNavigate(a.path);
                  }}
                >
                  {a.label}
                  <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <CmsConnectedIntegrations
          items={connectedIntegrations}
          loading={integrationsLoading}
          error={integrationsError}
          onRetry={() => {
            void refreshIntegrations();
          }}
        />
      </div>

      {context ? (
        <div className="iam-cms-runtime iam-cms-muted">
          Hosting profile: {context.cms_hosting || 'platform'}
          {context.bridge_supported ? ' · bridge' : ''}
          {imports.length ? ` · ${imports.length} import${imports.length === 1 ? '' : 's'}` : ''}
        </div>
      ) : null}
    </div>
  );
}

export default CmsDashboard;
