import React from 'react';
import { ThemeSwitcher } from '../../ThemeSwitcher';

export type ThemesSectionProps = { workspaceId?: string | null };

export function ThemesSection({ workspaceId }: ThemesSectionProps) {
  return <ThemeSwitcher workspaceId={workspaceId} />;
}
