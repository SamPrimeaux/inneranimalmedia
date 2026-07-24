import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ImageIcon } from 'lucide-react';
import { IMAGES_TABS } from './imagesRegistry';

export type ImagesOutletContext = {
  workspaceId?: string | null;
};

export type ImagesShellProps = {
  workspaceId?: string | null;
};

export function ImagesShell({ workspaceId }: ImagesShellProps) {
  const ctx: ImagesOutletContext = { workspaceId };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
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
