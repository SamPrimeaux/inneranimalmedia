import * as THREE from 'three';

function woodCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2a1810';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 24; i++) {
    const y = (i / 24) * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, 512, 512 / 24);
  }
  for (let x = 0; x < 512; x += 8) {
    ctx.strokeStyle = `rgba(90,55,30,${0.08 + (x % 16) / 200})`;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 4, 512);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function marbleCanvasTexture(base: string, vein: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12; i++) {
    ctx.strokeStyle = vein;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(Math.random() * 256, 0);
    ctx.bezierCurveTo(
      Math.random() * 256,
      80,
      Math.random() * 256,
      180,
      Math.random() * 256,
      256,
    );
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type ChessRoomEnvironment = {
  root: THREE.Group;
  captureTrayLeft: THREE.Group;
  captureTrayRight: THREE.Group;
};

/** Table, backdrop, and side capture trays (mockup-style). */
export function createChessRoomEnvironment(boardSurfaceY = 0.05): ChessRoomEnvironment {
  const root = new THREE.Group();
  root.name = 'chess_room';

  const woodTex = woodCanvasTexture();
  const tableMat = new THREE.MeshPhysicalMaterial({
    map: woodTex,
    color: 0x8b6914,
    roughness: 0.55,
    metalness: 0.02,
    clearcoat: 0.35,
  });

  const table = new THREE.Mesh(new THREE.BoxGeometry(22, 0.55, 16), tableMat);
  table.position.set(0, boardSurfaceY - 0.42, 0);
  table.receiveShadow = true;
  table.castShadow = true;
  root.add(table);

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(22.4, 0.18, 16.4),
    new THREE.MeshPhysicalMaterial({ color: 0x1a0f08, roughness: 0.7 }),
  );
  apron.position.set(0, boardSurfaceY - 0.72, 0);
  root.add(apron);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = boardSurfaceY - 0.85;
  floor.receiveShadow = true;
  root.add(floor);

  const marbleLight = marbleCanvasTexture('#f3ebe0', 'rgba(120,100,80,0.25)');
  const marbleDark = marbleCanvasTexture('#1a1410', 'rgba(80,60,40,0.35)');

  const makeTray = (x: number) => {
    const tray = new THREE.Group();
    tray.name = x < 0 ? 'capture_tray_left' : 'capture_tray_right';
    const rimMat = new THREE.MeshPhysicalMaterial({
      map: marbleLight,
      color: 0xf5efe6,
      roughness: 0.35,
      metalness: 0.05,
      clearcoat: 0.6,
    });
    const wellMat = new THREE.MeshPhysicalMaterial({
      map: marbleDark,
      color: 0x14100c,
      roughness: 0.45,
      metalness: 0.08,
    });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.22, 9.2), rimMat);
    rim.position.set(x, boardSurfaceY + 0.08, 0);
    rim.castShadow = true;
    rim.receiveShadow = true;
    const well = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 8.6), wellMat);
    well.position.set(x, boardSurfaceY + 0.2, 0);
    well.receiveShadow = true;
    tray.add(rim, well);
    return tray;
  };

  const captureTrayLeft = makeTray(-6.35);
  const captureTrayRight = makeTray(6.35);
  root.add(captureTrayLeft, captureTrayRight);

  return { root, captureTrayLeft, captureTrayRight };
}

/** Position captured mini-piece on marble tray. */
export function captureTraySlot(
  capturedBy: 'white' | 'black',
  index: number,
  boardSurfaceY: number,
): THREE.Vector3 {
  const x = capturedBy === 'white' ? -6.35 : 6.35;
  const col = index % 4;
  const row = Math.floor(index / 4);
  const z = -3.2 + col * 2.15;
  const y = boardSurfaceY + 0.28 + row * 0.42;
  return new THREE.Vector3(x, y, z);
}
