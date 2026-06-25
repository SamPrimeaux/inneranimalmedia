import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { r2ParentPrefix } from './formatLibrary';
import {
  connectGoogleDrive,
  fetchR2BucketNames,
  fetchR2StorageLabel,
} from './libraryApi';
import {
  loadPersistedLocalDirectoryHandle,
  pickLocalDirectoryHandle,
} from './localHandleStore';
import { listLibrarySources } from './providers';
import type { LibraryDisplayKind, LibraryFilters, LibraryItem, LibraryRail, SourceFilter } from './types';
import { DEFAULT_LIBRARY_FILTERS, NAV_RAIL_MAP, RAIL_TITLES } from './types';

export function useLibraryWorkspace() {
  const [searchParams] = useSearchParams();
  const sessionId = (searchParams.get('session_id') || '').trim();

  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [driveConnected, setDriveConnected] = useState<boolean | undefined>(undefined);
  const [driveFolderId, setDriveFolderId] = useState('root');
  const [driveFolderStack, setDriveFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [r2Bucket, setR2Bucket] = useState('');
  const [r2Prefix, setR2Prefix] = useState('');
  const [r2Buckets, setR2Buckets] = useState<string[]>([]);
  const [storageLabel, setStorageLabel] = useState<string | null>(null);
  const [localDirHandle, setLocalDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [localPath, setLocalPath] = useState('');
  const [localFolderName, setLocalFolderName] = useState<string | null>(null);

  const loadSeq = useRef(0);

  const activeRail = filters.rail;
  const pageTitle = useMemo(() => {
    if (activeRail === 'drive' && driveFolderStack.length) {
      return driveFolderStack[driveFolderStack.length - 1]?.name ?? RAIL_TITLES.drive;
    }
    if (activeRail === 'r2' && r2Prefix) {
      const parts = r2Prefix.replace(/\/$/, '').split('/');
      return parts[parts.length - 1] || RAIL_TITLES.r2;
    }
    if (activeRail === 'local' && localPath) {
      const parts = localPath.split('/');
      return parts[parts.length - 1] || localFolderName || RAIL_TITLES.local;
    }
    return RAIL_TITLES[activeRail];
  }, [activeRail, driveFolderStack, r2Prefix, localPath, localFolderName]);

  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setErrors([]);
    const controller = new AbortController();

    try {
      const { items: nextItems, errors: nextErrors, driveConnected: dc } = await listLibrarySources({
        rail: filters.rail,
        query: filters.query,
        sessionId: sessionId || undefined,
        signal: controller.signal,
        driveFolderId,
        r2Bucket,
        r2Prefix,
        localDirHandle,
        localPath,
      });
      if (seq !== loadSeq.current) return;
      setItems(nextItems);
      setErrors(nextErrors);
      setDriveConnected(dc);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setItems([]);
      setErrors([e instanceof Error ? e.message : 'Library load failed']);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }

    return () => controller.abort();
  }, [
    filters.rail,
    filters.query,
    sessionId,
    driveFolderId,
    r2Bucket,
    r2Prefix,
    localDirHandle,
    localPath,
  ]);

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), filters.query ? 280 : 0);
    return () => window.clearTimeout(t);
  }, [refresh, filters.query]);

  useEffect(() => {
    void (async () => {
      const buckets = await fetchR2BucketNames();
      setR2Buckets(buckets);
      if (buckets.length && !r2Bucket) setR2Bucket(buckets[0]);
    })();
  }, [r2Bucket]);

  useEffect(() => {
    if (!r2Bucket) return;
    void (async () => {
      const label = await fetchR2StorageLabel(r2Bucket);
      setStorageLabel(label);
    })();
  }, [r2Bucket]);

  useEffect(() => {
    void (async () => {
      const handle = await loadPersistedLocalDirectoryHandle();
      if (handle) {
        setLocalDirHandle(handle);
        setLocalFolderName(handle.name);
      }
    })();
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'oauth_success' && e.data?.provider === 'google') void refresh();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refresh]);

  const setRail = useCallback((rail: LibraryRail) => {
    setFilters((f) => ({ ...f, rail, source: rail === 'all' ? 'all' : rail }));
    setDriveFolderId('root');
    setDriveFolderStack([]);
    setR2Prefix('');
    setLocalPath('');
  }, []);

  const setNavKey = useCallback(
    (navKey: string) => {
      const rail = NAV_RAIL_MAP[navKey];
      if (rail) setRail(rail);
    },
    [setRail],
  );

  const setQuery = useCallback((query: string) => {
    setFilters((f) => ({ ...f, query }));
  }, []);

  const setSourceFilter = useCallback((source: SourceFilter) => {
    setFilters((f) => ({ ...f, source }));
  }, []);

  const setTypeFilter = useCallback((type: LibraryDisplayKind | 'all') => {
    setFilters((f) => ({ ...f, type }));
  }, []);

  const navigateIntoFolder = useCallback(
    (item: LibraryItem) => {
      if (item.kind !== 'folder') return;
      if (item.source === 'drive') {
        setDriveFolderId(item.nativeId);
        setDriveFolderStack((s) => [...s, { id: item.nativeId, name: item.name }]);
        setFilters((f) => ({ ...f, rail: 'drive', source: 'drive' }));
        return;
      }
      if (item.source === 'r2') {
        const prefix = String(item.metadata?.prefix ?? item.nativeId);
        setR2Prefix(prefix.endsWith('/') ? prefix : `${prefix}/`);
        setR2Bucket(String(item.metadata?.bucket ?? r2Bucket));
        setFilters((f) => ({ ...f, rail: 'r2', source: 'r2' }));
        return;
      }
      if (item.source === 'local') {
        setLocalPath(item.nativeId);
        setFilters((f) => ({ ...f, rail: 'local', source: 'local' }));
      }
    },
    [r2Bucket],
  );

  const navigateUp = useCallback(() => {
    if (activeRail === 'drive' && driveFolderStack.length) {
      const next = driveFolderStack.slice(0, -1);
      setDriveFolderStack(next);
      setDriveFolderId(next[next.length - 1]?.id ?? 'root');
      return;
    }
    if (activeRail === 'r2' && r2Prefix) {
      setR2Prefix(r2ParentPrefix(r2Prefix));
      return;
    }
    if (activeRail === 'local' && localPath) {
      const parts = localPath.split('/').filter(Boolean);
      parts.pop();
      setLocalPath(parts.join('/'));
    }
  }, [activeRail, driveFolderStack, r2Prefix, localPath]);

  const connectDrive = useCallback(() => {
    connectGoogleDrive('/dashboard/artifacts');
  }, []);

  const connectLocalFolder = useCallback(async () => {
    const handle = await pickLocalDirectoryHandle();
    if (!handle) return;
    setLocalDirHandle(handle);
    setLocalFolderName(handle.name);
    setLocalPath('');
    setRail('local');
    void refresh();
  }, [refresh, setRail]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (filters.source !== 'all' && item.source !== filters.source) return false;
      if (filters.type !== 'all' && item.displayKind !== filters.type && item.kind === 'file') {
        return false;
      }
      if (filters.rail === 'starred' && !item.starred) return false;
      if (filters.rail === 'trash' && !item.trashed) return false;
      return true;
    });
  }, [items, filters.source, filters.type, filters.rail]);

  const folders = useMemo(
    () => visibleItems.filter((i) => i.kind === 'folder'),
    [visibleItems],
  );
  const files = useMemo(
    () => visibleItems.filter((i) => i.kind === 'file'),
    [visibleItems],
  );

  const canNavigateUp =
    (activeRail === 'drive' && driveFolderStack.length > 0) ||
    (activeRail === 'r2' && !!r2Prefix) ||
    (activeRail === 'local' && !!localPath);

  return {
    sessionId,
    filters,
    items,
    folders,
    files,
    loading,
    errors,
    driveConnected,
    driveFolderStack,
    r2Bucket,
    r2Buckets,
    r2Prefix,
    storageLabel,
    localFolderName,
    pageTitle,
    canNavigateUp,
    setQuery,
    setNavKey,
    setRail,
    setSourceFilter,
    setTypeFilter,
    navigateIntoFolder,
    navigateUp,
    connectDrive,
    connectLocalFolder,
    refresh,
  };
}
