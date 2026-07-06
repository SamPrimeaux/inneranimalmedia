export type CollaborateRailPanel = 'calendar' | 'keep' | 'notes' | 'contacts';

export type CollaborateMainSeg = 'calendar' | 'tasks';

export type CollaborateCalView = 'week' | 'month';

/** Deep-link into the live /dashboard/collaborate surface (or related routes). */
export function collaborateDeepLink(panel: CollaborateRailPanel): string {
  switch (panel) {
    case 'calendar':
      return '/dashboard/collaborate';
    case 'keep':
      return '/dashboard/collaborate?seg=tasks&list=Keep';
    case 'notes':
      return '/dashboard/collaborate?seg=tasks';
    case 'contacts':
      return '/dashboard/collaborate?panel=people';
    default:
      return '/dashboard/collaborate';
  }
}

export function parseCollaborateSearchParams(params: URLSearchParams): {
  mainSeg: CollaborateMainSeg;
  tasksList: string | null;
  focusPeople: boolean;
  projectId: string | null;
  clientId: string | null;
  clientWork: boolean;
  calView: CollaborateCalView;
} {
  const seg = params.get('seg');
  const mainSeg = seg === 'tasks' ? 'tasks' : 'calendar';
  const tasksList = params.get('list')?.trim() || null;
  const focusPeople = params.get('panel') === 'people';
  const projectId = params.get('project')?.trim() || null;
  const clientId = params.get('client')?.trim() || null;
  const clientWork = params.get('client_work') === '1';
  const calView = params.get('view') === 'month' ? 'month' : 'week';
  return { mainSeg, tasksList, focusPeople, projectId, clientId, clientWork, calView };
}

/** Merge collaborate URL params (omit null/empty to delete keys). */
export function patchCollaborateSearchParams(
  current: URLSearchParams,
  patch: {
    seg?: CollaborateMainSeg | null;
    view?: CollaborateCalView | null;
    project?: string | null;
    client?: string | null;
    client_work?: string | null;
    list?: string | null;
    panel?: string | null;
  },
): URLSearchParams {
  const next = new URLSearchParams(current);
  const apply = (key: string, val: string | null | undefined) => {
    if (val == null || val === '') next.delete(key);
    else next.set(key, val);
  };
  if ('seg' in patch) {
    apply('seg', patch.seg === 'tasks' ? 'tasks' : null);
  }
  if ('view' in patch) {
    apply('view', patch.view === 'month' ? 'month' : null);
  }
  if ('project' in patch) apply('project', patch.project ?? null);
  if ('client' in patch) apply('client', patch.client ?? null);
  if ('client_work' in patch) apply('client_work', patch.client_work ?? null);
  if ('list' in patch) apply('list', patch.list ?? null);
  if ('panel' in patch) apply('panel', patch.panel ?? null);
  return next;
}
