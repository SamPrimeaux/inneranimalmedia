import React, { useState } from 'react';

const assetBase = `${import.meta.env.BASE_URL || '/'}`.replace(/\/*$/, '/');

export type IntegrationIconTileProps = {
  title: string;
  iconSlug?: string;
  connected?: boolean;
  disabled?: boolean;
  subtitle?: string;
  onClick?: () => void;
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/).slice(0, 2);
  return p.map((w) => w[0]).join('').toUpperCase() || '?';
}

export function IntegrationIconTile({
  title,
  iconSlug,
  connected,
  disabled,
  subtitle,
  onClick,
}: IntegrationIconTileProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const iconSrc =
    iconSlug && !iconFailed
      ? `${assetBase}assets/integrations/${encodeURIComponent(iconSlug)}.svg`
      : null;

  return (
    <article className="flex flex-col items-center gap-2 min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label={`${title}${connected ? ' — connected' : ''}`}
        className="relative w-full aspect-square max-w-[88px] rounded-[22%] border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-[0_14px_40px_rgba(0,0,0,0.22)] transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center overflow-hidden"
      >
        {connected ? (
          <span
            className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[var(--accent-success)] ring-2 ring-[var(--bg-panel)]"
            aria-hidden
          />
        ) : null}
        {iconSrc ? (
          <img
            src={iconSrc}
            alt=""
            className="w-[52%] h-[52%] object-contain"
            onError={() => setIconFailed(true)}
          />
        ) : (
          <span className="text-[13px] font-bold text-[var(--text-heading)]">{initials(title)}</span>
        )}
      </button>
      <p className="text-[11px] font-semibold text-[var(--text-heading)] text-center leading-tight truncate w-full">
        {title}
      </p>
      {subtitle ? (
        <p className="text-[9px] text-[var(--text-muted)] text-center leading-tight truncate w-full -mt-1">
          {subtitle}
        </p>
      ) : null}
    </article>
  );
}
