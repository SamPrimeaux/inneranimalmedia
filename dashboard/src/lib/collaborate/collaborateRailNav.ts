export type CollaborateRailPanel = 'calendar' | 'keep' | 'notes' | 'contacts';

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
  mainSeg: 'calendar' | 'tasks';
  tasksList: string | null;
  focusPeople: boolean;
  projectId: string | null;
} {
  const seg = params.get('seg');
  const mainSeg = seg === 'tasks' ? 'tasks' : 'calendar';
  const tasksList = params.get('list')?.trim() || null;
  const focusPeople = params.get('panel') === 'people';
  const projectId = params.get('project')?.trim() || null;
  return { mainSeg, tasksList, focusPeople, projectId };
}
