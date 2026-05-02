import React, { useCallback, useState } from 'react';
import { Search, Loader2, MessageSquare, Info } from 'lucide-react';

/**
 * Cloudflare AI Search (AutoRAG) Interface
 * POSTs to /api/search with mode='search' (retrieval) or mode='chat' (RAG).
 */
export const AISearchPanel: React.FC = () => {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'search' | 'chat'>('search');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);

  const run = useCallback(async () => {
    const query = q.trim();
    if (!query) {
      setErr('Query required');
      return;
    }
    setLoading(true);
    setErr(null);
    setResults(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ query, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || `Request failed (${res.status})`);
        return;
      }
      setResults(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [q, mode]);

  return (
    <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden min-h-0 border-l border-[var(--border-subtle)]">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[var(--bg-app)]">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-[var(--solar-cyan)]" />
          <span className="text-[11px] font-bold tracking-widest uppercase">AutoRAG Search</span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4 shrink-0 border-b border-[var(--border-subtle)]">
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about the knowledge base..."
          className="w-full h-24 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded p-2 text-[13px] outline-none focus:border-[var(--solar-cyan)] transition-colors resize-none"
        />

        <div className="flex items-center justify-between">
          <div className="flex bg-[var(--bg-app)] rounded p-0.5 border border-[var(--border-subtle)]">
            <button
              onClick={() => setMode('search')}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded ${
                mode === 'search' ? 'bg-[var(--solar-cyan)] text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              Retrieval
            </button>
            <button
              onClick={() => setMode('chat')}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded ${
                mode === 'chat' ? 'bg-[var(--solar-cyan)] text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              RAG Chat
            </button>
          </div>

          <button
            disabled={loading || !q.trim()}
            onClick={run}
            className="flex items-center gap-2 px-4 py-1.5 bg-[var(--solar-cyan)] text-black rounded font-bold text-[11px] uppercase tracking-wider hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {mode === 'chat' ? 'Ask Sam' : 'Search'}
          </button>
        </div>
        {err && <p className="text-[11px] text-[var(--solar-orange)]">{err}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!results && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 gap-3 px-8">
            <Info size={32} />
            <p className="text-[12px]">Enter a query to search indexed documentation, workflows, and memory via Cloudflare AI Search.</p>
          </div>
        )}

        {results && mode === 'chat' && (
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded p-4">
            <div className="flex items-center gap-2 mb-3 text-[var(--solar-cyan)]">
              <MessageSquare size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Generated Answer</span>
            </div>
            <div className="text-[14px] leading-relaxed whitespace-pre-wrap text-[var(--text-primary)]">
              {results.choices?.[0]?.message?.content || results.answer || 'No response generated.'}
            </div>
          </div>
        )}

        {results && mode === 'search' && (
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
              Retrieved Chunks ({results.results?.length || 0})
            </div>
            {results.results?.map((res: any, i: number) => (
              <div key={i} className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded overflow-hidden">
                <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-black/10">
                  <span className="text-[10px] font-mono text-[var(--solar-cyan)]">Score: {res.score?.toFixed(4) || '0.0000'}</span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)] truncate ml-4">{res.metadata?.source || 'unknown source'}</span>
                </div>
                <div className="p-3 text-[12px] font-mono leading-relaxed text-[var(--text-main)]/80">
                  {res.text || res.content || JSON.stringify(res)}
                </div>
              </div>
            ))}
            {(!results.results || results.results.length === 0) && (
              <p className="text-[11px] text-[var(--text-muted)]">No relevant knowledge chunks found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
