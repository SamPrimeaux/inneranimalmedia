import React, { useCallback, useRef, useState } from 'react';
import { AlertCircle, Pencil } from 'lucide-react';
import './AppIcon.css';

const assetBase = `${import.meta.env.BASE_URL || '/'}`.replace(/\/*$/, '/');

export type AppIconSize = 'sm' | 'md' | 'lg';
export type AppIconStatus = 'ok' | 'warning' | 'error';

export type AppIconProps = {
  title: string;
  /** Full-bleed artwork (Cloudflare Images, R2, etc.) */
  imageUrl?: string | null;
  /** Brand SVG under /assets/integrations/{slug}.svg */
  iconSlug?: string;
  size?: AppIconSize;
  subtitle?: string;
  /** Only rendered for warning/error — never for "connected" */
  status?: AppIconStatus | null;
  disabled?: boolean;
  editable?: boolean;
  editActive?: boolean;
  onPress?: () => void;
  onEdit?: () => void;
  onImageDrop?: (file: File) => void | Promise<void>;
  className?: string;
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/).slice(0, 2);
  return p.map((w) => w[0]).join('').toUpperCase() || '?';
}

function cfPublicUrl(url: string | null | undefined): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  if (!raw.includes('imagedelivery.net')) return raw;
  return raw.replace(/\/(small|thumbnail|avatar|hero)$/, '/public');
}

export function AppIcon({
  title,
  imageUrl,
  iconSlug,
  size = 'md',
  subtitle,
  status,
  disabled,
  editable,
  editActive,
  onPress,
  onEdit,
  onImageDrop,
  className = '',
}: AppIconProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const longPressRef = useRef<number | null>(null);

  const artSrc = (() => {
    if (imageUrl && !iconFailed) return cfPublicUrl(imageUrl);
    if (iconSlug && !iconFailed) {
      return `${assetBase}assets/integrations/${encodeURIComponent(iconSlug)}.svg`;
    }
    return null;
  })();

  const isSvgBrand = !!iconSlug && !imageUrl;

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (!onImageDrop) return;
      const file = e.dataTransfer.files?.[0];
      if (file?.type.startsWith('image/')) await onImageDrop(file);
    },
    [onImageDrop],
  );

  const showPencil = !!editable;

  return (
    <article className={`iam-app-icon-wrap iam-app-icon-wrap--${size} ${className}`.trim()}>
      <div
        className={[
          'iam-app-icon-shell',
          editActive ? 'is-edit-active' : '',
          dragOver ? 'is-drag-over' : '',
          disabled ? 'is-disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onDragOver={(e) => {
          if (!onImageDrop) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => void handleDrop(e)}
      >
        <button
          type="button"
          className="iam-app-icon-hit"
          disabled={disabled}
          aria-label={title}
          onClick={onPress}
          onTouchStart={() => {
            if (!editable || !onEdit) return;
            longPressRef.current = window.setTimeout(() => onEdit(), 520);
          }}
          onTouchEnd={() => {
            if (longPressRef.current) {
              window.clearTimeout(longPressRef.current);
              longPressRef.current = null;
            }
          }}
        >
          {artSrc ? (
            <img
              src={artSrc}
              alt=""
              className={isSvgBrand ? 'iam-app-icon-brand' : 'iam-app-icon-art'}
              loading="lazy"
              decoding="async"
              onError={() => setIconFailed(true)}
            />
          ) : (
            <span className="iam-app-icon-fallback">{initials(title)}</span>
          )}
          {status === 'warning' || status === 'error' ? (
            <span
              className={`iam-app-icon-status iam-app-icon-status--${status}`}
              title={status === 'error' ? 'Needs attention' : 'Degraded'}
            >
              <AlertCircle size={12} strokeWidth={2.25} aria-hidden />
            </span>
          ) : null}
        </button>
        {showPencil ? (
          <button
            type="button"
            className="iam-app-icon-edit"
            aria-label={`Edit ${title} icon`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
          >
            <Pencil size={11} strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
      </div>
      <p className="iam-app-icon-label">{title}</p>
      {subtitle ? <p className="iam-app-icon-sub">{subtitle}</p> : null}
    </article>
  );
}
