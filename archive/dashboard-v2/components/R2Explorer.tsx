import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  File,
  Folder,
  Loader2,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  HardDrive,
  Trash2,
  Link2,
  Upload,
  ArrowRightLeft,
  FileCode2,
  Plus,
  FilePlus,
} from 'lucide-react';
import type { ActiveFile } from '../types';

/** Map bucket list label (from /api/r2/buckets) to /api/r2/file binding allowlist name */
function bucketLabelToBinding(label: string): string {
    const b = label.trim().toLowerCase();
    if (b === 'agent-sam' || b === 'tools') return 'DASHBOARD';
    if (b === 'agent-sam-sandbox-cicd' || b === 'inneranimalmedia-assets') return 'ASSETS';
    if (b === 'iam-platform') return 'R2';
    if (b === 'iam-docs') return 'DOCS_BUCKET';
    if (b === 'autorag') return 'AUTORAG_BUCKET';
    return 'DASHBOARD';
}

/** agent-sam and tools share env.DASHBOARD — one row per binding for dropdowns */
function dedupeR2BucketLabels(names: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of names) {
        const sig = bucketLabelToBinding(n);
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(n);
    }
    return out;
}

function parentR2Prefix(prefix: string): string {
    if (!prefix) return '';
    const trimmed = prefix.replace(/\/+$/, '');
    if (!trimmed) return '';
    const i = trimmed.lastIndexOf('/');
    return i < 0 ? '' : `${trimmed.slice(0, i + 1)}`;
}

/** Folders at current prefix plus file rows (handles flat keys when API omits delimiter prefixes). */
function partitionR2Listing(
    objects: R2ObjectRow[],
    apiPrefixes: string[],
    currentPrefix: string,
): { folders: string[]; files: R2ObjectRow[] } {
    const p = currentPrefix.replace(/\/$/, '');
    const pfx = p ? `${p}/` : '';
    const folderSet = new Set<string>();
    for (const pr of apiPrefixes) {
        if (typeof pr === 'string' && pr.startsWith(pfx)) folderSet.add(pr);
    }
    const files: R2ObjectRow[] = [];
    for (const obj of objects) {
        const k = obj.key;
        if (!k.startsWith(pfx)) continue;
        const rest = k.slice(pfx.length);
        const slash = rest.indexOf('/');
        if (slash < 0) {
            files.push(obj);
        } else {
            folderSet.add(pfx + rest.slice(0, slash + 1));
        }
    }
    const folders = [...folderSet].sort((a, b) => a.localeCompare(b));
    return { folders, files };
}

type R2ObjectRow = {
    key: string;
    size?: number;
    last_modified?: string | null;
    lastModified?: string | null;
};

export const R2Explorer: React.FC<{
    onOpenInEditor?: (file: ActiveFile) => void;
}> = ({ onOpenInEditor }) => {
    const [buckets, setBuckets] = useState<string[]>([]);
    const [bucket, setBucket] = useState<string>('');
    const [prefix, setPrefix] = useState('');
    const [searchQ, setSearchQ] = useState('');
    const [objects, setObjects] = useState<R2ObjectRow[]>([]);
    const [listPrefixes, setListPrefixes] = useState<string[]>([]);
    const [searchObjects, setSearchObjects] = useState<R2ObjectRow[]>([]);
    const [stats, setStats] = useState<{ object_count: number; total_bytes: number } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [syncSource, setSyncSource] = useState('');
    const [syncDest, setSyncDest] = useState('');
    const [syncPrefix, setSyncPrefix] = useState('');
    const [syncMsg, setSyncMsg] = useState<string | null>(null);
    const [searchActive, setSearchActive] = useState(false);
    const [objectPanelOpen, setObjectPanelOpen] = useState(true);

    const displayBuckets = useMemo(() => dedupeR2BucketLabels(buckets), [buckets]);

    const loadBuckets = useCallback(async () => {
        try {
            const res = await fetch('/api/r2/buckets', { credentials: 'same-origin' });
            const data = await res.json();
            const list = Array.isArray(data.buckets) ? data.buckets : [];
            setBuckets(list);
        } catch (err) {
            console.error('R2 buckets failed:', err);
            setBuckets([]);
        }
    }, []);

    const fetchObjects = useCallback(async () => {
        if (!bucket) return;
        setSearchActive(false);
        setIsLoading(true);
        try {
            const qs = new URLSearchParams({ bucket, prefix });
            const res = await fetch(`/api/r2/list?${qs}`, { credentials: 'same-origin' });
            const data = await res.json();
            setObjects(Array.isArray(data.objects) ? data.objects : []);
            setListPrefixes(Array.isArray(data.prefixes) ? data.prefixes : []);
        } catch (err) {
            console.error('R2 list failed:', err);
            setObjects([]);
            setListPrefixes([]);
        } finally {
            setIsLoading(false);
        }
    }, [bucket, prefix]);

    const fetchStats = useCallback(async () => {
        if (!bucket) {
            setStats(null);
            return;
        }
        try {
            const res = await fetch(`/api/r2/stats?bucket=${encodeURIComponent(bucket)}`, { credentials: 'same-origin' });
            const data = await res.json();
            if (res.ok && typeof data.object_count === 'number') {
                setStats({ object_count: data.object_count, total_bytes: data.total_bytes ?? 0 });
            } else {
                setStats(null);
            }
        } catch {
            setStats(null);
        }
    }, [bucket]);

    const runSearch = useCallback(async () => {
        if (!bucket) return;
        const q = searchQ.trim();
        const p = prefix.trim();
        if (q.length > 0 && q.length < 2 && p.length === 0) {
            setSearchObjects([]);
            return;
        }
        if (q.length === 0 && p.length === 0) {
            setSearchObjects([]);
            return;
        }
        setIsLoading(true);
        try {
            const qs = new URLSearchParams({ bucket });
            if (p) qs.set('prefix', p);
            if (q.length >= 2) qs.set('q', q);
            const res = await fetch(`/api/r2/search?${qs}`, { credentials: 'same-origin' });
            const data = await res.json();
            const rows = Array.isArray(data.objects) ? data.objects : Array.isArray(data) ? data : [];
            setSearchObjects(rows);
            setSearchActive(true);
        } catch (err) {
            console.error('R2 search failed:', err);
            setSearchObjects([]);
        } finally {
            setIsLoading(false);
        }
    }, [bucket, searchQ, prefix]);

    useEffect(() => {
        loadBuckets();
    }, [loadBuckets]);

    useEffect(() => {
        if (displayBuckets.length === 0) {
            setBucket('');
            return;
        }
        setBucket((prev) => (prev && displayBuckets.includes(prev) ? prev : displayBuckets[0]));
    }, [displayBuckets]);

    useEffect(() => {
        if (displayBuckets.length === 0) {
            setSyncSource('');
            setSyncDest('');
            return;
        }
        setSyncSource((s) => (s && displayBuckets.includes(s) ? s : displayBuckets[0]));
        setSyncDest((d) => (d && displayBuckets.includes(d) ? d : displayBuckets[1] ?? displayBuckets[0]));
    }, [displayBuckets]);

    useEffect(() => {
        if (bucket) {
            fetchObjects();
            fetchStats();
        }
    }, [bucket, prefix, fetchObjects, fetchStats]);

    const formatBytes = (n: number) => {
        if (!Number.isFinite(n) || n < 0) return '0 B';
        if (n < 1024) return `${n} B`;
        if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1048576).toFixed(2)} MB`;
    };

    const copyObjectUrl = async (key: string) => {
        try {
            const qs = new URLSearchParams({ bucket, key });
            const res = await fetch(`/api/r2/url?${qs}`, { credentials: 'same-origin' });
            const data = await res.json();
            const u = data.presigned_s3_url || data.url || data.public_url;
            if (u) await navigator.clipboard.writeText(u);
        } catch (e) {
            console.error(e);
        }
    };

    const deleteObject = async (key: string) => {
        if (!confirm(`Delete ${key}?`)) return;
        try {
            const res = await fetch('/api/r2/delete', {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bucket, key }),
            });
            if (res.ok) {
                await fetchObjects();
                await fetchStats();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !bucket) return;
        const key = prefix ? `${prefix.replace(/\/$/, '')}/${file.name}` : file.name;
        const fd = new FormData();
        fd.set('bucket', bucket);
        fd.set('key', key);
        fd.set('file', file);
        setIsLoading(true);
        try {
            const res = await fetch('/api/r2/upload', { method: 'POST', credentials: 'same-origin', body: fd });
            if (res.ok) {
                await fetchObjects();
                await fetchStats();
            }
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
    };

    const handleCreateR2File = async () => {
        if (!bucket) {
            alert('Please select a bucket first. Create new buckets via Cloudflare dashboard.');
            return;
        }
        const keyName = window.prompt('New file key (e.g. folder/file.txt):');
        if (!keyName) return;
        const binding = bucketLabelToBinding(bucket);
        setIsLoading(true);
        try {
            const res = await fetch('/api/r2/file', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bucket: binding, key: keyName, content: '' }),
            });
            if (res.ok) {
                await fetchObjects();
                await fetchStats();
            } else {
                const data = await res.json();
                alert('Create failed: ' + (data.error || res.statusText));
            }
        } catch (e) {
            console.error('R2 create failed:', e);
            alert('Create failed: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setIsLoading(false);
        }
    };

    const runSync = async () => {
        if (!syncSource || !syncDest) {
            setSyncMsg('Set source and dest buckets');
            return;
        }
        setSyncMsg(null);
        setIsLoading(true);
        try {
            const res = await fetch('/api/r2/sync', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_bucket: syncSource,
                    dest_bucket: syncDest,
                    prefix: syncPrefix,
                }),
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSyncMsg(`Copied ${data.copied} objects (${formatBytes(data.bytes || 0)})`);
                if (bucket === syncDest || bucket === syncSource) {
                    await fetchObjects();
                    await fetchStats();
                }
            } else {
                setSyncMsg(data.error || res.statusText || 'Sync failed');
            }
        } catch (e) {
            setSyncMsg(String(e));
        } finally {
            setIsLoading(false);
        }
    };

    const { folders: r2Folders, files: r2Files } = useMemo(
        () => partitionR2Listing(objects, listPrefixes, prefix),
        [objects, listPrefixes, prefix],
    );

    const shortKey = useCallback(
        (full: string) => (prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full),
        [prefix],
    );

    const openInEditor = async (key: string) => {
        if (!onOpenInEditor || !bucket) return;
        const binding = bucketLabelToBinding(bucket);
        setIsLoading(true);
        try {
            const qs = new URLSearchParams({ bucket: binding, key });
            const res = await fetch(`/api/r2/file?${qs}`, { credentials: 'same-origin' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const base = key.split('/').pop() || key;
            if (data.isImage === true) {
                onOpenInEditor({
                    name: base,
                    content: '',
                    originalContent: '',
                    r2Key: key,
                    r2Bucket: binding,
                    isImage: true,
                    isBinary: true,
                    previewUrl: typeof data.previewUrl === 'string' ? data.previewUrl : undefined,
                    contentType: typeof data.contentType === 'string' ? data.contentType : undefined,
                    size: typeof data.size === 'number' ? data.size : undefined,
                });
                return;
            }
            if (data.isBinary === true) {
                onOpenInEditor({
                    name: base,
                    content: '',
                    originalContent: '',
                    r2Key: key,
                    r2Bucket: binding,
                    isBinary: true,
                    contentType: typeof data.contentType === 'string' ? data.contentType : undefined,
                    size: typeof data.size === 'number' ? data.size : undefined,
                    binaryMessage: typeof data.message === 'string' ? data.message : undefined,
                });
                return;
            }
            if (typeof data.content !== 'string') return;
            onOpenInEditor({
                name: base,
                content: data.content,
                originalContent: data.content,
                r2Key: key,
                r2Bucket: binding,
            });
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const browseEmpty = !searchActive && r2Folders.length === 0 && r2Files.length === 0;
    const searchEmpty = searchActive && searchObjects.length === 0;

    const renderObjectRow = (obj: R2ObjectRow, label: string) => (
        <div
            key={obj.key}
            role={onOpenInEditor ? 'button' : undefined}
            tabIndex={onOpenInEditor ? 0 : undefined}
            onClick={() => {
                if (onOpenInEditor) void openInEditor(obj.key);
            }}
            onKeyDown={(e) => {
                if (!onOpenInEditor) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void openInEditor(obj.key);
                }
            }}
            className={`flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-hover)] rounded transition-all group ${
                onOpenInEditor ? 'cursor-pointer' : ''
            }`}
        >
            <File size={13} className="text-[var(--text-muted)] group-hover:text-[var(--solar-orange)] shrink-0" />
            <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[11px] font-medium truncate font-mono">{label}</span>
                <span className="text-[8px] text-[var(--text-muted)]">{formatBytes(Number(obj.size) || 0)}</span>
            </div>
            <button
                type="button"
                title="Copy URL"
                className="p-1 opacity-60 hover:opacity-100"
                onClick={(e) => {
                    e.stopPropagation();
                    copyObjectUrl(obj.key);
                }}
            >
                <Link2 size={12} />
            </button>
            {onOpenInEditor && (
                <button
                    type="button"
                    title="Open in editor"
                    className="p-1 opacity-70 hover:opacity-100 text-[var(--solar-cyan)]"
                    onClick={(e) => {
                        e.stopPropagation();
                        void openInEditor(obj.key);
                    }}
                >
                    <FileCode2 size={12} />
                </button>
            )}
            <button
                type="button"
                title="Delete"
                className="p-1 opacity-60 hover:opacity-100 text-[var(--text-muted)]"
                onClick={(e) => {
                    e.stopPropagation();
                    deleteObject(obj.key);
                }}
            >
                <Trash2 size={12} />
            </button>
            <ChevronRight size={10} className="opacity-0 group-hover:opacity-40 shrink-0" />
        </div>
    );

    return (
        <div className="w-full h-full min-h-0 bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database size={14} className="text-[var(--solar-orange)]" />
                        <span className="text-[11px] font-bold tracking-widest uppercase">R2 Storage</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            loadBuckets();
                            fetchObjects();
                            fetchStats();
                        }}
                        disabled={isLoading}
                        className="p-1 hover:bg-[var(--bg-hover)] rounded disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        type="button"
                        onClick={handleCreateR2File}
                        title="New R2 file"
                        className="p-1 hover:bg-[var(--bg-hover)] rounded"
                    >
                        <FilePlus size={12} />
                    </button>
                </div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Buckets</div>
                <div className="flex flex-col gap-0.5 max-h-[min(30vh,200px)] overflow-y-auto">
                    {displayBuckets.length === 0 && <span className="text-[10px] text-[var(--text-muted)] italic">No buckets.</span>}
                    {displayBuckets.map((b) => {
                        const selected = bucket === b;
                        const expanded = selected && objectPanelOpen;
                        return (
                            <button
                                key={b}
                                type="button"
                                onClick={() => {
                                    if (selected) {
                                        setObjectPanelOpen((v) => !v);
                                    } else {
                                        setBucket(b);
                                        setPrefix('');
                                        setSearchActive(false);
                                        setObjectPanelOpen(true);
                                    }
                                }}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-[10px] font-mono border border-[var(--border-subtle)]/60 hover:bg-[var(--bg-hover)] ${
                                    selected ? 'bg-[var(--bg-hover)] border-[var(--solar-orange)]/35' : 'bg-[var(--bg-app)]/50'
                                }`}
                            >
                                {expanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
                                <HardDrive size={12} className="shrink-0 text-[var(--text-muted)]" />
                                <span className="truncate">{b}</span>
                            </button>
                        );
                    })}
                </div>
                {bucket && objectPanelOpen && (
                    <>
                        <div className="flex flex-wrap gap-2 items-center text-[10px] pt-1 border-t border-[var(--border-subtle)]/40">
                            <span className="text-[var(--text-muted)] uppercase shrink-0">Prefix</span>
                            <input
                                value={prefix}
                                onChange={(e) => setPrefix(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && fetchObjects()}
                                placeholder="path/"
                                className="flex-1 min-w-[100px] bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1 py-0.5 font-mono"
                            />
                            {prefix ? (
                                <button
                                    type="button"
                                    className="text-[var(--solar-cyan)] hover:underline shrink-0"
                                    onClick={() => {
                                        setPrefix(parentR2Prefix(prefix));
                                    }}
                                >
                                    Up
                                </button>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center text-[10px]">
                            <label className="flex items-center gap-1 flex-1 min-w-[140px]">
                                <span className="text-[var(--text-muted)] uppercase">Search</span>
                                <input
                                    value={searchQ}
                                    onChange={(e) => setSearchQ(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                                    placeholder="min 2 chars (key substring)"
                                    className="flex-1 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1 py-0.5 font-mono"
                                />
                            </label>
                            <button
                                type="button"
                                onClick={runSearch}
                                disabled={isLoading || !bucket}
                                className="px-2 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] uppercase"
                            >
                                Find
                            </button>
                            <label className="flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] uppercase">
                                <Upload size={10} />
                                Upload
                                <input type="file" className="hidden" onChange={onUpload} disabled={!bucket || isLoading} />
                            </label>
                        </div>
                        {stats && (
                            <div className="text-[9px] font-mono text-[var(--text-muted)]">
                                Objects: {stats.object_count} · Size: {formatBytes(stats.total_bytes)}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center p-8 opacity-50">
                        <Loader2 size={24} className="animate-spin mb-2" />
                        <span className="text-[10px] font-mono">Loading R2…</span>
                    </div>
                )}
                {!isLoading && bucket && objectPanelOpen && (browseEmpty || searchEmpty) && (
                    <div className="p-4 text-center">
                        <p className="text-[10px] text-[var(--text-muted)] italic">No objects in this view.</p>
                    </div>
                )}
                <div className="flex flex-col gap-0.5">
                    {!isLoading &&
                        bucket &&
                        objectPanelOpen &&
                        !searchActive &&
                        r2Folders.map((fp) => (
                            <button
                                key={fp}
                                type="button"
                                onClick={() => setPrefix(fp)}
                                className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-hover)] rounded text-left w-full border-none bg-transparent font-inherit text-[var(--text-main)]"
                            >
                                <Folder size={13} className="text-[var(--solar-blue)] shrink-0" />
                                <span className="text-[11px] font-mono truncate">{shortKey(fp).replace(/\/$/, '') || fp}</span>
                                <ChevronRight size={10} className="opacity-40 ml-auto shrink-0" />
                            </button>
                        ))}
                    {!isLoading &&
                        bucket &&
                        objectPanelOpen &&
                        (searchActive ? searchObjects : r2Files).map((obj) =>
                            renderObjectRow(obj, searchActive ? obj.key : shortKey(obj.key)),
                        )}
                </div>
            </div>

            <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-app)] shrink-0 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                    <ArrowRightLeft size={12} />
                    Cross-bucket sync
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] items-center">
                    <select
                        value={syncSource}
                        onChange={(e) => setSyncSource(e.target.value)}
                        disabled={displayBuckets.length === 0}
                        className="flex-1 min-w-[100px] max-w-[160px] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded px-1 py-0.5 font-mono disabled:opacity-50"
                    >
                        {displayBuckets.length === 0 ? (
                            <option value="">—</option>
                        ) : (
                            displayBuckets.map((b) => (
                                <option key={`src-${b}`} value={b}>
                                    {b}
                                </option>
                            ))
                        )}
                    </select>
                    <span className="text-[var(--text-muted)]">to</span>
                    <select
                        value={syncDest}
                        onChange={(e) => setSyncDest(e.target.value)}
                        disabled={displayBuckets.length === 0}
                        className="flex-1 min-w-[100px] max-w-[160px] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded px-1 py-0.5 font-mono disabled:opacity-50"
                    >
                        {displayBuckets.length === 0 ? (
                            <option value="">—</option>
                        ) : (
                            displayBuckets.map((b) => (
                                <option key={`dst-${b}`} value={b}>
                                    {b}
                                </option>
                            ))
                        )}
                    </select>
                    <input
                        value={syncPrefix}
                        onChange={(e) => setSyncPrefix(e.target.value)}
                        placeholder="prefix"
                        className="w-24 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded px-1 py-0.5 font-mono"
                    />
                    <button
                        type="button"
                        onClick={runSync}
                        disabled={isLoading}
                        className="px-2 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] uppercase"
                    >
                        Run
                    </button>
                </div>
                {syncMsg && <p className="text-[9px] font-mono text-[var(--text-muted)]">{syncMsg}</p>}
                <div className="flex items-center gap-2">
                    <HardDrive size={12} className="text-[var(--text-muted)]" />
                    <span className="text-[9px] font-mono text-[var(--text-muted)] truncate">{bucket || '—'}</span>
                </div>
            </div>
        </div>
    );
};
