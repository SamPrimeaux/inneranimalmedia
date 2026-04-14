
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import * as THREE from 'three';

export enum ProjectType {
  CHESS = 'MEAAUX_GAMES',
  CAD = 'MEAUX_CAD',
  SANDBOX = 'SANDBOX'
}

export enum ArtStyle {
  CYBERPUNK = 'CYBERPUNK',
  BRUTALIST = 'BRUTALIST',
  ORGANIC = 'ORGANIC',
  LOW_POLY = 'LOW_POLY'
}

export enum CADTool {
  NONE = 'NONE',
  VOXEL = 'VOXEL',
  PAINT = 'PAINT',
  LINE = 'LINE',
  RECTANGLE = 'RECTANGLE',
  CIRCLE = 'CIRCLE',
  CUBE = 'CUBE',
  SPHERE = 'SPHERE',
  CONE = 'CONE'
}

export enum CADPlane {
  XZ = 'XZ', // Ground
  XY = 'XY', // Front
  YZ = 'YZ'  // Side
}

export enum AppState {
  EDITING = 'EDITING',
  PLAYING = 'PLAYING',
  GENERATING = 'GENERATING',
  PLANNING = 'PLANNING'
}

export interface VoxelData {
  x: number;
  y: number;
  z: number;
  color: number;
}

export interface EntityBehavior {
  type: 'static' | 'hover' | 'rotate' | 'patrol' | 'chess_piece' | 'dynamic';
  speed?: number;
  mass?: number;
  restitution?: number;
  friction?: number;
  metadata?: any;
}

export interface GameEntity {
  id: string;
  name: string;
  type: 'player' | 'npc' | 'prop' | 'hazard' | 'piece';
  voxels?: VoxelData[];
  modelUrl?: string;
  scale?: number;
  position: { x: number, y: number, z: number };
  behavior: EntityBehavior;
}

export interface SceneConfig {
  ambientIntensity: number;
  sunColor: string;
  castShadows: boolean;
  showPhysicsDebug: boolean;
}

export interface GenerationConfig {
  style: ArtStyle;
  density: number; // 1-10 scale
  usePhysics: boolean;
  cadTool: CADTool;
  cadPlane: CADPlane;
  extrusion: number;
}

export interface CustomAsset {
  id: string;
  name: string;
  url: string;
}

export interface ProjectConfig {
  id: string;
  name: string;
  type: ProjectType;
  lastModified: number;
}

/** Open file in Monaco — local handle, R2, GitHub, or Drive metadata */
export type ActiveFile = {
  name: string;
  content: string;
  originalContent?: string;
  /** Relative path within the connected native folder (for lightweight chat context). */
  workspacePath?: string;
  handle?: FileSystemFileHandle;
  r2Key?: string;
  r2Bucket?: string;
  githubPath?: string;
  githubRepo?: string;
  githubSha?: string;
  /** Branch used for GitHub Contents API (list/get); save/delete should send the same branch. */
  githubBranch?: string;
  driveFileId?: string;
  /** R2 /api/r2/file: image preview via /api/r2/get */
  isImage?: boolean;
  isBinary?: boolean;
  previewUrl?: string;
  contentType?: string;
  size?: number;
  binaryMessage?: string;
};
