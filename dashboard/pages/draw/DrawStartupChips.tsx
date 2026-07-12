import React from 'react';
import { FolderOpen, Pencil, Sparkles, LayoutTemplate } from 'lucide-react';
import { StartupChipRow } from '../../components/shell/chat-startup/StartupChipRow';

export type DrawStartupChipsProps = {
  className?: string;
  disabled?: boolean;
  onOpenCanvas: () => void;
  onOpenWireframe?: () => void;
  onBrowseLibraries: () => void;
  onNewSketch: () => void;
};

export function DrawStartupChips({
  className,
  disabled = false,
  onOpenCanvas,
  onOpenWireframe,
  onBrowseLibraries,
  onNewSketch,
}: DrawStartupChipsProps) {
  return (
    <StartupChipRow
      className={className}
      ariaLabel="Draw quick actions"
      disabled={disabled}
      chips={[
        { id: 'excalidraw', label: 'Excalidraw', icon: Pencil, onClick: onOpenCanvas },
        ...(onOpenWireframe
          ? [{ id: 'wireframe', label: 'Wireframe studio', icon: LayoutTemplate, onClick: onOpenWireframe }]
          : []),
        { id: 'libraries', label: 'Browse libraries', icon: FolderOpen, onClick: onBrowseLibraries },
        { id: 'sketch', label: 'New Excalidraw', icon: Sparkles, onClick: onNewSketch },
      ]}
    />
  );
}
