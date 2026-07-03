import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Folder, Loader2, RefreshCw } from 'lucide-react';
import { SetiFileIcon } from '../src/components/SetiFileIcon';

type SandboxEntry = {
  name: string;
  dir: boolean;
  path: string;
};

type TreeResponse = {
  ok?: boolean;
  error?: string;
  root?: string;
  path?: string;
  entries?: { name: string; dir?: boolean; path: string }[];
};

export const ContainerExplorer: React.FC<{ embedded?: boolean }> = ({ embedded = true }) => {
  const [relPath, setRelPath] = useState('');
  const [rootLabel, setRootLabel] = useState('/mnt/workspace');
  const [entries, setEntries] = useState<SandboxEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);

  const loadTree = useCallback(async (path: string) => {
    setLoading(true);
    setErr(null);
    try {
      const qs = path.trim() ? `?path=${encodeURIComponent(path.trim())}` : '';
      const r = await fetch(`/api/sandbox/v1/workspace/tree${qs}`, { credentials: 'same-origin' });
      const data = (await r.json().catch(() => ({}))) as TreeResponse;
      if (!r.ok || data.ok === false) {
        throw new Error(data.error || r.statusText || 'Sandbox tree unavailable');
      }
      if (typeof data.root === 'string' && data.root.trim()) setRootLabel(data.root.trim());
      setRelPath(typeof data.path === 'string' ? data.path : path);
      setEntries(
        (data.entries || []).map((e) => ({
          name: e.name,
          dir: e.dir === true,
          path: e.path,
        })),
      );
      setReady(true);
    } catch (e) {
      setErr(String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/sandbox/health', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ok?: boolean } | null) => {
        if (!cancelled) setReady(d?.ok === true ? true : false);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadTree('');
  }, [loadTree]);

  const parentPath = (() => {
    const p = relPath.replace(/\/+$/, '');
    if (!p) return '';
    const i = p.lastIndexOf('/');
    return i <= 0 ? '' : p.slice(0, i);
  })();

  return (
    <div
      className={`flex flex-col min-h-0 overflow-hidden ${embedded ? 'h-full bg-[var(--bg-filetree,#0d1117)]' : ''}`}
    >
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border-subtle)]/30">
        {relPath ? (
          <button
            type="button"
            className="text-[10px] text-[var(--solar-cyan)] hover:underline px-1"
            onClick={() => void loadTree(parentPath)}
          >
            Up
          </button>
        ) : null}
        <span className="text-[10px] text-muted truncate flex-1 font-mono" title={`${rootLabel}/${relPath}`}>
          {relPath ? `${rootLabel}/${relPath}` : rootLabel}
        </span>
        <button
          type="button"
          title="Refresh"
          className="p-1 rounded hover:bg-[var(--bg-hover)] text-muted"
          onClick={() => void loadTree(relPath)}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {ready === false ? (
        <p className="px-3 py-4 text-[10px] text-[var(--solar-orange)] leading-relaxed">
          Sandbox container is not ready. Check status bar or run a command in the CF sandbox terminal lane.
        </p>
      ) : null}

      {err ? (
        <p className="px-3 py-2 text-[10px] text-[var(--solar-orange)] font-mono">{err}</p>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 py-1 font-mono text-[11px]">
        {loading && entries.length === 0 ? (
          <div className="flex items-center gap-1.5 px-2 py-2 text-muted">
            <Loader2 size={12} className="animate-spin" /> Loading sandbox tree…
          </div>
        ) : null}

        {entries.map((e) => (
          <button
            key={e.path || e.name}
            type="button"
            className="flex items-center gap-1.5 w-full px-2 py-1 hover:bg-[var(--bg-hover)] rounded text-left"
            onClick={() => {
              if (e.dir) void loadTree(e.path);
            }}
            disabled={!e.dir}
            title={e.dir ? `Open ${e.name}` : e.name}
          >
            {e.dir ? (
              <>
                <Folder size={13} className="text-[var(--solar-blue)] shrink-0" />
                <span className="truncate flex-1">{e.name}</span>
                <ChevronRight size={11} className="text-muted shrink-0" />
              </>
            ) : (
              <>
                <SetiFileIcon filename={e.name} size={13} />
                <span className="truncate flex-1 text-muted">{e.name}</span>
              </>
            )}
          </button>
        ))}

        {!loading && !err && entries.length === 0 && ready !== false ? (
          <p className="text-[10px] italic text-muted px-2 py-2">Empty directory.</p>
        ) : null}
      </div>
    </div>
  );
};

export default ContainerExplorer;
