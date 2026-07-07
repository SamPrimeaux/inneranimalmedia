import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import type { CmsWorkspaceContext, CmsWorkspaceSite } from '../../hooks/useCmsWorkspaceContext';
import type { CmsBootstrapData } from '../../../src/types/cms';
import { buildCmsPath } from './cmsRoute';
import { resolveStorefrontUrl, storefrontDisplayHost } from '../../../src/dashboard/cms/cmsStorefrontUrl';
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
  context?: CmsWorkspaceContext | null;
  onNavigate: (path: string) => void;
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

export function CmsDashboard({ siteSlug, site, context, onNavigate }: Props) {
  const [boot, setBoot] = useState<CmsBootstrapData | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const pages = boot?.pages || [];
  const themes = boot?.themes || [];
  const assets = boot?.assets || [];
  const imports = boot?.imports || [];
  const published = pages.filter((p) => String(p.status || '').toLowerCase() === 'published').length;
  const drafts = pages.filter((p) => String(p.status || '').toLowerCase() === 'draft').length;

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
        sub: `${drafts} draft${drafts === 1 ? '' : 's'} · ${published} live`,
        path: buildCmsPath({ panel: 'pages', siteSlug }),
        cta: 'Manage content',
      },
      {
        id: 'theme',
        title: 'Theme',
        sub: `${themes.length} theme${themes.length === 1 ? '' : 's'} available`,
        path: buildCmsPath({ panel: 'theme-editor', siteSlug }),
        cta: 'Open theme editor',
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
        sub: `${pages.length} page${pages.length === 1 ? '' : 's'} in sitemap`,
        path: buildCmsPath({ panel: 'theme-editor', siteSlug }),
        cta: 'View structure',
      },
    ],
    [drafts, published, themes.length, assets.length, pages.length, siteSlug],
  );

  const quickActions = useMemo(
    () => [
      { label: 'Create new page', path: buildCmsPath({ panel: 'pages', siteSlug }) },
      { label: 'Open theme editor', path: buildCmsPath({ panel: 'theme-editor', siteSlug }) },
      { label: 'Upload / import', path: buildCmsPath({ panel: 'imports', siteSlug }) },
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
              <h2 className="iam-cms-site-hero__name">{site?.name || context?.project_name || siteSlug}</h2>
              <p className="iam-cms-site-hero__meta">
                {storefrontDisplayHost(storefrontUrl) || siteSlug}
                {context?.api_profile ? ` · ${context.api_profile}` : ''}
              </p>
            </div>
            <span className="iam-cms-site-hero__live">
              <i aria-hidden />
              Live
            </span>
          </div>
          <div className="iam-cms-site-hero__stats">
            <div className="iam-cms-stat">
              <div className="iam-cms-stat__label">Pages</div>
              <div className="iam-cms-stat__value">{pages.length}</div>
            </div>
            <div className="iam-cms-stat">
              <div className="iam-cms-stat__label">Published</div>
              <div className="iam-cms-stat__value">{published}</div>
            </div>
            <div className="iam-cms-stat">
              <div className="iam-cms-stat__label">Drafts</div>
              <div className="iam-cms-stat__value">{drafts}</div>
            </div>
            <div className="iam-cms-stat">
              <div className="iam-cms-stat__label">Assets</div>
              <div className="iam-cms-stat__value">{assets.length}</div>
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
              Edit pages
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
          {modules.map((m) => (
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
          ))}
        </div>
      </div>

      <div className="iam-cms-dashboard__grid">
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
                <button type="button" onClick={() => onNavigate(a.path)}>
                  {a.label}
                  <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {context ? (
        <div className="iam-cms-runtime">
          Runtime:{' '}
          <code>{context.cms_hosting || 'platform'}</code>
          {context.bridge_supported ? ' · bridge' : ''}
          {context.worker_base_url ? (
            <>
              {' '}
              · worker <code>{context.worker_base_url.replace(/^https?:\/\//, '')}</code>
            </>
          ) : null}
          {imports.length ? ` · ${imports.length} import${imports.length === 1 ? '' : 's'}` : ''}
        </div>
      ) : null}
    </div>
  );
}

export default CmsDashboard;
