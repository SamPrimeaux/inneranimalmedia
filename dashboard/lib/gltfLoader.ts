/**
 * GLTFLoader configured for meshopt-compressed chess piece GLBs on R2.
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

export function createChessGltfLoader(dracoLoader?: DRACOLoader): GLTFLoader {
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
