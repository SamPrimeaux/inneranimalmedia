import React, { useState, useEffect } from 'react';
import { 
  Github, 
  GitBranch, 
  GitCommit, 
  FileCode, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  RefreshCcw,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface GitStatus {
  branch: string;
  staged: Array<{ path: string; status: string }>;
  unstaged: Array<{ path: string; status: string }>;
  commits: Array<{ hash: string; author: string; date: string; msg: string }>;
  root: string;
}

/**
 * Phase 7: Source Control Panel
 * Provides a high-fidelity view of current git state with monospace standardization.
 */
export const SourcePanel: React.FC = () => {
  const [data, setData] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/internal/git-status');
      if (!res.ok) throw new Error('Failed to fetch git status');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Refresh every 30s
    const timer = setInterval(fetchStatus, 30000);
    return () => clearInterval(timer);
  }, []);

  const mono = "'Menlo', 'Monaco', 'Courier New', monospace";

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-[var(--text-muted)]">
        <AlertCircle size={48} className="mb-4 opacity-20" />
        <p className="text-sm mb-4">{error}</p>
        <button 
          onClick={fetchStatus}
          className="px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--bg-app)] transition-colors text-xs"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/50">
        <div className="flex items-center gap-2">
          <Github size={18} className="text-[var(--text-muted)]" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Source Control</h2>
        </div>
        <div className="flex items-center gap-2">
           <button 
             onClick={fetchStatus}
             disabled={loading}
             className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
           >
             <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-0">
        {/* Branch Selector (Display Only) */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--border-subtle)]/30 group cursor-pointer hover:bg-[var(--bg-panel)]/30">
          <div className="flex items-center gap-3">
             <div className="p-1.5 rounded bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)]">
               <GitBranch size={14} />
             </div>
             <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-tighter">Current Branch</div>
                <div className="text-[13px] font-bold" style={{ fontFamily: mono }}>{data?.branch || 'HEAD'}</div>
             </div>
          </div>
          <ArrowRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all" />
        </div>

        {/* Changes Section */}
        <div className="p-4">
           <div className="flex items-center gap-2 mb-3">
              <Sparkles size={12} className="text-[var(--solar-cyan)]" />
              <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase">Changes</h3>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-panel)] text-[var(--text-muted)]" style={{ fontFamily: mono }}>
                {(data?.staged.length || 0) + (data?.unstaged.length || 0)}
              </span>
           </div>

           <div className="space-y-1">
              {data?.staged.map((f, i) => (
                <FileItem key={`staged-${i}`} path={f.path} status={f.status} isStaged />
              ))}
              {data?.unstaged.map((f, i) => (
                <FileItem key={`unstaged-${i}`} path={f.path} status={f.status} />
              ))}
              {!data?.staged.length && !data?.unstaged.length && (
                <div className="py-8 text-center border-2 border-dashed border-[var(--border-subtle)]/30 rounded-xl">
                   <CheckCircle2 size={24} className="mx-auto mb-2 text-[var(--solar-green)] opacity-20" />
                   <p className="text-[11px] text-[var(--text-muted)]">Working directory clean</p>
                </div>
              )}
           </div>
        </div>

        {/* History Section */}
        <div className="p-4 pt-0">
           <div className="flex items-center gap-2 mb-3">
              <Clock size={12} className="text-[var(--text-muted)]" />
              <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase">Recent History</h3>
           </div>
           
           <div className="bg-[var(--bg-panel)]/30 rounded-xl border border-[var(--border-subtle)]/30 overflow-hidden divide-y divide-[var(--border-subtle)]/20">
              {data?.commits.map((c, i) => (
                <div key={i} className="p-3 hover:bg-[var(--bg-panel)]/50 transition-colors cursor-pointer group">
                   <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-[var(--solar-cyan)] font-mono" style={{ fontFamily: mono }}>{c.hash}</span>
                      <span className="text-[10px] text-[var(--text-muted)] opacity-60">{c.date}</span>
                   </div>
                   <div className="text-[12px] font-medium text-[var(--text-main)] line-clamp-1 group-hover:text-[var(--solar-cyan)] transition-colors">{c.msg}</div>
                   <div className="text-[10px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] opacity-30" />
                      {c.author}
                   </div>
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* Footer / Action */}
      <div className="p-4 border-top border-[var(--border-subtle)] bg-[var(--bg-panel)]/50">
         <div className="flex flex-col gap-2">
            <input 
              type="text"
              placeholder="Post-reversion commit message..."
              className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--solar-cyan)] outline-none"
            />
            <button className="w-full py-2 bg-[var(--solar-cyan)]/10 hover:bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2">
              <GitCommit size={14} />
              Commit Changes
            </button>
         </div>
      </div>
    </div>
  );
};

const FileItem: React.FC<{ path: string; status: string; isStaged?: boolean }> = ({ path, status, isStaged }) => {
  const parts = path.split('/');
  const name = parts.pop();
  const dir = parts.join('/');
  const mono = "'Menlo', 'Monaco', 'Courier New', monospace";

  const getStatusColor = () => {
    if (status.includes('M')) return 'text-[#dab98f]'; // Modified (Solarized base1)
    if (status.includes('A') || status.includes('?')) return 'text-[var(--solar-green)]';
    if (status.includes('D')) return 'text-[var(--solar-red)]';
    return 'text-[var(--text-muted)]';
  };

  return (
    <div className="flex items-center gap-3 p-2 hover:bg-[var(--bg-panel)]/50 rounded-lg transition-colors cursor-pointer group">
       <div className={`text-[10px] w-4 text-center font-bold ${getStatusColor()}`} style={{ fontFamily: mono }}>
         {status.includes('?') ? 'U' : status[0]}
       </div>
       <div className="p-1 px-1.5 rounded bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-subtle)] group-hover:border-[var(--solar-cyan)]/30 transition-colors">
          <FileCode size={12} />
       </div>
       <div className="min-w-0">
          <div className="text-[12px] font-medium text-[var(--text-main)] truncate" style={{ fontFamily: mono }}>{name}</div>
          {dir && <div className="text-[9px] text-[var(--text-muted)] truncate opacity-50">{dir}</div>}
       </div>
       {isStaged && (
         <div className="ml-auto flex items-center gap-1 text-[9px] text-[var(--solar-cyan)] opacity-60">
            <Sparkles size={8} />
            STAGED
         </div>
       )}
    </div>
  );
};
