import React, { useState, useEffect } from 'react';
import { 
  Search, ExternalLink, Globe, Bot, Database, Box, Code2, Wrench,
  GitBranch, Network, Zap, CheckCircle2, XCircle, AlertCircle,
  ChevronRight, ToggleLeft, ToggleRight, Eye, Settings2, Package,
  Cloud, BarChart2, BookOpen, Bell, Layers, Cpu, Shield, Palette
} from 'lucide-react';
import { ThemeSwitcher } from './ThemeSwitcher';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MCP {
  id: string; tool_name: string; tool_category: string; description: string;
  enabled: number; requires_approval: number; mcp_service_url: string; input_schema?: string;
}
interface AIModel {
  provider: string; model_key: string; display_name: string;
  is_active: number; supports_tools: number; supports_vision: number; size_class: string;
}
interface GitRepo {
  id: number; repo_full_name: string; repo_url: string; default_branch: string;
  cloudflare_worker_name: string; is_active: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const categoryIcon = (cat: string) => {
  const map: Record<string, { icon: React.ReactNode; color: string }> = {
    ai:        { icon: <Bot size={14} />,     color: 'text-[var(--solar-cyan)]' },
    storage:   { icon: <Database size={14} />, color: 'text-[var(--solar-blue)]' },
    platform:  { icon: <Cloud size={14} />,   color: 'text-[var(--solar-violet)]' },
    analytics: { icon: <BarChart2 size={14} />, color: 'text-[var(--solar-yellow)]' },
    ui:        { icon: <Box size={14} />,     color: 'text-[var(--solar-magenta)]' },
    code:      { icon: <Code2 size={14} />,   color: 'text-[var(--solar-green)]' },
    network:   { icon: <Network size={14} />, color: 'text-[var(--solar-blue)]' },
    docs:      { icon: <BookOpen size={14} />,color: 'text-[var(--solar-orange)]' },
    search:    { icon: <Search size={14} />,  color: 'text-[var(--solar-violet)]' },
  };
  const key = Object.keys(map).find(k => cat?.toLowerCase().includes(k));
  return key ? map[key] : { icon: <Wrench size={14} />, color: 'text-[var(--text-muted)]' };
};

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button
    onClick={() => onChange(!on)}
    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-[var(--solar-cyan)]' : 'bg-[var(--border-subtle)]'}`}
  >
    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--toggle-knob)] shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

const StatusDot: React.FC<{ on: boolean }> = ({ on }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-[var(--solar-green)]' : 'bg-[var(--border-subtle)]'}`} />
);

// ─── Main Component ──────────────────────────────────────────────────────────
interface SettingsPanelProps {
  onClose: () => void;
  onFileSelect?: (file: { name: string; content: string }) => void;
  /** Default workspace from /api/settings/workspaces — scopes cms_themes + active theme. */
  workspaceId?: string | null;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, onFileSelect, workspaceId }) => {
  const [activeSection, setActiveSection] = useState('General');
  const [search, setSearch] = useState('');
  const [mcps, setMcps] = useState<MCP[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [mcpToggles, setMcpToggles] = useState<Record<string, boolean>>({});
  const [expandedMcp, setExpandedMcp] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Worker routes: /api/mcp/tools, /api/ai/models, /api/integrations/github/repos
  useEffect(() => {
    const opt = { credentials: 'same-origin' as const };

    fetch('/api/mcp/tools', opt)
      .then(r => r.json())
      .then((d: { tools?: Array<{ tool_name: string; description?: string; category?: string }> }) => {
        const rows = Array.isArray(d.tools) ? d.tools : [];
        const mapped: MCP[] = rows.map(t => ({
          id: t.tool_name,
          tool_name: t.tool_name,
          tool_category: t.category || 'general',
          description: t.description || '',
          enabled: 1,
          requires_approval: 0,
          mcp_service_url: 'https://mcp.inneranimalmedia.com/mcp',
          input_schema: '{}',
        }));
        setMcps(mapped);
        const toggles: Record<string, boolean> = {};
        mapped.forEach(m => { toggles[m.id] = !!m.enabled; });
        setMcpToggles(toggles);
      })
      .catch(() => setMcps([]));

    fetch('/api/ai/models', opt)
      .then(r => r.json())
      .then((d: { models?: AIModel[] }) => {
        const rows = Array.isArray(d.models) ? d.models : [];
        setModels(
          rows.map(m => ({
            provider: String((m as AIModel).provider || ''),
            model_key: String((m as AIModel).model_key || ''),
            display_name: String((m as AIModel).display_name || (m as AIModel).model_key || ''),
            is_active: Number((m as AIModel).is_active) ? 1 : 0,
            supports_tools: Number((m as AIModel).supports_tools) ? 1 : 0,
            supports_vision: Number((m as AIModel).supports_vision) ? 1 : 0,
            size_class: String((m as AIModel).size_class || ''),
          }))
        );
      })
      .catch(() => setModels([]));

    fetch('/api/integrations/github/repos', opt)
      .then(r => r.json())
      .then((d: unknown) => {
        if (!Array.isArray(d)) {
          setRepos([]);
          return;
        }
        setRepos(
          d.map((r: Record<string, unknown>, i: number) => ({
            id: typeof r.id === 'number' ? r.id : i,
            repo_full_name: String(r.full_name || r.name || `repo_${i}`),
            repo_url: String(r.html_url || ''),
            default_branch: String(r.default_branch || 'main'),
            cloudflare_worker_name: '',
            is_active: 1,
          }))
        );
      })
      .catch(() => setRepos([]));
  }, []);


  const toggleMcp = async (id: string, val: boolean) => {
    setMcpToggles(p => ({ ...p, [id]: val }));
    setLoading(p => ({ ...p, [id]: true }));
    // No public PATCH for mcp_registered_tools yet; local UI state only.
    setLoading(p => ({ ...p, [id]: false }));
  };

  const openMcpInMonaco = (mcp: MCP) => {
    const config = {
      id: mcp.id,
      tool_name: mcp.tool_name,
      tool_category: mcp.tool_category,
      description: mcp.description,
      mcp_service_url: mcp.mcp_service_url,
      enabled: mcpToggles[mcp.id] ? 1 : 0,
      requires_approval: mcp.requires_approval,
      input_schema: mcp.input_schema ? JSON.parse(mcp.input_schema) : {}
    };
    onFileSelect?.({
      name: `${mcp.id}.mcp.json`,
      content: JSON.stringify(config, null, 2)
    });
  };

  const menu = [
    { id: 'General',      icon: <Settings2 size={14} /> },
    { id: 'AI Models',    icon: <Cpu size={14} /> },
    { id: 'Tools & MCP',  icon: <Layers size={14} /> },
    { id: 'GitHub',       icon: <GitBranch size={14} /> },
    { id: 'CI/CD',        icon: <Zap size={14} /> },
    { id: 'Network',      icon: <Network size={14} /> },
    { id: 'Themes',       icon: <Palette size={14} /> },
    { id: 'Storage',      icon: <Database size={14} /> },
    { id: 'Security',     icon: <Shield size={14} /> },
    { id: 'Notifications',icon: <Bell size={14} /> },
    { id: 'Docs',         icon: <BookOpen size={14} /> },
  ];

  const filteredMenu = menu.filter(m => !search || m.id.toLowerCase().includes(search.toLowerCase()));

  // Group MCPs by category
  const mcpCategories = mcps.reduce<Record<string, MCP[]>>((acc, mcp) => {
    const cat = mcp.tool_category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mcp);
    return acc;
  }, {} as Record<string, MCP[]>);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-panel)] text-[var(--text-main)] overflow-hidden">
      {/* ── Header ── */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] shrink-0">
        <span className="font-semibold text-[12px] tracking-widest uppercase text-[var(--text-heading)]">Settings</span>
        <button onClick={onClose} className="p-1.5 hover:bg-[var(--bg-hover)] rounded transition-colors text-[var(--text-muted)] hover:text-[var(--text-heading)] text-[11px] uppercase tracking-wider">
          Close
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Nav ── */}
        <div className="w-44 shrink-0 border-r border-[var(--border-subtle)] flex flex-col overflow-hidden">
          {/* User pill */}
          <div className="flex items-center gap-2.5 px-3 py-3 border-b border-[var(--border-subtle)]">
            <div className="w-7 h-7 rounded-full bg-[var(--solar-blue)] flex items-center justify-center text-[var(--toggle-knob)] font-bold text-[11px] shrink-0">S</div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-[var(--text-heading)] truncate">sam_primeaux</span>
              <span className="text-[10px] text-[var(--solar-cyan)]">Pro Plan</span>
            </div>
          </div>

          {/* Search */}
          <div className="px-2 py-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-1.5 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5">
              <Search size={10} className="text-[var(--text-muted)] shrink-0" />
              <input
                type="text" placeholder="Filter..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent text-[11px] focus:outline-none text-[var(--text-main)] placeholder:text-[var(--text-muted)] w-full"
              />
            </div>
          </div>

          {/* Nav items */}
          <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
            {filteredMenu.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors text-left ${
                  activeSection === item.id
                    ? 'bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] border-r-2 border-[var(--solar-cyan)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                {item.id}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right Content ── */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">

          {/* ── GENERAL ── */}
          {activeSection === 'General' && (
            <div className="flex flex-col gap-5 max-w-xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">General</h2>
              {[
                { label: 'Sync layouts across windows', desc: 'All windows share the same panel layout', on: true },
                { label: 'Show Status Bar', desc: 'Show context bar at the bottom of the editor', on: true },
                { label: 'Auto-hide editor when empty', desc: 'Expand chat when all editors are closed', on: false },
                { label: 'Auto-inject code to Monaco', desc: 'Agent code blocks auto-open in editor', on: true },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]/50">
                  <div>
                    <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{row.desc}</div>
                  </div>
                  <Toggle on={row.on} onChange={() => {}} />
                </div>
              ))}
              <div className="flex items-start justify-between py-3 border-b border-[var(--border-subtle)]/50">
                <div>
                  <div className="text-[12px] font-semibold text-[var(--text-main)]">Manage Account</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Billing, seats, and usage limits</div>
                </div>
                <button className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg text-[11px] hover:border-[var(--solar-cyan)]/50 transition-colors">
                  Open <ExternalLink size={10} />
                </button>
              </div>
            </div>
          )}

          {/* ── AI MODELS ── */}
          {activeSection === 'AI Models' && (
            <div className="flex flex-col gap-3">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest mb-2">AI Models</h2>
              {models.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Loading models from DB...</p>}
              {['google', 'anthropic', 'cursor', 'openai'].map(provider => {
                const group = models.filter(m => m.provider === provider);
                if (!group.length) return null;
                return (
                  <div key={provider}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1">{provider}</div>
                    <div className="flex flex-col gap-1">
                      {group.map(m => (
                        <div key={m.model_key} className="flex items-center justify-between p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl hover:border-[var(--solar-cyan)]/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <StatusDot on={!!m.is_active} />
                            <div>
                              <div className="text-[12px] font-semibold text-[var(--text-main)]">{m.display_name}</div>
                              <div className="text-[10px] text-[var(--text-muted)] font-mono">{m.model_key}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            {m.supports_tools ? <span className="px-1.5 py-0.5 bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] rounded font-bold">Tools</span> : null}
                            {m.supports_vision ? <span className="px-1.5 py-0.5 bg-[var(--solar-blue)]/10 text-[var(--solar-blue)] rounded font-bold">Vision</span> : null}
                            <span className="px-1.5 py-0.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded text-[var(--text-muted)]">{m.size_class}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── TOOLS & MCP ── */}
          {activeSection === 'Tools & MCP' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Tools & MCP</h2>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{mcps.length} registered</span>
              </div>
              {mcps.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Loading MCPs from DB...</p>}
              {(Object.entries(mcpCategories) as [string, MCP[]][]).map(([cat, tools]) => {
                const { icon, color } = categoryIcon(cat);
                return (
                  <div key={cat}>
                    <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-2 px-1 ${color}`}>
                      {icon} {cat} <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">({tools.length})</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {tools.map(mcp => (
                        <div key={mcp.id} className="flex flex-col">
                          <div
                            className={`flex items-center justify-between p-3 bg-[var(--bg-app)] border rounded-xl transition-all cursor-pointer ${
                              expandedMcp === mcp.id ? 'border-[var(--solar-cyan)]/40 rounded-b-none' : 'border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/30'
                            }`}
                            onClick={() => setExpandedMcp(expandedMcp === mcp.id ? null : mcp.id)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center ${color} shrink-0`}>
                                {icon}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{mcp.tool_name}</div>
                                <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[200px]">{mcp.description}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0 ml-2">
                              {mcp.requires_approval ? (
                                <span className="text-[9px] px-1.5 py-0.5 bg-[var(--solar-yellow)]/10 text-[var(--solar-yellow)] rounded font-bold uppercase">Approval</span>
                              ) : null}
                              <div onClick={e => { e.stopPropagation(); }} className="">
                                <Toggle
                                  on={mcpToggles[mcp.id] ?? false}
                                  onChange={(v) => toggleMcp(mcp.id, v)}
                                />
                              </div>
                              <ChevronRight
                                size={13}
                                className={`text-[var(--text-muted)] transition-transform ${expandedMcp === mcp.id ? 'rotate-90' : ''}`}
                              />
                            </div>
                          </div>

                          {/* Expanded config row */}
                          {expandedMcp === mcp.id && (
                            <div className="bg-[var(--scene-bg)] border border-t-0 border-[var(--solar-cyan)]/40 rounded-b-xl p-4 flex flex-col gap-2.5 animate-in slide-in-from-top-2 duration-150">
                              <div className="grid grid-cols-2 gap-3 text-[11px]">
                                <div>
                                  <span className="text-[var(--text-muted)] block mb-0.5">Category</span>
                                  <span className="text-[var(--text-main)] font-mono">{mcp.tool_category}</span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block mb-0.5">Service URL</span>
                                  <span className="text-[var(--solar-cyan)] font-mono truncate block">{mcp.mcp_service_url}</span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block mb-0.5">Requires Approval</span>
                                  <span className={mcp.requires_approval ? 'text-[var(--solar-yellow)]' : 'text-[var(--solar-green)]'}>
                                    {mcp.requires_approval ? 'Yes' : 'No'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block mb-0.5">Status</span>
                                  <div className="flex items-center gap-1.5">
                                    <StatusDot on={!!mcpToggles[mcp.id]} />
                                    <span className={mcpToggles[mcp.id] ? 'text-[var(--solar-green)]' : 'text-[var(--text-muted)]'}>
                                      {mcpToggles[mcp.id] ? 'Enabled' : 'Disabled'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => openMcpInMonaco(mcp)}
                                className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/50 rounded-lg text-[11px] text-[var(--text-main)] hover:text-[var(--solar-cyan)] transition-colors mt-1 w-fit"
                              >
                                <Code2 size={12} /> Open Config in Monaco
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── GITHUB ── */}
          {activeSection === 'GitHub' && (
            <div className="flex flex-col gap-3">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest mb-2">GitHub Repositories</h2>
              {repos.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Loading repos from DB...</p>}
              {repos.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl hover:border-[var(--solar-cyan)]/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                      <GitBranch size={13} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{r.repo_full_name}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">branch: {r.default_branch} {r.cloudflare_worker_name ? `· worker: ${r.cloudflare_worker_name}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusDot on={!!r.is_active} />
                    <a href={r.repo_url} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--solar-cyan)] transition-colors">
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── CI/CD ── */}
          {activeSection === 'CI/CD' && (
            <div className="flex flex-col gap-4 max-w-xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">CI/CD Pipelines</h2>
              <p className="text-[12px] text-[var(--text-muted)]">Pipeline run logs are stored in <code className="font-mono text-[var(--solar-cyan)]">cidi_pipeline_runs</code>. Configure your build commands in the GitHub settings above.</p>
              {[
                { label: 'Auto-deploy on push to main', on: true },
                { label: 'Run tests before deploy', on: true },
                { label: 'Notify on failure', on: true },
                { label: 'Rollback on failed deploy', on: false },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]/50">
                  <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
                  <Toggle on={row.on} onChange={() => {}} />
                </div>
              ))}
            </div>
          )}

          {/* ── NETWORK ── */}
          {activeSection === 'Network' && (
            <div className="flex flex-col gap-4 max-w-xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Network</h2>
              {[
                { label: 'MCP Endpoint', val: 'https://mcp.inneranimalmedia.com/mcp', color: 'text-[var(--solar-cyan)]' },
                { label: 'Worker Base URL', val: 'https://meauxcad.meauxbility.workers.dev', color: 'text-[var(--solar-blue)]' },
              ].map(row => (
                <div key={row.label} className="flex flex-col gap-1 py-3 border-b border-[var(--border-subtle)]/50">
                  <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">{row.label}</span>
                  <code className={`text-[12px] font-mono ${row.color}`}>{row.val}</code>
                </div>
              ))}
            </div>
          )}

          {/* ── THEMES ── */}
          {activeSection === 'Themes' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Workspace Themes</h2>
              <p className="text-[12px] text-[var(--text-muted)]">Select a theme to instantly update the Inner Animal Media dashboard. Theme variables are stored in <code className="font-mono text-[var(--solar-cyan)]">cms_themes</code> and applied live.</p>
              <ThemeSwitcher workspaceId={workspaceId} />
            </div>
          )}

          {/* ── STORAGE ── */}
          {activeSection === 'Storage' && (
            <div className="flex flex-col gap-3">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest mb-2">Storage (R2)</h2>
              {['cad', 'inneranimalmedia-assets', 'splineicons'].map(bucket => (
                <div key={bucket} className="flex items-center justify-between p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center">
                      <Database size={13} className="text-[var(--solar-blue)]" />
                    </div>
                    <div>
                      <div className="text-[12px] font-mono text-[var(--text-main)]">{bucket}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">R2 Bucket</div>
                    </div>
                  </div>
                  <StatusDot on={true} />
                </div>
              ))}
            </div>
          )}

          {/* ── Other sections — placeholder ── */}
          {!['General','AI Models','Tools & MCP','GitHub','CI/CD','Network','Themes','Storage'].includes(activeSection) && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-[var(--text-muted)]">
              <Package size={28} className="opacity-30" />
              <p className="text-[12px]">{activeSection} settings coming soon.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
