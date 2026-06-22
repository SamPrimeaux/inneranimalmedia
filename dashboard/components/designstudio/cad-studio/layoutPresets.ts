import type { WorkspaceId, WorkspaceLayout } from './cadStudioTypes';

/** Production layouts — viewport + right rail; bottom strips only when needed. */
export const WORKSPACE_LAYOUTS: Record<WorkspaceId, WorkspaceLayout> = {
  Layout: {
    id: 'Layout',
    gridTemplateAreas: `
      "viewport right"
      "viewport right"
      "timeline timeline"
    `,
    gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr) minmax(100px, 140px)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
      { editor: 'timeline', area: 'timeline' },
    ],
  },
  Modeling: {
    id: 'Modeling',
    gridTemplateAreas: `
      "viewport right"
      "viewport right"
      "creation creation"
    `,
    gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr) minmax(160px, 240px)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
      { editor: 'creationPanel', area: 'creation' },
    ],
  },
  Sculpting: {
    id: 'Sculpting',
    gridTemplateAreas: '"viewport right" "viewport right"',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  'UV Editing': {
    id: 'UV Editing',
    gridTemplateAreas: '"uv viewport right" "uv viewport right"',
    gridTemplateColumns: 'minmax(180px, 260px) minmax(0, 1fr) minmax(240px, 320px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    cells: [
      { editor: 'viewportSecondary', area: 'uv' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  'Texture Paint': {
    id: 'Texture Paint',
    gridTemplateAreas: '"viewport image right" "viewport image right"',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 240px) minmax(240px, 320px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'image' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  Shading: {
    id: 'Shading',
    gridTemplateAreas: '"nodes viewport right" "nodes viewport right"',
    gridTemplateColumns: 'minmax(200px, 280px) minmax(0, 1fr) minmax(240px, 320px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    cells: [
      { editor: 'nodes', area: 'nodes' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  Animation: {
    id: 'Animation',
    gridTemplateAreas: `
      "viewport cam right"
      "viewport cam right"
      "timeline timeline timeline"
    `,
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(240px, 320px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr) minmax(120px, 160px)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'cam' },
      { editor: 'rightTabs', area: 'right' },
      { editor: 'timeline', area: 'timeline' },
    ],
  },
  Rendering: {
    id: 'Rendering',
    gridTemplateAreas: '"viewport render right" "viewport render right"',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(280px, 360px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'render' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  Compositing: {
    id: 'Compositing',
    gridTemplateAreas: '"viewport comp right" "viewport comp right"',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(280px, 360px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'comp' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  'Geometry Nodes': {
    id: 'Geometry Nodes',
    gridTemplateAreas: '"viewport script right" "viewport script right"',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 300px) minmax(240px, 320px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'script', area: 'script' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  Scripting: {
    id: 'Scripting',
    gridTemplateAreas: '"script viewport" "script viewport"',
    gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    cells: [
      { editor: 'script', area: 'script' },
      { editor: 'viewport', area: 'viewport' },
    ],
  },
  'Motion Tracking': {
    id: 'Motion Tracking',
    gridTemplateAreas: `
      "clip graph right"
      "viewport viewport right"
      "timeline timeline timeline"
    `,
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(240px, 320px)',
    gridTemplateRows: 'minmax(120px, 180px) minmax(0, 1fr) minmax(100px, 140px)',
    cells: [
      { editor: 'movieClip', area: 'clip' },
      { editor: 'graph', area: 'graph' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
      { editor: 'timeline', area: 'timeline' },
    ],
  },
  'Video Editing': {
    id: 'Video Editing',
    gridTemplateAreas: `
      "viewport preview right"
      "sequencer scopes right"
    `,
    gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 240px) minmax(240px, 320px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(140px, 200px)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'preview' },
      { editor: 'sequencer', area: 'sequencer' },
      { editor: 'scopes', area: 'scopes' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  '2D Animation': {
    id: '2D Animation',
    gridTemplateAreas: `
      "viewport layers right"
      "timeline timeline right"
    `,
    gridTemplateColumns: 'minmax(0, 1fr) minmax(160px, 220px) minmax(240px, 320px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(100px, 140px)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'greaseLayers', area: 'layers' },
      { editor: 'timeline', area: 'timeline' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  Agent: {
    id: 'Agent',
    gridTemplateAreas: '"viewport right" "viewport right"',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
};

export function getLayoutForWorkspace(ws: WorkspaceId): WorkspaceLayout {
  return WORKSPACE_LAYOUTS[ws] ?? WORKSPACE_LAYOUTS.Layout;
}

type PanelVisibilityLike = {
  outliner: boolean;
  properties: boolean;
  assets: boolean;
  timeline: boolean;
};

/** Collapse empty grid columns when panels are hidden — prevents white void / orphan columns. */
export function adjustLayoutForVisibility(
  layout: WorkspaceLayout,
  panelVisibility: PanelVisibilityLike,
): WorkspaceLayout {
  const rightHidden =
    !panelVisibility.outliner && !panelVisibility.properties && !panelVisibility.assets;
  const timelineHidden = !panelVisibility.timeline;

  let areas = layout.gridTemplateAreas.trim();
  let columns = layout.gridTemplateColumns.trim();
  let rows = layout.gridTemplateRows.trim();

  if (rightHidden) {
    areas = areas.replace(/\s+right/g, '').replace(/right\s+/g, '').replace(/"right"/g, '').trim();
    const colParts = columns.split(/\s+/);
    if (colParts.length >= 2) {
      columns = colParts.slice(0, -1).join(' ');
    }
  }

  if (timelineHidden) {
    areas = areas
      .split('\n')
      .filter((line) => !line.includes('timeline') && !line.includes('dopesheet'))
      .join('\n')
      .trim();
    const rowParts = rows.split(/\s+/);
    if (rowParts.length >= 2) {
      rows = rowParts.slice(0, -1).join(' ');
    }
  }

  if (areas === layout.gridTemplateAreas.trim() && columns === layout.gridTemplateColumns.trim() && rows === layout.gridTemplateRows.trim()) {
    return layout;
  }

  return {
    ...layout,
    gridTemplateAreas: areas,
    gridTemplateColumns: columns,
    gridTemplateRows: rows,
  };
}
