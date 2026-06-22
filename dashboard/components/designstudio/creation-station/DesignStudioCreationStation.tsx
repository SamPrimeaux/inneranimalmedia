import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MeshyBalancePill } from '../MeshyBalancePill';
import { ToolRail } from './ToolRail';
import { TweaksPanel } from './TweaksPanel';
import { ApiInspector } from './ApiInspector';
import { LogPanel } from './LogPanel';
import { useCreationStation, type CreationTool } from './useCreationStation';
import type { useDesignStudioCad } from '../hooks/useDesignStudioCad';
import type { CustomAsset } from '../../../types';
import type { SavedSceneRow } from '../shared/ScenePanel';
import type { CadJobRow } from '../api';

type CadHook = ReturnType<typeof useDesignStudioCad>;

export type DesignStudioCreationStationProps = {
  cad: CadHook;
  viewport: React.ReactNode;
  customAssets: CustomAsset[];
  onSpawnModel: (name: string, url: string, scale: number) => void;
  onAddCustomAsset: (name: string, url: string) => void | Promise<void>;
  onRemoveCustomAsset: (id: string) => void | Promise<void>;
  onRefreshUserAssets?: () => void;
  onImportGlb?: (file: File) => void;
  onBlenderExport?: () => void;
  sceneName: string;
  onSceneNameChange: (n: string) => void;
  savedScenes: SavedSceneRow[];
  sceneBusy: boolean;
  onSaveScene: () => void;
  onLoadScene: (id: string) => void;
  onDownloadLatestGlb?: () => void;
  activeJob?: CadJobRow | null;
};

export function DesignStudioCreationStation({
  cad,
  viewport,
  customAssets,
  onSpawnModel,
  onAddCustomAsset,
  onRemoveCustomAsset,
  onRefreshUserAssets,
  onImportGlb,
  onBlenderExport,
  sceneName,
  onSceneNameChange,
  savedScenes,
  sceneBusy,
  onSaveScene,
  onLoadScene,
  onDownloadLatestGlb,
  activeJob,
}: DesignStudioCreationStationProps) {
  const navigate = useNavigate();
  const cs = useCreationStation(cad);
  const [mobileTab, setMobileTab] = useState<'tools' | 'view' | 'api'>('view');

  const handleToolSelect = (tool: CreationTool) => {
    cs.setActiveTool(tool);
    cs.setPanelOpen(true);
    if (tool === 'import') setMobileTab('tools');
  };

  const handleCreate = () => {
    cs.setLogOpen(true);
    if (cs.meshyPhase === 'preview') void cs.runPreview();
    else void cs.runRefine();
  };

  const handleQuick = () => {
    cs.setLogOpen(true);
    void cs.runQuickGenerate();
  };

  const latestGlb = activeJob?.public_url || activeJob?.result_url;

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 w-full bg-[var(--bg-app)]">
      {/* Mobile tab bar */}
      <div className="flex md:hidden border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] shrink-0">
        {(['tools', 'view', 'api'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest ${
              mobileTab === tab ? 'text-[var(--solar-cyan)] border-b-2 border-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className={`flex flex-col md:flex-row flex-1 min-h-0 ${mobileTab !== 'tools' ? 'hidden md:flex' : 'flex'} md:!flex`}>
        <ToolRail
          active={cs.activeTool}
          panelOpen={cs.panelOpen}
          onSelect={handleToolSelect}
          onTogglePanel={() => cs.setPanelOpen((p) => !p)}
        />

        {(cs.panelOpen || mobileTab === 'tools') && (
          <TweaksPanel
            tool={cs.activeTool}
            open={cs.panelOpen || mobileTab === 'tools'}
            onClose={() => {
              cs.setPanelOpen(false);
              setMobileTab('view');
            }}
            meshyPhase={cs.meshyPhase}
            onMeshyPhase={cs.setMeshyPhase}
            settings={cs.settings}
            onPatch={cs.patchSettings}
            balance={cs.balance}
            meshyStub={cs.meshyStub}
            ctaCost={cs.ctaCost}
            isGenerating={cs.isGenerating}
            onCreate={handleCreate}
            onQuickGenerate={handleQuick}
            apiKeyDraft={cs.apiKeyDraft}
            onApiKeyDraft={cs.setApiKeyDraft}
            onSaveApiKey={() => void cs.saveMeshyApiKey()}
            savingKey={cs.savingKey}
            onImportGlb={onImportGlb}
            onBlenderExport={onBlenderExport}
            onBlenderTerminal={() =>
              cs.openTerminal('cd ~/inneranimalmedia && ls scripts/designstudio/')
            }
            sceneName={sceneName}
            onSceneNameChange={onSceneNameChange}
            savedScenes={savedScenes}
            sceneBusy={sceneBusy}
            onSaveScene={onSaveScene}
            onLoadScene={onLoadScene}
            customAssets={customAssets}
            onSpawnModel={onSpawnModel}
            onAddCustomAsset={onAddCustomAsset}
            onRemoveCustomAsset={onRemoveCustomAsset}
            onRefreshUserAssets={onRefreshUserAssets}
            latestGlbUrl={latestGlb}
            onDownloadGlb={onDownloadLatestGlb}
          />
        )}
      </div>

      {/* Center lane: viewport + log */}
      <div
        className={`flex flex-col flex-1 min-w-0 min-h-0 relative ${
          mobileTab === 'view' ? 'flex' : 'hidden md:flex'
        }`}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/80 backdrop-blur shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/dashboard/agent')}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] shrink-0"
              title="Back"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-heading)] truncate">
                Creation Station
              </h1>
              <p className="text-[9px] text-[var(--text-muted)] truncate">Meshy · Blender · 3D viewport</p>
            </div>
          </div>
          <MeshyBalancePill refreshKey={cs.balance ?? 0} />
        </div>

        <div className="flex-1 min-h-0 relative">{viewport}</div>

        <LogPanel
          open={cs.logOpen}
          onToggle={() => cs.setLogOpen((o) => !o)}
          logs={cs.logs}
          onOpenTerminal={() => cs.openTerminal()}
        />
      </div>

      {/* Right lane: API */}
      <div className={`relative ${mobileTab === 'api' ? 'flex flex-1 min-h-0' : 'hidden lg:flex'}`}>
        <ApiInspector
          request={cs.lastRequest}
          response={cs.lastResponse}
          open={cs.apiOpen || mobileTab === 'api'}
          onToggle={() => cs.setApiOpen((o) => !o)}
        />
      </div>
    </div>
  );
}
