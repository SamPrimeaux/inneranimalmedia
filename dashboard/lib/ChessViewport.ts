/**
 * Lightweight Three.js chess viewport for public /games/room_* pages.
 * Shares GLB paths + FEN helpers with Design Studio VoxelEngine chess mode.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { chessBoardGlbPath, chessPieceGlbPath } from './glbAssets';
import { parseFenPlacement, squareToPosition } from './chessSquares';

type PieceRecord = {
  mesh: THREE.Object3D;
  square: string;
  color: 'white' | 'black';
  piece: string;
};

export type ChessViewportOptions = {
  container: HTMLElement;
  onMove?: (from: string, to: string) => void;
  onStatus?: (msg: string) => void;
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
  private boardGroup: THREE.Group | null = null;
  private selectedSquare: string | null = null;
  private myColor: 'white' | 'black' | 'spectator' | null = null;
  private turn: 'white' | 'black' = 'white';
  private animId = 0;
  private onMove?: (from: string, to: string) => void;
  private onStatus?: (msg: string) => void;

  constructor(opts: ChessViewportOptions) {
    this.container = opts.container;
    this.onMove = opts.onMove;
    this.onStatus = opts.onStatus;

    const w = Math.max(320, this.container.clientWidth || 640);
    const h = Math.max(320, this.container.clientHeight || 480);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050508);
    this.scene.fog = new THREE.FogExp2(0x050508, 0.04);

    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
    this.camera.position.set(0, 11, 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 22;

    const hemi = new THREE.HemisphereLight(0xddeeff, 0x111122, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(8, 16, 6);
    sun.castShadow = true;
    this.scene.add(sun);
    const fill = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x0a0a12, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('resize', this.onResize);

    void this.loadBoard();
    this.tick();
  }

  public setPlayerColor(color: 'white' | 'black' | 'spectator' | null) {
    this.myColor = color;
  }

  public setTurn(turn: 'white' | 'black') {
    this.turn = turn;
  }

  public async syncFromFen(fen: string): Promise<void> {
    for (const [id, rec] of this.pieces) {
      this.scene.remove(rec.mesh);
      this.pieces.delete(id);
    }
    const placements = parseFenPlacement(fen);
    for (const p of placements) {
      const pos = squareToPosition(p.square);
      if (!pos) continue;
      const url = chessPieceGlbPath(p.color, p.piece);
      const mesh = await this.loadPieceModel(url);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData = { square: p.square, color: p.color, piece: p.piece };
      this.scene.add(mesh);
      this.pieces.set(p.square, {
        mesh,
        square: p.square,
        color: p.color,
        piece: p.piece,
      });
    }
    this.selectedSquare = null;
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
    rec.mesh.position.set(pos.x, pos.y, pos.z);
    rec.mesh.userData.square = to;
    this.pieces.delete(from);
    this.pieces.set(to, { ...rec, square: to });
    this.selectedSquare = null;
  }

  public destroy(): void {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.controls.dispose();
    this.renderer.dispose();
    this.container.innerHTML = '';
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

  private async loadBoard(): Promise<void> {
    const url = chessBoardGlbPath();
    try {
      const gltf = await this.loader.loadAsync(url);
      const model = gltf.scene.clone();
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const max = Math.max(size.x, size.y, size.z) || 8;
      const scale = 8 / max;
      model.scale.setScalar(scale);
      const centered = new THREE.Box3().setFromObject(model);
      const c = new THREE.Vector3();
      centered.getCenter(c);
      model.position.sub(c);
      model.position.y -= centered.min.y * scale;
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).castShadow = true;
          (o as THREE.Mesh).receiveShadow = true;
        }
      });
      this.boardGroup = model;
      this.scene.add(model);
    } catch (e) {
      console.warn('[ChessViewport] board GLB failed, using voxel fallback', e);
      this.spawnVoxelBoard();
    }
  }

  private spawnVoxelBoard(): void {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.95, 0.15, 0.95);
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        const isWhite = (x + z) % 2 !== 0;
        const mat = new THREE.MeshStandardMaterial({
          color: isWhite ? 0xfaf9f6 : 0x1a1210,
          roughness: 0.4,
          metalness: 0.05,
        });
        const tile = new THREE.Mesh(geo, mat);
        tile.position.set(x - 3.5, 0, z - 3.5);
        tile.receiveShadow = true;
        group.add(tile);
      }
    }
    this.boardGroup = group;
    this.scene.add(group);
  }

  private async loadPieceModel(url: string): Promise<THREE.Group> {
    const cached = this.modelCache.get(url);
    if (cached) return cached.clone();

    const gltf = await this.loader.loadAsync(url);
    const model = gltf.scene.clone();
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const max = Math.max(size.x, size.y, size.z) || 1;
    const scale = 0.85 / max;
    const pivot = new THREE.Group();
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.set(-center.x, -box.min.y, -center.z);
    pivot.add(model);
    pivot.scale.setScalar(scale);
    pivot.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.modelCache.set(url, pivot);
    return pivot.clone();
  }

  private onPointerDown = (ev: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const pieceMeshes: THREE.Object3D[] = [];
    for (const rec of this.pieces.values()) pieceMeshes.push(rec.mesh);
    const hits = this.raycaster.intersectObjects(pieceMeshes, true);
    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && !obj.userData?.square) obj = obj.parent;
      const square = obj?.userData?.square as string | undefined;
      const color = obj?.userData?.color as 'white' | 'black' | undefined;
      if (!square || !color) return;
      if (this.myColor && this.myColor !== 'spectator' && this.myColor !== this.turn) {
        this.onStatus?.('Wait for your turn.');
        return;
      }
      if (this.myColor === 'white' && color !== 'white') return;
      if (this.myColor === 'black' && color !== 'black') return;
      this.selectedSquare = square;
      return;
    }

    if (!this.selectedSquare) return;
    const boardHits = this.raycaster.intersectObject(this.boardGroup!, true);
    if (boardHits.length === 0) return;
    const p = boardHits[0].point;
    const file = Math.round(p.x + 3.5);
    const rank = Math.round(p.z + 4.5);
    const files = 'abcdefgh';
    if (file < 0 || file > 7 || rank < 1 || rank > 8) return;
    const to = `${files[file]}${rank}`;
    const from = this.selectedSquare;
    if (from === to) {
      this.selectedSquare = null;
      return;
    }
    this.onMove?.(from, to);
    this.selectedSquare = null;
  };
}
