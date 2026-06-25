/**
 * SparkChess-quality viewport for public /games/room_* — locked 3/4 camera, overlay feedback.
 */
import * as THREE from 'three';
import { createChessGltfLoader, ensureMeshoptDecoderReady } from './gltfLoader';
import {
  createChessBoard,
  createChessPickLayer,
  getBoardSurfaceY,
  setBoardSurfaceY,
  squareToBoardXZ,
  boardPointToSquare,
} from './chessBoard';
import { CHESS_BOARD_URL } from './glbAssets';
import {
  applyAuthoredChessPieceMaterials,
  applyChessPieceMaterials,
  createHoverOverlayMaterial,
  createLastMoveOverlayMaterial,
  createSelectionOverlayMaterial,
  createSquareOverlay,
  createValidMoveOverlayMaterial,
  setupChessEnvironment,
} from './chessMaterials';
import { loadChessPieceRegistry, type ChessPieceRegistry } from './chessPieceAssets';
import { legalMoveTargets } from './chessEngine';
import { parseFenPlacement, squareToPosition } from './chessSquares';

const PIECE_TYPES = ['king', 'queen', 'bishop', 'knight', 'rook', 'pawn'] as const;
const PIECE_HEIGHT: Record<string, number> = {
  pawn: 0.55,
  king: 0.8,
  queen: 0.8,
  rook: 0.78,
  bishop: 0.78,
  knight: 0.78,
};

type PieceRecord = {
  mesh: THREE.Group;
  square: string;
  color: 'white' | 'black';
  piece: string;
};

export type ChessViewportOptions = {
  container: HTMLElement;
  onMove?: (from: string, to: string) => void;
  onStatus?: (msg: string) => void;
  onLoading?: (progress: number) => void;
  onReady?: () => void;
  onCapture?: (capturedBy: 'white' | 'black', piece: string, color: 'white' | 'black') => void;
};

export class ChessViewport {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private loader = createChessGltfLoader();
  private modelCache = new Map<string, THREE.Group>();
  private pieceRegistry: ChessPieceRegistry | null = null;
  private pieces = new Map<string, PieceRecord>();
  private boardGroup: THREE.Group;
  private squareMeshes: THREE.Mesh[] = [];
  private overlayGroup = new THREE.Group();
  private captureGroup = new THREE.Group();
  private selectedSquare: string | null = null;
  private hoverSquare: string | null = null;
  private hoverMesh: THREE.Mesh | null = null;
  private lastMoveSquares: string[] = [];
  private myColor: 'white' | 'black' | 'spectator' | null = null;
  private turn: 'white' | 'black' = 'white';
  private fen =
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  private animId = 0;
  private ready = false;
  private onMove?: (from: string, to: string) => void;
  private onStatus?: (msg: string) => void;
  private onCapture?: ChessViewportOptions['onCapture'];
  private whiteCaptureCount = 0;
  private blackCaptureCount = 0;

  private readonly selectMat = createSelectionOverlayMaterial();
  private readonly validMat = createValidMoveOverlayMaterial();
  private readonly lastMat = createLastMoveOverlayMaterial();
  private readonly hoverMat = createHoverOverlayMaterial();

  constructor(opts: ChessViewportOptions) {
    this.container = opts.container;
    this.onMove = opts.onMove;
    this.onStatus = opts.onStatus;
    this.onCapture = opts.onCapture;

    const w = Math.max(320, this.container.clientWidth || 640);
    const h = Math.max(320, this.container.clientHeight || 480);

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 200);
    this.lockCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    setupChessEnvironment(this.renderer, this.scene);

    const ambient = new THREE.AmbientLight(0xffffff, 0.38);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaaccff, 0.3);
    fill.position.set(-6, 5, -5);
    this.scene.add(fill);

    this.boardGroup = new THREE.Group();
    this.boardGroup.name = 'chess_board_root';
    this.scene.add(this.boardGroup);
    this.scene.add(this.overlayGroup);
    this.scene.add(this.captureGroup);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
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

  public setFen(fen: string) {
    this.fen = fen || this.fen;
  }

  public async syncFromFen(fen: string): Promise<void> {
    this.fen = fen || this.fen;
    if (!this.ready) await this.waitReady();
    for (const rec of this.pieces.values()) this.scene.remove(rec.mesh);
    this.pieces.clear();
    this.clearOverlays(true);
    this.whiteCaptureCount = 0;
    this.blackCaptureCount = 0;
    while (this.captureGroup.children.length) this.captureGroup.remove(this.captureGroup.children[0]);

    const placements = parseFenPlacement(fen);
    for (const p of placements) {
      try {
        await this.spawnPiece(p.square, p.color, p.piece);
      } catch (err) {
        console.error(`[ChessViewport] skip piece ${p.color} ${p.piece} @ ${p.square}`, err);
      }
    }
  }

  public movePieceOnBoard(from: string, to: string): void {
    const rec = this.pieces.get(from);
    if (!rec) return;
    const captured = this.pieces.get(to);
    if (captured) {
      this.scene.remove(captured.mesh);
      this.pieces.delete(to);
      const capturedBy = rec.color;
      this.onCapture?.(capturedBy, captured.piece, captured.color);
      void this.addCaptureToRail(capturedBy, captured.piece, captured.color);
    }
    const pos = squareToPosition(to);
    if (!pos) return;
    rec.mesh.position.set(pos.x, pos.y, pos.z);
    rec.mesh.userData.square = to;
    rec.square = to;
    this.pieces.delete(from);
    this.pieces.set(to, rec);
    this.markLastMove(from, to);
    this.clearSelectionOverlays();
  }

  public destroy(): void {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.dispose();
    this.container.innerHTML = '';
  }

  private lockCamera(): void {
    this.camera.position.set(0, 8, 10);
    this.camera.lookAt(0, 0, 0);
  }

  private fitCameraToViewport(): void {
    const w = Math.max(320, this.container.clientWidth || 640);
    const h = Math.max(320, this.container.clientHeight || 480);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lockCamera();
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const boardSpan = 10.5;
    const fill = 0.8;
    const distForHeight = boardSpan / 2 / Math.tan(fovRad / 2) / fill;
    const distForWidth = boardSpan / 2 / (Math.tan(fovRad / 2) * this.camera.aspect) / fill;
    const dist = Math.max(distForHeight, distForWidth) * 0.95;
    const base = new THREE.Vector3(0, 8, 10).normalize();
    this.camera.position.copy(base.multiplyScalar(dist));
    this.camera.lookAt(0, 0, 0);
  }

  private async waitReady(): Promise<void> {
    while (!this.ready) await new Promise((r) => setTimeout(r, 50));
  }

  private async preloadPieces(onLoading?: (p: number) => void, onReady?: () => void): Promise<void> {
    await ensureMeshoptDecoderReady();
    this.pieceRegistry = await loadChessPieceRegistry();

    const pieceUrls = new Set<string>();
    for (const piece of PIECE_TYPES) {
      pieceUrls.add(this.pieceRegistry!.urlFor('white', piece));
      pieceUrls.add(this.pieceRegistry!.urlFor('black', piece));
    }

    const boardUrl = this.pieceRegistry.boardUrl || CHESS_BOARD_URL;
    const jobs: Array<{ kind: 'board' | 'piece'; url: string }> = [
      { kind: 'board', url: boardUrl },
      ...[...pieceUrls].map((url) => ({ kind: 'piece' as const, url })),
    ];

    let loaded = 0;
    const total = jobs.length;

    await Promise.all(
      jobs.map(async (job) => {
        try {
          if (job.kind === 'board') {
            await this.loadBoardModel(job.url);
          } else {
            await this.loadPieceTemplateWithTimeout(job.url, 20000);
          }
        } catch (err) {
          console.error(`[ChessViewport] preload failed ${job.url}`, err);
          if (job.kind === 'board') {
            this.fallbackProceduralBoard();
          }
        } finally {
          loaded += 1;
          onLoading?.(loaded / total);
        }
      }),
    );

    this.ready = true;
    this.fitCameraToViewport();
    onReady?.();
  }

  private fallbackProceduralBoard(): void {
    while (this.boardGroup.children.length) this.boardGroup.remove(this.boardGroup.children[0]);
    const procedural = createChessBoard();
    this.squareMeshes = (procedural.userData.squareMeshes as THREE.Mesh[]) || [];
    this.boardGroup.add(procedural);
  }

  private async loadBoardModel(url: string): Promise<void> {
    const gltf = await this.loader.loadAsync(url);
    const model = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.sub(center);

    const span = Math.max(size.x, size.z, 0.001);
    const scale = 8.4 / span;
    model.scale.setScalar(scale);

    const fitted = new THREE.Box3().setFromObject(model);
    fitted.getCenter(center);
    model.position.sub(center);
    fitted.setFromObject(model);
    setBoardSurfaceY(fitted.max.y + 0.02);

    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.receiveShadow = true;
        mesh.castShadow = true;
      }
    });

    while (this.boardGroup.children.length) this.boardGroup.remove(this.boardGroup.children[0]);
    this.boardGroup.add(model);

    const pick = createChessPickLayer();
    this.squareMeshes = (pick.userData.squareMeshes as THREE.Mesh[]) || [];
    this.scene.add(pick);
  }

  private pieceScaleTarget(piece: string): number {
    return PIECE_HEIGHT[piece] ?? 0.78;
  }

  private loadPieceTemplateWithTimeout(url: string, ms: number): Promise<THREE.Group> {
    return Promise.race([
      this.loadPieceBase(url),
      new Promise<THREE.Group>((_, reject) => {
        setTimeout(() => reject(new Error(`Timed out loading ${url}`)), ms);
      }),
    ]);
  }

  /** URL-keyed normalized GLB (no per-piece scale). */
  private loadPieceBase(url: string): Promise<THREE.Group> {
    const cached = this.modelCache.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          try {
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);
            const pivot = new THREE.Group();
            model.position.set(-center.x, -box.min.y, -center.z);
            pivot.add(model);
            pivot.userData.baseHeight = Math.max(box.getSize(new THREE.Vector3()).y, 0.001);
            this.modelCache.set(url, pivot);
            resolve(pivot);
          } catch (e) {
            reject(e);
          }
        },
        undefined,
        (err) => {
          console.error(`Failed to load chess piece GLB: ${url}`, err);
          reject(err);
        },
      );
    });
  }

  private async loadPieceTemplate(url: string, piece: string): Promise<THREE.Group> {
    const base = await this.loadPieceBase(url);
    const clone = base.clone(true);
    const baseHeight = Number(base.userData.baseHeight) || 1;
    const scale = this.pieceScaleTarget(piece) / baseHeight;
    clone.scale.setScalar(scale);
    return clone;
  }

  private applyPieceMaterials(mesh: THREE.Group, color: 'white' | 'black', piece: string): void {
    const entry = this.pieceRegistry?.pieces[piece];
    if (this.pieceRegistry?.preserveMaterials && entry && !entry.shared_mesh) {
      mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
      return;
    }
    if (this.pieceRegistry?.preserveMaterials) {
      applyAuthoredChessPieceMaterials(mesh, color);
      return;
    }
    applyChessPieceMaterials(mesh, color);
  }

  private fadePieceMaterials(mesh: THREE.Group, opacity: number): void {
    mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const src = Array.isArray(m.material) ? m.material : [m.material];
      const cloned = src.map((mat) => {
        const next = mat.clone();
        if ('transparent' in next) {
          (next as THREE.MeshStandardMaterial).transparent = true;
          (next as THREE.MeshStandardMaterial).opacity = opacity;
        }
        return next;
      });
      m.material = cloned.length === 1 ? cloned[0] : cloned;
    });
  }

  private async spawnPiece(square: string, color: 'white' | 'black', piece: string): Promise<void> {
    if (!this.pieceRegistry) this.pieceRegistry = await loadChessPieceRegistry();
    const url = this.pieceRegistry.urlFor(color, piece);
    const template = await this.loadPieceTemplate(url, piece);
    const mesh = template.clone(true);
    this.applyPieceMaterials(mesh, color, piece);
    const pos = squareToPosition(square);
    if (!pos) return;
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData = { square, color, piece };
    this.scene.add(mesh);
    this.pieces.set(square, { mesh, square, color, piece });
  }

  private async addCaptureToRail(
    capturedBy: 'white' | 'black',
    piece: string,
    color: 'white' | 'black',
  ): Promise<void> {
    if (!this.pieceRegistry) this.pieceRegistry = await loadChessPieceRegistry();
    const url = this.pieceRegistry.urlFor(color, piece);
    const template = await this.loadPieceTemplate(url, piece);
    const mesh = template.clone(true);
    this.applyPieceMaterials(mesh, color, piece);
    this.fadePieceMaterials(mesh, 0.6);
    mesh.scale.multiplyScalar(0.25);

    const count = capturedBy === 'white' ? this.whiteCaptureCount++ : this.blackCaptureCount++;
    const x = capturedBy === 'white' ? -5.8 : 5.8;
    const z = -3 + (count % 6) * 0.55;
    const y = getBoardSurfaceY() + Math.floor(count / 6) * 0.2;
    mesh.position.set(x, y, z);
    this.captureGroup.add(mesh);
  }

  private tick = () => {
    this.animId = requestAnimationFrame(this.tick);
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = () => {
    const w = Math.max(320, this.container.clientWidth || 640);
    const h = Math.max(320, this.container.clientHeight || 480);
    this.renderer.setSize(w, h);
    this.fitCameraToViewport();
  };

  private clearOverlays(clearLast = false): void {
    this.selectedSquare = null;
    while (this.overlayGroup.children.length) this.overlayGroup.remove(this.overlayGroup.children[0]);
    this.hoverMesh = null;
    this.hoverSquare = null;
    if (clearLast) this.lastMoveSquares = [];
  }

  private clearSelectionOverlays(): void {
    this.selectedSquare = null;
    const keep = this.overlayGroup.children.filter((c) => {
      const tag = c.userData?.overlayType as string | undefined;
      return tag === 'last' || tag === 'hover';
    });
    while (this.overlayGroup.children.length) this.overlayGroup.remove(this.overlayGroup.children[0]);
    for (const c of keep) this.overlayGroup.add(c);
  }

  private addOverlay(square: string, type: 'select' | 'valid' | 'last' | 'hover'): void {
    const xz = squareToBoardXZ(square);
    if (!xz) return;
    let mat = this.validMat;
    if (type === 'select') mat = this.selectMat;
    if (type === 'last') mat = this.lastMat;
    if (type === 'hover') mat = this.hoverMat;
    const mesh = createSquareOverlay(xz.x, xz.z, mat);
    mesh.userData.overlayType = type;
    mesh.userData.square = square;
    this.overlayGroup.add(mesh);
  }

  private markLastMove(from: string, to: string): void {
    this.lastMoveSquares = [from, to];
    const withoutLast = this.overlayGroup.children.filter(
      (c) => c.userData?.overlayType !== 'last',
    );
    while (this.overlayGroup.children.length) this.overlayGroup.remove(this.overlayGroup.children[0]);
    for (const c of withoutLast) this.overlayGroup.add(c);
    this.addOverlay(from, 'last');
    this.addOverlay(to, 'last');
  }

  private showSelection(square: string): void {
    this.clearSelectionOverlays();
    this.selectedSquare = square;
    this.addOverlay(square, 'select');
    for (const sq of legalMoveTargets(this.fen, square)) {
      this.addOverlay(sq, 'valid');
    }
  }

  private setHoverSquare(square: string | null): void {
    if (this.hoverSquare === square) return;
    const filtered = this.overlayGroup.children.filter(
      (c) => c.userData?.overlayType !== 'hover',
    );
    while (this.overlayGroup.children.length) this.overlayGroup.remove(this.overlayGroup.children[0]);
    for (const c of filtered) this.overlayGroup.add(c);
    this.hoverSquare = square;
    if (square && square !== this.selectedSquare) this.addOverlay(square, 'hover');
  }

  private pickSquareFromRay(): string | null {
    const boardHits = this.raycaster.intersectObjects(this.squareMeshes, false);
    if (boardHits.length === 0) return null;
    const p = boardHits[0].point;
    return boardPointToSquare(p.x, p.z);
  }

  private onPointerMove = (ev: PointerEvent): void => {
    if (!this.ready) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.setHoverSquare(this.pickSquareFromRay());
  };

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

      if (this.selectedSquare && square !== this.selectedSquare) {
        const targets = legalMoveTargets(this.fen, this.selectedSquare);
        if (targets.includes(square)) {
          this.onMove?.(this.selectedSquare, square);
          this.clearSelectionOverlays();
          return;
        }
      }

      if (this.myColor && this.myColor !== 'spectator' && this.myColor !== this.turn) {
        this.onStatus?.("Opponent's turn");
        return;
      }
      if (this.myColor === 'white' && color !== 'white') return;
      if (this.myColor === 'black' && color !== 'black') return;
      if (this.selectedSquare === square) {
        this.clearSelectionOverlays();
        return;
      }
      this.showSelection(square);
      return;
    }

    if (!this.selectedSquare) return;
    const to = this.pickSquareFromRay();
    if (!to) return;
    const from = this.selectedSquare;
    if (from === to) {
      this.clearSelectionOverlays();
      return;
    }
    this.onMove?.(from, to);
    this.clearSelectionOverlays();
  };
}
