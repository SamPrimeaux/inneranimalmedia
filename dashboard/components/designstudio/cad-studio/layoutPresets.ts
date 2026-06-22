import type { WorkspaceId, WorkspaceLayout } from './cadStudioTypes';

/** Blender-style screen layouts — each workspace rearranges editors. */
export const WORKSPACE_LAYOUTS: Record<WorkspaceId, WorkspaceLayout> = {
  Layout: {
    id: 'Layout',
    gridTemplateAreas: `
      "tools viewport viewport right"
      "tools viewport viewport right"
      "tools timeline timeline right"
    `,
    gridTemplateColumns: '46px 1fr 1fr minmax(260px, 320px)',
    gridTemplateRows: '1fr 1fr 120px',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'outliner', area: 'right' },
      { editor: 'timeline', area: 'timeline' },
    ],
  },
  Modeling: {
    id: 'Modeling',
    gridTemplateAreas: `
      "tools viewport right right"
      "tools viewport right right"
      "tools creation creation right"
    `,
    gridTemplateColumns: '46px 1fr minmax(130px, 160px) minmax(200px, 260px)',
    gridTemplateRows: '1fr 1fr 140px',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'outliner', area: 'right' },
      { editor: 'properties', area: 'right' },
      { editor: 'creationPanel', area: 'creation' },
    ],
  },
  Sculpting: {
    id: 'Sculpting',
    gridTemplateAreas: `
      "tools viewport right"
      "tools viewport right"
    `,
    gridTemplateColumns: '46px 1fr minmax(260px, 320px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'properties', area: 'right' },
    ],
  },
  'UV Editing': {
    id: 'UV Editing',
    gridTemplateAreas: `
      "tools uv viewport right"
      "tools uv viewport right"
    `,
    gridTemplateColumns: '46px 1fr 1fr minmax(240px, 280px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewportSecondary', area: 'uv' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'properties', area: 'right' },
    ],
  },
  'Texture Paint': {
    id: 'Texture Paint',
    gridTemplateAreas: `
      "tools viewport image right"
      "tools viewport image right"
    `,
    gridTemplateColumns: '46px 1fr minmax(180px, 220px) minmax(240px, 280px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'image' },
      { editor: 'properties', area: 'right' },
    ],
  },
  Shading: {
    id: 'Shading',
    gridTemplateAreas: `
      "tools nodes viewport right"
      "tools nodes viewport right"
    `,
    gridTemplateColumns: '46px minmax(200px, 280px) 1fr minmax(240px, 280px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'nodes', area: 'nodes' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'properties', area: 'right' },
    ],
  },
  Animation: {
    id: 'Animation',
    gridTemplateAreas: `
      "tools viewport cam right"
      "tools dopesheet dopesheet right"
    `,
    gridTemplateColumns: '46px 1fr 1fr minmax(240px, 280px)',
    gridTemplateRows: '1fr 160px',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'viewportSecondary', area: 'cam' },
      { editor: 'dopesheet', area: 'dopesheet' },
      { editor: 'properties', area: 'right' },
    ],
  },
  Rendering: {
    id: 'Rendering',
    gridTemplateAreas: `
      "tools render right right"
      "tools render right right"
    `,
    gridTemplateColumns: '46px 1fr minmax(130px, 160px) minmax(200px, 260px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewportSecondary', area: 'render' },
      { editor: 'outliner', area: 'right' },
      { editor: 'properties', area: 'right' },
    ],
  },
  Compositing: {
    id: 'Compositing',
    gridTemplateAreas: `
      "tools comp right"
      "tools comp right"
    `,
    gridTemplateColumns: '46px 1fr minmax(260px, 320px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewportSecondary', area: 'comp' },
      { editor: 'properties', area: 'right' },
    ],
  },
  'Geometry Nodes': {
    id: 'Geometry Nodes',
    gridTemplateAreas: `
      "tools viewport script right"
      "tools viewport script right"
    `,
    gridTemplateColumns: '46px 1fr minmax(220px, 280px) minmax(240px, 280px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'script', area: 'script' },
      { editor: 'properties', area: 'right' },
    ],
  },
  Scripting: {
    id: 'Scripting',
    gridTemplateAreas: `
      "tools script viewport"
      "tools script viewport"
    `,
    gridTemplateColumns: '46px minmax(280px, 360px) 1fr',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'script', area: 'script' },
      { editor: 'viewport', area: 'viewport' },
    ],
  },
  'Motion Tracking': {
    id: 'Motion Tracking',
    gridTemplateAreas: `
      "tools clip graph right"
      "tools viewport dopesheet right"
    `,
    gridTemplateColumns: '46px 1fr 1fr minmax(220px, 260px)',
    gridTemplateRows: '1fr 160px',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'movieClip', area: 'clip' },
      { editor: 'graph', area: 'graph' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'dopesheet', area: 'dopesheet' },
      { editor: 'properties', area: 'right' },
    ],
  },
  'Video Editing': {
    id: 'Video Editing',
    gridTemplateAreas: `
      "tools preview scopes right"
      "tools sequencer sequencer right"
    `,
    gridTemplateColumns: '46px 1fr minmax(160px, 200px) minmax(220px, 260px)',
    gridTemplateRows: '1fr 160px',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewportSecondary', area: 'preview' },
      { editor: 'scopes', area: 'scopes' },
      { editor: 'sequencer', area: 'sequencer' },
      { editor: 'colorBalance', area: 'right' },
    ],
  },
  '2D Animation': {
    id: '2D Animation',
    gridTemplateAreas: `
      "tools viewport layers right"
      "tools timeline timeline right"
    `,
    gridTemplateColumns: '46px 1fr minmax(160px, 200px) minmax(220px, 260px)',
    gridTemplateRows: '1fr 120px',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'greaseLayers', area: 'layers' },
      { editor: 'timeline', area: 'timeline' },
      { editor: 'properties', area: 'right' },
    ],
  },
  Agent: {
    id: 'Agent',
    gridTemplateAreas: `
      "tools viewport right"
      "tools viewport right"
    `,
    gridTemplateColumns: '46px 1fr minmax(260px, 320px)',
    gridTemplateRows: '1fr 1fr',
    cells: [
      { editor: 'toolShelf', area: 'tools' },
      { editor: 'viewport', area: 'viewport' },
      { editor: 'assets', area: 'right' },
    ],
  },
};

export function getLayoutForWorkspace(ws: WorkspaceId): WorkspaceLayout {
  return WORKSPACE_LAYOUTS[ws] ?? WORKSPACE_LAYOUTS.Layout;
}
