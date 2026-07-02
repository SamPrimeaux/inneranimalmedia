import React, { useCallback, useRef, useState } from 'react';
import { Minus, Plus, Upload, X } from 'lucide-react';
import type { DashboardHomeTile } from '../../api/home';
import { uploadDashboardImage } from '../../api/uploadImage';
import { AppIcon } from '../ui/AppIcon';
import './HomeTileEditor.css';

const DESTINATION_OPTIONS = [
  { label: 'Agent Sam', path: '/dashboard/agent' },
  { label: 'Design Studio', path: '/dashboard/designstudio' },
  { label: 'Database', path: '/dashboard/database' },
  { label: 'CMS Suite', path: '/dashboard/cms' },
  { label: 'Artifacts', path: '/dashboard/artifacts' },
  { label: 'Integrations', path: '/dashboard/settings/integrations' },
  { label: 'Projects', path: '/dashboard/projects' },
];

const BG_PRESETS: { label: string; value: string | null }[] = [
  { label: 'None', value: null },
  { label: 'White', value: '#ffffff' },
  { label: 'Dark', value: '#0b1018' },
  { label: 'Blue', value: '#1a6fe8' },
];

const SCALE_MIN = 0.5;
const SCALE_MAX = 1.2;
const SCALE_STEP = 0.05;

function clampScale(n: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n * 100) / 100));
}

export type HomeTileEditorProps = {
  tile: DashboardHomeTile;
  workspaceId?: string | null;
  onChange: (next: DashboardHomeTile) => void;
  onClose: () => void;
  onReset: () => void;
};

export function HomeTileEditor({
  tile,
  workspaceId,
  onChange,
  onClose,
  onReset,
}: HomeTileEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const destValue = DESTINATION_OPTIONS.some((o) => o.path === tile.path)
    ? tile.path
    : '__custom__';

  const scale = clampScale(tile.icon_scale ?? 1);

  const applyFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setUploadErr('Please choose an image file (PNG, JPG, WebP…)');
        return;
      }
      setUploadBusy(true);
      setUploadErr(null);
      const res = await uploadDashboardImage(file, workspaceId);
      setUploadBusy(false);
      if (!res.ok || !res.url) {
        setUploadErr(res.error || 'Upload failed');
        return;
      }
      onChange({ ...tile, image_url: res.url });
    },
    [onChange, tile, workspaceId],
  );

  const bumpScale = (delta: number) => {
    onChange({ ...tile, icon_scale: clampScale(scale + delta) });
  };

  return (
    <div className="iam-home-tile-inspector-scrim" role="presentation" onClick={onClose}>
      <aside
        className="iam-home-tile-inspector"
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-tile-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="iam-home-tile-inspector-head">
          <h3 id="home-tile-editor-title">Edit app icon</h3>
          <button type="button" className="iam-section-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="iam-home-tile-preview">
          <p className="iam-home-tile-preview-label">Live preview</p>
          <AppIcon
            title={tile.title}
            imageUrl={tile.image_url}
            size="md"
            artScale={scale}
            backgroundColor={tile.icon_bg}
            presentation="app"
            subtitle={tile.cta_label}
            editable
            editActive
            onImageDrop={(file) => applyFile(file)}
          />
        </div>

        <div
          className={`iam-home-tile-dropzone ${dragOver ? 'is-over' : ''} ${uploadBusy ? 'is-busy' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void applyFile(file);
          }}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
          }}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void applyFile(file);
              e.target.value = '';
            }}
          />
          <Upload size={20} strokeWidth={1.75} aria-hidden />
          <strong>{uploadBusy ? 'Uploading…' : 'Drop icon here'}</strong>
          <span>or click to browse — PNG, JPG, WebP</span>
        </div>
        {uploadErr ? <p className="iam-home-customize-error">{uploadErr}</p> : null}
        {tile.image_url ? (
          <p className="iam-home-tile-upload-ok">Icon uploaded — adjust scale and background below.</p>
        ) : null}

        <div className="iam-home-tile-control-row">
          <span className="iam-home-tile-control-label">Icon scale</span>
          <div className="iam-home-tile-stepper">
            <button
              type="button"
              aria-label="Decrease icon scale"
              disabled={scale <= SCALE_MIN}
              onClick={() => bumpScale(-SCALE_STEP)}
            >
              <Minus size={14} />
            </button>
            <span className="iam-home-tile-stepper-value">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              aria-label="Increase icon scale"
              disabled={scale >= SCALE_MAX}
              onClick={() => bumpScale(SCALE_STEP)}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="iam-home-tile-control-row iam-home-tile-control-row--stack">
          <span className="iam-home-tile-control-label">Background</span>
          <div className="iam-home-tile-bg-presets">
            {BG_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`iam-home-tile-bg-chip${tile.icon_bg === preset.value ? ' active' : ''}`}
                onClick={() => onChange({ ...tile, icon_bg: preset.value })}
              >
                {preset.value ? (
                  <span className="iam-home-tile-bg-swatch" style={{ background: preset.value }} aria-hidden />
                ) : (
                  <span className="iam-home-tile-bg-swatch iam-home-tile-bg-swatch--none" aria-hidden />
                )}
                {preset.label}
              </button>
            ))}
          </div>
          <label className="iam-home-tile-field iam-home-tile-field--inline">
            Custom color
            <input
              type="color"
              value={tile.icon_bg && tile.icon_bg.startsWith('#') ? tile.icon_bg : '#ffffff'}
              onChange={(e) => onChange({ ...tile, icon_bg: e.target.value })}
            />
          </label>
        </div>

        <label className="iam-home-tile-field">
          Title
          <input
            value={tile.title}
            onChange={(e) => onChange({ ...tile, title: e.target.value })}
          />
        </label>

        <label className="iam-home-tile-field">
          Action label
          <input
            value={tile.cta_label}
            onChange={(e) => onChange({ ...tile, cta_label: e.target.value })}
          />
        </label>

        <label className="iam-home-tile-field">
          Opens
          <select
            value={destValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v !== '__custom__') onChange({ ...tile, path: v });
            }}
          >
            {DESTINATION_OPTIONS.map((o) => (
              <option key={o.path} value={o.path}>
                {o.label}
              </option>
            ))}
            <option value="__custom__">Custom path…</option>
          </select>
        </label>

        {destValue === '__custom__' ? (
          <label className="iam-home-tile-field">
            Custom path
            <input
              value={tile.path}
              onChange={(e) => onChange({ ...tile, path: e.target.value })}
              placeholder="/dashboard/…"
            />
          </label>
        ) : null}

        <footer className="iam-home-tile-inspector-foot">
          <button type="button" onClick={onReset}>
            Reset
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}

export const HOME_LAYOUT_STORAGE_KEY = 'iam.dashboard.home.layout.v1';

export function loadHomeLayoutDraft(workspaceId: string): DashboardHomeTile[] | null {
  try {
    const raw = localStorage.getItem(`${HOME_LAYOUT_STORAGE_KEY}:${workspaceId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tiles?: DashboardHomeTile[] };
    return Array.isArray(parsed.tiles) ? parsed.tiles : null;
  } catch {
    return null;
  }
}

export function saveHomeLayoutDraft(workspaceId: string, tiles: DashboardHomeTile[]) {
  try {
    localStorage.setItem(
      `${HOME_LAYOUT_STORAGE_KEY}:${workspaceId}`,
      JSON.stringify({ tiles, saved_at: Date.now() }),
    );
  } catch {
    /* quota */
  }
}
