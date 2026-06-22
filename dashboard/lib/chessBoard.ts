/**
 * Procedural chess board — runtime Three.js (no board GLB).
 * Shared by ChessViewport and Design Studio VoxelEngine.
 */
import * as THREE from 'three';

export function createChessBoard(): THREE.Group {
  const board = new THREE.Group();
  board.name = 'chess_board';

  const lightMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe8d5b0,
    roughness: 0.4,
    metalness: 0.0,
    clearcoat: 0.3,
  });

  const darkMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x4a2f1a,
    roughness: 0.4,
    metalness: 0.0,
    clearcoat: 0.3,
  });

  const squares: THREE.Mesh[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const geo = new THREE.BoxGeometry(1, 0.1, 1);
      const mat = (row + col) % 2 === 0 ? lightMaterial : darkMaterial;
      const square = new THREE.Mesh(geo, mat);
      square.position.set(col - 3.5, 0, row - 3.5);
      square.receiveShadow = true;
      square.userData = { squareCol: col, squareRow: row, isBoardSquare: true };
      board.add(square);
      squares.push(square);
    }
  }

  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b1f0e,
    roughness: 0.5,
    clearcoat: 0.5,
  });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 10), frameMat);
  frame.position.set(0, -0.05, 0);
  frame.receiveShadow = true;
  board.add(frame);

  addBoardCoordinates(board);
  board.userData.squareMeshes = squares;
  return board;
}

function addBoardCoordinates(board: THREE.Group): void {
  const files = 'abcdefgh';
  for (let col = 0; col < 8; col++) {
    board.add(makeCoordLabel(files[col], col - 3.5, -4.35));
  }
  for (let row = 0; row < 8; row++) {
    board.add(makeCoordLabel(String(row + 1), -4.35, row - 3.5));
  }
}

function makeCoordLabel(text: string, x: number, z: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 36px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, 0.12, z);
  sprite.scale.set(0.45, 0.45, 0.45);
  return sprite;
}

/** Algebraic square from board-local X/Z (centered 8x8). */
export function boardPointToSquare(x: number, z: number): string | null {
  const files = 'abcdefgh';
  const col = Math.round(x + 3.5);
  const row = Math.round(z + 3.5);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return `${files[col]}${row + 1}`;
}
