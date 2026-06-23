import React, { useEffect, useRef, useState } from 'react';
import '@google/model-viewer';
import { normalizeGlbUrl } from '../../../lib/glbAssets';

type GlbAssetThumbProps = {
  url: string;
  thumbnail?: string | null;
  alt?: string;
};

export function GlbAssetThumb({ url, thumbnail, alt }: GlbAssetThumbProps) {
  const glbUrl = normalizeGlbUrl(url);
  const rootRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (thumbnail) return;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          io.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [thumbnail]);

  if (thumbnail) {
    return <img src={thumbnail} alt={alt || ''} />;
  }

  return (
    <div ref={rootRef} className="cad-assets__thumb-inner">
      {shouldLoad && glbUrl ? (
        // @ts-expect-error model-viewer web component
        <model-viewer
          src={glbUrl}
          alt={alt || 'GLB preview'}
          camera-controls={false}
          interaction-prompt="none"
          disable-zoom
          disable-pan
          shadow-intensity="0.55"
          environment-image="neutral"
          exposure="1.15"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#1a1d21',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <span className="cad-assets__thumb-placeholder">GLB</span>
      )}
    </div>
  );
}
