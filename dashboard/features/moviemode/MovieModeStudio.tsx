import React from 'react';
import { Player } from '@remotion/player';
import { Clapperboard } from 'lucide-react';
import type { MovieModeStudioProps } from './types';
import { PreviewComposition } from './PreviewComposition';
import { TimelineRail } from './TimelineRail';
import { createEmptyTimeline } from './createEmptyTimeline';

export const MovieModeStudio: React.FC<MovieModeStudioProps> = ({ timeline, onTimelineChange }) => {
  const active = timeline ?? createEmptyTimeline();

  if (!timeline) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)] p-8">
        <Clapperboard size={40} className="opacity-30" />
        <p className="text-sm text-center max-w-sm">
          Expand <strong className="text-[var(--text-main)]">MovieMode</strong> in the explorer and pick a clip from
          Media Library, or open a video file and choose MovieMode.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--scene-bg)]">
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden">
        <Player
          component={PreviewComposition}
          inputProps={{ timeline: active }}
          durationInFrames={active.durationFrames}
          fps={active.fps}
          compositionWidth={active.width}
          compositionHeight={active.height}
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
      <TimelineRail timeline={active} onTimelineChange={onTimelineChange} />
    </div>
  );
};
