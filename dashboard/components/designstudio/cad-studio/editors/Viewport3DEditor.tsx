import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewTool } from '../cadStudioTypes';

export type Viewport3DEditorProps = {
  engineContainerRef: React.RefObject<HTMLDivElement | null>;
  onEngineContainerMount: () => void;
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
};

export function Viewport3DEditor({
  engineContainerRef,
  onEngineContainerMount,
  label = 'User Perspective',
  sublabel,
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
}: Viewport3DEditorProps) {
  const bindMount = useCallback(
    (node: HTMLDivElement | null) => {
      engineContainerRef.current = node;
      if (node) onEngineContainerMount();
    },
    [engineContainerRef, onEngineContainerMount],
  );

  return (
    <section className="cad-editor cad-editor--viewport">
      <div ref={bindMount} className="cad-editor__engine-mount" />
      <div className="cad-studio__viewport-overlay">
        <div className="cad-studio__viewport-label">
          <div>{label}</div>
          {sublabel ? <div className="muted">{sublabel}</div> : null}
        </div>
        <div className="cad-studio__stats">
          <div>Objects&nbsp;&nbsp;{entityCount}</div>
          <div>Voxels&nbsp;&nbsp;&nbsp;{voxelCount}</div>
          <div>Tool&nbsp;&nbsp;&nbsp;&nbsp;{activeTool}</div>
          <div>Job&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{jobId?.slice(0, 12) || 'none'}</div>
        </div>
        <div className="cad-studio__axis-gizmo" aria-hidden="true">
          <span className="cad-studio__axis-dot cad-studio__axis-dot--x">X</span>
          <span className="cad-studio__axis-dot cad-studio__axis-dot--y">Y</span>
          <span className="cad-studio__axis-dot cad-studio__axis-dot--z">Z</span>
        </div>
        {showHud ? (
          <div className="cad-studio__hud-btns">
            <button type="button" className="cad-studio__hud-btn" onClick={onUndo} disabled={!canUndo} title="Undo">
              ↶
            </button>
            <button type="button" className="cad-studio__hud-btn" onClick={onRedo} disabled={!canRedo} title="Redo">
              ↷
            </button>
            <button type="button" className="cad-studio__hud-btn cad-studio__hud-btn--purge" onClick={onClear}>
              Purge
            </button>
          </div>
        ) : null}
        {showProgress ? (
          <div className="cad-studio__progress">
            <div className="cad-studio__progress-inner">
              <div style={{ fontSize: 11, color: '#c9d0d8' }}>{progressLabel}</div>
              <div className="cad-studio__progress-bar">
                <div
                  className="cad-studio__progress-fill"
                  style={{ width: `${Math.max(8, progressPct || 12)}%` }}
                />
              </div>
            </div>
          </div>
        ) : null}
        {splash}
        {overlay}
      </div>
    </section>
  );
}

/** Secondary viewport panels (UV, camera, render preview, etc.) */
export function SecondaryViewportEditor({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="cad-editor cad-editor--secondary">
      <div className="cad-editor__head">{title}</div>
      <div className="cad-editor__body cad-editor__body--center">
        {children ?? (
          <p className="cad-editor__hint">{hint ?? 'Secondary viewport — use ChatAssistant for runner-backed views.'}</p>
        )}
      </div>
    </section>
  );
}

/** Minimal script editor strip for Scripting / Geometry workspaces. */
export function ScriptEditor({
  script,
  onChange,
  onRunViaChat,
  readOnly,
}: {
  script: string;
  onChange?: (v: string) => void;
  onRunViaChat?: () => void;
  readOnly?: boolean;
}) {
  return (
    <section className="cad-editor cad-editor--script">
      <div className="cad-editor__head">
        <span>Script</span>
        {onRunViaChat ? (
          <button type="button" className="cad-studio__btn" onClick={onRunViaChat}>
            Run via Agent
          </button>
        ) : null}
      </div>
      <textarea
        className="cad-editor__script-area"
        value={script}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        spellCheck={false}
      />
    </section>
  );
}

/** Node editor lite for Shading workspace. */
export function NodeEditor({
  materialColor,
  roughness,
  metalness,
  onChange,
}: {
  materialColor: string;
  roughness: number;
  metalness: number;
  onChange: (patch: { color?: string; roughness?: number; metalness?: number }) => void;
}) {
  return (
    <section className="cad-editor cad-editor--nodes">
      <div className="cad-editor__head">Shader Nodes</div>
      <div className="cad-editor__body cad-editor__node-graph">
        <div className="cad-editor__node">
          <div className="cad-editor__node-title">Principled BSDF</div>
          <label className="cad-editor__node-field">
            Base Color
            <input
              type="color"
              value={materialColor}
              onChange={(e) => onChange({ color: e.target.value })}
            />
          </label>
          <label className="cad-editor__node-field">
            Roughness
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={roughness}
              onChange={(e) => onChange({ roughness: Number(e.target.value) })}
            />
          </label>
          <label className="cad-editor__node-field">
            Metallic
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={metalness}
              onChange={(e) => onChange({ metalness: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="cad-editor__node cad-editor__node--output">
          <div className="cad-editor__node-title">Material Output</div>
        </div>
      </div>
    </section>
  );
}

export function MovieClipEditor({
  onLoadClip,
  markers,
  onAddMarker,
}: {
  onLoadClip?: (file: File) => void;
  markers: { id: string; frame: number; x: number; y: number }[];
  onAddMarker?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <section className="cad-editor cad-editor--movie">
      <div className="cad-editor__head">
        <span>Movie Clip</span>
        <button type="button" className="cad-studio__btn" onClick={() => inputRef.current?.click()}>
          Open Clip
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*"
          className="cad-editor__hidden-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoadClip?.(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className="cad-editor__body cad-editor__tracker-canvas">
        {markers.map((m) => (
          <span
            key={m.id}
            className="cad-editor__tracker-marker"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
            title={`Frame ${m.frame}`}
          />
        ))}
        <button type="button" className="cad-studio__btn cad-editor__tracker-add" onClick={onAddMarker}>
          + Marker
        </button>
      </div>
    </section>
  );
}

export function GraphEditor({ tracks }: { tracks: { name: string; values: number[] }[] }) {
  return (
    <section className="cad-editor cad-editor--graph">
      <div className="cad-editor__head">Graph Editor</div>
      <div className="cad-editor__body">
        {tracks.length === 0 ? (
          <p className="cad-editor__hint">Tracking curves appear after solve job.</p>
        ) : (
          tracks.map((t) => (
            <div key={t.name} className="cad-editor__graph-track">
              <span>{t.name}</span>
              <div className="cad-editor__graph-line" />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function SequencerEditor({
  strips,
  onAddStrip,
}: {
  strips: { id: string; name: string; start: number; duration: number }[];
  onAddStrip?: () => void;
}) {
  return (
    <section className="cad-editor cad-editor--sequencer">
      <div className="cad-editor__head">
        <span>Sequencer</span>
        <button type="button" className="cad-studio__btn" onClick={onAddStrip}>
          Add Strip
        </button>
      </div>
      <div className="cad-editor__sequencer-tracks">
        {strips.map((s) => (
          <div
            key={s.id}
            className="cad-editor__sequencer-strip"
            style={{ marginLeft: `${s.start * 2}px`, width: `${Math.max(40, s.duration * 2)}px` }}
          >
            {s.name}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ScopesEditor({ waveform }: { waveform: number[] }) {
  return (
    <section className="cad-editor cad-editor--scopes">
      <div className="cad-editor__head">Scopes</div>
      <div className="cad-editor__scopes-canvas">
        {waveform.map((v, i) => (
          <span key={i} className="cad-editor__scope-bar" style={{ height: `${Math.max(4, v * 100)}%` }} />
        ))}
      </div>
    </section>
  );
}

export function ColorBalanceEditor({
  lift,
  gamma,
  gain,
  onChange,
}: {
  lift: number;
  gamma: number;
  gain: number;
  onChange: (patch: { lift?: number; gamma?: number; gain?: number }) => void;
}) {
  return (
    <section className="cad-editor cad-editor--color">
      <div className="cad-editor__head">Color Balance</div>
      <div className="cad-editor__body">
        {(['lift', 'gamma', 'gain'] as const).map((key) => (
          <label key={key} className="cad-editor__node-field">
            {key}
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={key === 'lift' ? lift : key === 'gamma' ? gamma : gain}
              onChange={(e) => onChange({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

export function GreaseLayersEditor({
  layers,
  activeLayerId,
  onSelect,
  onAdd,
}: {
  layers: { id: string; name: string; visible: boolean }[];
  activeLayerId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="cad-editor cad-editor--layers">
      <div className="cad-editor__head">
        <span>GP Layers</span>
        <button type="button" className="cad-studio__btn" onClick={onAdd}>
          +
        </button>
      </div>
      <div className="cad-editor__body">
        {layers.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`cad-editor__layer-row${activeLayerId === l.id ? ' active' : ''}`}
            onClick={() => onSelect(l.id)}
          >
            {l.visible ? '●' : '○'} {l.name}
          </button>
        ))}
      </div>
    </section>
  );
}

export function DopeSheetEditor({
  frame,
  endFrame,
  keyframes,
  onSelectFrame,
}: {
  frame: number;
  endFrame: number;
  keyframes: number[];
  onSelectFrame: (f: number) => void;
}) {
  return (
    <section className="cad-editor cad-editor--dopesheet">
      <div className="cad-editor__head">Dope Sheet</div>
      <div className="cad-editor__dopesheet-body">
        {Array.from({ length: Math.min(endFrame, 120) }, (_, i) => i + 1).map((f) => (
          <button
            key={f}
            type="button"
            className={`cad-editor__dope-cell${frame === f ? ' active' : ''}${keyframes.includes(f) ? ' key' : ''}`}
            onClick={() => onSelectFrame(f)}
          >
            {keyframes.includes(f) ? '◆' : ''}
          </button>
        ))}
      </div>
    </section>
  );
}

export function TimelineEditor({
  frame,
  endFrame,
  isPlaying,
  onTogglePlay,
  onFrameChange,
  onEndFrameChange,
}: {
  frame: number;
  endFrame: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onFrameChange: (f: number) => void;
  onEndFrameChange: (f: number) => void;
}) {
  const [playing, setPlaying] = useState(isPlaying);

  useEffect(() => {
    setPlaying(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      onFrameChange(frame >= endFrame ? 1 : frame + 1);
    }, 1000 / 24);
    return () => window.clearInterval(id);
  }, [playing, frame, endFrame, onFrameChange]);

  return (
    <section className="cad-editor cad-editor--timeline">
      <div className="cad-studio__timeline-head">
        <button type="button" className="cad-studio__btn" onClick={() => { setPlaying((p) => !p); onTogglePlay(); }}>
          {playing ? '⏸' : '▶'}
        </button>
        <span className="cad-studio__divider-v" />
        <span>Frame</span>
        <input
          className="cad-studio__field-input"
          style={{ width: 48, height: 20 }}
          type="number"
          min={1}
          value={frame}
          onChange={(e) => onFrameChange(Number(e.target.value) || 1)}
        />
        <span>End</span>
        <input
          className="cad-studio__field-input"
          style={{ width: 48, height: 20 }}
          type="number"
          min={1}
          value={endFrame}
          onChange={(e) => onEndFrameChange(Number(e.target.value) || 250)}
        />
      </div>
      <div className="cad-studio__frame-strip">
        <div className="cad-studio__playhead" style={{ left: `${Math.min(100, (frame / endFrame) * 100)}%` }} />
      </div>
    </section>
  );
}
