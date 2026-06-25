import React from 'react';
import type { ActiveFile } from '../types';
import DrivePage from '../pages/DrivePage';

export const GoogleDriveExplorer: React.FC<{
  onOpenInEditor?: (file: ActiveFile) => void;
}> = ({ onOpenInEditor }) => {
  return (
    <div className="w-full h-full min-h-0 overflow-hidden bg-[#f8fafd]">
      <DrivePage onOpenInEditor={onOpenInEditor} />
    </div>
  );
};

export default GoogleDriveExplorer;
