import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Github,
  Terminal,
  Database,
  Search,
  Plus,
  ArrowRight,
  Clock,
  Settings,
  ShieldCheck,
  Server,
} from 'lucide-react';

interface WorkspaceItem {
  id: string;
  name: string;
  type: 'local' | 'github' | 'r2' | 'ssh';
  lastOpenedAt: string;
  metadata?: {
    repo?: string;
    bucket?: string;
    host?: string;
  };
}

interface WorkspaceLauncherProps {
  onSelect?: (ws: WorkspaceItem) => void;
  onClose: () => void;
  onOpenLocalFolder?: () => void;
  onConnectWorkspace?: () => void;
}

/**
 * WorkspaceLauncher: The central switchboard for Agent Sam projects.
 * Replaces legacy WelcomeLauncher with a production-grade context selector.
 */
export const WorkspaceLauncher: React.FC<WorkspaceLauncherProps> = ({ onSelect, onClose, onOpenLocalFolder, onConnectWorkspace }) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'local' | 'github' | 'r2' | 'ssh'>('all');
  const [search, setSearch] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load workspaces from modular API ─────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/workspaces/list', { credentials: 'same-origin' });
        if (!r.ok) throw new Error('Failed to load workspaces');
        const data = await r.json() as { workspaces: any[] };
        
        const mapped: WorkspaceItem[] = (data.workspaces || []).map(ws => ({
          id: ws.id,
          name: ws.name || ws.handle || 'Untitled Workspace',
          type: ws.type || 'local', // Defaulting to local if not specified
          lastOpenedAt: new Date().toISOString(),
          metadata: {
            repo: ws.github_repo || null,
            host: ws.domain || null,
          }
        }));

        setWorkspaces(mapped);
        setLoading(false);
      } catch (e) {
        console.error('[WorkspaceLauncher] Load error:', e);
        setLoading(false);
      }
    };
    load();
  }, []);

  const filters = [
    { id: 'all', label: 'All Projects', icon: <Server size={14} /> },
    { id: 'local', label: 'Local', icon: <FolderOpen size={14} /> },
    { id: 'github', label: 'GitHub', icon: <Github size={14} /> },
    { id: 'r2', label: 'R2 Buckets', icon: <Database size={14} /> },
    { id: 'ssh', label: 'SSH', icon: <Terminal size={14} /> },
  ];

  return (
    <div className="workspace-launcher fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-app)]/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-4xl h-[600px] bg-[var(--bg-panel)] border border-[var(--border-main)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--solar-cyan)]/10 flex items-center justify-center text-[var(--solar-cyan)]">
              <Server size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-heading)]">Switch Workspace</h2>
              <p className="text-sm text-[var(--text-muted)]">Select or create a development environment</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-app)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          >
            <Plus size={20} className="rotate-45" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Filters */}
          <div className="w-64 border-r border-[var(--border-subtle)] bg-[var(--bg-app)]/50 p-4 space-y-1">
            {filters.map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeFilter === f.id 
                  ? 'bg-[var(--bg-panel)] text-[var(--solar-cyan)] shadow-sm border border-[var(--border-subtle)]' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel)]/50'
                }`}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
            
            <div className="pt-8 px-3">
              <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-4">Operations</p>
              <button 
                onClick={onOpenLocalFolder}
                className="w-full flex items-center gap-3 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors py-2"
              >
                <Plus size={14} /> New Workspace
              </button>
              <button className="w-full flex items-center gap-3 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors py-2">
                <Settings size={14} /> Manage Environments
              </button>
            </div>
          </div>

          {/* Project List */}
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-[var(--border-subtle)]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
                <input 
                  type="text"
                  placeholder="Search workspaces (name, repo, or path)..."
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-[var(--solar-cyan)]/50 transition-all font-sans"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading ? (
                <div className="h-full flex items-center justify-center text-[var(--text-muted)] animate-pulse">
                  Initializing switchboard...
                </div>
              ) : (
                <>
                  <div className="px-2 pb-2">
                    <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Recently Opened</p>
                  </div>
                  {/* Placeholder for items */}
                  <div className="text-[var(--text-muted)] text-center py-20 italic">
                    No active connections found for this environment filter.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--bg-app)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-4 text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><ShieldCheck size={12} className="text-[var(--solar-green)]" /> Authenticated</span>
            <span className="flex items-center gap-1"><Server size={12} /> D1 Storage: Active</span>
          </div>
          <p className="text-[var(--text-muted)] font-mono">WORKSPACE_ID: CORE_CONTROL_PLANE</p>
        </div>
      </div>
    </div>
  );
};
