import React, { useState, useEffect, useRef } from 'react';
import {
  FolderOpen,
  Github,
  Terminal,
  ArrowRight,
  Mic,
  X,
  FileText,
  Bug,
  Target,
  Sparkles,
  ChevronDown,
  Globe,
  Zap,
  Layers,
  Plus,
  History as HistoryIcon,
} from 'lucide-react';
import type { RecentFileEntry } from '../src/ideWorkspace';

// ── Constants ────────────────────────────────────────────────────────────────
const API_MODELS      = '/api/agent/models?show_in_picker=1';
const EVENT_SIDEBAR   = 'iam-sidebar-toggle';
const SIDEBAR_MCPS    = 'mcps';

// ── Types ────────────────────────────────────────────────────────────────────
interface AIModel {
  model_key:    string;
  name:         string;
  provider:     string;
  description?: string;
}

/**
 * Workspace row as returned by the API.
 * `environment` must be a field on the workspaces record — never derived
 * from the ID string. Expected values: 'production' | 'sandbox' | 'dev'
 */
interface WorkspaceRow {
  id:          string;
  name:        string;
  environment: string;
}

interface WorkspaceDashboardProps {
  onOpenFolder:        () => void;
  onConnectWorkspace:  () => void;
  onGithubSync:        () => void;
  recentFiles:         RecentFileEntry[];
  workspaceRows:       WorkspaceRow[];
  /** ID of the authenticated user's active workspace — resolved server-side. */
  authWorkspaceId:     string | null;
  onSwitchWorkspace:   (id: string) => void;
  onSendMessage:       (message: string) => void;
  /** Logo URL resolved from env or workspace branding record — never hardcoded. */
  logoUrl:             string;
  /** Display name of the product — resolved from env / DB. */
  productLabel:        string;
}

// ── Pill shortcuts — driven by a config array, not inline JSX ─────────────
const SHORTCUTS = [
  { label: 'P', description: 'Files' },
  { label: 'I', description: 'Refactor' },
  { label: 'J', description: 'Terminal' },
] as const;

// ── Plus-menu items — config-driven ─────────────────────────────────────────
const buildPlusItems = (fileInputRef: React.RefObject<HTMLInputElement>) => [
  { Icon: FileText, label: 'Plan',        action: null       as null },
  { Icon: Bug,      label: 'Debug',       action: null       as null },
  { Icon: Target,   label: 'Ask',         action: null       as null },
  { Icon: Terminal, label: 'Image',       action: () => fileInputRef.current?.click() },
  { Icon: Zap,      label: 'Skills',      action: () => window.dispatchEvent(new CustomEvent(EVENT_SIDEBAR, { detail: { activity: SIDEBAR_MCPS } })) },
  { Icon: Layers,   label: 'MCP Servers', action: () => window.dispatchEvent(new CustomEvent(EVENT_SIDEBAR, { detail: { activity: SIDEBAR_MCPS } })) },
];

// ── Action cards — config-driven ─────────────────────────────────────────────
const buildActionCards = (
  onOpenFolder:       () => void,
  onConnectWorkspace: () => void,
  onGithubSync:       () => void,
) => [
  {
    Icon:        FolderOpen,
    label:       'Open Local Project',
    description: 'Browse your local filesystem to pick a repository',
    onClick:     onOpenFolder,
  },
  {
    Icon:        Globe,
    label:       'Connect Workspace',
    description: 'Switch to a D1-backed remote control plane',
    onClick:     onConnectWorkspace,
  },
  {
    Icon:        Github,
    label:       'Clone Repository',
    description: 'Import your projects directly from GitHub',
    onClick:     onGithubSync,
  },
];

// ── Component ────────────────────────────────────────────────────────────────
export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({
  onOpenFolder,
  onConnectWorkspace,
  onGithubSync,
  recentFiles,
  workspaceRows,
  authWorkspaceId,
  onSwitchWorkspace,
  onSendMessage,
  logoUrl,
  productLabel,
}) => {
  const [chatInput,        setChatInput]        = useState('');
  const [models,           setModels]           = useState<AIModel[]>([]);
  const [selectedModel,    setSelectedModel]    = useState<AIModel | null>(null);
  const [isDropdownOpen,   setIsDropdownOpen]   = useState(false);
  const [isPlusOpen,       setIsPlusOpen]       = useState(false);
  const [isWorkspaceOpen,  setIsWorkspaceOpen]  = useState(false);
  const [isAgentRunning,   setIsAgentRunning]   = useState(false);

  const dropdownRef  = useRef<HTMLDivElement>(null);
  const plusRef      = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch models from API ────────────────────────────────────────────────
  useEffect(() => {
    fetch(API_MODELS)
      .then((res) => res.json())
      .then((data: { rows?: AIModel[] }) => {
        if (!Array.isArray(data.rows)) return;
        // Group by provider, take top 5 per provider
        const grouped: Record<string, AIModel[]> = {};
        data.rows.forEach((m) => {
          if (!grouped[m.provider]) grouped[m.provider] = [];
          if (grouped[m.provider].length < 5) grouped[m.provider].push(m);
        });
        const filtered = Object.values(grouped).flat();
        setModels(filtered);
        if (filtered.length > 0) setSelectedModel(filtered[0]);
      })
      .catch((err) => console.error('[WorkspaceDashboard] model fetch failed', err));
  }, []);

  // ── Close dropdowns on outside click ────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (dropdownRef.current  && !dropdownRef.current.contains(t))  setIsDropdownOpen(false);
      if (plusRef.current      && !plusRef.current.contains(t))      setIsPlusOpen(false);
      if (workspaceRef.current && !workspaceRef.current.contains(t)) setIsWorkspaceOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    onSendMessage(chatInput);
    setChatInput('');
  };

  const handleStopAgent = () => {
    setIsAgentRunning(false);
  };

  // Active workspace resolved from props — never falls back to a hardcoded object.
  // If authWorkspaceId is null the picker shows no selection until the session resolves.
  const activeWorkspace = workspaceRows.find((w) => w.id === authWorkspaceId) ?? null;

  const plusItems   = buildPlusItems(fileInputRef);
  const actionCards = buildActionCards(onOpenFolder, onConnectWorkspace, onGithubSync);

  return (
    <div className="flex-1 flex flex-col items-center justify-start bg-[var(--scene-bg)] overflow-y-auto py-12 px-6 no-scrollbar h-full">

      {/* ── Logo — URL comes from props, never hardcoded ── */}
      <div className="flex flex-col items-center mb-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        {logoUrl && (
          <div className="w-16 h-16 mb-2 rounded-2xl flex items-center justify-center grayscale opacity-80">
            <img src={logoUrl} alt={productLabel} className="w-full h-full object-contain" />
          </div>
        )}
      </div>

      {/* ── Workspace Dropdown — environment field drives the indicator color ── */}
      <div className="relative mb-4 z-[80]" ref={workspaceRef}>
        <button
          onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all font-medium text-[13px]"
        >
          <span>{activeWorkspace?.name ?? '—'}</span>
          <ChevronDown size={14} className={`opacity-60 transition-transform ${isWorkspaceOpen ? 'rotate-180' : ''}`} />
        </button>

        {isWorkspaceOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-[90] overflow-hidden py-2 animate-in fade-in slide-in-from-top-2">
            <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-60 border-b border-[var(--border-subtle)]/30 mb-1">
              Cloud Workspaces
            </div>
            {workspaceRows.map((ws) => {
              // Dot color driven by environment field from DB — not ID string matching
              const dotClass =
                ws.environment === 'sandbox' || ws.environment === 'dev'
                  ? 'bg-[var(--solar-cyan)]'
                  : 'bg-[var(--solar-green)] shadow-[0_0_8px_var(--solar-green)]';

              return (
                <button
                  key={ws.id}
                  onClick={() => {
                    onSwitchWorkspace(ws.id);
                    setIsWorkspaceOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[12px] transition-colors ${
                    authWorkspaceId === ws.id
                      ? 'text-[var(--solar-cyan)] bg-[var(--bg-app)]'
                      : 'text-[var(--text-main)] hover:bg-[var(--bg-app)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                    <span>{ws.name}</span>
                  </div>
                  {authWorkspaceId === ws.id && <Sparkles size={10} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Chat input ── */}
      <div className="w-full max-w-2xl mb-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="relative group p-[1px] rounded-3xl bg-gradient-to-br from-[var(--border-subtle)]/40 to-transparent hover:from-[var(--border-subtle)] transition-all duration-500 shadow-2xl">
          <div className="relative bg-[var(--bg-panel)] rounded-[22px] border border-[var(--border-subtle)]/30">

            <div className="flex items-start p-5 pb-2 gap-4">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (isAgentRunning) handleStopAgent();
                    else handleSendMessage();
                  }
                }}
                placeholder="Plan, Build, / for commands, @ for context"
                className="flex-1 bg-transparent border-none outline-none resize-none py-1 text-[var(--text-md)] text-[var(--text-main)] placeholder:text-[var(--text-placeholder)] min-h-[48px] max-h-[300px] leading-relaxed font-[var(--font-ui)]"
              />
            </div>

            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-1.5">

                {/* Plus menu */}
                <div className="relative" ref={plusRef}>
                  <button
                    onClick={() => setIsPlusOpen(!isPlusOpen)}
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                  {isPlusOpen && (
                    <div className="absolute left-0 bottom-full mb-3 w-56 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-bottom-2">
                      <div className="px-3 py-2 text-[10px] text-[var(--text-muted)] font-medium opacity-60">
                        Add agents, context, tools…
                      </div>
                      {plusItems.map((item) => (
                        <button
                          key={item.label}
                          onClick={() => {
                            item.action?.();
                            setIsPlusOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-[12px] text-[var(--text-main)] hover:bg-[var(--bg-app)] transition-colors text-left"
                        >
                          <item.Icon size={14} className="text-[var(--text-muted)]" />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Model picker */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] transition-all text-[12px] font-medium text-[var(--text-muted)]"
                  >
                    <span>{selectedModel?.name ?? 'Auto'}</span>
                    <ChevronDown size={14} className={`opacity-60 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute left-0 bottom-full mb-3 w-64 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-[70] overflow-hidden py-2 animate-in fade-in slide-in-from-bottom-2">
                      <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--border-subtle)]/30 mb-1">
                        <span className="text-[11px] font-bold text-[var(--text-main)]">Models</span>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                        {models.map((m) => (
                          <button
                            key={m.model_key}
                            onClick={() => {
                              setSelectedModel(m);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition-all flex items-center justify-between group ${
                              selectedModel?.model_key === m.model_key
                                ? 'bg-[var(--solar-cyan)]/5 text-[var(--solar-cyan)]'
                                : 'text-[var(--text-main)] hover:bg-[var(--bg-app)]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-bold truncate">{m.name}</div>
                              <div className="text-[10px] opacity-40 uppercase tracking-widest truncate">{m.provider}</div>
                            </div>
                            {selectedModel?.model_key === m.model_key && (
                              <Sparkles size={11} className="animate-pulse" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button className="p-1 px-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors" title="Voice Command">
                  <Mic size={18} />
                </button>
                <button
                  onClick={isAgentRunning ? handleStopAgent : handleSendMessage}
                  className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${
                    isAgentRunning
                      ? 'bg-[var(--solar-red)] text-white'
                      : chatInput.trim()
                        ? 'bg-white text-black'
                        : 'bg-white/10 text-white/30'
                  }`}
                >
                  {isAgentRunning ? <X size={18} /> : <ArrowRight size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary pills */}
        <div className="mt-4 flex items-center justify-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-1200 delay-300">
          <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel)]/50 hover:bg-[var(--bg-panel)] transition-all text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <span>Plan New Idea</span>
            <span className="opacity-40 text-[10px]">⇧ Tab</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel)]/50 hover:bg-[var(--bg-panel)] transition-all text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <span>Open Editor Window</span>
          </button>
        </div>

        {/* Keyboard shortcuts — config-driven */}
        <div className="mt-12 flex flex-wrap justify-center gap-10 text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] font-black opacity-20">
          {SHORTCUTS.map(({ label, description }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded border border-[var(--border-subtle)]">{label}</span>
              <span>{description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Action cards — config-driven ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150">
        {actionCards.map(({ Icon, label, description, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="group flex flex-col items-start p-6 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl hover:border-[var(--solar-cyan)]/50 transition-all duration-300 hover:shadow-lg"
          >
            <div className="p-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors mb-4">
              <Icon size={24} />
            </div>
            <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">{label}</h3>
            <p className="text-[11px] text-[var(--text-muted)] text-left">{description}</p>
          </button>
        ))}
      </div>

      {/* ── Recent files ── */}
      <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
        <div className="flex items-center gap-2 mb-4 px-2">
          <HistoryIcon size={14} className="text-[var(--text-muted)]" />
          <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Recently Opened</h2>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl divide-y divide-[var(--border-subtle)] overflow-hidden">
          {recentFiles.length > 0 ? (
            recentFiles.slice(0, 6).map((file) => (
              <div
                key={file.id}
                className="group flex items-center justify-between p-4 hover:bg-[var(--bg-app)] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors">
                    <Terminal size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-[var(--text-main)] truncate">{file.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{file.label}</div>
                  </div>
                </div>
                <ArrowRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all" />
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-[var(--text-muted)] italic text-[12px]">
              No recent projects found.
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input for image upload */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />
    </div>
  );
};
