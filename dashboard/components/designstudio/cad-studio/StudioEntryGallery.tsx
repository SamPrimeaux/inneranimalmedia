/**
 * Compact stock + in-progress gallery on the Design Studio entry screen.
 * Posters only — no GLB preview loads.
 */
import React, { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useStudioGallery } from './useStudioGallery';
import type { GalleryItem } from './cadStudioTypes';
import { GlbAssetThumb } from './editors/GlbAssetThumb';

export type StudioEntryGalleryProps = {
  onSpawnStock?: (name: string, url: string, scale: number) => void;
  onCancelJob?: (cadJobId: string) => void;
  generating?: boolean;
  activeJobLabel?: string;
  activeProgressPct?: number;
};

function GalleryCard({
  item,
  onSpawn,
  onCancel,
  cancelling,
}: {
  item: GalleryItem;
  onSpawn?: (item: GalleryItem) => void;
  onCancel?: (item: GalleryItem) => void;
  cancelling?: boolean;
}) {
  const disabled = item.pending || !item.url;
  const pct = item.progressPct != null ? Math.min(100, Math.max(0, item.progressPct)) : 0;
  const canCancel = item.pending && (item.cadJobId || item.externalTaskId);

  return (
    <div className={`studio-entry__gallery-card-wrap${item.pending ? ' studio-entry__gallery-card-wrap--pending' : ''}`}>
      <button
        type="button"
        className={`studio-entry__gallery-card${item.pending ? ' studio-entry__gallery-card--pending' : ''}`}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onSpawn?.(item);
        }}
        title={item.name}
      >
        <div className="studio-entry__gallery-thumb">
          <GlbAssetThumb url={item.url} thumbnail={item.thumbnail} alt={item.name} />
          {item.pending ? (
            <span className="studio-entry__gallery-pending" aria-hidden>
              {pct > 0 ? (
                <span className="studio-entry__gallery-pct">{pct}%</span>
              ) : (
                <Loader2 size={16} className="studio-entry__spin" />
              )}
            </span>
          ) : null}
        </div>
        <span className="studio-entry__gallery-name">{item.name}</span>
      </button>
      {canCancel ? (
        <button
          type="button"
          className="studio-entry__gallery-cancel"
          aria-label={`Cancel ${item.name}`}
          title="Cancel job"
          disabled={cancelling}
          onClick={(e) => {
            e.stopPropagation();
            void onCancel?.(item);
          }}
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}

export function StudioEntryGallery({
  onSpawnStock,
  onCancelJob,
  generating,
  activeJobLabel,
  activeProgressPct,
}: StudioEntryGalleryProps) {
  const gallery = useStudioGallery();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const stockItems = useMemo(
    () => gallery.items.filter((i) => i.source === 'stock'),
    [gallery.items],
  );

  const pendingItems = useMemo(
    () => gallery.items.filter((i) => i.pending && i.source !== 'stock'),
    [gallery.items],
  );

  const showGenerating =
    generating &&
    !pendingItems.some((i) => i.pending) &&
    activeJobLabel;

  if (gallery.loading && stockItems.length === 0 && pendingItems.length === 0) {
    return (
      <div className="studio-entry__gallery">
        <p className="studio-entry__gallery-hint">Loading library…</p>
      </div>
    );
  }

  if (!gallery.loading && stockItems.length === 0 && pendingItems.length === 0 && !showGenerating) {
    return null;
  }

  const handleSpawn = (item: GalleryItem) => {
    if (!item.url) return;
    onSpawnStock?.(item.name, item.url, item.scale ?? 1);
  };

  const handleCancel = async (item: GalleryItem) => {
    setCancellingId(item.id);
    try {
      await gallery.dismissPending(item);
      if (item.cadJobId) onCancelJob?.(item.cadJobId);
    } catch (e) {
      console.warn('[StudioEntryGallery] cancel failed', e);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="studio-entry__gallery" aria-label="Asset library preview">
      {pendingItems.length > 0 || showGenerating ? (
        <div className="studio-entry__gallery-section">
          <p className="studio-entry__gallery-label">Creating</p>
          <div className="studio-entry__gallery-grid">
            {pendingItems.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                onCancel={(i) => void handleCancel(i)}
                cancelling={cancellingId === item.id}
              />
            ))}
            {showGenerating ? (
              <div className="studio-entry__gallery-card studio-entry__gallery-card--pending studio-entry__gallery-card--static">
                <div className="studio-entry__gallery-thumb">
                  <span className="cad-assets__thumb-placeholder">
                    <Loader2 size={18} className="studio-entry__spin" />
                  </span>
                  {activeProgressPct != null && activeProgressPct > 0 ? (
                    <span className="studio-entry__gallery-pending">
                      <span className="studio-entry__gallery-pct">
                        {Math.min(100, activeProgressPct)}%
                      </span>
                    </span>
                  ) : null}
                </div>
                <span className="studio-entry__gallery-name">{activeJobLabel}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {stockItems.length > 0 ? (
        <div className="studio-entry__gallery-section">
          <p className="studio-entry__gallery-label">Stock library</p>
          <div className="studio-entry__gallery-grid">
            {stockItems.map((item) => (
              <GalleryCard key={item.id} item={item} onSpawn={handleSpawn} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
