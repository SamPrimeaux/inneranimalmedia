import React from 'react';
import type { ActiveFile } from '../types';
import { DriveExplorerPanel } from './DriveExplorerPanel';

export const GoogleDriveExplorer: React.FC<{
  onOpenInEditor?: (file: ActiveFile) => void;
}> = ({ onOpenInEditor }) => {
  return (
    <div className="w-full h-full min-h-0 overflow-hidden flex flex-col bg-[var(--bg-panel)]">
      <DriveExplorerPanel onOpenInEditor={onOpenInEditor} />
    </div>
  );
};

export default GoogleDriveExplorer;
