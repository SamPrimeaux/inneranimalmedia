import React, { useRef } from 'react';
import { Loader2, Sparkles, Upload } from 'lucide-react';
import type { MeshyPhase, MeshySettings } from './meshyTypes';
import type { MeshyRailTool } from './meshyToolkitTypes';
import { MESHY_RAIL_TOOLS } from './meshyToolkitTypes';
import { StudioSegmentBar } from './StudioSegmentBar';
import { CadPipelinePanel } from './CadPipelinePanel';
import { MotionTweaksPanel } from '../MotionTweaksPanel';
import { AnimationTweaksPanel } from '../AnimationTweaksPanel';
import { MeshyUnavailablePanel } from './MeshyUnavailablePanel';
import { AdvancedOpenScadActions } from './AdvancedOpenScadPanel';
import { TweaksPanel } from './TweaksPanel';
import type { StudioSegment } from './meshyToolkitTypes';
import type { useDesignStudioCad } from '../hooks/useDesignStudioCad';
import type { CustomAsset, GenerationConfig, SceneConfig } from '../../../types';
import type { SavedSceneRow } from '../shared/ScenePanel';
import type { CadJobRow } from '../api';

type CadHook = ReturnType<typeof useDesignStudioCad>;

type MeshyCs = ReturnType<typeof import('./useCreationStation').useCreationStation>;

type Props = {
  studioSegment: StudioSegment;
  onStudioSegment: (s: StudioSegment) => void;
  railTool: MeshyRailTool;
  cs: MeshyCs;
  cad: CadHook;
  genConfig: GenerationConfig;
  onUpdateGenConfig: (c: Partial<GenerationConfig>) => void;
  sceneConfig: SceneConfig;
  onUpdateSceneConfig: (c: Partial<SceneConfig>) => void;
  sceneName: string;
  onSceneNameChange: (n: string) => void;
  savedScenes: SavedSceneRow[];
  sceneBusy: boolean;
  onSaveScene: () => void;
  onLoadScene: (id: string) => void;
  cadJobId?: string | null;
  glbR2Key?: string | null;
  customAssets: CustomAsset[];
  onSpawnModel: (name: string, url: string, scale: number) => void;
  onAddCustomAsset: (name: string, url: string) => void | Promise<void>;
  onRemoveCustomAsset: (id: string) => void | Promise<void>;
  onRefreshUserAssets?: () => void;
  onDeployJob: (job: CadJobRow) => void;
  onImportGlb?: (file: File) => void;
  onExportSceneJson?: () => void;
  onDownloadLatestGlb?: () => void;
  latestGlbUrl?: string | null;
  onCreate: () => void;
  onQuickGenerate: () => void;
  advancedScript?: string;
  advancedDirty?: boolean;
  onAdvancedDirtyChange?: (dirty: boolean) => void;
  onAdvancedScriptUpdate?: (script: string) => void;
  onAdvancedScriptChange?: (script: string) => void;
  className?: string;
};

function ImageTo3DPanel({ onImportImage }: { onImportImage?: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-[var(--text-main)]">Image to 3D</p>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && onImportImage) onImportImage(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="w-full py-8 rounded-xl border border-dashed border-[var(--border-subtle)] text-center hover:border-[var(--solar-cyan)] transition-colors"
        style={{ background: 'var(--bg-hover)' }}
      >
        <Upload size={22} className="mx-auto mb-2 text-[var(--text-muted)]" />
        <p className="text-[12px] font-medium text-[var(--text-main)]">Click or drop image</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-1">PNG, JPG, WEBP — max 20 MB</p>
      </button>
      <MeshyUnavailablePanel
        title="Pipeline"
        body="Image-to-3D posts to /api/cad/meshy/image-to-3d when Worker Meshy key or BYOK is configured. Use Generate after upload."
      />
    </div>
  );
}

export function MeshyToolkitTweaks({
  studioSegment,
  onStudioSegment,
  railTool,
  cs,
  cad,
  genConfig,
  onUpdateGenConfig,
  sceneConfig,
  onUpdateSceneConfig,
  sceneName,
  onSceneNameChange,
  savedScenes,
  sceneBusy,
  onSaveScene,
  onLoadScene,
  cadJobId,
  glbR2Key,
  customAssets,
  onSpawnModel,
  onAddCustomAsset,
  onRemoveCustomAsset,
  onRefreshUserAssets,
  onDeployJob,
  onImportGlb,
  onExportSceneJson,
  onDownloadLatestGlb,
  latestGlbUrl,
  onCreate,
  onQuickGenerate,
  advancedScript = '',
  advancedDirty = false,
  onAdvancedDirtyChange,
  onAdvancedScriptUpdate,
  onAdvancedScriptChange,
  className = '',
}: Props) {
  const railMeta = MESHY_RAIL_TOOLS.find((t) => t.id === railTool);
  const showMeshyCta = studioSegment === 'meshy' && (railTool === 'text-to-3d' || railTool === 'image-to-3d');

  const meshyBody =
    studioSegment === 'meshy' ? (
      railTool === 'text-to-3d' ? (
        <TweaksPanel
          tool="text-to-3d"
          meshyPhase={cs.meshyPhase}
          onMeshyPhase={cs.setMeshyPhase}
          settings={cs.settings}
          onPatch={cs.patchSettings}
          meshyStub={cs.meshyStub}
          ctaCost={cs.ctaCost}
          isGenerating={cs.isGenerating}
          progressPct={cad.polledJob?.progress_pct}
          onCreate={onCreate}
          onQuickGenerate={onQuickGenerate}
          apiKeyDraft={cs.apiKeyDraft}
          onApiKeyDraft={cs.setApiKeyDraft}
          onSaveApiKey={() => void cs.saveMeshyApiKey()}
          savingKey={cs.savingKey}
          latestGlbUrl={latestGlbUrl}
          onDownloadGlb={onDownloadLatestGlb}
          embedded
        />
      ) : railTool === 'image-to-3d' ? (
        <ImageTo3DPanel />
      ) : railTool === 'animate' ? (
        <MeshyUnavailablePanel
          title="Animate"
          body="Rigging and animation library routes to /api/cad/meshy/rigging. Paste a completed model task ID and pick a clip — wiring in progress."
        />
      ) : (
        <MeshyUnavailablePanel
          title={railMeta?.label || 'Meshy'}
          body="This Meshy surface is not yet wired to a public Worker route. Use Text to 3D or CAD OpenSCAD for production paths today."
        />
      )
    ) : null;

  return (
    <aside
      className={`flex flex-col min-h-0 bg-[var(--bg-panel)] border-[var(--border-subtle)] ${className}`}
    >
      <div className="shrink-0 px-3 pt-3 pb-2 space-y-2 border-b border-[var(--border-subtle)]">
        <StudioSegmentBar active={studioSegment} onChange={onStudioSegment} />
        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.18em] font-bold">
          {studioSegment === 'meshy' ? railMeta?.label : studioSegment}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-3">
        {studioSegment === 'cad' && (
          <CadPipelinePanel
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
            onExportSceneJson={onExportSceneJson}
            onDownloadLatestGlb={onDownloadLatestGlb}
            genConfig={genConfig}
            onUpdateGenConfig={onUpdateGenConfig}
          />
        )}
        {studioSegment === 'motion' && (
          <MotionTweaksPanel
            genConfig={genConfig}
            onUpdateGenConfig={onUpdateGenConfig}
            sceneConfig={sceneConfig}
            onUpdateSceneConfig={onUpdateSceneConfig}
          />
        )}
        {studioSegment === 'animation' && (
          <AnimationTweaksPanel
            genConfig={genConfig}
            onUpdateGenConfig={onUpdateGenConfig}
            onSpawnModel={onSpawnModel}
          />
        )}
        {studioSegment === 'advanced' && (
          <AdvancedOpenScadActions
            cad={cad}
            script={advancedScript}
            dirty={advancedDirty}
            onDirtyChange={onAdvancedDirtyChange ?? (() => {})}
            onScriptUpdate={onAdvancedScriptUpdate}
            onScriptChange={onAdvancedScriptChange}
          />
        )}
        {meshyBody}
      </div>

      {showMeshyCta && (
        <div
          className="shrink-0 px-3 py-3 border-t border-[var(--border-subtle)]"
          style={{ background: 'linear-gradient(0deg, var(--bg-panel) 70%, transparent)' }}
        >
          <p className="text-[10px] text-center text-[var(--text-muted)] mb-2">
            ~{cs.ctaCost} credits · opens terminal log
          </p>
          <button
            type="button"
            disabled={cs.isGenerating}
            onClick={onCreate}
            className="w-full py-3 rounded-full font-bold text-[13px] flex items-center justify-center gap-2 disabled:opacity-40"
            style={{
              background: 'linear-gradient(90deg, var(--solar-cyan), var(--solar-violet))',
              color: 'var(--bg-app)',
            }}
          >
            {cs.isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {cs.meshyPhase === 'preview' ? 'Create Preview' : 'Create Refine'}
          </button>
        </div>
      )}
    </aside>
  );
}
