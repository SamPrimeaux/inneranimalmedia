import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Hand, Maximize2, Pause, Play, RotateCcw, RotateCw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import type { ViewTool } from '../cadStudioTypes';

export type Viewport3DEditorProps = {
  label?: string;
  sublabel?: string;
  entityCount: number;
  voxelCount: number;
  jobId?: string | null;
  activeTool: ViewTool;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClear: () => void;
  showHud?: boolean;
  showProgress?: boolean;
  progressLabel?: string;
  progressPct?: number;
  splash?: React.ReactNode;
  overlay?: React.ReactNode;
  onDropGlb?: (file: File) => void;
  panMode?: boolean;
  onTogglePanMode?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFrameAll?: () => void;
  onResetView?: () => void;
  onSnapView?: (face: 'top' | 'front' | 'right' | 'left' | 'back' | 'bottom') => void;
  orthoMode?: boolean;
  onToggleOrtho?: () => void;
};

/**
 * ViewCube — proper isometric 3-face cube with clickable face snap.
 * True isometric projection: top face = horizontal rhombus,
 * left/right faces use correct isometric shear angles.
 * Each face labeled, stroke edges for depth.
 */
function ViewCube({ onSnapView }: { onSnapView?: Viewport3DEditorProps['onSnapView'] }) {
  // Isometric cube: 56px canvas
  // Top face (flat top diamond)
  const top   = 'M28,6  L50,18 L28,30 L6,18 Z';
  // Left face (front-left)
  const left  = 'M6,18  L28,30 L28,50 L6,38  Z';
  // Right face (front-right)
  const right = 'M28,30 L50,18 L50,38 L28,50 Z';
  const stroke = 'rgba(255,255,255,0.20)';

  return (
    <div className="vpc__cube" title="Click a face to snap view">
      <svg width={56} height={56} viewBox="0 0 56 56" className="vpc__svg" aria-label="View cube — click a face to snap">
        {/* Fill faces */}
        <path d={top}   className="vpc__face vpc__face--top"   onClick={() => onSnapView?.('top')} />
        <path d={left}  className="vpc__face vpc__face--left"  onClick={() => onSnapView?.('front')} />
        <path d={right} className="vpc__face vpc__face--right" onClick={() => onSnapView?.('right')} />
        {/* Stroke edges over fills for crisp depth cues */}
        <path d={top}   fill="none" stroke={stroke} strokeWidth="0.8" />
        <path d={left}  fill="none" stroke={stroke} strokeWidth="0.8" />
        <path d={right} fill="none" stroke={stroke} strokeWidth="0.8" />
        {/* Center spine — vertical edge */}
        <line x1="28" y1="30" x2="28" y2="50" stroke={stroke} strokeWidth="0.8" />
        {/* Face labels: centered in each face */}
        <text x="28" y="21" className="vpc__label">TOP</text>
        <text x="15" y="39" className="vpc__label">FRONT</text>
        <text x="41" y="39" className="vpc__label">RIGHT</text>
      </svg>
      {/* XYZ axis pills */}
      <div className="vpc__axes">
        <span className="vpc__axis vpc__axis--x">X</span>
        <span className="vpc__axis vpc__axis--y">Y</span>
        <span className="vpc__axis vpc__axis--z">Z</span>
      </div>
    </div>
  );
}

export function Viewport3DEditor({
  entityCount,
  voxelCount,
  jobId,
  activeTool,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  showHud = true,
  showProgress,
  progressLabel,
  progressPct = 0,
  splash,
  overlay,
  onDropGlb,
  panMode = false,
  onTogglePanMode,
  onZoomIn,
  onZoomOut,
  onFrameAll,
  onResetView,
  onSnapView,
  orthoMode = false,
  onToggleOrtho,
}: Viewport3DEditorProps) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <section
      className={`cad-editor cad-editor--viewport${dragOver ? ' cad-editor--viewport-drop' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const glb = Array.from(e.dataTransfer.files).find((f) => f.name.toLowerCase().endsWith('.glb'));
        if (glb) onDropGlb?.(glb);
      }}
    >
      <div className="cad-studio__viewport-overlay">

        {/* ── Top-right: ViewCube + undo/redo/clear ── */}
        <div className="vpc__top-right">
          <div className="cad-studio__hud-btns">
            {showHud ? (
              <>
                <button type="button" className="cad-studio__hud-btn" onClick={onUndo} disabled={!canUndo} title="Undo  ⌘Z">
                  <RotateCcw size={13} />
                </button>
                <button type="button" className="cad-studio__hud-btn" onClick={onRedo} disabled={!canRedo} title="Redo  ⇧⌘Z">
                  <RotateCw size={13} />
                </button>
                <button type="button" className="cad-studio__hud-btn cad-studio__hud-btn--purge" onClick={onClear} title="Clear scene">
                  <Trash2 size={13} />
                </button>
              </>
            ) : null}
          </div>
          <ViewCube onSnapView={onSnapView} />
        </div>

        {/* ── Right-center: zoom/pan/frame nav ── */}
        <div className="cad-studio__view-nav">
          <button type="button" className="cad-studio__hud-btn" onClick={onZoomIn}  title="Zoom in"><ZoomIn size={13} /></button>
          <button type="button" className="cad-studio__hud-btn" onClick={onZoomOut} title="Zoom out"><ZoomOut size={13} /></button>
          <button type="button" className={`cad-studio__hud-btn${panMode ? ' active' : ''}`} onClick={onTogglePanMode} title="Pan"><Hand size={13} /></button>
          <button type="button" className="cad-studio__hud-btn" onClick={onFrameAll}  title="Frame all"><Maximize2 size={13} /></button>
          <button type="button" className="cad-studio__hud-btn" onClick={onResetView} title="Reset view"><RotateCcw size={13} /></button>
        </div>

        {/* ── Bottom-center: Ortho / Perspective toggle pill ── */}
        <div className="vpc__view-toggle">
          <button
            type="button"
            className={`vpc__view-btn${orthoMode ? ' active' : ''}`}
            onClick={() => !orthoMode && onToggleOrtho?.()}
          >
            Orthographic
          </button>
          <button
            type="button"
            className={`vpc__view-btn${!orthoMode ? ' active' : ''}`}
            onClick={() => orthoMode && onToggleOrtho?.()}
          >
            Perspective
          </button>
        </div>

        {/* Progress */}
        {showProgress ? (
          <div className="cad-studio__progress">
            <div className="cad-studio__progress-inner">
              <div style={{ fontSize: 11, color: '#c9d0d8' }}>{progressLabel}</div>
              <div className="cad-studio__progress-bar">
                <div className="cad-studio__progress-fill" style={{ width: `${Math.max(8, progressPct || 12)}%` }} />
              </div>
            </div>
          </div>
        ) : null}

        {dragOver ? <div className="cad-editor__drop-hint">Drop GLB to import</div> : null}
        {splash}
        {overlay}
      </div>
    </section>
  );
}

/** Secondary viewport panels */
export function SecondaryViewportEditor({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <section className="cad-editor cad-editor--secondary">
      <div className="cad-editor__head">{title}</div>
      <div className="cad-editor__body cad-editor__body--center">
        {children ?? <p className="cad-editor__hint">{hint ?? 'Secondary viewport'}</p>}
      </div>
    </section>
  );
}

export function ScriptEditor({ script, onChange, onRunViaChat, readOnly }: { script: string; onChange?: (v: string) => void; onRunViaChat?: () => void; readOnly?: boolean }) {
  return (
    <section className="cad-editor cad-editor--script">
      <div className="cad-editor__head">
        <span>Script</span>
        {onRunViaChat ? <button type="button" className="cad-studio__btn" onClick={onRunViaChat}>Run</button> : null}
      </div>
      <textarea className="cad-editor__script-area" value={script} readOnly={readOnly} onChange={(e) => onChange?.(e.target.value)} spellCheck={false} />
    </section>
  );
}

export function NodeEditor({ materialColor, roughness, metalness, onChange }: { materialColor: string; roughness: number; metalness: number; onChange: (patch: { color?: string; roughness?: number; metalness?: number }) => void }) {
  return (
    <section className="cad-editor cad-editor--nodes">
      <div className="cad-editor__head">Shader Nodes</div>
      <div className="cad-editor__body cad-editor__node-graph">
        <div className="cad-editor__node">
          <div className="cad-editor__node-title">Principled BSDF</div>
          <label className="cad-editor__node-field">Base Color<input type="color" value={materialColor} onChange={(e) => onChange({ color: e.target.value })} /></label>
          <label className="cad-editor__node-field">Roughness<input type="range" min={0} max={1} step={0.01} value={roughness} onChange={(e) => onChange({ roughness: Number(e.target.value) })} /></label>
          <label className="cad-editor__node-field">Metallic<input type="range" min={0} max={1} step={0.01} value={metalness} onChange={(e) => onChange({ metalness: Number(e.target.value) })} /></label>
        </div>
        <div className="cad-editor__node cad-editor__node--output"><div className="cad-editor__node-title">Material Output</div></div>
      </div>
    </section>
  );
}

export function MovieClipEditor({ onLoadClip, markers, onAddMarker }: { onLoadClip?: (file: File) => void; markers: { id: string; frame: number; x: number; y: number }[]; onAddMarker?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <section className="cad-editor cad-editor--movie">
      <div className="cad-editor__head">
        <span>Movie Clip</span>
        <button type="button" className="cad-studio__btn" onClick={() => inputRef.current?.click()}>Open Clip</button>
        <input ref={inputRef} type="file" accept="video/*,image/*" className="cad-editor__hidden-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) onLoadClip?.(f); e.target.value = ''; }} />
      </div>
      <div className="cad-editor__body cad-editor__tracker-canvas">
        {markers.map((m) => <span key={m.id} className="cad-editor__tracker-marker" style={{ left: `${m.x}%`, top: `${m.y}%` }} title={`Frame ${m.frame}`} />)}
        <button type="button" className="cad-studio__btn cad-editor__tracker-add" onClick={onAddMarker}>+ Marker</button>
      </div>
    </section>
  );
}

export function GraphEditor({ tracks }: { tracks: { name: string; values: number[] }[] }) {
  return (
    <section className="cad-editor cad-editor--graph">
      <div className="cad-editor__head">Graph Editor</div>
      <div className="cad-editor__body">
        {tracks.length === 0 ? <p className="cad-editor__hint">Tracking curves appear after solve job.</p> : tracks.map((t) => <div key={t.name} className="cad-editor__graph-track"><span>{t.name}</span><div className="cad-editor__graph-line" /></div>)}
      </div>
    </section>
  );
}

export function SequencerEditor({ strips, onAddStrip }: { strips: { id: string; name: string; start: number; duration: number }[]; onAddStrip?: () => void }) {
  return (
    <section className="cad-editor cad-editor--sequencer">
      <div className="cad-editor__head"><span>Sequencer</span><button type="button" className="cad-studio__btn" onClick={onAddStrip}>Add Strip</button></div>
      <div className="cad-editor__sequencer-tracks">
        {strips.map((s) => <div key={s.id} className="cad-editor__sequencer-strip" style={{ marginLeft: `${s.start * 2}px`, width: `${Math.max(40, s.duration * 2)}px` }}>{s.name}</div>)}
      </div>
    </section>
  );
}

export function ScopesEditor({ waveform }: { waveform: number[] }) {
  return (
    <section className="cad-editor cad-editor--scopes">
      <div className="cad-editor__head">Scopes</div>
      <div className="cad-editor__scopes-canvas">
        {waveform.map((v, i) => <span key={i} className="cad-editor__scope-bar" style={{ height: `${Math.max(4, v * 100)}%` }} />)}
      </div>
    </section>
  );
}

export function ColorBalanceEditor({ lift, gamma, gain, onChange }: { lift: number; gamma: number; gain: number; onChange: (patch: { lift?: number; gamma?: number; gain?: number }) => void }) {
  return (
    <section className="cad-editor cad-editor--color">
      <div className="cad-editor__head">Color Balance</div>
      <div className="cad-editor__body">
        {(['lift', 'gamma', 'gain'] as const).map((key) => (
          <label key={key} className="cad-editor__node-field">{key}<input type="range" min={-1} max={1} step={0.01} value={key === 'lift' ? lift : key === 'gamma' ? gamma : gain} onChange={(e) => onChange({ [key]: Number(e.target.value) })} /></label>
        ))}
      </div>
    </section>
  );
}

export function GreaseLayersEditor({ layers, activeLayerId, onSelect, onAdd }: { layers: { id: string; name: string; visible: boolean }[]; activeLayerId: string | null; onSelect: (id: string) => void; onAdd: () => void }) {
  return (
    <section className="cad-editor cad-editor--layers">
      <div className="cad-editor__head"><span>GP Layers</span><button type="button" className="cad-studio__btn" onClick={onAdd}>+</button></div>
      <div className="cad-editor__body">
        {layers.map((l) => <button key={l.id} type="button" className={`cad-editor__layer-row${activeLayerId === l.id ? ' active' : ''}`} onClick={() => onSelect(l.id)}>{l.visible ? <Eye size={12} /> : <EyeOff size={12} />} {l.name}</button>)}
      </div>
    </section>
  );
}

export function DopeSheetEditor({ frame, endFrame, keyframes, onSelectFrame }: { frame: number; endFrame: number; keyframes: number[]; onSelectFrame: (f: number) => void }) {
  return (
    <section className="cad-editor cad-editor--dopesheet">
      <div className="cad-editor__head">Dope Sheet</div>
      <div className="cad-editor__dopesheet-body">
        {Array.from({ length: Math.min(endFrame, 120) }, (_, i) => i + 1).map((f) => (
          <button key={f} type="button" className={`cad-editor__dope-cell${frame === f ? ' active' : ''}${keyframes.includes(f) ? ' key' : ''}`} onClick={() => onSelectFrame(f)}>{keyframes.includes(f) ? 'K' : ''}</button>
        ))}
      </div>
    </section>
  );
}

export function TimelineEditor({ frame, endFrame, isPlaying, onTogglePlay, onFrameChange, onEndFrameChange, keyframes = [], onSelectFrame }: { frame: number; endFrame: number; isPlaying: boolean; onTogglePlay: () => void; onFrameChange: (f: number) => void; onEndFrameChange: (f: number) => void; keyframes?: number[]; onSelectFrame?: (f: number) => void }) {
  const [playing, setPlaying] = useState(isPlaying);
  const visibleEnd = Math.min(endFrame, 250);
  const ticks = useMemo(() => { const out: number[] = []; for (let f = 0; f <= visibleEnd; f += 10) out.push(f); if (!out.includes(visibleEnd)) out.push(visibleEnd); return out; }, [visibleEnd]);
  useEffect(() => { setPlaying(isPlaying); }, [isPlaying]);
  useEffect(() => { if (!playing) return; const id = window.setInterval(() => { onFrameChange(frame >= endFrame ? 1 : frame + 1); }, 1000 / 24); return () => window.clearInterval(id); }, [playing, frame, endFrame, onFrameChange]);
  const scrubToClientX = (clientX: number, el: HTMLElement) => { const rect = el.getBoundingClientRect(); const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); const f = Math.max(1, Math.round(pct * visibleEnd)); onFrameChange(f); onSelectFrame?.(f); };
  return (
    <section className="cad-editor cad-editor--timeline">
      <div className="cad-studio__timeline-head">
        <button type="button" className="cad-studio__btn" onClick={() => { setPlaying((p) => !p); onTogglePlay(); }} title={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
        <span className="cad-studio__divider-v" />
        <span>Frame</span>
        <input className="cad-studio__field-input" style={{ width: 48, height: 20 }} type="number" min={1} value={frame} onChange={(e) => onFrameChange(Number(e.target.value) || 1)} />
        <span>End</span>
        <input className="cad-studio__field-input" style={{ width: 48, height: 20 }} type="number" min={1} value={endFrame} onChange={(e) => onEndFrameChange(Number(e.target.value) || 250)} />
        <span className="cad-studio__timeline-meta">{Math.round((frame / Math.max(1, endFrame)) * 100)}%</span>
      </div>
      <div className="cad-studio__timeline-tracks">
        <div className="cad-studio__timeline-ruler">{ticks.map((t) => <span key={t} className="cad-studio__timeline-tick" style={{ left: `${(t / visibleEnd) * 100}%` }}>{t}</span>)}</div>
        <div className="cad-studio__timeline-track" role="slider" aria-valuemin={1} aria-valuemax={visibleEnd} aria-valuenow={frame}
          onMouseDown={(e) => { scrubToClientX(e.clientX, e.currentTarget); const move = (ev: MouseEvent) => scrubToClientX(ev.clientX, e.currentTarget); const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }}>
          {keyframes.map((kf) => <button key={kf} type="button" className={`cad-studio__keyframe${frame === kf ? ' active' : ''}`} style={{ left: `${(kf / visibleEnd) * 100}%` }} title={`Keyframe ${kf}`} onClick={(e) => { e.stopPropagation(); onFrameChange(kf); onSelectFrame?.(kf); }} />)}
          <div className="cad-studio__playhead" style={{ left: `${Math.min(100, (frame / visibleEnd) * 100)}%` }} />
        </div>
      </div>
    </section>
  );
}
