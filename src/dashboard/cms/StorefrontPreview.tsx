import React, { useLayoutEffect, useRef, useState } from 'react';

export type StorefrontPreviewProps = {
  url: string;
  variant?: 'desktop' | 'mobile' | 'thumb';
  title?: string;
  className?: string;
};

const VIEWPORT: Record<
  NonNullable<StorefrontPreviewProps['variant']>,
  { width: number; height: number }
> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
  thumb: { width: 390, height: 220 },
};

export function StorefrontPreview({
  url,
  variant = 'desktop',
  title,
  className = '',
}: StorefrontPreviewProps): React.ReactElement {
  const label = title || storefrontDisplayHost(url);
  const viewportRef = useRef<HTMLDivElement>(null);
  const native = VIEWPORT[variant];
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const next = Math.min(width / native.width, height / native.height);
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [native.width, native.height]);

  const scaledWidth = native.width * scale;
  const scaledHeight = native.height * scale;

  return (
    <div className={`pt-store-frame pt-store-frame--${variant} ${className}`.trim()}>
      <div className="pt-store-frame-chrome">
        <span className="pt-store-frame-dot" />
        <span className="pt-store-frame-dot" />
        <span className="pt-store-frame-dot" />
        <span className="pt-store-frame-url">{label}</span>
      </div>
      <div ref={viewportRef} className="pt-store-frame-viewport">
        <div
          className="pt-store-iframe-scaler"
          style={{
            width: scaledWidth,
            height: scaledHeight,
          }}
        >
          <iframe
            src={url}
            title={label}
            className="pt-store-iframe"
            width={native.width}
            height={native.height}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </div>
  );
}

function storefrontDisplayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
