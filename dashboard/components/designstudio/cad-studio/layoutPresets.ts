import type { WorkspaceId, WorkspaceLayout } from './cadStudioTypes';

/** Blender-style screen layouts — tool dock floats on viewport; no left rail column. */
export const WORKSPACE_LAYOUTS: Record<WorkspaceId, WorkspaceLayout> = {
  Layout: {
    id: 'Layout',
    gridTemplateAreas: `
      "viewport viewport right"
      "viewport viewport right"
      "timeline timeline right"
    `,
    gridTemplateColumns: '1fr 1fr minmax(260px, 320px)',
    gridTemplateRows: '1fr 1fr 120px',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
      { editor: 'timeline', area: 'timeline' },
    ],
  },
  Modeling: {
    id: 'Modeling',
    gridTemplateAreas: `
      "viewport right right"
      "viewport right right"
      "creation creation right"
    `,
    gridTemplateColumns: '1fr minmax(130px, 160px) minmax(200px, 260px)',
    gridTemplateRows: '1fr 1fr 140px',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
      { editor: 'creationPanel', area: 'creation' },
    ],
  },
  Sculpting: {
    id: 'Sculpting',
    gridTemplateAreas: `
      "viewport right"
      "viewport right"
    `,
    gridTemplateColumns: '1fr minmax(260px, 320px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  'UV Editing': {
    id: 'UV Editing',
    gridTemplateAreas: `
      "uv viewport right"
      "uv viewport right"
    `,
    gridTemplateColumns: '1fr 1fr minmax(240px, 280px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'viewportSecondary', area: 'uv' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  'Texture Paint': {
    id: 'Texture Paint',
    gridTemplateAreas: `
      "viewport image right"
      "viewport image right"
    `,
    gridTemplateColumns: '1fr minmax(180px, 220px) minmax(240px, 280px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'image' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  Shading: {
    id: 'Shading',
    gridTemplateAreas: `
      "nodes viewport right"
      "nodes viewport right"
    `,
    gridTemplateColumns: 'minmax(200px, 280px) 1fr minmax(240px, 280px)',
    gridTemplateRows: '1fr 1fr',
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
      "dopesheet dopesheet right"
    `,
    gridTemplateColumns: '1fr 1fr minmax(240px, 280px)',
    gridTemplateRows: '1fr 160px',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'cam' },
      { editor: 'dopesheet', area: 'dopesheet' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  Rendering: {
    id: 'Rendering',
    gridTemplateAreas: `
      "viewport render right right"
      "viewport render right right"
    `,
    gridTemplateColumns: '1fr 1fr minmax(130px, 160px) minmax(200px, 260px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'render' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  Compositing: {
    id: 'Compositing',
    gridTemplateAreas: `
      "viewport comp right"
      "viewport comp right"
    `,
    gridTemplateColumns: '1fr 1fr minmax(260px, 320px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'comp' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  'Geometry Nodes': {
    id: 'Geometry Nodes',
    gridTemplateAreas: `
      "viewport script right"
      "viewport script right"
    `,
    gridTemplateColumns: '1fr minmax(220px, 280px) minmax(240px, 280px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'script', area: 'script' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  Scripting: {
    id: 'Scripting',
    gridTemplateAreas: `
      "script viewport"
      "script viewport"
    `,
    gridTemplateColumns: 'minmax(280px, 360px) 1fr',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'script', area: 'script' },
      { editor: 'viewport', area: 'viewport' },
    ],
  },
  'Motion Tracking': {
    id: 'Motion Tracking',
    gridTemplateAreas: `
      "clip graph right"
      "viewport dopesheet right"
    `,
    gridTemplateColumns: '1fr 1fr minmax(220px, 260px)',
    gridTemplateRows: '1fr 160px',
    cells: [
      { editor: 'movieClip', area: 'clip' },
      { editor: 'graph', area: 'graph' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'dopesheet', area: 'dopesheet' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  'Video Editing': {
    id: 'Video Editing',
    gridTemplateAreas: `
      "viewport preview scopes right"
      "viewport sequencer sequencer right"
    `,
    gridTemplateColumns: '1fr 1fr minmax(160px, 200px) minmax(220px, 260px)',
    gridTemplateRows: '1fr 160px',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'preview' },
      { editor: 'scopes', area: 'scopes' },
      { editor: 'sequencer', area: 'sequencer' },
      { editor: 'colorBalance', area: 'right' },
    ],
  },
  '2D Animation': {
    id: '2D Animation',
    gridTemplateAreas: `
      "viewport layers right"
      "timeline timeline right"
    `,
    gridTemplateColumns: '1fr minmax(160px, 200px) minmax(220px, 260px)',
    gridTemplateRows: '1fr 120px',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'greaseLayers', area: 'layers' },
      { editor: 'timeline', area: 'timeline' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
  Agent: {
    id: 'Agent',
    gridTemplateAreas: `
      "viewport right"
      "viewport right"
    `,
    gridTemplateColumns: '1fr minmax(260px, 320px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'viewport', area: 'viewport' },
      { editor: 'rightTabs', area: 'right' },
    ],
  },
};

export function getLayoutForWorkspace(ws: WorkspaceId): WorkspaceLayout {
  return WORKSPACE_LAYOUTS[ws] ?? WORKSPACE_LAYOUTS.Layout;
}
