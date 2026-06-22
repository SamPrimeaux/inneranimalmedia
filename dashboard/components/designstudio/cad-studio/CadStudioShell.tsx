/**
 * IAM CAD Studio — Blender-style shell wired to AgentSamEngine + CAD APIs.
 * Phases 0–9: layout engine, editor primitives, full workspace parity, Chat-only agentic ops.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CadJobRow } from '../api';
import { fetchCadJob } from '../api';
import type { SavedSceneRow } from '../shared/ScenePanel';
import type { useDesignStudioCad } from '../hooks/useDesignStudioCad';
import { useCadStudioProtocol } from './useCadStudioProtocol';
import { CadMenuBar } from './CadMenuBar';
import { ContextHeader } from './ContextHeader';
import { WorkspaceLayoutEngine } from './WorkspaceLayoutEngine';
import { StatusBar } from './StatusBar';
import { OperatorSearchModal, GenerateCadModal } from './OperatorModals';
import { Viewport3DEditor, SecondaryViewportEditor, ScriptEditor, NodeEditor, MovieClipEditor, GraphEditor, SequencerEditor, ScopesEditor, ColorBalanceEditor, GreaseLayersEditor, DopeSheetEditor, TimelineEditor } from './editors/Viewport3DEditor';
import { OutlinerEditor } from './editors/OutlinerEditor';
import { AssetGalleryEditor } from './editors/AssetGalleryEditor';
import { PropertiesEditor } from './editors/PropertiesEditor';
import { CreationPanelEditor } from './editors/CreationPanelEditor';
import { CreativeToolDock, openOperatorDraft } from './CreativeToolDock';
import { RightPanelTabs } from './RightPanelTabs';
import type { DockDomainId } from './toolDockRegistry';
import {
  DEFAULT_PANEL_VISIBILITY,
  DEFAULT_UI_STATE,
  type WorkspaceId,
  type ViewTool,
  type MeshStats,
  type GalleryItem,
} from './cadStudioTypes';
import { IAM_AGENT_CHAT_COMPOSE } from '../../../agentChatConstants';
import { useDesignStudioContext } from '../DesignStudioContext';
import type { CustomAsset, GenerationConfig, SceneConfig, GameEntity } from '../../../types';
import type { AgentSamGeneratorKey } from '../../../utils/agentSamGenerators';
import './cad-studio.css';

const LS_LAYOUT_KEY = 'iam-cad-studio-layout-v1';

export type CadStudioShellProps = {
  engineContainerRef: React.RefObject<HTMLDivElement | null>;
  onEngineContainerMount: () => void;
  cad: ReturnType<typeof useDesignStudioCad>;
  entities: GameEntity[];
  entityCount: number;
  selectedId: string | null;
  onSelectEntity: (id: string | null) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddCube: () => void;
  onDeleteSelected: () => void;
  onDeployJob: (job: CadJobRow) => void;
  onDownloadLatestGlb: () => void;
  sceneName: string;
  onSceneNameChange: (name: string) => void;
  onSaveScene: () => void;
  onLoadScene: (id: string) => void;
  savedScenes: SavedSceneRow[];
  sceneBusy: boolean;
  computeHealth: string;
  currentSceneId?: string | null;
  customAssets?: CustomAsset[];
  genConfig?: GenerationConfig;
  onUpdateGenConfig?: (c: Partial<GenerationConfig>) => void;
  sceneConfig?: SceneConfig;
  onUpdateSceneConfig?: (c: Partial<SceneConfig>) => void;
  onSpawnModel?: (name: string, url: string, scale: number) => void;
  onSpawnProcedural?: (key: AgentSamGeneratorKey) => void;
  onAddCustomAsset?: (name: string, url: string) => void | Promise<void>;
  onRemoveCustomAsset?: (id: string) => void | Promise<void>;
  onRefreshUserAssets?: () => void;
  onImportGlb?: (file: File) => void;
  onExportSceneJson?: () => void;
  onEntityRename?: (id: string, name: string) => void;
  onEntityTransform?: (id: string, patch: Partial<GameEntity>) => void;
  onFrameAll?: () => void;
  linkedCadJobId?: string | null;
  linkedGlbR2Key?: string | null;
};

function computeMeshStats(entity: GameEntity | null): MeshStats {
  if (!entity) return { verts: 0, edges: 0, faces: 0, tris: 0 };
  const voxels = entity.voxels?.length ?? 0;
  if (voxels > 0) {
    return { verts: voxels * 8, edges: voxels * 12, faces: voxels * 6, tris: voxels * 12 };
  }
  if (entity.modelUrl) return { verts: 1200, edges: 2400, faces: 800, tris: 1600 };
  return { verts: 24, edges: 36, faces: 12, tris: 24 };
}

export const CadStudioShell: React.FC<CadStudioShellProps> = ({
  engineContainerRef,
  onEngineContainerMount,
  cad,
  entities,
  entityCount,
  selectedId,
  onSelectEntity,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddCube,
  onDeleteSelected,
  onDeployJob,
  onDownloadLatestGlb,
  sceneName,
  onSceneNameChange,
  onSaveScene,
  onLoadScene,
  savedScenes,
  sceneBusy,
  computeHealth,
  currentSceneId = null,
  customAssets = [],
  genConfig,
  onUpdateGenConfig,
  sceneConfig,
  onUpdateSceneConfig,
  onSpawnModel,
  onSpawnProcedural,
  onAddCustomAsset,
  onRemoveCustomAsset,
  onRefreshUserAssets,
  onImportGlb,
  onExportSceneJson,
  onEntityRename,
  onEntityTransform,
  onFrameAll,
  linkedCadJobId,
  linkedGlbR2Key,
}) => {
  const protocol = useCadStudioProtocol();
  const { setStudioContext } = useDesignStudioContext();
  const importRef = useRef<HTMLInputElement>(null);

  const [ui, setUi] = useState(() => ({
    ...DEFAULT_UI_STATE,
    panelVisibility: { ...DEFAULT_PANEL_VISIBILITY },
  }));
  const [splashOpen, setSplashOpen] = useState(false);
  const [activeDockDomain, setActiveDockDomain] = useState<DockDomainId | null>(null);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [operatorInitialId, setOperatorInitialId] = useState<string | undefined>();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [layoutOverride, setLayoutOverride] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_LAYOUT_KEY);
    } catch {
      return null;
    }
  });
  const [renderSamples, setRenderSamples] = useState(128);
  const [renderBounces, setRenderBounces] = useState(8);
  const [materialColor, setMaterialColor] = useState('#8a9bb0');
  const [materialRoughness, setMaterialRoughness] = useState(0.45);
  const [materialMetalness, setMaterialMetalness] = useState(0.1);
  const [keyframes, setKeyframes] = useState<number[]>([1, 24, 48]);
  const [trackMarkers, setTrackMarkers] = useState<{ id: string; frame: number; x: number; y: number }[]>([]);
  const [sequencerStrips, setSequencerStrips] = useState<{ id: string; name: string; start: number; duration: number }[]>([
    { id: 's1', name: 'Render Pass', start: 0, duration: 120 },
  ]);
  const [greaseLayers, setGreaseLayers] = useState([
    { id: 'gp1', name: 'Layer 1', visible: true },
    { id: 'gp2', name: 'Layer 2', visible: true },
  ]);
  const [activeGpLayer, setActiveGpLayer] = useState('gp1');
  const [colorLift, setColorLift] = useState(0);
  const [colorGamma, setColorGamma] = useState(0);
  const [colorGain, setColorGain] = useState(0);
  const [diagnosticsText, setDiagnosticsText] = useState('');

  const activeJob = cad.polledJob || cad.activeJob;
  const selectedEntity = entities.find((e) => e.id === selectedId) ?? null;
  const meshStats = useMemo(() => computeMeshStats(selectedEntity), [selectedEntity]);

  const runnerLabel =
    computeHealth === 'ready'
      ? 'Runner: Ready'
      : computeHealth === 'degraded'
        ? 'Runner: Degraded'
        : computeHealth === 'unavailable'
          ? 'Runner: Unavailable'
          : 'Runner: Checking…';

  const patchUi = useCallback((patch: Partial<typeof ui>) => {
    setUi((prev) => ({ ...prev, ...patch }));
  }, []);

  const setWorkspace = useCallback((ws: WorkspaceId) => {
    patchUi({ workspace: ws });
    if (ws === 'Agent') {
      window.dispatchEvent(
        new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
          detail: { message: '', send: false, ensureAgentPanel: true },
        }),
      );
    }
    if (ws === 'Scripting' || ws === 'Geometry Nodes') {
      patchUi({ propertiesTab: 'scene' });
    }
    if (ws === 'Rendering') {
      patchUi({ propertiesTab: 'render' });
    }
  }, [patchUi]);

  useEffect(() => {
    setStudioContext({
      workspaceMode: ui.workspace,
      selectedObjectId: selectedId,
      panelLayout: layoutOverride,
      pendingOperator: operatorOpen ? 'operator_search' : generateOpen ? 'generate_cad' : null,
    });
  }, [ui.workspace, selectedId, layoutOverride, operatorOpen, generateOpen, setStudioContext]);

  useEffect(() => {
    if (!activeJob) return;
    const st = String(activeJob.status || '').toLowerCase();
    if (st === 'script_ready') {
      protocol.setStatus('Script ready — dispatch via ChatAssistant or Execute operator.', 'script_ready');
      void fetchCadJob(activeJob.id)
        .then((job) => {
          const script =
            (job as CadJobRow & { script?: string; cad_script?: string }).script ||
            (job as CadJobRow & { cad_script?: string }).cad_script ||
            (job.r2_key && String(job.r2_key).startsWith('b64:')
              ? atob(String(job.r2_key).slice(4))
              : '');
          if (script) protocol.setCurrentScript(script);
        })
        .catch(() => {});
    } else if (st === 'running' || st === 'pending') {
      protocol.setStatus(`Job ${activeJob.id} running…`, 'executing');
    } else if (st === 'done' || st === 'complete') {
      protocol.setStatus('Job complete. GLB available.', 'complete');
      if (activeJob.public_url) {
        protocol.registerArtifact(`${activeJob.engine}-export.glb`, 'GLB', activeJob.public_url);
      }
    } else if (st === 'failed') {
      protocol.setStatus(activeJob.error || 'Job failed.', 'failed');
    }
  }, [activeJob, protocol]);

  useEffect(() => {
    if (cad.error) {
      protocol.setStatus(cad.error, 'failed');
      protocol.toast('CAD error', cad.error);
    }
  }, [cad.error, protocol]);

  const openOperator = useCallback((commandId?: string) => {
    setOperatorInitialId(commandId);
    setOperatorOpen(true);
  }, []);

  const openGenerate = useCallback(() => setGenerateOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openOperator();
      }
      if (e.key === 'F3') {
        e.preventDefault();
        openOperator();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSaveScene();
      }
      if (e.key === 'Escape') {
        setOperatorOpen(false);
        setGenerateOpen(false);
        setDiagnosticsOpen(false);
      }
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !operatorOpen &&
        !generateOpen &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        onDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openOperator, operatorOpen, generateOpen, onDeleteSelected, onSaveScene]);

  const handleNewScene = useCallback(() => {
    if (entities.length > 0 && !window.confirm('Clear current scene?')) return;
    onClear();
    onSceneNameChange('');
    setSplashOpen(false);
  }, [entities.length, onClear, onSceneNameChange]);

  const handleImportClick = useCallback(() => importRef.current?.click(), []);

  const handleImportGlbWithToast = useCallback(
    (file: File) => {
      onImportGlb?.(file);
      protocol.toast('Import', `Added ${file.name} to viewport`);
    },
    [onImportGlb, protocol],
  );

  const handleSpawnGalleryItem = useCallback(
    (item: GalleryItem) => {
      onSpawnModel?.(item.name, item.url, item.scale ?? 1);
      protocol.addEvent('asset.spawn', `Spawned ${item.name}`, { url: item.url });
    },
    [onSpawnModel, protocol],
  );

  const handleRenderViewport = useCallback(() => {
    const mount = engineContainerRef.current;
    const canvas = mount?.querySelector('canvas');
    if (!canvas) {
      protocol.toast('Render', 'Viewport canvas not ready.');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iam-cad-viewport-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      protocol.addEvent('render.viewport', 'Viewport PNG exported');
    }, 'image/png');
  }, [engineContainerRef, protocol]);

  const handleDockLocalAction = useCallback(
    (actionId: string) => {
      switch (actionId) {
        case 'addCube':
          onAddCube();
          break;
        case 'importGlb':
          handleImportClick();
          break;
        case 'generate':
          openGenerate();
          break;
        case 'operatorSearch':
          openOperator();
          break;
        case 'assets':
          patchUi({
            rightPanelTab: 'assets',
            panelVisibility: { ...ui.panelVisibility, assets: true },
          });
          break;
        case 'outliner':
          patchUi({
            rightPanelTab: 'outliner',
            panelVisibility: { ...ui.panelVisibility, outliner: true },
          });
          break;
        case 'delete':
          onDeleteSelected();
          break;
        case 'exportGlb':
          onDownloadLatestGlb();
          break;
        case 'wireframe':
          patchUi({ wireframe: !ui.wireframe });
          break;
        case 'solid':
          patchUi({ solidShading: !ui.solidShading });
          break;
        case 'renderViewport':
          handleRenderViewport();
          break;
        case 'frameAll':
          onFrameAll?.();
          break;
        default:
          break;
      }
    },
    [
      onAddCube,
      handleImportClick,
      openGenerate,
      openOperator,
      patchUi,
      ui.panelVisibility,
      ui.wireframe,
      ui.solidShading,
      onDeleteSelected,
      onDownloadLatestGlb,
      handleRenderViewport,
      onFrameAll,
    ],
  );

  const toolDock = (
    <CreativeToolDock
      workspace={ui.workspace}
      activeTool={ui.viewTool}
      activeDomain={activeDockDomain}
      onDomainChange={setActiveDockDomain}
      onToolChange={(t) => patchUi({ viewTool: t as ViewTool })}
      onLocalAction={handleDockLocalAction}
      onOpenOperator={(operatorId, prompt) => {
        if (operatorId) {
          openOperatorDraft(operatorId, {
            prompt,
            workspace: ui.workspace,
            selectedObjectId: selectedId,
            sceneId: currentSceneId,
          });
        } else {
          openOperator();
        }
      }}
      selectedObjectId={selectedId}
      sceneId={currentSceneId}
    />
  );

  useEffect(() => {
    if (engineContainerRef.current) onEngineContainerMount();
  }, [engineContainerRef, onEngineContainerMount]);

  useEffect(() => {
    const id = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => window.clearTimeout(id);
  }, [ui.workspace, layoutOverride]);

  const showDiagnostics = useCallback(async () => {
    setDiagnosticsOpen(true);
    try {
      const [healthRes, jobsRes] = await Promise.all([
        fetch('/api/cad/compute/health', { credentials: 'include' }),
        fetch('/api/cad/jobs?limit=10', { credentials: 'include' }),
      ]);
      const health = healthRes.ok ? await healthRes.json() : { status: 'unknown' };
      const jobs = jobsRes.ok ? await jobsRes.json() : { jobs: [] };
      const rows = Array.isArray(jobs.jobs) ? jobs.jobs : [];
      const byEngine: Record<string, string> = {};
      for (const j of rows) {
        const eng = String(j.engine || 'unknown');
        if (!byEngine[eng]) byEngine[eng] = String(j.status);
      }
      setDiagnosticsText(
        [
          `Runner: ${health.status ?? computeHealth}`,
          `Active job: ${activeJob?.id ?? 'none'}`,
          `Scene: ${currentSceneId ?? 'unsaved'}`,
          '',
          'Last jobs by engine:',
          ...Object.entries(byEngine).map(([e, s]) => `  ${e}: ${s}`),
        ].join('\n'),
      );
    } catch (e) {
      setDiagnosticsText(e instanceof Error ? e.message : String(e));
    }
  }, [activeJob?.id, computeHealth, currentSceneId]);

  const progressPct = activeJob?.progress_pct ?? 0;
  const progressLabel = `${activeJob?.engine || 'CAD'} · ${activeJob?.status || 'running'}${progressPct > 0 ? ` · ${progressPct}%` : ''}`;

  const outlinerPanel = (
    <OutlinerEditor
      entities={entities}
      selectedId={selectedId}
      onSelect={onSelectEntity}
      artifacts={protocol.artifacts}
    />
  );

  const propertiesPanel = (
    <PropertiesEditor
      selectedEntity={selectedEntity}
      propertiesTab={ui.propertiesTab}
      onTabChange={(tab) => patchUi({ propertiesTab: tab })}
      sceneName={sceneName}
      onSceneNameChange={onSceneNameChange}
      onEntityNameChange={onEntityRename}
      onTransformChange={onEntityTransform}
      protocol={protocol}
      activeJob={activeJob}
      onDeployJob={onDeployJob}
      onDownloadLatestGlb={onDownloadLatestGlb}
      renderSamples={renderSamples}
      renderBounces={renderBounces}
      onRenderSettingsChange={(p) => {
        if (p.samples != null) setRenderSamples(p.samples);
        if (p.bounces != null) setRenderBounces(p.bounces);
      }}
      sceneConfig={sceneConfig}
      onSceneConfigChange={onUpdateSceneConfig}
    />
  );

  const assetsPanel = (
    <AssetGalleryEditor onSpawn={handleSpawnGalleryItem} onUpload={onImportGlb} />
  );

  const rightPanel =
    ui.rightPanelTab === 'assets' ? assetsPanel : ui.rightPanelTab === 'properties' ? propertiesPanel : outlinerPanel;

  const splash = splashOpen ? (
    <div className="cad-studio__splash">
      <div className="cad-studio__splash-hero">
        <div className="cad-studio__splash-logo">
          IAM <span>CAD</span>
        </div>
        <div style={{ marginTop: 8, color: '#aeb9c6', fontSize: 12 }}>
          Browser-native Blender-style shell · Meshy + ExecOS
        </div>
      </div>
      <div className="cad-studio__splash-body">
        <div>
          <div style={{ fontSize: 12, color: '#cdd4df', marginBottom: 8 }}>New File</div>
          <button type="button" className="cad-studio__splash-link" onClick={() => { setSplashOpen(false); handleNewScene(); }}>
            General
          </button>
          <button type="button" className="cad-studio__splash-link" onClick={() => setSplashOpen(false)}>
            Precision CAD (OpenSCAD)
          </button>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#cdd4df', marginBottom: 8 }}>Getting Started</div>
          <button type="button" className="cad-studio__splash-link" onClick={() => { setSplashOpen(false); openGenerate(); }}>
            Generate CAD Object
          </button>
          <button type="button" className="cad-studio__splash-link" onClick={() => { setSplashOpen(false); openOperator(); }}>
            Operator Search
          </button>
          {savedScenes.slice(0, 3).map((s) => (
            <button
              key={s.id}
              type="button"
              className="cad-studio__splash-link"
              onClick={() => { setSplashOpen(false); onLoadScene(s.id); }}
            >
              Open: {s.name}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="cad-studio__splash-close" onClick={() => setSplashOpen(false)}>
        close
      </button>
    </div>
  ) : null;

  const viewportPrimary = (
    <Viewport3DEditor
      label={ui.workspace === 'Animation' ? 'Pose View' : 'User Perspective'}
      sublabel={`(1) Collection | ${selectedEntity?.name || 'None'}`}
      entityCount={entities.length}
      voxelCount={entityCount}
      jobId={activeJob?.id}
      activeTool={ui.viewTool as ViewTool}
      onUndo={onUndo}
      onRedo={onRedo}
      canUndo={canUndo}
      canRedo={canRedo}
      onClear={onClear}
      showProgress={cad.isGenerating}
      progressLabel={progressLabel}
      progressPct={progressPct}
      splash={splash}
      toolDock={toolDock}
      onDropGlb={handleImportGlbWithToast}
    />
  );

  const editors = {
    rightTabs: (
      <RightPanelTabs active={ui.rightPanelTab} onChange={(tab) => patchUi({ rightPanelTab: tab })}>
        {rightPanel}
      </RightPanelTabs>
    ),
    viewport: viewportPrimary,
    viewportSecondary: (
      <SecondaryViewportEditor
        title={
          ui.workspace === 'UV Editing'
            ? 'UV Editor'
            : ui.workspace === 'Texture Paint'
              ? 'Image Editor'
              : ui.workspace === 'Animation'
                ? 'Camera View'
                : ui.workspace === 'Rendering'
                  ? 'Render Result'
                  : ui.workspace === 'Compositing'
                    ? 'Compositor'
                    : ui.workspace === 'Video Editing'
                      ? 'Preview'
                      : 'Secondary View'
        }
      />
    ),
    outliner: ui.panelVisibility.outliner ? outlinerPanel : undefined,
    properties: ui.panelVisibility.properties ? propertiesPanel : undefined,
    assets: ui.panelVisibility.assets ? assetsPanel : rightPanel,
    timeline: (
      <TimelineEditor
        frame={ui.frame}
        endFrame={ui.endFrame}
        isPlaying={ui.isPlaying}
        onTogglePlay={() => patchUi({ isPlaying: !ui.isPlaying })}
        onFrameChange={(f) => patchUi({ frame: f })}
        onEndFrameChange={(f) => patchUi({ endFrame: f })}
      />
    ),
    dopesheet: (
      <DopeSheetEditor
        frame={ui.frame}
        endFrame={ui.endFrame}
        keyframes={keyframes}
        onSelectFrame={(f) => patchUi({ frame: f })}
      />
    ),
    nodes: (
      <NodeEditor
        materialColor={materialColor}
        roughness={materialRoughness}
        metalness={materialMetalness}
        onChange={(p) => {
          if (p.color) setMaterialColor(p.color);
          if (p.roughness != null) setMaterialRoughness(p.roughness);
          if (p.metalness != null) setMaterialMetalness(p.metalness);
        }}
      />
    ),
    script: (
      <ScriptEditor
        script={protocol.currentScript || '# Generated script appears here after runner jobs.'}
        readOnly
        onRunViaChat={() =>
          openOperatorDraft('executeScript', {
            workspace: ui.workspace,
            selectedObjectId: selectedId,
            sceneId: currentSceneId,
          })
        }
      />
    ),
    movieClip: (
      <MovieClipEditor
        markers={trackMarkers}
        onAddMarker={() =>
          setTrackMarkers((prev) => [
            ...prev,
            { id: `m_${Date.now()}`, frame: ui.frame, x: 20 + prev.length * 8, y: 30 + prev.length * 5 },
          ])
        }
        onLoadClip={() => protocol.toast('Clip loaded', 'Use ChatAssistant to run tracking solve on clip.')}
      />
    ),
    graph: <GraphEditor tracks={trackMarkers.length ? [{ name: 'Track X', values: [0.2, 0.5, 0.8] }] : []} />,
    sequencer: (
      <SequencerEditor
        strips={sequencerStrips}
        onAddStrip={() =>
          setSequencerStrips((prev) => [
            ...prev,
            { id: `s_${Date.now()}`, name: `Strip ${prev.length + 1}`, start: prev.length * 40, duration: 80 },
          ])
        }
      />
    ),
    scopes: <ScopesEditor waveform={Array.from({ length: 32 }, (_, i) => Math.abs(Math.sin(i * 0.4)))} />,
    colorBalance: (
      <ColorBalanceEditor
        lift={colorLift}
        gamma={colorGamma}
        gain={colorGain}
        onChange={(p) => {
          if (p.lift != null) setColorLift(p.lift);
          if (p.gamma != null) setColorGamma(p.gamma);
          if (p.gain != null) setColorGain(p.gain);
        }}
      />
    ),
    greaseLayers: (
      <GreaseLayersEditor
        layers={greaseLayers}
        activeLayerId={activeGpLayer}
        onSelect={setActiveGpLayer}
        onAdd={() =>
          setGreaseLayers((prev) => [
            ...prev,
            { id: `gp_${Date.now()}`, name: `Layer ${prev.length + 1}`, visible: true },
          ])
        }
      />
    ),
    creationPanel:
      genConfig && onUpdateGenConfig && sceneConfig && onUpdateSceneConfig && onSpawnModel && onAddCustomAsset && onRemoveCustomAsset ? (
        <CreationPanelEditor
          cad={cad}
          customAssets={customAssets}
          genConfig={genConfig}
          onUpdateGenConfig={onUpdateGenConfig}
          sceneConfig={sceneConfig}
          onUpdateSceneConfig={onUpdateSceneConfig}
          sceneName={sceneName}
          onSceneNameChange={onSceneNameChange}
          savedScenes={savedScenes}
          sceneBusy={sceneBusy}
          onSaveScene={onSaveScene}
          onLoadScene={onLoadScene}
          onSpawnModel={onSpawnModel}
          onSpawnProcedural={onSpawnProcedural}
          onAddCustomAsset={onAddCustomAsset}
          onRemoveCustomAsset={onRemoveCustomAsset}
          onRefreshUserAssets={onRefreshUserAssets}
          onDeployJob={onDeployJob}
          onImportGlb={onImportGlb}
          onExportSceneJson={onExportSceneJson}
          onDownloadLatestGlb={onDownloadLatestGlb}
          cadJobId={linkedCadJobId}
          glbR2Key={linkedGlbR2Key}
          latestGlbUrl={activeJob?.public_url}
          onOpenOperators={openGenerate}
        />
      ) : (
        <SecondaryViewportEditor title="Creation Station" hint="Creation panels require full Design Studio props." />
      ),
  };

  return (
    <div className="cad-studio">
      <input
        ref={importRef}
        type="file"
        accept=".glb,.gltf"
        className="cad-editor__hidden-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportGlbWithToast(f);
          e.target.value = '';
        }}
      />

      <CadMenuBar
        activeWorkspace={ui.workspace}
        onWorkspaceChange={setWorkspace}
        onSaveScene={onSaveScene}
        sceneBusy={sceneBusy}
        savedScenes={savedScenes}
        onNewScene={handleNewScene}
        onOpenScene={onLoadScene}
        onImportFile={handleImportClick}
        onExportGlb={onDownloadLatestGlb}
        onExportSceneJson={() => onExportSceneJson?.()}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onDeleteSelected={onDeleteSelected}
        onSelectAll={() => onSelectEntity(entities[0]?.id ?? null)}
        onDeselect={() => onSelectEntity(null)}
        onRenameSelected={() => {
          if (!selectedId) return;
          const name = window.prompt('Rename object', selectedEntity?.name ?? '');
          if (name?.trim()) onEntityRename?.(selectedId, name.trim());
        }}
        onToggleOutliner={() => {
          patchUi({
            rightPanelTab: 'outliner',
            panelVisibility: { ...ui.panelVisibility, outliner: !ui.panelVisibility.outliner },
          });
        }}
        onToggleProperties={() => {
          patchUi({
            rightPanelTab: 'properties',
            panelVisibility: { ...ui.panelVisibility, properties: !ui.panelVisibility.properties },
          });
        }}
        onToggleAssets={() => {
          patchUi({
            rightPanelTab: 'assets',
            panelVisibility: { ...ui.panelVisibility, assets: !ui.panelVisibility.assets },
          });
        }}
        onToggleTimeline={() =>
          patchUi({ panelVisibility: { ...ui.panelVisibility, timeline: !ui.panelVisibility.timeline } })
        }
        onToggleConsole={() =>
          window.dispatchEvent(
            new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
              detail: { message: '', send: false, ensureAgentPanel: true },
            }),
          )
        }
        onResetLayout={() => {
          setLayoutOverride(null);
          try {
            localStorage.removeItem(LS_LAYOUT_KEY);
          } catch {
            /* ignore */
          }
          patchUi({ panelVisibility: { ...DEFAULT_PANEL_VISIBILITY } });
          protocol.toast('Layout reset', 'Default workspace layout restored.');
        }}
        onOperatorSearch={() => openOperator()}
        onGenerateCad={openGenerate}
        onRenderViewport={handleRenderViewport}
        onRenderViaChat={(intent) =>
          openOperatorDraft('generateBlender', {
            prompt: intent,
            workspace: ui.workspace,
            selectedObjectId: selectedId,
            sceneId: currentSceneId,
          })
        }
        computeHealth={computeHealth}
        onShowDiagnostics={() => void showDiagnostics()}
      />

      <ContextHeader
        interactionMode={ui.interactionMode}
        onInteractionModeChange={(mode) => patchUi({ interactionMode: mode })}
        wireframe={ui.wireframe}
        solidShading={ui.solidShading}
        onToggleWireframe={() => patchUi({ wireframe: !ui.wireframe })}
        onToggleSolid={() => patchUi({ solidShading: !ui.solidShading })}
        onFrameAll={() => onFrameAll?.()}
        onAddCube={onAddCube}
        onImportFile={handleImportClick}
        onSpawnProcedural={onSpawnProcedural}
      />

      <div className="cad-studio__layout-wrap">
        <div
          ref={engineContainerRef}
          className="cad-studio__engine-persistent"
          aria-hidden="true"
        />
        <WorkspaceLayoutEngine
          workspace={ui.workspace}
          layoutOverride={layoutOverride}
          panelVisibility={ui.panelVisibility}
          editors={editors}
        />
      </div>

      <StatusBar
        selectedName={selectedEntity?.name ?? null}
        meshStats={meshStats}
        memoryMb={
          typeof performance !== 'undefined' &&
          'memory' in performance &&
          (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
            ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1048576
            : undefined
        }
        workspace={ui.workspace}
        engine={protocol.activeEngine}
        jobStatus={protocol.jobStatus}
        statusMessage={protocol.statusMessage}
        runnerLabel={runnerLabel}
        sceneBusy={sceneBusy}
        saveLabel={sceneBusy ? 'Saving…' : undefined}
      />

      <OperatorSearchModal
        open={operatorOpen}
        onClose={() => setOperatorOpen(false)}
        workspace={ui.workspace}
        selectedObjectId={selectedId}
        sceneId={currentSceneId}
        initialOperatorId={operatorInitialId}
      />

      <GenerateCadModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        workspace={ui.workspace}
        sceneId={currentSceneId}
      />

      {diagnosticsOpen ? (
        <div className="cad-studio__operator-backdrop open" onClick={() => setDiagnosticsOpen(false)}>
          <div className="cad-studio__diagnostics" onClick={(e) => e.stopPropagation()}>
            <div className="cad-editor__head">Runner Diagnostics</div>
            <pre className="cad-studio__mini-code">{diagnosticsText || 'Loading…'}</pre>
            <button type="button" className="cad-studio__secondary-btn" onClick={() => setDiagnosticsOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <div className="cad-studio__toast-stack">
        {protocol.toasts.map((t) => (
          <div key={t.id} className="cad-studio__toast">
            <div className="cad-studio__toast-title">{t.title}</div>
            <div style={{ color: '#aeb8c5', lineHeight: 1.35 }}>{t.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
