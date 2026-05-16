import React, { useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Clapperboard } from 'lucide-react';
import type { MovieModeStudioProps } from './types';
import { MovieModeComposition } from './MovieModeComposition';
import { TimelineRail } from './TimelineRail';
import { TextOverlayEditor } from './TextOverlayEditor';
import { ExportPanel } from './ExportPanel';
import { createEmptyTimeline } from './createEmptyTimeline';
import {
  applyOverlayChange,
  editSessionDurationFrames,
  timelineToEditSession,
} from './editSessionAdapter';

export const MovieModeStudio: React.FC<MovieModeStudioProps> = ({ timeline, onTimelineChange }) => {
  const active = timeline ?? createEmptyTimeline();
  const playerRef = useRef<PlayerRef>(null);
  const [playheadMs] = useState(0);

  const session = useMemo(() => timelineToEditSession(active), [active]);
  const durationInFrames = useMemo(() => editSessionDurationFrames(session), [session]);

  if (!timeline) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)] p-8">
        <Clapperboard size={40} className="opacity-30" />
        <p className="text-sm text-center max-w-sm">
          Expand <strong className="text-[var(--text-main)]">MovieMode</strong> in the explorer and pick a clip
          from Media Library, or open a video file and choose MovieMode.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--scene-bg)]">
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 overflow-hidden">
          <Player
            ref={playerRef}
            component={MovieModeComposition}
            inputProps={session}
            durationInFrames={durationInFrames}
            compositionWidth={active.width}
            compositionHeight={active.height}
            fps={active.fps}
            style={{
              width: '100%',
              maxWidth: 960,
              aspectRatio: `${active.width} / ${active.height}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            }}
            controls
            loop
          />
        </div>
        <aside
          className="w-72 shrink-0 border-l border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] overflow-y-auto flex flex-col"
        >
          <div className="border-b border-[var(--border-subtle)]">
            <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Text overlays
            </p>
            <TextOverlayEditor
              overlays={active.overlays ?? []}
              playheadMs={playheadMs}
              onChange={(overlays) => onTimelineChange(applyOverlayChange(active, overlays))}
            />
          </div>
          <div className="border-t border-[var(--border-subtle)]">
            <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Export
            </p>
            <ExportPanel session={session} />
          </div>
        </aside>
      </div>
      <TimelineRail timeline={active} onTimelineChange={onTimelineChange} />
    </div>
  );
};
