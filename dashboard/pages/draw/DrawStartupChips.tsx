import React from 'react';
import { FolderOpen, Pencil, Sparkles } from 'lucide-react';

export type DrawStartupChipsProps = {
  className?: string;
  disabled?: boolean;
  onOpenCanvas: () => void;
  onBrowseLibraries: () => void;
  onNewSketch: () => void;
};

export function DrawStartupChips({
  className,
  disabled = false,
  onOpenCanvas,
  onBrowseLibraries,
  onNewSketch,
}: DrawStartupChipsProps) {
  return (
    <div
      className={`iam-chat-startup-chips${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="Draw quick actions"
    >
      <button type="button" className="iam-chat-startup-chip" disabled={disabled} onClick={onOpenCanvas}>
        <Pencil size={14} aria-hidden />
        Open canvas
      </button>
      <button type="button" className="iam-chat-startup-chip" disabled={disabled} onClick={onBrowseLibraries}>
        <FolderOpen size={14} aria-hidden />
        Browse libraries
      </button>
      <button type="button" className="iam-chat-startup-chip" disabled={disabled} onClick={onNewSketch}>
        <Sparkles size={14} aria-hidden />
        New sketch
      </button>
    </div>
  );
}
