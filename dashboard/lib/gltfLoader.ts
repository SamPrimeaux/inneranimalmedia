/**
 * Platform GLTFLoader — meshopt (skinned/animated) + optional Draco (static props).
 * AgentSamEngine and Design Studio viewports share this loader.
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

let meshoptReady: Promise<void> | null = null;

export function ensureMeshoptDecoderReady(): Promise<void> {
  if (!meshoptReady) {
    const decoder = MeshoptDecoder as { supported?: boolean; ready?: Promise<unknown> };
    meshoptReady =
      decoder.supported === false
        ? Promise.resolve()
        : (decoder.ready ?? Promise.resolve()).then(() => undefined);
  }
  return meshoptReady;
}

/** Primary loader factory for IAM GLBs (meshopt default; Draco when passed). */
export function createPlatformGltfLoader(dracoLoader?: DRACOLoader): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setCrossOrigin('anonymous');

  const decoder = MeshoptDecoder as { supported?: boolean };
  if (decoder.supported !== false) {
    loader.setMeshoptDecoder(MeshoptDecoder);
  }

  if (dracoLoader) {
    loader.setDRACOLoader(dracoLoader);
  }

  return loader;
}

/** @deprecated Use createPlatformGltfLoader — alias for chess + legacy imports. */
export const createChessGltfLoader = createPlatformGltfLoader;
