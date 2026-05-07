import React from 'react';
import { ThemeBrowser } from './themes/ThemeBrowser';

interface ThemeSwitcherProps {
  workspaceId?: string | null;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ workspaceId }) => {
  return <ThemeBrowser workspaceId={workspaceId} />;
};
