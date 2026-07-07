import React, { useCallback, useMemo } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CmsWorkspaceContext, CmsWorkspaceSite } from '../../hooks/useCmsWorkspaceContext';
import { IAM_AGENT_CHAT_COMPOSE } from '../../agentChatConstants';
import { CmsAgentComposeBar } from './CmsAgentComposeBar';
import { buildCmsHubPath, buildCmsPath } from './cmsRoute';
import './cmsShell.css';

export type CmsShellNav = 'hub' | 'pages' | 'theme-editor' | 'online-store' | 'templates' | 'imports';

type Props = {
  siteSlug: string;
  site?: CmsWorkspaceSite | null;
  context?: CmsWorkspaceContext | null;
  activeNav: CmsShellNav;
  children: React.ReactNode;
  showComposeBar?: boolean;
};

function siteInitials(name?: string | null, slug?: string | null): string {
  const src = (name || slug || 'CM').trim();
  const parts = src.split(/[\s·-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function displayDomain(site?: CmsWorkspaceSite | null, context?: CmsWorkspaceContext | null): string {
  const raw =
    site?.domain?.trim() ||
    context?.public_domain?.trim() ||
    context?.worker_base_url?.replace(/^https?:\/\//, '') ||
    site?.slug ||
    '';
  return raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function CmsShellLayout({
  siteSlug,
  site,
  context,
  activeNav,
  children,
  showComposeBar = false,
}: Props) {
  const navigate = useNavigate();
  const siteName = site?.name || context?.project_name || siteSlug;
  const domain = displayDomain(site, context);

  const navItems = useMemo(
    () =>
      [
        { id: 'hub' as const, label: 'Overview' },
        { id: 'pages' as const, label: 'Content' },
        { id: 'theme-editor' as const, label: 'Theme' },
        { id: 'online-store' as const, label: 'Store' },
        { id: 'templates' as const, label: 'Templates' },
      ] satisfies { id: CmsShellNav; label: string }[],
    [],
  );

  const openAgent = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
        detail: {
          message: '',
          send: false,
          ensureAgentPanel: true,
          project_slug: siteSlug,
          surface: 'cms',
        },
      }),
    );
  }, [siteSlug]);

  const goNav = useCallback(
    (nav: CmsShellNav) => {
      if (nav === 'hub') {
        navigate(buildCmsHubPath(siteSlug));
        return;
      }
      navigate(buildCmsPath({ panel: nav, siteSlug }));
    },
    [navigate, siteSlug],
  );

  return (
    <div className="iam-cms-shell">
      <header className="iam-cms-shell__top">
        <div className="iam-cms-shell__bar">
          <button
            type="button"
            className="iam-cms-shell__back"
            aria-label="All CMS sites"
            onClick={() => navigate('/dashboard/cms')}
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
          </button>
          <div className="iam-cms-shell__brand">
            <span className="iam-cms-shell__mark" aria-hidden>
              {siteInitials(siteName, siteSlug)}
            </span>
            <div className="iam-cms-shell__title-wrap">
              <h1 className="iam-cms-shell__title">{siteName}</h1>
              {domain ? <p className="iam-cms-shell__domain">{domain}</p> : null}
            </div>
          </div>
          <div className="iam-cms-shell__actions">
            <button type="button" className="iam-cms-shell__agent-btn" onClick={openAgent}>
              <Sparkles size={14} strokeWidth={1.75} aria-hidden />
              Agent Sam
            </button>
          </div>
        </div>
        <nav className="iam-cms-shell__nav" aria-label="CMS modules">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`iam-cms-shell__nav-link${activeNav === item.id ? ' is-active' : ''}`}
              onClick={() => goNav(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      {showComposeBar ? (
        <CmsAgentComposeBar siteSlug={siteSlug} siteName={siteName} />
      ) : null}
      <div className="iam-cms-shell__body">{children}</div>
    </div>
  );
}
