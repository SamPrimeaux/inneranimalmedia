import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PanelRightClose, PanelRightOpen, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CmsWorkspaceContext, CmsWorkspaceSite } from '../../hooks/useCmsWorkspaceContext';
import {
  IAM_AGENT_CHAT_COMPOSE,
  IAM_AGENT_COLLAPSE_PANEL,
  IAM_AGENT_ENSURE_PANEL,
  IAM_AGENT_PANEL_CHANGED,
} from '../../agentChatConstants';
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
  /** Hub/overview compose strip — hidden on live editor routes for max canvas. */
  showComposeBar?: boolean;
  onComposeToggle?: (open: boolean) => void;
  /** Editor routes use global Agent Sam rail toggle instead of compose strip. */
  editorMode?: boolean;
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
  onComposeToggle,
  editorMode = false,
}: Props) {
  const navigate = useNavigate();
  const siteName = site?.name || context?.project_name || siteSlug;
  const domain = displayDomain(site, context);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);

  useEffect(() => {
    const onPanelChanged = (e: Event) => {
      const open = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
      setAgentPanelOpen(open);
    };
    window.addEventListener(IAM_AGENT_PANEL_CHANGED, onPanelChanged);
    return () => window.removeEventListener(IAM_AGENT_PANEL_CHANGED, onPanelChanged);
  }, []);

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

  const toggleAgentPanel = useCallback(() => {
    if (editorMode) {
      if (agentPanelOpen) {
        window.dispatchEvent(new CustomEvent(IAM_AGENT_COLLAPSE_PANEL));
      } else {
        window.dispatchEvent(new CustomEvent(IAM_AGENT_ENSURE_PANEL));
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
      }
      return;
    }

    if (showComposeBar) {
      window.dispatchEvent(
        new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
          detail: {
            message: '',
            send: false,
            ensureAgentPanel: false,
            closePanel: true,
          },
        }),
      );
      onComposeToggle?.(false);
      return;
    }
    window.dispatchEvent(new CustomEvent(IAM_AGENT_ENSURE_PANEL));
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
    onComposeToggle?.(true);
  }, [agentPanelOpen, editorMode, onComposeToggle, showComposeBar, siteSlug]);

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

  const agentOpen = editorMode ? agentPanelOpen : showComposeBar;
  const shellClass = `iam-cms-shell${editorMode ? ' iam-cms-shell--editor' : ''}`;

  return (
    <div className={shellClass}>
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
            <button
              type="button"
              className={`iam-cms-shell__agent-btn${agentOpen ? ' is-active' : ''}`}
              onClick={toggleAgentPanel}
              aria-pressed={agentOpen}
              title={agentOpen ? 'Hide Agent Sam panel' : 'Open Agent Sam'}
            >
              {agentOpen ? (
                <PanelRightClose size={14} strokeWidth={1.75} aria-hidden />
              ) : (
                <Sparkles size={14} strokeWidth={1.75} aria-hidden />
              )}
              {agentOpen ? 'Hide agent' : 'Agent Sam'}
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
      {showComposeBar && !editorMode ? (
        <CmsAgentComposeBar siteSlug={siteSlug} siteName={siteName} />
      ) : null}
      <div className="iam-cms-shell__body">{children}</div>
      {editorMode && !agentPanelOpen ? (
        <button
          type="button"
          className="iam-cms-shell__agent-fab"
          onClick={toggleAgentPanel}
          aria-label="Open Agent Sam"
          title="Agent Sam"
        >
          <PanelRightOpen size={18} strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
