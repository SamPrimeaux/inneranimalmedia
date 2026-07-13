export type CadOperator = {
  id: string;
  title: string;
  type: string;
  engine: string;
  description: string;
  /** `local` = run in Three.js viewport (AgentSamEngine); `agent` = ChatAssistant tool loop */
  execution?: 'local' | 'agent';
};

/** Viewport primitives — never route through illustration_create / Draw. */
export const VIEWPORT_LOCAL_OPERATOR_IDS = new Set([
  'addCube',
  'deleteSelected',
  'resetScene',
  'exportGLB',
]);

export function isViewportLocalOperator(operatorId: string): boolean {
  return VIEWPORT_LOCAL_OPERATOR_IDS.has(String(operatorId || '').trim());
}

/** Catalog tool keys the agent should prefer for this operator (D1-pinned; freehand args). */
export function preferredCatalogToolsForOperator(operatorId: string): string[] {
  switch (String(operatorId || '').trim()) {
    case 'generateObject':
      return ['meshyai_text_to_3d', 'meshyai_image_to_3d', 'meshyai_get_task'];
    case 'meshyRig':
      return ['meshyai_rigging', 'meshyai_get_task'];
    case 'meshyAnimate':
      return ['meshyai_rigging', 'meshyai_animation', 'meshyai_get_task'];
    case 'meshyRemesh':
      return ['meshyai_remesh', 'meshyai_get_task'];
    case 'meshyConvert':
      return ['meshyai_convert', 'meshyai_get_task'];
    case 'meshyResize':
      return ['meshyai_resize', 'meshyai_get_task'];
    case 'meshyUvUnwrap':
      return ['meshyai_uv_unwrap', 'meshyai_get_task'];
    case 'meshyRetexture':
      return ['meshyai_retexture', 'meshyai_get_task'];
    case 'generateOpenSCAD':
      return ['illustration_create'];
    case 'generateFreeCAD':
      return ['illustration_create'];
    case 'generateBlender':
      return ['illustration_create'];
    case 'repairGeometry':
      return ['meshyai_remesh', 'illustration_create', 'meshyai_get_task'];
    default:
      return [];
  }
}

export const CAD_OPERATORS: CadOperator[] = [
  {
    id: 'generateObject',
    title: 'Generate CAD Object (Meshy)',
    type: 'AI',
    engine: 'Meshy',
    description: 'Text-to-3D via catalog tool meshyai_text_to_3d. GLB auto-spawns when job completes.',
    execution: 'agent',
  },
  {
    id: 'meshyRig',
    title: 'Rig Character (Meshy)',
    type: 'ANIM',
    engine: 'Meshy',
    description: 'Call meshyai_rigging on a Meshy model task id or GLB URL. Required before Apply Animation.',
    execution: 'agent',
  },
  {
    id: 'meshyAnimate',
    title: 'Apply Animation Clip (Meshy)',
    type: 'ANIM',
    engine: 'Meshy',
    description:
      'Call meshyai_animation with rig_task_id + action_id from the Meshy library. Do not fake progress with imgx_generate_image.',
    execution: 'agent',
  },
  {
    id: 'meshyRemesh',
    title: 'Remesh (Meshy)',
    type: 'MESH',
    engine: 'Meshy',
    description:
      'Remesh via meshyai_remesh (topology/polycount). Prefer meshyai_convert / meshyai_resize for format-only or size-only. Docs: docs.meshy.ai/en/api/remesh',
    execution: 'agent',
  },
  {
    id: 'meshyConvert',
    title: 'Convert Formats (Meshy)',
    type: 'EXPORT',
    engine: 'Meshy',
    description:
      'Meshy convert to glb/fbx/obj/usdz/blend/stl/3mf. Not CloudConvert (video/PDF/office → MovieMode).',
    execution: 'agent',
  },
  {
    id: 'meshyResize',
    title: 'Resize (Meshy)',
    type: 'MESH',
    engine: 'Meshy',
    description: 'Real-world resize via meshyai_resize (height / longest side / auto_size).',
    execution: 'agent',
  },
  {
    id: 'meshyUvUnwrap',
    title: 'UV Unwrap (Meshy)',
    type: 'MESH',
    engine: 'Meshy',
    description: 'UV white-model unwrap before retexture (≤40k faces). Remesh first if over limit.',
    execution: 'agent',
  },
  {
    id: 'meshyRetexture',
    title: 'Retexture (Meshy)',
    type: 'AI',
    engine: 'Meshy',
    description: 'Retexture a SUCCEEDED Meshy model via text or image style.',
    execution: 'agent',
  },
  {
    id: 'generateBlender',
    title: 'Generate Blender Script',
    type: 'SCRIPT',
    engine: 'Blender',
    description: 'Blender Python for materials/renders — not Meshy character animation.',
    execution: 'agent',
  },
  {
    id: 'generateOpenSCAD',
    title: 'Generate OpenSCAD Part',
    type: 'SCRIPT',
    engine: 'OpenSCAD',
    description: 'Parametric OpenSCAD component (not house master).',
    execution: 'agent',
  },
  {
    id: 'generateFreeCAD',
    title: 'Generate FreeCAD Part',
    type: 'SCRIPT',
    engine: 'FreeCAD',
    description: 'FreeCAD architectural / manufacturing geometry.',
    execution: 'agent',
  },
  {
    id: 'executeScript',
    title: 'Execute Current Script',
    type: 'RUN',
    engine: 'Runner',
    description: 'Execute the active script_ready job through ExecOS / GCP runner.',
    execution: 'agent',
  },
  {
    id: 'exportGLB',
    title: 'Export GLB',
    type: 'EXPORT',
    engine: 'Artifact',
    description: 'Download the latest job GLB or selected model URL.',
    execution: 'local',
  },
  {
    id: 'repairGeometry',
    title: 'Repair Geometry',
    type: 'FIX',
    engine: 'Agent',
    description: 'Prefer meshyai_remesh for Meshy meshes; FreeCAD runner for CAD masters.',
    execution: 'agent',
  },
  {
    id: 'addCube',
    title: 'Add Cube',
    type: 'SCENE',
    engine: 'Viewport',
    description: 'Add a voxel cube primitive to the scene.',
    execution: 'local',
  },
  {
    id: 'deleteSelected',
    title: 'Delete Selected',
    type: 'SCENE',
    engine: 'Viewport',
    description: 'Remove the selected object from the viewport.',
    execution: 'local',
  },
  {
    id: 'resetScene',
    title: 'Reset Scene',
    type: 'SCENE',
    engine: 'Viewport',
    description: 'Clear all objects from the viewport.',
    execution: 'local',
  },
];

export const DEFAULT_OPERATOR_PROMPT =
  'A chess king piece, ornate gothic crown with four arched buttresses, wide weighted base, ultra high detail.';
