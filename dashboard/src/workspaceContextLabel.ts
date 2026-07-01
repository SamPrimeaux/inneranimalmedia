import { coalesceLabel } from './lib/coalesceLabel';
import type { IdeWorkspaceSnapshot } from './ideWorkspace';

/**
 * Cursor-style workspace label — show the real repo/folder/slug, not marketing display_name.
 */
export function resolveWorkspaceContextLabel(opts: {
  githubRepo?: string | null;
  workspaceSlug?: string | null;
  workspaceId?: string | null;
  ideWorkspace?: IdeWorkspaceSnapshot;
}): string {
  const gh = coalesceLabel(opts.githubRepo, '');
  if (gh) return gh;

  const ide = opts.ideWorkspace;
  if (ide && ide.source === 'local' && ide.folderName?.trim()) {
    return ide.folderName.trim();
  }
  if (ide && ide.source === 'pinned' && ide.name?.trim()) {
    return ide.pathHint?.trim() ? `${ide.name.trim()} — ${ide.pathHint.trim()}` : ide.name.trim();
  }

  const slug = opts.workspaceSlug?.trim();
  if (slug) return slug;

  const id = opts.workspaceId?.trim();
  if (id) return id.replace(/^ws_/, '') || id;

  return 'No workspace';
}
