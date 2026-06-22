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

export type CreationTool = 'text-to-3d' | 'import' | 'blender' | 'scene';

export type LogLine = { ts: number; level: 'info' | 'warn' | 'error' | 'ok'; text: string };

type CadHook = ReturnType<typeof useDesignStudioCad>;

export function useCreationStation(cad: CadHook) {
  const [activeTool, setActiveTool] = useState<CreationTool>('text-to-3d');
  const [panelOpen, setPanelOpen] = useState(true);
  const [apiOpen, setApiOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [meshyPhase, setMeshyPhase] = useState<MeshyPhase>('preview');
  const [settings, setSettings] = useState<MeshySettings>(DEFAULT_MESHY_SETTINGS);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [lastRequest, setLastRequest] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [meshyStub, setMeshyStub] = useState(cad.meshyStub);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const appendLog = useCallback((text: string, level: LogLine['level'] = 'info') => {
    setLogs((prev) => [...prev.slice(-199), { ts: Date.now(), level, text }]);
  }, []);

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

  const runPreview = useCallback(async () => {
    const body = buildMeshyPreviewBody(settings);
    if (!body.prompt) {
      appendLog('Enter a prompt first', 'warn');
      return;
    }
    const path = '/api/cad/meshy/text-to-3d/preview';
    setLastRequest(buildCurl('POST', path, body));
    appendLog('Creating Meshy preview…', 'info');
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
    appendLog('Starting Meshy refine…', 'info');
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
    appendLog('Quick generate (preview + refine)…', 'info');
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

  const openTerminal = useCallback(
    (cmd?: string) => {
      window.dispatchEvent(new CustomEvent('iam:open-terminal'));
      if (cmd) {
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('iam-run-command', { detail: { cmd } }));
        });
      }
      appendLog(cmd ? `Terminal → ${cmd}` : 'Terminal opened', 'info');
    },
    [appendLog],
  );

  return {
    activeTool,
    setActiveTool,
    panelOpen,
    setPanelOpen,
    apiOpen,
    setApiOpen,
    logOpen,
    setLogOpen,
    meshyPhase,
    setMeshyPhase,
    settings,
    patchSettings,
    logs,
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
    openTerminal,
    refreshBalance,
    isGenerating: cad.isGenerating,
  };
}
