import * as THREE from 'three';

export type ChessCameraPreset = 'classic' | 'low' | 'top' | 'side' | 'dramatic';

export const CHESS_CAMERA_PRESETS: { id: ChessCameraPreset; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'low', label: 'Low' },
  { id: 'dramatic', label: 'Drama' },
  { id: 'side', label: 'Side' },
  { id: 'top', label: 'Top' },
];

const LOOK_AT = new THREE.Vector3(0, 0.15, 0);

/** Unit direction from origin; distance applied by fitCamera. */
const PRESET_DIRS: Record<ChessCameraPreset, THREE.Vector3> = {
  classic: new THREE.Vector3(0.42, 0.72, 0.92).normalize(),
  low: new THREE.Vector3(0.55, 0.38, 0.95).normalize(),
  dramatic: new THREE.Vector3(0.28, 0.82, 0.88).normalize(),
  side: new THREE.Vector3(0.98, 0.35, 0.12).normalize(),
  top: new THREE.Vector3(0.08, 0.98, 0.12).normalize(),
};

export function applyChessCameraPreset(
  camera: THREE.PerspectiveCamera,
  preset: ChessCameraPreset,
  boardSpan = 10.5,
): void {
  const dir = PRESET_DIRS[preset] ?? PRESET_DIRS.classic;
  const fovRad = (camera.fov * Math.PI) / 180;
  const fill = preset === 'top' ? 0.92 : 0.78;
  const distForHeight = boardSpan / 2 / Math.tan(fovRad / 2) / fill;
  const distForWidth = boardSpan / 2 / (Math.tan(fovRad / 2) * camera.aspect) / fill;
  const dist = Math.max(distForHeight, distForWidth) * (preset === 'dramatic' ? 1.05 : 0.96);
  camera.position.copy(dir.clone().multiplyScalar(dist));
  camera.lookAt(LOOK_AT);
}
