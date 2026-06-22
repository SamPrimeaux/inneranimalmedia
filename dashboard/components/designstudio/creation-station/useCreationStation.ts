import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchMeshyBalance } from '../api';
import type { useDesignStudioCad } from '../hooks/useDesignStudioCad';
import {
  DEFAULT_MESHY_SETTINGS,
  buildMeshyPreviewBody,
  buildMeshyRefineBody,
  buildCurl,
  estimatePreviewCost,
  estimateRefineCost,
  type MeshyPhase,
  type MeshySettings,
} from './meshyTypes';
import { appendStudioTerminalOutput, openStudioTerminal } from '../studioTerminalOutput';

import type { MeshyRailTool } from './meshyToolkitTypes';
import { readStoredMeshyRail } from './meshyToolkitTypes';

export type CreationTool = MeshyRailTool;

export type LogLine = { ts: number; level: 'info' | 'warn' | 'error' | 'ok'; text: string };

type CadHook = ReturnType<typeof useDesignStudioCad>;

export function useCreationStation(cad: CadHook) {
  const [activeTool, setActiveTool] = useState<CreationTool>(readStoredMeshyRail);
  const [panelOpen, setPanelOpen] = useState(true);
  const [apiOpen, setApiOpen] = useState(true);
  const [meshyPhase, setMeshyPhase] = useState<MeshyPhase>('preview');
  const [settings, setSettings] = useState<MeshySettings>(DEFAULT_MESHY_SETTINGS);
  const [lastRequest, setLastRequest] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [meshyStub, setMeshyStub] = useState(cad.meshyStub);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  // image-to-3d
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  // animate / rigging
  const [rigTaskId, setRigTaskId] = useState('');
  const [rigAnimation, setRigAnimation] = useState('walking');

  const appendLog = useCallback(
    (text: string, level: LogLine['level'] = 'info', opts?: { open?: boolean }) => {
      appendStudioTerminalOutput(text, level, { open: opts?.open, tab: 'output' });
    },
    [],
  );

  const refreshBalance = useCallback(async () => {
    try {
      const data = await fetchMeshyBalance();
      setMeshyStub(!!data.stub);
      setBalance(data.stub ? null : data.balance ?? null);
    } catch (e) {
      appendLog(e instanceof Error ? e.message : 'Balance fetch failed', 'warn');
    }
  }, [appendLog]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const lastLoggedStatusRef = useRef<string>('');

  useEffect(() => {
    const job = cad.polledJob;
    if (!job) return;
    const key = `${job.id}:${job.status}:${job.progress_pct ?? ''}`;
    if (lastLoggedStatusRef.current === key) return;
    lastLoggedStatusRef.current = key;
    const pct = job.progress_pct != null ? ` ${job.progress_pct}%` : '';
    appendLog(`Job ${job.id} → ${job.status}${pct}`, job.status === 'failed' ? 'error' : 'info');
    if (job.status === 'done' && job.public_url) {
      appendLog(`GLB ready: ${job.public_url}`, 'ok');
    }
    if (job.error) appendLog(String(job.error), 'error');
  }, [cad.polledJob, appendLog]);

  useEffect(() => {
    if (cad.error) appendLog(cad.error, 'error');
  }, [cad.error, appendLog]);

  const patchSettings = useCallback((patch: Partial<MeshySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const previewCost = useMemo(() => estimatePreviewCost(settings), [settings]);
  const refineCost = estimateRefineCost();
  const ctaCost = meshyPhase === 'preview' ? previewCost : refineCost;

  // ── text-to-3d ─────────────────────────────────────────────────────────────

  const runPreview = useCallback(async () => {
    const body = buildMeshyPreviewBody(settings);
    if (!body.prompt) {
      appendLog('Enter a prompt first', 'warn');
      return;
    }
    const path = '/api/cad/meshy/text-to-3d/preview';
    setLastRequest(buildCurl('POST', path, body));
    appendLog('Creating Meshy preview…', 'info', { open: true });
    try {
      const result = await cad.runMeshyPreview(body);
      const resJson = JSON.stringify(result, null, 2);
      setLastResponse(resJson);
      if (result.task_id) {
        patchSettings({ preview_task_id: result.task_id });
        appendLog(`Preview task ${result.task_id}`, 'ok');
      }
      void refreshBalance();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastResponse(JSON.stringify({ error: msg }, null, 2));
      appendLog(msg, 'error');
    }
  }, [settings, cad, appendLog, patchSettings, refreshBalance]);

  const runRefine = useCallback(async () => {
    const body = buildMeshyRefineBody(settings);
    if (!body.preview_task_id) {
      appendLog('Preview task ID required — run Preview first', 'warn');
      return;
    }
    const path = '/api/cad/meshy/text-to-3d/refine';
    setLastRequest(buildCurl('POST', path, body));
    appendLog('Starting Meshy refine…', 'info', { open: true });
    try {
      const result = await cad.runMeshyRefine(body);
      setLastResponse(JSON.stringify(result, null, 2));
      appendLog(`Refine job ${result.job_id}`, 'ok');
      void refreshBalance();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastResponse(JSON.stringify({ error: msg }, null, 2));
      appendLog(msg, 'error');
    }
  }, [settings, cad, appendLog, refreshBalance]);

  const runQuickGenerate = useCallback(async () => {
    const prompt = settings.prompt.trim();
    if (!prompt) {
      appendLog('Enter a prompt first', 'warn');
      return;
    }
    const body = {
      prompt,
      ...buildMeshyPreviewBody(settings),
      auto_refine: true,
    };
    const path = '/api/cad/meshy/generate';
    setLastRequest(buildCurl('POST', path, body));
    appendLog('Quick generate (preview + refine)…', 'info', { open: true });
    try {
      const result = await cad.runMeshyGenerate(prompt, body);
      setLastResponse(JSON.stringify(result, null, 2));
      void refreshBalance();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastResponse(JSON.stringify({ error: msg }, null, 2));
      appendLog(msg, 'error');
    }
  }, [settings, cad, appendLog, refreshBalance]);

  // ── image-to-3d ────────────────────────────────────────────────────────────

  const setImageFileWithPreview = useCallback((file: File | null) => {
    setImageFile(file);
    if (!file) { setImageDataUrl(null); return; }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const runImageTo3D = useCallback(async () => {
    if (!imageDataUrl) {
      appendLog('Upload an image first', 'warn');
      return;
    }
    const path = '/api/cad/meshy/generate';
    const body = { mode: 'image', image_url: imageDataUrl, topology: 'triangle', should_texture: true };
    setLastRequest(buildCurl('POST', path, body));
    appendLog('Submitting image-to-3D…', 'info', { open: true });
    try {
      const result = await cad.runMeshyGenerate('image-to-3d', body);
      setLastResponse(JSON.stringify(result, null, 2));
      appendLog(`Image-to-3D job ${result?.job_id ?? 'queued'}`, 'ok');
      void refreshBalance();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastResponse(JSON.stringify({ error: msg }, null, 2));
      appendLog(msg, 'error');
    }
  }, [imageDataUrl, cad, appendLog, refreshBalance]);

  // ── animate / rigging ──────────────────────────────────────────────────────

  const runRig = useCallback(async () => {
    const taskId = rigTaskId.trim();
    if (!taskId) {
      appendLog('Paste a source model task ID first', 'warn');
      return;
    }
    const path = '/api/cad/meshy/rigging';
    const body = { input_task_id: taskId, height_meters: 1.7 };
    setLastRequest(buildCurl('POST', path, body));
    appendLog(`Submitting rigging job (clip: ${rigAnimation})…`, 'info', { open: true });
    try {
      const result = await cad.runMeshyRigging(body);
      setLastResponse(JSON.stringify(result, null, 2));
      appendLog(`Rigging job ${result?.job_id ?? 'queued'}`, 'ok');
      void refreshBalance();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastResponse(JSON.stringify({ error: msg }, null, 2));
      appendLog(msg, 'error');
    }
  }, [rigTaskId, rigAnimation, cad, appendLog, refreshBalance]);

  // ── api key ────────────────────────────────────────────────────────────────

  const saveMeshyApiKey = useCallback(async () => {
    const key = apiKeyDraft.trim();
    if (!key) return;
    setSavingKey(true);
    try {
      const res = await fetch('/api/settings/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'meshy',
          label: 'Meshy',
          key_name: 'Meshy',
          secret: key,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Save failed');
      appendLog('Meshy API key saved to vault', 'ok');
      setApiKeyDraft('');
    } catch (e) {
      appendLog(e instanceof Error ? e.message : 'Key save failed', 'error');
    } finally {
      setSavingKey(false);
    }
  }, [apiKeyDraft, appendLog]);

  const openTerminal = useCallback((cmd?: string) => {
    openStudioTerminal({ tab: cmd ? 'terminal' : 'output' });
    if (cmd) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('iam-run-command', { detail: { cmd } }));
      });
    }
  }, []);

  return {
    activeTool,
    setActiveTool,
    panelOpen,
    setPanelOpen,
    apiOpen,
    setApiOpen,
    meshyPhase,
    setMeshyPhase,
    settings,
    patchSettings,
    appendLog,
    lastRequest,
    lastResponse,
    balance,
    meshyStub,
    apiKeyDraft,
    setApiKeyDraft,
    savingKey,
    saveMeshyApiKey,
    previewCost,
    refineCost,
    ctaCost,
    runPreview,
    runRefine,
    runQuickGenerate,
    // image-to-3d
    imageFile,
    imageDataUrl,
    setImageFile: setImageFileWithPreview,
    runImageTo3D,
    // animate
    rigTaskId,
    setRigTaskId,
    rigAnimation,
    setRigAnimation,
    runRig,
    openTerminal,
    refreshBalance,
    isGenerating: cad.isGenerating,
  };
}
