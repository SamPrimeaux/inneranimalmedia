/**
 * Glass (white) and amber (orange) piece materials + PMREM environment.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

let glassMaterial: THREE.MeshPhysicalMaterial | null = null;
let amberMaterial: THREE.MeshPhysicalMaterial | null = null;

export function setupChessEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  pmrem.dispose();
  return envMap;
}

export function createGlassWhiteMaterial(): THREE.MeshPhysicalMaterial {
  if (glassMaterial) return glassMaterial;
  glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xccffee,
    transmission: 0.9,
    thickness: 0.8,
    roughness: 0.05,
    ior: 1.5,
    transparent: true,
    emissive: 0x00ffaa,
    emissiveIntensity: 0.2,
    envMapIntensity: 1.2,
  });
  return glassMaterial;
}

export function createAmberOrangeMaterial(): THREE.MeshPhysicalMaterial {
  if (amberMaterial) return amberMaterial;
  amberMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe8821a,
    metalness: 0.1,
    roughness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.0,
  });
  return amberMaterial;
}

export function applyChessPieceMaterials(root: THREE.Object3D, color: 'white' | 'black'): void {
  const mat = color === 'white' ? createGlassWhiteMaterial() : createAmberOrangeMaterial();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = mat;
      mesh.castShadow = true;
    }
  });
}

export function createSelectionGlowMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x22ff88,
    emissive: 0x11cc66,
    emissiveIntensity: 0.85,
    transparent: true,
    opacity: 0.55,
  });
}

export function createMoveHintMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x00ffcc,
    emissive: 0x00aa88,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.7,
  });
}
