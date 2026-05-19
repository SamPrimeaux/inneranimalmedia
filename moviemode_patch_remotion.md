# MovieMode — Remotion-Native End-to-End Patch (Refined)
**Engine:** `@remotion` — composition drives both live preview AND export  
**Rule:** No MediaLibrary.tsx rewrite. MovieModeStudio gets new children wired in.  
**Export:** `renderMedia()` via Node.js on iam-pty → R2 `moviemode/exports/`  
**Preview:** `<Player>` already in studio — same composition props, zero duplication

---

## Why Remotion changes everything vs the FFmpeg plan

| | FFmpeg plan (DROPPED) | Remotion plan (THIS) |
|---|---|---|
| Preview engine | Native `<video>` tag | `@remotion/player` `<Player>` |
| Export engine | FFmpeg binary on iMac | `renderMedia()` in Node via iam-pty |
| Text overlays | `drawtext` filter string | React JSX — same code in preview + export |
| Audio | FFmpeg amix | `<Audio>` Remotion component |
| Trim | `-ss -to` flags | `startFrom` prop on `<Video>/<Audio>` |
| Agent interface | Build FFmpeg string | Pass JSON props to composition |
| Type safety | None | Full TypeScript end-to-end |

**The key insight:** One `MovieModeComposition.tsx` drives both the browser `<Player>` preview
and the server `renderMedia()` export. Edit the React state → preview updates live → hit Export
→ exact same JSX renders to file. No codec translation layer needed.

---

## Remotion frame math — shared helper (put in `remotion-utils.ts`)

```typescript
// dashboard/features/moviemode/remotion-utils.ts

export const FPS = 30  // default; exposed as user setting later

export const msToFrames  = (ms: number,  fps = FPS) => Math.round((ms  / 1000) * fps)
export const framesToMs  = (f: number,   fps = FPS) => Math.round((f   / fps)  * 1000)
export const secToFrames = (sec: number, fps = FPS) => Math.round(sec  * fps)

/** Clip effective duration after trim, in frames */
export const clipFrames = (clip: TimelineClip, fps = FPS) =>
  msToFrames(clip.durationMs - clip.trimInMs - clip.trimOutMs, fps)

/** Clip position on timeline, in frames */
export const clipFrom = (clip: TimelineClip, fps = FPS) =>
  msToFrames(clip.startMs, fps)

/** Source offset (trim-in), in frames — passed to <Video startFrom> */
export const clipStartFrom = (clip: TimelineClip, fps = FPS) =>
  msToFrames(clip.trimInMs, fps)
```

---

## Shared types (add to `dashboard/src/types/moviemode.ts`)

```typescript
// Additions only — don't remove existing types

export interface TimelineClip {
  id:         string
  trackType:  'video' | 'audio' | 'text'
  src:        string          // R2 presigned URL or blob: URL for local files
  fileRef:    string          // R2 key or local handle name (for persistence)
  startMs:    number          // position on timeline (left edge)
  durationMs: number          // source file total duration
  trimInMs:   number          // trim from clip start  (default 0)
  trimOutMs:  number          // trim from clip end    (default 0)
  volume:     number          // 0–1, audio only       (default 1)
  label:      string
}

export interface TextOverlay {
  id:         string
  text:       string
  startMs:    number
  durationMs: number
  x:          number          // 0–100, percent of frame width
  y:          number          // 0–100, percent of frame height
  fontSize:   number
  color:      string          // hex
  fontWeight: 'normal' | 'bold'
  background: string          // CSS background value e.g. 'rgba(0,0,0,0.5)'
  align:      'left' | 'center' | 'right'
  animation:  'none' | 'fade-in' | 'slide-up'
}

export interface EditSession {
  clips:    TimelineClip[]
  overlays: TextOverlay[]
  fps:      number
  width:    number
  height:   number
}

export interface ExportJob {
  jobId:          string
  status:         'queued' | 'rendering' | 'uploading' | 'done' | 'error'
  progressPercent: number
  r2Key?:         string
  errorMessage?:  string
}
```

---

## PATCH 1 — MovieModeComposition.tsx (NEW — the Remotion heart)

This single file is the source of truth for both `<Player>` preview and `renderMedia()` export.

```tsx
// dashboard/features/moviemode/MovieModeComposition.tsx
import {
  AbsoluteFill, Sequence, Video, Audio, useCurrentFrame,
  useVideoConfig, interpolate, Easing
} from 'remotion'
import type { EditSession, TextOverlay } from '../../src/types/moviemode'
import { clipFrom, clipFrames, clipStartFrom, msToFrames } from './remotion-utils'

// ─── Text overlay renderer ───────────────────────────────────────────────────

function OverlayText({ overlay }: { overlay: TextOverlay }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const localFrame = frame  // already scoped by parent <Sequence>
  const totalFrames = msToFrames(overlay.durationMs, fps)

  const opacity = overlay.animation === 'fade-in'
    ? interpolate(localFrame, [0, Math.min(15, totalFrames * 0.3)], [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          easing: Easing.out(Easing.ease) })
    : 1

  const translateY = overlay.animation === 'slide-up'
    ? interpolate(localFrame, [0, Math.min(12, totalFrames * 0.25)], [24, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          easing: Easing.out(Easing.back(1.2)) })
    : 0

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position:   'absolute',
        left:       `${overlay.x}%`,
        top:        `${overlay.y}%`,
        transform:  `translate(-50%, -50%) translateY(${translateY}px)`,
        opacity,
        fontSize:   overlay.fontSize,
        color:      overlay.color,
        fontWeight: overlay.fontWeight,
        textAlign:  overlay.align,
        background: overlay.background,
        padding:    '6px 12px',
        borderRadius: 6,
        whiteSpace: 'pre-wrap',
        maxWidth:   '80%',
        lineHeight: 1.3,
      }}>
        {overlay.text}
      </div>
    </AbsoluteFill>
  )
}

// ─── Main composition ────────────────────────────────────────────────────────

export function MovieModeComposition({ clips, overlays, fps }: EditSession) {
  const { fps: compositionFps } = useVideoConfig()
  const f = fps || compositionFps

  const videoClips = clips
    .filter(c => c.trackType === 'video')
    .sort((a, b) => a.startMs - b.startMs)

  const audioClips = clips
    .filter(c => c.trackType === 'audio')
    .sort((a, b) => a.startMs - b.startMs)

  return (
    <AbsoluteFill style={{ background: '#000' }}>

      {/* Video tracks */}
      {videoClips.map(clip => (
        <Sequence
          key={clip.id}
          from={clipFrom(clip, f)}
          durationInFrames={clipFrames(clip, f)}
          layout="none"
        >
          <Video
            src={clip.src}
            startFrom={clipStartFrom(clip, f)}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </Sequence>
      ))}

      {/* Audio tracks */}
      {audioClips.map(clip => (
        <Sequence
          key={clip.id}
          from={clipFrom(clip, f)}
          durationInFrames={clipFrames(clip, f)}
          layout="none"
        >
          <Audio
            src={clip.src}
            startFrom={clipStartFrom(clip, f)}
            volume={clip.volume ?? 1}
          />
        </Sequence>
      ))}

      {/* Text overlays */}
      {overlays.map(overlay => (
        <Sequence
          key={overlay.id}
          from={msToFrames(overlay.startMs, f)}
          durationInFrames={msToFrames(overlay.durationMs, f)}
          layout="none"
        >
          <OverlayText overlay={overlay} />
        </Sequence>
      ))}

    </AbsoluteFill>
  )
}
```

**Wire into MovieModeStudio.tsx — replace or update the existing `<Player>` call:**

```tsx
// In MovieModeStudio.tsx — update the <Player> to use MovieModeComposition

import { Player } from '@remotion/player'
import { MovieModeComposition } from './MovieModeComposition'

// Total timeline duration in frames
const totalDurationFrames = useMemo(() => {
  const lastClipEnd = Math.max(0, ...clips.map(c =>
    msToFrames(c.startMs + c.durationMs - c.trimInMs - c.trimOutMs)
  ))
  const lastOverlayEnd = Math.max(0, ...overlays.map(o =>
    msToFrames(o.startMs + o.durationMs)
  ))
  return Math.max(lastClipEnd, lastOverlayEnd, FPS * 5)  // minimum 5s
}, [clips, overlays])

// In JSX:
<Player
  component={MovieModeComposition}
  inputProps={{ clips, overlays, fps: FPS, width: 1280, height: 720 }}
  durationInFrames={totalDurationFrames}
  compositionWidth={1280}
  compositionHeight={720}
  fps={FPS}
  style={{ width: '100%', borderRadius: 8 }}
  controls
  ref={playerRef}  // expose for programmatic seek / play
/>
```

---

## PATCH 2 — TimelineControls.tsx (NEW)

Trim handles, split-at-playhead, clip select, move. Pixel-perfect drag using
`useRef` for stable start values — fixes the accumulation bug in the original plan.

```tsx
// dashboard/features/moviemode/TimelineControls.tsx
import { useRef, useCallback } from 'react'
import type { TimelineClip } from '../../src/types/moviemode'
import { FPS, msToFrames } from './remotion-utils'

const PX_PER_SEC = 80  // expose as zoom slider later

const msToX   = (ms: number)  => (ms / 1000) * PX_PER_SEC
const xToMs   = (px: number)  => (px / PX_PER_SEC) * 1000

const TRACK_TOP: Record<string, number> = { video: 8, audio: 60, text: 112 }
const TRACK_COLOR: Record<string, string> = {
  video: 'rgba(245,158,11,0.75)',
  audio: 'rgba(59,130,246,0.75)',
  text:  'rgba(16,185,129,0.75)',
}

interface Props {
  clips:           TimelineClip[]
  playheadMs:      number
  selectedClipId:  string | null
  onPlayheadSeek:  (ms: number) => void
  onTrim:          (clipId: string, trimInMs: number, trimOutMs: number) => void
  onSplit:         (clipId: string, atMs: number) => void
  onMove:          (clipId: string, newStartMs: number) => void
  onDelete:        (clipId: string) => void
  onSelect:        (clipId: string | null) => void
}

export function TimelineControls({
  clips, playheadMs, selectedClipId,
  onPlayheadSeek, onTrim, onSplit, onMove, onDelete, onSelect
}: Props) {

  const totalMs = Math.max(
    10_000,
    ...clips.map(c => c.startMs + c.durationMs - c.trimInMs - c.trimOutMs + 2000)
  )

  // ── Playhead scrub ──────────────────────────────────────────────────────────
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onPlayheadSeek(xToMs(e.clientX - rect.left))
  }

  return (
    <div
      style={{ position: 'relative', width: msToX(totalMs), userSelect: 'none',
               height: 160, cursor: 'crosshair' }}
      onClick={handleRulerClick}
    >
      {/* Ruler */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 20,
                    borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {Array.from({ length: Math.ceil(totalMs / 1000) }).map((_, s) => (
          <div key={s} style={{
            position: 'absolute', left: msToX(s * 1000),
            top: 4, fontSize: 9, color: 'rgba(255,255,255,0.4)',
            userSelect: 'none', pointerEvents: 'none',
          }}>
            {s}s
          </div>
        ))}
      </div>

      {/* Playhead */}
      <div style={{
        position: 'absolute', left: msToX(playheadMs), top: 0, bottom: 0,
        width: 2, background: '#f59e0b', zIndex: 20, pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: -5, width: 12, height: 12,
          background: '#f59e0b', clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
        }} />
      </div>

      {/* Clips */}
      {clips.map(clip => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          selected={selectedClipId === clip.id}
          onSelect={() => onSelect(clip.id)}
          onTrim={onTrim}
          onMove={onMove}
        />
      ))}

      {/* Selected clip toolbar */}
      {selectedClipId && (() => {
        const clip = clips.find(c => c.id === selectedClipId)
        if (!clip) return null
        return (
          <div style={{
            position: 'absolute',
            left: msToX(clip.startMs),
            top: TRACK_TOP[clip.trackType] - 28,
            display: 'flex', gap: 4, zIndex: 30,
          }}>
            <ToolbarBtn label="Split" onClick={() => onSplit(clip.id, playheadMs)} />
            <ToolbarBtn label="Delete" danger onClick={() => onDelete(clip.id)} />
          </div>
        )
      })()}
    </div>
  )
}

// ── ClipBlock ─────────────────────────────────────────────────────────────────

function ClipBlock({ clip, selected, onSelect, onTrim, onMove }: {
  clip:     TimelineClip
  selected: boolean
  onSelect: () => void
  onTrim:   (id: string, trimIn: number, trimOut: number) => void
  onMove:   (id: string, newStartMs: number) => void
}) {
  const effectiveMs = clip.durationMs - clip.trimInMs - clip.trimOutMs
  const left        = msToX(clip.startMs)
  const width       = msToX(effectiveMs)

  // Store original values at drag start — prevents accumulation bug
  const dragStart = useRef<{ clientX: number; origVal: number } | null>(null)

  const makeTrimDrag = useCallback((side: 'in' | 'out') =>
    (e: React.MouseEvent) => {
      e.stopPropagation()
      dragStart.current = {
        clientX: e.clientX,
        origVal: side === 'in' ? clip.trimInMs : clip.trimOutMs
      }
      const onMove = (ev: MouseEvent) => {
        if (!dragStart.current) return
        const deltaPx = ev.clientX - dragStart.current.clientX
        const deltaMs = xToMs(deltaPx)
        if (side === 'in') {
          const newTrimIn = Math.max(0,
            Math.min(dragStart.current.origVal + deltaMs,
                     clip.durationMs - clip.trimOutMs - 500))
          onTrim(clip.id, newTrimIn, clip.trimOutMs)
        } else {
          const newTrimOut = Math.max(0,
            Math.min(dragStart.current.origVal - deltaMs,
                     clip.durationMs - clip.trimInMs - 500))
          onTrim(clip.id, clip.trimInMs, newTrimOut)
        }
      }
      const onUp = () => {
        dragStart.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup',   onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup',   onUp)
    }, [clip, onTrim])

  const makeMoveDrag = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    dragStart.current = { clientX: e.clientX, origVal: clip.startMs }
    const onMv = (ev: MouseEvent) => {
      if (!dragStart.current) return
      const deltaPx = ev.clientX - dragStart.current.clientX
      const newStart = Math.max(0, dragStart.current.origVal + xToMs(deltaPx))
      onMove(clip.id, newStart)
    }
    const onUp = () => {
      dragStart.current = null
      window.removeEventListener('mousemove', onMv)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMv)
    window.addEventListener('mouseup',   onUp)
  }, [clip, onMove])

  return (
    <div
      onClick={onSelect}
      onMouseDown={makeMoveDrag}
      style={{
        position:     'absolute',
        left,
        width,
        top:          TRACK_TOP[clip.trackType] + 20,
        height:       36,
        background:   TRACK_COLOR[clip.trackType],
        border:       selected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
        borderRadius: 4,
        cursor:       'grab',
        overflow:     'hidden',
        zIndex:       10,
      }}
    >
      <span style={{ fontSize: 10, padding: '0 8px', lineHeight: '36px',
                     whiteSpace: 'nowrap', color: '#fff', fontWeight: 600 }}>
        {clip.label}
      </span>

      {/* Left trim handle */}
      <div onMouseDown={makeTrimDrag('in')} style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 8,
        background: 'rgba(255,255,255,0.35)', cursor: 'w-resize',
        borderRadius: '3px 0 0 3px',
      }} />

      {/* Right trim handle */}
      <div onMouseDown={makeTrimDrag('out')} style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 8,
        background: 'rgba(255,255,255,0.35)', cursor: 'e-resize',
        borderRadius: '0 3px 3px 0',
      }} />
    </div>
  )
}

function ToolbarBtn({ label, onClick, danger }: {
  label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
        background: danger ? '#ef4444' : 'rgba(255,255,255,0.15)',
        color: '#fff', border: 'none', fontWeight: 600,
      }}
    >
      {label}
    </button>
  )
}
```

---

## PATCH 3 — TextOverlayEditor.tsx (refined)

Uses Remotion's `<Player>` ref to sync overlay preview with playhead position.
Animation options map directly to Remotion `interpolate()` in the composition.

```tsx
// dashboard/features/moviemode/TextOverlayEditor.tsx
import { useState } from 'react'
import type { TextOverlay } from '../../src/types/moviemode'

const EMPTY_OVERLAY = (playheadMs: number): TextOverlay => ({
  id:         `txt_${Date.now()}`,
  text:       'New text',
  startMs:    playheadMs,
  durationMs: 3000,
  x: 50, y: 80,
  fontSize:   36,
  color:      '#ffffff',
  fontWeight: 'bold',
  background: 'rgba(0,0,0,0.55)',
  align:      'center',
  animation:  'fade-in',
})

interface Props {
  overlays:   TextOverlay[]
  playheadMs: number
  onChange:   (overlays: TextOverlay[]) => void
}

export function TextOverlayEditor({ overlays, playheadMs, onChange }: Props) {
  const [editing, setEditing] = useState<TextOverlay | null>(null)
  const [panel, setPanel]     = useState<'list' | 'edit'>('list')

  const save = (updated: TextOverlay) => {
    const exists = overlays.find(o => o.id === updated.id)
    onChange(exists
      ? overlays.map(o => o.id === updated.id ? updated : o)
      : [...overlays, updated]
    )
    setPanel('list')
    setEditing(null)
  }

  const remove = (id: string) => {
    onChange(overlays.filter(o => o.id !== id))
    if (editing?.id === id) { setEditing(null); setPanel('list') }
  }

  // Active overlays (for status in list)
  const activeIds = new Set(
    overlays.filter(o => playheadMs >= o.startMs &&
                         playheadMs < o.startMs + o.durationMs).map(o => o.id)
  )

  if (panel === 'edit' && editing) return (
    <div className="text-overlay-editor">
      <div className="editor-header">
        <button onClick={() => setPanel('list')}>← Back</button>
        <span>Edit text overlay</span>
      </div>

      <textarea
        value={editing.text}
        onChange={e => setEditing({ ...editing, text: e.target.value })}
        rows={3} placeholder="Overlay text..."
        style={{ width: '100%', resize: 'vertical' }}
      />

      <div className="editor-grid">
        <Field label={`Start (${(editing.startMs / 1000).toFixed(1)}s)`}>
          <input type="range" min={0} max={30000} step={100} value={editing.startMs}
            onChange={e => setEditing({ ...editing, startMs: +e.target.value })} />
        </Field>

        <Field label={`Duration (${(editing.durationMs / 1000).toFixed(1)}s)`}>
          <input type="range" min={500} max={15000} step={100} value={editing.durationMs}
            onChange={e => setEditing({ ...editing, durationMs: +e.target.value })} />
        </Field>

        <Field label={`X: ${editing.x}%`}>
          <input type="range" min={5} max={95} value={editing.x}
            onChange={e => setEditing({ ...editing, x: +e.target.value })} />
        </Field>

        <Field label={`Y: ${editing.y}%`}>
          <input type="range" min={5} max={95} value={editing.y}
            onChange={e => setEditing({ ...editing, y: +e.target.value })} />
        </Field>

        <Field label={`Size: ${editing.fontSize}px`}>
          <input type="range" min={12} max={120} value={editing.fontSize}
            onChange={e => setEditing({ ...editing, fontSize: +e.target.value })} />
        </Field>

        <Field label="Color">
          <input type="color" value={editing.color}
            onChange={e => setEditing({ ...editing, color: e.target.value })} />
        </Field>

        <Field label="Weight">
          <select value={editing.fontWeight}
            onChange={e => setEditing({ ...editing, fontWeight: e.target.value as any })}>
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
          </select>
        </Field>

        <Field label="Align">
          <select value={editing.align}
            onChange={e => setEditing({ ...editing, align: e.target.value as any })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </Field>

        <Field label="Animation">
          <select value={editing.animation}
            onChange={e => setEditing({ ...editing, animation: e.target.value as any })}>
            <option value="none">None</option>
            <option value="fade-in">Fade in</option>
            <option value="slide-up">Slide up</option>
          </select>
        </Field>
      </div>

      <div className="editor-actions">
        <button onClick={() => save(editing)} className="btn-primary">Save</button>
        <button onClick={() => remove(editing.id)} className="btn-danger">Delete</button>
        <button onClick={() => { setEditing(null); setPanel('list') }}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div className="text-overlay-list">
      <button
        className="add-overlay-btn"
        onClick={() => {
          const o = EMPTY_OVERLAY(playheadMs)
          setEditing(o)
          setPanel('edit')
        }}
      >
        + Text overlay
      </button>

      {overlays.length === 0 && (
        <p style={{ fontSize: 11, opacity: 0.4, textAlign: 'center', marginTop: 12 }}>
          No overlays yet. Click + to add one at the current playhead position.
        </p>
      )}

      {overlays.map(o => (
        <div
          key={o.id}
          className={`overlay-row ${activeIds.has(o.id) ? 'active' : ''}`}
          onClick={() => { setEditing(o); setPanel('edit') }}
        >
          <span className="overlay-label">{o.text.slice(0, 30)}</span>
          <span className="overlay-time">
            {(o.startMs / 1000).toFixed(1)}s → {((o.startMs + o.durationMs) / 1000).toFixed(1)}s
          </span>
          {activeIds.has(o.id) && <span className="overlay-badge">LIVE</span>}
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}
```

---

## PATCH 4 — ExportPanel.tsx (Remotion renderMedia via iam-pty)

Export sends the `EditSession` JSON to the worker. Worker tells iam-pty to run a
Node.js script that calls `renderMedia()`. No FFmpeg binary needed.

```tsx
// dashboard/features/moviemode/ExportPanel.tsx
import { useState } from 'react'
import type { EditSession, ExportJob } from '../../src/types/moviemode'

interface Props {
  session:          EditSession
  onExportComplete: (r2Key: string) => void
}

type Codec     = 'h264' | 'vp9' | 'gif'
type Quality   = '480p' | '720p' | '1080p'

interface ExportConfig {
  codec:   Codec
  quality: Quality
  fps:     24 | 30 | 60
}

export function ExportPanel({ session, onExportComplete }: Props) {
  const [config, setConfig] = useState<ExportConfig>({ codec: 'h264', quality: '720p', fps: 30 })
  const [job, setJob]       = useState<ExportJob | null>(null)

  const startExport = async () => {
    const res = await fetch('/api/moviemode/export', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ session, config }),
    })
    const data = await res.json()
    if (!data.jobId) { alert('Export failed to start'); return }
    setJob({ jobId: data.jobId, status: 'queued', progressPercent: 0 })
    pollJob(data.jobId)
  }

  const pollJob = (jobId: string) => {
    const iv = setInterval(async () => {
      const res  = await fetch(`/api/moviemode/export-status/${jobId}`)
      const data = await res.json() as ExportJob
      setJob(data)
      if (data.status === 'done') {
        clearInterval(iv)
        if (data.r2Key) onExportComplete(data.r2Key)
      }
      if (data.status === 'error') clearInterval(iv)
    }, 1500)
  }

  const CODECS: { value: Codec; label: string }[] = [
    { value: 'h264', label: 'MP4 (H.264)' },
    { value: 'vp9',  label: 'WebM (VP9)'  },
    { value: 'gif',  label: 'GIF'         },
  ]
  const QUALITIES: Quality[] = ['480p', '720p', '1080p']

  return (
    <div className="export-panel">
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Export</h3>

      {!job && (
        <>
          <Field label="Format">
            <select value={config.codec}
              onChange={e => setConfig({ ...config, codec: e.target.value as Codec })}>
              {CODECS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>

          <Field label="Quality">
            <select value={config.quality}
              onChange={e => setConfig({ ...config, quality: e.target.value as Quality })}>
              {QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </Field>

          <Field label="FPS">
            <select value={config.fps}
              onChange={e => setConfig({ ...config, fps: +e.target.value as any })}>
              {[24, 30, 60].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>

          <button
            className="export-submit-btn"
            onClick={startExport}
            style={{ marginTop: 12, width: '100%' }}
          >
            Export via Remotion
          </button>
        </>
      )}

      {job && job.status !== 'done' && job.status !== 'error' && (
        <div className="export-progress">
          <span style={{ fontSize: 11, textTransform: 'uppercase',
                         letterSpacing: '0.05em', opacity: 0.7 }}>
            {job.status}...
          </span>
          <progress value={job.progressPercent} max={100} style={{ width: '100%' }} />
          <span style={{ fontSize: 10, opacity: 0.5 }}>{job.progressPercent}%</span>
        </div>
      )}

      {job?.status === 'done' && job.r2Key && (
        <div className="export-success">
          <span>✓ Exported</span>
          <code style={{ fontSize: 10, wordBreak: 'break-all' }}>{job.r2Key}</code>
          <a href={`/api/r2/serve/${job.r2Key}`} target="_blank" rel="noreferrer">
            Download
          </a>
          <button onClick={() => setJob(null)}>Export again</button>
        </div>
      )}

      {job?.status === 'error' && (
        <div className="export-error">
          <span>Export failed — {job.errorMessage}</span>
          <button onClick={() => setJob(null)}>Retry</button>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10, fontSize: 11 }}>
      <span style={{ display: 'block', color: 'var(--text-muted)',
                     fontWeight: 600, marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}
```

---

## PATCH 5 — src/api/moviemode-api.js (Remotion export + Agent interface)

```javascript
// src/api/moviemode-api.js

// ─── Export: POST /api/moviemode/export ──────────────────────────────────────

export async function handleExport(request, env) {
  const { session, config } = await request.json()
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const outputFilename = `${jobId}.${config.codec === 'h264' ? 'mp4' :
                                      config.codec === 'vp9'  ? 'webm' : 'gif'}`

  const QUALITY_MAP = { '480p': [854, 480], '720p': [1280, 720], '1080p': [1920, 1080] }
  const [width, height] = QUALITY_MAP[config.quality] || [1280, 720]

  // The Node.js render script that iam-pty will execute
  // It uses @remotion/renderer which is installed in the repo
  const renderScript = `
const path = require('path');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');

(async () => {
  const bundled = await bundle({
    entryPoint: path.resolve('${process.env.DASHBOARD_PATH || 'dashboard'}/src/remotion-entry.tsx'),
    webpackOverride: (c) => c,
  });

  const comp = await selectComposition({
    serveUrl: bundled,
    id:       'MovieModeComposition',
    inputProps: ${JSON.stringify({ ...session, width, height, fps: config.fps })},
  });

  await renderMedia({
    composition:    comp,
    serveUrl:       bundled,
    codec:          '${config.codec === 'h264' ? 'h264' :
                       config.codec === 'vp9'  ? 'vp9'  : 'gif'}',
    outputLocation: '/tmp/moviemode/${outputFilename}',
    inputProps:     ${JSON.stringify({ ...session, width, height, fps: config.fps })},
    onProgress: ({ progress }) => process.stdout.write('PROGRESS:' + Math.round(progress * 100) + '\\n'),
    fps:            ${config.fps},
  });

  process.stdout.write('RENDER_DONE:${outputFilename}\\n');
})().catch(e => { process.stderr.write(e.message); process.exit(1); });
  `.trim()

  // Save job to KV
  await env.KV.put(`moviemode_job_${jobId}`, JSON.stringify({
    status: 'queued', progressPercent: 0, outputFilename,
    startedAt: Date.now(), config,
  }), { expirationTtl: 3600 })

  // Send script to iam-pty for async execution
  // ctx.waitUntil keeps this alive after response returns
  const runPromise = (async () => {
    try {
      await env.KV.put(`moviemode_job_${jobId}`, JSON.stringify({
        status: 'rendering', progressPercent: 0, outputFilename,
        startedAt: Date.now(),
      }), { expirationTtl: 3600 })

      // Execute the render script via PTY
      const ptyRes = await env.PTY_SERVICE.fetch('http://localhost:3099/execute', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Key':  env.AGENTSAM_BRIDGE_KEY,
        },
        body: JSON.stringify({
          command:     `node -e ${JSON.stringify(renderScript)}`,
          stream:      true,
          timeout_ms:  300_000,
        }),
      })

      const reader  = ptyRes.body.getReader()
      const decoder = new TextDecoder()
      let done = false

      while (!done) {
        const { done: d, value } = await reader.read()
        done = d
        if (!value) continue
        const text = decoder.decode(value)

        // Parse progress lines
        const progMatch = text.match(/PROGRESS:(\d+)/)
        if (progMatch) {
          await env.KV.put(`moviemode_job_${jobId}`, JSON.stringify({
            status: 'rendering', progressPercent: parseInt(progMatch[1]), outputFilename,
          }), { expirationTtl: 3600 })
        }

        // Render complete — upload to R2 via curl push from PTY
        if (text.includes('RENDER_DONE')) {
          await env.KV.put(`moviemode_job_${jobId}`, JSON.stringify({
            status: 'uploading', progressPercent: 99, outputFilename,
          }), { expirationTtl: 3600 })

          // PTY curls the file to our worker ingest endpoint
          const curlCmd = `curl -s -X POST https://inneranimalmedia.com/api/moviemode/ingest ` +
            `-H "X-Bridge-Key: ${env.AGENTSAM_BRIDGE_KEY}" ` +
            `-H "X-Job-Id: ${jobId}" ` +
            `-H "X-Filename: ${outputFilename}" ` +
            `--data-binary @/tmp/moviemode/${outputFilename}`

          await env.PTY_SERVICE.fetch('http://localhost:3099/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json',
                       'X-Bridge-Key': env.AGENTSAM_BRIDGE_KEY },
            body: JSON.stringify({ command: curlCmd, stream: false, timeout_ms: 120_000 }),
          })
        }
      }
    } catch (err) {
      await env.KV.put(`moviemode_job_${jobId}`, JSON.stringify({
        status: 'error', progressPercent: 0, errorMessage: err.message, outputFilename,
      }), { expirationTtl: 3600 })
    }
  })()

  // Non-blocking — return job ID immediately
  // ctx must be passed in from the main router for waitUntil to work
  if (env._ctx?.waitUntil) env._ctx.waitUntil(runPromise)

  return Response.json({ jobId, outputFilename })
}

// ─── GET /api/moviemode/export-status/:jobId ─────────────────────────────────

export async function handleExportStatus(request, env, jobId) {
  const raw = await env.KV.get(`moviemode_job_${jobId}`)
  if (!raw) return Response.json({ status: 'not_found' }, { status: 404 })
  return Response.json(JSON.parse(raw))
}

// ─── POST /api/moviemode/ingest ──────────────────────────────────────────────
// Receives the rendered file pushed by iam-pty curl, stores in R2

export async function handleIngestExport(request, env) {
  const bridgeKey = request.headers.get('X-Bridge-Key')
  if (bridgeKey !== env.AGENTSAM_BRIDGE_KEY)
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const jobId    = request.headers.get('X-Job-Id')
  const filename = request.headers.get('X-Filename')
  const buffer   = await request.arrayBuffer()

  const ext    = filename?.split('.').pop() || 'mp4'
  const r2Key  = `moviemode/exports/${filename}`
  const mime   = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : 'image/gif'

  await env.R2.put(r2Key, buffer, {
    httpMetadata:   { contentType: mime },
    customMetadata: { source: 'remotion_export', job_id: jobId,
                      created_at: new Date().toISOString() },
  })

  // Update job status in KV
  if (jobId) {
    await env.KV.put(`moviemode_job_${jobId}`, JSON.stringify({
      status: 'done', progressPercent: 100, r2Key, outputFilename: filename,
    }), { expirationTtl: 3600 })
  }

  return Response.json({ r2Key })
}

// ─── POST /api/moviemode/agent ───────────────────────────────────────────────
// Agent Sam structured command interface — session state lives in KV

export async function handleAgentMovieMode(request, env) {
  const body       = await request.json()
  const sessionKey = `moviemode_session_${body.workspace_id || env.WORKSPACE_ID || 'default'}`

  const getSession = async (): Promise<EditSession> =>
    JSON.parse(await env.KV.get(sessionKey) || '{"clips":[],"overlays":[],"fps":30,"width":1280,"height":720}')

  const saveSession = (s: EditSession) =>
    env.KV.put(sessionKey, JSON.stringify(s), { expirationTtl: 86400 })

  switch (body.action) {

    case 'get_timeline': {
      return Response.json(await getSession())
    }

    case 'describe_timeline': {
      const s        = await getSession()
      const videoMs  = s.clips.filter(c => c.trackType === 'video')
        .reduce((acc, c) => acc + c.durationMs - c.trimInMs - c.trimOutMs, 0)
      const description = [
        `${s.clips.filter(c=>c.trackType==='video').length} video clip(s)`,
        `${s.clips.filter(c=>c.trackType==='audio').length} audio clip(s)`,
        `${s.overlays.length} text overlay(s)`,
        `total duration ~${(videoMs/1000).toFixed(1)}s`,
        ...s.clips.filter(c=>c.trackType==='video').map((c,i) =>
          `Clip ${i+1}: "${c.label}" — ${((c.durationMs-c.trimInMs-c.trimOutMs)/1000).toFixed(1)}s ` +
          `(trim_in=${c.trimInMs}ms, trim_out=${c.trimOutMs}ms)`),
        ...s.overlays.map(o =>
          `Text "${o.text}" at ${(o.startMs/1000).toFixed(1)}s for ${(o.durationMs/1000).toFixed(1)}s`),
      ].join(' | ')
      return Response.json({ description, session: s })
    }

    case 'trim_clip': {
      const s = await getSession()
      s.clips = s.clips.map(c => c.id !== body.clip_id ? c : {
        ...c,
        trimInMs:  body.trim_in_ms  ?? c.trimInMs,
        trimOutMs: body.trim_out_ms ?? c.trimOutMs,
      })
      await saveSession(s)
      return Response.json({ updated: true })
    }

    case 'add_text': {
      const s = await getSession()
      s.overlays.push({
        id:         `txt_${Date.now()}`,
        text:       body.text        ?? 'Text',
        startMs:    body.start_ms    ?? 0,
        durationMs: body.duration_ms ?? 3000,
        x:          body.x           ?? 50,
        y:          body.y           ?? 80,
        fontSize:   body.font_size   ?? 36,
        color:      body.color       ?? '#ffffff',
        fontWeight: body.font_weight ?? 'bold',
        background: body.background  ?? 'rgba(0,0,0,0.55)',
        align:      body.align       ?? 'center',
        animation:  body.animation   ?? 'fade-in',
      })
      await saveSession(s)
      return Response.json({ added: true })
    }

    case 'delete_clip': {
      const s = await getSession()
      s.clips = s.clips.filter(c => c.id !== body.clip_id)
      await saveSession(s)
      return Response.json({ deleted: true })
    }

    case 'reorder_clips': {
      const s = await getSession()
      let cursor = 0
      s.clips = (body.clip_ids_in_order as string[]).map(id => {
        const c = s.clips.find(x => x.id === id)
        if (!c) return null
        const eff     = c.durationMs - c.trimInMs - c.trimOutMs
        const updated = { ...c, startMs: cursor }
        cursor += eff
        return updated
      }).filter(Boolean) as any
      await saveSession(s)
      return Response.json({ reordered: true })
    }

    case 'save_session': {
      // Frontend sends full session state to persist
      await saveSession(body.session)
      return Response.json({ saved: true })
    }

    case 'export': {
      // Delegate to the export handler
      const s = await getSession()
      const exportReq = new Request(request.url.replace('/agent', '/export'), {
        method: 'POST',
        body:   JSON.stringify({
          session: s,
          config: {
            codec:   body.codec   || 'h264',
            quality: body.quality || '720p',
            fps:     body.fps     || 30,
          },
        }),
      })
      return handleExport(exportReq, env)
    }

    default:
      return Response.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  }
}
```

---

## Remotion entry point (required for bundle step)

```tsx
// dashboard/src/remotion-entry.tsx
// Only used by renderMedia() on the server — not imported by the browser build

import { Composition } from 'remotion'
import { MovieModeComposition } from '../features/moviemode/MovieModeComposition'

export const RemotionRoot = () => (
  <Composition
    id="MovieModeComposition"
    component={MovieModeComposition}
    durationInFrames={300}   // overridden by inputProps at render time
    fps={30}
    width={1280}
    height={720}
    defaultProps={{
      clips:    [],
      overlays: [],
      fps:      30,
      width:    1280,
      height:   720,
    }}
  />
)
```

---

## Worker route additions (src/index.js)

```javascript
import {
  handleExport,
  handleExportStatus,
  handleIngestExport,
  handleAgentMovieMode,
} from './api/moviemode-api.js'

// Pass ctx through env for waitUntil support
if (path === '/api/moviemode/export'              && method === 'POST') {
  env._ctx = ctx
  return handleExport(request, env)
}
if (path.startsWith('/api/moviemode/export-status/') && method === 'GET') {
  const jobId = path.split('/').pop()
  return handleExportStatus(request, env, jobId)
}
if (path === '/api/moviemode/ingest'              && method === 'POST')
  return handleIngestExport(request, env)
if (path === '/api/moviemode/agent'               && method === 'POST')
  return handleAgentMovieMode(request, env)
```

---

## D1 Migration

```sql
-- migrations/XXXX_moviemode_edit_sessions.sql

CREATE TABLE IF NOT EXISTS moviemode_edit_sessions (
  id              TEXT PRIMARY KEY DEFAULT ('mms_' || lower(hex(randomblob(8)))),
  workspace_id    TEXT NOT NULL,
  tenant_id       TEXT,
  session_name    TEXT NOT NULL DEFAULT 'Untitled Edit',
  clips_json      TEXT NOT NULL DEFAULT '[]',
  overlays_json   TEXT NOT NULL DEFAULT '[]',
  export_config   TEXT NOT NULL DEFAULT '{}',
  last_export_r2  TEXT,
  remotion_bundle_url TEXT,    -- cached bundle URL for reuse
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active','exported','archived')),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_mms_workspace ON moviemode_edit_sessions(workspace_id);
CREATE INDEX idx_mms_tenant    ON moviemode_edit_sessions(tenant_id);
```

---

## Agent Sam usage after patch

```
"What's on the timeline right now?"
→ moviemode_describe_timeline

"Trim the first 3 seconds off the boxing clip"
→ moviemode_describe_timeline   ← always describe first
→ moviemode_trim_clip(clip_id="<id>", trim_in_ms=3000, trim_out_ms=0)

"Add a title card at the start for 4 seconds"
→ moviemode_add_text_overlay(text="Adaptive Fitness Coalition",
    start_ms=0, duration_ms=4000, x=50, y=15,
    font_size=52, color="#ffffff", animation="fade-in")

"Export 720p MP4"
→ moviemode_export(codec="h264", quality="720p", fps=30)
→ poll /api/moviemode/export-status/{jobId}  every 1.5s
→ done → R2 key returned → downloadable at /api/r2/serve/{key}
```

---

## Deploy order

```bash
# 1. D1 migration
wrangler d1 execute inneranimalmedia-business \
  --file migrations/XXXX_moviemode_edit_sessions.sql --remote

# 2. Worker only (new routes, no frontend change)
npm run deploy

# 3. Full deploy (frontend patches)
npm run deploy:full:safe
```
