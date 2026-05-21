import React, { useCallback, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { ChevronDown, ChevronRight, Pencil, Save } from 'lucide-react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';

export type ToolsMcpSectionProps = {
  data: SettingsPanelModel;
  activeSection: string;
};

function parseJsonSafe(raw: unknown, fallback: unknown) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function ToolsMcpSection({ data, activeSection }: ToolsMcpSectionProps) {
  const settings = data.settingsMcp;
  const connectedUrl = String(settings?.connected?.url || '').trim();
  const workspaceLabel = settings?.workspace?.id
    ? `Showing tools for: ${settings.workspace.name || settings.workspace.id} (${settings.workspace.id})`
    : 'Showing tools for: —';
  const tools = Array.isArray(settings?.tools) ? settings!.tools : [];

  const [expandedToolKey, setExpandedToolKey] = useState<string | null>(null);
  const [toolEditorText, setToolEditorText] = useState<Record<string, string>>({});
  const [toolEditMode, setToolEditMode] = useState<Record<string, boolean>>({});
  const [toolSaveBusy, setToolSaveBusy] = useState<Record<string, boolean>>({});
  const [toolSaveError, setToolSaveError] = useState<Record<string, string | null>>({});
  const [mcpTokens, setMcpTokens] = useState<
    Array<{
      id: string;
      label: string | null;
      rate_limit_per_hour: number | null;
      expires_at: number | null;
      created_at: number | null;
      allowed_tools: string | null;
    }>
  >([]);
  const [mcpTokensLoading, setMcpTokensLoading] = useState(true);
  const [mcpTokenLabel, setMcpTokenLabel] = useState('');
  const [mcpTokenRate, setMcpTokenRate] = useState('1000');
  const [mcpTokenExpiryDays, setMcpTokenExpiryDays] = useState('');
  const [mcpTokenBusy, setMcpTokenBusy] = useState(false);
  const [mcpTokenError, setMcpTokenError] = useState<string | null>(null);
  const [mcpTokenReveal, setMcpTokenReveal] = useState<string | null>(null);

  const loadMcpTokens = useCallback(async () => {
    setMcpTokensLoading(true);
    setMcpTokenError(null);
    try {
      const r = await fetch('/api/mcp/tokens', { credentials: 'same-origin' });
      const j = (await r.json().catch(() => ({}))) as { tokens?: typeof mcpTokens; error?: string };
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setMcpTokens(Array.isArray(j.tokens) ? j.tokens : []);
    } catch (e) {
      setMcpTokenError(e instanceof Error ? e.message : 'Failed to load MCP tokens');
      setMcpTokens([]);
    } finally {
      setMcpTokensLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMcpTokens();
  }, [loadMcpTokens]);

  const createMcpToken = useCallback(async () => {
    setMcpTokenBusy(true);
    setMcpTokenError(null);
    setMcpTokenReveal(null);
    try {
      const rate = Math.max(1, Math.min(10000, Number.parseInt(mcpTokenRate, 10) || 1000));
      const body: Record<string, unknown> = {
        label: mcpTokenLabel.trim() || 'Dashboard MCP token',
        rateLimitPerHour: rate,
      };
      if (mcpTokenExpiryDays.trim()) {
        body.expiresInDays = Math.max(1, Number.parseInt(mcpTokenExpiryDays, 10) || 0);
      }
      const r = await fetch('/api/mcp/token/create', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { bearer?: string; error?: string; warning?: string };
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Create failed (${r.status})`);
      setMcpTokenReveal(j.bearer || null);
      setMcpTokenLabel('');
      await loadMcpTokens();
    } catch (e) {
      setMcpTokenError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setMcpTokenBusy(false);
    }
  }, [loadMcpTokens, mcpTokenExpiryDays, mcpTokenLabel, mcpTokenRate]);

  const revokeMcpToken = useCallback(
    async (tokenId: string) => {
      if (!window.confirm('Revoke this MCP token? Clients using it will stop working.')) return;
      setMcpTokenBusy(true);
      setMcpTokenError(null);
      try {
        const r = await fetch('/api/mcp/token/revoke', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Revoke failed (${r.status})`);
        await loadMcpTokens();
      } catch (e) {
        setMcpTokenError(e instanceof Error ? e.message : 'Revoke failed');
      } finally {
        setMcpTokenBusy(false);
      }
    },
    [loadMcpTokens],
  );

  const toolIndex = useMemo(() => {
    const m: Record<string, Record<string, unknown>> = {};
    for (const t of tools) {
      const key = String((t as any)?.tool_key || (t as any)?.tool_name || (t as any)?.name || '').trim();
      if (!key) continue;
      m[key] = t as any;
    }
    return m;
  }, [tools]);

  const getToolKey = useCallback((t: Record<string, unknown>) => {
    return String((t as any)?.tool_key || (t as any)?.tool_name || (t as any)?.name || '').trim();
  }, []);

  const getToolDescription = useCallback((t: Record<string, unknown>) => {
    return String((t as any)?.description || '').trim();
  }, []);

  const buildEditablePayloadFromRow = useCallback((t: Record<string, unknown>) => {
    const tool_key = getToolKey(t);
    const handler_type = String((t as any)?.handler_type || (t as any)?.handlerType || 'builtin').trim();
    const description = getToolDescription(t);
    const input_schema = parseJsonSafe((t as any)?.input_schema, {});
    const modes_json = parseJsonSafe((t as any)?.modes_json, []);
    const risk_level = String((t as any)?.risk_level || 'low').trim();
    const handler_config = parseJsonSafe((t as any)?.handler_config, {});
    return { tool_key, handler_type, description, input_schema, modes_json, risk_level, handler_config };
  }, [getToolKey, getToolDescription]);

  const expandTool = useCallback((toolKey: string) => {
    setToolSaveError((p) => ({ ...p, [toolKey]: null }));
    setExpandedToolKey((prev) => (prev === toolKey ? null : toolKey));
    setToolEditMode((p) => ({ ...p, [toolKey]: false }));
    setToolEditorText((prev) => {
      if (prev[toolKey] != null) return prev;
      const row = toolIndex[toolKey];
      const payload = row ? buildEditablePayloadFromRow(row) : { tool_key: toolKey };
      return { ...prev, [toolKey]: JSON.stringify(payload, null, 2) };
    });
  }, [toolIndex, buildEditablePayloadFromRow]);

  const saveTool = useCallback(async (toolKey: string) => {
    const text = toolEditorText[toolKey] ?? '';
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      setToolSaveError((p) => ({ ...p, [toolKey]: 'Invalid JSON' }));
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setToolSaveError((p) => ({ ...p, [toolKey]: 'Schema must be a JSON object' }));
      return;
    }

    const payload = {
      tool_key: parsed.tool_key,
      handler_type: parsed.handler_type,
      description: parsed.description,
      input_schema: parsed.input_schema,
      modes_json: parsed.modes_json,
      risk_level: parsed.risk_level,
      handler_config: parsed.handler_config,
    };

    setToolSaveBusy((p) => ({ ...p, [toolKey]: true }));
    setToolSaveError((p) => ({ ...p, [toolKey]: null }));
    try {
      const r = await fetch(`/api/settings/tools/${encodeURIComponent(toolKey)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = (await r.json().catch(() => ({}))) as any;
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
      setToolEditMode((p) => ({ ...p, [toolKey]: false }));
      await data.loadMcpSettings();
    } catch (e) {
      setToolSaveError((p) => ({ ...p, [toolKey]: e instanceof Error ? e.message : 'Save failed' }));
    } finally {
      setToolSaveBusy((p) => ({ ...p, [toolKey]: false }));
    }
  }, [toolEditorText, data]);

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
          Tools &amp; MCP
        </h2>
        <span className="text-[10px] text-[var(--text-muted)] font-mono">
          {tools.length} tools
        </span>
      </div>

      {!settings ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading MCP settings…</div>
      ) : null}

      {settings ? (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-heading)]">Connected:</span>{' '}
            <span className="font-mono">{connectedUrl || '—'}</span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">{workspaceLabel}</div>
        </div>
      ) : null}

      <section className="flex flex-col gap-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          Workspace MCP tokens
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          Generate a bearer for this workspace only. The token is stored hashed in D1; copy it once after create.
        </p>
        {mcpTokenError ? (
          <p className="text-[11px] text-[var(--color-danger)]">{mcpTokenError}</p>
        ) : null}
        {mcpTokenReveal ? (
          <div className="rounded-lg border border-[var(--solar-cyan)]/40 bg-[var(--bg-app)] p-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Copy now</p>
            <code className="block text-[11px] font-mono text-[var(--solar-cyan)] break-all">{mcpTokenReveal}</code>
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Label</span>
            <input
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-[12px]"
              value={mcpTokenLabel}
              onChange={(e) => setMcpTokenLabel(e.target.value)}
              placeholder="Connor dev MCP"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Rate limit / hour</span>
            <input
              type="number"
              min={1}
              max={10000}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-[12px]"
              value={mcpTokenRate}
              onChange={(e) => setMcpTokenRate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Expires (days, optional)</span>
            <input
              type="number"
              min={1}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-[12px]"
              value={mcpTokenExpiryDays}
              onChange={(e) => setMcpTokenExpiryDays(e.target.value)}
              placeholder="90"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={mcpTokenBusy}
          onClick={() => void createMcpToken()}
          className="self-start px-4 py-2 rounded-lg text-[11px] font-semibold bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 disabled:opacity-50"
        >
          {mcpTokenBusy ? 'Working…' : 'Generate MCP token'}
        </button>
        {mcpTokensLoading ? (
          <p className="text-[11px] text-[var(--text-muted)]">Loading tokens…</p>
        ) : mcpTokens.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">No active tokens for this workspace.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mcpTokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[11px]"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text-main)] truncate">{t.label || t.id}</div>
                  <div className="text-[var(--text-muted)] font-mono">
                    {t.id} · {t.rate_limit_per_hour ?? '—'}/hr
                    {t.expires_at ? ` · exp ${t.expires_at}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={mcpTokenBusy}
                  onClick={() => void revokeMcpToken(t.id)}
                  className="shrink-0 text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settings ? (
        <section className="flex flex-col gap-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Registered tools
          </div>
          <div className="flex flex-col gap-2">
            {tools.map((raw, idx) => {
              const t = raw as Record<string, unknown>;
              const toolKey = getToolKey(t) || `tool_${idx}`;
              const expanded = expandedToolKey === toolKey;
              const editMode = !!toolEditMode[toolKey];
              const text = toolEditorText[toolKey] ?? JSON.stringify(buildEditablePayloadFromRow(t), null, 2);
              const err = toolSaveError[toolKey] || null;
              return (
                <div
                  key={toolKey}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-[var(--bg-hover)]"
                    onClick={() => expandTool(toolKey)}
                  >
                    <span className="mt-[2px] text-[var(--text-muted)] shrink-0">
                      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">
                        {toolKey}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-1">
                        {getToolDescription(t) || '—'}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        {(t as any)?.handler_type ? String((t as any).handler_type) : ''}
                      </span>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="border-t border-[var(--border-subtle)]">
                      <div className="px-4 py-2 flex items-center justify-between gap-2 bg-[var(--bg-app)]">
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {editMode ? 'Editing' : 'Read-only'} JSON
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] uppercase tracking-wider bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/50 text-[var(--text-main)]"
                            onClick={() => setToolEditMode((p) => ({ ...p, [toolKey]: true }))}
                            disabled={toolSaveBusy[toolKey]}
                          >
                            <Pencil size={12} /> Edit
                          </button>
                          <button
                            type="button"
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] uppercase tracking-wider bg-[var(--solar-blue)] text-white hover:opacity-90 disabled:opacity-60"
                            onClick={() => void saveTool(toolKey)}
                            disabled={!editMode || !!toolSaveBusy[toolKey]}
                          >
                            <Save size={12} /> Save
                          </button>
                        </div>
                      </div>

                      {err ? (
                        <div className="px-4 py-2 text-[11px] text-[var(--color-danger)] bg-[var(--bg-panel)]">
                          {String(err).includes('Internal Server Error') ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-danger)]" />
                              <span>Handler error — check handler_type config</span>
                              <a
                                href="/dashboard/agent?tab=problems"
                                className="text-[var(--solar-cyan)] hover:underline text-[10px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View logs
                              </a>
                            </div>
                          ) : (
                            err
                          )}
                        </div>
                      ) : null}

                      <div className="h-[260px]">
                        <Editor
                          height="100%"
                          defaultLanguage="json"
                          value={text}
                          onChange={(v) => {
                            const next = v ?? '';
                            setToolEditorText((p) => ({ ...p, [toolKey]: next }));
                          }}
                          options={{
                            readOnly: !editMode,
                            minimap: { enabled: false },
                            fontSize: 13,
                            fontFamily: 'var(--font-mono)',
                            scrollBeyondLastLine: false,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
