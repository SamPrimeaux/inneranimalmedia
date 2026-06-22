import React, { useState } from 'react';
import { ChevronLeft, PanelRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MeshyBalancePill } from '../MeshyBalancePill';
import { ToolRail, MobileToolStrip } from './ToolRail';
import { TweaksPanel } from './TweaksPanel';
import { ApiInspector } from './ApiInspector';
import { LogPanel } from './LogPanel';
import { useCreationStation, type CreationTool } from './useCreationStation';
import { CS_GRID } from './layout';
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
  const [mobilePane, setMobilePane] = useState<'tools' | 'view'>('view');
  const [apiOpen, setApiOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );

  const handleToolSelect = (tool: CreationTool) => {
    cs.setActiveTool(tool);
    setMobilePane('tools');
  };

  const handleCreate = () => {
    cs.setLogOpen(true);
    setMobilePane('view');
    if (cs.meshyPhase === 'preview') void cs.runPreview();
    else void cs.runRefine();
  };

  const handleQuick = () => {
    cs.setLogOpen(true);
    setMobilePane('view');
    void cs.runQuickGenerate();
  };

  const latestGlb = activeJob?.public_url || activeJob?.result_url;
  const progressPct = cad.polledJob?.progress_pct;

  return (
    <div className={CS_GRID}>
      <MobileToolStrip active={cs.activeTool} onSelect={handleToolSelect} />

      <ToolRail
        active={cs.activeTool}
        onSelect={handleToolSelect}
        onOpenLog={() => cs.setLogOpen(true)}
        className="md:col-start-1 md:row-start-1"
      />

      <div
        className={`min-h-0 flex flex-col md:col-start-2 md:row-start-1 ${
          mobilePane === 'tools' ? 'flex max-h-[50vh] md:max-h-none' : 'hidden md:flex'
        }`}
      >
        <TweaksPanel
          tool={cs.activeTool}
          meshyPhase={cs.meshyPhase}
          onMeshyPhase={cs.setMeshyPhase}
          settings={cs.settings}
          onPatch={cs.patchSettings}
          meshyStub={cs.meshyStub}
          ctaCost={cs.ctaCost}
          isGenerating={cs.isGenerating}
          progressPct={progressPct}
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
          className="flex-1 min-h-0"
        />
      </div>

      <div
        className={`flex flex-col min-h-0 min-w-0 md:col-start-3 md:row-start-1 ${
          mobilePane === 'view' ? 'flex flex-1' : 'hidden md:flex'
        }`}
      >
        <header className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 backdrop-blur-md">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/dashboard/agent')}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]"
              title="Back to Agent"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="text-[13px] font-semibold text-[var(--text-main)] truncate">Creation Station</h1>
              <p className="text-[10px] text-[var(--text-muted)] truncate">3D viewport · Meshy · Blender · Remote CAD</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="md:hidden px-2 py-1 text-[10px] font-semibold text-zinc-500 border border-white/[0.08] rounded-lg"
              onClick={() => setMobilePane((p) => (p === 'view' ? 'tools' : 'view'))}
            >
              {mobilePane === 'view' ? 'Tools' : 'View'}
            </button>
            <button
              type="button"
              className="hidden lg:flex p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]"
              onClick={() => setApiOpen((o) => !o)}
              title="Toggle API panel"
            >
              <PanelRight size={16} />
            </button>
            <MeshyBalancePill refreshKey={cs.balance ?? 0} />
          </div>
        </header>

        <div className="flex-1 min-h-0 relative bg-[var(--scene-bg)]">
          {viewport}
          {cad.isGenerating && (progressPct ?? 0) >= 0 ? (
            <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pointer-events-none">
              <div className="mx-auto max-w-md rounded-xl border border-[var(--solar-cyan)]/30 bg-[var(--bg-panel)]/90 backdrop-blur-md px-4 py-3 shadow-lg">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--solar-cyan)]">
                    ExecOS GCP
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    {activeJob?.status || 'running'}
                    {progressPct != null && progressPct > 0 ? ` · ${progressPct}%` : ''}
                  </span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--solar-cyan)] transition-all duration-500"
                    style={{ width: `${Math.max(8, Math.min(100, progressPct || 12))}%` }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <LogPanel
          open={cs.logOpen}
          onToggle={() => cs.setLogOpen((o) => !o)}
          logs={cs.logs}
          onOpenTerminal={() => cs.openTerminal()}
        />
      </div>

      {(apiOpen || cs.apiOpen) && (
        <div className="hidden lg:flex flex-col min-h-0 md:col-start-4 md:row-start-1 border-l border-white/[0.06]">
          <ApiInspector
            request={cs.lastRequest}
            response={cs.lastResponse}
            open
            onToggle={() => {
              setApiOpen(false);
              cs.setApiOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
