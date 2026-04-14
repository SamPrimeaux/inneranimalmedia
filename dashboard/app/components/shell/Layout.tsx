import React from 'react';
import { LayoutMode } from '../../hooks/useWorkbench';

interface LayoutProps {
  layoutMode: LayoutMode;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ layoutMode, children }) => {
  // Map layoutMode to CSS class
  const modeClass = `layout-${layoutMode}`;

  return (
    <div className={`layout-container ${modeClass}`}>
      {children}
    </div>
  );
};
