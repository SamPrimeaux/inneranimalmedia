import React from 'react';
import { FolderOpen, LayoutGrid, Upload } from 'lucide-react';

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
    <div
      className={`iam-chat-startup-chips${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="Design Studio quick actions"
    >
      <button
        type="button"
        className="iam-chat-startup-chip"
        disabled={disabled}
        onClick={onOpenStudio}
      >
        <LayoutGrid size={14} aria-hidden />
        Open studio
      </button>
      <button
        type="button"
        className="iam-chat-startup-chip"
        disabled={disabled}
        onClick={onImportGlb}
      >
        <Upload size={14} aria-hidden />
        Import GLB
      </button>
      <button
        type="button"
        className="iam-chat-startup-chip"
        disabled={disabled}
        onClick={onBrowseLibrary}
      >
        <FolderOpen size={14} aria-hidden />
        Browse library
      </button>
    </div>
  );
}
