import { readLocalDirectoryEntries } from '../../localFileTree';
import { ensureLocalReadPermission, resolveLocalSubdirectoryHandle } from '../localHandleStore';
import { mapLocalNode, sortLibraryItems } from '../mappers';
import type { LibraryListResult, LibraryProvider } from '../types';

export const localProvider: LibraryProvider = {
  source: 'local',
  label: 'Local folder',
  async list(params) {
    const root = params.localDirHandle;
    if (!root) {
      return {
        items: [],
        error: 'Connect a local folder via Computers in the sidebar',
      };
    }

    const ok = await ensureLocalReadPermission(root);
    if (!ok) {
      return { items: [], error: 'Local folder permission denied — reconnect via Computers' };
    }

    const dir = await resolveLocalSubdirectoryHandle(root, params.localPath || '');
    if (!dir) {
      return { items: [], error: 'Local path not found' };
    }

    try {
      const entries = await readLocalDirectoryEntries(dir);
      const path = params.localPath || '';
      const q = params.query?.trim().toLowerCase();
      let items = entries.map((node) => mapLocalNode(node, path));
      if (q) {
        items = items.filter((item) => item.name.toLowerCase().includes(q));
      }
      return { items: sortLibraryItems(items) };
    } catch (e) {
      return {
        items: [],
        error: e instanceof Error ? e.message : 'Local folder read failed',
      };
    }
  },
};
