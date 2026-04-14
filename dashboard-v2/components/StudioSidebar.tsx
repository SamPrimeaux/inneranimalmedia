
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

  const projects = [
    { id: ProjectType.CHESS, name: 'Games Dev', icon: <Gamepad2 size={20} />, desc: '3D Physics Chess' },
    { id: ProjectType.CAD, name: 'Asset Studio', icon: <Layers size={20} />, desc: 'Precision Blueprints' },
    { id: ProjectType.SANDBOX, name: 'Voxel Lab', icon: <Box size={20} />, desc: 'Voxel Physics Fun' },
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
    { id: '#6366df', name: 'Indigo', icon: <Palette size={12} /> },
    { id: '#0a0a0f', name: 'Void', icon: <Palette size={12} /> },
  ];

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
      <div className="mb-6 flex-shrink-0">
        <div className="flex items-center gap-3 mb-1 px-1">
          <div className="w-10 h-10 bg-[var(--bg-panel)] border border-[var(--solar-cyan)]/20 rounded-xl flex items-center justify-center shadow-lg">
            <Plane className="text-[var(--solar-cyan)]" size={20} />
          </div>
          <div>
            <h1 className="text-[14px] font-black tracking-widest text-white uppercase italic">Studio Engine</h1>
            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Advanced Voxel Editor</p>
          </div>
        </div>
      </div>

      <div className="space-y-8 flex-1 pb-10">
        {/* ASSET LIBRARY */}
        <section className="space-y-4">
           <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-[var(--solar-cyan)]" />
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Asset Library</p>
            </div>
            <button 
              onClick={() => setIsAdding(!isAdding)}
              className={`p-1 rounded-md transition-all ${isAdding ? 'bg-red-500/10 text-red-400' : 'bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/20'}`}
            >
              <Plus size={14} className={isAdding ? 'rotate-45 transition-transform' : 'transition-transform'} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {assetGallery.map(asset => (
              <button
                key={asset.url}
                onClick={() => onSpawnModel(asset.name, asset.url, asset.scale)}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest transition-all text-left group"
              >
                <div className="p-1.5 bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] group-hover:bg-[var(--solar-cyan)]/20 rounded-lg transition-colors">
                  {asset.icon}
                </div>
                {asset.name}
              </button>
            ))}

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

          {isAdding && (
            <div className="space-y-3 p-4 bg-black/60 rounded-xl border border-[var(--solar-cyan)]/20 animate-in fade-in slide-in-from-top-2 duration-300">
              <input 
                type="text"
                placeholder="Asset Name"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] focus:outline-none focus:border-[var(--solar-cyan)]/40"
                value={newAssetName}
                onChange={e => setNewAssetName(e.target.value)}
              />
              <input 
                type="url"
                placeholder="https://.../model.glb"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] focus:outline-none focus:border-[var(--solar-cyan)]/40 font-mono"
                value={newAssetUrl}
                onChange={e => setNewAssetUrl(e.target.value)}
              />
              <button 
                onClick={handleAddAsset}
                disabled={!newAssetUrl || !newAssetName}
                className="w-full bg-[var(--solar-cyan)] text-black py-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-cyan-400 transition-all disabled:opacity-30"
              >
                Add to Library
              </button>
            </div>
          )}
        </section>

        {/* THEME + PAINT */}
        <section className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Palette size={14} className="text-amber-400" />
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Theme + Paint</p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-[10px] font-bold text-white/20 uppercase">Stage Brightness</label>
              <span className="text-[10px] font-mono text-amber-400">{sceneConfig.ambientIntensity.toFixed(1)}</span>
            </div>
            <input 
              type="range" min="0" max="5" step="0.1"
              value={sceneConfig.ambientIntensity}
              onChange={(e) => onUpdateSceneConfig({ ambientIntensity: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          <div>
             <label className="text-[10px] font-bold text-white/20 uppercase block mb-3">Environment Tint</label>
             <div className="grid grid-cols-4 gap-2">
               {sunPresets.map(s => (
                 <button
                   key={s.id}
                   onClick={() => onUpdateSceneConfig({ sunColor: s.id })}
                   className={`h-8 rounded-lg border transition-all ${sceneConfig.sunColor === s.id ? 'border-white/40 scale-105' : 'border-transparent opacity-40'}`}
                   style={{ backgroundColor: s.id }}
                   title={s.name}
                 />
               ))}
             </div>
          </div>
        </section>

        {/* GEN CONFIG */}
        <section className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-cyan-400" />
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Gen Config</p>
          </div>

          <div>
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

          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
             <div className="flex items-center gap-3">
                <Dumbbell size={16} className={genConfig.usePhysics ? "text-cyan-400" : "text-white/20"} />
                <span className="text-[10px] font-black uppercase tracking-widest">Physics Sim</span>
             </div>
             <button 
                onClick={() => onUpdateGenConfig({ usePhysics: !genConfig.usePhysics })}
                className={`w-10 h-5 rounded-full transition-colors relative ${genConfig.usePhysics ? 'bg-cyan-500' : 'bg-white/10'}`}
             >
                <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${genConfig.usePhysics ? 'translate-x-5' : ''}`} />
             </button>
          </div>
        </section>

        {/* BLENDER WORKFLOWS */}
        <section className="bg-gradient-to-br from-orange-500/10 to-amber-500/5 p-5 rounded-2xl border border-orange-500/20 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} className="text-orange-400" />
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Blender Workflows</p>
          </div>
          <div className="space-y-2">
            <button 
              onClick={onExport}
              className="w-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              <Download size={14} />
              Export Optimized .GLB
            </button>
            <button className="w-full bg-white/5 hover:bg-white/10 text-white/40 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all">
              Sync to Unity Library
            </button>
          </div>
          <p className="text-[8px] text-white/20 text-center font-bold uppercase tracking-tighter">Current: High-Precision Mesh Mode</p>
        </section>
      </div>
    </div>
  );
};
