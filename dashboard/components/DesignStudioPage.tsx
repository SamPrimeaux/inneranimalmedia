/**
 * Design Studio — full 3D workspace (/dashboard/designstudio).
 * Left controls + VoxelEngine viewport + overlays (migrated from App.tsx / StudioSidebar / ToolLauncherBar).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Gamepad2,
  Layers,
  Box,
  Download,
  Package,
  Sparkles,
  Zap,
  Mountain,
  Trees,
  LayoutGrid,
  Dumbbell,
  Sun,
  Moon,
  Ghost,
  Plane,
  Activity,
  Shield,
  Palette,
  Plus,
  Trash2,
  Link,
  UploadCloud,
  Eye,
  Sword,
  UserCircle,
  Globe,
  ChevronLeft,
} from 'lucide-react';
import { VoxelEngine } from '../services/VoxelEngine';
import { UIOverlay } from './UIOverlay';
import { ToolLauncherBar } from './ToolLauncherBar';
import {
  ProjectType,
  AppState,
  GameEntity,
  GenerationConfig,
  ArtStyle,
  SceneConfig,
  CADTool,
  CustomAsset,
  CADPlane,
} from '../types';

type PendingGlbState = { pendingGlb?: { url: string; name: string } };

function DesignStudioLeftPanel(props: {
  activeProject: ProjectType;
  onSwitchProject: (type: ProjectType) => void;
  onExport: () => void;
  genConfig: GenerationConfig;
  onUpdateGenConfig: (config: Partial<GenerationConfig>) => void;
  sceneConfig: SceneConfig;
  onUpdateSceneConfig: (config: Partial<SceneConfig>) => void;
  onSpawnModel: (name: string, url: string, scale: number) => void;
  customAssets: CustomAsset[];
  onAddCustomAsset: (name: string, url: string) => void;
  onRemoveCustomAsset: (id: string) => void;
}) {
  const {
    activeProject,
    onSwitchProject,
    onExport,
    genConfig,
    onUpdateGenConfig,
    sceneConfig,
    onUpdateSceneConfig,
    onSpawnModel,
    customAssets,
    onAddCustomAsset,
    onRemoveCustomAsset,
  } = props;

  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetUrl, setNewAssetUrl] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [chessPieces, setChessPieces] = useState<
    { type: string; name: string; white_url: string; black_url: string }[]
  >([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/games/pieces')
      .then((r) => r.json())
      .then(({ results }) => {
        const map: Record<
          string,
          { type: string; name: string; white_url?: string; black_url?: string }
        > = {};
        for (const row of results || []) {
          let meta: Record<string, unknown> = {};
          try {
            meta =
              typeof (row as { metadata?: unknown }).metadata === 'string'
                ? JSON.parse((row as { metadata: string }).metadata || '{}')
                : ((row as { metadata?: Record<string, unknown> }).metadata ?? {});
          } catch {
            meta = {};
          }
          const piece = meta.piece;
          const color = meta.color;
          if (typeof piece !== 'string' || typeof color !== 'string') continue;
          if (!map[piece]) {
            const label = meta.piece_armory_label;
            map[piece] = {
              type: piece,
              name: typeof label === 'string' ? label : piece,
            };
          }
          if (color === 'white' || color === 'black') {
            map[piece][`${color}_url` as 'white_url' | 'black_url'] = (row as { public_url: string })
              .public_url;
          }
        }
        setChessPieces(
          Object.values(map).map((p) => ({
            type: p.type,
            name: p.name,
            white_url: p.white_url || '',
            black_url: p.black_url || '',
          })),
        );
      })
      .catch((e) => console.warn('[Piece Armory] fetch failed', e));
  }, []);

  const projects = [
    { id: ProjectType.CHESS, name: 'Games', icon: <Gamepad2 size={20} />, desc: '3D Physics Chess' },
    { id: ProjectType.CAD, name: 'Agent Sam', icon: <Layers size={20} />, desc: 'Precision Blueprints' },
    { id: ProjectType.SANDBOX, name: 'Sandbox Lab', icon: <Box size={20} />, desc: 'Voxel Physics Fun' },
  ];

  const styles = [
    { id: ArtStyle.CYBERPUNK, name: 'Cyberpunk', icon: <Zap size={14} />, colors: 'from-cyan-500 to-blue-600' },
    { id: ArtStyle.BRUTALIST, name: 'Brutalist', icon: <Mountain size={14} />, colors: 'from-slate-600 to-slate-800' },
    { id: ArtStyle.ORGANIC, name: 'Organic', icon: <Trees size={14} />, colors: 'from-emerald-500 to-teal-600' },
    { id: ArtStyle.LOW_POLY, name: 'Low-Poly', icon: <LayoutGrid size={14} />, colors: 'from-amber-400 to-orange-500' },
  ];

  const sunPresets = [
    { id: '#00ffff', name: 'Neon', icon: <Zap size={12} /> },
    { id: '#ffcc00', name: 'Sol', icon: <Sun size={12} /> },
    { id: '#ffffff', name: 'Cold', icon: <Moon size={12} /> },
    { id: '#ff3366', name: 'Ghost', icon: <Ghost size={12} /> },
    { id: '#ef4444', name: 'Ruby', icon: <Palette size={12} /> },
    { id: '#10b981', name: 'Emerald', icon: <Palette size={12} /> },
    { id: '#6366f1', name: 'Indigo', icon: <Palette size={12} /> },
    { id: '#0a0a0f', name: 'Void', icon: <Palette size={12} /> },
  ];

  const assetGallery = [
    {
      name: 'IAM Footer',
      url: 'https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/inneranimalmediafooterglb.glb',
      icon: <Shield size={14} />,
      scale: 1.5,
    },
    {
      name: 'Kinetic Symmetry',
      url: 'https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/Kinetic_Symmetry_0831084700_generate%20(1).glb',
      icon: <Activity size={14} />,
      scale: 2,
    },
    {
      name: 'Meshy Jet',
      url: 'https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
      icon: <Plane size={14} />,
      scale: 1.2,
    },
  ];

  const handleQuickSpawn = () => {
    if (newAssetUrl) {
      onSpawnModel(newAssetName || 'Imported Asset', newAssetUrl, 1);
    }
  };

  const handleDirectSpawn = () => {
    if (directUrl.trim()) {
      onSpawnModel('Remote Asset', directUrl.trim(), 1);
      setDirectUrl('');
    }
  };

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (newAssetName && newAssetUrl) {
      onAddCustomAsset(newAssetName, newAssetUrl);
      setNewAssetName('');
      setNewAssetUrl('');
      setIsAdding(false);
    }
  };

  return (
    <div className="w-[260px] min-w-[260px] h-full bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] flex flex-col p-4 z-20 overflow-y-auto custom-scrollbar">
      <div className="mb-6 flex-shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/dashboard/agent')}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
          title="Back to Agent"
        >
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>
        <div>
          <h1 className="text-[13px] font-black tracking-wide text-[var(--text-heading)]">Design Studio</h1>
          <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">3D workspace</p>
        </div>
      </div>

      <div className="space-y-6 flex-1 pb-8">
        <section>
          <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-3">Workspace</p>
          <div className="space-y-2">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSwitchProject(p.id)}
                className={`w-full group flex items-start gap-3 p-3 rounded-xl transition-all border text-left ${
                  activeProject === p.id
                    ? 'bg-[var(--bg-hover)] border-[var(--solar-cyan)]/30'
                    : 'bg-transparent border-transparent hover:bg-[var(--bg-hover)]'
                }`}
              >
                <div
                  className={`mt-1 p-2 rounded-lg transition-colors ${
                    activeProject === p.id
                      ? 'bg-[var(--solar-cyan)] text-black shadow-[0_0_10px_rgba(0,255,255,0.2)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-muted)] group-hover:text-[var(--text-main)]'
                  }`}
                >
                  {React.cloneElement(p.icon as React.ReactElement<{ size?: number }>, { size: 16 })}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-[11px] font-bold tracking-tight ${
                      activeProject === p.id ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-main)]'
                    }`}
                  >
                    {p.name}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-medium">{p.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="bg-gradient-to-br from-indigo-500/10 to-blue-500/5 p-4 rounded-2xl border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Globe size={14} className="text-[var(--solar-cyan)]" />
            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Direct URL Loader</p>
          </div>
          <input
            type="url"
            placeholder="https://.../model.glb"
            className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[11px] font-mono text-[var(--solar-cyan)] focus:outline-none focus:border-[var(--solar-cyan)]/50"
            value={directUrl}
            onChange={(e) => setDirectUrl(e.target.value)}
          />
          <button
            type="button"
            onClick={handleDirectSpawn}
            disabled={!directUrl.trim()}
            className="w-full bg-[var(--solar-cyan)] hover:opacity-90 disabled:opacity-30 text-black py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            Deploy to Scene
          </button>
        </section>

        {activeProject === ProjectType.CHESS && (
          <section className="bg-[var(--bg-hover)] p-4 rounded-2xl border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Sword size={14} className="text-[var(--solar-violet)]" />
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Piece Armory</p>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-2">White Pieces</p>
                <div className="grid grid-cols-3 gap-2">
                  {chessPieces.map((piece) => (
                    <button
                      type="button"
                      key={`white-${piece.type}`}
                      onClick={() => onSpawnModel(`White ${piece.name}`, piece.white_url, 0.8)}
                      disabled={!piece.white_url}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <UserCircle size={16} className="text-[var(--text-muted)]" />
                      <span className="text-[8px] font-black uppercase text-[var(--text-muted)]">{piece.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-2">Black Pieces</p>
                <div className="grid grid-cols-3 gap-2">
                  {chessPieces.map((piece) => (
                    <button
                      type="button"
                      key={`black-${piece.type}`}
                      onClick={() => onSpawnModel(`Black ${piece.name}`, piece.black_url, 0.8)}
                      disabled={!piece.black_url}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <UserCircle size={16} className="text-[var(--solar-violet)]" />
                      <span className="text-[8px] font-black uppercase text-[var(--text-muted)]">{piece.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="bg-[var(--bg-hover)] p-4 rounded-2xl border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-[var(--solar-green)]" />
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Asset Library</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAdding(!isAdding)}
              className={`p-1 rounded-md ${isAdding ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}
            >
              <Plus size={14} className={isAdding ? 'rotate-45 transition-transform' : ''} />
            </button>
          </div>

          {isAdding && (
            <form onSubmit={handleAddAsset} className="space-y-2 p-3 bg-[var(--bg-app)] rounded-xl border border-[var(--border-subtle)]">
              <input
                type="text"
                placeholder="Name"
                className="w-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[11px]"
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
              />
              <input
                type="url"
                placeholder="https://.../model.glb"
                className="w-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[11px] font-mono"
                value={newAssetUrl}
                onChange={(e) => setNewAssetUrl(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleQuickSpawn}
                  disabled={!newAssetUrl}
                  className="flex-1 bg-[var(--text-main)] text-[var(--bg-app)] py-2 rounded-lg text-[9px] font-black uppercase disabled:opacity-30"
                >
                  Quick Spawn
                </button>
                <button
                  type="submit"
                  disabled={!newAssetUrl || !newAssetName}
                  className="flex-1 bg-emerald-500 text-black py-2 rounded-lg text-[9px] font-black uppercase disabled:opacity-30"
                >
                  Save to List
                </button>
              </div>
            </form>
          )}

          <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Stock Presets</p>
          <div className="grid grid-cols-1 gap-2">
            {assetGallery.map((asset) => (
              <button
                type="button"
                key={asset.url}
                onClick={() => onSpawnModel(asset.name, asset.url, asset.scale)}
                className="flex items-center gap-3 p-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-[10px] font-bold uppercase text-left"
              >
                <span className="text-emerald-400">{asset.icon}</span>
                {asset.name}
              </button>
            ))}
            {customAssets.map((asset) => (
              <div key={asset.id} className="group relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSpawnModel(asset.name, asset.url, 1)}
                  className="flex-1 flex items-center gap-3 p-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[10px] font-bold uppercase text-left"
                >
                  <Link size={14} className="text-[var(--solar-cyan)] shrink-0" />
                  {asset.name}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveCustomAsset(asset.id)}
                  className="p-2 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded-lg"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[var(--bg-hover)] p-4 rounded-2xl border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Palette size={14} className="text-amber-400" />
            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Theme & Paint</p>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Ambient</label>
              <span className="text-[10px] font-mono text-amber-400">{sceneConfig.ambientIntensity.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={sceneConfig.ambientIntensity}
              onChange={(e) => onUpdateSceneConfig({ ambientIntensity: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-[var(--bg-panel)] rounded-lg accent-amber-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block mb-2">Sun Color</label>
            <div className="grid grid-cols-4 gap-2">
              {sunPresets.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => onUpdateSceneConfig({ sunColor: s.id })}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${
                    sceneConfig.sunColor === s.id
                      ? 'bg-[var(--bg-panel)] border-[var(--solar-cyan)] scale-105'
                      : 'bg-[var(--bg-app)] border-[var(--border-subtle)] opacity-70 hover:opacity-100'
                  }`}
                  title={s.name}
                >
                  <span style={{ color: s.id }}>{s.icon}</span>
                  <span className="text-[8px] font-bold text-[var(--text-muted)]">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Sun size={16} className={sceneConfig.castShadows ? 'text-amber-400' : 'text-[var(--text-muted)]'} />
              <span className="text-[10px] font-black uppercase text-[var(--text-main)]">Ray Shadows</span>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSceneConfig({ castShadows: !sceneConfig.castShadows })}
              className={`w-10 h-5 rounded-full relative ${sceneConfig.castShadows ? 'bg-amber-500' : 'bg-[var(--border-subtle)]'}`}
            >
              <span
                className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${
                  sceneConfig.castShadows ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Eye size={16} className={sceneConfig.showPhysicsDebug ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'} />
              <span className="text-[10px] font-black uppercase text-[var(--text-main)]">Physics Gizmos</span>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSceneConfig({ showPhysicsDebug: !sceneConfig.showPhysicsDebug })}
              className={`w-10 h-5 rounded-full relative ${sceneConfig.showPhysicsDebug ? 'bg-[var(--solar-cyan)]' : 'bg-[var(--border-subtle)]'}`}
            >
              <span
                className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${
                  sceneConfig.showPhysicsDebug ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </section>

        <section className="bg-[var(--bg-hover)] p-4 rounded-2xl border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-[var(--solar-cyan)]" />
            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Gen Config</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block mb-2">Artistic Style</label>
            <div className="grid grid-cols-2 gap-2">
              {styles.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => onUpdateGenConfig({ style: s.id })}
                  className={`flex items-center gap-2 p-2 rounded-xl border text-[10px] font-black ${
                    genConfig.style === s.id
                      ? `bg-gradient-to-br ${s.colors} text-white border-transparent`
                      : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {s.icon}
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Voxel Density</label>
              <span className="text-[10px] font-mono text-[var(--solar-cyan)]">{genConfig.density}/10</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={genConfig.density}
              onChange={(e) => onUpdateGenConfig({ density: parseInt(e.target.value, 10) })}
              className="w-full h-1.5 bg-[var(--bg-panel)] rounded-lg accent-[var(--solar-cyan)]"
            />
          </div>
          <div className="flex items-center justify-between p-3 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Dumbbell size={16} className={genConfig.usePhysics ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'} />
              <span className="text-[10px] font-black uppercase text-[var(--text-main)]">Simulate Physics</span>
            </div>
            <button
              type="button"
              onClick={() => onUpdateGenConfig({ usePhysics: !genConfig.usePhysics })}
              className={`w-10 h-5 rounded-full relative ${genConfig.usePhysics ? 'bg-[var(--solar-cyan)]' : 'bg-[var(--border-subtle)]'}`}
            >
              <span
                className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${
                  genConfig.usePhysics ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </section>
      </div>

      <div className="mt-auto pt-3 flex-shrink-0">
        <button
          type="button"
          onClick={onExport}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--text-main)] text-[var(--bg-app)] rounded-xl font-black text-[11px] uppercase tracking-widest hover:opacity-90"
        >
          <Download size={18} />
          Blender Bridge
        </button>
      </div>
    </div>
  );
}

export const DesignStudioPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VoxelEngine | null>(null);
  const pendingConsumedRef = useRef(false);

  const [engineReady, setEngineReady] = useState(false);
  const [activeProject, setActiveProject] = useState<ProjectType>(ProjectType.CHESS);
  const [appState, setAppState] = useState<AppState>(AppState.EDITING);
  const [voxelCount, setVoxelCount] = useState(0);
  const [customAssets, setCustomAssets] = useState<CustomAsset[]>([]);
  const [undoStack, setUndoStack] = useState<GameEntity[]>([]);
  const [redoStack, setRedoStack] = useState<GameEntity[]>([]);

  const [genConfig, setGenConfig] = useState<GenerationConfig>({
    style: ArtStyle.CYBERPUNK,
    density: 5,
    usePhysics: true,
    cadTool: CADTool.NONE,
    cadPlane: CADPlane.XZ,
    extrusion: 1,
  });

  const [sceneConfig, setSceneConfig] = useState<SceneConfig>({
    ambientIntensity: 1.5,
    sunColor: '#ffffff',
    castShadows: true,
    showPhysicsDebug: false,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new VoxelEngine(containerRef.current, (s) => setAppState(s), (c) => setVoxelCount(c));
    engineRef.current = engine;
    engine.setOnEntityCreated((entity) => {
      setUndoStack((prev) => [...prev, entity]);
      setRedoStack([]);
    });
    engine.updateLighting(sceneConfig);
    engine.setCADPlane(genConfig.cadPlane);
    engine.setExtrusion(genConfig.extrusion);
    engine.setProjectType(ProjectType.CHESS);

    const handleResize = () => engine.handleResize();
    window.addEventListener('resize', handleResize);
    setEngineReady(true);
    return () => {
      window.removeEventListener('resize', handleResize);
      setEngineReady(false);
      engine.cleanup();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.updateLighting(sceneConfig);
  }, [sceneConfig]);

  useEffect(() => {
    if ((location.state as PendingGlbState | null)?.pendingGlb) {
      pendingConsumedRef.current = false;
    }
  }, [location.state]);

  useEffect(() => {
    if (!engineReady || !engineRef.current || pendingConsumedRef.current) return;
    const st = (location.state as PendingGlbState | null)?.pendingGlb;
    if (!st?.url) return;
    pendingConsumedRef.current = true;
    engineRef.current.spawnEntity({
      id: `route-glb-${Date.now()}`,
      name: st.name || 'Imported',
      type: 'prop',
      position: { x: 0, y: 1, z: 0 },
      behavior: { type: 'dynamic', mass: 10, restitution: 0.2 },
      modelUrl: st.url,
      scale: 1,
    });
    navigate(location.pathname, { replace: true, state: {} });
  }, [engineReady, location.state, location.pathname, navigate]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    engineRef.current?.removeEntity(last.id);
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, last]);
  }, [undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    engineRef.current?.spawnEntity(next);
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, next]);
  }, [redoStack]);

  const handleUpdateGenConfig = useCallback((cfg: Partial<GenerationConfig>) => {
    setGenConfig((prev) => {
      const next = { ...prev, ...cfg };
      if (cfg.cadTool !== undefined) engineRef.current?.setCADTool(cfg.cadTool);
      if (cfg.cadPlane !== undefined) engineRef.current?.setCADPlane(cfg.cadPlane);
      if (cfg.extrusion !== undefined) engineRef.current?.setExtrusion(cfg.extrusion);
      return next;
    });
  }, []);

  const handleProjectSwitch = useCallback((type: ProjectType) => {
    setActiveProject(type);
    engineRef.current?.setProjectType(type);
    setGenConfig((prev) => ({ ...prev, cadTool: CADTool.NONE }));
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const handleSpawnModel = useCallback((name: string, url: string, scale: number) => {
    engineRef.current?.spawnEntity({
      id: `asset_${Date.now()}`,
      name,
      type: 'prop',
      modelUrl: url,
      scale,
      position: { x: (Math.random() - 0.5) * 10, y: 10, z: (Math.random() - 0.5) * 10 },
      behavior: { type: 'dynamic', mass: 10, restitution: 0.2 },
    });
  }, []);

  const handleAddCustomAsset = useCallback((name: string, url: string) => {
    setCustomAssets((prev) => [...prev, { id: `custom_${Date.now()}`, name, url }]);
  }, []);

  const handleRemoveCustomAsset = useCallback((id: string) => {
    setCustomAssets((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleImportGlbFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    handleSpawnModel(file.name.replace(/\.glb$/i, ''), url, 1);
  }, [handleSpawnModel]);

  const handleToolNavigate = useCallback(
    (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [],
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const glb = files.find((f) => f.name.toLowerCase().endsWith('.glb'));
      if (glb) {
        const url = URL.createObjectURL(glb);
        handleSpawnModel(glb.name, url, 1);
      }
    },
    [handleSpawnModel],
  );

  const onClear = useCallback(() => {
    engineRef.current?.clearWorld();
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return (
    <div
      className="flex h-full min-h-0 bg-[var(--bg-app)] overflow-hidden"
      onDrop={handleFileDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <DesignStudioLeftPanel
        activeProject={activeProject}
        onSwitchProject={handleProjectSwitch}
        onExport={() => engineRef.current?.exportForBlender()}
        genConfig={genConfig}
        onUpdateGenConfig={handleUpdateGenConfig}
        sceneConfig={sceneConfig}
        onUpdateSceneConfig={(cfg) => setSceneConfig((prev) => ({ ...prev, ...cfg }))}
        onSpawnModel={handleSpawnModel}
        customAssets={customAssets}
        onAddCustomAsset={handleAddCustomAsset}
        onRemoveCustomAsset={handleRemoveCustomAsset}
      />

      <div className="flex-1 min-w-0 min-h-0 relative">
        <div ref={containerRef} className="absolute inset-0 z-0" style={{ background: 'var(--scene-bg)' }} />

        <UIOverlay
          voxelCount={voxelCount}
          appState={appState}
          activeProject={activeProject}
          isGenerating={false}
          onTogglePlay={() => {}}
          onClear={onClear}
          genConfig={genConfig}
          onUpdateGenConfig={handleUpdateGenConfig}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
        />

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex justify-center w-full max-w-[90vw]">
          <div className="pointer-events-auto">
            <ToolLauncherBar onNavigate={handleToolNavigate} onImportGlb={handleImportGlbFile} />
          </div>
        </div>
      </div>
    </div>
  );
};
