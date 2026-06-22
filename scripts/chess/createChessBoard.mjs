#!/usr/bin/env node
/**
 * Procedural chess board (64 squares + walnut frame) → GLB.
 * Uses dashboard's three.js dependency — no Meshy credits.
 *
 * Usage:
 *   node scripts/chess/createChessBoard.mjs [output.glb]
 *   default: ~/Downloads/chess_pieces/chess_board_opt.glb
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import './node-globals.mjs';
import * as THREE from '../../dashboard/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../dashboard/node_modules/three/examples/jsm/exporters/GLTFExporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

/** @returns {THREE.Group} 8×8 board centered at origin, Y-up, squares 1×0.1×1 */
export function createChessBoard() {
  const board = new THREE.Group();

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

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const geo = new THREE.BoxGeometry(1, 0.1, 1);
      const mat = (row + col) % 2 === 0 ? lightMaterial : darkMaterial;
      const square = new THREE.Mesh(geo, mat);
      square.position.set(col - 3.5, 0, row - 3.5);
      square.receiveShadow = true;
      board.add(square);
    }
  }

  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b1f0e,
    roughness: 0.5,
    clearcoat: 0.5,
  });
  const frameGeo = new THREE.BoxGeometry(10, 0.1, 10);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.set(0, -0.05, 0);
  frame.receiveShadow = true;
  board.add(frame);

  return board;
}

/**
 * @param {string} outputPath absolute or relative path for .glb
 */
export async function exportChessBoardGlb(outputPath) {
  const board = createChessBoard();
  const scene = new THREE.Scene();
  scene.add(board);

  const exporter = new GLTFExporter();
  const arrayBuffer = await exporter.parseAsync(scene, { binary: true });

  const out = resolve(outputPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(arrayBuffer));
  return out;
}

async function main() {
  const defaultOut = join(
    process.env.HOME || process.env.USERPROFILE || '.',
    'Downloads/chess_pieces/chess_board_opt.glb',
  );
  const output = process.argv[2] ? resolve(process.argv[2]) : defaultOut;

  process.chdir(REPO_ROOT);
  const written = await exportChessBoardGlb(output);
  const stat = await import('fs').then((fs) => fs.promises.stat(written));
  console.log(`✓ chess board GLB → ${written} (${(stat.size / 1024).toFixed(1)} KB)`);
}

const isMain =
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  main().catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });
}
