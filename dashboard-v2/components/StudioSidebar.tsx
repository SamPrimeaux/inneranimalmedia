
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { ProjectType, ArtStyle, GenerationConfig, SceneConfig, CustomAsset } from '../types';
import { 
  Gamepad2, Layers, Box, Download, Settings, Package, Sparkles, Zap, Mountain, Trees, LayoutGrid, Dumbbell, 
  Sun, Moon, Ghost, Plane, Activity, Shield, Palette,
  Plus, Trash2, Link, ZapOff, UploadCloud, BoxSelect, Eye, Sword, UserCircle, Globe,
  ClipboardList, AlertTriangle, GitBranch, Bell, Loader2,
} from 'lucide-react';
import {
  loadStudioIamFeeds,
  firstLinesOfMarkdown,
  problemTotal,
  type StudioIamBundle,
} from '../src/iamDashboardFeeds';

interface SidebarProps {
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
  /** When true, sidebar is embedded in the IDE activity column (layout hint; optional). */
  isEmbedded?: boolean;
}

export const StudioSidebar: React.FC<SidebarProps> = ({
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
}) => {
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetUrl, setNewAssetUrl] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [iamFeeds, setIamFeeds] = useState<StudioIamBundle | null>(null);
  const [iamLoading, setIamLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIamLoading(true);
    void loadStudioIamFeeds().then((data) => {
      if (!cancelled) {
        setIamFeeds(data);
        setIamLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);


  const projects = [
    { id: ProjectType.CHESS, name: 'Meaaux Games', icon: <Gamepad2 size={20} />, desc: '3D Physics Chess' },
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
    { id: '#6366 indigo', name: 'Indigo', icon: <Palette size={12} /> },
    { id: '#0a0a0f', name: 'Void', icon: <Palette size={12} /> },
  ];

  const chessPieces = [
    { name: 'King', type: 'king' },
    { name: 'Queen', type: 'queen' },
    { name: 'Rook', type: 'rook' },
    { name: 'Bishop', type: 'bishop' },
    { name: 'Knight', type: 'knight' },
    { name: 'Pawn', type: 'pawn' }
  ];

  const getChessUrl = (color: 'white' | 'black', piece: string) => 
    `https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/chess/v1/pieces/${color}/${piece}.glb`;

  const assetGallery = [
    { 
      name: 'IAM Footer',
      url: 'https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/inneranimalmediafooterglb.glb',
      icon: <Shield size={14} />,
      scale: 1.5
    },
    { 
      name: 'Kinetic Symmetry', 
      url: 'https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/Kinetic_Symmetry_0831084700_generate%20(1).glb',
      icon: <Activity size={14} />,
      scale: 2
    },
    { 
      name: 'Meshy Jet', 
      url: 'https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
      icon: <Plane size={14} />,
      scale: 1.2
    }
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
    <div className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] flex flex-col p-5 z-20 overflow-y-auto custom-scrollbar">
      <div className="mb-8 flex-shrink-0">
        <div className="flex items-center gap-3 mb-1 px-1">
          <div className="w-10 h-10 bg-[var(--bg-panel)] border border-[var(--solar-cyan)]/20 rounded-xl flex items-center justify-center shadow-lg">
            <Package className="text-[var(--solar-cyan)]" size={20} />
          </div>
          <div>
            <h1 className="text-[14px] font-black tracking-widest text-white uppercase italic">Agent Sam</h1>
            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Studio Engine</p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex-shrink-0 rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] font-black text-white/35 uppercase tracking-[0.2em]">Agent Sam</p>
          {iamLoading && <Loader2 size={12} className="animate-spin text-white/30" aria-hidden />}
        </div>
        {iamLoading ? (
          <p className="text-[10px] text-white/30">Loading IAM feeds…</p>
        ) : (
          <div className="space-y-2 text-[10px] text-white/70">
            <div className="flex gap-2 items-start">
              <ClipboardList size={12} className="text-cyan-400/80 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-white/40 uppercase tracking-tighter text-[8px]">Today</span>
                <p className="leading-snug">
                  {iamFeeds?.todayTodo?.body?.markdown
                    ? firstLinesOfMarkdown(iamFeeds.todayTodo.body.markdown, 3, 140)
                    : iamFeeds?.todayTodo?.ok === false
                      ? 'No todo data.'
                      : 'No today list yet.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <AlertTriangle size={12} className="text-amber-400/90 shrink-0" />
              {iamFeeds?.problems?.status === 401 ? (
                <span className="text-white/40">Problems: sign in</span>
              ) : (
                <span>
                  Problems:{' '}
                  <span className="text-white font-semibold">{problemTotal(iamFeeds?.problems?.body ?? null)}</span>
                </span>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <GitBranch size={12} className="text-emerald-400/80 shrink-0" />
              {iamFeeds?.gitStatus?.status === 401 ? (
                <span className="text-white/40">Git: sign in</span>
              ) : (
                <span className="truncate">
                  {iamFeeds?.gitStatus?.body?.branch ?? 'main'} ·{' '}
                  {(iamFeeds?.gitStatus?.body?.git_hash || '').slice(0, 7) || '—'}
                </span>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <Shield size={12} className="text-violet-300/80 shrink-0" />
              <span>
                Rules:{' '}
                {Array.isArray(iamFeeds?.rules?.body?.rules)
                  ? iamFeeds.rules.body.rules.length
                  : iamFeeds?.rules?.ok === false
                    ? '—'
                    : 0}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <Bell size={12} className="text-sky-300/80 shrink-0" />
              {iamFeeds?.notifications?.status === 401 ? (
                <span className="text-white/40">Inbox: sign in</span>
              ) : (
                <span>
                  Unread:{' '}
                  <span className="text-white font-semibold">
                    {Array.isArray(iamFeeds?.notifications?.body?.notifications)
                      ? iamFeeds.notifications.body.notifications.length
                      : 0}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-8 flex-1 pb-10">
        <section>
          <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-4">Workspace</p>
          <div className="space-y-2">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => onSwitchProject(p.id)}
                className={`w-full group flex items-start gap-4 p-4 rounded-xl transition-all border text-left ${
                  activeProject === p.id 
                  ? 'bg-[var(--bg-panel)] border-[var(--solar-cyan)]/30' 
                  : 'bg-transparent border-transparent hover:bg-white/5'
                }`}
              >
                <div className={`mt-1 p-2 rounded-lg transition-colors ${activeProject === p.id ? 'bg-[var(--solar-cyan)] text-black shadow-[0_0_10px_rgba(0,255,255,0.2)]' : 'bg-white/5 text-[var(--text-muted)] group-hover:text-white'}`}>
                  {React.cloneElement(p.icon as React.ReactElement<{ size?: number }>, { size: 16 })}
                </div>
                <div className="flex-1">
                  <div className={`text-[12px] font-bold tracking-tight transition-colors ${activeProject === p.id ? 'text-[var(--solar-cyan)]' : 'text-white/80'}`}>{p.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-medium">{p.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Remote Asset Loader */}
        <section className="bg-gradient-to-br from-indigo-500/10 to-blue-500/5 p-5 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={14} className="text-cyan-400" />
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Direct URL Loader</p>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <input 
                type="url"
                placeholder="https://.../model.glb"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[11px] font-mono text-cyan-400 focus:outline-none focus:border-cyan-500/50 transition-all placeholder:text-white/10"
                value={directUrl}
                onChange={e => setDirectUrl(e.target.value)}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Link size={12} className="text-white/20" />
              </div>
            </div>
            <button 
              onClick={handleDirectSpawn}
              disabled={!directUrl.trim()}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 disabled:hover:bg-cyan-500 text-black py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              <Plus size={14} />
              Deploy to Scene
            </button>
          </div>
          <p className="text-[9px] text-white/20 text-center font-bold uppercase tracking-tighter">Physics: Dynamic | Scale: 1.0</p>
        </section>

        {/* Chess Piece Gallery */}
        {activeProject === ProjectType.CHESS && (
          <section className="bg-white/5 p-5 rounded-2xl border border-indigo-500/20 space-y-4 animate-in fade-in slide-in-from-left duration-500">
            <div className="flex items-center gap-2 mb-2">
              <Sword size={14} className="text-indigo-400" />
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Piece Armory</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-tighter mb-2">White Pieces</p>
                <div className="grid grid-cols-3 gap-2">
                  {chessPieces.map(piece => (
                    <button
                      key={`white-${piece.type}`}
                      onClick={() => onSpawnModel(`White ${piece.name}`, getChessUrl('white', piece.type), 0.8)}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"
                    >
                      <div className="text-white/60 group-hover:text-white">
                        <UserCircle size={16} />
                      </div>
                      <span className="text-[8px] font-black uppercase text-white/40 tracking-tighter">{piece.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-tighter mb-2">Black Pieces</p>
                <div className="grid grid-cols-3 gap-2">
                  {chessPieces.map(piece => (
                    <button
                      key={`black-${piece.type}`}
                      onClick={() => onSpawnModel(`Black ${piece.name}`, getChessUrl('black', piece.type), 0.8)}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-black/40 border border-white/5 hover:bg-black/60 transition-all group"
                    >
                      <div className="text-indigo-400 group-hover:text-indigo-300">
                        <UserCircle size={16} />
                      </div>
                      <span className="text-[8px] font-black uppercase text-white/40 tracking-tighter">{piece.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Asset Gallery */}
        <section className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-4">
           <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-emerald-400" />
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Asset Library</p>
            </div>
            <button 
              onClick={() => setIsAdding(!isAdding)}
              className={`p-1 rounded-md transition-all ${isAdding ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
            >
              <Plus size={14} className={isAdding ? 'rotate-45 transition-transform' : 'transition-transform'} />
            </button>
          </div>

          {isAdding && (
            <div className="space-y-3 p-4 bg-black/60 rounded-xl border border-emerald-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 mb-1">
                <UploadCloud size={12} className="text-emerald-400" />
                <span className="text-[10px] font-black text-emerald-400/80 uppercase">Import GLB</span>
              </div>
              <input 
                type="text"
                placeholder="Name (e.g., Chess Knight)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] focus:outline-none focus:border-emerald-500/40"
                value={newAssetName}
                onChange={e => setNewAssetName(e.target.value)}
              />
              <input 
                type="url"
                placeholder="https://.../model.glb"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] focus:outline-none focus:border-emerald-500/40 font-mono"
                value={newAssetUrl}
                onChange={e => setNewAssetUrl(e.target.value)}
              />
              <div className="flex gap-2 pt-1">
                <button 
                  onClick={handleQuickSpawn}
                  disabled={!newAssetUrl}
                  className="flex-1 bg-white text-black py-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-cyan-400 transition-all disabled:opacity-30 disabled:hover:bg-white"
                >
                  Quick Spawn
                </button>
                <button 
                  onClick={handleAddAsset}
                  disabled={!newAssetUrl || !newAssetName}
                  className="flex-1 bg-emerald-500 text-black py-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-30"
                >
                  Save to List
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            <p className="text-[9px] font-bold text-white/20 uppercase tracking-tighter mb-1">Stock Presets</p>
            {assetGallery.map(asset => (
              <button
                key={asset.url}
                onClick={() => onSpawnModel(asset.name, asset.url, asset.scale)}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest transition-all text-left group"
              >
                <div className="p-1.5 bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 rounded-lg transition-colors">
                  {asset.icon}
                </div>
                {asset.name}
              </button>
            ))}

            {customAssets.length > 0 && (
              <>
                <div className="h-px bg-white/5 my-2" />
                <p className="text-[9px] font-bold text-cyan-400/40 uppercase tracking-tighter mb-1">User Imports</p>
              </>
            )}
            
            {customAssets.map(asset => (
              <div key={asset.id} className="group relative flex items-center gap-2">
                <button
                  onClick={() => onSpawnModel(asset.name, asset.url, 1)}
                  className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10 hover:bg-cyan-500/10 text-[10px] font-black uppercase tracking-widest transition-all text-left"
                >
                  <div className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
                    <Link size={14} />
                  </div>
                  {asset.name}
                </button>
                <button 
                  onClick={() => onRemoveCustomAsset(asset.id)}
                  className="p-3 text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 rounded-xl"
                  title="Remove from list"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Environment Settings */}
        <section className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Palette size={14} className="text-amber-400" />
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Theme & Paint</p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-[10px] font-bold text-white/20 uppercase">Ambient Intensity</label>
              <span className="text-[10px] font-mono text-amber-400">{sceneConfig.ambientIntensity.toFixed(1)}</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="5" 
              step="0.1"
              value={sceneConfig.ambientIntensity}
              onChange={(e) => onUpdateSceneConfig({ ambientIntensity: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-white/20 uppercase block mb-3">Active Palette Color</label>
            <div className="grid grid-cols-4 gap-2">
              {sunPresets.map(s => (
                <button
                  key={s.id}
                  onClick={() => onUpdateSceneConfig({ sunColor: s.id })}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                    sceneConfig.sunColor === s.id 
                    ? 'bg-white/20 border-white/20 shadow-lg scale-105' 
                    : 'bg-white/5 border-white/5 opacity-40 hover:opacity-100'
                  }`}
                  title={s.name}
                >
                  <div className="p-1 rounded bg-black/20" style={{ color: s.id }}>
                    {s.icon}
                  </div>
                  <span className="text-[8px] font-bold uppercase">{s.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-3">
                  <Sun size={16} className={sceneConfig.castShadows ? "text-amber-400" : "text-white/20"} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Ray Shadows</span>
              </div>
              <button 
                  onClick={() => onUpdateSceneConfig({ castShadows: !sceneConfig.castShadows })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${sceneConfig.castShadows ? 'bg-amber-500' : 'bg-white/10'}`}
              >
                  <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${sceneConfig.castShadows ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-3">
                  <Eye size={16} className={sceneConfig.showPhysicsDebug ? "text-cyan-400" : "text-white/20"} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Physics Gizmos</span>
              </div>
              <button 
                  onClick={() => onUpdateSceneConfig({ showPhysicsDebug: !sceneConfig.showPhysicsDebug })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${sceneConfig.showPhysicsDebug ? 'bg-cyan-500' : 'bg-white/10'}`}
              >
                  <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${sceneConfig.showPhysicsDebug ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-cyan-400" />
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Gen Config</p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-white/20 uppercase block mb-3">Artistic Style</label>
            <div className="grid grid-cols-2 gap-2">
              {styles.map(s => (
                <button
                  key={s.id}
                  onClick={() => onUpdateGenConfig({ style: s.id })}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-[10px] font-black transition-all ${
                    genConfig.style === s.id 
                    ? `bg-gradient-to-br ${s.colors} text-white border-transparent shadow-lg` 
                    : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                  }`}
                >
                  {s.icon}
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-[10px] font-bold text-white/20 uppercase">Voxel Density</label>
              <span className="text-[10px] font-mono text-cyan-400">{genConfig.density}/10</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="10" 
              value={genConfig.density}
              onChange={(e) => onUpdateGenConfig({ density: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
             <div className="flex items-center gap-3">
                <Dumbbell size={16} className={genConfig.usePhysics ? "text-cyan-400" : "text-white/20"} />
                <span className="text-[10px] font-black uppercase tracking-widest">Simulate Physics</span>
             </div>
             <button 
                onClick={() => onUpdateGenConfig({ usePhysics: !genConfig.usePhysics })}
                className={`w-10 h-5 rounded-full transition-colors relative ${genConfig.usePhysics ? 'bg-cyan-500' : 'bg-white/10'}`}
             >
                <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${genConfig.usePhysics ? 'translate-x-5' : ''}`} />
             </button>
          </div>
        </section>
      </div>

      <div className="mt-auto pt-4 space-y-2 flex-shrink-0">
        <button 
          onClick={onExport}
          className="w-full flex items-center justify-center gap-3 py-4 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-cyan-400 transition-colors shadow-xl shadow-black/50"
        >
          <Download size={18} />
          Blender Bridge
        </button>
      </div>
    </div>
  );
};
