import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, CheckCircle2, Clock, AlertCircle,
  ExternalLink, Search, Trash2, Camera, Globe,
} from 'lucide-react';

interface PlaywrightJob {
  id: string;
  job_type: string;
  target_url: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result_url?: string;
  error?: string;
  created_at: string;
  completed_at?: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 size={12} className="text-green-400 shrink-0" />,
  pending:   <Clock        size={12} className="text-yellow-400 shrink-0 animate-pulse" />,
  running:   <Clock        size={12} className="text-[var(--color-primary)] shrink-0 animate-pulse" />,
  failed:    <AlertCircle  size={12} className="text-red-400 shrink-0" />,
};

function openInBrowser(url: string) {
  window.dispatchEvent(new CustomEvent('iam-browser-navigate', { detail: { url } }));
  // Also open the Browser tab if it's not already open
  window.dispatchEvent(new CustomEvent('iam-open-tab', { detail: { tab: 'browser' } }));
}

function sendToChat(screenshotUrl: string, pageUrl: string) {
  window.dispatchEvent(new CustomEvent('iam-browser-screenshot-attach', {
    detail: { url: screenshotUrl, source: pageUrl },
  }));
}

export const PlaywrightConsole: React.FC = () => {
  const [jobs,       setJobs]       = useState<PlaywrightJob[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [total,      setTotal]      = useState(0);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/d1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          sql: `SELECT id, job_type, url, status, result_url, error, created_at, completed_at
                FROM playwright_jobs ORDER BY rowid DESC LIMIT 50`,
        }),
      });
      const data = await res.json();
      if (!data.success || !Array.isArray(data.results)) { setJobs([]); return; }
      const mapped: PlaywrightJob[] = data.results.map((r: Record<string, unknown>) => {
        const st = String(r.status || 'pending');
        const normalized = st === 'error' ? 'failed'
          : ['completed','pending','running','failed'].includes(st) ? st as PlaywrightJob['status']
          : 'pending';
        return {
          id:           String(r.id || ''),
          job_type:     String(r.job_type || 'screenshot'),
          target_url:   String(r.url || ''),
          status:       normalized,
          result_url:   r.result_url != null ? String(r.result_url) : undefined,
          error:        r.error != null ? String(r.error) : undefined,
          created_at:   String(r.created_at || ''),
          completed_at: r.completed_at != null ? String(r.completed_at) : undefined,
        };
      });
      setJobs(mapped);
      setTotal(mapped.length);
    } catch (e) {
      console.error('[PlaywrightConsole] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const deleteJob = async (id: string) => {
    setDeleting(id);
    try {
      await fetch('/api/d1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ sql: `DELETE FROM playwright_jobs WHERE id = '${id}'` }),
      });
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch {} finally { setDeleting(null); }
  };

  const filtered = jobs.filter(j =>
    !search || j.target_url.toLowerCase().includes(search.toLowerCase()) ||
    j.job_type.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (s: string) => {
    try { return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return s; }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-app)] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-panel)]">
        <Camera size={14} className="text-[var(--color-primary)]" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-main)]">
          Playwright Jobs
        </span>
        <span className="text-[9px] font-mono text-[var(--text-muted)] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded">
          {total} jobs
        </span>
        <div className="flex-1" />
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
          jobs.some(j => j.status === 'failed') ? 'bg-red-500/10 text-red-400'
          : 'bg-green-500/10 text-green-400'
        }`}>
          {jobs.some(j => j.status === 'failed') ? 'ERRORS' : 'STABLE'}
        </span>
        <button type="button" onClick={fetchJobs} disabled={loading}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] rounded transition-colors disabled:opacity-40">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] focus-within:border-[var(--color-primary)] transition-colors">
          <Search size={11} className="text-[var(--text-muted)] shrink-0" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs..."
            className="flex-1 bg-transparent text-[11px] font-mono text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none"
          />
        </div>
      </div>

      {/* Jobs list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-[var(--text-muted)]">
            <RefreshCw size={14} className="animate-spin" />
            <span className="text-[11px]">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-[var(--text-muted)]">
            <Camera size={20} className="opacity-30" />
            <span className="text-[11px]">No screenshots yet</span>
            <span className="text-[10px] opacity-60">Use the Browser tab to capture pages</span>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-[var(--border-subtle)]/40">
            {filtered.map(job => (
              <div key={job.id} className="p-3 hover:bg-[var(--bg-hover)] transition-colors group">
                {/* Row header */}
                <div className="flex items-center gap-2 mb-2">
                  {STATUS_ICON[job.status] || STATUS_ICON.pending}
                  <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] shrink-0">
                    {job.job_type}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--color-primary)] truncate flex-1">
                    {job.target_url}
                  </span>
                  <span className="text-[9px] text-[var(--text-muted)] shrink-0">
                    {formatDate(job.created_at)}
                  </span>
                </div>

                {/* Screenshot thumbnail */}
                {job.result_url && (
                  <div className="relative rounded overflow-hidden border border-[var(--border-subtle)] mb-2 bg-[var(--bg-panel)]">
                    <img
                      src={job.result_url}
                      alt={job.target_url}
                      className="w-full object-cover max-h-40"
                      loading="lazy"
                    />
                    {/* Hover actions overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button type="button"
                        onClick={() => sendToChat(job.result_url!, job.target_url)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-[10px] font-bold hover:opacity-90">
                        <Camera size={10} /> Send to Chat
                      </button>
                      <button type="button"
                        onClick={() => openInBrowser(job.target_url)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 text-white text-[10px] font-bold hover:bg-white/20 border border-white/20">
                        <Globe size={10} /> Open in Browser
                      </button>
                    </div>
                  </div>
                )}

                {/* Error */}
                {job.status === 'failed' && job.error && (
                  <p className="text-[10px] font-mono text-red-400 bg-red-500/10 rounded px-2 py-1 mb-2 break-all">
                    {job.error}
                  </p>
                )}

                {/* Footer actions */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-[var(--text-muted)] opacity-50 truncate flex-1">
                    {job.id.slice(0, 18)}...
                  </span>
                  {job.result_url && (
                    <a href={job.result_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[9px] text-[var(--color-primary)] hover:underline shrink-0">
                      <ExternalLink size={9} /> View
                    </a>
                  )}
                  <button type="button"
                    onClick={() => deleteJob(job.id)}
                    disabled={deleting === job.id}
                    className="p-0.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0 opacity-0 group-hover:opacity-100 disabled:opacity-30">
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaywrightConsole;
