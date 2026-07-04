import React from 'react';
import { FolderOpen, LayoutGrid, Upload } from 'lucide-react';
import { StartupChipRow } from '../../../shell/chat-startup/StartupChipRow';

export type StudioStartupChipsProps = {
  className?: string;
  disabled?: boolean;
  onOpenStudio: () => void;
  onImportGlb: () => void;
  onBrowseLibrary: () => void;
};

export function StudioStartupChips({
  className,
  disabled = false,
  onOpenStudio,
  onImportGlb,
  onBrowseLibrary,
}: StudioStartupChipsProps) {
  return (
    <StartupChipRow
      className={className}
      ariaLabel="Design Studio quick actions"
      chips={[
        { id: 'studio',  label: 'Open studio',    icon: LayoutGrid, disabled, onClick: onOpenStudio },
        { id: 'import',  label: 'Import GLB',     icon: Upload,     disabled, onClick: onImportGlb },
        { id: 'library', label: 'Browse library', icon: FolderOpen, disabled, onClick: onBrowseLibrary },
      ]}
    />
  );
}
