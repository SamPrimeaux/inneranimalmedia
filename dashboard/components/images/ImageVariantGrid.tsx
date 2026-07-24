import React from 'react';
import { NAMED_VARIANTS, type NamedVariantId } from './imagesRegistry';

export type ImageVariantGridProps = {
  variants: Record<string, string>;
  selected?: string | null;
  onSelect: (variantId: string) => void;
};

const HINTS: Record<string, string> = Object.fromEntries(
  NAMED_VARIANTS.map((v) => [v.id, v.hint]),
);

export function ImageVariantGrid({ variants, selected, onSelect }: ImageVariantGridProps) {
  const ids = Object.keys(variants).length
    ? Object.keys(variants)
    : (NAMED_VARIANTS.map((v) => v.id) as string[]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: 10,
      }}
    >
      {ids.map((id) => {
        const url = variants[id] || '';
        const active = selected === id;
        const hint = HINTS[id] || '';
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 6,
              padding: 8,
              borderRadius: 10,
              border: active
                ? '1px solid var(--solar-cyan)'
                : '1px solid var(--border-subtle)',
              background: active
                ? 'color-mix(in srgb, var(--solar-cyan) 10%, var(--bg-elevated))'
                : 'var(--bg-elevated)',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                aspectRatio: '1',
                borderRadius: 6,
                overflow: 'hidden',
                background: 'var(--bg-panel)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {url ? (
                <img
                  src={url}
                  alt={id}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
              )}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-main)' }}>{id}</div>
              {hint ? (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export type { NamedVariantId };
export default ImageVariantGrid;
