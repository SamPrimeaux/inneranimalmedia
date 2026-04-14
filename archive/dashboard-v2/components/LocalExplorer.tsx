import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    FolderOpen,
    File as FileIcon,
    ChevronRight,
    ChevronDown,
    Folder,
    HardDrive,
    Cloud,
    Github,
    Box,
    FileCode2,
    Loader2,
    Upload,
    Trash2,
    FolderPlus,
    FilePlus,
    Plus,
    Search,
    RefreshCw,
} from 'lucide-react';
import type { ActiveFile } from '../types';
import { GitHubExplorer } from './GitHubExplorer';
import { GoogleDriveExplorer } from './GoogleDriveExplorer';

const NATIVE_WS_DB_NAME = 'iam-agent-native-workspace-v1';
const NATIVE_WS_STORE = 'handles';
const NATIVE_WS_KEY = 'directory';
/** Tier-2 hint: last D1 workspace id (handles stay in `handles`; browser may revoke permission across sessions). */
const NATIVE_WS_HINT_STORE = 'workspace_hint';
const NATIVE_WS_HINT_KEY = 'last';
/** vscode.dev-style: display name only (no path); survives when D1/IDB hints are missing (e.g. logged out). */
const LS_LAST_LOCAL_FOLDER_NAME = 'iam_last_local_folder_name';

type LocalWorkspaceIdCache = { lastWorkspaceId: string; lastOpenedAt: number };

function persistLastLocalFolderNameOnly(name: string): void {
    try {
        const n = name?.trim();
        if (n) localStorage.setItem(LS_LAST_LOCAL_FOLDER_NAME, n);
    } catch {
        /* quota / private mode */
    }
}

function loadLastLocalFolderNameOnly(): string | null {
    try {
        const n = localStorage.getItem(LS_LAST_LOCAL_FOLDER_NAME)?.trim();
        return n || null;
    } catch {
        return null;
    }
}

function clearLastLocalFolderNameOnly(): void {
    try {
        localStorage.removeItem(LS_LAST_LOCAL_FOLDER_NAME);
    } catch {
        /* ignore */
    }
}

function openNativeWsDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(NATIVE_WS_DB_NAME, 2);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(NATIVE_WS_STORE)) db.createObjectStore(NATIVE_WS_STORE);
            if (!db.objectStoreNames.contains(NATIVE_WS_HINT_STORE)) db.createObjectStore(NATIVE_WS_HINT_STORE);
        };
        req.onsuccess = () => resolve(req.result);
    });
}

async function persistWorkspaceIdHint(workspaceId: string): Promise<void> {
    const db = await openNativeWsDb();
    const entry: LocalWorkspaceIdCache = { lastWorkspaceId: workspaceId, lastOpenedAt: Date.now() };
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(NATIVE_WS_HINT_STORE, 'readwrite');
        tx.objectStore(NATIVE_WS_HINT_STORE).put(entry, NATIVE_WS_HINT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

async function loadWorkspaceIdHint(): Promise<LocalWorkspaceIdCache | null> {
    try {
        const db = await openNativeWsDb();
        const row = await new Promise<LocalWorkspaceIdCache | null>((resolve, reject) => {
            const tx = db.transaction(NATIVE_WS_HINT_STORE, 'readonly');
            const r = tx.objectStore(NATIVE_WS_HINT_STORE).get(NATIVE_WS_HINT_KEY);
            r.onsuccess = () => resolve((r.result as LocalWorkspaceIdCache) || null);
            r.onerror = () => reject(r.error);
        });
        db.close();
        return row;
    } catch {
        return null;
    }
}

async function clearWorkspaceIdHint(): Promise<void> {
    try {
        const db = await openNativeWsDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(NATIVE_WS_HINT_STORE, 'readwrite');
            tx.objectStore(NATIVE_WS_HINT_STORE).delete(NATIVE_WS_HINT_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch {
        /* ignore */
    }
}

async function persistNativeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openNativeWsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NATIVE_WS_STORE, 'readwrite');
    tx.objectStore(NATIVE_WS_STORE).put(handle, NATIVE_WS_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function clearPersistedNativeDirectoryHandle(): Promise<void> {
  try {
    const db = await openNativeWsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NATIVE_WS_STORE, 'readwrite');
      tx.objectStore(NATIVE_WS_STORE).delete(NATIVE_WS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

async function loadPersistedNativeDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openNativeWsDb();
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(NATIVE_WS_STORE, 'readonly');
      const req = tx.objectStore(NATIVE_WS_STORE).get(NATIVE_WS_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

/** Map API bucket name (GET /api/r2/buckets) to allowlisted binding for /api/r2/file (worker resolveR2BindingAllowlist). */
function bucketLabelToBinding(label: string): string {
    const b = label.trim().toLowerCase();
    if (b === 'agent-sam' || b === 'tools') return 'DASHBOARD';
    if (b === 'agent-sam-sandbox-cicd' || b === 'inneranimalmedia-assets') return 'ASSETS';
    if (b === 'iam-platform') return 'R2';
    if (b === 'iam-docs') return 'DOCS_BUCKET';
    if (b === 'autorag') return 'AUTORAG_BUCKET';
    return 'DASHBOARD';
}

/** agent-sam and tools share env.DASHBOARD — show one row to avoid duplicate trees. */
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
    return i < 0 ? '' : trimmed.slice(0, i + 1);
}

interface FileNode {
    name: string;
    kind: 'file' | 'directory';
    handle: any; // FileSystemHandle
    children?: FileNode[];
    isOpen?: boolean;
}

/** Immutable path update so React always sees a new root after expand/collapse. */
function mapFileNodeInTree(node: FileNode, target: FileNode, fn: (n: FileNode) => FileNode): FileNode {
    if (node === target) return fn({ ...node });
    if (!node.children?.length) return node;
    let changed = false;
    const nextChildren = node.children.map((ch) => {
        const nc = mapFileNodeInTree(ch, target, fn);
        if (nc !== ch) changed = true;
        return nc;
    });
    if (!changed) return node;
    return { ...node, children: nextChildren };
}

export const LocalExplorer: React.FC<{
    onFileSelect: (fileData: { name: string; content: string; handle: any; workspacePath?: string }) => void;
    /** Fires when user connects a native folder — drives status bar + persisted workspace. */
    onWorkspaceRootChange?: (info: { folderName: string }) => void;
    /** Open R2 object in Monaco (same as R2 panel). */
    onOpenInEditor?: (file: ActiveFile) => void;
    /** Bumps when Welcome (or parent) should open the native folder picker (showDirectoryPicker). */
    nativeFolderOpenSignal?: number;
}> = ({ onFileSelect, onWorkspaceRootChange, onOpenInEditor, nativeFolderOpenSignal = 0 }) => {
    const [rootDir, setRootDir] = useState<FileNode | null>(null);
    /**
     * When the directory handle cannot be revalidated, show vscode.dev-style resume copy.
     * `workspaceId` null = name came from localStorage only (no server row).
     */
    const [localResumeHint, setLocalResumeHint] = useState<{
        workspaceId: string | null;
        folderName: string;
    } | null>(null);
    const [expandedSections, setExpandedSections] = useState({
        local: true,
        r2: true,
        github: true,
        drive: true,
    });

    const [r2Buckets, setR2Buckets] = useState<string[]>([]);
    const [selectedR2Bucket, setSelectedR2Bucket] = useState<string>('');
    const [r2PrefixByBucket, setR2PrefixByBucket] = useState<Record<string, string>>({});
    const [r2PrefixesByBucket, setR2PrefixesByBucket] = useState<Record<string, string[]>>({});
    const [r2ObjectsByBucket, setR2ObjectsByBucket] = useState<Record<string, { key: string; size?: number }[]>>({});
    const [r2Loading, setR2Loading] = useState(false);
    const [r2Err, setR2Err] = useState<string | null>(null);
    const [r2SearchQ, setR2SearchQ] = useState<Record<string, string>>({});
    const [r2SearchMode, setR2SearchMode] = useState<Record<string, boolean>>({});
    const r2UploadRef = useRef<HTMLInputElement>(null);
    const [r2UploadTargetBucket, setR2UploadTargetBucket] = useState<string | null>(null);
    const lastNativeFolderSignal = useRef(0);

    const loadR2Buckets = useCallback(async () => {
        try {
            const res = await fetch('/api/r2/buckets', { credentials: 'same-origin' });
            const data = await res.json();
            setR2Buckets(Array.isArray(data.buckets) ? data.buckets : []);
        } catch {
            setR2Buckets([]);
        }
    }, []);

    const displayR2Buckets = useMemo(() => dedupeR2BucketLabels(r2Buckets), [r2Buckets]);

    useEffect(() => {
        loadR2Buckets();
    }, [loadR2Buckets]);

    useEffect(() => {
        if (displayR2Buckets.length === 0) {
            setSelectedR2Bucket('');
            return;
        }
        setSelectedR2Bucket((prev) => (prev && displayR2Buckets.includes(prev) ? prev : displayR2Buckets[0]));
    }, [displayR2Buckets]);

    const loadR2List = useCallback(async (bucket: string, prefixOverride?: string) => {
        setR2Loading(true);
        setR2Err(null);
        const prefix = prefixOverride !== undefined ? prefixOverride : (r2PrefixByBucket[bucket] ?? '');
        try {
            const qs = new URLSearchParams({ bucket, prefix });
            const res = await fetch(`/api/r2/list?${qs}`, { credentials: 'same-origin' });
            const data = await res.json();
            if (!res.ok) {
                setR2Err(typeof data.error === 'string' ? data.error : `R2 list failed (${res.status})`);
                setR2ObjectsByBucket((prev) => ({ ...prev, [bucket]: [] }));
                setR2PrefixesByBucket((prev) => ({ ...prev, [bucket]: [] }));
                return;
            }
            const rows = Array.isArray(data.objects) ? data.objects : [];
            const prefs = Array.isArray(data.prefixes) ? data.prefixes : [];
            setR2ObjectsByBucket((prev) => ({ ...prev, [bucket]: rows }));
            setR2PrefixesByBucket((prev) => ({ ...prev, [bucket]: prefs }));
        } catch (e) {
            console.error('[LocalExplorer] R2 list fetch failed:', e);
            setR2Err(e instanceof Error ? e.message : 'R2 list failed');
            setR2ObjectsByBucket((prev) => ({ ...prev, [bucket]: [] }));
            setR2PrefixesByBucket((prev) => ({ ...prev, [bucket]: [] }));
        } finally {
            setR2Loading(false);
        }
    }, [r2PrefixByBucket]);

    useEffect(() => {
        if (!selectedR2Bucket) return;
        void loadR2List(selectedR2Bucket);
    }, [selectedR2Bucket]);

    const setR2Prefix = (bucket: string, prefix: string) => {
        setR2PrefixByBucket((prev) => ({ ...prev, [bucket]: prefix }));
        setR2SearchMode((m) => ({ ...m, [bucket]: false }));
        void loadR2List(bucket, prefix);
    };

    const runR2Search = async (bucket: string) => {
        const q = (r2SearchQ[bucket] || '').trim().toLowerCase();
        if (q.length < 2) {
            setR2Err('R2 search: at least 2 characters.');
            return;
        }
        setR2Loading(true);
        setR2Err(null);
        try {
            const prefix = r2PrefixByBucket[bucket] ?? '';
            const qs = new URLSearchParams({ bucket, q, prefix });
            const res = await fetch(`/api/r2/search?${qs}`, { credentials: 'same-origin' });
            const data = await res.json();
            const rows = Array.isArray(data.objects) ? data.objects : [];
            setR2SearchMode((m) => ({ ...m, [bucket]: true }));
            setR2ObjectsByBucket((prev) => ({ ...prev, [bucket]: rows }));
            setR2PrefixesByBucket((prev) => ({ ...prev, [bucket]: [] }));
        } catch (e) {
            setR2Err(e instanceof Error ? e.message : 'R2 search failed');
        } finally {
            setR2Loading(false);
        }
    };

    const clearR2Search = (bucket: string) => {
        setR2SearchQ((prev) => ({ ...prev, [bucket]: '' }));
        setR2SearchMode((m) => ({ ...m, [bucket]: false }));
        void loadR2List(bucket);
    };

    const uploadToR2 = async (bucket: string, files: FileList | null) => {
        if (!files?.length) return;
        const prefix = r2PrefixByBucket[bucket] ?? '';
        setR2Loading(true);
        setR2Err(null);
        try {
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                const fd = new FormData();
                fd.append('bucket', bucket);
                fd.append('key', `${prefix}${f.name}`);
                fd.append('file', f);
                const res = await fetch('/api/r2/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setR2Err(typeof data.error === 'string' ? data.error : `Upload failed: ${f.name}`);
                    break;
                }
            }
        } catch (e) {
            setR2Err(e instanceof Error ? e.message : 'Upload failed');
        } finally {
            setR2Loading(false);
            if (r2UploadRef.current) r2UploadRef.current.value = '';
            setR2UploadTargetBucket(null);
            void loadR2List(bucket);
        }
    };

    const createR2Folder = async (bucket: string) => {
        const name = window.prompt('Folder name (prefix segment, no slashes)');
        if (!name || !name.trim()) return;
        const seg = name.trim().replace(/\/+/g, '').replace(/^\./, '');
        if (!seg) return;
        const prefix = r2PrefixByBucket[bucket] ?? '';
        const key = `${prefix}${seg}/`;
        const binding = bucketLabelToBinding(bucket);
        setR2Loading(true);
        setR2Err(null);
        try {
            const res = await fetch('/api/r2/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ bucket: binding, key, content: '' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setR2Err(typeof data.error === 'string' ? data.error : 'Create folder marker failed');
                return;
            }
            void loadR2List(bucket);
        } catch (e) {
            setR2Err(e instanceof Error ? e.message : 'Create folder failed');
        } finally {
            setR2Loading(false);
        }
    };

    const deleteR2Key = async (bucket: string, key: string) => {
        if (!window.confirm(`Delete R2 object?\n${key}`)) return;
        setR2Loading(true);
        setR2Err(null);
        try {
            const res = await fetch('/api/r2/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ bucket, key }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setR2Err(typeof data.error === 'string' ? data.error : 'Delete failed');
                return;
            }
            void loadR2List(bucket);
        } catch (e) {
            setR2Err(e instanceof Error ? e.message : 'Delete failed');
        } finally {
            setR2Loading(false);
        }
    };

    const openR2Key = async (bucket: string, key: string) => {
        if (!onOpenInEditor) return;
        const binding = bucketLabelToBinding(bucket);
        setR2Loading(true);
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
            setR2Loading(false);
        }
    };

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const getEntries = useCallback(async (dirHandle: any): Promise<FileNode[]> => {
        const entries: FileNode[] = [];
        for await (const entry of dirHandle.values()) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            entries.push({
                name: entry.name,
                kind: entry.kind,
                handle: entry,
                isOpen: false,
            });
        }
        return entries.sort((a, b) => {
            if (a.kind === b.kind) return a.name.localeCompare(b.name);
            return a.kind === 'directory' ? -1 : 1;
        });
    }, []);

    useEffect(() => {
        if (typeof indexedDB === 'undefined') return;
        void (async () => {
            const tryResumeHints = async () => {
                const hint = await loadWorkspaceIdHint();
                if (hint?.lastWorkspaceId) {
                    try {
                        const res = await fetch(`/api/workspace/${encodeURIComponent(hint.lastWorkspaceId)}`, {
                            credentials: 'same-origin',
                        });
                        if (res.ok) {
                            const rec = (await res.json()) as { type?: string; folderName?: string };
                            if (
                                rec?.type === 'local' &&
                                typeof rec.folderName === 'string' &&
                                rec.folderName.trim()
                            ) {
                                const fn = rec.folderName.trim();
                                persistLastLocalFolderNameOnly(fn);
                                setLocalResumeHint({
                                    workspaceId: hint.lastWorkspaceId,
                                    folderName: fn,
                                });
                                return;
                            }
                        }
                    } catch {
                        /* offline */
                    }
                }
                const nameOnly = loadLastLocalFolderNameOnly();
                if (nameOnly) {
                    setLocalResumeHint({ workspaceId: null, folderName: nameOnly });
                }
            };

            try {
                const h = await loadPersistedNativeDirectoryHandle();
                if (!h || typeof (h as any).queryPermission !== 'function') {
                    await tryResumeHints();
                    return;
                }
                let perm = await (h as any).queryPermission({ mode: 'readwrite' });
                if (perm === 'prompt' && typeof (h as any).requestPermission === 'function') {
                    perm = await (h as any).requestPermission({ mode: 'readwrite' });
                }
                if (perm !== 'granted') {
                    await tryResumeHints();
                    return;
                }
                setLocalResumeHint(null);
                persistLastLocalFolderNameOnly(h.name);
                const root: FileNode = {
                    name: h.name,
                    kind: 'directory',
                    handle: h,
                    isOpen: true,
                    children: await getEntries(h),
                };
                setRootDir(root);
                onWorkspaceRootChange?.({ folderName: root.name });
            } catch (e) {
                console.warn('[LocalExplorer] native workspace restore skipped', e);
                await tryResumeHints();
            }
        })();
    }, [getEntries, onWorkspaceRootChange]);

    const handleOpenFolder = useCallback(async () => {
        try {
            // File System Access API (Chromium); not in all TS DOM libs
            const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<any> }).showDirectoryPicker();

            const root: FileNode = {
                name: dirHandle.name,
                kind: 'directory',
                handle: dirHandle,
                isOpen: true,
                children: await getEntries(dirHandle),
            };
            setRootDir(root);
            onWorkspaceRootChange?.({ folderName: root.name });
            await persistNativeDirectoryHandle(dirHandle);
            persistLastLocalFolderNameOnly(dirHandle.name);

            if (localResumeHint && dirHandle.name !== localResumeHint.folderName) {
                console.warn(
                    '[LocalExplorer] selected folder name differs from last saved workspace hint',
                    dirHandle.name,
                    localResumeHint.folderName,
                );
            }

            const hintRow = await loadWorkspaceIdHint();
            let synced = false;
            if (hintRow?.lastWorkspaceId) {
                const pr = await fetch(`/api/workspace/${encodeURIComponent(hintRow.lastWorkspaceId)}`, {
                    method: 'PATCH',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lastOpenedAt: Date.now(), folderName: dirHandle.name }),
                });
                synced = pr.ok;
            }
            if (!synced) {
                const res = await fetch('/api/workspace/create', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'local',
                        folderName: dirHandle.name,
                        lastKnownPath: 'unknown',
                        lastOpenedAt: Date.now(),
                    }),
                });
                if (res.ok) {
                    const j = (await res.json()) as { workspaceId?: string };
                    if (j?.workspaceId) await persistWorkspaceIdHint(String(j.workspaceId));
                }
            }
            setLocalResumeHint(null);
        } catch (err) {
            console.error('Failed to open directory:', err);
        }
    }, [getEntries, onWorkspaceRootChange, localResumeHint]);

    const disconnectNativeFolder = useCallback(async () => {
        setRootDir(null);
        setLocalResumeHint(null);
        onWorkspaceRootChange?.({ folderName: '' });
        await clearPersistedNativeDirectoryHandle();
        await clearWorkspaceIdHint();
        clearLastLocalFolderNameOnly();
    }, [onWorkspaceRootChange]);

    useEffect(() => {
        if (nativeFolderOpenSignal === 0 || nativeFolderOpenSignal === lastNativeFolderSignal.current) return;
        lastNativeFolderSignal.current = nativeFolderOpenSignal;
        void handleOpenFolder();
    }, [nativeFolderOpenSignal, handleOpenFolder]);

    const toggleDir = async (node: FileNode, pathPrefix: string) => {
        if (node.kind === 'file') {
            const file = await node.handle.getFile();
            const content = await file.text();
            const workspacePath = pathPrefix ? `${pathPrefix}/${node.name}` : node.name;
            onFileSelect({ name: node.name, content, handle: node.handle, workspacePath });
            return;
        }

        if (!rootDir) return;
        const cur = findNode(rootDir, node);
        if (!cur) return;
        if (cur.isOpen) {
            setRootDir((prev) => (prev ? mapFileNodeInTree(prev, node, (n) => ({ ...n, isOpen: false })) : prev));
            return;
        }
        const children = await getEntries(node.handle);
        setRootDir((prev) => (prev ? mapFileNodeInTree(prev, node, (n) => ({ ...n, isOpen: true, children })) : prev));
    };

    const handleCreateLocalFile = async () => {
        if (!rootDir?.handle) {
            void handleOpenFolder();
            return;
        }
        const name = window.prompt('File name:');
        if (!name) return;
        try {
            await rootDir.handle.getFileHandle(name, { create: true });
            const children = await getEntries(rootDir.handle);
            setRootDir(prev => prev ? { ...prev, children } : null);
        } catch (e) {
            console.error('Local file creation failed:', e);
            alert('Failed to create file: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    const handleCreateLocalFolder = async () => {
        if (!rootDir?.handle) {
            void handleOpenFolder();
            return;
        }
        const name = window.prompt('Folder name:');
        if (!name) return;
        try {
            await rootDir.handle.getDirectoryHandle(name, { create: true });
            const children = await getEntries(rootDir.handle);
            setRootDir(prev => prev ? { ...prev, children } : null);
        } catch (e) {
            console.error('Local folder creation failed:', e);
            alert('Failed to create folder: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    const findNode = (current: FileNode, target: FileNode): FileNode | null => {
        if (current === target) return current;
        if (current.children) {
            for (let child of current.children) {
                const found = findNode(child, target);
                if (found) return found;
            }
        }
        return null;
    };

    const renderTree = (node: FileNode, depth: number = 0, pathPrefix: string = '') => {
        const nodePath = pathPrefix ? `${pathPrefix}/${node.name}` : node.name;
        return (
            <div key={nodePath} className="flex flex-col">
                <button
                    type="button"
                    onClick={() => void toggleDir(node, pathPrefix)}
                    style={{ paddingLeft: `${depth * 10}px` }}
                    className="flex items-center gap-1.5 px-2 py-1 w-full text-left hover:bg-[var(--bg-hover)] cursor-pointer text-[13px] text-[var(--text-main)] group whitespace-nowrap overflow-hidden text-ellipsis border-none bg-transparent font-inherit"
                >
                    {node.kind === 'directory' ? (
                        <>
                            {node.isOpen ? <ChevronDown size={14} className="text-[var(--text-muted)] opacity-50"/> : <ChevronRight size={14} className="text-[var(--text-muted)] opacity-50"/>}
                            <Folder size={14} className="text-[var(--solar-blue)]" />
                        </>
                    ) : (
                        <>
                            <div className="w-3.5" />
                            <FileIcon size={14} className="text-[var(--text-muted)]" />
                        </>
                    )}
                    <span className="truncate">{node.name}</span>
                </button>
                {node.isOpen && node.children && (
                    <div className="flex flex-col border-l border-[var(--border-subtle)] ml-3">
                        {node.children.map(child => renderTree(child, depth + 1, nodePath))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-panel)] overflow-hidden text-[var(--text-main)] overflow-y-auto align-top">
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
                <span className="text-[11px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">Explorer</span>
            </div>

            {/* Section 1: Local Workspace */}
            <div className="flex flex-col border-b border-[var(--border-subtle)]/50 pb-1 pt-1">
                <div className="flex items-center justify-between px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer group">
                    <div className="flex items-center gap-2 flex-1" onClick={() => toggleSection('local')}>
                        {expandedSections.local ? <ChevronDown size={14} className="text-[var(--text-muted)] group-hover:text-white" /> : <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-white" />}
                        <HardDrive size={14} className="text-[var(--solar-cyan)] group-hover:text-white" />
                        <span className="text-[11px] font-bold tracking-wide uppercase text-[var(--text-muted)] group-hover:text-white transition-colors">Local Workspace</span>
                    </div>
                    {expandedSections.local && (
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void handleCreateLocalFile(); }}
                                title="New file"
                                className="p-1 hover:bg-[var(--bg-app)] rounded text-[var(--text-muted)] hover:text-white"
                            >
                                <FilePlus size={12} />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void handleCreateLocalFolder(); }}
                                title="New folder"
                                className="p-1 hover:bg-[var(--bg-app)] rounded text-[var(--text-muted)] hover:text-white"
                            >
                                <FolderPlus size={12} />
                            </button>
                        </div>
                    )}
                </div>
                {expandedSections.local && (
                    <div className="px-2 pb-2">
                        {!rootDir ? (
                            <div className="py-2 flex flex-col items-center justify-center gap-2">
                                {localResumeHint ? (
                                    <div className="w-full max-w-[220px] rounded border border-[var(--border-subtle)] bg-[var(--bg-app)]/80 p-2 mb-1">
                                        <p className="text-[9px] text-[var(--text-main)] leading-snug text-center">
                                            You last had{' '}
                                            <span className="font-semibold text-[var(--solar-cyan)]">{localResumeHint.folderName}</span>{' '}
                                            open. Use the folder picker again to grant access (web standard; display name only is remembered).
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => void handleOpenFolder()}
                                            className="mt-2 w-full text-[10px] font-semibold py-1.5 rounded border border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/10"
                                        >
                                            Open folder
                                        </button>
                                    </div>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => void handleOpenFolder()}
                                    className="text-[11px] text-[var(--solar-blue)] hover:text-white hover:underline transition-all font-mono tracking-wide py-1 px-3 border border-[var(--solar-blue)]/30 rounded"
                                >
                                    Connect Native Folder
                                </button>
                                <p className="text-[9px] text-[var(--text-muted)] text-center max-w-[200px] leading-relaxed">
                                    Chromium: read/write for this site. The folder display name may be stored locally (and on the server when signed in) so we can prompt you to re-pick after a refresh—never the full disk path.
                                </p>
                            </div>
                        ) : (
                            <div className="font-mono mt-1">
                                <div className="flex items-center justify-between px-1 pb-1">
                                    <span className="text-[9px] text-[var(--text-muted)] truncate">{rootDir.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => void disconnectNativeFolder()}
                                        className="text-[9px] text-[var(--text-muted)] hover:text-[var(--solar-orange)]"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                                {renderTree(rootDir)}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <input
                ref={r2UploadRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                    const bucket = r2UploadTargetBucket;
                    if (bucket) void uploadToR2(bucket, e.target.files);
                }}
            />

            {/* Section 2: Cloudflare R2 */}
            <div className="flex flex-col border-b border-[var(--border-subtle)]/50 pb-1">
                <div 
                    onClick={() => toggleSection('r2')}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer group"
                >
                    {expandedSections.r2 ? <ChevronDown size={14} className="text-[var(--text-muted)] group-hover:text-white" /> : <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-white" />}
                    <Cloud size={14} className="text-[var(--solar-orange)] group-hover:text-[var(--text-heading)]" />
                    <span className="text-[11px] font-bold tracking-wide uppercase text-[var(--text-muted)] group-hover:text-white transition-colors">Cloudflare R2</span>
                </div>
                {expandedSections.r2 && (
                    <div className="px-4 py-2 text-[11px] text-[var(--text-muted)] flex flex-col gap-2 font-mono">
                        {r2Err && (
                            <p className="text-[10px] text-[var(--solar-orange)] break-words">{r2Err}</p>
                        )}
                        {displayR2Buckets.length === 0 && !r2Loading && (
                            <span className="text-[10px] italic">No buckets listed.</span>
                        )}
                        {displayR2Buckets.length > 0 && (
                            <label className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                <span className="uppercase shrink-0">Bucket</span>
                                <select
                                    value={selectedR2Bucket}
                                    onChange={(e) => {
                                        const b = e.target.value;
                                        setSelectedR2Bucket(b);
                                        setR2SearchMode((m) => ({ ...m, [b]: false }));
                                    }}
                                    className="flex-1 min-w-0 max-w-[220px] bg-[var(--bg-app)] border border-[var(--border-subtle)]/50 rounded px-1 py-0.5 text-[10px] text-[var(--text-main)]"
                                >
                                    {displayR2Buckets.map((name) => (
                                        <option key={name} value={name}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        {selectedR2Bucket
                            ? (() => {
                                  const b = selectedR2Bucket;
                                  const objs = r2ObjectsByBucket[b] || [];
                                  const prefs = r2PrefixesByBucket[b] || [];
                                  const prefix = r2PrefixByBucket[b] ?? '';
                                  const searchOn = r2SearchMode[b];
                                  const shortName = (full: string) =>
                                      prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full;
                                  return (
                                      <div className="border border-[var(--border-subtle)]/40 rounded overflow-hidden">
                                          <div className="px-2 py-1.5 flex items-center gap-2 text-[12px] border-b border-[var(--border-subtle)]/30">
                                              <Box size={13} className="text-[var(--solar-blue)] shrink-0" />
                                              <span className="truncate font-medium">{b}</span>
                                          </div>
                                          <div className="px-2 pb-2 flex flex-col gap-1">
                                              <div className="flex flex-wrap items-center gap-1 text-[9px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]/30 pb-1">
                                                  <span className="truncate max-w-full">/{prefix || ''}</span>
                                                  {prefix ? (
                                                      <button
                                                          type="button"
                                                          className="text-[var(--solar-cyan)] hover:underline shrink-0"
                                                          onClick={() => setR2Prefix(b, parentR2Prefix(prefix))}
                                                      >
                                                          Up
                                                      </button>
                                                  ) : null}
                                                  <button
                                                      type="button"
                                                      className="p-0.5 hover:bg-[var(--bg-hover)] rounded shrink-0"
                                                      title="Refresh"
                                                      onClick={() => void loadR2List(b)}
                                                  >
                                                      <RefreshCw size={11} className={r2Loading ? 'animate-spin' : ''} />
                                                  </button>
                                                  <button
                                                      type="button"
                                                      className="p-0.5 hover:bg-[var(--bg-hover)] rounded shrink-0"
                                                      title="Upload into this prefix"
                                                      onClick={() => {
                                                          setR2UploadTargetBucket(b);
                                                          r2UploadRef.current?.click();
                                                      }}
                                                  >
                                                      <Upload size={11} />
                                                  </button>
                                                  <button
                                                      type="button"
                                                      className="p-0.5 hover:bg-[var(--bg-hover)] rounded shrink-0"
                                                      title="New folder prefix"
                                                      onClick={() => void createR2Folder(b)}
                                                  >
                                                      <FolderPlus size={11} />
                                                  </button>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                  <Search size={10} className="text-[var(--text-muted)] shrink-0" />
                                                  <input
                                                      type="search"
                                                      value={r2SearchQ[b] || ''}
                                                      onChange={(e) => setR2SearchQ((prev) => ({ ...prev, [b]: e.target.value }))}
                                                      onKeyDown={(e) => e.key === 'Enter' && void runR2Search(b)}
                                                      placeholder="Filter keys (search)"
                                                      className="flex-1 min-w-0 bg-[var(--bg-app)] border border-[var(--border-subtle)]/50 rounded px-1 py-0.5 text-[10px] outline-none"
                                                  />
                                                  <button
                                                      type="button"
                                                      className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-hover)]"
                                                      onClick={() => void runR2Search(b)}
                                                  >
                                                      Go
                                                  </button>
                                                  {searchOn && (
                                                      <button
                                                          type="button"
                                                          className="text-[9px] text-[var(--solar-cyan)] shrink-0"
                                                          onClick={() => clearR2Search(b)}
                                                      >
                                                          List
                                                      </button>
                                                  )}
                                              </div>
                                              {r2Loading && (
                                                  <div className="flex items-center gap-1 py-1 text-[10px]">
                                                      <Loader2 size={10} className="animate-spin" /> Loading…
                                                  </div>
                                              )}
                                              {!searchOn &&
                                                  prefs.map((p) => (
                                                      <button
                                                          key={p}
                                                          type="button"
                                                          onClick={() => setR2Prefix(b, p)}
                                                          className="flex items-center gap-1 pl-2 py-0.5 hover:bg-[var(--bg-hover)] rounded text-left w-full"
                                                      >
                                                          <Folder size={12} className="text-[var(--solar-blue)] shrink-0" />
                                                          <span className="truncate text-[10px]">{shortName(p)}</span>
                                                      </button>
                                                  ))}
                                              {objs.map((o) => (
                                                  <div
                                                      key={o.key}
                                                      className="flex items-center gap-0.5 pl-2 py-0.5 hover:bg-[var(--bg-hover)] rounded group"
                                                  >
                                                      <div
                                                          role={onOpenInEditor ? 'button' : undefined}
                                                          tabIndex={onOpenInEditor ? 0 : undefined}
                                                          onClick={() => {
                                                              if (onOpenInEditor) void openR2Key(b, o.key);
                                                          }}
                                                          onKeyDown={(e) => {
                                                              if (!onOpenInEditor) return;
                                                              if (e.key === 'Enter' || e.key === ' ') {
                                                                  e.preventDefault();
                                                                  void openR2Key(b, o.key);
                                                              }
                                                          }}
                                                          className={`flex flex-1 min-w-0 items-center gap-1 ${onOpenInEditor ? 'cursor-pointer' : ''}`}
                                                      >
                                                          <FileIcon size={12} className="text-[var(--text-muted)] shrink-0" />
                                                          <span className="truncate text-[10px]">{searchOn ? o.key : shortName(o.key)}</span>
                                                      </div>
                                                      {onOpenInEditor && (
                                                          <button
                                                              type="button"
                                                              title="Open in editor"
                                                              className="p-0.5 opacity-0 group-hover:opacity-100 text-[var(--solar-cyan)] shrink-0"
                                                              onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  void openR2Key(b, o.key);
                                                              }}
                                                          >
                                                              <FileCode2 size={11} />
                                                          </button>
                                                      )}
                                                      <button
                                                          type="button"
                                                          title="Delete object"
                                                          className="p-0.5 opacity-50 hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--solar-orange)] shrink-0"
                                                          onClick={() => void deleteR2Key(b, o.key)}
                                                      >
                                                          <Trash2 size={11} />
                                                      </button>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                  );
                              })()
                            : null}
                    </div>
                )}
            </div>

            {/* Section 3: GitHub Repositories */}
            <div className="flex flex-col border-b border-[var(--border-subtle)]/50 pb-1">
                <div 
                    onClick={() => toggleSection('github')}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer group"
                >
                    {expandedSections.github ? <ChevronDown size={14} className="text-[var(--text-muted)] group-hover:text-white" /> : <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-white" />}
                    <Github size={14} className="text-[var(--solar-magenta)] group-hover:text-white" />
                    <span className="text-[11px] font-bold tracking-wide uppercase text-[var(--text-muted)] group-hover:text-white transition-colors">GitHub Sync</span>
                </div>
                {expandedSections.github && (
                    <div className="min-h-[200px] max-h-[min(45vh,380px)] flex flex-col overflow-hidden border-t border-[var(--border-subtle)]/30 mx-1 mb-1 rounded border border-[var(--border-subtle)]/40">
                        <GitHubExplorer onOpenInEditor={onOpenInEditor} />
                    </div>
                )}
            </div>

            {/* Section 4: Google Drive */}
            <div className="flex flex-col border-b border-[var(--border-subtle)]/50 pb-1 mb-8">
                <div 
                    onClick={() => toggleSection('drive')}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer group"
                >
                    {expandedSections.drive ? <ChevronDown size={14} className="text-[var(--text-muted)] group-hover:text-white" /> : <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-white" />}
                    <FolderOpen size={14} className="text-[var(--solar-green)] group-hover:text-white" />
                    <span className="text-[11px] font-bold tracking-wide uppercase text-[var(--text-muted)] group-hover:text-white transition-colors">Google Drive</span>
                </div>
                {expandedSections.drive && (
                    <div className="min-h-[200px] max-h-[min(45vh,380px)] flex flex-col overflow-hidden border-t border-[var(--border-subtle)]/30 mx-1 mb-1 rounded border border-[var(--border-subtle)]/40">
                        <GoogleDriveExplorer onOpenInEditor={onOpenInEditor} />
                    </div>
                )}
            </div>
        </div>
    );
};
