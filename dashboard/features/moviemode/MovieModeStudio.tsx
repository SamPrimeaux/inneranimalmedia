import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Clapperboard, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { MovieModeStudioProps } from './types';
import { MovieModeComposition } from './MovieModeComposition';
import { TimelineRail } from './TimelineRail';
import { TextOverlayEditor } from './TextOverlayEditor';
import { ExportPanel } from './ExportPanel';
import { MediaLibrary } from './MediaLibrary';
import { createEmptyTimeline, appendClipToTimeline } from './createEmptyTimeline';
import {
  applyOverlayChange,
  editSessionDurationFrames,
  timelineToEditSession,
} from './editSessionAdapter';
import {
  defaultMovieModeRightPanelCollapsed,
  dispatchMovieModeSurfaceContext,
  IAM_MOVIEMODE_PANEL_TOGGLE,
  persistMovieModeRightPanelCollapsed,
  readMovieModeRightPanelCollapsed,
} from '../../src/lib/moviemodeStudioEvents';
import { framesToMs } from './remotion-utils';
import type { MediaLibraryItem } from './types';

export const MovieModeStudio: React.FC<MovieModeStudioProps> = ({
  timeline,
  onTimelineChange,
  onExportComplete,
  onSaveToDrive,
  showMediaBin = false,
}) => {
  const active = timeline ?? createEmptyTimeline();
  const playerRef = useRef<PlayerRef>(null);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const playheadMs = framesToMs(playheadFrame, active.fps);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(() => {
    const stored = readMovieModeRightPanelCollapsed();
    return stored ?? defaultMovieModeRightPanelCollapsed();
  });

  const session = useMemo(() => timelineToEditSession(active), [active]);
  const durationInFrames = useMemo(() => editSessionDurationFrames(session), [session]);

  const handleSeekFrame = useCallback((frame: number) => {
    const clamped = Math.max(0, Math.min(frame, durationInFrames - 1));
    setPlayheadFrame(clamped);
    playerRef.current?.seekTo(clamped);
  }, [durationInFrames]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = () => {
      setPlayheadFrame(player.getCurrentFrame());
    };
    player.addEventListener('frameupdate', onFrame);
    return () => player.removeEventListener('frameupdate', onFrame);
  }, [active.fps, durationInFrames]);

  useEffect(() => {
    if (playheadFrame > durationInFrames - 1) {
      setPlayheadFrame(Math.max(0, durationInFrames - 1));
    }
  }, [durationInFrames, playheadFrame]);

  const addClipFromLibrary = useCallback(
    (item: MediaLibraryItem) => {
      if (!timeline) {
        onTimelineChange(appendClipToTimeline(createEmptyTimeline(), item, { startFrame: playheadFrame }));
        return;
      }
      onTimelineChange(appendClipToTimeline(timeline, item, { startFrame: playheadFrame }));
    },
    [timeline, onTimelineChange, playheadFrame],
  );

  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed((prev) => {
      const next = !prev;
      persistMovieModeRightPanelCollapsed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    persistMovieModeRightPanelCollapsed(rightPanelCollapsed);
  }, [rightPanelCollapsed]);

  useEffect(() => {
    const onPanelToggle = (e: Event) => {
      const detail = (e as CustomEvent<{ collapsed?: boolean }>).detail;
      if (detail?.collapsed != null) {
        setRightPanelCollapsed(detail.collapsed);
        persistMovieModeRightPanelCollapsed(detail.collapsed);
        return;
      }
      setRightPanelCollapsed((prev) => {
        const next = !prev;
        persistMovieModeRightPanelCollapsed(next);
        return next;
      });
    };
    window.addEventListener(IAM_MOVIEMODE_PANEL_TOGGLE, onPanelToggle as EventListener);
    return () => window.removeEventListener(IAM_MOVIEMODE_PANEL_TOGGLE, onPanelToggle as EventListener);
  }, []);

  useEffect(() => {
    dispatchMovieModeSurfaceContext(timeline, rightPanelCollapsed);
  }, [timeline, rightPanelCollapsed]);

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

  const panelToggleTitle = rightPanelCollapsed ? 'Show editing panel' : 'Hide editing panel';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--scene-bg)]">
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {showMediaBin ? (
          <aside className="w-56 shrink-0 border-r border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] flex flex-col overflow-hidden">
            <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
              Media
            </p>
            <MediaLibrary
              rootHandle={null}
              onOpenInMovieMode={addClipFromLibrary}
              onAddToTimeline={addClipFromLibrary}
            />
          </aside>
        ) : null}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 overflow-hidden relative min-w-0">
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] p-1 shadow-sm">
            <button
              type="button"
              title={panelToggleTitle}
              aria-expanded={!rightPanelCollapsed}
              aria-controls="moviemode-editing-panel"
              aria-label={panelToggleTitle}
              className="p-1.5 rounded transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              onClick={toggleRightPanel}
            >
              {rightPanelCollapsed ? (
                <PanelRightOpen size={16} strokeWidth={1.75} />
              ) : (
                <PanelRightClose size={16} strokeWidth={1.75} />
              )}
            </button>
          </div>
          <Player
            ref={playerRef}
            acknowledgeRemotionLicense
            component={MovieModeComposition}
            inputProps={session}
            durationInFrames={durationInFrames}
            compositionWidth={active.width}
            compositionHeight={active.height}
            fps={active.fps}
            style={{
              width: '100%',
              maxWidth: rightPanelCollapsed ? '100%' : 960,
              aspectRatio: `${active.width} / ${active.height}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            }}
            controls
            loop
          />
        </div>
        {!rightPanelCollapsed ? (
          <aside
            id="moviemode-editing-panel"
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
              <ExportPanel
                session={session}
                onExportComplete={onExportComplete}
                onSaveToDrive={onSaveToDrive}
              />
            </div>
          </aside>
        ) : null}
      </div>
      <TimelineRail
        timeline={active}
        onTimelineChange={onTimelineChange}
        playheadFrame={playheadFrame}
        onSeekFrame={handleSeekFrame}
      />
    </div>
  );
};
