import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clapperboard, Loader2 } from 'lucide-react';
import { MovieModeStudio } from '../../features/moviemode/MovieModeStudio';
import { useMovieModeProject } from '../../hooks/useMovieModeProject';
import { timelineToEditSession } from '../../features/moviemode/editSessionAdapter';

type SaveDestination = 'local' | 'google_drive' | 'byok_r2';

export default function MovieModePage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');
  const { project, timeline, loading, error, saving, setTimeline } = useMovieModeProject({
    projectId,
  });

  const session = useMemo(() => (timeline ? timelineToEditSession(timeline) : null), [timeline]);

  const mirrorExport = async (r2Key: string, destination: SaveDestination) => {
    if (!r2Key) return;
    const res = await fetch('/api/moviemode/assets/save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination,
        bucket: 'artifacts',
        r2_key: r2Key,
        filename: r2Key.split('/').pop(),
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; video_base64?: string };
    if (!data.ok && data.error) alert(data.error);
    if (destination === 'local' && data.video_base64) {
      const a = document.createElement('a');
      a.href = `data:video/mp4;base64,${data.video_base64}`;
      a.download = r2Key.split('/').pop() || 'moviemode-export.mp4';
      a.click();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center gap-2 text-[var(--text-muted)]">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading MovieMode…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
      <header className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]">
        <Clapperboard size={16} className="text-[var(--solar-cyan)]" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-[var(--text-main)] truncate">
            {project?.title || 'Movie Mode'}
          </h1>
          {project?.slug ? (
            <p className="text-[10px] text-[var(--text-muted)] truncate">{project.slug}</p>
          ) : null}
        </div>
        {saving ? (
          <span className="text-[10px] text-[var(--text-muted)]">Saving…</span>
        ) : null}
        {session && timeline ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="text-[10px] px-2 py-1 rounded border border-[var(--dashboard-border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
              onClick={() => {
                const key = prompt('Paste export r2_key to mirror (after export completes):');
                if (key) void mirrorExport(key, 'google_drive');
              }}
            >
              Drive
            </button>
            <button
              type="button"
              className="text-[10px] px-2 py-1 rounded border border-[var(--dashboard-border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
              onClick={() => {
                const key = prompt('Paste export r2_key to download:');
                if (key) void mirrorExport(key, 'local');
              }}
            >
              Download
            </button>
          </div>
        ) : null}
      </header>
      {error ? (
        <p className="px-3 py-1 text-xs text-amber-400/90">{error}</p>
      ) : null}
      <div className="flex-1 min-h-0 flex flex-col">
        <MovieModeStudio timeline={timeline} onTimelineChange={setTimeline} />
      </div>
    </div>
  );
}
