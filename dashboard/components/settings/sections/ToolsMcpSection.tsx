import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { editor } from 'monaco-editor';
import type { Monaco } from 'monaco-editor';
import { Box, X, Save } from 'lucide-react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { McpMonacoHost } from '../mcp/McpMonacoHost';
import { McpServerCard, type McpHealthUi } from '../components/McpServerCard';
import { McpToolRow } from '../components/McpToolRow';
import { resolveMonacoTheme } from '../../MonacoSurface';

export type ToolsMcpSectionProps = {
  data: SettingsPanelModel;
  activeSection: string;
};

type EditorPanel =
  | null
  | { serverId: string; mode: 'config' }
  | { serverId: string; mode: 'tool'; toolName: string };

type DocEntry = { value: string; dirty: boolean };

type HealthEntry = { status: string; latency_ms?: number | null; checked_at?: string | null };

function parseMeta(metadata: unknown): Record<string, unknown> {
  if (metadata == null) return {};
  if (typeof metadata === 'object' && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
  if (typeof metadata === 'string') {
    try {
      const o = JSON.parse(metadata) as unknown;
      return typeof o === 'object' && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function serverConfigFromRow(s: Record<string, unknown>): Record<string, unknown> {
  const meta = parseMeta(s.metadata);
  const saved = meta.dashboard_mcp_config;
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved as Record<string, unknown>;
  return {
    url: String(s.endpoint_url || ''),
    headers: {},
  };
}

function normalizePollStatus(h: string): string {
  const x = h.toLowerCase();
  if (x === 'healthy' || x === 'configured' || x === 'unverified') return x === 'healthy' ? 'healthy' : x;
  if (x === 'unreachable' || x === 'unhealthy' || x === 'degraded') return x === 'unreachable' ? 'unreachable' : 'unhealthy';
  return x || 'unknown';
}

export function ToolsMcpSection({ data, activeSection }: ToolsMcpSectionProps) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<EditorPanel>(null);
  const [docMap, setDocMap] = useState<Record<string, DocEntry>>({});
  const [health, setHealth] = useState<Record<string, HealthEntry>>({});
  const [healthPollError, setHealthPollError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [toolsByServer, setToolsByServer] = useState<Record<string, Array<{ name: string }>>>({});
  const [toolsLoading, setToolsLoading] = useState<Record<string, boolean>>({});
  const [toolsShowAll, setToolsShowAll] = useState<Record<string, boolean>>({});
  const [toolsRefreshBusy, setToolsRefreshBusy] = useState<Record<string, boolean>>({});

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const modelByUri = useRef<Record<string, editor.ITextModel>>({});
  const editorCtxRef = useRef<{ serverId: string | null; mode: 'config' | 'tool' }>({
    serverId: null,
    mode: 'config',
  });
  const panelRef = useRef<EditorPanel>(null);
  panelRef.current = panel;
  const docMapRef = useRef(docMap);
  docMapRef.current = docMap;

  const disposeAllModels = useCallback(() => {
    for (const m of Object.values(modelByUri.current)) {
      try {
        m.dispose();
      } catch {
        /* ignore */
      }
    }
    modelByUri.current = {};
  }, []);

  useEffect(() => {
    return () => {
      disposeAllModels();
    };
  }, [disposeAllModels]);

  const servers = Array.isArray(data.settingsMcp?.servers) ? data.settingsMcp!.servers : [];
  const serversRef = useRef(servers);
  serversRef.current = servers;

  const fetchToolsRegistry = useCallback(async (serverId: string) => {
    setToolsLoading((p) => ({ ...p, [serverId]: true }));
    try {
      const r = await fetch(`/api/settings/mcp/servers/${encodeURIComponent(serverId)}/tools`, {
        credentials: 'same-origin',
      });
      const j = (await r.json().catch(() => ({}))) as { tools?: Array<{ name?: string }> };
      const list = Array.isArray(j.tools) ? j.tools.map((t) => ({ name: String(t.name || '') })) : [];
      setToolsByServer((p) => ({ ...p, [serverId]: list }));
    } catch {
      setToolsByServer((p) => ({ ...p, [serverId]: [] }));
    } finally {
      setToolsLoading((p) => ({ ...p, [serverId]: false }));
    }
  }, []);

  const refreshToolsLive = useCallback(async (serverId: string) => {
    setToolsRefreshBusy((p) => ({ ...p, [serverId]: true }));
    try {
      const r = await fetch(`/api/settings/mcp/servers/${encodeURIComponent(serverId)}/tools/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const j = (await r.json().catch(() => ({}))) as { tools?: Array<{ name?: string }> };
      if (Array.isArray(j.tools) && j.tools.length) {
        setToolsByServer((p) => ({
          ...p,
          [serverId]: j.tools.map((t) => ({ name: String(t.name || '') })),
        }));
      } else {
        await fetchToolsRegistry(serverId);
      }
    } catch {
      await fetchToolsRegistry(serverId);
    } finally {
      setToolsRefreshBusy((p) => ({ ...p, [serverId]: false }));
    }
  }, [fetchToolsRegistry]);

  useEffect(() => {
    if (activeSection !== 'Tools & MCP') return;

    const tick = async () => {
      try {
        const res = await fetch('/api/settings/mcp/status', { credentials: 'same-origin' });
        const j = (await res.json().catch(() => ({}))) as {
          servers?: Array<{ id?: string; health_status?: string; last_check_at?: string; latency_ms?: number | null }>;
        };
        setHealthPollError(null);
        if (!Array.isArray(j.servers)) return;
        setHealth((prev) => {
          const next = { ...prev };
          for (const s of j.servers) {
            const id = String(s.id || '');
            if (!id) continue;
            const st = normalizePollStatus(String(s.health_status || 'unknown'));
            next[id] = {
              status: st === 'healthy' ? 'healthy' : st === 'unreachable' ? 'unreachable' : st,
              latency_ms: s.latency_ms ?? null,
              checked_at: s.last_check_at ?? null,
            };
          }
          return next;
        });
      } catch {
        setHealthPollError('Health poll failed');
      }
    };

    void tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, [activeSection]);

  const pingServer = useCallback(async (serverId: string) => {
    setHealth((prev) => ({
      ...prev,
      [serverId]: { ...prev[serverId], status: 'checking', checked_at: new Date().toISOString() },
    }));
    try {
      const res = await fetch(`/api/settings/mcp/servers/${encodeURIComponent(serverId)}/ping`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const d = (await res.json().catch(() => ({}))) as { status?: string; latency_ms?: number | null };
      const st = d.status === 'healthy' ? 'healthy' : 'unreachable';
      setHealth((prev) => ({
        ...prev,
        [serverId]: {
          ...prev[serverId],
          status: st,
          latency_ms: d.latency_ms ?? prev[serverId]?.latency_ms ?? null,
          checked_at: new Date().toISOString(),
        },
      }));
    } catch {
      setHealth((prev) => ({
        ...prev,
        [serverId]: {
          ...prev[serverId],
          status: 'unreachable',
          checked_at: new Date().toISOString(),
        },
      }));
    }
  }, []);

  const applyPanelToEditor = useCallback((next: EditorPanel, monaco: Monaco, ed: editor.IStandaloneCodeEditor) => {
      if (!next) return;
      const theme = resolveMonacoTheme();
      monaco.editor.setTheme(theme);

      if (next.mode === 'config') {
        ed.updateOptions({ readOnly: false });
        editorCtxRef.current = { serverId: next.serverId, mode: 'config' };
        const row = serversRef.current.find((s) => String(s.id) === next.serverId) as
          | Record<string, unknown>
          | undefined;
        const uri = monaco.Uri.parse(`mcp://servers/${next.serverId}/config.json`);
        const uriKey = uri.toString();
        let model = modelByUri.current[uriKey];
        if (!model) {
          const cfg = row ? serverConfigFromRow(row) : {};
          const fromDoc = docMapRef.current[next.serverId]?.value;
          const value =
            fromDoc ??
            JSON.stringify(cfg && Object.keys(cfg).length ? cfg : { url: '', headers: {} }, null, 2);
          model = monaco.editor.createModel(value, 'json', uri);
          modelByUri.current[uriKey] = model;
        }
        ed.setModel(model);
        ed.focus();
        return;
      }

      ed.updateOptions({ readOnly: true });
      editorCtxRef.current = { serverId: next.serverId, mode: 'tool' };
      const uri = monaco.Uri.parse(`mcp://servers/${next.serverId}/tools/${next.toolName}.json`);
      const uriKey = uri.toString();
      let model = modelByUri.current[uriKey];
      if (!model) {
        const payload = {
          name: next.toolName,
          description: '',
          inputSchema: {} as Record<string, unknown>,
        };
        model = monaco.editor.createModel(JSON.stringify(payload, null, 2), 'json', uri);
        modelByUri.current[uriKey] = model;
      }
      ed.setModel(model);
      ed.focus();

      void (async () => {
        try {
          const r = await fetch(`/api/settings/mcp/servers/${encodeURIComponent(next.serverId)}/tools`, {
            credentials: 'same-origin',
          });
          const j = (await r.json().catch(() => ({}))) as {
            tools?: Array<{ name?: string; description?: string; inputSchema?: unknown }>;
          };
          const t = Array.isArray(j.tools) ? j.tools.find((x) => String(x.name) === next.toolName) : null;
          const body = {
            name: next.toolName,
            description: t?.description != null ? String(t.description) : '',
            inputSchema:
              t?.inputSchema && typeof t.inputSchema === 'object'
                ? t.inputSchema
                : t?.inputSchema != null
                  ? t.inputSchema
                  : {},
          };
          const text = JSON.stringify(body, null, 2);
          const m = modelByUri.current[uriKey];
          if (m && ed.getModel() === m) {
            m.setValue(text);
          }
        } catch {
          /* keep placeholder */
        }
      })();
    }, []);

  const openConfigInMonaco = useCallback(
    (serverId: string) => {
      setSaveError(null);
      setPanel({ serverId, mode: 'config' });
      queueMicrotask(() => {
        const ed = editorRef.current;
        const monaco = monacoRef.current;
        if (!ed || !monaco) return;
        applyPanelToEditor({ serverId, mode: 'config' }, monaco, ed);
      });
    },
    [applyPanelToEditor],
  );

  const openToolInMonaco = useCallback(
    (serverId: string, toolName: string) => {
      setSaveError(null);
      setPanel({ serverId, mode: 'tool', toolName });
      queueMicrotask(() => {
        const ed = editorRef.current;
        const monaco = monacoRef.current;
        if (!ed || !monaco) return;
        applyPanelToEditor({ serverId, mode: 'tool', toolName }, monaco, ed);
      });
    },
    [applyPanelToEditor],
  );

  useEffect(() => {
    if (!panel) return;
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    applyPanelToEditor(panel, monaco, ed);
  }, [panel, applyPanelToEditor]);

  const onEditorReady = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = ed;
      monacoRef.current = monaco;
      ed.onDidChangeModelContent(() => {
        const ctx = editorCtxRef.current;
        if (ctx.mode !== 'config' || !ctx.serverId) return;
        const val = ed.getValue();
        setDocMap((prev) => ({
          ...prev,
          [ctx.serverId]: { value: val, dirty: true },
        }));
      });
      const p = panelRef.current;
      if (p) applyPanelToEditor(p, monaco, ed);
    },
    [applyPanelToEditor],
  );

  const saveConfig = useCallback(async () => {
    if (!panel || panel.mode !== 'config') return;
    const serverId = panel.serverId;
    const monaco = monacoRef.current;
    if (!monaco) return;
    const uriKey = monaco.Uri.parse(`mcp://servers/${serverId}/config.json`).toString();
    const model = uriKey ? modelByUri.current[uriKey] : null;
    const value = model?.getValue() ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setSaveError('Invalid JSON');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setSaveError('Config must be a JSON object');
      return;
    }
    setSaveError(null);
    try {
      const res = await fetch(`/api/settings/mcp/servers/${encodeURIComponent(serverId)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: parsed }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${res.status})`);
      }
      setDocMap((prev) => ({ ...prev, [serverId]: { value, dirty: false } }));
      void data.loadMcpSettings();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    }
  }, [panel, data]);

  const closePanel = useCallback(() => {
    setPanel(null);
    setSaveError(null);
  }, []);

  const setServerEnabled = useCallback(
    async (serverId: string, enabled: boolean) => {
      const prev = data.settingsMcp;
      if (!prev) return;
      data.setSettingsMcp({
        ...prev,
        servers: prev.servers.map((s) =>
          String(s.id) === serverId ? { ...s, is_active: enabled ? 1 : 0 } : s,
        ),
      });
      try {
        const r = await fetch(`/api/settings/mcp/servers/${encodeURIComponent(serverId)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        if (!r.ok) throw new Error('Toggle failed');
      } catch {
        void data.loadMcpSettings();
      }
    },
    [data],
  );

  const deleteServer = useCallback(
    async (serverId: string) => {
      if (!window.confirm('Remove this MCP server from the dashboard?')) return;
      try {
        const r = await fetch(`/api/settings/mcp/servers/${encodeURIComponent(serverId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!r.ok) throw new Error('Delete failed');
        if (panel?.serverId === serverId) closePanel();
        void data.loadMcpSettings();
      } catch {
        void data.loadMcpSettings();
      }
    },
    [data, panel, closePanel],
  );

  const openRegisteredToolSchema = useCallback(
    (tool: Record<string, unknown>) => {
      const toolName = String(tool?.tool_name || tool?.name || '').trim();
      const mcpUrl = String(tool?.mcp_service_url || '').trim();
      if (!toolName) return;
      const srv = serversRef.current.find(
        (s) => String((s as Record<string, unknown>).endpoint_url || '').trim() === mcpUrl,
      ) as Record<string, unknown> | undefined;
      const sid = srv?.id != null ? String(srv.id) : '';
      if (sid) {
        openToolInMonaco(sid, toolName);
      }
    },
    [openToolInMonaco],
  );

  const editorOpen = panel != null;
  const panelServerId = panel?.serverId ?? null;
  const dirtyConfig = panelServerId && panel?.mode === 'config' ? docMap[panelServerId]?.dirty : false;

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
          Tools &amp; MCP
        </h2>
        <span className="text-[10px] text-[var(--text-muted)] font-mono">
          {data.settingsMcp?.tools?.length ?? 0} tools
        </span>
      </div>

      {healthPollError ? (
        <div className="text-[11px] text-[var(--color-danger)]">{healthPollError}</div>
      ) : null}

      {!data.settingsMcp ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading MCP settings…</div>
      ) : null}

      {data.settingsMcp ? (
        <div
          className="grid min-h-[min(70vh,560px)] gap-0 rounded-xl border border-[var(--border-subtle)] overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
          style={{
            gridTemplateColumns: editorOpen ? 'minmax(0,1fr) minmax(0,480px)' : 'minmax(0,1fr) 0fr',
          }}
        >
          <div className="tools-mcp-list flex flex-col gap-3 min-w-0 p-4 overflow-y-auto custom-scrollbar border-r border-[var(--border-subtle)]">
            {servers.map((raw) => {
              const s = raw as Record<string, unknown>;
              const id = String(s.id || '');
              const name = String(s.service_name || s.name || id);
              const toolCount = Number(s.tool_count ?? 0);
              const enabled = Number(s.is_active ?? 1) !== 0;
              const hRaw = health[id];
              const dbSt = String(s.health_status || '').toLowerCase();
              const mergedStatus =
                hRaw?.status && hRaw.status !== 'unknown'
                  ? hRaw.status
                  : dbSt === 'healthy'
                    ? 'healthy'
                    : dbSt === 'unreachable' || dbSt === 'unhealthy' || dbSt === 'degraded'
                      ? 'unreachable'
                      : 'unknown';
              const h: McpHealthUi = {
                status: mergedStatus,
                latency_ms: hRaw?.latency_ms,
                checked_at: hRaw?.checked_at,
              };
              return (
                <McpServerCard
                  key={id}
                  server={{ id, name, toolCount, enabled }}
                  health={h}
                  expanded={!!expandedIds[id]}
                  toolsLoading={!!toolsLoading[id] || !!toolsRefreshBusy[id]}
                  tools={toolsByServer[id] ?? []}
                  toolsShowAll={!!toolsShowAll[id]}
                  onToggleExpand={() => {
                    setExpandedIds((prev) => {
                      const next = !prev[id];
                      if (next && !toolsByServer[id]) void fetchToolsRegistry(id);
                      return { ...prev, [id]: next };
                    });
                  }}
                  onEditConfig={() => openConfigInMonaco(id)}
                  onDelete={() => void deleteServer(id)}
                  onPing={() => void pingServer(id)}
                  onToggleEnabled={(v) => void setServerEnabled(id, v)}
                  onRefreshTools={() => void refreshToolsLive(id)}
                  onShowAllTools={() => setToolsShowAll((p) => ({ ...p, [id]: true }))}
                  onToolClick={(toolName) => openToolInMonaco(id, toolName)}
                />
              );
            })}
          </div>

          <div
            className={`tools-mcp-editor flex flex-col min-w-0 bg-[var(--dashboard-panel)] overflow-hidden ${
              editorOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {panel ? (
              <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--dashboard-border)] bg-[var(--dashboard-canvas)]">
                <Box size={14} className="text-[var(--solar-cyan)] shrink-0" />
                <span className="text-[11px] font-mono text-[var(--text-heading)] truncate flex-1">
                  {panel.mode === 'config'
                    ? `${panel.serverId} / config.json`
                    : `${panel.serverId} / ${panel.toolName}`}
                </span>
                {panel.mode === 'tool' ? (
                  <>
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--dashboard-card)] border border-[var(--dashboard-border)] text-[var(--text-muted)]">
                      read-only
                    </span>
                    <button
                      type="button"
                      className="text-[10px] text-[var(--solar-cyan)] hover:underline shrink-0"
                      onClick={() => openConfigInMonaco(panel.serverId)}
                    >
                      Open config
                    </button>
                  </>
                ) : (
                  <>
                    {dirtyConfig ? (
                      <span className="text-[9px] uppercase tracking-wider text-amber-500 shrink-0">● unsaved</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void saveConfig()}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] uppercase tracking-wider bg-[var(--solar-blue)] text-white hover:opacity-90 shrink-0"
                    >
                      <Save size={12} />
                      Save
                    </button>
                  </>
                )}
                <button
                  type="button"
                  title="Open in Agent"
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] px-1 shrink-0"
                  onClick={() => navigate(`/dashboard/agent?mcp=${encodeURIComponent(panel.serverId)}`)}
                >
                  Agent
                </button>
                <button
                  type="button"
                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-hover)] shrink-0"
                  onClick={closePanel}
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}

            {panel?.mode === 'tool' ? (
              <div className="shrink-0 px-3 py-2 text-[10px] text-[var(--text-muted)] border-b border-[var(--dashboard-border)] bg-[var(--bg-panel)]">
                Tool definitions are read-only — edit server config to modify MCP behavior.
              </div>
            ) : null}

            {saveError ? (
              <div className="shrink-0 px-3 py-1.5 text-[11px] text-[var(--color-danger)] bg-[var(--bg-panel)]">
                {saveError}
              </div>
            ) : null}

            <div className="flex-1 min-h-[200px]">
              <McpMonacoHost ref={editorRef} onEditorReady={onEditorReady} />
            </div>
          </div>
        </div>
      ) : null}

      {data.settingsMcp ? (
        <section className="flex flex-col gap-2 mt-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Registered tools
          </div>
          <div className="flex flex-col gap-1">
            {(Array.isArray(data.settingsMcp.tools) ? data.settingsMcp.tools : []).map((t: any, idx: number) => {
              const id = String(t?.id || '');
              const toolName = String(t?.tool_name || t?.name || `tool_${idx}`);
              const desc = String(t?.description || '');
              const enabled = !!Number(t?.enabled ?? 0);
              const isDegraded = !!Number(t?.is_degraded ?? 0);
              const failureRate = t?.failure_rate != null ? Number(t.failure_rate) : null;
              const stats = t?.stats as Record<string, unknown> | null | undefined;
              const statsLine = stats
                ? `${Number(stats.call_count ?? 0)} calls today · ${Number(stats.avg_duration_ms ?? 0)}ms avg`
                : 'No activity today';
              const err = data.mcpToggleError[id] || null;
              return (
                <McpToolRow
                  key={id || toolName}
                  toolName={toolName}
                  description={desc}
                  enabled={enabled}
                  isDegraded={isDegraded}
                  failureRate={failureRate}
                  statsLine={statsLine}
                  toggleError={err}
                  onToggle={(v) => void data.toggleMcpRegisteredTool(id, v, enabled)}
                  onOpenSchema={() => openRegisteredToolSchema(t)}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
