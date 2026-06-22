export type CadOperator = {
  id: string;
  title: string;
  type: string;
  engine: string;
  description: string;
};

export const CAD_OPERATORS: CadOperator[] = [
  {
    id: 'generateObject',
    title: 'Generate CAD Object (Meshy)',
    type: 'AI',
    engine: 'Meshy',
    description: 'Text-to-3D preview via Meshy. GLB auto-spawns in viewport when complete.',
  },
  {
    id: 'generateBlender',
    title: 'Generate Blender Script',
    type: 'SCRIPT',
    engine: 'Blender',
    description: 'AI-generated Blender Python via designstudio_cad_script routing, then ExecOS execute.',
  },
  {
    id: 'generateOpenSCAD',
    title: 'Generate OpenSCAD Part',
    type: 'SCRIPT',
    engine: 'OpenSCAD',
    description: 'Parametric OpenSCAD script generation and runner execution.',
  },
  {
    id: 'generateFreeCAD',
    title: 'Generate FreeCAD Part',
    type: 'SCRIPT',
    engine: 'FreeCAD',
    description: 'FreeCAD Python script for manufacturing-style geometry.',
  },
  {
    id: 'executeScript',
    title: 'Execute Current Script',
    type: 'RUN',
    engine: 'Runner',
    description: 'Execute the active script_ready job through ExecOS / GCP runner.',
  },
  {
    id: 'exportGLB',
    title: 'Export GLB',
    type: 'EXPORT',
    engine: 'Artifact',
    description: 'Download the latest job GLB or selected model URL.',
  },
  {
    id: 'repairGeometry',
    title: 'Repair Geometry',
    type: 'FIX',
    engine: 'Agent',
    description: 'Geometry repair via ChatAssistant → FreeCAD runner script.',
  },
  {
    id: 'addCube',
    title: 'Add Cube',
    type: 'SCENE',
    engine: 'Viewport',
    description: 'Add a voxel cube primitive to the scene.',
  },
  {
    id: 'deleteSelected',
    title: 'Delete Selected',
    type: 'SCENE',
    engine: 'Viewport',
    description: 'Remove the selected object from the viewport.',
  },
  {
    id: 'resetScene',
    title: 'Reset Scene',
    type: 'SCENE',
    engine: 'Viewport',
    description: 'Clear all objects from the viewport.',
  },
];

export const DEFAULT_OPERATOR_PROMPT =
  'A chess king piece, ornate gothic crown with four arched buttresses, wide weighted base, ultra high detail.';
