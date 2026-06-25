import * as THREE from 'three';

export type ChessCameraPreset = 'player';

export const CHESS_CAMERA_PRESETS: { id: ChessCameraPreset; label: string }[] = [
  { id: 'player', label: 'Player' },
];

const LOOK_AT = new THREE.Vector3(0, 0, 0.5);

const PRESET_DIRS: Record<ChessCameraPreset, THREE.Vector3> = {
  player: new THREE.Vector3(0, 0.82, 0.57).normalize(),
};

export function applyChessCameraPreset(
  camera: THREE.PerspectiveCamera,
  preset: ChessCameraPreset,
  boardSpan = 10.5,
): void {
  camera.fov = 36;
  camera.updateProjectionMatrix();
  const dir = PRESET_DIRS[preset];
  const fovRad = (camera.fov * Math.PI) / 180;
  const dist = (boardSpan / 2) / Math.tan(fovRad / 2) / 0.82;
  camera.position.copy(dir.clone().multiplyScalar(dist));
  camera.lookAt(LOOK_AT);
}
