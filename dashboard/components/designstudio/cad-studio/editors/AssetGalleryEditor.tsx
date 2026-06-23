import React, { useRef } from 'react';
import { useStudioGallery } from '../useStudioGallery';
import type { GalleryItem } from '../cadStudioTypes';
import { GlbAssetThumb } from './GlbAssetThumb';

export type AssetGalleryEditorProps = {
  onSpawn: (item: GalleryItem) => void;
  onUpload?: (file: File) => void;
  variant?: 'panel' | 'library';
};

export function AssetGalleryEditor({ onSpawn, onUpload, variant = 'panel' }: AssetGalleryEditorProps) {
  const gallery = useStudioGallery();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section className="cad-editor cad-editor--assets">
      <div className="cad-studio__panel-head cad-assets__head">
        {variant === 'panel' ? <span>Assets</span> : null}
        <input
          className="cad-studio__search"
          placeholder="Search GLBs…"
          value={gallery.filter}
          onChange={(e) => gallery.setFilter(e.target.value)}
        />
        <button type="button" className="cad-studio__upload-btn" onClick={() => fileRef.current?.click()}>
          Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,.gltf"
          className="cad-editor__hidden-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload?.(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className="cad-assets__filters">
        {(['all', 'stock', 'mine', 'job', 'meshy'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`cad-assets__chip${gallery.sourceFilter === s ? ' active' : ''}`}
            onClick={() => gallery.setSourceFilter(s)}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button type="button" className="cad-studio__btn" onClick={() => void gallery.refresh()} title="Refresh">
          Refresh
        </button>
        {gallery.total > 0 ? <span className="cad-assets__count">{gallery.total}</span> : null}
      </div>
      <div className="cad-assets__scroll">
        {gallery.loading ? <p className="cad-editor__hint cad-assets__status">Loading assets…</p> : null}
        {gallery.error ? <p className="cad-editor__hint cad-editor__hint--error cad-assets__status">{gallery.error}</p> : null}
        {!gallery.loading && gallery.items.length === 0 ? (
          <p className="cad-editor__hint cad-assets__status">No GLBs yet — upload or generate via Agent.</p>
        ) : null}
        <div className="cad-assets__grid">
          {gallery.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="cad-assets__card"
              onClick={() => onSpawn(item)}
              title={item.url}
            >
              <div className="cad-assets__thumb">
                <GlbAssetThumb url={item.url} thumbnail={item.thumbnail} alt={item.name} />
              </div>
              <div className="cad-assets__meta">
                <span className="cad-assets__name">{item.name}</span>
                <span className="cad-assets__source">{item.source}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
