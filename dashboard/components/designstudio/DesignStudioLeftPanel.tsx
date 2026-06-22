import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Building2, ChevronLeft, ChevronRight, Gamepad2, Layers, Plane } from 'lucide-react';
import {
  ProjectType,
  DEFAULT_CITY_CONFIG, DEFAULT_FLY_CONFIG,
  type CityConfig, type FlyConfig, type FlyHud, type CityStats,
  type CustomAsset, type GenerationConfig, type SceneConfig,
} from '../../types';
import { CadToolDock } from './CadToolDock';
import { GamesToolDock } from './GamesToolDock';
import { SandboxToolDock } from './SandboxToolDock';
import { CityControlDock } from './CityControlDock';
import { FlyControlDock } from './FlyControlDock';
import { AssetLibrary } from './shared/AssetLibrary';
import { ScenePanel, type SavedSceneRow } from './shared/ScenePanel';
import type { useDesignStudioCad } from './hooks/useDesignStudioCad';
import type { CadJobRow } from './api';

const DS_PROJECT_KEY = 'iam_ds_project_v3';

type CadHook = ReturnType<typeof useDesignStudioCad>;

export function readStoredDesignStudioProject(): ProjectType {
  if (typeof window === 'undefined') return ProjectType.SANDBOX;
  try {
    const v = sessionStorage.getItem(DS_PROJECT_KEY);
    if (v && Object.values(ProjectType).includes(v as ProjectType)) return v as ProjectType;
  } catch { /* */ }
  return ProjectType.SANDBOX;
}

export type DesignStudioLeftPanelProps = {
  activeProject: ProjectType;
  onSwitchProject: (t: ProjectType) => void;
  onExport: () => void;
  genConfig: GenerationConfig;
  onUpdateGenConfig: (c: Partial<GenerationConfig>) => void;
  sceneConfig: SceneConfig;
  onUpdateSceneConfig: (c: Partial<SceneConfig>) => void;
  onSpawnModel: (name: string, url: string, scale: number) => void;
  customAssets: CustomAsset[];
  onAddCustomAsset: (name: string, url: string) => void | Promise<void>;
  onRemoveCustomAsset: (id: string) => void | Promise<void>;
  sceneName: string;
  onSceneNameChange: (n: string) => void;
  savedScenes: SavedSceneRow[];
  sceneBusy: boolean;
  onSaveScene: () => void;
  onLoadScene: (id: string) => void;
  cad: CadHook;
  cadJobId?: string | null;
  glbR2Key?: string | null;
  onRefreshUserAssets?: () => void;
  onDeployJob: (job: CadJobRow) => void;
  onImportGlb?: (file: File) => void;
  onDownloadLatestGlb?: () => void;
  // Engineer engine props
  cityConfig?: CityConfig;
  onUpdateCityConfig?: (p: Partial<CityConfig>) => void;
  onRegenerateCity?: () => void;
  cityStats?: CityStats;
  flyConfig?: FlyConfig;
  flyHud?: FlyHud;
  onUpdateFlyConfig?: (p: Partial<FlyConfig>) => void;
};

const MODES = [
  { id: ProjectType.CHESS,   Icon: Gamepad2,   label: 'Games',      sub: 'MeauxChess 3D' },
  { id: ProjectType.CAD,     Icon: Layers,      label: 'Agent CAD',  sub: 'Blueprint Engine' },
  { id: ProjectType.SANDBOX, Icon: Box,         label: 'Sandbox',    sub: 'MeauxCAD Studio' },
  { id: ProjectType.CITY,    Icon: Building2,   label: 'Proc City',  sub: 'City Generator' },
  { id: ProjectType.FLY,     Icon: Plane,       label: 'Fly Scene',  sub: 'Flight Experience' },
];

export function DesignStudioLeftPanel(props: DesignStudioLeftPanelProps) {
  const {
    activeProject, onSwitchProject, onExport,
    genConfig, onUpdateGenConfig, sceneConfig, onUpdateSceneConfig,
    onSpawnModel, customAssets, onAddCustomAsset, onRemoveCustomAsset,
    sceneName, onSceneNameChange, savedScenes, sceneBusy, onSaveScene, onLoadScene,
    cad, cadJobId, glbR2Key, onRefreshUserAssets, onDeployJob, onImportGlb, onDownloadLatestGlb,
    cityConfig, onUpdateCityConfig, onRegenerateCity, cityStats,
    flyConfig, flyHud, onUpdateFlyConfig,
  } = props;

  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );

  const switchProject = (t: ProjectType) => {
    try { sessionStorage.setItem(DS_PROJECT_KEY, t); } catch { /* */ }
    onSwitchProject(t);
  };

  if (collapsed) {
    return (
      <div className="w-10 min-w-[40px] h-full flex flex-col items-center py-3 gap-1 z-20"
        style={{ background: 'var(--bg-panel)', borderRight: '1px solid var(--border-subtle)' }}>
        <button type="button" onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg mb-2 cursor-pointer"
          style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)' }}>
          <ChevronRight size={16} />
        </button>
        {MODES.map(({ id, Icon }) => (
          <button key={id} type="button" onClick={() => switchProject(id)}
            className="w-11 h-11 flex items-center justify-center rounded-xl cursor-pointer"
            style={{
              border: 'none',
              background: activeProject === id ? 'rgba(0,229,255,0.1)' : 'transparent',
              color: activeProject === id ? '#00e5ff' : 'var(--text-muted)',
            }}>
            <Icon size={16} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col z-30 md:relative absolute left-0 top-0 w-[272px] min-w-[272px] md:w-[272px] max-w-[85vw]"
      style={{
        width: 'min(272px, 85vw)',
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-panel, 0 0 24px rgba(0,0,0,0.5))',
      }}
    >

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3.5 py-3.5"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/dashboard/agent')}
            className="p-1.5 rounded-lg cursor-pointer"
            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)' }}>
            <ChevronLeft size={17} />
          </button>
          <div>
            <div className="text-[12px] font-black tracking-[0.04em] leading-none" style={{ color: 'var(--text-heading)' }}>
              Design Studio
            </div>
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Inner Animal Media
            </div>
          </div>
        </div>
        <button type="button" onClick={() => setCollapsed(true)}
          className="p-1.5 rounded-lg cursor-pointer"
          style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)' }}>
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Mode picker */}
      <div className="flex-shrink-0 px-2.5 pt-2.5 pb-2">
        <div className="text-[9px] font-black uppercase tracking-[0.22em] mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
          Workspace
        </div>
        <div className="flex flex-col gap-0.5">
          {MODES.map(({ id, Icon, label, sub }) => {
            const active = activeProject === id;
            return (
              <button key={id} type="button" onClick={() => switchProject(id)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer text-left w-full"
                style={{
                  border: active ? '1px solid rgba(0,229,255,0.2)' : '1px solid transparent',
                  background: active ? 'rgba(0,229,255,0.06)' : 'transparent',
                }}>
                <Icon size={14} color={active ? '#00e5ff' : 'var(--text-muted)'} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold leading-none" style={{ color: active ? '#00e5ff' : 'var(--text-main)' }}>
                    {label}
                  </div>
                  <div className="text-[9px] mt-0.5 truncate" style={{ color: active ? 'rgba(0,229,255,0.5)' : 'var(--text-muted)' }}>
                    {sub}
                  </div>
                </div>
                {active && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#00e5ff' }} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-3" style={{ borderTop: '1px solid var(--border-subtle)' }} />

      {/* Dock — scrollable */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2.5 pb-8 custom-scrollbar"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >

        {activeProject === ProjectType.CITY && cityConfig && onUpdateCityConfig && onRegenerateCity && (
          <CityControlDock
            config={cityConfig}
            onChange={onUpdateCityConfig}
            onRegenerate={onRegenerateCity}
            stats={cityStats}
          />
        )}

        {activeProject === ProjectType.FLY && flyConfig && flyHud && onUpdateFlyConfig && (
          <FlyControlDock config={flyConfig} hud={flyHud} onChange={onUpdateFlyConfig} />
        )}

        {activeProject === ProjectType.CAD && (
          <CadToolDock
            cad={cad}
            sceneName={sceneName} onSceneNameChange={onSceneNameChange}
            savedScenes={savedScenes} sceneBusy={sceneBusy}
            onSaveScene={onSaveScene} onLoadScene={onLoadScene}
            cadJobId={cadJobId} glbR2Key={glbR2Key}
            customAssets={customAssets} onSpawnModel={onSpawnModel}
            onAddCustomAsset={onAddCustomAsset} onRemoveCustomAsset={onRemoveCustomAsset}
            onRefreshUserAssets={onRefreshUserAssets} onDeployJob={onDeployJob}
            onImportGlb={onImportGlb} onExportSceneJson={onExport}
            onDownloadLatestGlb={onDownloadLatestGlb}
            genConfig={genConfig} onUpdateGenConfig={onUpdateGenConfig}
          />
        )}

        {activeProject === ProjectType.CHESS && (
          <GamesToolDock onSpawnModel={onSpawnModel} />
        )}

        {activeProject === ProjectType.SANDBOX && (
          <div className="flex flex-col gap-4">
            <SandboxToolDock
              genConfig={genConfig} onUpdateGenConfig={onUpdateGenConfig}
              sceneConfig={sceneConfig} onUpdateSceneConfig={onUpdateSceneConfig}
            />
            <AssetLibrary
              customAssets={customAssets} onSpawnModel={onSpawnModel}
              onAddCustomAsset={onAddCustomAsset} onRemoveCustomAsset={onRemoveCustomAsset}
              onRefreshUserAssets={onRefreshUserAssets}
            />
            <ScenePanel
              sceneName={sceneName} onSceneNameChange={onSceneNameChange}
              savedScenes={savedScenes} sceneBusy={sceneBusy}
              onSaveScene={onSaveScene} onLoadScene={onLoadScene}
            />
          </div>
        )}

      </div>
    </div>
  );
}
