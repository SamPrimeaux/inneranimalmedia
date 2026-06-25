/**
 * StudioEntryScreen — default lightweight Design Studio landing.
 * No Three.js, no CadStudioShell, no ChatAssistant. Meshy jobs go direct to /api/cad/meshy/*.
 */
import React, { useRef } from 'react';
import { Loader2, Sparkles, Upload, LayoutGrid } from 'lucide-react';
import { StudioEntryGallery } from './StudioEntryGallery';
import './cad-studio.css';

export type StudioEntryScreenProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  onOpenStudio: () => void;
  onImportGlb?: (file: File) => void;
  generating?: boolean;
  progressPct?: number;
  statusLabel?: string;
  error?: string | null;
  /** Full studio bundle is loading after user chose to enter. */
  mode?: 'idle' | 'generating' | 'loading-studio';
  onSpawnStock?: (name: string, url: string, scale: number) => void;
  onCancelJob?: (cadJobId: string) => void;
  activeProgressPct?: number;
};

export function StudioEntryScreen({
  prompt,
  onPromptChange,
  onGenerate,
  onOpenStudio,
  onImportGlb,
  generating = false,
  progressPct = 0,
  statusLabel,
  error,
  mode = 'idle',
  onSpawnStock,
  onCancelJob,
  activeProgressPct,
}: StudioEntryScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = generating || mode === 'loading-studio';

  return (
    <div className="studio-entry" role="main" aria-label="Design Studio">
      <div className="studio-entry__inner">
        <div className="studio-entry__glyph" aria-hidden>
          <span className="studio-entry__shape studio-entry__shape--tri" />
          <span className="studio-entry__shape studio-entry__shape--sq" />
          <span className="studio-entry__shape studio-entry__shape--circle" />
          <span className="studio-entry__shape studio-entry__shape--diamond" />
        </div>

        <h1 className="studio-entry__title">What will you create today?</h1>
        <p className="studio-entry__subtitle">
          Generate from text with Meshy, import a GLB, or open the full studio for modeling and animation.
        </p>

        <label className="studio-entry__field">
          <span className="studio-entry__field-label">Prompt</span>
          <textarea
            className="studio-entry__textarea"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Describe the 3D model you want to generate…"
            rows={3}
            disabled={busy}
          />
        </label>

        {error ? <p className="studio-entry__error">{error}</p> : null}

        {statusLabel ? (
          <div className="studio-entry__status">
            {busy ? <Loader2 size={14} className="studio-entry__spin" aria-hidden /> : null}
            <span>{statusLabel}</span>
            {generating && progressPct > 0 ? (
              <div className="studio-entry__progress">
                <div className="studio-entry__progress-fill" style={{ width: `${Math.min(100, progressPct)}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          className="studio-entry__cta"
          disabled={busy || !prompt.trim() || prompt.trim().length > 600}
          onClick={onGenerate}
        >
          {busy ? <Loader2 size={16} className="studio-entry__spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
          <span>{mode === 'loading-studio' ? 'Opening studio…' : generating ? 'Generating…' : 'Generate model'}</span>
        </button>

        <div className="studio-entry__secondary">
          <button type="button" className="studio-entry__link" onClick={onOpenStudio} disabled={busy}>
            <LayoutGrid size={14} aria-hidden />
            Open full studio
          </button>
          <button
            type="button"
            className="studio-entry__link"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} aria-hidden />
            Import GLB
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".glb"
            className="studio-entry__file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportGlb?.(file);
              e.target.value = '';
            }}
          />
        </div>

        <p className="studio-entry__hint">
          Meshy runs on our API — no Agent chat required. Full studio loads when you generate or open the editor.
        </p>

        <StudioEntryGallery
          onSpawnStock={onSpawnStock}
          onCancelJob={onCancelJob}
          generating={generating}
          activeJobLabel={statusLabel}
          activeProgressPct={activeProgressPct ?? progressPct}
        />
      </div>
    </div>
  );
}
