/**
 * Search filenames under the persisted File System Access directory handle.
 * Used by Cmd+K @ / Files chip — not a full-text index.
 */
import {
  LOCAL_TREE_SKIP_DIR_NAMES,
  readLocalDirectoryEntries,
} from './localFileTree';
import {
  loadPersistedLocalDirectoryHandle,
  queryLocalReadPermission,
} from './library/localHandleStore';

export type ConnectedLocalFileHit = {
  path: string;
  name: string;
  rootName: string;
};

const MAX_MATCHES = 24;
const MAX_DIRS = 400;
const MAX_DEPTH = 6;

/**
 * Breadth-first filename search under the connected local folder.
 * @param searchTerm empty → top-level files + common roots (package.json, README.md, …)
 */
export async function searchConnectedLocalFiles(
  searchTerm: string,
): Promise<{ hits: ConnectedLocalFileHit[]; connected: boolean; permission: string }> {
  const root = await loadPersistedLocalDirectoryHandle();
  if (!root) {
    return { hits: [], connected: false, permission: 'none' };
  }
  const perm = await queryLocalReadPermission(root);
  if (perm !== 'granted' && perm !== 'unsupported') {
    return { hits: [], connected: true, permission: perm };
  }

  const needle = String(searchTerm || '').trim().toLowerCase();
  const rootName = root.name || 'local';
  const hits: ConnectedLocalFileHit[] = [];
  const queue: { handle: FileSystemDirectoryHandle; prefix: string; depth: number }[] = [
    { handle: root, prefix: '', depth: 0 },
  ];
  let dirsVisited = 0;

  while (queue.length && hits.length < MAX_MATCHES && dirsVisited < MAX_DIRS) {
    const cur = queue.shift();
    if (!cur) break;
    dirsVisited += 1;
    let children;
    try {
      children = await readLocalDirectoryEntries(cur.handle);
    } catch {
      continue;
    }
    for (const child of children) {
      const path = cur.prefix ? `${cur.prefix}/${child.name}` : child.name;
      if (child.kind === 'file') {
        const nameLc = child.name.toLowerCase();
        const pathLc = path.toLowerCase();
        const match = !needle
          ? isDefaultFileHint(nameLc)
          : nameLc.includes(needle) || pathLc.includes(needle);
        if (match) {
          hits.push({ path, name: child.name, rootName });
          if (hits.length >= MAX_MATCHES) break;
        }
      } else if (child.kind === 'directory' && cur.depth < MAX_DEPTH) {
        if (LOCAL_TREE_SKIP_DIR_NAMES.has(child.name)) continue;
        if (child.name.startsWith('.') && child.name !== '.agents' && child.name !== '.cursor') {
          continue;
        }
        queue.push({
          handle: child.handle as FileSystemDirectoryHandle,
          prefix: path,
          depth: cur.depth + 1,
        });
      }
    }
  }

  hits.sort((a, b) => {
    const aScore = scoreHit(a, needle);
    const bScore = scoreHit(b, needle);
    if (aScore !== bScore) return aScore - bScore;
    return a.path.localeCompare(b.path);
  });

  return { hits, connected: true, permission: String(perm) };
}

function isDefaultFileHint(nameLc: string): boolean {
  return (
    nameLc === 'package.json' ||
    nameLc === 'readme.md' ||
    nameLc === 'wrangler.toml' ||
    nameLc === 'wrangler.jsonc' ||
    nameLc === 'tsconfig.json'
  );
}

function scoreHit(hit: ConnectedLocalFileHit, needle: string): number {
  const nameLc = hit.name.toLowerCase();
  if (!needle) {
    if (nameLc === 'package.json') return 0;
    if (nameLc === 'readme.md') return 1;
    return 2;
  }
  if (nameLc === needle) return 0;
  if (nameLc.startsWith(needle)) return 1;
  if (nameLc.includes(needle)) return 2;
  return 3;
}

/**
 * Resolve a relative path under the connected folder and return the file handle.
 */
export async function resolveConnectedLocalFile(
  relPath: string,
): Promise<{ file: File; handle: FileSystemFileHandle; workspacePath: string } | null> {
  const root = await loadPersistedLocalDirectoryHandle();
  if (!root) return null;
  const perm = await queryLocalReadPermission(root);
  if (perm !== 'granted' && perm !== 'unsupported') return null;

  const parts = String(relPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (!parts.length || parts.some((p) => p === '..')) return null;

  let dir: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(parts[i]);
    } catch {
      return null;
    }
  }
  try {
    const handle = await dir.getFileHandle(parts[parts.length - 1]);
    const file = await handle.getFile();
    return { file, handle, workspacePath: parts.join('/') };
  } catch {
    return null;
  }
}
