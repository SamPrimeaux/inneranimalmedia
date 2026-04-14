import React, { useState, useEffect } from 'react';
import { Globe, Play, RefreshCw, CheckCircle2, Clock, AlertCircle, ExternalLink, Search, Trash2 } from 'lucide-react';

interface PlaywrightJob {
    id: string;
    job_type: string;
    target_url: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result_url?: string;
    error?: string;
    created_at: string;
    completed_at?: string;
    metadata?: string;
    output_type?: string;
    triggered_by?: string;
}

export const PlaywrightConsole: React.FC = () => {
    const [jobs, setJobs] = useState<PlaywrightJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [targetUrl, setTargetUrl] = useState('');
    const [isLaunching, setIsLaunching] = useState(false);

    const fetchJobs = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/d1/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    sql: `SELECT id, job_type, url, status, result_url, error, created_at, completed_at, metadata, output_type
                          FROM playwright_jobs ORDER BY rowid DESC LIMIT 50`,
                }),
            });
            const data = await res.json();
            if (!data.success || !Array.isArray(data.results)) {
                setJobs([]);
                return;
            }
            const mapped: PlaywrightJob[] = data.results.map((r: Record<string, unknown>) => {
                const st = String(r.status || 'pending');
                const normalized =
                    st === 'error' ? 'failed' : st === 'completed' || st === 'pending' || st === 'running' ? st : 'pending';
                return {
                    id: String(r.id || ''),
                    job_type: String(r.job_type || 'screenshot'),
                    target_url: String(r.url || ''),
                    status: normalized as PlaywrightJob['status'],
                    result_url: r.result_url != null ? String(r.result_url) : undefined,
                    error: r.error != null ? String(r.error) : undefined,
                    created_at: String(r.created_at || new Date().toISOString()),
                    completed_at: r.completed_at != null ? String(r.completed_at) : undefined,
                    metadata: r.metadata != null ? String(r.metadata) : undefined,
                    output_type: r.output_type != null ? String(r.output_type) : undefined,
                    triggered_by: r.triggered_by != null ? String(r.triggered_by) : undefined,
                };
            });
            setJobs(mapped);
        } catch (err) {
            console.error('Failed to fetch jobs:', err);
            setJobs([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 10000); 
        return () => clearInterval(interval);
    }, []);

    const handleLaunchJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetUrl) return;

        setIsLaunching(true);
        try {
            const res = await fetch('/api/agent/playwright', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    url: targetUrl,
                    job_type: 'screenshot',
                    triggered_by: 'playwright_console' 
                }),
            });
            const data = await res.json();
            if (res.ok && (data.id || data.jobId)) {
                setTargetUrl('');
                fetchJobs();
            }
        } catch (err) {
            console.error('Failed to launch job:', err);
        } finally {
            setIsLaunching(false);
        }
    };

    const handleDeleteJob = async (jobId: string) => {
        try {
            const res = await fetch(`/api/agent/playwright/jobs/${jobId}`, { method: 'DELETE' });
            if (res.ok) {
                setJobs(prev => prev.filter(j => j.id !== jobId));
            }
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 size={14} className="text-[var(--solar-green)]" />;
            case 'failed': return <AlertCircle size={14} className="text-[var(--solar-red)]" />;
            case 'running': return <RefreshCw size={14} className="text-[var(--solar-blue)] animate-spin" />;
            default: return <Clock size={14} className="text-[var(--solar-yellow)]" />;
        }
    };

    const triggerLabel: Record<string, string> = {
        'agent_sam':          'Agent',
        'browser_search':     'Agent search',
        'user_ui':            'Manual',
        'playwright_console': 'Console test',
        'page_monitor':       'Monitor',
        'cron':               'Scheduled',
        'api':                'API',
    };

    const filteredJobs = jobs.filter(j => 
        j.target_url.toLowerCase().includes(searchTerm.toLowerCase()) || 
        j.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-[var(--bg-app)] text-[var(--text-main)] font-sans select-none">
            {/* Header */}
            <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Globe size={18} className="text-[var(--solar-cyan)]" />
                        <h2 className="text-sm font-bold uppercase tracking-wider">Playwright Jobs</h2>
                    </div>
                    <button 
                        onClick={fetchJobs}
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"
                        title="Refresh List"
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Launch Form */}
                <form onSubmit={handleLaunchJob} className="flex gap-2">
                    <div className="relative flex-1">
                        <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input 
                            type="text" 
                            placeholder="https://example.com"
                            value={targetUrl}
                            onChange={(e) => setTargetUrl(e.target.value)}
                            className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-md py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--solar-cyan)] transition-colors"
                        />
                    </div>
                    <button 
                        type="submit"
                        disabled={isLaunching || !targetUrl}
                        className="bg-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/80 text-[var(--bg-app)] px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Play size={14} fill="currentColor" />
                        {isLaunching ? 'Launching...' : 'Run Test'}
                    </button>
                </form>

                {/* Filter */}
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input 
                        type="text" 
                        placeholder="Search jobs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-md py-1 pr-3 pl-9 text-[12px] focus:outline-none focus:border-[var(--solar-cyan)]/50 transition-colors"
                    />
                </div>
            </div>

            {/* Main Grid */}
            <div className="flex-1 overflow-hidden relative">
                {isLoading && jobs.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-app)]/50 z-10">
                        <div className="flex flex-col items-center gap-2">
                            <RefreshCw size={24} className="animate-spin text-[var(--solar-cyan)]" />
                            <span className="text-xs text-[var(--text-muted)]">Loading automation history...</span>
                        </div>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-40">
                         <Globe size={48} strokeWidth={1} />
                         <p className="mt-2 text-sm">No Playwright jobs recorded yet.</p>
                    </div>
                ) : (
                    <div className="h-full overflow-auto p-2">
                         <div className="grid grid-cols-1 gap-2">
                             {filteredJobs.map(job => (
                                 <div key={job.id} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)]/50 rounded-lg p-3 hover:border-[var(--solar-cyan)]/30 transition-all group">
                                     <div className="flex items-start justify-between mb-2">
                                         <div className="flex items-center gap-2">
                                             {getStatusIcon(job.status)}
                                             <span className="text-[10px] font-mono opacity-60 uppercase tracking-tighter">{job.job_type}</span>
                                             <span className="text-[10px] bg-[var(--bg-app)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] font-bold">
                                                 {triggerLabel[job.triggered_by || ''] || job.triggered_by || 'UNKNOWN'}
                                             </span>
                                         </div>
                                         <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-[var(--text-muted)]">{new Date(job.created_at).toLocaleString()}</span>
                                            <button
                                                onClick={() => handleDeleteJob(job.id)}
                                                title="Delete job"
                                                className="text-[var(--text-muted)] hover:text-[var(--solar-red)] transition-colors"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                         </div>
                                     </div>
                                     
                                     <div className="text-[13px] font-medium truncate mb-2 text-[var(--solar-cyan)] flex items-center gap-2">
                                         {job.target_url}
                                         <a href={job.target_url} target="_blank" rel="noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                             <ExternalLink size={12} className="text-[var(--text-muted)]" />
                                         </a>
                                     </div>

                                     {job.status === 'completed' && job.result_url && (job.job_type === 'screenshot' || job.output_type === 'image') && (
                                        <div className="mt-2 mb-3 overflow-hidden rounded-md border border-[var(--border-subtle)]">
                                            <img
                                                src={job.result_url}
                                                alt={`Screenshot of ${job.target_url}`}
                                                className="w-full h-auto block"
                                                loading="lazy"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        </div>
                                     )}

                                     {job.error && (
                                         <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-[11px] text-red-400 font-mono italic">
                                             {job.error}
                                         </div>
                                     )}

                                     <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]/30 flex items-center justify-between">
                                         <div className="text-[10px] text-[var(--text-muted)] font-mono truncate max-w-[150px]">
                                             ID: {job.id}
                                         </div>
                                         {job.result_url && (
                                             <a 
                                                href={job.result_url} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="text-[10px] font-bold text-[var(--solar-cyan)] hover:underline flex items-center gap-1"
                                             >
                                                 {job.job_type === 'screenshot' || job.output_type === 'image' ? 'VIEW SCREENSHOT' : 'VIEW ARTIFACT'} <ExternalLink size={10} />
                                             </a>
                                         )}
                                     </div>
                                 </div>
                             ))}
                         </div>
                    </div>
                )}
            </div>
            
            {/* Footer Stats */}
            <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
                <span>TOTAL JOBS: {jobs.length}</span>
                <span>STATUS: {isLoading ? 'POLLING...' : 'STABLE'}</span>
            </div>
        </div>
    );
};
