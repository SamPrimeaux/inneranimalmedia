// types.ts

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum ProjectType {
  SANDBOX    = 'sandbox',
  PRODUCTION = 'production',
  STAGING    = 'staging',
}

export enum AppState {
  EDITING    = 'editing',
  GENERATING = 'generating',
  PREVIEWING = 'previewing',
  DEPLOYING  = 'deploying',
}

export enum ArtStyle {
  REALISTIC  = 'realistic',
  CARTOON    = 'cartoon',
  PIXEL      = 'pixel',
  LOW_POLY   = 'low_poly',
  WIREFRAME  = 'wireframe',
}

export enum CADTool {
  SELECT    = 'select',
  BOX       = 'box',
  SPHERE    = 'sphere',
  CYLINDER  = 'cylinder',
  PLANE     = 'plane',
  EXTRUDE   = 'extrude',
  MEASURE   = 'measure',
}

export enum CADPlane {
  XY = 'xy',
  XZ = 'xz',
  YZ = 'yz',
}

// ─── Core file type ───────────────────────────────────────────────────────────

export interface ActiveFile {
  id:            string;
  name:          string;
  content:       string;
  isDirty?:      boolean;
  language?:     string;
  workspacePath?: string;
  workspaceId?:  string;

  // R2 source
  r2Key?:        string;
  r2Bucket?:     string;

  // GitHub source
  githubRepo?:   string;
  githubPath?:   string;
  githubSha?:    string;   // for conflict detection on save

  // Original content snapshot (for diff view)
  originalContent?: string;
}

// ─── Scene / generation ───────────────────────────────────────────────────────

export interface SceneConfig {
  ambientLight:    number;
  fogDensity:      number;
  skyColor:        string;
  groundColor:     string;
  shadowsEnabled:  boolean;
}

export interface GenerationConfig {
  prompt:     string;
  artStyle:   ArtStyle;
  seed?:      number;
  steps?:     number;
  guidance?:  number;
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface GameEntity {
  id:        string;
  type:      string;
  position:  [number, number, number];
  rotation?: [number, number, number];
  scale?:    [number, number, number];
  props?:    Record<string, unknown>;
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export interface CustomAsset {
  id:        string;
  name:      string;
  url:       string;
  type:      'glb' | 'gltf' | 'image' | 'audio' | 'other';
  r2Key?:    string;
  r2Bucket?: string;
  sizeBytes?: number;
  uploadedAt?: string;
}
