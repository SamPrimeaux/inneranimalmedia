import * as THREE from 'three';

export type ChessRoomEnvironment = {
  root: THREE.Group;
  captureTrayLeft: THREE.Group;
  captureTrayRight: THREE.Group;
};

/** Minimal backdrop — baroque board GLB is the table; no procedural slabs. */
export function createChessRoomEnvironment(boardSurfaceY = 0.05): ChessRoomEnvironment {
  const root = new THREE.Group();
  root.name = 'chess_room';

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 48),
    new THREE.ShadowMaterial({
      opacity: 0.38,
      transparent: true,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = boardSurfaceY - 1.2;
  floor.receiveShadow = true;
  root.add(floor);

  const captureTrayLeft = new THREE.Group();
  captureTrayLeft.name = 'capture_tray_left';
  const captureTrayRight = new THREE.Group();
  captureTrayRight.name = 'capture_tray_right';
  root.add(captureTrayLeft, captureTrayRight);

  return { root, captureTrayLeft, captureTrayRight };
}

/** Position captured mini-piece beside the baroque board frame. */
export function captureTraySlot(
  capturedBy: 'white' | 'black',
  index: number,
  boardSurfaceY: number,
): THREE.Vector3 {
  const x = capturedBy === 'white' ? -5.4 : 5.4;
  const col = index % 4;
  const row = Math.floor(index / 4);
  const z = -2.6 + col * 1.75;
  const y = boardSurfaceY + 0.18 + row * 0.34;
  return new THREE.Vector3(x, y, z);
}
