import React, { useMemo } from 'react';
import { AppIcon } from '../../components/ui/AppIcon';
import { projectAccentHue } from '../../src/lib/projectBranding';
import type { CmsWorkspaceSite } from '../../hooks/useCmsWorkspaceContext';

const FEATURED_SLUG_ORDER = [
  'inneranimalmedia',
  'companionscpas',
  'fuelnfreetime',
  'meauxbility',
];

export type CmsSiteLauncherGridProps = {
  sites: CmsWorkspaceSite[];
  activeSlug?: string | null;
  onSelectSite: (site: CmsWorkspaceSite) => void;
  className?: string;
};

function sortFeaturedSites(sites: CmsWorkspaceSite[]): CmsWorkspaceSite[] {
  const bySlug = new Map(sites.map((s) => [s.slug, s]));
  const featured: CmsWorkspaceSite[] = [];
  for (const slug of FEATURED_SLUG_ORDER) {
    const row = bySlug.get(slug);
    if (row) featured.push(row);
  }
  for (const site of sites) {
    if (!FEATURED_SLUG_ORDER.includes(site.slug)) featured.push(site);
  }
  return featured;
}

function siteSubtitle(site: CmsWorkspaceSite): string {
  const domain = site.domain?.trim();
  if (domain) return domain.replace(/^https?:\/\//, '');
  if (site.cms_hosting === 'client_worker') return 'Client worker CMS';
  return site.slug;
}

export function CmsSiteLauncherGrid({
  sites,
  activeSlug,
  onSelectSite,
  className = '',
}: CmsSiteLauncherGridProps) {
  const rows = useMemo(() => sortFeaturedSites(sites), [sites]);

  if (!rows.length) return null;

  return (
    <section
      className={`cms-site-launcher ${className}`.trim()}
      aria-label="CMS sites"
    >
      <div className="cms-site-launcher__grid">
        {rows.map((site) => {
          const active = activeSlug === site.slug;
          const hue = projectAccentHue(site.slug);
          const fallbackBg = site.primary_color?.trim() || `hsl(${hue} 52% 42%)`;
          return (
            <div
              key={site.slug}
              className={`cms-site-launcher__cell${active ? ' is-active' : ''}`}
            >
              <AppIcon
                title={site.name || site.slug}
                subtitle={siteSubtitle(site)}
                imageUrl={site.logo_url}
                backgroundColor={fallbackBg}
                presentation="app"
                size="lg"
                onPress={() => onSelectSite(site)}
              />
              {site.cms_hosting === 'client_worker' ? (
                <span className="cms-site-launcher__badge">Client</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <style>{`
        .cms-site-launcher { margin: 0 0 28px; }
        .cms-site-launcher__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
          gap: 20px 16px;
          max-width: 560px;
        }
        .cms-site-launcher__cell {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .cms-site-launcher__cell.is-active .iam-app-icon-shell {
          box-shadow: 0 0 0 2px var(--color-primary, var(--solar-cyan, #007AFF)),
            0 12px 32px color-mix(in srgb, var(--color-primary, #007AFF) 22%, transparent);
        }
        .cms-site-launcher__badge {
          position: absolute;
          top: -4px;
          right: 4px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--dashboard-panel, #fff) 92%, transparent);
          border: 1px solid var(--dashboard-border, rgba(0,0,0,.08));
          color: var(--dashboard-muted, #64748b);
        }
        @media (min-width: 720px) {
          .cms-site-launcher__grid {
            grid-template-columns: repeat(4, minmax(0, 108px));
          }
        }
      `}</style>
    </section>
  );
}

export default CmsSiteLauncherGrid;
