import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, ChevronLeft, Download, Gamepad2, Layers } from 'lucide-react';
import {
  ProjectType,
  type CustomAsset,
  type GenerationConfig,
  type SceneConfig,
} from '../../types';
import { CadToolDock } from './CadToolDock';
import { GamesToolDock } from './GamesToolDock';
import { SandboxToolDock } from './SandboxToolDock';
import { AssetLibrary } from './shared/AssetLibrary';
import { ScenePanel, type SavedSceneRow } from './shared/ScenePanel';
import type { useDesignStudioCad } from './hooks/useDesignStudioCad';
import type { CadJobRow } from './api';

const DS_PROJECT_KEY = 'iam_designstudio_project';

type CadHook = ReturnType<typeof useDesignStudioCad>;

export type DesignStudioLeftPanelProps = {
  activeProject: ProjectType;
  onSwitchProject: (type: ProjectType) => void;
  onExport: () => void;
  genConfig: GenerationConfig;
  onUpdateGenConfig: (config: Partial<GenerationConfig>) => void;
  sceneConfig: SceneConfig;
  onUpdateSceneConfig: (config: Partial<SceneConfig>) => void;
  onSpawnModel: (name: string, url: string, scale: number) => void;
  customAssets: CustomAsset[];
  onAddCustomAsset: (name: string, url: string) => void | Promise<void>;
  onRemoveCustomAsset: (id: string) => void | Promise<void>;
  sceneName: string;
  onSceneNameChange: (name: string) => void;
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
};

const projects = [
  { id: ProjectType.CHESS, name: 'Games', icon: <Gamepad2 size={20} />, desc: '3D Physics Chess' },
  { id: ProjectType.CAD, name: 'Agent Sam', icon: <Layers size={20} />, desc: 'Precision Blueprints' },
  { id: ProjectType.SANDBOX, name: 'Sandbox Lab', icon: <Box size={20} />, desc: 'MeauxCAD / 3D Asset Studio' },
];

export function DesignStudioLeftPanel({
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
  sceneName,
  onSceneNameChange,
  savedScenes,
  sceneBusy,
  onSaveScene,
  onLoadScene,
  cad,
  cadJobId,
  glbR2Key,
  onRefreshUserAssets,
  onDeployJob,
  onImportGlb,
  onDownloadLatestGlb,
}: DesignStudioLeftPanelProps) {
  const navigate = useNavigate();

  const handleSwitch = (type: ProjectType) => {
    try {
      sessionStorage.setItem(DS_PROJECT_KEY, type);
    } catch {
      /* ignore */
    }
    onSwitchProject(type);
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

      <section className="mb-6 flex-shrink-0">
        <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-3">Workspace</p>
        <div className="space-y-2">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSwitch(p.id)}
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

      {activeProject === ProjectType.CAD ? (
        <CadToolDock
          cad={cad}
          sceneName={sceneName}
          onSceneNameChange={onSceneNameChange}
          savedScenes={savedScenes}
          sceneBusy={sceneBusy}
          onSaveScene={onSaveScene}
          onLoadScene={onLoadScene}
          cadJobId={cadJobId}
          glbR2Key={glbR2Key}
          customAssets={customAssets}
          onSpawnModel={onSpawnModel}
          onAddCustomAsset={onAddCustomAsset}
          onRemoveCustomAsset={onRemoveCustomAsset}
          onRefreshUserAssets={onRefreshUserAssets}
          onDeployJob={onDeployJob}
          onImportGlb={onImportGlb}
          onExportSceneJson={onExport}
          onDownloadLatestGlb={onDownloadLatestGlb}
          genConfig={genConfig}
          onUpdateGenConfig={onUpdateGenConfig}
        />
      ) : (
        <div className="space-y-6 flex-1 pb-8">
          <ScenePanel
            sceneName={sceneName}
            onSceneNameChange={onSceneNameChange}
            savedScenes={savedScenes}
            sceneBusy={sceneBusy}
            onSaveScene={onSaveScene}
            onLoadScene={onLoadScene}
          />
          <AssetLibrary
            customAssets={customAssets}
            onSpawnModel={onSpawnModel}
            onAddCustomAsset={onAddCustomAsset}
            onRemoveCustomAsset={onRemoveCustomAsset}
            onRefreshUserAssets={onRefreshUserAssets}
          />
          {activeProject === ProjectType.CHESS && <GamesToolDock onSpawnModel={onSpawnModel} />}
          {activeProject === ProjectType.SANDBOX && (
            <SandboxToolDock
              genConfig={genConfig}
              onUpdateGenConfig={onUpdateGenConfig}
              sceneConfig={sceneConfig}
              onUpdateSceneConfig={onUpdateSceneConfig}
            />
          )}
        </div>
      )}

      {activeProject !== ProjectType.CAD && (
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
      )}
    </div>
  );
}

export function readStoredDesignStudioProject(): ProjectType {
  if (typeof window === 'undefined') return ProjectType.CAD;
  try {
    const stored = sessionStorage.getItem(DS_PROJECT_KEY);
    if (stored === ProjectType.CAD || stored === ProjectType.CHESS || stored === ProjectType.SANDBOX) {
      return stored as ProjectType;
    }
  } catch {
    /* ignore */
  }
  return ProjectType.CAD;
}
