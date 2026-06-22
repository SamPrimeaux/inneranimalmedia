/**
 * Glass (white) and amber (orange) piece materials + square overlay helpers.
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

function overlayCanvas(
  fill: string,
  opts?: { border?: string; borderWidth?: number },
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 128, 128);
  if (opts?.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = opts.borderWidth ?? 6;
    ctx.strokeRect(3, 3, 122, 122);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createSelectionOverlayMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: overlayCanvas('rgba(68, 136, 255, 0.45)', { border: 'rgba(120, 180, 255, 0.9)', borderWidth: 4 }),
    transparent: true,
    depthWrite: false,
  });
}

export function createValidMoveOverlayMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: overlayCanvas('rgba(34, 255, 136, 0.55)'),
    transparent: true,
    depthWrite: false,
  });
}

export function createLastMoveOverlayMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: overlayCanvas('rgba(68, 136, 255, 0.4)'),
    transparent: true,
    depthWrite: false,
  });
}

export function createHoverOverlayMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: overlayCanvas('rgba(255, 255, 255, 0.12)'),
    transparent: true,
    depthWrite: false,
  });
}

/** Flat square highlight plane slightly above the board surface. */
export function createSquareOverlay(
  x: number,
  z: number,
  material: THREE.Material,
  y = 0.112,
): THREE.Mesh {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(x, y, z);
  plane.renderOrder = 2;
  return plane;
}
