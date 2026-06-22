/**
 * Design Studio — 3-lane creation station (/dashboard/designstudio).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { normalizeGlbUrl } from '../lib/glbAssets';
import { UIOverlay } from './UIOverlay';
import { DesignStudioCreationStation } from './designstudio/creation-station/DesignStudioCreationStation';
import { useDesignStudioCad } from './designstudio/hooks/useDesignStudioCad';
import { spawnGlbInEngine } from './designstudio/spawnGlb';
import { useDesignStudioContext } from './designstudio/DesignStudioContext';
import type { CadJobRow } from './designstudio/api';
import type { SavedSceneRow } from './designstudio/shared/ScenePanel';
import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  LS_AGENT_CHAT_CONVERSATION_ID,
} from '../agentChatConstants';
import {
  ProjectType,
  AppState,
  GameEntity,
  GenerationConfig,
  ArtStyle,
  SceneConfig,
  CADTool,
  CADPlane,
  CustomAsset,
} from '../types';

const ACTIVE_PROJECT = ProjectType.CAD;

type VoxelEngineClass = typeof import('../services/VoxelEngine').VoxelEngine;
type VoxelEngineInstance = InstanceType<VoxelEngineClass>;
type StudioEngine = VoxelEngineInstance;

type PendingGlbState = { pendingGlb?: { url: string; name: string } };

type StudioStockAsset = {
  id: string;
  name: string;
  url: string;
  scale: number;
};

function isVoxelEngine(engine: StudioEngine | null): engine is VoxelEngineInstance {
  return engine != null && 'setProjectType' in engine;
}

function parseStudioAssetApiRow(row: {
  id?: string;
  label?: string;
  public_url?: string;
  scale?: number;
}): StudioStockAsset | null {
  const id = String(row.id || '').trim();
  const url = normalizeGlbUrl(row.public_url);
  if (!id || !url) return null;
  const name = String(row.label || id).trim() || id;
  const scale =
    typeof row.scale === 'number' && Number.isFinite(row.scale) && row.scale > 0 ? row.scale : 1;
  return { id, name, url, scale };
}

export const DesignStudioPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setStudioContext } = useDesignStudioContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const pageRootRef = useRef<HTMLDivElement>(null);
  const pendingConsumedRef = useRef(false);
  const lastSpawnedJobRef = useRef<string | null>(null);

  const [engineReady, setEngineReady] = useState(false);
  const [appState, setAppState] = useState<AppState>(AppState.EDITING);
  const [voxelCount, setVoxelCount] = useState(0);
  const [customAssets, setCustomAssets] = useState<CustomAsset[]>([]);
  const [undoStack, setUndoStack] = useState<GameEntity[]>([]);
  const [redoStack, setRedoStack] = useState<GameEntity[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [linkedCadJobId, setLinkedCadJobId] = useState<string | null>(null);
  const [linkedGlbR2Key, setLinkedGlbR2Key] = useState<string | null>(null);

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

  const [savedScenes, setSavedScenes] = useState<SavedSceneRow[]>([]);
  const [sceneName, setSceneName] = useState('');
  const [sceneBusy, setSceneBusy] = useState(false);
  const [computeHealth, setComputeHealth] = useState<
    'ready' | 'running' | 'degraded' | 'unavailable' | 'unknown'
  >('unknown');

  const deployJobToScene = useCallback(async (job: CadJobRow, opts?: { auto?: boolean }) => {
    const url = job.public_url || job.result_url;
    if (!url) return false;
    const name = job.prompt?.slice(0, 40) || `${job.engine} export`;
    const ok = await spawnGlbInEngine(isVoxelEngine(engineRef.current) ? engineRef.current : null, {
      url,
      name,
    });
    if (ok) {
      setLinkedCadJobId(job.id);
      if (job.r2_key && !String(job.r2_key).startsWith('b64:')) {
        setLinkedGlbR2Key(job.r2_key);
      }
      lastSpawnedJobRef.current = job.id;
      if (opts?.auto) console.info('[DesignStudio] auto-spawned GLB', job.id);
    }
    return ok;
  }, []);

  const [chatSessionId, setChatSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID)?.trim() || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const onConv = (ev: Event) => {
      const id = (ev as CustomEvent<{ conversationId?: string }>).detail?.conversationId?.trim();
      if (id) setChatSessionId(id);
    };
    window.addEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
    return () => window.removeEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onConv);
  }, []);

  const cad = useDesignStudioCad({
    sessionId: chatSessionId,
    sceneId: currentSceneId,
    onJobDone: (job) => {
      void refreshUserAssets();
      if (job.status === 'done' && job.public_url && lastSpawnedJobRef.current !== job.id) {
        void deployJobToScene(job, { auto: true });
      }
    },
  });

  const refreshSceneList = useCallback(() => {
    fetch('/api/designstudio/scenes', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const rows = Array.isArray(data?.scenes) ? data.scenes : [];
        setSavedScenes(
          rows.map(
            (s: {
              id: string;
              name: string;
              entity_count: number;
              updated_at: number;
              cad_job_id?: string | null;
              glb_r2_key?: string | null;
            }) => ({
              id: s.id,
              name: s.name,
              entity_count: s.entity_count,
              updated_at: s.updated_at,
              cad_job_id: s.cad_job_id,
              glb_r2_key: s.glb_r2_key,
            }),
          ),
        );
      })
      .catch(() => {});
  }, []);

  const refreshUserAssets = useCallback(() => {
    fetch('/api/designstudio/assets?category=3d_studio_user&is_live=1', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const rows = Array.isArray(data?.results) ? data.results : [];
        setCustomAssets(
          rows
            .map((row: Parameters<typeof parseStudioAssetApiRow>[0]) => parseStudioAssetApiRow(row))
            .filter((a): a is StudioStockAsset => a != null)
            .map((a) => ({ id: a.id, name: a.name, url: a.url, scale: a.scale })),
        );
      })
      .catch((e) => console.warn('[Asset Library]', e));
  }, []);

  useEffect(() => {
    refreshSceneList();
    refreshUserAssets();
  }, [refreshSceneList, refreshUserAssets]);

  useEffect(() => {
    setStudioContext({
      activeProject: ACTIVE_PROJECT,
      sceneId: currentSceneId,
      blueprintId: cad.activeBlueprintId,
      cadJobId: cad.activeJobId || linkedCadJobId,
      sessionId: chatSessionId,
      computeStatus: cad.isGenerating ? 'running' : computeHealth,
    });
  }, [
    currentSceneId,
    cad.activeBlueprintId,
    cad.activeJobId,
    cad.isGenerating,
    linkedCadJobId,
    chatSessionId,
    computeHealth,
    setStudioContext,
  ]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/cad/compute/health', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { status?: string };
        const s = String(data.status || 'unknown');
        if (s === 'ready' || s === 'degraded' || s === 'unavailable') {
          setComputeHealth(s);
        } else {
          setComputeHealth('unknown');
        }
      } catch {
        if (!cancelled) setComputeHealth('unavailable');
      }
    };
    void poll();
    const id = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let engine: StudioEngine | null = null;

    const mountVoxel = async () => {
      const { VoxelEngine } = await import('../services/VoxelEngine');
      if (cancelled || !containerRef.current) return;
      engine = new VoxelEngine(container, (s) => setAppState(s), (c) => setVoxelCount(c));
      engineRef.current = engine;
      engine.setOnEntityCreated((entity) => {
        setUndoStack((prev) => [...prev, entity]);
        setRedoStack([]);
      });
      engine.updateLighting(sceneConfig);
      engine.setCADPlane(genConfig.cadPlane);
      engine.setExtrusion(genConfig.extrusion);
      engine.setProjectType(ACTIVE_PROJECT);
      const settleViewport = () => {
        if (isVoxelEngine(engine)) engine.handleResize();
      };
      requestAnimationFrame(() => {
        settleViewport();
        requestAnimationFrame(settleViewport);
      });
      setEngineReady(true);
    };

    void mountVoxel();

    const handleResize = () => {
      if (isVoxelEngine(engineRef.current)) {
        engineRef.current.handleResize();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      setEngineReady(false);
      engine?.cleanup();
      engineRef.current = null;
      container.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    if (isVoxelEngine(engineRef.current)) {
      engineRef.current.updateLighting(sceneConfig);
    }
  }, [sceneConfig]);

  useEffect(() => {
    if ((location.state as PendingGlbState | null)?.pendingGlb) {
      pendingConsumedRef.current = false;
    }
  }, [location.state]);

  useEffect(() => {
    if (!engineReady || !isVoxelEngine(engineRef.current) || pendingConsumedRef.current) return;
    const st = (location.state as PendingGlbState | null)?.pendingGlb;
    if (!st?.url) return;
    pendingConsumedRef.current = true;
    void spawnGlbInEngine(engineRef.current, { url: st.url, name: st.name || 'Imported' });
    navigate(location.pathname, { replace: true, state: {} });
  }, [engineReady, location.state, location.pathname, navigate]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !isVoxelEngine(engineRef.current)) return;
    const last = undoStack[undoStack.length - 1];
    engineRef.current.removeEntity(last.id);
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, last]);
  }, [undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !isVoxelEngine(engineRef.current)) return;
    const next = redoStack[redoStack.length - 1];
    engineRef.current.spawnEntity(next);
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, next]);
  }, [redoStack]);

  const handleUpdateGenConfig = useCallback((cfg: Partial<GenerationConfig>) => {
    setGenConfig((prev) => {
      const next = { ...prev, ...cfg };
      if (isVoxelEngine(engineRef.current)) {
        if (cfg.cadTool !== undefined) engineRef.current.setCADTool(cfg.cadTool);
        if (cfg.cadPlane !== undefined) engineRef.current.setCADPlane(cfg.cadPlane);
        if (cfg.extrusion !== undefined) engineRef.current.setExtrusion(cfg.extrusion);
      }
      return next;
    });
  }, []);

  const handleSpawnModel = useCallback((name: string, url: string, scale: number) => {
    if (!isVoxelEngine(engineRef.current)) return;
    const normalized = normalizeGlbUrl(url);
    if (!normalized) return;
    void engineRef.current
      .spawnEntity({
        id: `asset_${Date.now()}`,
        name,
        type: 'prop',
        modelUrl: normalized,
        scale,
        position: { x: 0, y: 0, z: 0 },
        behavior: { type: 'static' },
      })
      .catch((err) => console.warn('[DesignStudio] spawn failed', err));
  }, []);

  const handleAddCustomAsset = useCallback(
    async (name: string, url: string) => {
      const res = await fetch('/api/designstudio/assets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: name, public_url: url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: string }).error === 'string'
            ? (data as { error: string }).error
            : 'Failed to save asset',
        );
      }
      refreshUserAssets();
    },
    [refreshUserAssets],
  );

  const handleRemoveCustomAsset = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/designstudio/assets/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof (data as { error?: string }).error === 'string'
            ? (data as { error: string }).error
            : 'Failed to remove asset',
        );
      }
      refreshUserAssets();
    },
    [refreshUserAssets],
  );

  const handleImportGlbFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      handleSpawnModel(file.name.replace(/\.glb$/i, ''), url, 1);
    },
    [handleSpawnModel],
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const glb = Array.from(e.dataTransfer.files).find((f) => f.name.toLowerCase().endsWith('.glb'));
      if (glb) handleImportGlbFile(glb);
    },
    [handleImportGlbFile],
  );

  const onClear = useCallback(() => {
    if (!isVoxelEngine(engineRef.current)) return;
    engineRef.current.clearWorld();
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const handleSaveScene = useCallback(async () => {
    if (!isVoxelEngine(engineRef.current)) return;
    setSceneBusy(true);
    try {
      const entities = engineRef.current.exportEntities();
      const activeJob = cad.polledJob || cad.activeJob;
      const res = await fetch('/api/designstudio/scenes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: currentSceneId || undefined,
          name: sceneName.trim() || `Scene ${new Date().toLocaleString()}`,
          project_type: ACTIVE_PROJECT,
          entities,
          cad_job_id: linkedCadJobId || activeJob?.id || null,
          glb_r2_key:
            linkedGlbR2Key ||
            (activeJob?.r2_key && !String(activeJob.r2_key).startsWith('b64:')
              ? activeJob.r2_key
              : null),
          voxel_count: voxelCount,
          style_preset: genConfig.style,
          project_id: cad.activeBlueprintId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json().catch(() => ({}));
      const scene = (data as { scene?: { id?: string; cad_job_id?: string; glb_r2_key?: string } }).scene;
      if (scene?.id) setCurrentSceneId(scene.id);
      if (scene?.cad_job_id) setLinkedCadJobId(String(scene.cad_job_id));
      if (scene?.glb_r2_key) setLinkedGlbR2Key(String(scene.glb_r2_key));
      refreshSceneList();
    } catch (e) {
      console.warn('[DesignStudio] save scene failed', e);
    } finally {
      setSceneBusy(false);
    }
  }, [
    sceneName,
    refreshSceneList,
    cad,
    linkedCadJobId,
    linkedGlbR2Key,
    voxelCount,
    genConfig.style,
    currentSceneId,
  ]);

  const handleLoadScene = useCallback(async (sceneId: string) => {
    if (!isVoxelEngine(engineRef.current)) return;
    setSceneBusy(true);
    try {
      const [entitiesRes, metaRes] = await Promise.all([
        fetch(`/api/designstudio/scenes/${encodeURIComponent(sceneId)}/entities`, {
          credentials: 'include',
        }),
        fetch(`/api/designstudio/scenes/${encodeURIComponent(sceneId)}`, { credentials: 'include' }),
      ]);
      if (!entitiesRes.ok) throw new Error(await entitiesRes.text());
      const data = await entitiesRes.json();
      await engineRef.current.loadEntities(data.entities || [], { keepBoard: true });
      setCurrentSceneId(sceneId);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        const scene = (meta as { scene?: SavedSceneRow }).scene;
        if (scene?.cad_job_id) setLinkedCadJobId(String(scene.cad_job_id));
        if (scene?.glb_r2_key) setLinkedGlbR2Key(String(scene.glb_r2_key));
        if (scene?.name) setSceneName(scene.name);
      }
      setUndoStack([]);
      setRedoStack([]);
    } catch (e) {
      console.warn('[DesignStudio] load scene failed', e);
    } finally {
      setSceneBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!engineReady || !isVoxelEngine(engineRef.current)) return;
    const tick = window.setInterval(() => {
      const voxel = isVoxelEngine(engineRef.current) ? engineRef.current : null;
      const entities = voxel?.exportEntities();
      if (!entities?.length) return;
      const wsId =
        (typeof window !== 'undefined' &&
          (window as Window & { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__) ||
        '';
      void fetch('/api/designstudio/scenes/autosave', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          project_type: ACTIVE_PROJECT,
          entities,
          ...(wsId && wsId !== 'global' ? { workspace_id: wsId } : {}),
        }),
      }).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(tick);
  }, [engineReady]);

  const activeJobForBar = cad.polledJob || cad.activeJob;

  const handleDownloadLatestGlb = useCallback(() => {
    const url = activeJobForBar?.public_url;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeJobForBar?.engine || 'cad'}-export.glb`;
    a.rel = 'noopener';
    a.click();
  }, [activeJobForBar]);

  const handleViewportRectChange = useCallback((rect: DOMRect | null) => {
    const container = containerRef.current;
    const root = pageRootRef.current;
    if (!container || !root) return;
    if (!rect) {
      container.style.left = '';
      container.style.top = '';
      container.style.width = '';
      container.style.height = '';
      container.style.right = '';
      container.style.bottom = '';
      container.classList.add('inset-0');
      if (isVoxelEngine(engineRef.current)) engineRef.current.handleResize();
      return;
    }
    container.classList.remove('inset-0');
    const rootRect = root.getBoundingClientRect();
    container.style.left = `${rect.left - rootRect.left}px`;
    container.style.top = `${rect.top - rootRect.top}px`;
    container.style.width = `${rect.width}px`;
    container.style.height = `${rect.height}px`;
    container.style.right = 'auto';
    container.style.bottom = 'auto';
    if (isVoxelEngine(engineRef.current)) engineRef.current.handleResize();
  }, []);

  return (
    <div
      ref={pageRootRef}
      className="relative flex h-full min-h-0 overflow-hidden"
      style={{ background: 'var(--bg-app)' }}
      onDrop={handleFileDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div ref={containerRef} className="absolute inset-0 z-0" style={{ background: 'var(--scene-bg)' }} />

      <DesignStudioCreationStation
        cad={cad}
        genConfig={genConfig}
        onUpdateGenConfig={handleUpdateGenConfig}
        sceneConfig={sceneConfig}
        onUpdateSceneConfig={(c) => setSceneConfig((p) => ({ ...p, ...c }))}
        onDeployJob={(job) => void deployJobToScene(job)}
        onExportSceneJson={() => {
          if (isVoxelEngine(engineRef.current)) {
            engineRef.current.exportForBlender();
          }
        }}
        cadJobId={linkedCadJobId || cad.activeJobId}
        glbR2Key={linkedGlbR2Key}
        viewport={
            <UIOverlay
              voxelCount={voxelCount}
              appState={appState}
              activeProject={ACTIVE_PROJECT}
                isGenerating={cad.isGenerating}
                onTogglePlay={() => {}}
                onClear={onClear}
                genConfig={genConfig}
                onUpdateGenConfig={handleUpdateGenConfig}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
                variant="studio"
              />
            }
            customAssets={customAssets}
            onSpawnModel={handleSpawnModel}
            onAddCustomAsset={handleAddCustomAsset}
            onRemoveCustomAsset={handleRemoveCustomAsset}
            onRefreshUserAssets={refreshUserAssets}
            onImportGlb={handleImportGlbFile}
            onBlenderExport={() => {
              if (isVoxelEngine(engineRef.current)) {
                engineRef.current.exportForBlender();
              }
            }}
            sceneName={sceneName}
            onSceneNameChange={setSceneName}
            savedScenes={savedScenes}
            sceneBusy={sceneBusy}
            onSaveScene={() => void handleSaveScene()}
            onLoadScene={(id) => void handleLoadScene(id)}
            onDownloadLatestGlb={handleDownloadLatestGlb}
            activeJob={activeJobForBar}
            onViewportRectChange={handleViewportRectChange}
      />
    </div>
  );
};
