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
  Monitor,
  Database,
  Plus,
  Zap,
  Layers,
  Globe,
  History as HistoryIcon
} from 'lucide-react';
import { useEditor } from '../src/EditorContext';
import type { RecentFileEntry } from '../src/ideWorkspace';

interface WorkspaceDashboardProps {
  onOpenFolder: () => void;
  onConnectWorkspace: () => void;
  onGithubSync: () => void;
  recentFiles: RecentFileEntry[];
  workspaceRows: Array<{ id: string; name: string }>;
  authWorkspaceId: string | null;
  onSwitchWorkspace: (id: string) => void;
  onSendMessage: (message: string) => void;
}

interface AIModel {
  model_key: string;
  name: string;
  provider: string;
  description?: string;
}

/**
 * WorkspaceDashboard: A premium, centered 'Cursor-style' home screen for the IDE.
 * Replaces the legacy WelcomeScreen and WorkspaceLauncher modal.
 */
export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({ 
  onOpenFolder, 
  onConnectWorkspace, 
  onGithubSync,
  recentFiles,
  workspaceRows,
  authWorkspaceId,
  onSwitchWorkspace,
  onSendMessage
}) => {
  const [chatInput, setChatInput] = useState('');
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPlusOpen, setIsPlusOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch models from API
  useEffect(() => {
    fetch('/api/agent/models?show_in_picker=1')
      .then(res => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.rows)) {
          const rows: AIModel[] = data.rows;
          // Group by provider and take top 5 each
          const grouped: Record<string, AIModel[]> = {};
          rows.forEach(m => {
            if (!grouped[m.provider]) grouped[m.provider] = [];
            if (grouped[m.provider].length < 5) grouped[m.provider].push(m);
          });
          const filtered = Object.values(grouped).flat();
          setModels(filtered);
          if (filtered.length > 0) setSelectedModel(filtered[0]);
        }
      })
      .catch(err => console.error('Failed to fetch models', err));
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
      if (plusRef.current && !plusRef.current.contains(target)) {
        setIsPlusOpen(false);
      }
      if (workspaceRef.current && !workspaceRef.current.contains(target)) {
        setIsWorkspaceOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    onSendMessage(chatInput);
    setChatInput('');
  };

  const handleStopAgent = () => {
    setIsAgentRunning(false);
    console.log('Stopping agent...');
  };

  const activeWorkspace = (workspaceRows || []).find(w => w.id === authWorkspaceId) || { name: 'Home', id: 'default' };

  return (
    <div className="flex-1 flex flex-col items-center justify-start bg-[var(--scene-bg)] overflow-y-auto py-12 px-6 no-scrollbar h-full">
      
      {/* ── Branded Logo (Refactored to match screenshot) ── */}
      <div className="flex flex-col items-center mb-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="w-16 h-16 mb-2 rounded-2xl flex items-center justify-center grayscale opacity-80">
            <img 
              src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail" 
              alt="Agent Sam"
              className="w-full h-full object-contain"
            />
        </div>
      </div>

      {/* ── Directory Dropdown (NEW) ── */}
      <div className="relative mb-4 z-[80]" ref={workspaceRef}>
        <button 
          onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all font-medium text-[13px]"
        >
          <span>{activeWorkspace.name}</span>
          <ChevronDown size={14} className={`opacity-60 transition-transform ${isWorkspaceOpen ? 'rotate-180' : ''}`} />
          <Database size={13} className="opacity-40 ml-1" />
        </button>

        {isWorkspaceOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-[90] overflow-hidden py-2 animate-in fade-in slide-in-from-top-2">
            <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-60 border-b border-[var(--border-subtle)]/30 mb-1">
              Cloud Workspaces
            </div>
            {workspaceRows.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  onSwitchWorkspace(ws.id);
                  setIsWorkspaceOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-[12px] transition-colors ${authWorkspaceId === ws.id ? 'text-[var(--solar-cyan)] bg-[var(--bg-app)]' : 'text-[var(--text-main)] hover:bg-[var(--bg-app)]'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${ws.id.includes('sandbox') ? 'bg-[var(--solar-cyan)]' : 'bg-[var(--solar-green)] shadow-[0_0_8px_var(--solar-green)]'}`} />
                  <span>{ws.name}</span>
                </div>
                {authWorkspaceId === ws.id && <Sparkles size={10} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Centered Chat Interaction (HEAVILY REVISED) ── */}
      <div className="w-full max-w-2xl mb-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="relative group p-[1px] rounded-3xl bg-gradient-to-br from-[var(--border-subtle)]/40 to-transparent hover:from-[var(--border-subtle)] transition-all duration-500 shadow-2xl">
          <div className="relative bg-[#111] rounded-[22px] border border-white/5">
            
            {/* Input Row */}
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
                className="flex-1 bg-transparent border-none outline-none resize-none py-1 text-[16px] text-[var(--text-main)] placeholder:text-[var(--text-muted)]/40 min-h-[48px] max-h-[300px] leading-relaxed"
              />
            </div>

            {/* Footer Row (Premium Controls) */}
            <div className="flex items-center justify-between px-4 py-4">
              
              <div className="flex items-center gap-1.5">
                <div className="relative" ref={plusRef}>
                  <button 
                    onClick={() => setIsPlusOpen(!isPlusOpen)}
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                  {isPlusOpen && (
                    <div className="absolute left-0 bottom-full mb-3 w-56 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-bottom-2">
                      <div className="px-3 py-2 text-[10px] text-[var(--text-muted)] font-medium opacity-60">Add agents, context, tools...</div>
                      {[
                        { icon: FileText, label: 'Plan', slug: 'plan' },
                        { icon: Bug, label: 'Debug', slug: 'debug' },
                        { icon: Target, label: 'Ask', slug: 'ask' },
                        { icon: Terminal, label: 'Image', action: () => fileInputRef.current?.click() },
                        { icon: Zap, label: 'Skills', action: () => window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail: { activity: 'mcps' } })) },
                        { icon: Layers, label: 'MCP Servers', action: () => window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail: { activity: 'mcps' } })) },
                      ].map((item, i) => {
                        const Icon = item.icon || Plus;
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              if ('action' in item) item.action?.();
                              setIsPlusOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-[12px] text-[var(--text-main)] hover:bg-[var(--bg-app)] transition-colors text-left"
                          >
                            <Icon size={14} className="text-[var(--text-muted)]" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="relative" ref={dropdownRef}>
                  <button 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-app)] transition-all text-[12px] font-medium text-[var(--text-muted)]"
                  >
                    <span>{selectedModel?.name || 'Auto'}</span>
                    <ChevronDown size={14} className={`opacity-60 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute left-0 bottom-full mb-3 w-64 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-[70] overflow-hidden py-2 animate-in fade-in slide-in-from-bottom-2">
                      <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--border-subtle)]/30 mb-1">
                        <span className="text-[11px] font-bold text-[var(--text-main)]">Search models</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[var(--text-muted)]">Auto</span>
                          <div className="w-8 h-4 bg-[var(--solar-cyan)]/20 rounded-full relative p-0.5">
                            <div className="w-3 h-3 bg-[var(--solar-cyan)] rounded-full float-right" />
                          </div>
                        </div>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto no-scrollbar scroll-px-1">
                        {models.map((m) => (
                          <button
                            key={m.model_key}
                            onClick={() => {
                              setSelectedModel(m);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition-all flex items-center justify-between group ${selectedModel?.model_key === m.model_key ? 'bg-[var(--solar-cyan)]/5 text-[var(--solar-cyan)]' : 'text-[var(--text-main)] hover:bg-[var(--bg-app)]'}`}
                          >
                            <div className="min-w-0">
                              <div className="font-bold truncate">{m.name}</div>
                              <div className="text-[10px] opacity-40 uppercase tracking-widest truncate">{m.provider}</div>
                            </div>
                            {selectedModel?.model_key === m.model_key && <Sparkles size={11} className="animate-pulse" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  className="p-1 px-2 text-[var(--text-muted)] hover:text-white transition-colors"
                  title="Voice Command"
                >
                  <Mic size={18} />
                </button>
                <button 
                  onClick={isAgentRunning ? handleStopAgent : handleSendMessage}
                  className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${isAgentRunning ? 'bg-[var(--solar-red)] text-white' : (chatInput.trim() ? 'bg-white text-black' : 'bg-white/10 text-white/30')}`}
                >
                  {isAgentRunning ? <X size={18} /> : <ArrowRight size={18} />}
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* ── Secondary Pill Buttons (NEW) ── */}
        <div className="mt-4 flex items-center justify-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-1200 delay-300">
          <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel)]/50 hover:bg-[var(--bg-panel)] transition-all text-[12px] font-medium text-[var(--text-muted)] hover:text-white">
            <span>Plan New Idea</span>
            <span className="opacity-40 text-[10px]">⇧ Tab</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel)]/50 hover:bg-[var(--bg-panel)] transition-all text-[12px] font-medium text-[var(--text-muted)] hover:text-white">
            <span>Open Editor Window</span>
          </button>
        </div>

        {/* ── IDE Shortcuts Hint (Adjusted) ── */}
        <div className="mt-12 flex flex-wrap justify-center gap-10 text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] font-black opacity-20">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded border border-[var(--border-subtle)]">P</span>
            <span>Files</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded border border-[var(--border-subtle)]">I</span>
            <span>Refactor</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded border border-[var(--border-subtle)]">J</span>
            <span>Terminal</span>
          </div>
        </div>
      </div>

      {/* ── Action Grid (Preserved) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150">
        <button 
          onClick={onOpenFolder}
          className="group flex flex-col items-start p-6 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl hover:border-[var(--solar-cyan)]/50 transition-all duration-300 hover:shadow-lg"
        >
          <div className="p-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors mb-4">
            <FolderOpen size={24} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">Open Local Project</h3>
          <p className="text-[11px] text-[var(--text-muted)] text-left">Browse your local filesystem to pick a repository</p>
        </button>

        <button 
          onClick={onConnectWorkspace}
          className="group flex flex-col items-start p-6 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl hover:border-[var(--solar-cyan)]/50 transition-all duration-300 hover:shadow-lg"
        >
          <div className="p-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors mb-4">
            <Globe size={24} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">Connect Workspace</h3>
          <p className="text-[11px] text-[var(--text-muted)] text-left">Switch to a D1-backed remote control plane</p>
        </button>

        <button 
          onClick={onGithubSync}
          className="group flex flex-col items-start p-6 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl hover:border-[var(--solar-cyan)]/50 transition-all duration-300 hover:shadow-lg"
        >
          <div className="p-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors mb-4">
            <Github size={24} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">Clone Repository</h3>
          <p className="text-[11px] text-[var(--text-muted)] text-left">Import your projects directly from GitHub</p>
        </button>
      </div>

      {/* ── Recent Projects (Preserved) ── */}
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
                onClick={() => { /* Handled via App.tsx */ }}
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

    </div>
  );
};
