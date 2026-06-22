import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBlueprint,
  executeCadJob,
  fetchBlueprints,
  fetchCadJobs,
  generateMeshy,
  meshyRigging,
  generateOpenScad,
  meshyTextTo3dPreview,
  meshyTextTo3dRefine,
  patchBlueprint,
  type BlueprintRow,
  type CadJobRow,
} from '../api';
import { useCadJobPoll } from './useCadJobPoll';

export type UseDesignStudioCadOpts = {
  sessionId?: string | null;
  sceneId?: string | null;
  onJobDone?: (job: CadJobRow) => void;
  onBlueprintsChange?: () => void;
};

export function useDesignStudioCad(opts: UseDesignStudioCadOpts = {}) {
  const [blueprints, setBlueprints] = useState<BlueprintRow[]>([]);
  const [jobs, setJobs] = useState<CadJobRow[]>([]);
  const [activeBlueprintId, setActiveBlueprintId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meshyStub, setMeshyStub] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  const activeBlueprint = blueprints.find((b) => String(b.id) === activeBlueprintId) ?? null;
  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;

  const refreshBlueprints = useCallback(async () => {
    try {
      const rows = await fetchBlueprints(50);
      setBlueprints(rows);
    } catch (e) {
      console.warn('[useDesignStudioCad] blueprints', e);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const rows = await fetchCadJobs(20);
      setJobs(rows);
    } catch (e) {
      console.warn('[useDesignStudioCad] jobs', e);
    }
  }, []);

  useEffect(() => {
    void refreshBlueprints();
    void refreshJobs();
  }, [refreshBlueprints, refreshJobs]);

  const scopeBody = useCallback(
    () => ({
      session_id: opts.sessionId || undefined,
      scene_snapshot_id: opts.sceneId || undefined,
      blueprint_id: activeBlueprintId || undefined,
    }),
    [opts.sessionId, opts.sceneId, activeBlueprintId],
  );

  const handleJobDone = useCallback(
    (job: CadJobRow) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...job };
          return next;
        }
        return [job, ...prev];
      });
      void refreshJobs();
      opts.onJobDone?.(job);
    },
    [opts, refreshJobs],
  );

  const { job: polledJob, polling } = useCadJobPoll(activeJobId, {
    enabled: !!activeJobId,
    engine: activeJob?.engine,
    onDone: handleJobDone,
    onFailed: handleJobDone,
  });

  const isGenerating =
    busy ||
    polling ||
    (polledJob != null &&
      !['done', 'failed', 'script_ready', 'cancelled'].includes(
        String(polledJob.status || '').toLowerCase(),
      ));

  const createNewBlueprint = useCallback(
    async (title: string, originalPrompt?: string) => {
      setBusy(true);
      setError(null);
      try {
        const bp = await createBlueprint({
          title,
          original_prompt: originalPrompt || title,
        });
        await refreshBlueprints();
        setActiveBlueprintId(String(bp.id));
        opts.onBlueprintsChange?.();
        return bp;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [refreshBlueprints, opts],
  );

  const runOpenScadGenerate = useCallback(
    async (promptOverride?: string) => {
      const prompt =
        promptOverride?.trim() ||
        activeBlueprint?.original_prompt?.trim() ||
        activeBlueprint?.title?.trim() ||
        '';
      if (!prompt) {
        setError('Enter a prompt or select a blueprint');
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await generateOpenScad({ prompt, ...scopeBody() });
        setActiveJobId(result.job_id);
        await refreshJobs();
        if (activeBlueprintId) {
          await patchBlueprint(activeBlueprintId, { status: 'generated' }).catch(() => {});
          await refreshBlueprints();
        }
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [activeBlueprint, activeBlueprintId, scopeBody, refreshBlueprints, refreshJobs],
  );

  const runExecuteJob = useCallback(
    async (jobId?: string) => {
      const id = jobId || activeJobId;
      if (!id) return null;
      setBusy(true);
      setError(null);
      try {
        const result = await executeCadJob(id, scopeBody());
        setActiveJobId(id);
        await refreshJobs();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [activeJobId, scopeBody, refreshJobs],
  );

  const saveBlueprintScript = useCallback(
    async (script: string) => {
      if (!activeBlueprintId) return null;
      setBusy(true);
      setError(null);
      try {
        await patchBlueprint(activeBlueprintId, {
          cad_script: script,
          cad_engine: 'openscad',
        });
        await refreshBlueprints();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [activeBlueprintId, refreshBlueprints],
  );

  const runMeshyGenerate = useCallback(
    async (prompt: string, extra?: Record<string, unknown>) => {
      const mode = extra?.mode === 'image' ? 'image' : 'text';
      if (mode === 'text' && !prompt.trim()) {
        setError('Meshy prompt required');
        return null;
      }
      if (mode === 'image' && !String(extra?.image_url || '').trim()) {
        setError('image_url required for image mode');
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await generateMeshy({
          ...(mode === 'text' ? { prompt: prompt.trim() } : { prompt: prompt.trim() || 'image-to-3d' }),
          mode,
          ...scopeBody(),
          ...extra,
        });
        setActiveJobId(result.job_id);
        if (result.status === 'stub') setMeshyStub(true);
        await refreshJobs();
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes('stub') || msg.includes('MESHY')) setMeshyStub(true);
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [scopeBody, refreshJobs],
  );

  const runMeshyRigging = useCallback(
    async (body: {
      input_task_id?: string;
      model_task_id?: string;
      model_url?: string;
      height_meters?: number;
    }) => {
      const inputTaskId = String(body.input_task_id || body.model_task_id || '').trim();
      if (!inputTaskId && !String(body.model_url || '').trim()) {
        setError('input_task_id or model_url required');
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await meshyRigging({ ...body, ...scopeBody() });
        setActiveJobId(result.job_id);
        await refreshJobs();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [scopeBody, refreshJobs],
  );

  const runMeshyPreview = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const result = await meshyTextTo3dPreview({ ...scopeBody(), ...body });
        setActiveJobId(result.job_id);
        await refreshJobs();
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [scopeBody, refreshJobs],
  );

  const runMeshyRefine = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const result = await meshyTextTo3dRefine({ ...scopeBody(), ...body });
        setActiveJobId(result.job_id);
        await refreshJobs();
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [scopeBody, refreshJobs],
  );

  const subscribeRunEvents = useCallback(
    (runId: string, sessionId: string) => {
      sseRef.current?.close();
      const url = `/api/designstudio/runs/${encodeURIComponent(runId)}/events?session_id=${encodeURIComponent(sessionId)}`;
      const es = new EventSource(url, { withCredentials: true });
      sseRef.current = es;
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          const envelope = payload?.envelope ?? payload;
          if (envelope?.type === 'cad_glb_ready') {
            const jobId = envelope.job_id ? String(envelope.job_id) : null;
            const publicUrl = envelope.public_url || envelope.url;
            if (jobId) setActiveJobId(jobId);
            handleJobDone({
              id: jobId || `sse_${Date.now()}`,
              engine: envelope.engine || 'cad',
              status: 'done',
              public_url: publicUrl,
            });
          }
        } catch {
          /* ignore malformed SSE */
        }
      };
      es.onerror = () => {
        es.close();
        if (sseRef.current === es) sseRef.current = null;
      };
    },
    [handleJobDone],
  );

  useEffect(() => () => sseRef.current?.close(), []);

  return {
    blueprints,
    jobs,
    activeBlueprint,
    activeBlueprintId,
    setActiveBlueprintId,
    activeJob,
    activeJobId,
    setActiveJobId,
    polledJob,
    busy,
    error,
    meshyStub,
    isGenerating,
    refreshBlueprints,
    refreshJobs,
    createNewBlueprint,
    runOpenScadGenerate,
    runExecuteJob,
    saveBlueprintScript,
    runMeshyGenerate,
    runMeshyRigging,
    runMeshyPreview,
    runMeshyRefine,
    subscribeRunEvents,
  };
}
