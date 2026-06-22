import React, { useRef } from 'react';
import { Clapperboard, Loader2, Search, Sparkles, Upload } from 'lucide-react';
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

// ── Image-to-3D panel ────────────────────────────────────────────────────────

function ImageTo3DPanel({ cs }: { cs: MeshyCs }) {
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
          if (f) cs.setImageFile(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="w-full rounded-xl border border-dashed border-[var(--border-subtle)] text-center hover:border-[var(--solar-cyan)] transition-colors overflow-hidden"
        style={{ background: 'var(--bg-hover)' }}
      >
        {cs.imageDataUrl ? (
          <img
            src={cs.imageDataUrl}
            alt="Upload preview"
            className="w-full max-h-40 object-contain"
          />
        ) : (
          <div className="py-8">
            <Upload size={22} className="mx-auto mb-2 text-[var(--text-muted)]" />
            <p className="text-[12px] font-medium text-[var(--text-main)]">Click or drop image</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">PNG, JPG, WEBP — max 20 MB</p>
          </div>
        )}
      </button>
      {cs.imageFile && (
        <p className="text-[10px] text-[var(--text-muted)] truncate px-1">{cs.imageFile.name}</p>
      )}
    </div>
  );
}

// ── Animate panel ────────────────────────────────────────────────────────────

const ANIM_CLIPS = [
  'Walking', 'Running', 'Idle', 'Jump', 'Wave',
  'Agree Gesture', 'Air Squat', 'Alert', 'Back Flip', 'Dance',
] as const;

function AnimatePanel({ cs }: { cs: MeshyCs }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.14em] block mb-1.5">
          Source model task ID
        </label>
        <input
          type="text"
          value={cs.rigTaskId}
          onChange={(e) => cs.setRigTaskId(e.target.value)}
          placeholder="Completed image-to-3D task ID"
          className="w-full rounded-lg px-3 py-2 text-[11px] font-mono text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-hover)] outline-none focus:border-[var(--solar-cyan)] transition-colors"
        />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Search size={12} className="text-[var(--text-muted)]" />
          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.14em]">
            Animation library
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {ANIM_CLIPS.map((clip) => (
            <button
              key={clip}
              type="button"
              className="flex items-center gap-1.5 px-2 py-2 rounded-lg border border-[var(--border-subtle)] text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)] transition-colors text-left"
              style={{ background: 'var(--bg-hover)' }}
              onClick={() => cs.setRigTaskId((prev) => prev)}
            >
              <Clapperboard size={11} className="shrink-0" />
              {clip}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

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
  const showMeshyCta =
    studioSegment === 'meshy' &&
    (railTool === 'text-to-3d' || railTool === 'image-to-3d' || railTool === 'animate');

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
        <ImageTo3DPanel cs={cs} />
      ) : railTool === 'animate' ? (
        <AnimatePanel cs={cs} />
      ) : (
        <MeshyUnavailablePanel
          title={railMeta?.label || 'Meshy'}
          body="This Meshy surface is not yet wired to a Worker route. Use Text to 3D, Image to 3D, or CAD OpenSCAD for live pipelines today."
        />
      )
    ) : null;

  // CTA label / action per active tool
  const ctaLabel = (() => {
    if (railTool === 'image-to-3d') return 'Generate from Image';
    if (railTool === 'animate') return 'Rig & Animate';
    return cs.meshyPhase === 'preview' ? 'Create Preview' : 'Create Refine';
  })();

  const ctaAction = (() => {
    if (railTool === 'image-to-3d') return () => { void cs.runImageTo3D(); };
    if (railTool === 'animate') return () => { void cs.runRig(); };
    return onCreate;
  })();

  const ctaDisabled = cs.isGenerating || (railTool === 'image-to-3d' && !cs.imageDataUrl);

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
          {railTool === 'text-to-3d' && (
            <p className="text-[10px] text-center text-[var(--text-muted)] mb-2">
              ~{cs.ctaCost} credits · opens terminal output
            </p>
          )}
          <button
            type="button"
            disabled={ctaDisabled}
            onClick={ctaAction}
            className="w-full py-3 rounded-full font-bold text-[13px] flex items-center justify-center gap-2 disabled:opacity-40"
            style={{
              background: 'linear-gradient(90deg, var(--solar-cyan), var(--solar-violet))',
              color: 'var(--bg-app)',
            }}
          >
            {cs.isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {ctaLabel}
          </button>
        </div>
      )}
    </aside>
  );
}
