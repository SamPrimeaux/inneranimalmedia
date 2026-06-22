import type { LucideIcon } from 'lucide-react';
import {
  Box,
  Clapperboard,
  Download,
  Eraser,
  Layers,
  Maximize2,
  MousePointer2,
  Move3d,
  Palette,
  PenLine,
  Plus,
  RotateCw,
  Scaling,
  Scissors,
  Search,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react';
import type { WorkspaceId } from './cadStudioTypes';

export type DockDomainId =
  | 'transform'
  | 'model'
  | 'create'
  | 'scene'
  | 'shade'
  | 'animate'
  | 'agent';

export type DockActionKind = 'local' | 'operator' | 'panel';

export type DockAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  kind: DockActionKind;
  operatorId?: string;
  shortcut?: string;
};

export type DockDomain = {
  id: DockDomainId;
  label: string;
  icon: LucideIcon;
  sections: { title: string; actions: DockAction[] }[];
};

const TRANSFORM_ACTIONS: DockAction[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, kind: 'local', shortcut: 'Q' },
  { id: 'move', label: 'Move', icon: Move3d, kind: 'local', shortcut: 'G' },
  { id: 'rotate', label: 'Rotate', icon: RotateCw, kind: 'local', shortcut: 'R' },
  { id: 'scale', label: 'Scale', icon: Scaling, kind: 'local', shortcut: 'S' },
  { id: 'frameAll', label: 'Frame All', icon: Maximize2, kind: 'local' },
];

const CREATE_ACTIONS: DockAction[] = [
  { id: 'addCube', label: 'Add Cube', icon: Box, kind: 'local' },
  { id: 'importGlb', label: 'Import GLB', icon: Upload, kind: 'local' },
  { id: 'generate', label: 'Generate CAD', icon: Sparkles, kind: 'panel' },
  { id: 'operatorSearch', label: 'Operator Search', icon: Search, kind: 'panel', shortcut: 'Cmd+K' },
];

const SCENE_ACTIONS: DockAction[] = [
  { id: 'assets', label: 'Assets Panel', icon: Layers, kind: 'panel' },
  { id: 'outliner', label: 'Outliner', icon: Layers, kind: 'panel' },
  { id: 'delete', label: 'Delete Selected', icon: Eraser, kind: 'local', shortcut: 'Del' },
  { id: 'exportGlb', label: 'Export GLB', icon: Download, kind: 'local' },
];

const SHADE_ACTIONS: DockAction[] = [
  { id: 'wireframe', label: 'Wireframe', icon: Box, kind: 'local' },
  { id: 'solid', label: 'Solid Shading', icon: Palette, kind: 'local' },
  { id: 'renderViewport', label: 'Render Viewport PNG', icon: Download, kind: 'local' },
];

const ANIMATE_ACTIONS: DockAction[] = [
  { id: 'keyframe', label: 'Insert Keyframe', icon: Clapperboard, kind: 'operator', operatorId: 'generateBlender' },
  { id: 'rig', label: 'Rig / Animate', icon: Clapperboard, kind: 'operator', operatorId: 'generateObject' },
];

const AGENT_ACTIONS: DockAction[] = [
  { id: 'operatorSearch', label: 'Operator Search', icon: Search, kind: 'panel' },
  { id: 'repair', label: 'Repair Geometry', icon: Wrench, kind: 'operator', operatorId: 'repairGeometry' },
  { id: 'executeScript', label: 'Run Script', icon: PenLine, kind: 'operator', operatorId: 'executeScript' },
];

function modelActionsForWorkspace(ws: WorkspaceId): DockAction[] {
  switch (ws) {
    case 'Modeling':
      return [
        { id: 'extrude', label: 'Extrude', icon: Box, kind: 'operator', operatorId: 'generateBlender' },
        { id: 'inset', label: 'Inset', icon: Box, kind: 'operator', operatorId: 'generateBlender' },
        { id: 'bevel', label: 'Bevel', icon: Box, kind: 'operator', operatorId: 'generateBlender' },
        { id: 'loopcut', label: 'Loop Cut', icon: Scissors, kind: 'operator', operatorId: 'generateBlender' },
      ];
    case 'Sculpting':
      return [
        { id: 'draw', label: 'Draw', icon: PenLine, kind: 'operator', operatorId: 'generateBlender' },
        { id: 'smooth', label: 'Smooth', icon: PenLine, kind: 'operator', operatorId: 'generateBlender' },
        { id: 'grab', label: 'Grab', icon: Move3d, kind: 'operator', operatorId: 'generateBlender' },
      ];
    case 'UV Editing':
      return [
        { id: 'unwrap', label: 'Smart UV', icon: Box, kind: 'operator', operatorId: 'generateBlender' },
        { id: 'pack', label: 'Pack Islands', icon: Box, kind: 'operator', operatorId: 'generateBlender' },
      ];
    case 'Texture Paint':
      return [{ id: 'paint', label: 'Texture Paint', icon: Palette, kind: 'operator', operatorId: 'generateObject' }];
    case 'Compositing':
      return [{ id: 'composite', label: 'Composite', icon: Layers, kind: 'operator', operatorId: 'generateBlender' }];
    case 'Geometry Nodes':
      return [{ id: 'regen', label: 'Regenerate', icon: RotateCw, kind: 'operator', operatorId: 'generateOpenSCAD' }];
    case 'Motion Tracking':
      return [
        { id: 'track', label: 'Add Tracker', icon: Plus, kind: 'operator', operatorId: 'generateBlender' },
        { id: 'solve', label: 'Solve Camera', icon: Search, kind: 'operator', operatorId: 'generateBlender' },
      ];
    case 'Video Editing':
      return [{ id: 'cut', label: 'Cut Strip', icon: Scissors, kind: 'operator', operatorId: 'generateBlender' }];
    case '2D Animation':
      return [{ id: 'gpDraw', label: 'Draw Stroke', icon: PenLine, kind: 'operator', operatorId: 'generateBlender' }];
    default:
      return [];
  }
}

export const WORKSPACE_DOMAINS: Record<WorkspaceId, DockDomainId[]> = {
  Layout: ['transform', 'create', 'scene'],
  Modeling: ['transform', 'model', 'create', 'scene'],
  Sculpting: ['transform', 'model', 'scene'],
  'UV Editing': ['transform', 'model', 'scene'],
  'Texture Paint': ['transform', 'model', 'scene'],
  Shading: ['transform', 'shade', 'scene'],
  Animation: ['transform', 'animate', 'scene'],
  Rendering: ['shade', 'create', 'agent'],
  Compositing: ['model', 'shade', 'scene'],
  'Geometry Nodes': ['transform', 'model', 'create', 'scene'],
  Scripting: ['create', 'agent', 'scene'],
  'Motion Tracking': ['transform', 'model', 'agent', 'scene'],
  'Video Editing': ['model', 'shade', 'scene'],
  '2D Animation': ['transform', 'model', 'animate', 'scene'],
  Agent: ['create', 'agent', 'scene'],
};

export function buildDockDomains(workspace: WorkspaceId): DockDomain[] {
  const modelActs = modelActionsForWorkspace(workspace);
  const all: Record<DockDomainId, DockDomain> = {
    transform: {
      id: 'transform',
      label: 'Transform',
      icon: Move3d,
      sections: [{ title: 'Transform', actions: TRANSFORM_ACTIONS }],
    },
    model: {
      id: 'model',
      label: 'Model',
      icon: Box,
      sections: modelActs.length
        ? [{ title: workspace, actions: modelActs }]
        : [{ title: 'Mesh', actions: [{ id: 'none', label: 'Switch workspace for mesh tools', icon: Box, kind: 'local' }] }],
    },
    create: {
      id: 'create',
      label: 'Create',
      icon: Plus,
      sections: [{ title: 'Create', actions: CREATE_ACTIONS }],
    },
    scene: {
      id: 'scene',
      label: 'Scene',
      icon: Layers,
      sections: [{ title: 'Scene', actions: SCENE_ACTIONS }],
    },
    shade: {
      id: 'shade',
      label: 'Shade',
      icon: Palette,
      sections: [{ title: 'Shade', actions: SHADE_ACTIONS }],
    },
    animate: {
      id: 'animate',
      label: 'Animate',
      icon: Clapperboard,
      sections: [{ title: 'Animate', actions: ANIMATE_ACTIONS }],
    },
    agent: {
      id: 'agent',
      label: 'Agent',
      icon: Sparkles,
      sections: [{ title: 'Agent', actions: AGENT_ACTIONS }],
    },
  };

  return (WORKSPACE_DOMAINS[workspace] ?? WORKSPACE_DOMAINS.Layout).map((id) => all[id]);
}
