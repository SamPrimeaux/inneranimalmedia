import React, { useCallback, useMemo, useState } from 'react';
import {
  Search,
  Loader2,
  FileText,
  Github,
  BookOpen,
  FolderOpen,
  ExternalLink,
} from 'lucide-react';

type SearchResultKind = 'workspace_file' | 'github_file' | 'knowledge' | 'conversation';

type SearchResult = {
  id: string;
  kind: SearchResultKind;
  title: string;
  path?: string;
  repo?: string;
  url?: string;
  snippet?: string;
  score?: number;
  content?: string;
  githubPath?: string;
  githubRepo?: string;
  githubSha?: string;
  r2Key?: string;
  r2Bucket?: string;
  workspacePath?: string;
};

type UnifiedSearchResponse = {
  results?: SearchResult[];
  counts?: Partial<Record<SearchResultKind, number>>;
  duration_ms?: number;
  error?: string;
};

export const KnowledgeSearchPanel: React.FC<{
  onClose?: () => void;
  onOpenFile?: (file: {
    name: string;
    content: string;
    originalContent?: string;
    githubPath?: string;
    githubRepo?: string;
    githubSha?: string;
    workspacePath?: string;
    r2Key?: string;
    r2Bucket?: string;
  }) => void;
  onOpenBrowserUrl?: (url: string) => void;
}> = ({ onClose, onOpenFile, onOpenBrowserUrl }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | SearchResultKind>('all');

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return results;
    return results.filter(r => r.kind === activeFilter);
  }, [results, activeFilter]);

  const grouped = useMemo(() => {
    return {
      workspace: filtered.filter(r => r.kind === 'workspace_file'),
      github: filtered.filter(r => r.kind === 'github_file'),
      knowledge: filtered.filter(r => r.kind === 'knowledge'),
      conversations: filtered.filter(r => r.kind === 'conversation'),
    };
  }, [filtered]);

  const readGithubFile = useCallback(async (result: SearchResult) => {
    if (!result.githubRepo || !result.githubPath) {
      throw new Error('Missing GitHub file metadata');
    }
    const [owner, repo] = result.githubRepo.split('/');
    if (!owner || !repo) throw new Error('Invalid GitHub repo');
    const qs = new URLSearchParams({ path: result.githubPath });
    const res = await fetch(
      `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?${qs}`,
      { credentials: 'same-origin' }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.type !== 'file' || typeof data.content !== 'string') {
      throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to load GitHub file');
    }

    const raw = String(data.content).replace(/\n/g, '');
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const text = new TextDecoder().decode(bytes);

    onOpenFile?.({
      name: data.name || result.title,
      content: text,
      originalContent: text,
      githubPath: result.githubPath,
      githubRepo: result.githubRepo,
      githubSha: typeof data.sha === 'string' ? data.sha : undefined,
    });
  }, [onOpenFile]);

  const readWorkspaceFile = useCallback(async (result: SearchResult) => {
    if (result.content) {
      onOpenFile?.({
        name: result.title,
        content: result.content,
        originalContent: result.content,
        workspacePath: result.workspacePath || result.path,
      });
      return;
    }

    if (!result.workspacePath && !result.path) {
      throw new Error('Missing workspace file path');
    }

    const target = result.workspacePath || result.path || '';
    const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(target)}`, {
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.content !== 'string') {
      throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to load workspace file');
    }

    onOpenFile?.({
      name: result.title,
      content: data.content,
      originalContent: data.content,
      workspacePath: target,
    });
  }, [onOpenFile]);

  const handleOpenResult = useCallback(async (result: SearchResult) => {
    setErr(null);
    try {
      if (result.kind === 'github_file') {
        await readGithubFile(result);
        return;
      }
      if (result.kind === 'workspace_file') {
        await readWorkspaceFile(result);
        return;
      }
      if (result.url && onOpenBrowserUrl) {
        onOpenBrowserUrl(result.url);
        return;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to open result');
    }
  }, [onOpenBrowserUrl, readGithubFile, readWorkspaceFile]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setErr('Enter at least 2 characters.');
      return;
    }

    setLoading(true);
    setErr(null);
    setResults([]);
    setDurationMs(null);

    try {
      const res = await fetch('/api/search/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          query: q,
          include: ['workspace_file', 'github_file', 'knowledge', 'conversation'],
          limit: 40,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as UnifiedSearchResponse;

      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Search failed (${res.status})`);
      }

      const normalized = Array.isArray(data.results) ? data.results : [];
      setResults(normalized);
      setDurationMs(typeof data.duration_ms === 'number' ? data.duration_ms : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const FilterButton = ({
    label,
    value,
  }: {
    label: string;
    value: 'all' | SearchResultKind;
  }) => (
    <button
      type="button"
      onClick={() => setActiveFilter(value)}
      className={`px-2 py-1 rounded border text-[10px] font-semibold uppercase tracking-wider ${
        activeFilter === value
          ? 'border-[var(--solar-cyan)] text-[var(--solar-cyan)] bg-[var(--solar-cyan)]/10'
          : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
      }`}
    >
      {label}
    </button>
  );

  const ResultRow = ({ result }: { result: SearchResult }) => {
    const Icon =
      result.kind === 'github_file'
        ? Github
        : result.kind === 'workspace_file'
        ? FolderOpen
        : result.kind === 'knowledge'
        ? BookOpen
        : FileText;

    return (
      <button
        type="button"
        onClick={() => void handleOpenResult(result)}
        className="w-full text-left px-3 py-2 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        <div className="flex items-start gap-2">
          <Icon size={14} className="mt-0.5 shrink-0 text-[var(--solar-cyan)]" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-[var(--text-main)] truncate">{result.title}</div>
            {(result.path || result.githubPath || result.repo) && (
              <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                {result.repo ? `${result.repo} · ` : ''}
                {result.githubPath || result.path}
              </div>
            )}
            {result.snippet && (
              <div className="text-[11px] text-[var(--text-muted)] mt-1 whitespace-pre-wrap break-words line-clamp-3">
                {result.snippet}
              </div>
            )}
          </div>
          {result.url ? <ExternalLink size={12} className="mt-1 shrink-0 text-[var(--text-muted)]" /> : null}
        </div>
      </button>
    );
  };

  const Section = ({ title, items }: { title: string; items: SearchResult[] }) => {
    if (!items.length) return null;
    return (
      <div className="border border-[var(--border-subtle)] rounded-md overflow-hidden">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] bg-[var(--bg-elevated)]">
          {title} · {items.length}
        </div>
        <div>
          {items.map((item) => (
            <ResultRow key={item.id} result={item} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-[var(--bg-panel)] text-[var(--text-main)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Search size={14} className="text-[var(--solar-cyan)] shrink-0" />
          <span className="text-[11px] font-bold tracking-widest uppercase truncate">
            Search files and knowledge
          </span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] px-2 py-1 rounded border border-[var(--border-subtle)]"
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="p-3 border-b border-[var(--border-subtle)] flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2 rounded border border-[var(--border-subtle)] px-2 py-1.5 bg-[var(--bg-app)]">
          <Search size={14} className="text-[var(--text-muted)] shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
            }}
            placeholder="Search repos, files, docs, knowledge..."
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <FilterButton label="All" value="all" />
          <FilterButton label="Workspace" value="workspace_file" />
          <FilterButton label="GitHub" value="github_file" />
          <FilterButton label="Knowledge" value="knowledge" />
          <FilterButton label="Chats" value="conversation" />
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => void runSearch()}
          className="flex items-center justify-center gap-2 py-2 rounded text-[11px] font-semibold bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Run search
        </button>

        {durationMs != null ? (
          <div className="text-[10px] text-[var(--text-muted)] font-mono">{durationMs} ms</div>
        ) : null}

        {err ? <div className="text-[11px] text-[var(--solar-orange)]">{err}</div> : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {!loading && results.length === 0 ? (
          <div className="text-[11px] text-[var(--text-muted)]">
            Search across workspace files, GitHub files, indexed knowledge, and conversations.
          </div>
        ) : null}

        <Section title="Workspace files" items={grouped.workspace} />
        <Section title="GitHub files" items={grouped.github} />
        <Section title="Knowledge" items={grouped.knowledge} />
        <Section title="Conversations" items={grouped.conversations} />
      </div>
    </div>
  );
};
