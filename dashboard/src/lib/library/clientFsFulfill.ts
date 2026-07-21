/**
 * Browser FSA bridge — fulfill Agent Sam client_fs_request via IndexedDB directory handle.
 */
import {
  loadPersistedLocalDirectoryHandle,
  queryLocalReadPermission,
  resolveLocalSubdirectoryHandle,
} from './localHandleStore';
import { readLocalDirectoryEntries } from '../localFileTree';

export type ClientFsRequestPayload = {
  call_id?: string;
  callId?: string;
  path?: string;
  operation?: string;
  content?: string | null;
  conversation_id?: string;
  conversationId?: string;
};

function splitPath(path: string): { dir: string; name: string } {
  const cleaned = String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (!parts.length) return { dir: '', name: '' };
  const name = parts.pop() || '';
  return { dir: parts.join('/'), name };
}

async function ensureReadWrite(root: FileSystemDirectoryHandle): Promise<boolean> {
  const h = root as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: string }) => Promise<string>;
    requestPermission?: (o: { mode: string }) => Promise<string>;
  };
  if (typeof h.queryPermission !== 'function') return true;
  let state = await h.queryPermission({ mode: 'readwrite' });
  if (state === 'granted') return true;
  if (typeof h.requestPermission !== 'function') {
    const read = await queryLocalReadPermission(root);
    return read === 'granted' || read === 'unsupported';
  }
  state = await h.requestPermission({ mode: 'readwrite' });
  return state === 'granted';
}

/**
 * Execute a local FSA op and POST result to /api/agent/fs/fulfill.
 */
export async function fulfillClientFsRequest(
  evt: ClientFsRequestPayload,
  opts?: { conversationId?: string | null },
): Promise<void> {
  const callId = String(evt.call_id || evt.callId || '').trim();
  const conversationId = String(
    opts?.conversationId || evt.conversation_id || evt.conversationId || '',
  ).trim();
  if (!callId || !conversationId) return;

  const operation = String(evt.operation || 'read').toLowerCase();
  const path = String(evt.path || '').trim();
  let result: Record<string, unknown>;

  try {
    const root = await loadPersistedLocalDirectoryHandle();
    if (!root) {
      result = {
        ok: false,
        error: 'local_folder_not_connected',
        hint: 'Connect a local folder in Computers / Connections, then retry.',
        path,
        operation,
      };
    } else {
      const okPerm = await ensureReadWrite(root);
      if (!okPerm) {
        result = {
          ok: false,
          error: 'local_folder_permission_denied',
          hint: 'Click Reconnect folder to grant read/write permission.',
          path,
          operation,
          root_name: root.name,
        };
      } else if (operation === 'list') {
        const dir = await resolveLocalSubdirectoryHandle(root, path);
        if (!dir) {
          result = { ok: false, error: 'path_not_found', path, operation, root_name: root.name };
        } else {
          const entries = await readLocalDirectoryEntries(dir);
          result = {
            ok: true,
            path,
            operation: 'list',
            root_name: root.name,
            entries: entries.map((e) => ({
              name: e.name,
              kind: e.kind,
              path: path ? `${path.replace(/\/$/, '')}/${e.name}` : e.name,
            })),
          };
        }
      } else if (operation === 'write') {
        const { dir, name } = splitPath(path);
        if (!name) {
          result = { ok: false, error: 'path_required', path, operation, root_name: root.name };
        } else {
          const parent = dir
            ? await resolveLocalSubdirectoryHandle(root, dir)
            : root;
          if (!parent) {
            result = { ok: false, error: 'parent_not_found', path, operation, root_name: root.name };
          } else {
            const fileHandle = await parent.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(evt.content != null ? String(evt.content) : '');
            await writable.close();
            result = {
              ok: true,
              path,
              operation: 'write',
              root_name: root.name,
              bytes: evt.content != null ? String(evt.content).length : 0,
            };
          }
        }
      } else {
        const { dir, name } = splitPath(path);
        if (!name) {
          result = {
            ok: false,
            error: 'path_required',
            path,
            operation: 'read',
            root_name: root.name,
          };
        } else {
          const parent = await resolveLocalSubdirectoryHandle(root, dir);
          if (!parent) {
            result = {
              ok: false,
              error: 'path_not_found',
              path,
              operation: 'read',
              root_name: root.name,
            };
          } else {
            const fileHandle = await parent.getFileHandle(name);
            const file = await fileHandle.getFile();
            const text = await file.text();
            result = {
              ok: true,
              path,
              operation: 'read',
              root_name: root.name,
              content: text.slice(0, 200_000),
              truncated: text.length > 200_000,
              size: text.length,
            };
          }
        }
      }
    }
  } catch (e) {
    result = {
      ok: false,
      error: e instanceof Error ? e.message : 'client_fs_failed',
      path,
      operation,
    };
  }

  await fetch('/api/agent/fs/fulfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ callId, conversationId, result }),
  }).catch(() => {});
}
