import React, { useRef, useState } from 'react';
import { GripVertical, Type } from 'lucide-react';
import type { MovieModeTimeline } from '../../src/types/moviemode';
import { MOVIEMODE_CLIP_DRAG } from './createEmptyTimeline';
import type { MediaLibraryItem } from './types';
import { appendClipToTimeline } from './createEmptyTimeline';

const PX_PER_FRAME = 2;

type TimelineRailProps = {
  timeline: MovieModeTimeline;
  onTimelineChange: (timeline: MovieModeTimeline) => void;
  playheadFrame?: number;
  onSeekFrame?: (frame: number) => void;
};

export const TimelineRail: React.FC<TimelineRailProps> = ({
  timeline,
  onTimelineChange,
  playheadFrame = 0,
  onSeekFrame,
}) => {
  const dragRef = useRef<{
    trackId: string;
    clipId: string;
    startX: number;
    startFrame: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const widthPx = Math.max(timeline.durationFrames * PX_PER_FRAME, 480);

  const frameFromClientX = (clientX: number, trackEl: HTMLElement) => {
    const rect = trackEl.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.round(x / PX_PER_FRAME));
  };

  const onPointerDown = (
    e: React.PointerEvent,
    trackId: string,
    clipId: string,
    startFrame: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { trackId, clipId, startX: e.clientX, startFrame };
    setDragging(true);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d) {
      const deltaPx = e.clientX - d.startX;
      const deltaFrames = Math.round(deltaPx / PX_PER_FRAME);
      if (deltaFrames !== 0) {
        onTimelineChange({
          ...timeline,
          tracks: timeline.tracks.map((track) => {
            if (track.id !== d.trackId) return track;
            return {
              ...track,
              clips: track.clips.map((clip) =>
                clip.id === d.clipId
                  ? { ...clip, startFrame: Math.max(0, d.startFrame + deltaFrames) }
                  : clip,
              ),
            };
          }),
        });
      }
    }
    dragRef.current = null;
    setDragging(false);
  };

  const onTrackClick = (e: React.MouseEvent, trackEl: HTMLElement) => {
    if (dragRef.current) return;
    if ((e.target as HTMLElement).closest('button[data-clip]')) return;
    const frame = frameFromClientX(e.clientX, trackEl);
    onSeekFrame?.(frame);
  };

  const onTrackDragOver = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetTrackId(trackId);
  };

  const onTrackDrop = (e: React.DragEvent, trackId: string, trackType: string) => {
    e.preventDefault();
    setDropTargetTrackId(null);
    const raw = e.dataTransfer.getData(MOVIEMODE_CLIP_DRAG);
    if (!raw) return;
    let item: MediaLibraryItem;
    try {
      item = JSON.parse(raw) as MediaLibraryItem;
    } catch {
      return;
    }
    const wantsAudio = item.kind === 'audio';
    const wantsVideo = item.kind === 'video' || item.kind === 'image';
    if (wantsAudio && trackType !== 'audio') return;
    if (wantsVideo && trackType !== 'video') return;

    const trackEl = e.currentTarget as HTMLElement;
    const startFrame = frameFromClientX(e.clientX, trackEl);
    onTimelineChange(appendClipToTimeline(timeline, item, { startFrame }));
  };

  const addTextClip = () => {
    const track = timeline.tracks.find((t) => t.type === 'text');
    if (!track) return;
    const id = `text_${Date.now()}`;
    onTimelineChange({
      ...timeline,
      durationFrames: Math.max(timeline.durationFrames, 90),
      tracks: timeline.tracks.map((t) =>
        t.id === track.id
          ? {
              ...t,
              clips: [
                ...t.clips,
                {
                  id,
                  startFrame: playheadFrame,
                  durationFrames: 90,
                  text: 'Title',
                },
              ],
            }
          : t,
      ),
    });
  };

  const playheadLeft = playheadFrame * PX_PER_FRAME;

  return (
    <div
      className="shrink-0 border-t border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] flex flex-col"
      style={{ minHeight: 200, maxHeight: '38vh' }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Timeline
        </span>
        <span className="text-[9px] text-[var(--text-muted)] tabular-nums">
          f{playheadFrame} / {timeline.durationFrames}
        </span>
        <button
          type="button"
          onClick={addTextClip}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-[var(--dashboard-border)] hover:border-[var(--solar-cyan)] text-[var(--text-main)]"
        >
          <Type size={12} /> Text overlay
        </button>
      </div>
      <div
        className={`flex-1 overflow-auto p-2 relative ${dragging ? 'cursor-grabbing' : ''}`}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div style={{ width: widthPx, minWidth: '100%' }} className="relative">
          <div
            className="absolute top-0 bottom-0 w-px bg-[var(--solar-cyan)] z-20 pointer-events-none"
            style={{ left: playheadLeft }}
            aria-hidden
          />
          {timeline.tracks.map((track) => (
            <div key={track.id} className="mb-2">
              <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5 px-1">
                {track.type}
              </div>
              <div
                role="presentation"
                className={`relative h-10 rounded bg-[var(--scene-bg)] border ${
                  dropTargetTrackId === track.id
                    ? 'border-[var(--solar-cyan)]'
                    : 'border-[var(--border-subtle)]'
                }`}
                style={{ width: widthPx }}
                onClick={(e) => onTrackClick(e, e.currentTarget)}
                onDragOver={(e) => onTrackDragOver(e, track.id)}
                onDragLeave={() => setDropTargetTrackId(null)}
                onDrop={(e) => onTrackDrop(e, track.id, track.type)}
              >
                {track.clips.length === 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-[var(--text-muted)] opacity-50 pointer-events-none">
                    Drop clips here · click to seek
                  </span>
                )}
                {track.clips.map((clip) => {
                  const meta = clip.metadata as { name?: string } | undefined;
                  const label = clip.text || meta?.name || clip.id;
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      data-clip
                      className="absolute top-1 bottom-1 rounded px-1 flex items-center gap-0.5 text-[10px] font-medium text-black bg-[var(--solar-cyan)] border border-[var(--solar-cyan)] hover:brightness-110 cursor-grab active:cursor-grabbing overflow-hidden z-10"
                      style={{
                        left: clip.startFrame * PX_PER_FRAME,
                        width: Math.max(clip.durationFrames * PX_PER_FRAME, 24),
                      }}
                      onPointerDown={(e) => onPointerDown(e, track.id, clip.id, clip.startFrame)}
                      title={label}
                    >
                      <GripVertical size={10} className="shrink-0 opacity-70" />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
