/**
 * MCPPanel — MCP Server Browser
 *
 * Left column  : server groups with live health dot + enable/disable toggle.
 *                Clicking a server expands its capability list (tool name + scope badge).
 * Right panel  : Monaco editor showing the selected server/tool config_json.
 *                Header shows realtime health stats (last ping, latency, ok/degraded count).
 *                Config is editable — Save posts back via PATCH /api/mcp/tools/:name/config.
 *
 * All data is API-driven. No hardcoded server names, tool lists, or config values.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Circle,
  AlertTriangle,
  CheckCircle2,
  Save,
  RotateCcw,
  Loader2,
  Shield,
  Pencil,
  Search,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const API_TOOLS         = '/api/mcp/tools';
const API_HEALTH_TOOLS  = '/api/health/tools';
const API_TOOL_TOGGLE   = (name: string) => `/api/mcp/tools/${encodeURIComponent(name)}/toggle`;
const API_TOOL_CONFIG   = (name: string) => `/api/mcp/tools/${encodeURIComponent(name)}/config`;
const MONACO_THEME      = 'mcp-dark';
const HEALTH_POLL_MS    = 30_000;

// ── Types ─────────────────────────────────────────────────────────────────────
type Scope = 'read' | 'write' | 'admin' | string;

interface MCPTool {
  tool_name:    string;
  tool_category: string;
  description:  string;
  enabled:      number;        // 1 | 0
  is_degraded:  number;        // 1 | 0
  input_schema: string;        // JSON string
  config_json?: string;        // JSON string — editable
  intent_tags?: string | null;
}

interface ToolHealth {
  tool_name:      string;
  is_degraded:    boolean;
  failures_24h:   number;
  last_called_at: string | null;
  latency_ms?:    number | null;
}

interface ServerGroup {
  category:  string;
  tools:     MCPTool[];
  degraded:  number;
}

// ── Scope badge ───────────────────────────────────────────────────────────────
const SCOPE_COLORS: Record<string, string> = {
  read:  'bg-[var(--solar-blue)]/15   text-[var(--solar-blue)]   border-[var(--solar-blue)]/30',
  write: 'bg-[var(--solar-yellow)]/15 text-[var(--solar-yellow)] border-[var(--solar-yellow)]/30',
  admin: 'bg-[var(--solar-red)]/15    text-[var(--solar-red)]    border-[var(--solar-red)]/30',
};

const ScopeBadge: React.FC<{ scope: Scope }> = ({ scope }) => {
  const cls = SCOPE_COLORS[scope.toLowerCase()] ?? SCOPE_COLORS.read;
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${cls}`}>
      {scope}
    </span>
  );
};

// ── Health dot ────────────────────────────────────────────────────────────────
const HealthDot: React.FC<{ degraded: boolean; count?: number }> = ({ degraded, count = 0 }) =>
  degraded ? (
    <span className="flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--solar-red)] animate-pulse" />
      {count > 0 && (
        <span className="text-[9px] font-mono text-[var(--solar-red)]">{count}f</span>
      )}
    </span>
  ) : (
    <span className="w-1.5 h-1.5 rounded-full bg-[var(--solar-green)]" />
  );

// ── Toggle switch ─────────────────────────────────────────────────────────────
const Toggle: React.FC<{ enabled: boolean; onChange: () => void; loading: boolean }> = ({
  enabled,
  onChange,
  loading,
}) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onChange(); }}
    disabled={loading}
    className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
      enabled ? 'bg-[var(--solar-cyan)]' : 'bg-[var(--border-subtle)]'
    } disabled:opacity-50`}
    aria-label={enabled ? 'Disable' : 'Enable'}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
        enabled ? 'translate-x-4' : 'translate-x-0'
      }`}
    />
  </button>
);

// ── Main component ────────────────────────────────────────────────────────────
export const MCPPanel: React.FC = () => {
  const [tools,          setTools]          = useState<MCPTool[]>([]);
  const [health,         setHealth]         = useState<ToolHealth[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [healthLoading,  setHealthLoading]  = useState(false);
  const [toggling,       setToggling]       = useState<string | null>(null);
  const [expanded,       setExpanded]       = useState<string | null>(null);
  const [selected,       setSelected]       = useState<MCPTool | null>(null);
  const [editedConfig,   setEditedConfig]   = useState<string>('');
  const [saving,         setSaving]         = useState(false);
  const [saveMsg,        setSaveMsg]        = useState<string | null>(null);
  const [search,         setSearch]         = useState('');
  const monaco = useMonaco();
  const themeReady = useRef(false);

  // ── Monaco theme from CSS vars ──────────────────────────────────────────────
  useEffect(() => {
    if (!monaco || themeReady.current) return;
    const st = getComputedStyle(document.documentElement);
    const g = (v: string, fb: string) => st.getPropertyValue(v).trim() || fb;
    monaco.editor.defineTheme(MONACO_THEME, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'string.key.json',   foreground: g('--solar-cyan',   '2dd4bf') },
        { token: 'string.value.json', foreground: g('--solar-base0',  '9cb5bc') },
        { token: 'number',            foreground: g('--solar-magenta','d33682') },
        { token: 'keyword.json',      foreground: g('--solar-blue',   '3a9fe8') },
      ],
      colors: {
        'editor.background':         g('--bg-app',        '#00212b'),
        'editor.foreground':         g('--solar-base0',   '#9cb5bc'),
        'editorCursor.foreground':   g('--solar-cyan',    '#2dd4bf'),
        'editor.lineHighlightBackground': g('--bg-panel', '#0a2d38'),
        'editorLineNumber.foreground':    g('--text-muted','#4a7a87'),
        'scrollbarSlider.background':     g('--border-subtle','#1e3e4a') + '80',
      },
    });
    monaco.editor.setTheme(MONACO_THEME);
    themeReady.current = true;
  }, [monaco]);

  // ── Fetch tools ─────────────────────────────────────────────────────────────
  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(API_TOOLS, { credentials: 'same-origin' });
      const data = (await res.json()) as { tools?: MCPTool[] };
      setTools(Array.isArray(data.tools) ? data.tools : []);
    } catch (e) {
      console.error('[MCPPanel] tools fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch health ────────────────────────────────────────────────────────────
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res  = await fetch(API_HEALTH_TOOLS, { credentials: 'same-origin' });
      const data = (await res.json()) as { tools?: ToolHealth[] };
      setHealth(Array.isArray(data.tools) ? data.tools : []);
    } catch {
      /* non-blocking */
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTools();
    void fetchHealth();
    const id = setInterval(() => void fetchHealth(), HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, [fetchTools, fetchHealth]);

  // ── Toggle enable/disable ───────────────────────────────────────────────────
  const handleToggle = async (tool: MCPTool) => {
    setToggling(tool.tool_name);
    try {
      await fetch(API_TOOL_TOGGLE(tool.tool_name), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: tool.enabled === 1 ? 0 : 1 }),
      });
      setTools((prev) =>
        prev.map((t) =>
          t.tool_name === tool.tool_name ? { ...t, enabled: t.enabled === 1 ? 0 : 1 } : t
        )
      );
    } catch (e) {
      console.error('[MCPPanel] toggle failed', e);
    } finally {
      setToggling(null);
    }
  };

  // ── Select tool → load config into Monaco ───────────────────────────────────
  const handleSelectTool = (tool: MCPTool) => {
    setSelected(tool);
    setSaveMsg(null);
    const raw = tool.config_json ?? tool.input_schema ?? '{}';
    try {
      setEditedConfig(JSON.stringify(JSON.parse(raw), null, 2));
    } catch {
      setEditedConfig(raw);
    }
  };

  // ── Save config ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      JSON.parse(editedConfig); // validate before sending
      const res = await fetch(API_TOOL_CONFIG(selected.tool_name), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_json: editedConfig }),
      });
      setSaveMsg(res.ok ? 'Saved.' : `Error ${res.status}`);
      if (res.ok) {
        setTools((prev) =>
          prev.map((t) =>
            t.tool_name === selected.tool_name ? { ...t, config_json: editedConfig } : t
          )
        );
      }
    } catch {
      setSaveMsg('Invalid JSON — not saved.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  const handleDiscard = () => {
    if (!selected) return;
    const raw = selected.config_json ?? selected.input_schema ?? '{}';
    try {
      setEditedConfig(JSON.stringify(JSON.parse(raw), null, 2));
    } catch {
      setEditedConfig(raw);
    }
    setSaveMsg(null);
  };

  // ── Derived data ─────────────────────────────────────────────────────────────
  const healthMap = new Map<string, ToolHealth>(health.map((h) => [h.tool_name, h]));

  const filtered = search.trim()
    ? tools.filter(
        (t) =>
          t.tool_name.toLowerCase().includes(search.toLowerCase()) ||
          t.tool_category.toLowerCase().includes(search.toLowerCase()) ||
          (t.description ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : tools;

  const groups: ServerGroup[] = Array.from(
    filtered.reduce((acc, t) => {
      const cat = t.tool_category || 'general';
      if (!acc.has(cat)) acc.set(cat, { category: cat, tools: [], degraded: 0 });
      const g = acc.get(cat)!;
      g.tools.push(t);
      const h = healthMap.get(t.tool_name);
      if (h?.is_degraded || t.is_degraded === 1) g.degraded++;
      return acc;
    }, new Map<string, ServerGroup>()).values()
  );

  const selectedHealth = selected ? healthMap.get(selected.tool_name) : null;
  const configDirty    = selected
    ? editedConfig !== (selected.config_json ?? selected.input_schema ?? '{}')
    : false;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full bg-[var(--bg-app)] overflow-hidden text-[var(--text-main)]">

      {/* ── Left: server/tool list ──────────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] min-h-0">

        {/* Header */}
        <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <span className="text-[11px] font-black uppercase tracking-widest">MCP Servers</span>
          <button
            type="button"
            onClick={() => { void fetchTools(); void fetchHealth(); }}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading || healthLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Search */}
        <div className="px-2 py-2 shrink-0">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] focus-within:border-[var(--solar-cyan)]/50">
            <Search size={11} className="text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              placeholder="Filter tools…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12 text-[var(--text-muted)] gap-2">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[11px]">Loading…</span>
            </div>
          )}
          {!loading && groups.length === 0 && (
            <p className="px-4 py-8 text-[11px] text-[var(--text-muted)] text-center">No tools found.</p>
          )}
          {groups.map((group) => {
            const isOpen = expanded === group.category;
            return (
              <div key={group.category}>
                {/* Server row */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : group.category)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  {isOpen ? <ChevronDown size={13} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={13} className="shrink-0 text-[var(--text-muted)]" />}
                  <span className="flex-1 text-[11px] font-bold uppercase tracking-widest truncate">
                    {group.category}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono mr-1">{group.tools.length}</span>
                  <HealthDot degraded={group.degraded > 0} count={group.degraded} />
                </button>

                {/* Tool rows */}
                {isOpen && (
                  <div className="pb-1">
                    {group.tools.map((tool) => {
                      const th        = healthMap.get(tool.tool_name);
                      const degraded  = th?.is_degraded || tool.is_degraded === 1;
                      const isSelected= selected?.tool_name === tool.tool_name;
                      // Parse scope from intent_tags or config_json if available
                      let scope: Scope = 'read';
                      try {
                        const cfg = JSON.parse(tool.config_json || '{}') as { scope?: string };
                        if (cfg.scope) scope = cfg.scope;
                      } catch { /* ignore */ }

                      return (
                        <div
                          key={tool.tool_name}
                          onClick={() => handleSelectTool(tool)}
                          className={`flex items-center gap-2 pl-8 pr-3 py-1.5 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[var(--solar-cyan)]/10 border-l-2 border-[var(--solar-cyan)]'
                              : 'hover:bg-[var(--bg-hover)] border-l-2 border-transparent'
                          }`}
                        >
                          <HealthDot degraded={degraded} />
                          <span className="flex-1 text-[11px] truncate font-mono" title={tool.tool_name}>
                            {tool.tool_name}
                          </span>
                          <ScopeBadge scope={scope} />
                          <Toggle
                            enabled={tool.enabled === 1}
                            loading={toggling === tool.tool_name}
                            onChange={() => void handleToggle(tool)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer: total counts */}
        <div className="px-3 py-2 border-t border-[var(--border-subtle)] shrink-0 flex items-center gap-3 text-[10px] font-mono text-[var(--text-muted)]">
          <span>{tools.length} tools</span>
          <span>·</span>
          <span className="text-[var(--solar-green)]">{tools.filter(t => t.enabled === 1).length} active</span>
          {health.filter(h => h.is_degraded).length > 0 && (
            <>
              <span>·</span>
              <span className="text-[var(--solar-red)]">{health.filter(h => h.is_degraded).length} degraded</span>
            </>
          )}
        </div>
      </div>

      {/* ── Right: Monaco config preview ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">

        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] gap-3">
            <Shield size={36} className="opacity-20" />
            <p className="text-[12px]">Select a tool to inspect or edit its config</p>
          </div>
        ) : (
          <>
            {/* Config header */}
            <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-panel)] flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Pencil size={13} className="text-[var(--solar-cyan)] shrink-0" />
                <span className="text-[11px] font-bold font-mono truncate">{selected.tool_name}</span>
                <span className="text-[10px] text-[var(--text-muted)] truncate hidden sm:block">{selected.description}</span>
              </div>

              {/* Health stats */}
              <div className="flex items-center gap-3 ml-auto text-[10px] font-mono shrink-0">
                {selectedHealth ? (
                  <>
                    {selectedHealth.is_degraded ? (
                      <span className="flex items-center gap-1 text-[var(--solar-red)]">
                        <AlertTriangle size={11} /> degraded · {selectedHealth.failures_24h} failures/24h
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[var(--solar-green)]">
                        <CheckCircle2 size={11} /> healthy
                      </span>
                    )}
                    {selectedHealth.latency_ms != null && (
                      <span className="text-[var(--text-muted)]">{selectedHealth.latency_ms}ms</span>
                    )}
                    {selectedHealth.last_called_at && (
                      <span className="text-[var(--text-muted)] hidden md:block">
                        last: {new Date(selectedHealth.last_called_at).toLocaleTimeString()}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[var(--text-muted)] flex items-center gap-1">
                    <Circle size={10} /> no health data
                  </span>
                )}
              </div>

              {/* Save / discard */}
              <div className="flex items-center gap-2 shrink-0">
                {saveMsg && (
                  <span className={`text-[10px] font-mono ${saveMsg.startsWith('Saved') ? 'text-[var(--solar-green)]' : 'text-[var(--solar-red)]'}`}>
                    {saveMsg}
                  </span>
                )}
                {configDirty && (
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)]"
                  >
                    <RotateCcw size={11} /> Discard
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!configDirty || saving}
                  className="flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                  Save
                </button>
              </div>
            </div>

            {/* Monaco */}
            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                language="json"
                theme={MONACO_THEME}
                value={editedConfig}
                onChange={(v) => setEditedConfig(v ?? '')}
                options={{
                  fontSize:            12,
                  fontFamily:          'var(--font-mono)',
                  fontLigatures:       true,
                  lineHeight:          20,
                  minimap:             { enabled: false },
                  scrollBeyondLastLine: false,
                  padding:             { top: 12 },
                  wordWrap:            'on',
                  tabSize:             2,
                  insertSpaces:        true,
                  formatOnPaste:       true,
                  bracketPairColorization: { enabled: true },
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
