import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Film, Loader2, Music, Image as ImageIcon, Play } from 'lucide-react';
import { detectFileKind } from '../../src/lib/fileKind';
import type { MediaLibraryItem } from './types';

type FileNode = {
  name: string;
  kind: 'file' | 'directory';
  handle?: FileSystemHandle;
  children?: FileNode[];
};

async function collectMediaFromHandle(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: MediaLibraryItem[],
): Promise<void> {
  for await (const entry of dir.values()) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      await collectMediaFromHandle(entry as FileSystemDirectoryHandle, path, out);
      continue;
    }
    const file = await (entry as FileSystemFileHandle).getFile();
    const kind = detectFileKind({ name: file.name, contentType: file.type, size: file.size });
    if (kind !== 'video' && kind !== 'audio' && kind !== 'image') continue;
    const objectUrl = URL.createObjectURL(file);
    out.push({
      id: `local:${path}`,
      name: file.name,
      kind,
      previewUrl: objectUrl,
      contentType: file.type,
      size: file.size,
      source: 'local',
      workspacePath: path,
    });
  }
}

function revokeLocalBlobUrls(items: MediaLibraryItem[]) {
  for (const i of items) {
    if (i.source === 'local' && i.previewUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(i.previewUrl);
      } catch {
        /* ignore */
      }
    }
  }
}

export const MediaLibrary: React.FC<{
  rootHandle: FileSystemDirectoryHandle | null;
  onOpenInMovieMode: (item: MediaLibraryItem) => void;
  onOpenPreview?: (item: MediaLibraryItem) => void;
}> = ({ rootHandle, onOpenInMovieMode, onOpenPreview }) => {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [apiItems, setApiItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rootHandleRef = useRef(rootHandle);
  rootHandleRef.current = rootHandle;
  const localBlobItemsRef = useRef<MediaLibraryItem[]>([]);
  const apiFetchStartedRef = useRef(false);
  const scanGenRef = useRef(0);

  const rootFolderKey = rootHandle?.name ?? '';

  const loadApiAssets = useCallback(async (signal: AbortSignal) => {
    const res = await fetch('/api/media/assets', { credentials: 'same-origin', signal });
    const data = (await res.json().catch(() => ({}))) as {
      assets?: Array<Record<string, unknown>>;
      error?: string;
    };
    if (!res.ok) {
      setApiItems([]);
      if (data.error) setErr(data.error);
      return;
    }
    const mapped: MediaLibraryItem[] = (data.assets || []).map((a) => {
      const key = String(a.r2_key || a.key || '');
      const bucket = String(a.r2_bucket || a.bucket || 'inneranimalmedia');
      const name = key.split('/').pop() || String(a.filename || a.id || 'asset');
      const ct = String(a.content_type || a.mime_type || '');
      const kind = detectFileKind({ name, key, contentType: ct });
      return {
        id: `api:${a.id}`,
        name,
        kind: kind === 'text' ? 'binary' : kind,
        previewUrl: `/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`,
        contentType: ct,
        size: typeof a.size_bytes === 'number' ? a.size_bytes : null,
        source: 'api' as const,
        r2Bucket: bucket,
        r2Key: key,
        assetId: String(a.id || ''),
      };
    });
    setApiItems(mapped.filter((i) => i.kind === 'video' || i.kind === 'audio' || i.kind === 'image'));
  }, []);

  const scanLocal = useCallback(async () => {
    const handle = rootHandleRef.current;
    const gen = ++scanGenRef.current;
    if (!handle) {
      revokeLocalBlobUrls(localBlobItemsRef.current);
      localBlobItemsRef.current = [];
      setItems([]);
      return;
    }
    setLoading(true);
    setErr(null);
    const local: MediaLibraryItem[] = [];
    try {
      await collectMediaFromHandle(handle, '', local);
      if (gen !== scanGenRef.current) {
        revokeLocalBlobUrls(local);
        return;
      }
      const prev = localBlobItemsRef.current;
      const nextIds = new Set(local.map((i) => i.id));
      for (const old of prev) {
        if (!nextIds.has(old.id) && old.source === 'local' && old.previewUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(old.previewUrl);
          } catch {
            /* ignore */
          }
        }
      }
      localBlobItemsRef.current = local;
      setItems(local);
    } catch (e) {
      if (gen === scanGenRef.current) {
        setErr(e instanceof Error ? e.message : 'Failed to scan local media');
      }
    } finally {
      if (gen === scanGenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (apiFetchStartedRef.current) return;
    apiFetchStartedRef.current = true;
    const ac = new AbortController();
    void (async () => {
      try {
        await loadApiAssets(ac.signal);
      } catch (e) {
        if (ac.signal.aborted) return;
        setErr(e instanceof Error ? e.message : 'Failed to load media');
      }
    })();
    return () => {
      ac.abort();
      apiFetchStartedRef.current = false;
    };
  }, [loadApiAssets]);

  useEffect(() => {
    void scanLocal();
  }, [rootFolderKey, scanLocal]);

  useEffect(() => {
    return () => {
      revokeLocalBlobUrls(localBlobItemsRef.current);
      localBlobItemsRef.current = [];
    };
  }, []);

  const refresh = useCallback(async () => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    try {
      await Promise.all([scanLocal(), loadApiAssets(ac.signal)]);
    } catch (e) {
      if (!ac.signal.aborted) {
        setErr(e instanceof Error ? e.message : 'Failed to load media');
      }
    } finally {
      setLoading(false);
    }
  }, [loadApiAssets, scanLocal]);

  const all = [...items, ...apiItems];

  const iconFor = (kind: MediaLibraryItem['kind']) => {
    if (kind === 'audio') return <Music size={12} className="text-[var(--solar-magenta)]" />;
    if (kind === 'image') return <ImageIcon size={12} className="text-[var(--solar-green)]" />;
    return <Film size={12} className="text-[var(--solar-cyan)]" />;
  };

  return (
    <div className="flex flex-col min-h-[160px] max-h-[min(40vh,320px)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--border-subtle)]/40">
        <span className="text-[10px] text-[var(--text-muted)]">{all.length} items</span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-[10px] text-[var(--solar-cyan)] hover:underline"
        >
          Refresh
        </button>
      </div>
      {loading && (
        <div className="flex items-center gap-2 p-3 text-[11px] text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Scanning…
        </div>
      )}
      {err && <p className="px-3 py-2 text-[10px] text-red-400">{err}</p>}
      {!loading && all.length === 0 && (
        <p className="px-3 py-4 text-[11px] text-[var(--text-muted)] leading-relaxed">
          Connect a local folder or upload to R2 / MovieMode to see clips here.
        </p>
      )}
      <ul className="flex-1 overflow-y-auto py-1">
        {all.map((item) => (
          <li key={item.id}>
            <div className="flex items-center gap-1 px-2 py-1 hover:bg-[var(--bg-hover)] group">
              {iconFor(item.kind)}
              <button
                type="button"
                className="flex-1 text-left text-[12px] truncate text-[var(--text-main)]"
                onClick={() => onOpenInMovieMode(item)}
                title="Open in MovieMode editor"
              >
                {item.name}
              </button>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--dashboard-border)]"
                onClick={() => (onOpenPreview ? onOpenPreview(item) : onOpenInMovieMode(item))}
                title="Preview"
              >
                <Play size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};