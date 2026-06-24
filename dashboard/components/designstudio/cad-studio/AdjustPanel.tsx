/**
 * AdjustPanel — right-side context-aware sliders panel.
 * When no object selected: Environment (lighting, world, camera)
 * When mesh selected: Material + Modifiers + Geometry
 * Uses --dashboard-accent for theme consistency.
 */
import React, { useState } from 'react';
import { Sun, Globe, Camera, Layers, Palette, Ruler, SlidersHorizontal, X } from 'lucide-react';
import type { GameEntity } from '../../../../types';

export type AdjustPanelProps = {
  open: boolean;
  onClose: () => void;
  selectedEntity: GameEntity | null;
  sceneConfig: { ambientIntensity: number; castShadows: boolean; fogDensity: number; sunHeight: number; sunPower: number; exposure: number };
  onSceneConfigChange: (patch: Partial<AdjustPanelProps['sceneConfig']>) => void;
  onRunBlenderOp: (prompt: string) => void;
};

function SectionHead({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <div className="adj__section-head">
      <Icon size={12} strokeWidth={1.75} />
      <span>{label}</span>
    </div>
  );
}

function Slider({ label, value, min, max, step = 0.01, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="adj__slider-row">
      <span className="adj__slider-label">{label}</span>
      <span className="adj__slider-value">{value.toFixed(step < 1 ? 0 : 0)}{unit}</span>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="adj__slider"
      />
    </div>
  );
}

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="adj__color-row">
      <span className="adj__slider-label">{label}</span>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="adj__color" />
      <span className="adj__color-hex">{value}</span>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="adj__toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="adj__toggle" />
    </label>
  );
}

function ModChip({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="adj__chip" onClick={onClick}>{label}</button>;
}

export function AdjustPanel({ open, onClose, selectedEntity, sceneConfig, onSceneConfigChange, onRunBlenderOp }: AdjustPanelProps) {
  const [bgColor, setBgColor] = useState('#111214');
  const [matColor, setMatColor] = useState('#8a8a8a');
  const [roughness, setRoughness] = useState(0.8);
  const [metalness, setMetalness] = useState(0.0);
  const [opacity, setOpacity] = useState(1.0);
  const [surface, setSurface] = useState('principled');

  if (!open) return null;

  const hasSelection = !!selectedEntity;

  return (
    <aside className="adj__panel">
      <div className="adj__head">
        <span>{hasSelection ? selectedEntity!.name : 'Adjust'}</span>
        <button type="button" className="adj__close" onClick={onClose} aria-label="Close">
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>

      <div className="adj__body">
        {/* ── LIGHTING (always visible) ── */}
        <SectionHead label="LIGHTING" icon={Sun} />
        <Slider label="Exposure"    value={sceneConfig.exposure}         min={0} max={5}   step={0.05} unit="%" onChange={v => onSceneConfigChange({ exposure: v })} />
        <Slider label="Ambient"     value={sceneConfig.ambientIntensity} min={0} max={5}   step={0.1}       onChange={v => onSceneConfigChange({ ambientIntensity: v })} />
        <Slider label="Sun power"   value={sceneConfig.sunPower}         min={0} max={10}  step={0.1}       onChange={v => onSceneConfigChange({ sunPower: v })} />
        <Slider label="Sun height"  value={sceneConfig.sunHeight}        min={-90} max={90} step={1} unit="°" onChange={v => onSceneConfigChange({ sunHeight: v })} />
        <Toggle label="Cast shadows" checked={sceneConfig.castShadows} onChange={v => onSceneConfigChange({ castShadows: v })} />

        {/* ── WORLD (always visible) ── */}
        <SectionHead label="WORLD" icon={Globe} />
        <ColorSwatch label="Background" value={bgColor} onChange={setBgColor} />
        <Slider label="Fog density" value={sceneConfig.fogDensity} min={0} max={1} step={0.01} onChange={v => onSceneConfigChange({ fogDensity: v })} />
        <div className="adj__chip-grid">
          {['Exterior Day','Interior Studio','Golden Hour','Night Sky','Product White'].map(e => (
            <button key={e} type="button" className="adj__chip">{e}</button>
          ))}
        </div>

        {/* ── CAMERA (always visible) ── */}
        <SectionHead label="CAMERA" icon={Camera} />
        <div className="adj__chip-grid">
          {['Perspective','Orthographic','Isometric','Top','Front','Side'].map(v => (
            <button key={v} type="button" className="adj__chip">{v}</button>
          ))}
        </div>

        {/* ── MATERIAL (only when object selected) ── */}
        {hasSelection && (
          <>
            <SectionHead label="MATERIAL" icon={Palette} />
            <div className="adj__field">
              <span className="adj__slider-label">Surface</span>
              <select className="adj__select" value={surface} onChange={e => setSurface(e.target.value)}>
                <option value="principled">Principled BSDF</option>
                <option value="emission">Emission</option>
                <option value="glass">Glass</option>
                <option value="metal">Metal</option>
                <option value="concrete">Concrete</option>
                <option value="wood">Wood</option>
              </select>
            </div>
            <ColorSwatch label="Base color" value={matColor} onChange={setMatColor} />
            <Slider label="Roughness"  value={roughness}  min={0} max={1} step={0.01} onChange={setRoughness} />
            <Slider label="Metalness"  value={metalness}  min={0} max={1} step={0.01} onChange={setMetalness} />
            <Slider label="Opacity"    value={opacity}    min={0} max={1} step={0.01} onChange={setOpacity} />

            {/* ── MODIFIERS ── */}
            <SectionHead label="MODIFIERS" icon={Layers} />
            <div className="adj__chip-grid">
              {['Subdivision','Solidify','Bevel','Array','Mirror','Boolean','Decimate','Screw'].map(m => (
                <ModChip key={m} label={m} onClick={() => onRunBlenderOp(`Apply ${m} modifier to selected object`)} />
              ))}
            </div>

            {/* ── GEOMETRY ── */}
            <SectionHead label="GEOMETRY" icon={Ruler} />
            <div className="adj__field">
              <span className="adj__slider-label">Voxel size</span>
              <input type="number" className="adj__number" defaultValue={0.02} step={0.001} />
            </div>
            <div className="adj__btn-row">
              <button type="button" className="adj__action-btn" onClick={() => onRunBlenderOp('Voxel remesh selected object at voxel_size=0.02')}>Remesh</button>
              <button type="button" className="adj__action-btn" onClick={() => onRunBlenderOp('Smart UV unwrap selected object')}>UV Unwrap</button>
              <button type="button" className="adj__action-btn" onClick={() => onRunBlenderOp('Clean up mesh of selected object, remove doubles, fix normals')}>Clean Mesh</button>
            </div>

            {/* ── DIMENSIONS ── */}
            <SectionHead label="DIMENSIONS" icon={SlidersHorizontal} />
            <div className="adj__dim-grid">
              {['W','H','D'].map(d => (
                <div key={d} className="adj__dim-field">
                  <span className="adj__dim-label">{d}</span>
                  <input type="number" className="adj__number" defaultValue={1} step={0.01} />
                  <span className="adj__unit">m</span>
                </div>
              ))}
            </div>
            <div className="adj__poly-stats">
              <span>Verts <b>{216}</b></span>
              <span>Edges <b>{324}</b></span>
              <span>Tris <b>{324}</b></span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
