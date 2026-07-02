/**
 * StudioEntryScreen — default lightweight Design Studio landing.
 * No Three.js, no CadStudioShell, no ChatAssistant. Meshy jobs go direct to /api/cad/meshy/*.
 */
import React, { useRef } from 'react';
import { Loader2, Sparkles, Upload, LayoutGrid, ArrowUp } from 'lucide-react';
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
  /** Latest generation finished on the entry screen. */
  jobReady?: boolean;
  onSpawnStock?: (name: string, url: string, scale: number) => void;
  onCancelJob?: (cadJobId: string) => void;
  activeProgressPct?: number;
  activeJobId?: string | null;
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
  jobReady = false,
  onSpawnStock,
  onCancelJob,
  activeProgressPct,
  activeJobId,
}: StudioEntryScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = generating || mode === 'loading-studio';
  const charCount = prompt.trim().length;
  const tooLong = charCount > 600;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !busy && charCount > 0 && !tooLong) {
      e.preventDefault();
      onGenerate();
    }
  };

  return (
    <div className="studio-entry" role="main" aria-label="Design Studio">
      <div className="studio-entry__inner">

        {/* Wordmark / identity */}
        <div className="studio-entry__brand" aria-hidden>
          <span className="studio-entry__brand-word">Design</span>
          <span className="studio-entry__brand-word studio-entry__brand-word--accent">Studio</span>
        </div>

        <h1 className="studio-entry__title">What should we build?</h1>
        <p className="studio-entry__subtitle">
          Describe a model, import a GLB, or open the editor to get started.
        </p>

        {/* Chat-style composer */}
        <div className={`studio-entry__composer${busy ? ' studio-entry__composer--busy' : ''}${error || tooLong ? ' studio-entry__composer--error' : ''}`}>
          <textarea
            className="studio-entry__composer-input"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="A weathered wooden dock stretching into calm water at golden hour…"
            rows={3}
            disabled={busy}
            aria-label="Describe your 3D model"
          />
          <div className="studio-entry__composer-footer">
            <span className={`studio-entry__composer-hint${tooLong ? ' studio-entry__composer-hint--over' : ''}`}>
              {tooLong ? `${charCount}/600 — too long` : charCount > 400 ? `${charCount}/600` : 'Enter to generate · Shift+Enter for new line'}
            </span>
            <button
              type="button"
              className="studio-entry__composer-send"
              disabled={busy || charCount === 0 || tooLong}
              onClick={onGenerate}
              aria-label="Generate model"
            >
              {busy
                ? <Loader2 size={15} className="studio-entry__spin" aria-hidden />
                : <ArrowUp size={15} aria-hidden />
              }
            </button>
          </div>
        </div>

        {/* Error */}
        {error && !tooLong ? <p className="studio-entry__error">{error}</p> : null}

        {/* Progress / status */}
        {statusLabel ? (
          <div className="studio-entry__status">
            {busy ? <Loader2 size={13} className="studio-entry__spin" aria-hidden /> : null}
            <span>{statusLabel}</span>
            {generating && progressPct > 0 ? (
              <div className="studio-entry__progress">
                <div className="studio-entry__progress-fill" style={{ width: `${Math.min(100, progressPct)}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* "Model ready" banner */}
        {jobReady ? (
          <button type="button" className="studio-entry__cta studio-entry__cta--ready" onClick={onOpenStudio}>
            <LayoutGrid size={15} aria-hidden />
            <span>View in full studio</span>
          </button>
        ) : null}

        {/* Secondary actions */}
        <div className="studio-entry__secondary">
          <button type="button" className="studio-entry__link" onClick={onOpenStudio} disabled={busy}>
            <LayoutGrid size={13} aria-hidden />
            Open studio
          </button>
          <button
            type="button"
            className="studio-entry__link"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={13} aria-hidden />
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

        <StudioEntryGallery
          onSpawnStock={onSpawnStock}
          onCancelJob={onCancelJob}
          generating={generating}
          activeJobLabel={statusLabel}
          activeProgressPct={activeProgressPct ?? progressPct}
          activeJobId={activeJobId}
        />
      </div>
    </div>
  );
}
