import React from 'react';

export type StorefrontPreviewProps = {
  url: string;
  variant?: 'desktop' | 'mobile' | 'thumb';
  title?: string;
  className?: string;
};

export function StorefrontPreview({
  url,
  variant = 'desktop',
  title,
  className = '',
}: StorefrontPreviewProps): React.ReactElement {
  const label = title || storefrontDisplayHost(url);

  return (
    <div className={`pt-store-frame pt-store-frame--${variant} ${className}`.trim()}>
      <div className="pt-store-frame-chrome">
        <span className="pt-store-frame-dot" />
        <span className="pt-store-frame-dot" />
        <span className="pt-store-frame-dot" />
        <span className="pt-store-frame-url">{label}</span>
      </div>
      <div className="pt-store-frame-viewport">
        <iframe
          src={url}
          title={label}
          className="pt-store-iframe"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
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
