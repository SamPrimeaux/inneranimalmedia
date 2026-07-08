import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, MoreHorizontal, Plus } from 'lucide-react';
import type { CmsWorkspaceContext, CmsWorkspaceSite } from '../../hooks/useCmsWorkspaceContext';
import type { CmsBootstrapData } from '../../../src/types/cms';
import { buildCmsHubPath, buildCmsPath } from './cmsRoute';
import { resolveStorefrontUrl, storefrontDisplayHost } from '../../../src/dashboard/cms/cmsStorefrontUrl';
import { CmsConnectedIntegrations } from './CmsConnectedIntegrations';
import { CmsSiteStructurePanel } from './CmsSiteStructurePanel';
import { useCmsConnectedIntegrations } from './useCmsConnectedIntegrations';
import { useCmsLinkedProject } from './useCmsLinkedProject';
import { AppIcon } from '../../components/ui/AppIcon';
import { updateProject } from '../../api/projects';
import { cfImageVariants, projectAccentHue } from '../../src/lib/projectBranding';
import { parseProjectMeta } from '../projects/projectDetailMeta';
import { uploadProjectR2File } from '../../src/lib/projectR2Upload';
import './cmsShell.css';

type ActivityRow = {
  id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  created_at?: number | string;
  details?: string | Record<string, unknown>;
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

function activityLabel(row: ActivityRow): string {
  const action = String(row.action || 'update').replace(/_/g, ' ');
  const type = String(row.resource_type || '').replace(/_/g, ' ');
  let detail = '';
  if (row.details) {
    try {
      const parsed =
        typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      detail =
        String(parsed.section_name || parsed.route_path || parsed.template_id || '').trim();
    } catch {
      detail = typeof row.details === 'string' ? row.details.slice(0, 48) : '';
    }
  }
  const parts = [action, type, detail || row.resource_id].filter(Boolean);
  return parts.join(' · ');
}

function activityStatus(row: ActivityRow): 'published' | 'draft' {
  const action = String(row.action || '').toLowerCase();
  if (action.includes('publish') || action.includes('deploy')) return 'published';
  return 'draft';
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
  const [structureOpen, setStructureOpen] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);
  const [localIconUrl, setLocalIconUrl] = useState<string | null>(null);
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
  const { project: linkedProject, refresh: refreshLinkedProject } = useCmsLinkedProject(siteSlug, true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ project_slug: siteSlug });
      const actQ = new URLSearchParams({ project_slug: siteSlug });
      const [bootRes, actRes] = await Promise.all([
        fetch(`/api/cms/bootstrap?${q}`, { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/cms/activity?${actQ}`, { credentials: 'include', cache: 'no-store' }),
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
    setLocalIconUrl(null);
  }, [siteSlug, linkedProject?.cover_image_url]);

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
  const componentTemplates = boot?.component_templates || [];
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

  const siteIconUrl =
    localIconUrl ||
    linkedProject?.cover_image_url ||
    site?.logo_url ||
    null;
  const siteDisplayName = site?.name || context?.project_name || siteSlug;

  const handleIconDrop = useCallback(
    async (file: File) => {
      if (!linkedProject?.id) return;
      setIconUploading(true);
      try {
        const out = await uploadProjectR2File(
          linkedProject.id,
          file,
          'cover',
          context?.workspace_id || undefined,
        );
        if (!out.ok || !out.url) throw new Error(out.error || 'Upload failed');
        const meta = { ...parseProjectMeta(linkedProject.metadata_json), cover_image_url: out.url };
        const res = await updateProject(linkedProject.id, {
          metadata_json: JSON.stringify(meta),
        });
        if (!res.ok) throw new Error(res.error || 'Could not save project icon');
        setLocalIconUrl(out.url);
        void refreshLinkedProject();
      } catch (e) {
        console.error(e);
      } finally {
        setIconUploading(false);
      }
    },
    [linkedProject, context?.workspace_id, refreshLinkedProject],
  );

  const modules = useMemo(
    () => [
      {
        id: 'project',
        title: 'Project',
        desc: linkedProject
          ? 'Jump to the dashboard project linked to this CMS site.'
          : 'Connect a dashboard project for shared icons, rules, and memory.',
        sub: linkedProject ? linkedProject.name : 'Browse projects',
        path: linkedProject
          ? `/dashboard/projects/${encodeURIComponent(linkedProject.id)}`
          : '/dashboard/projects',
        cta: linkedProject ? 'Open project →' : 'Browse projects →',
      },
      {
        id: 'media',
        title: 'Media',
        desc: 'Manage images, video, and files in this site’s media library.',
        sub: `${assets.length} asset${assets.length === 1 ? '' : 's'}`,
        path: buildCmsPath({ panel: 'media', siteSlug }),
        cta: 'Open media library →',
      },
      {
        id: 'structure',
        title: 'Structure',
        desc: 'Bindings, domains, hosting profile, and site-specific configuration.',
        sub: 'Bindings & site specifics',
        action: 'structure' as const,
        cta: 'View bindings →',
      },
      {
        id: 'templates',
        title: 'Templates',
        desc: 'Platform-wide page templates and section blocks from D1 + R2.',
        sub: `${componentTemplates.length}+ global block${componentTemplates.length === 1 ? '' : 's'}`,
        path: buildCmsPath({ panel: 'templates', siteSlug }),
        cta: 'Browse library →',
      },
    ],
    [linkedProject, assets.length, componentTemplates.length, siteSlug],
  );

  const quickActions = useMemo(
    () => [
      { label: 'Create new page', path: buildCmsPath({ panel: 'theme-editor', siteSlug }) },
      { label: 'Browse templates', path: buildCmsPath({ panel: 'templates', siteSlug }) },
      { label: 'Upload media', path: buildCmsPath({ panel: 'media', siteSlug }) },
      { label: 'Import theme', action: 'import' as const },
      { label: 'Manage redirects', path: buildCmsPath({ panel: 'pages', siteSlug }) },
    ],
    [siteSlug],
  );

  if (loading) {
    return (
      <div className="iam-cms-skeleton" aria-busy="true" aria-label="Loading CMS command center">
        <div className="iam-cms-skeleton__hero">
          <div className="iam-cms-skeleton__card iam-cms-skeleton__card--wide" style={{ padding: 16 }}>
            <div className="iam-cms-skeleton__block" style={{ width: 120, height: 12, marginBottom: 12 }} />
            <div className="iam-cms-skeleton__block" style={{ width: '55%', height: 22, marginBottom: 10 }} />
            <div className="iam-cms-skeleton__block" style={{ width: '40%', height: 12, marginBottom: 20 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="iam-cms-skeleton__block" style={{ height: 36 }} />
              ))}
            </div>
          </div>
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="iam-cms-skeleton__card" style={{ padding: 14 }}>
              <div className="iam-cms-skeleton__block" style={{ width: 32, height: 32, borderRadius: 8, marginBottom: 12 }} />
              <div className="iam-cms-skeleton__block" style={{ width: '70%', height: 12, marginBottom: 8 }} />
              <div className="iam-cms-skeleton__block" style={{ width: '45%', height: 10 }} />
            </div>
          ))}
        </div>
        <div className="iam-cms-skeleton__grid">
          {[1, 2, 3].map(n => (
            <div key={n} className="iam-cms-skeleton__card" style={{ padding: 14, minHeight: 220 }}>
              <div className="iam-cms-skeleton__block" style={{ width: '50%', height: 12, marginBottom: 16 }} />
              {[1, 2, 3, 4].map(row => (
                <div key={row} className="iam-cms-skeleton__block" style={{ height: 28, marginBottom: 8 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
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
            <div className="iam-cms-site-hero__identity">
              <AppIcon
                title={siteDisplayName}
                imageUrl={cfImageVariants(siteIconUrl).src || undefined}
                backgroundColor={
                  siteIconUrl ? undefined : `hsl(${projectAccentHue(linkedProject?.id || siteSlug)} 42% 38%)`
                }
                size="lg"
                editable={Boolean(linkedProject?.id)}
                disabled={iconUploading}
                onImageDrop={linkedProject?.id ? handleIconDrop : undefined}
              />
              <div>
                <p className="iam-cms-site-hero__suite">Active site · CMS Suite</p>
                <h2 className="iam-cms-site-hero__name">{siteDisplayName}</h2>
                <p className="iam-cms-site-hero__meta">
                  {storefrontDisplayHost(storefrontUrl) || siteSlug}
                  {drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : ''}
                </p>
              </div>
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
            'action' in m && m.action === 'structure' ? (
              <button
                key={m.id}
                type="button"
                className={`iam-cms-card iam-cms-module${structureOpen ? ' is-active' : ''}`}
                onClick={() => setStructureOpen((v) => !v)}
              >
                <h3 className="iam-cms-module__title">{m.title}</h3>
                <p className="iam-cms-module__desc">{m.desc}</p>
                <p className="iam-cms-module__sub">{m.sub}</p>
                <span className="iam-cms-module__cta">{m.cta}</span>
              </button>
            ) : (
              <button
                key={m.id}
                type="button"
                className="iam-cms-card iam-cms-module"
                onClick={() => onNavigate((m as { path: string }).path)}
              >
                <h3 className="iam-cms-module__title">{m.title}</h3>
                <p className="iam-cms-module__desc">{m.desc}</p>
                <p className="iam-cms-module__sub">{m.sub}</p>
                <span className="iam-cms-module__cta">{m.cta}</span>
              </button>
            ),
          )}
        </div>
      </div>

      {structureOpen ? (
        <CmsSiteStructurePanel
          siteSlug={siteSlug}
          context={context}
          pageCount={pages.length}
          themeCount={themes.length}
          importCount={imports.length}
        />
      ) : null}

      <div className="iam-cms-dashboard__grid iam-cms-dashboard__grid--three">
        <section className="iam-cms-card">
          <div className="iam-cms-panel-head">Recent activity</div>
          {activity.length ? (
            <ul className="iam-cms-activity">
              {activity.map((row, i) => {
                const status = activityStatus(row);
                return (
                  <li key={row.id || i}>
                    <span className="iam-cms-activity__action">{activityLabel(row)}</span>
                    <span className="iam-cms-activity__meta">
                      <span className={`iam-cms-activity__tag is-${status}`}>
                        {status === 'published' ? 'Published' : 'Draft'}
                      </span>
                      <span className="iam-cms-activity__when">{formatWhen(row.created_at)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="iam-cms-site-hero__meta" style={{ padding: '16px' }}>
              {pages.length
                ? `${pages.length} page${pages.length === 1 ? '' : 's'} on this site — edits will appear here.`
                : 'No recent activity logged yet.'}
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
                      document
                        .querySelector('.iam-cms-import-strip')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
