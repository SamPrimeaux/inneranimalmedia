const NATIVE_WS_DB_NAME = 'iam-agent-native-workspace-v1';
const NATIVE_WS_STORE = 'handles';
const NATIVE_WS_KEY = 'directory';

function openNativeWsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NATIVE_WS_DB_NAME, 2);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NATIVE_WS_STORE)) db.createObjectStore(NATIVE_WS_STORE);
    };
  });
}

export async function loadPersistedLocalDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
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

export async function persistLocalDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openNativeWsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NATIVE_WS_STORE, 'readwrite');
    tx.objectStore(NATIVE_WS_STORE).put(handle, NATIVE_WS_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function pickLocalDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window.showDirectoryPicker !== 'function') return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await persistLocalDirectoryHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

export async function ensureLocalReadPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: string }) => Promise<string>;
    requestPermission?: (o: { mode: string }) => Promise<string>;
  };
  if (typeof h.queryPermission !== 'function') return true;
  let state = await h.queryPermission({ mode: 'read' });
  if (state === 'granted') return true;
  if (typeof h.requestPermission === 'function') {
    state = await h.requestPermission({ mode: 'read' });
  }
  return state === 'granted';
}

export async function resolveLocalSubdirectoryHandle(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle | null> {
  if (!path.trim()) return root;
  const parts = path.split('/').filter(Boolean);
  let current = root;
  for (const part of parts) {
    try {
      current = await current.getDirectoryHandle(part);
    } catch {
      return null;
    }
  }
  return current;
}
