/**
 * VoxelEngine.ts
 *
 * Three.js powered 3D engine for the Agent Sam Studio tab.
 * Handles scene management, entity spawning, GLB loading,
 * CAD tools, basic physics simulation, and Blender export.
 *
 * Public API surface matches exactly what App.tsx calls.
 */

import * as THREE from 'three';
import { GLTFLoader }       from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls }    from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  AppState, CADPlane, CADTool, GameEntity, ProjectType, SceneConfig,
} from '../types';

// ─── Internal types ───────────────────────────────────────────────────────────

interface PhysicsBody {
  mesh:        THREE.Object3D;
  velocity:    THREE.Vector3;
  mass:        number;
  restitution: number;
  isStatic:    boolean;
}

interface SceneEntity {
  id:      string;
  object:  THREE.Object3D;
  physics: PhysicsBody | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GRAVITY        = -9.81;
const GROUND_Y       = 0;
const PHYSICS_STEP   = 1 / 60;
const MAX_DELTA      = 0.1;
const GRID_SIZE      = 20;
const GRID_DIVISIONS = 20;

// ─── Engine ───────────────────────────────────────────────────────────────────

export class VoxelEngine {
  // Three.js core
  private scene:    THREE.Scene;
  private camera:   THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private transformControls: TransformControls | null = null;

  // Lighting
  private ambientLight:     THREE.AmbientLight;
  private directionalLight: THREE.DirectionalLight;
  private hemisphereLight:  THREE.HemisphereLight;

  // Helpers
  private gridHelper:        THREE.GridHelper;
  private physicsDebugGroup: THREE.Group;

  // Entity registry
  private entities: Map<string, SceneEntity> = new Map();
  private physics:  PhysicsBody[]            = [];

  // CAD state
  private cadPlane:   CADPlane  = CADPlane.XZ;
  private cadTool:    CADTool   = CADTool.NONE;
  private extrusion:  number    = 1;
  private projectType: ProjectType = ProjectType.SANDBOX;

  // Preview ghosts for CAD placement
  private ghostMesh: THREE.Mesh | null = null;
  private raycaster: THREE.Raycaster   = new THREE.Raycaster();
  private pointer:   THREE.Vector2     = new THREE.Vector2();
  private cadPlaneHelper: THREE.Mesh | null = null;

  // Animation
  private animFrameId: number | null = null;
  private clock:       THREE.Clock   = new THREE.Clock();
  private lastPhysicsTime = 0;

  // Loaders
  private gltfLoader: GLTFLoader = new GLTFLoader();

  // Callbacks
  private onStateChange:    (state: AppState) => void;
  private onVoxelCount:     (count: number) => void;
  private onEntityCreated?: (entity: GameEntity) => void;

  // Scene config cache
  private showPhysicsDebug = false;

  // ── Constructor ─────────────────────────────────────────────────────────────

  constructor(
    container: HTMLElement,
    onStateChange: (state: AppState) => void,
    onVoxelCount:  (count: number) => void,
  ) {
    this.onStateChange = onStateChange;
    this.onVoxelCount  = onVoxelCount;

    // ── Scene ──────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1a);
    this.scene.fog = new THREE.FogExp2(0x0a0f1a, 0.02);

    // ── Camera ─────────────────────────────────────────────────────────────
    const w = container.clientWidth  || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    this.camera.position.set(8, 8, 12);
    this.camera.lookAt(0, 0, 0);

    // ── Renderer ───────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias:  true,
      alpha:      false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // ── Lighting ───────────────────────────────────────────────────────────
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(this.ambientLight);

    this.hemisphereLight = new THREE.HemisphereLight(0x8ab4f8, 0x2dd4bf, 0.4);
    this.scene.add(this.hemisphereLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    this.directionalLight.position.set(10, 20, 10);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.camera.near = 0.1;
    this.directionalLight.shadow.camera.far  = 100;
    this.directionalLight.shadow.camera.left   = -20;
    this.directionalLight.shadow.camera.right  =  20;
    this.directionalLight.shadow.camera.top    =  20;
    this.directionalLight.shadow.camera.bottom = -20;
    this.directionalLight.shadow.bias = -0.001;
    this.scene.add(this.directionalLight);

    // ── Ground ─────────────────────────────────────────────────────────────
    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * 2, GRID_SIZE * 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color:     0x0a2d38,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = '__ground__';
    this.scene.add(ground);

    // ── Grid ───────────────────────────────────────────────────────────────
    this.gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x2dd4bf, 0x0a3d4a);
    this.gridHelper.position.y = 0.001;
    (this.gridHelper.material as THREE.Material).opacity    = 0.4;
    (this.gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(this.gridHelper);

    // ── Physics debug group ────────────────────────────────────────────────
    this.physicsDebugGroup = new THREE.Group();
    this.physicsDebugGroup.visible = false;
    this.scene.add(this.physicsDebugGroup);

    // ── Controls ───────────────────────────────────────────────────────────
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping    = true;
    this.controls.dampingFactor    = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance      = 2;
    this.controls.maxDistance      = 100;
    this.controls.maxPolarAngle    = Math.PI / 2 - 0.01;
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    // ── CAD plane helper ───────────────────────────────────────────────────
    this.buildCadPlaneHelper();

    // ── Event listeners ────────────────────────────────────────────────────
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);

    // ── Start loop ─────────────────────────────────────────────────────────
    this.clock.start();
    this.animate();

    this.onStateChange(AppState.EDITING);
    this.onVoxelCount(0);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setOnEntityCreated(cb: (entity: GameEntity) => void): void {
    this.onEntityCreated = cb;
  }

  updateLighting(cfg: SceneConfig): void {
    this.ambientLight.intensity = cfg.ambientIntensity;

    const color = new THREE.Color(cfg.sunColor);
    this.directionalLight.color.set(color);
    this.hemisphereLight.color.set(color);

    this.directionalLight.castShadow  = cfg.castShadows;
    this.renderer.shadowMap.enabled   = cfg.castShadows;

    this.showPhysicsDebug = cfg.showPhysicsDebug;
    this.physicsDebugGroup.visible = cfg.showPhysicsDebug;
  }

  setCADPlane(plane: CADPlane): void {
    this.cadPlane = plane;
    this.buildCadPlaneHelper();
  }

  setCADTool(tool: CADTool): void {
    this.cadTool = tool;
    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    this.controls.enabled = tool === CADTool.NONE || tool === CADTool.SELECT;
    if (tool !== CADTool.NONE) this.buildGhostMesh(tool);
  }

  setExtrusion(val: number): void {
    this.extrusion = Math.max(0.1, val);
    if (this.ghostMesh) this.buildGhostMesh(this.cadTool);
  }

  setProjectType(type: ProjectType): void {
    this.projectType = type;
    // Adjust camera and grid for chess board
    if (type === ProjectType.CHESS) {
      this.camera.position.set(0, 14, 14);
      this.camera.lookAt(0, 0, 0);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      this.gridHelper.visible = false;
      this.buildChessBoard();
    } else {
      this.gridHelper.visible = true;
    }
  }

  spawnEntity(entity: GameEntity): void {
    if (entity.modelUrl) {
      this.loadGlbEntity(entity);
    } else if (entity.voxels && entity.voxels.length > 0) {
      this.spawnVoxelEntity(entity);
    } else {
      this.spawnPrimitiveEntity(entity);
    }
  }

  removeEntity(id: string): void {
    const entry = this.entities.get(id);
    if (!entry) return;
    this.scene.remove(entry.object);
    if (entry.physics) {
      const idx = this.physics.indexOf(entry.physics);
      if (idx !== -1) this.physics.splice(idx, 1);
    }
    this.entities.delete(id);
    this.onVoxelCount(this.entities.size);
  }

  clearWorld(): void {
    this.entities.forEach(e => this.scene.remove(e.object));
    this.entities.clear();
    this.physics = [];
    this.physicsDebugGroup.clear();
    this.onVoxelCount(0);
  }

  handleResize(): void {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  exportForBlender(): void {
    const data: Record<string, unknown>[] = [];
    this.entities.forEach((entry, id) => {
      const obj = entry.object;
      data.push({
        id,
        name:     obj.name,
        position: obj.position.toArray(),
        rotation: obj.rotation.toArray(),
        scale:    obj.scale.toArray(),
        type:     obj.userData['entityType'] || 'mesh',
      });
    });
    const blob = new Blob([JSON.stringify({ entities: data }, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'agent-sam-scene.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  cleanup(): void {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.controls.dispose();
    this.transformControls?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.entities.clear();
    this.physics = [];
  }

  // ── Animation loop ──────────────────────────────────────────────────────────

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), MAX_DELTA);
    this.controls.update();
    this.stepPhysics(delta);
    this.renderer.render(this.scene, this.camera);
  };

  // ── Physics ─────────────────────────────────────────────────────────────────

  private stepPhysics(delta: number): void {
    if (this.physics.length === 0) return;
    const steps = Math.ceil(delta / PHYSICS_STEP);
    const dt    = delta / steps;

    for (let s = 0; s < steps; s++) {
      for (const body of this.physics) {
        if (body.isStatic) continue;

        // Gravity
        body.velocity.y += GRAVITY * dt;

        // Integrate position
        body.mesh.position.x += body.velocity.x * dt;
        body.mesh.position.y += body.velocity.y * dt;
        body.mesh.position.z += body.velocity.z * dt;

        // Ground collision
        if (body.mesh.position.y <= GROUND_Y) {
          body.mesh.position.y = GROUND_Y;
          body.velocity.y = -body.velocity.y * body.restitution;
          body.velocity.x *= 0.85;
          body.velocity.z *= 0.85;
          if (Math.abs(body.velocity.y) < 0.05) body.velocity.y = 0;
        }

        // Damping
        body.velocity.multiplyScalar(0.995);
      }
    }
  }

  // ── Entity spawn helpers ────────────────────────────────────────────────────

  private spawnPrimitiveEntity(entity: GameEntity): void {
    let geo: THREE.BufferGeometry;
    switch (entity.type) {
      case 'sphere':   geo = new THREE.SphereGeometry(0.5, 16, 12); break;
      case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16); break;
      case 'plane':    geo = new THREE.PlaneGeometry(1, 1); break;
      default:         geo = new THREE.BoxGeometry(1, 1, 1);
    }

    const mat  = new THREE.MeshStandardMaterial({
      color:     0x2dd4bf,
      roughness: 0.4,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.name          = entity.name || entity.id;
    mesh.userData['entityType'] = entity.type;

    const scale = entity.scale ?? 1;
    mesh.scale.setScalar(scale);
    mesh.position.set(entity.position.x, entity.position.y, entity.position.z);

    this.scene.add(mesh);

    const physics = entity.behavior ? this.createPhysicsBody(mesh, entity) : null;
    this.entities.set(entity.id, { id: entity.id, object: mesh, physics });
    this.onVoxelCount(this.entities.size);
  }

  private spawnVoxelEntity(entity: GameEntity): void {
    const group = new THREE.Group();
    group.name  = entity.name || entity.id;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (const voxel of entity.voxels ?? []) {
      const mat  = new THREE.MeshStandardMaterial({ color: voxel.color, roughness: 0.5, metalness: 0.2 });
      const mesh = new THREE.Mesh(geo, mat);
      const s    = voxel.size ?? 1;
      mesh.scale.setScalar(s);
      mesh.position.set(voxel.position.x, voxel.position.y, voxel.position.z);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    const scale = entity.scale ?? 1;
    group.scale.setScalar(scale);
    group.position.set(entity.position.x, entity.position.y, entity.position.z);
    this.scene.add(group);

    const physics = entity.behavior ? this.createPhysicsBody(group, entity) : null;
    this.entities.set(entity.id, { id: entity.id, object: group, physics });
    this.onVoxelCount(this.entities.size);
  }

  private loadGlbEntity(entity: GameEntity): void {
    this.onStateChange(AppState.GENERATING);
    this.gltfLoader.load(
      entity.modelUrl!,
      (gltf) => {
        const model = gltf.scene;
        model.name  = entity.name || entity.id;
        model.userData['entityType'] = 'glb';

        const scale = entity.scale ?? 1;
        model.scale.setScalar(scale);
        model.position.set(entity.position.x, entity.position.y, entity.position.z);

        model.traverse(child => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow    = true;
            child.receiveShadow = true;
          }
        });

        // Auto-center and normalize
        const box    = new THREE.Box3().setFromObject(model);
        const size   = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          const normalizeScale = (4 / maxDim) * scale;
          model.scale.setScalar(normalizeScale);
        }
        model.position.y = entity.position.y - (box.min.y * model.scale.y);

        this.scene.add(model);
        const physics = entity.behavior ? this.createPhysicsBody(model, entity) : null;
        this.entities.set(entity.id, { id: entity.id, object: model, physics });
        this.onVoxelCount(this.entities.size);
        this.onStateChange(AppState.EDITING);

        if (this.onEntityCreated) this.onEntityCreated(entity);
      },
      undefined,
      (err) => {
        console.error('[VoxelEngine] GLB load failed:', err);
        this.onStateChange(AppState.EDITING);
        // Fallback to a box so the entity still appears
        this.spawnPrimitiveEntity({ ...entity, modelUrl: undefined });
      },
    );
  }

  private createPhysicsBody(mesh: THREE.Object3D, entity: GameEntity): PhysicsBody {
    const body: PhysicsBody = {
      mesh,
      velocity:    new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2,
        (Math.random() - 0.5) * 2,
      ),
      mass:        entity.behavior?.mass        ?? 1,
      restitution: entity.behavior?.restitution ?? 0.3,
      isStatic:    entity.behavior?.type === 'static',
    };
    this.physics.push(body);
    return body;
  }

  // ── CAD tools ───────────────────────────────────────────────────────────────

  private buildCadPlaneHelper(): void {
    if (this.cadPlaneHelper) {
      this.scene.remove(this.cadPlaneHelper);
      this.cadPlaneHelper = null;
    }
    const geo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      color:       0x2dd4bf,
      opacity:     0.04,
      transparent: true,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    this.cadPlaneHelper = new THREE.Mesh(geo, mat);
    if (this.cadPlane === CADPlane.XZ) {
      this.cadPlaneHelper.rotation.x = -Math.PI / 2;
    } else if (this.cadPlane === CADPlane.YZ) {
      this.cadPlaneHelper.rotation.y = Math.PI / 2;
    }
    this.scene.add(this.cadPlaneHelper);
  }

  private buildGhostMesh(tool: CADTool): void {
    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    if (tool === CADTool.NONE || tool === CADTool.SELECT || tool === CADTool.MEASURE) return;

    let geo: THREE.BufferGeometry;
    switch (tool) {
      case CADTool.SPHERE:   geo = new THREE.SphereGeometry(0.5, 16, 12); break;
      case CADTool.CYLINDER: geo = new THREE.CylinderGeometry(0.5, 0.5, this.extrusion, 16); break;
      case CADTool.PLANE:    geo = new THREE.PlaneGeometry(1, 1); break;
      case CADTool.EXTRUDE:  geo = new THREE.BoxGeometry(1, this.extrusion, 1); break;
      default:               geo = new THREE.BoxGeometry(1, 1, 1);
    }

    const mat = new THREE.MeshStandardMaterial({
      color:       0x2dd4bf,
      opacity:     0.4,
      transparent: true,
      wireframe:   false,
    });
    this.ghostMesh = new THREE.Mesh(geo, mat);
    this.ghostMesh.name = '__ghost__';
    this.scene.add(this.ghostMesh);
  }

  private getPlacementPoint(event: PointerEvent): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Intersect with CAD plane
    const planeNormal = this.cadPlane === CADPlane.XZ
      ? new THREE.Vector3(0, 1, 0)
      : this.cadPlane === CADPlane.XY
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(1, 0, 0);

    const plane = new THREE.Plane(planeNormal, 0);
    const point = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, point);
    return point;
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.ghostMesh || this.cadTool === CADTool.NONE) return;
    const point = this.getPlacementPoint(event);
    if (!point) return;
    // Snap to grid
    point.x = Math.round(point.x);
    point.z = Math.round(point.z);
    point.y = Math.max(0.5, point.y);
    this.ghostMesh.position.copy(point);
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (this.cadTool === CADTool.NONE || this.cadTool === CADTool.SELECT) return;
    const point = this.getPlacementPoint(event);
    if (!point) return;

    point.x = Math.round(point.x);
    point.z = Math.round(point.z);
    point.y = Math.max(0.5, point.y);

    const id     = `cad_${Date.now()}`;
    const entity: GameEntity = {
      id,
      name:     `${this.cadTool}_${id}`,
      type:     this.cadTool,
      position: { x: point.x, y: point.y, z: point.z },
      scale:    1,
      behavior: { type: 'static' },
    };

    this.spawnPrimitiveEntity(entity);
    if (this.onEntityCreated) this.onEntityCreated(entity);
  };

  // ── Chess board ─────────────────────────────────────────────────────────────

  private buildChessBoard(): void {
    const tileSize = 1;
    const tiles    = 8;
    const offset   = (tiles / 2) - 0.5;

    for (let row = 0; row < tiles; row++) {
      for (let col = 0; col < tiles; col++) {
        const isLight = (row + col) % 2 === 0;
        const geo = new THREE.BoxGeometry(tileSize, 0.1, tileSize);
        const mat = new THREE.MeshStandardMaterial({
          color:     isLight ? 0xe8d5b0 : 0x4a2c0a,
          roughness: 0.6,
          metalness: 0.1,
        });
        const tile = new THREE.Mesh(geo, mat);
        tile.position.set(col - offset, 0, row - offset);
        tile.receiveShadow = true;
        tile.name = `tile_${row}_${col}`;
        this.scene.add(tile);
      }
    }

    // Board border
    const borderGeo = new THREE.BoxGeometry(tiles + 0.4, 0.15, tiles + 0.4);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x2a1a06, roughness: 0.7 });
    const border    = new THREE.Mesh(borderGeo, borderMat);
    border.position.y = -0.05;
    border.receiveShadow = true;
    this.scene.add(border);
  }
}
