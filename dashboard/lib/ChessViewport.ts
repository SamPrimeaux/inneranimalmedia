/**
 * Premium Three.js chess viewport for public /games/room_* pages.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { boardPointToSquare, createChessBoard } from './chessBoard';
import {
  applyChessPieceMaterials,
  createMoveHintMaterial,
  createSelectionGlowMaterial,
  setupChessEnvironment,
} from './chessMaterials';
import { chessOptimizedPieceUrl } from './glbAssets';
import { parseFenPlacement, squareToPosition } from './chessSquares';

const PIECE_TYPES = ['king', 'queen', 'bishop', 'knight', 'rook', 'pawn'] as const;
const PIECE_Y = 0.1;

type PieceRecord = {
  mesh: THREE.Group;
  square: string;
  color: 'white' | 'black';
  piece: string;
  baseY: number;
};

export type ChessViewportOptions = {
  container: HTMLElement;
  onMove?: (from: string, to: string) => void;
  onStatus?: (msg: string) => void;
  onLoading?: (progress: number) => void;
  onReady?: () => void;
};

export class ChessViewport {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private loader = new GLTFLoader();
  private modelCache = new Map<string, THREE.Group>();
  private pieces = new Map<string, PieceRecord>();
  private boardGroup: THREE.Group;
  private squareMeshes: THREE.Mesh[] = [];
  private selectedSquare: string | null = null;
  private selectionGlow: THREE.Mesh | null = null;
  private moveHints: THREE.Group = new THREE.Group();
  private myColor: 'white' | 'black' | 'spectator' | null = null;
  private turn: 'white' | 'black' = 'white';
  private animId = 0;
  private onMove?: (from: string, to: string) => void;
  private onStatus?: (msg: string) => void;
  private ready = false;

  constructor(opts: ChessViewportOptions) {
    this.container = opts.container;
    this.onMove = opts.onMove;
    this.onStatus = opts.onStatus;

    const w = Math.max(320, this.container.clientWidth || 640);
    const h = Math.max(320, this.container.clientHeight || 480);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121218);

    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
    this.camera.position.set(0, 10, 9);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    setupChessEnvironment(this.renderer, this.scene);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(15);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(75);
    this.controls.minDistance = 7;
    this.controls.maxDistance = 20;

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaaccff, 0.35);
    fill.position.set(-8, 6, -4);
    this.scene.add(fill);

    this.boardGroup = createChessBoard();
    this.squareMeshes = (this.boardGroup.userData.squareMeshes as THREE.Mesh[]) || [];
    this.boardGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = true;
    });
    this.scene.add(this.boardGroup);
    this.scene.add(this.moveHints);

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('resize', this.onResize);

    void this.preloadPieces(opts.onLoading, opts.onReady);
    this.tick();
  }

  public setPlayerColor(color: 'white' | 'black' | 'spectator' | null) {
    this.myColor = color;
  }

  public setTurn(turn: 'white' | 'black') {
    this.turn = turn;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public async syncFromFen(fen: string): Promise<void> {
    if (!this.ready) await this.waitReady();
    for (const rec of this.pieces.values()) {
      this.scene.remove(rec.mesh);
    }
    this.pieces.clear();
    this.clearSelection();

    const placements = parseFenPlacement(fen);
    for (const p of placements) {
      await this.spawnPiece(p.square, p.color, p.piece);
    }
  }

  public movePieceOnBoard(from: string, to: string): void {
    const rec = this.pieces.get(from);
    if (!rec) return;
    const captured = this.pieces.get(to);
    if (captured) {
      this.scene.remove(captured.mesh);
      this.pieces.delete(to);
    }
    const pos = squareToPosition(to);
    if (!pos) return;
    rec.mesh.position.set(pos.x, PIECE_Y, pos.z);
    rec.mesh.scale.setScalar(1);
    rec.mesh.userData.square = to;
    rec.square = to;
    this.pieces.delete(from);
    this.pieces.set(to, rec);
    this.clearSelection();
  }

  public destroy(): void {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.controls.dispose();
    this.renderer.dispose();
    this.container.innerHTML = '';
  }

  private async waitReady(): Promise<void> {
    while (!this.ready) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async preloadPieces(
    onLoading?: (p: number) => void,
    onReady?: () => void,
  ): Promise<void> {
    const urls = PIECE_TYPES.map((p) => chessOptimizedPieceUrl(p));
    let loaded = 0;
    await Promise.all(
      urls.map(async (url) => {
        await this.loadPieceTemplate(url);
        loaded += 1;
        onLoading?.(loaded / urls.length);
      }),
    );
    this.ready = true;
    onReady?.();
  }

  private async loadPieceTemplate(url: string): Promise<THREE.Group> {
    const cached = this.modelCache.get(url);
    if (cached) return cached;

    const gltf = await this.loader.loadAsync(url);
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const max = Math.max(size.x, size.y, size.z) || 1;
    const scale = 0.82 / max;
    const pivot = new THREE.Group();
    model.position.set(-center.x, -box.min.y, -center.z);
    pivot.add(model);
    pivot.scale.setScalar(scale);
    this.modelCache.set(url, pivot);
    return pivot;
  }

  private async spawnPiece(
    square: string,
    color: 'white' | 'black',
    piece: string,
  ): Promise<void> {
    const url = chessOptimizedPieceUrl(piece);
    const template = await this.loadPieceTemplate(url);
    const mesh = template.clone(true);
    applyChessPieceMaterials(mesh, color);
    const pos = squareToPosition(square);
    if (!pos) return;
    mesh.position.set(pos.x, PIECE_Y, pos.z);
    mesh.userData = { square, color, piece };
    this.scene.add(mesh);
    this.pieces.set(square, { mesh, square, color, piece, baseY: PIECE_Y });
  }

  private tick = () => {
    this.animId = requestAnimationFrame(this.tick);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = () => {
    const w = Math.max(320, this.container.clientWidth || 640);
    const h = Math.max(320, this.container.clientHeight || 480);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private clearSelection(): void {
    this.selectedSquare = null;
    if (this.selectionGlow) {
      this.scene.remove(this.selectionGlow);
      this.selectionGlow = null;
    }
    for (const rec of this.pieces.values()) {
      rec.mesh.position.y = rec.baseY;
      rec.mesh.scale.setScalar(1);
    }
    while (this.moveHints.children.length) {
      this.moveHints.remove(this.moveHints.children[0]);
    }
  }

  private showSelection(square: string): void {
    this.clearSelection();
    this.selectedSquare = square;
    const rec = this.pieces.get(square);
    if (!rec) return;

    rec.mesh.position.y = rec.baseY + 0.15;
    rec.mesh.scale.setScalar(1.05);

    const pos = squareToPosition(square);
    if (pos) {
      const glowGeo = new THREE.BoxGeometry(0.92, 0.02, 0.92);
      this.selectionGlow = new THREE.Mesh(glowGeo, createSelectionGlowMaterial());
      this.selectionGlow.position.set(pos.x, 0.07, pos.z);
      this.scene.add(this.selectionGlow);
    }

    const hintMat = createMoveHintMaterial();
    for (let col = 0; col < 8; col++) {
      for (let row = 0; row < 8; row++) {
        const files = 'abcdefgh';
        const sq = `${files[col]}${row + 1}`;
        if (sq === square || this.pieces.has(sq)) continue;
        const p = squareToPosition(sq);
        if (!p) continue;
        const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), hintMat);
        dot.position.set(p.x, 0.08, p.z);
        this.moveHints.add(dot);
      }
    }
  }

  private onPointerDown = (ev: PointerEvent): void => {
    if (!this.ready) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const pieceMeshes: THREE.Object3D[] = [];
    for (const rec of this.pieces.values()) pieceMeshes.push(rec.mesh);
    const pieceHits = this.raycaster.intersectObjects(pieceMeshes, true);
    if (pieceHits.length > 0) {
      let obj: THREE.Object3D | null = pieceHits[0].object;
      while (obj && !obj.userData?.square) obj = obj.parent;
      const square = obj?.userData?.square as string | undefined;
      const color = obj?.userData?.color as 'white' | 'black' | undefined;
      if (!square || !color) return;
      if (this.myColor && this.myColor !== 'spectator' && this.myColor !== this.turn) {
        this.onStatus?.("Opponent's turn");
        return;
      }
      if (this.myColor === 'white' && color !== 'white') return;
      if (this.myColor === 'black' && color !== 'black') return;
      if (this.selectedSquare === square) {
        this.clearSelection();
        return;
      }
      this.showSelection(square);
      return;
    }

    if (!this.selectedSquare) return;
    const boardHits = this.raycaster.intersectObjects(this.squareMeshes, false);
    if (boardHits.length === 0) return;
    const p = boardHits[0].point;
    const to = boardPointToSquare(p.x, p.z);
    if (!to) return;
    const from = this.selectedSquare;
    if (from === to) {
      this.clearSelection();
      return;
    }
    this.onMove?.(from, to);
    this.clearSelection();
  };
}
