/**
 * Design Studio — full 3D workspace (/dashboard/designstudio).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { normalizeGlbUrl } from '../lib/glbAssets';
import { UIOverlay } from './UIOverlay';
import { ToolLauncherBar } from './ToolLauncherBar';
import {
  DesignStudioLeftPanel,
  readStoredDesignStudioProject,
} from './designstudio/DesignStudioLeftPanel';
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
  CustomAsset,
  CADPlane,
} from '../types';

type VoxelEngineClass = typeof import('../services/VoxelEngine').VoxelEngine;
type VoxelEngineInstance = InstanceType<VoxelEngineClass>;

type PendingGlbState = { pendingGlb?: { url: string; name: string } };

type StudioStockAsset = {
  id: string;
  name: string;
  url: string;
  scale: number;
};

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
  const engineRef = useRef<VoxelEngineInstance | null>(null);
  const pendingConsumedRef = useRef(false);
  const lastSpawnedJobRef = useRef<string | null>(null);

  const [engineReady, setEngineReady] = useState(false);
  const [activeProject, setActiveProject] = useState<ProjectType>(readStoredDesignStudioProject);
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
  const [multiplayerBusy, setMultiplayerBusy] = useState(false);
  const [multiplayerRoomId, setMultiplayerRoomId] = useState<string | null>(null);
  const [multiplayerColor, setMultiplayerColor] = useState<string | null>(null);
  const chessWsRef = useRef<WebSocket | null>(null);

  const deployJobToScene = useCallback(async (job: CadJobRow, opts?: { auto?: boolean }) => {
    const url = job.public_url || job.result_url;
    if (!url) return false;
    const name =
      job.prompt?.slice(0, 40) ||
      `${job.engine} export`;
    const ok = await spawnGlbInEngine(engineRef.current, { url, name });
    if (ok) {
      setLinkedCadJobId(job.id);
      if (job.r2_key && !String(job.r2_key).startsWith('b64:')) {
        setLinkedGlbR2Key(job.r2_key);
      }
      lastSpawnedJobRef.current = job.id;
      if (opts?.auto) {
        console.info('[DesignStudio] auto-spawned GLB from job', job.id);
      }
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
      .catch((e) => console.warn('[Asset Library] user assets fetch failed', e));
  }, []);

  useEffect(() => {
    refreshSceneList();
    refreshUserAssets();
  }, [refreshSceneList, refreshUserAssets]);

  useEffect(() => {
    setStudioContext({
      activeProject,
      sceneId: currentSceneId,
      blueprintId: cad.activeBlueprintId,
      cadJobId: cad.activeJobId || linkedCadJobId,
      sessionId: chatSessionId,
    });
  }, [
    activeProject,
    currentSceneId,
    cad.activeBlueprintId,
    cad.activeJobId,
    linkedCadJobId,
    chatSessionId,
    setStudioContext,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || engineRef.current) return;

    let cancelled = false;
    let engine: VoxelEngineInstance | null = null;
    const initialProject = readStoredDesignStudioProject();

    void import('../services/VoxelEngine').then(({ VoxelEngine }) => {
      if (cancelled || !containerRef.current || engineRef.current) return;
      engine = new VoxelEngine(container, (s) => setAppState(s), (c) => setVoxelCount(c));
      engineRef.current = engine;
      engine.setOnEntityCreated((entity) => {
        setUndoStack((prev) => [...prev, entity]);
        setRedoStack([]);
      });
      engine.updateLighting(sceneConfig);
      engine.setCADPlane(genConfig.cadPlane);
      engine.setExtrusion(genConfig.extrusion);
      engine.setProjectType(initialProject);
      engine.setOnChessMove((from, to) => {
        const ws = chessWsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'move', from, to }));
      });

      const settleViewport = () => engine?.handleResize();
      requestAnimationFrame(() => {
        settleViewport();
        requestAnimationFrame(settleViewport);
      });

      setEngineReady(true);
    });

    const handleResize = () => engineRef.current?.handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      chessWsRef.current?.close();
      chessWsRef.current = null;
      setEngineReady(false);
      engine?.cleanup();
      engineRef.current = null;
    };
  }, []);

  const handleStartMultiplayer = useCallback(async () => {
    if (!engineRef.current || multiplayerBusy) return;
    setMultiplayerBusy(true);
    try {
      chessWsRef.current?.close();
      chessWsRef.current = null;

      const res = await fetch('/api/games/rooms', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: string }).error === 'string'
            ? (data as { error: string }).error
            : 'Failed to create room',
        );
      }
      const roomId = String((data as { roomId?: string }).roomId || '').trim();
      if (!roomId) throw new Error('Room id missing');

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/api/games/ws/${roomId}`);
      chessWsRef.current = ws;
      setMultiplayerRoomId(roomId);

      ws.onmessage = (ev) => {
        let msg: {
          type?: string;
          fen?: string;
          from?: string;
          to?: string;
          color?: string;
          message?: string;
        };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const eng = engineRef.current;
        if (!eng) return;
        if (msg.type === 'state' || msg.type === 'joined') {
          if (msg.color) setMultiplayerColor(msg.color);
          if (msg.fen) void eng.syncBoardFromFen(msg.fen);
        } else if (msg.type === 'move' && msg.from && msg.to) {
          eng.movePiece(msg.from, msg.to);
        } else if (msg.type === 'error' && msg.message) {
          console.warn('[Chess multiplayer]', msg.message);
        }
      };

      ws.onclose = () => {
        if (chessWsRef.current === ws) chessWsRef.current = null;
      };
    } catch (e) {
      console.warn('[Chess multiplayer] start failed', e);
      setMultiplayerRoomId(null);
      setMultiplayerColor(null);
    } finally {
      setMultiplayerBusy(false);
    }
  }, [multiplayerBusy]);

  useEffect(() => {
    engineRef.current?.updateLighting(sceneConfig);
  }, [sceneConfig]);

  useEffect(() => {
    if ((location.state as PendingGlbState | null)?.pendingGlb) {
      pendingConsumedRef.current = false;
    }
  }, [location.state]);

  useEffect(() => {
    if (!engineReady || !engineRef.current || pendingConsumedRef.current) return;
    const st = (location.state as PendingGlbState | null)?.pendingGlb;
    if (!st?.url) return;
    pendingConsumedRef.current = true;
    void spawnGlbInEngine(engineRef.current, { url: st.url, name: st.name || 'Imported' });
    navigate(location.pathname, { replace: true, state: {} });
  }, [engineReady, location.state, location.pathname, navigate]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    engineRef.current?.removeEntity(last.id);
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, last]);
  }, [undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    engineRef.current?.spawnEntity(next);
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, next]);
  }, [redoStack]);

  const handleUpdateGenConfig = useCallback((cfg: Partial<GenerationConfig>) => {
    setGenConfig((prev) => {
      const next = { ...prev, ...cfg };
      if (cfg.cadTool !== undefined) engineRef.current?.setCADTool(cfg.cadTool);
      if (cfg.cadPlane !== undefined) engineRef.current?.setCADPlane(cfg.cadPlane);
      if (cfg.extrusion !== undefined) engineRef.current?.setExtrusion(cfg.extrusion);
      return next;
    });
  }, []);

  const handleProjectSwitch = useCallback((type: ProjectType) => {
    setActiveProject(type);
    engineRef.current?.setProjectType(type);
    setGenConfig((prev) => ({ ...prev, cadTool: CADTool.NONE }));
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const handleSpawnModel = useCallback((name: string, url: string, scale: number) => {
    const normalized = normalizeGlbUrl(url);
    if (!normalized) {
      console.warn('[DesignStudio] spawn skipped: empty GLB url', name);
      return;
    }
    void engineRef.current
      ?.spawnEntity({
        id: `asset_${Date.now()}`,
        name,
        type: 'prop',
        modelUrl: normalized,
        scale,
        position: { x: 0, y: 0, z: 0 },
        behavior: { type: 'static' },
      })
      .catch((err) => console.warn('[DesignStudio] spawn failed', name, normalized, err));
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
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
      const files = Array.from(e.dataTransfer.files);
      const glb = files.find((f) => f.name.toLowerCase().endsWith('.glb'));
      if (glb) {
        const url = URL.createObjectURL(glb);
        handleSpawnModel(glb.name, url, 1);
      }
    },
    [handleSpawnModel],
  );

  const onClear = useCallback(() => {
    engineRef.current?.clearWorld();
    if (activeProject === ProjectType.CHESS) {
      engineRef.current?.setProjectType(ProjectType.CHESS);
    }
    setUndoStack([]);
    setRedoStack([]);
  }, [activeProject]);

  const handleSaveScene = useCallback(async () => {
    if (!engineRef.current) return;
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
          project_type: activeProject,
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
    activeProject,
    sceneName,
    refreshSceneList,
    cad,
    linkedCadJobId,
    linkedGlbR2Key,
    voxelCount,
    genConfig.style,
    currentSceneId,
  ]);

  const handleLoadScene = useCallback(
    async (sceneId: string) => {
      if (!engineRef.current) return;
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
          const scene = (meta as { scene?: SavedSceneRow & { project_type?: string } }).scene;
          if (scene?.cad_job_id) setLinkedCadJobId(String(scene.cad_job_id));
          if (scene?.glb_r2_key) setLinkedGlbR2Key(String(scene.glb_r2_key));
          if (scene?.name) setSceneName(scene.name);
          if (scene?.project_type && Object.values(ProjectType).includes(scene.project_type as ProjectType)) {
            handleProjectSwitch(scene.project_type as ProjectType);
          }
        }
        setUndoStack([]);
        setRedoStack([]);
      } catch (e) {
        console.warn('[DesignStudio] load scene failed', e);
      } finally {
        setSceneBusy(false);
      }
    },
    [handleProjectSwitch],
  );

  useEffect(() => {
    if (!engineReady || !engineRef.current) return;
    const tick = window.setInterval(() => {
      const entities = engineRef.current?.exportEntities();
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
          project_type: activeProject,
          entities,
          ...(wsId && wsId !== 'global' ? { workspace_id: wsId } : {}),
        }),
      }).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(tick);
  }, [engineReady, activeProject]);

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

  return (
    <div
      className="flex h-full min-h-0 bg-[var(--bg-app)] overflow-hidden"
      onDrop={handleFileDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <DesignStudioLeftPanel
        activeProject={activeProject}
        onSwitchProject={handleProjectSwitch}
        onExport={() => engineRef.current?.exportForBlender()}
        genConfig={genConfig}
        onUpdateGenConfig={handleUpdateGenConfig}
        sceneConfig={sceneConfig}
        onUpdateSceneConfig={(cfg) => setSceneConfig((prev) => ({ ...prev, ...cfg }))}
        onSpawnModel={handleSpawnModel}
        customAssets={customAssets}
        onAddCustomAsset={handleAddCustomAsset}
        onRemoveCustomAsset={handleRemoveCustomAsset}
        sceneName={sceneName}
        onSceneNameChange={setSceneName}
        savedScenes={savedScenes}
        sceneBusy={sceneBusy}
        onSaveScene={() => void handleSaveScene()}
        onLoadScene={(id) => void handleLoadScene(id)}
        cad={cad}
        cadJobId={linkedCadJobId}
        glbR2Key={linkedGlbR2Key}
        onRefreshUserAssets={refreshUserAssets}
        onDeployJob={(job) => void deployJobToScene(job)}
        onImportGlb={handleImportGlbFile}
        onDownloadLatestGlb={handleDownloadLatestGlb}
      />

      <div className="flex-1 min-w-0 min-h-0 relative">
        <div
          ref={containerRef}
          className="absolute inset-0 z-0 overflow-hidden"
          style={{ background: 'var(--scene-bg)' }}
        />

        {activeProject === ProjectType.CHESS && (
          <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => void handleStartMultiplayer()}
              disabled={multiplayerBusy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--solar-violet)]/90 hover:opacity-90 disabled:opacity-40 text-white text-[10px] font-black uppercase tracking-widest shadow-lg"
            >
              <Users size={14} />
              {multiplayerBusy ? 'Connecting…' : 'Multiplayer'}
            </button>
            {multiplayerRoomId && (
              <div className="px-3 py-1.5 rounded-lg bg-[var(--bg-panel)]/90 border border-[var(--border-subtle)] text-[9px] font-mono text-[var(--text-muted)]">
                {multiplayerRoomId}
                {multiplayerColor ? ` · ${multiplayerColor}` : ''}
              </div>
            )}
          </div>
        )}

        <UIOverlay
          voxelCount={voxelCount}
          appState={appState}
          activeProject={activeProject}
          isGenerating={cad.isGenerating}
          onTogglePlay={() => {}}
          onClear={onClear}
          genConfig={genConfig}
          onUpdateGenConfig={handleUpdateGenConfig}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
        />

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex justify-center w-full max-w-[90vw]">
          <div className="pointer-events-auto">
            <ToolLauncherBar
              activeProject={activeProject}
              onImportGlb={handleImportGlbFile}
              onMeshyGenerate={
                activeProject === ProjectType.CAD
                  ? (prompt) => cad.runMeshyGenerate(prompt)
                  : undefined
              }
              latestGlbUrl={activeProject === ProjectType.CAD ? activeJobForBar?.public_url : undefined}
              onDownloadGlb={activeProject === ProjectType.CAD ? handleDownloadLatestGlb : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
