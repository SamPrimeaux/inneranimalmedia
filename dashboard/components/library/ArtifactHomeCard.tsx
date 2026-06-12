import type { ArtifactRecord } from '../../api/artifacts';
import { relativeTime } from '../settings/settingsUi';
import { ArtifactTypeIcon } from './ArtifactTypeIcon';

type Props = {
  artifact: ArtifactRecord;
  onOpen: () => void;
};

export function ArtifactHomeCard({ artifact, onOpen }: Props) {
  const thumb = artifact.thumbnail_url || artifact.preview_url;
  const edited = artifact.updated_at_display || artifact.updated_at;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="iam-artifact-home-card group w-full text-left rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] overflow-hidden transition-colors hover:border-[color-mix(in_srgb,var(--solar-cyan)_35%,var(--dashboard-border))] active:scale-[0.995] touch-manipulation"
    >
      <div className="aspect-[16/10] w-full bg-[var(--dashboard-canvas)] border-b border-[var(--dashboard-border)]/80 overflow-hidden">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center p-6">
            <ArtifactTypeIcon artifact={artifact} className="h-16 w-16" />
          </div>
        )}
      </div>
      <div className="p-3.5 sm:p-4 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)] leading-snug line-clamp-2">{artifact.name}</div>
        <div className="mt-1.5 text-xs text-[var(--text-muted)]">
          {edited ? relativeTime(edited) : 'No date'}
        </div>
      </div>
    </button>
  );
}
