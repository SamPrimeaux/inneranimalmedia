import React from 'react';
import { BookOpen, X } from 'lucide-react';

export type AssetLibraryFlyoutProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function AssetLibraryFlyout({ open, onClose, children }: AssetLibraryFlyoutProps) {
  if (!open) return null;

  return (
    <>
      <button type="button" className="cad-asset-library__backdrop" aria-label="Close library" onClick={onClose} />
      <aside className="cad-asset-library" aria-label="Asset library">
        <div className="cad-asset-library__head">
          <span className="cad-asset-library__title">
            <BookOpen size={14} strokeWidth={1.75} />
            Library
          </span>
          <button type="button" className="cad-studio__btn" onClick={onClose} title="Close library">
            <X size={14} />
          </button>
        </div>
        <div className="cad-asset-library__body">{children}</div>
      </aside>
    </>
  );
}
