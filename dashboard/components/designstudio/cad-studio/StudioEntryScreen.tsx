/**
 * StudioEntryScreen — default lightweight Design Studio landing.
 * Agent Sam composer is portaled here from App (same pattern as AgentHome).
 */
import React, { useRef } from 'react';
import { Loader2, LayoutGrid, Upload } from 'lucide-react';
import { StudioEntryGallery } from './StudioEntryGallery';
import '../../../styles/agentHomeGlow.css';
import './cad-studio.css';

export type StudioEntryScreenProps = {
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
  onComposerHost?: (el: HTMLDivElement | null) => void;
  onMessagesHost?: (el: HTMLDivElement | null) => void;
};

export function StudioEntryScreen({
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
  onComposerHost,
  onMessagesHost,
}: StudioEntryScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = generating || mode === 'loading-studio';

  return (
    <div className="studio-entry" role="main" aria-label="Design Studio">
      <div className="studio-entry__inner studio-entry__inner--chat">

        <div className="studio-entry__brand" aria-hidden>
          <span className="studio-entry__brand-word">Design</span>
          <span className="studio-entry__brand-word studio-entry__brand-word--accent">Studio</span>
        </div>

        <h1 className="studio-entry__title">What should we build?</h1>
        <p className="studio-entry__subtitle">
          Describe a model, import a GLB, or open the editor to get started.
        </p>

        <div
          ref={onMessagesHost}
          className="studio-entry__messages-host"
          aria-label="Agent Sam conversation"
        />

        <div className="studio-entry__composer-wrap">
          <div className="iam-agent-home-glow" aria-hidden="true" />
          <div
            ref={onComposerHost}
            className="studio-entry__composer-host"
            aria-label="Agent Sam command input"
          />
        </div>

        {error ? <p className="studio-entry__error">{error}</p> : null}

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

        {jobReady ? (
          <button type="button" className="studio-entry__cta studio-entry__cta--ready" onClick={onOpenStudio}>
            <LayoutGrid size={15} aria-hidden />
            <span>View in full studio</span>
          </button>
        ) : null}

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
