/**
 * InspectorPanel — unified 260px right-side inspector.
 * Scene mode when nothing selected; Object mode when entity is selected.
 * Replaces the old letter-tab PropertiesEditor + RightPanelTabs system.
 */
import React, { useCallback, useState } from 'react';
import type { GameEntity, SceneConfig } from '../../../../types';

export type InspectorPanelProps = {
  open: boolean;
  onClose: () => void;
  sceneConfig?: SceneConfig;
  onSceneConfigChange?: (p: Partial<SceneConfig>) => void;
  onSetBackground?: (hex: string) => void;
  onSetFog?: (enabled: boolean) => void;
  onSetGridVisible?: (v: boolean) => void;
  onSnapView?: (face: string) => void;
  onToggleOrtho?: (ortho: boolean) => void;
  orthoMode?: boolean;
  selectedEntity?: GameEntity | null;
  onEntityNameChange?: (id: string, name: string) => void;
  onEntityPositionChange?: (id: string, pos: { x?: number; y?: number; z?: number }) => void;
  onEntityScaleChange?: (id: string, scale: number) => void;
  onRunBlenderOp?: (prompt: string) => void;
};

/* ── Primitives ─────────────────────────────────────────────────────────── */

function SectionHead({ label }: { label: string }) {
  return <div className="ip__section-title">{label}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ip__row">
      <span className="ip__label">{label}</span>
      {children}
    </div>
  );
}

function IOSToggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <label className="ip__ios-toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ip__ios-slider" />
    </label>
  );
}

function SliderRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span className="ip__label">{label}</span>
        <span className="ip__value">{value.toFixed(step < 1 ? 1 : 0)}</span>
      </div>
      <input
        type="range"
        className="ip__slider"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

function NumInput({ value, step = 0.01, onChange }: { value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      className="ip__number"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

/* ── Scene Inspector ────────────────────────────────────────────────────── */

const ENV_PRESETS = [
  { label: 'Studio', bg: '#1a1c21' },
  { label: 'Void', bg: '#000000' },
  { label: 'Day', bg: '#c8d8f0' },
  { label: 'Dusk', bg: '#1a0f2e' },
  { label: 'Space', bg: '#050810' },
];

const VIEW_FACES = ['top', 'front', 'right', 'left', 'back', 'bottom'] as const;

function SceneInspector(props: Omit<InspectorPanelProps, 'open' | 'onClose' | 'selectedEntity' | 'onEntityNameChange' | 'onEntityPositionChange' | 'onEntityScaleChange' | 'onRunBlenderOp'>) {
  const { sceneConfig, onSceneConfigChange, onSetBackground, onSetFog, onSetGridVisible, onSnapView, onToggleOrtho, orthoMode = false } = props;
  const [bgColor, setBgColor] = useState('#111214');
  const [fogOn, setFogOn] = useState(false);
  const [gridOn, setGridOn] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const ambient = sceneConfig?.ambientIntensity ?? 1.5;
  const shadows = sceneConfig?.castShadows ?? true;
  const sunColor = sceneConfig?.sunColor ?? '#ffffff';

  const applyPreset = useCallback((p: { label: string; bg: string }) => {
    setActivePreset(p.label);
    setBgColor(p.bg);
    onSetBackground?.(p.bg);
  }, [onSetBackground]);

  return (
    <>
      <div className="ip__section">
        <SectionHead label="CANVAS" />
        <div className="ip__pill-grid" style={{ marginBottom: 10 }}>
          {ENV_PRESETS.map((p) => (
            <button key={p.label} type="button" className={`ip__pill${activePreset === p.label ? ' active' : ''}`} onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
        <Row label="Background">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
            <input type="color" className="ip__color" value={bgColor}
              onChange={(e) => { setBgColor(e.target.value); setActivePreset(null); onSetBackground?.(e.target.value); }} />
            <span style={{ fontFamily: 'var(--cs-mono)', fontSize: 10, color: 'var(--cs-text-2)' }}>{bgColor}</span>
          </div>
        </Row>
        <Row label="Grid">
          <IOSToggle id="ip-grid" checked={gridOn} onChange={(v) => { setGridOn(v); onSetGridVisible?.(v); }} />
        </Row>
        <Row label="Fog">
          <IOSToggle id="ip-fog" checked={fogOn} onChange={(v) => { setFogOn(v); onSetFog?.(v); }} />
        </Row>
      </div>

      <div className="ip__section">
        <SectionHead label="LIGHTING" />
        <SliderRow label="Ambient" value={ambient} min={0} max={5} step={0.1}
          onChange={(v) => onSceneConfigChange?.({ ambientIntensity: v })} />
        <Row label="Sun color">
          <input type="color" className="ip__color" value={sunColor}
            onChange={(e) => onSceneConfigChange?.({ sunColor: e.target.value })} />
        </Row>
        <Row label="Shadows">
          <IOSToggle id="ip-shadows" checked={shadows} onChange={(v) => onSceneConfigChange?.({ castShadows: v })} />
        </Row>
      </div>

      <div className="ip__section">
        <SectionHead label="CAMERA" />
        <div className="ip__pill-grid" style={{ marginBottom: 8 }}>
          <button type="button" className={`ip__pill${!orthoMode ? ' active' : ''}`} onClick={() => onToggleOrtho?.(false)}>Perspective</button>
          <button type="button" className={`ip__pill${orthoMode ? ' active' : ''}`} onClick={() => onToggleOrtho?.(true)}>Orthographic</button>
        </div>
        <div className="ip__section-title" style={{ marginTop: 6 }}>SNAP VIEW</div>
        <div className="ip__pill-grid">
          {VIEW_FACES.map((face) => (
            <button key={face} type="button" className="ip__pill" onClick={() => onSnapView?.(face)}
              style={{ textTransform: 'capitalize' }}>
              {face}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── Object Inspector ────────────────────────────────────────────────────── */

const MODIFIERS = ['Subdivision', 'Solidify', 'Bevel', 'Array', 'Mirror', 'Boolean', 'Decimate', 'Screw'];

function ObjectInspector({ entity, onEntityNameChange, onEntityPositionChange, onEntityScaleChange, onRunBlenderOp }: {
  entity: GameEntity;
  onEntityNameChange?: (id: string, name: string) => void;
  onEntityPositionChange?: (id: string, pos: { x?: number; y?: number; z?: number }) => void;
  onEntityScaleChange?: (id: string, scale: number) => void;
  onRunBlenderOp?: (prompt: string) => void;
}) {
  const pos = entity.position ?? { x: 0, y: 0, z: 0 };
  const scale = entity.scale ?? 1;
  const verts = entity.voxels ? entity.voxels.length * 8 : entity.modelUrl ? 1200 : 24;
  const tris  = entity.voxels ? entity.voxels.length * 12 : entity.modelUrl ? 1600 : 24;

  return (
    <>
      <div className="ip__section">
        <SectionHead label="TRANSFORM" />
        <div className="ip__section-title" style={{ marginBottom: 4 }}>POSITION</div>
        <div className="ip__xyz-row">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="ip__xyz-field">
              <span className={`ip__xyz-label ip__xyz-label--${axis}`}>{axis.toUpperCase()}</span>
              <NumInput value={pos[axis] ?? 0} onChange={(v) => onEntityPositionChange?.(entity.id, { [axis]: v })} />
            </div>
          ))}
        </div>
        <div className="ip__section-title" style={{ marginTop: 8, marginBottom: 4 }}>SCALE</div>
        <div className="ip__row">
          <span className="ip__label">Uniform</span>
          <NumInput value={scale} step={0.01} onChange={(v) => onEntityScaleChange?.(entity.id, v)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="ip__pill"
            onClick={() => { onEntityPositionChange?.(entity.id, { x: 0, y: 0, z: 0 }); onEntityScaleChange?.(entity.id, 1); }}>
            Reset Transform
          </button>
        </div>
      </div>

      <div className="ip__section">
        <SectionHead label="OBJECT" />
        <Row label="Name">
          <input className="ip__number" style={{ width: '100%', flex: 1 }}
            value={entity.name}
            onChange={(e) => onEntityNameChange?.(entity.id, e.target.value)} />
        </Row>
        <Row label="Type">
          <span className="ip__value" style={{ textAlign: 'left', opacity: 0.6 }}>{entity.type}</span>
        </Row>
      </div>

      <div className="ip__section">
        <SectionHead label="MESH" />
        <div className="ip__stats">
          <span><b>{verts}</b> V</span>
          <span><b>{tris}</b> T</span>
          {entity.voxels && <span><b>{entity.voxels.length}</b> vox</span>}
        </div>
        <div className="ip__chip-grid" style={{ marginTop: 6 }}>
          {['Remesh', 'UV Unwrap', 'Clean Mesh'].map((op) => (
            <button key={op} type="button" className="ip__chip" onClick={() => onRunBlenderOp?.(`${op} the selected object`)}>{op}</button>
          ))}
        </div>
      </div>

      <div className="ip__section">
        <SectionHead label="MATERIAL" />
        <Row label="Surface">
          <select className="ip__select">
            <option value="principled">Principled BSDF</option>
            <option value="emission">Emission</option>
            <option value="wireframe">Wireframe</option>
          </select>
        </Row>
        <Row label="Base color">
          <input type="color" className="ip__color" defaultValue="#8a8a8a" />
        </Row>
        <SliderRow label="Roughness" value={0.5} min={0} max={1} step={0.01} onChange={() => {}} />
        <SliderRow label="Metalness" value={0.0} min={0} max={1} step={0.01} onChange={() => {}} />
      </div>

      <div className="ip__section">
        <SectionHead label="MODIFIERS" />
        <div className="ip__chip-grid">
          {MODIFIERS.map((mod) => (
            <button key={mod} type="button" className="ip__chip"
              onClick={() => onRunBlenderOp?.(`Apply ${mod} modifier to the selected object`)}>
              {mod}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── Panel Shell ─────────────────────────────────────────────────────────── */

export function InspectorPanel({ open, onClose, sceneConfig, onSceneConfigChange, onSetBackground, onSetFog, onSetGridVisible, onSnapView, onToggleOrtho, orthoMode = false, selectedEntity = null, onEntityNameChange, onEntityPositionChange, onEntityScaleChange, onRunBlenderOp }: InspectorPanelProps) {
  if (!open) return null;
  const hasSelection = selectedEntity != null;

  return (
    <div className="ip__panel">
      <div className="ip__head">
        {hasSelection ? (
          <input
            className="ip__head-input"
            value={selectedEntity.name}
            onChange={(e) => onEntityNameChange?.(selectedEntity.id, e.target.value)}
            aria-label="Object name"
          />
        ) : (
          <span className="ip__head-title">Scene</span>
        )}
        <button type="button" className="ip__close" onClick={onClose} aria-label="Close Inspector">✕</button>
      </div>
      <div className="ip__body">
        {hasSelection ? (
          <ObjectInspector
            entity={selectedEntity}
            onEntityNameChange={onEntityNameChange}
            onEntityPositionChange={onEntityPositionChange}
            onEntityScaleChange={onEntityScaleChange}
            onRunBlenderOp={onRunBlenderOp}
          />
        ) : (
          <SceneInspector
            sceneConfig={sceneConfig}
            onSceneConfigChange={onSceneConfigChange}
            onSetBackground={onSetBackground}
            onSetFog={onSetFog}
            onSetGridVisible={onSetGridVisible}
            onSnapView={onSnapView}
            onToggleOrtho={onToggleOrtho}
            orthoMode={orthoMode}
          />
        )}
      </div>
    </div>
  );
}
