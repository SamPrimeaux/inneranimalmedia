// ─── Enums ────────────────────────────────────────────────────────────────────

export enum ProjectType {
  CHESS   = 'chess',
  CAD     = 'cad',
  SANDBOX = 'sandbox',
}

export enum AppState {
  EDITING    = 'editing',
  GENERATING = 'generating',
  PREVIEWING = 'previewing',
  DEPLOYING  = 'deploying',
}

export enum ArtStyle {
  CYBERPUNK = 'cyberpunk',
  BRUTALIST = 'brutalist',
  ORGANIC   = 'organic',
  LOW_POLY  = 'low_poly',
}

export enum CADTool {
  NONE     = 'none',
  SELECT   = 'select',
  BOX      = 'box',
  SPHERE   = 'sphere',
  CYLINDER = 'cylinder',
  PLANE    = 'plane',
  EXTRUDE  = 'extrude',
  MEASURE  = 'measure',
}

export enum CADPlane {
  XY = 'xy',
  XZ = 'xz',
  YZ = 'yz',
}

// ─── Core file type ───────────────────────────────────────────────────────────

export interface ActiveFile {
  id?:              string;
  name:             string;
  content:          string;
  isDirty?:         boolean;
  language?:        string;
  workspacePath?:   string;
  workspaceId?:     string;
  r2Key?:           string;
  r2Bucket?:        string;
  githubRepo?:      string;
  githubPath?:      string;
  githubSha?:       string;
  githubBranch?:    string;
  driveFileId?:     string;
  handle?:          FileSystemFileHandle;
  originalContent?: string;
}

// ─── Scene / generation ───────────────────────────────────────────────────────

export interface SceneConfig {
  ambientIntensity: number;
  sunColor:         string;
  castShadows:      boolean;
  showPhysicsDebug: boolean;
}

export interface GenerationConfig {
  style:     ArtStyle;
  density:   number;
  usePhysics: boolean;
  cadTool:   CADTool;
  cadPlane:  CADPlane;
  extrusion: number;
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface EntityPosition {
  x: number;
  y: number;
  z: number;
}

export interface EntityBehavior {
  type:        'dynamic' | 'static' | 'kinematic';
  mass?:       number;
  restitution?: number;
}

export interface GameEntity {
  id:        string;
  name:      string;
  type:      string;
  position:  EntityPosition;
  rotation?: EntityPosition;
  scale?:    number;
  modelUrl?: string;
  behavior?: EntityBehavior;
  voxels?:   VoxelData[];
  props?:    Record<string, unknown>;
}

export interface VoxelData {
  position: EntityPosition;
  color:    number;
  size?:    number;
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export interface CustomAsset {
  id:          string;
  name:        string;
  url:         string;
  type?:       'glb' | 'gltf' | 'image' | 'audio' | 'other';
  r2Key?:      string;
  r2Bucket?:   string;
  sizeBytes?:  number;
  uploadedAt?: string;
}
