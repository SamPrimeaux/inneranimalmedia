import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, ImageIcon } from 'lucide-react';
import { IMAGES_TABS } from './imagesRegistry';

export type ImagesOutletContext = {
  workspaceId?: string | null;
  setDocsUrl: (url: string | null) => void;
};

export type ImagesShellProps = {
  workspaceId?: string | null;
};

const CF_IMAGES_DOCS_URL = 'https://developers.cloudflare.com/images/';

/**
 * Lets a nested page override the shell's "Documentation" link to a more specific
 * CF doc page for the duration it's mounted (e.g. Create Variant -> the
 * create-variants doc, Edit -> the transform/binding doc), falling back to the
 * general Images docs link everywhere else. Usage in a page:
 *   const { setDocsUrl } = useOutletContext<ImagesOutletContext>();
 *   useEffect(() => { setDocsUrl(URL); return () => setDocsUrl(null); }, [setDocsUrl]);
 */
export function ImagesShell({ workspaceId }: ImagesShellProps) {
  const [docsUrlOverride, setDocsUrlOverride] = useState<string | null>(null);
  const ctx: ImagesOutletContext = useMemo(
    () => ({ workspaceId, setDocsUrl: setDocsUrlOverride }),
    [workspaceId],
  );
  const docsUrl = docsUrlOverride || CF_IMAGES_DOCS_URL;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-app)',
        color: 'var(--text-main)',
        fontFamily: 'inherit',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '16px 24px 0',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ImageIcon size={18} style={{ color: 'var(--solar-cyan)', flexShrink: 0 }} />
            <h1
              style={{
                margin: 0,
                fontWeight: 600,
                fontSize: 15,
                letterSpacing: '0.02em',
                color: 'var(--text-main)',
              }}
            >
              Hosted images
            </h1>
          </div>
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-main)',
              fontSize: 12,
              fontWeight: 500,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <BookOpen size={13} />
            Documentation
          </a>
        </div>
        <nav style={{ display: 'flex', gap: 0, overflowX: 'auto' }} aria-label="Images sections">
          {IMAGES_TABS.map((tab) => (
            <NavLink
              key={tab.id}
              to={tab.path}
              style={({ isActive }) => ({
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--solar-cyan)' : 'var(--text-muted)',
                textDecoration: 'none',
                borderBottom: isActive
                  ? '2px solid var(--solar-cyan)'
                  : '2px solid transparent',
                whiteSpace: 'nowrap',
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet context={ctx} />
      </div>
    </div>
  );
}

export default ImagesShell;
