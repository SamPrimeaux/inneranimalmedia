
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AppState, GameEntity, ProjectType, SceneConfig, CADTool, VoxelData, CADPlane } from '../types';

const CHESS_MODELS = {
  black: {
    bishop: '/assets/chess/v1/pieces/black/bishop.glb',
    king: '/assets/chess/v1/pieces/black/king.glb',
    knight: '/assets/chess/v1/pieces/black/knight.glb',
    pawn: '/assets/chess/v1/pieces/black/pawn.glb',
    queen: '/assets/chess/v1/pieces/black/queen.glb',
    rook: '/assets/chess/v1/pieces/black/rook.glb',
  },
  white: {
    bishop: '/assets/chess/v1/pieces/white/bishop.glb',
    king: '/assets/chess/v1/pieces/white/king.glb',
    knight: '/assets/chess/v1/pieces/white/knight.glb',
    pawn: '/assets/chess/v1/pieces/white/pawn.glb',
    queen: '/assets/chess/v1/pieces/white/queen.glb',
    rook: '/assets/chess/v1/pieces/white/rook.glb',
  }
};

export class VoxelEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private perspectiveCamera: THREE.PerspectiveCamera;
  private orthoCamera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private gltfLoader: GLTFLoader;
  private resizeObserver: ResizeObserver;
  
  private ambientLight: THREE.AmbientLight;
  private sunLight: THREE.DirectionalLight;

  private world: CANNON.World;
  private entities: Map<string, { 
    mesh?: THREE.InstancedMesh, 
    model?: THREE.Group,
    data: GameEntity, 
    body?: CANNON.Body 
  }> = new Map();
  private groundBody: CANNON.Body;

  private draggedEntityId: string | null = null;
  private dragIndicator: THREE.Mesh | null = null;
  private cadTool: CADTool = CADTool.NONE;
  private cadPlane: CADPlane = CADPlane.XZ;
  private extrusion: number = 1;

  private physicsDebug: boolean = false;
  private debugGroup: THREE.Group = new THREE.Group();

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private drawingPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private startPoint: THREE.Vector3 | null = null;
  private previewMesh: THREE.InstancedMesh | null = null;
  private drawingColor: number = 0xffffff;
  private isMouseDown: boolean = false;

  private onCountChange: (count: number) => void;
  private onEntityCreated: ((entity: GameEntity) => void) | null = null;
  private animationId: number = 0;
  private dummy = new THREE.Object3D();
  private projectType: ProjectType = ProjectType.SANDBOX;

  constructor(
    container: HTMLElement, 
    onStateChange: (state: AppState) => void,
    onCountChange: (count: number) => void
  ) {
    this.container = container;
    this.onCountChange = onCountChange;

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setCrossOrigin('anonymous');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f111a);
    this.scene.fog = new THREE.FogExp2(0x0f111a, 0.015);
    this.scene.add(this.debugGroup);

    const aspect = window.innerWidth / window.innerHeight;
    this.perspectiveCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    this.perspectiveCamera.position.set(15, 15, 15);
    
    const d = 30;
    this.orthoCamera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
    this.orthoCamera.position.set(0, 100, 0);
    this.orthoCamera.lookAt(0, 0, 0);

    this.camera = this.perspectiveCamera;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Responsive Resizing based on container
    const initialRect = container.getBoundingClientRect();
    this.handleResizeDimensions(initialRect.width || window.innerWidth, initialRect.height || window.innerHeight);

    this.resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
            const { width, height } = entry.contentRect;
            this.handleResizeDimensions(width, height);
        }
    });
    this.resizeObserver.observe(container);

    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;

    this.setupLights();
    this.setupGrid();
    this.setupPhysicsGround();
    this.setupDragIndicator();

    container.addEventListener('mousedown', this.onMouseDown.bind(this));
    container.addEventListener('mousemove', this.onMouseMove.bind(this));
    container.addEventListener('mouseup', this.onMouseUp.bind(this));

    this.animate = this.animate.bind(this);
    this.animate();
  }

  public setOnEntityCreated(cb: (entity: GameEntity) => void) {
    this.onEntityCreated = cb;
  }

  private setupDragIndicator() {
    const geo = new THREE.BoxGeometry(1.05, 1.05, 1.05);
    const mat = new THREE.MeshBasicMaterial({ 
      color: 0x00ffff, 
      transparent: true, 
      opacity: 0.2,
      wireframe: true
    });
    this.dragIndicator = new THREE.Mesh(geo, mat);
    this.dragIndicator.visible = false;
    this.scene.add(this.dragIndicator);
  }

  private setupPhysicsGround() {
    this.groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
    });
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.groundBody);
  }

  private setupLights() {
    // A soft ambient base
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambientLight);

    // Hemisphere light adds an excellent sky-to-ground gradient contrast
    const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x222233, 1.0);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sunLight.position.set(30, 50, -20);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.left = -50;
    this.sunLight.shadow.camera.right = 50;
    this.sunLight.shadow.camera.top = 50;
    this.sunLight.shadow.camera.bottom = -50;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
  }

  public updateLighting(config: SceneConfig) {
    this.ambientLight.intensity = config.ambientIntensity;
    this.sunLight.color.set(config.sunColor);
    this.sunLight.castShadow = config.castShadows;
    this.setPhysicsDebug(config.showPhysicsDebug);
    this.drawingColor = new THREE.Color(config.sunColor).getHex();
  }

  public setPhysicsDebug(enabled: boolean) {
    this.physicsDebug = enabled;
    this.debugGroup.visible = enabled;
  }

  private syncPhysicsDebug() {
    if (!this.physicsDebug) return;
    this.debugGroup.clear();
    this.world.bodies.forEach(body => {
      body.shapes.forEach((shape, i) => {
        let mesh: THREE.Mesh | null = null;
        if (shape instanceof CANNON.Box) {
          const geom = new THREE.BoxGeometry(shape.halfExtents.x * 2, shape.halfExtents.y * 2, shape.halfExtents.z * 2);
          mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true }));
        }
        if (mesh) {
          mesh.position.copy(body.position as any);
          mesh.quaternion.copy(body.quaternion as any);
          this.debugGroup.add(mesh);
        }
      });
    });
  }

  private setupGrid() {
    const grid = new THREE.GridHelper(100, 100, 0x666688, 0x222233);
    grid.position.y = -0.01;
    
    // Add a stronger origin axis lines
    const axesHelper = new THREE.AxesHelper(5);
    axesHelper.position.y = -0.005;
    this.scene.add(axesHelper);
    
    this.scene.add(grid);
  }

  public setCADTool(tool: CADTool) {
    this.cadTool = tool;
    this.container.style.cursor = (tool !== CADTool.NONE) ? 'crosshair' : 'default';
    this.controls.enableRotate = (tool === CADTool.NONE || this.projectType !== ProjectType.CAD);
    if (this.dragIndicator) this.dragIndicator.visible = (tool === CADTool.VOXEL);
  }

  public setCADPlane(plane: CADPlane) {
    this.cadPlane = plane;
    switch (plane) {
      case CADPlane.XZ: this.drawingPlane.set(new THREE.Vector3(0, 1, 0), 0); break;
      case CADPlane.XY: this.drawingPlane.set(new THREE.Vector3(0, 0, 1), 0); break;
      case CADPlane.YZ: this.drawingPlane.set(new THREE.Vector3(1, 0, 0), 0); break;
    }
  }

  public setExtrusion(depth: number) { this.extrusion = depth; }

  private updateMouse(e: MouseEvent) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onMouseDown(e: MouseEvent) {
    this.updateMouse(e);
    this.isMouseDown = true;
    
    if (this.projectType === ProjectType.CHESS) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
      for (const intersect of intersects) {
        let current: THREE.Object3D | null = intersect.object;
        while (current) {
          for (const [id, entity] of this.entities.entries()) {
            if ((entity.model === current || entity.mesh === current) && entity.data.type === 'piece') {
              this.draggedEntityId = id;
              this.controls.enabled = false;
              if (entity.body) entity.body.type = CANNON.Body.KINEMATIC;
              return;
            }
          }
          current = current.parent;
        }
      }
    }

    if (this.cadTool === CADTool.VOXEL) {
      this.placeBlockAtMouse();
      return;
    }

    if (this.cadTool === CADTool.PAINT) {
      this.paintAtMouse();
      return;
    }

    if (this.cadTool !== CADTool.NONE && this.projectType === ProjectType.CAD) {
      this.startPoint = this.getMousePoint();
    }
  }

  private onMouseMove(e: MouseEvent) {
    this.updateMouse(e);
    
    if (this.draggedEntityId) {
      const point = this.getMousePoint();
      if (point) {
        const ent = this.entities.get(this.draggedEntityId);
        if (ent) {
          const visual = ent.mesh || ent.model;
          if (visual) {
            visual.position.lerp(new THREE.Vector3(point.x, 1.2, point.z), 0.2);
          }
        }
      }
    }

    if (this.cadTool === CADTool.VOXEL) {
        const buildPoint = this.getBuildPoint();
        if (buildPoint && this.dragIndicator) {
            this.dragIndicator.position.copy(buildPoint);
            this.dragIndicator.visible = true;
        } else if (this.dragIndicator) {
            this.dragIndicator.visible = false;
        }
    }

    if (this.isMouseDown && this.cadTool === CADTool.PAINT) {
      this.paintAtMouse();
    }

    if (this.startPoint && this.cadTool !== CADTool.NONE) {
      const currentPoint = this.getMousePoint();
      if (currentPoint) this.updatePreview(this.startPoint, currentPoint);
    }
  }

  private onMouseUp(e: MouseEvent) {
    this.updateMouse(e);
    this.isMouseDown = false;

    if (this.draggedEntityId) {
      const ent = this.entities.get(this.draggedEntityId);
      if (ent) {
        const visual = ent.mesh || ent.model;
        if (visual) {
          const x = Math.floor(visual.position.x) + 0.5;
          const z = Math.floor(visual.position.z) + 0.5;
          visual.position.set(x, 0.5, z);
          if (ent.body) {
            ent.body.type = CANNON.Body.DYNAMIC;
            ent.body.position.set(x, 0.5, z);
            ent.body.velocity.set(0, 0, 0);
          }
        }
      }
      this.draggedEntityId = null;
      this.controls.enabled = true;
    }

    if (this.startPoint && this.cadTool !== CADTool.NONE) {
      const endPoint = this.getMousePoint();
      if (endPoint) this.finalizeDrawing(this.startPoint, endPoint);
      this.startPoint = null;
      if (this.previewMesh) { this.scene.remove(this.previewMesh); this.previewMesh = null; }
    }
  }

  private getBuildPoint(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    if (intersects.length > 0) {
        const intersect = intersects[0];
        const point = intersect.point.clone();
        const normal = intersect.face?.normal.clone() || new THREE.Vector3(0, 1, 0);
        normal.applyQuaternion(intersect.object.quaternion);
        
        point.add(normal.multiplyScalar(0.5));
        return new THREE.Vector3(Math.round(point.x), Math.round(point.y), Math.round(point.z));
    }
    return null;
  }

  private placeBlockAtMouse() {
    const point = this.getBuildPoint();
    if (!point) return;

    const entity: GameEntity = {
      id: `block_${Date.now()}`,
      name: 'Voxel Block',
      type: 'prop',
      voxels: [{ x: 0, y: 0, z: 0, color: this.drawingColor }],
      position: { x: point.x, y: point.y, z: point.z },
      behavior: { type: 'static' }
    };
    this.spawnEntity(entity);
    if (this.onEntityCreated) this.onEntityCreated(entity);
  }

  private paintAtMouse() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    if (intersects.length === 0) return;
    const mesh = intersects[0].object as THREE.Mesh;
    if (mesh.isMesh) {
        if (!(mesh.material as any).color) return;
        (mesh.material as any).color.setHex(this.drawingColor);
    }
  }

  private getMousePoint(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersect = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.drawingPlane, intersect) ? intersect.clone() : null;
  }

  private updatePreview(start: THREE.Vector3, end: THREE.Vector3) {
    if (this.previewMesh) this.scene.remove(this.previewMesh);
    const voxels = this.rasterizeShape(start, end);
    if (voxels.length === 0) return;
    const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const material = new THREE.MeshBasicMaterial({ color: this.drawingColor, transparent: true, opacity: 0.5 });
    this.previewMesh = new THREE.InstancedMesh(geometry, material, voxels.length);
    voxels.forEach((v, i) => {
      this.dummy.position.set(v.x, v.y, v.z);
      this.dummy.updateMatrix();
      this.previewMesh!.setMatrixAt(i, this.dummy.matrix);
    });
    this.scene.add(this.previewMesh);
  }

  private finalizeDrawing(start: THREE.Vector3, end: THREE.Vector3) {
    const voxels = this.rasterizeShape(start, end);
    if (voxels.length === 0) return;
    const entity: GameEntity = {
      id: 'cad_' + Date.now(),
      name: `CAD ${this.cadTool}`,
      type: 'prop',
      voxels,
      position: { x: 0, y: 0, z: 0 },
      behavior: { type: 'static' }
    };
    this.spawnEntity(entity);
    if (this.onEntityCreated) this.onEntityCreated(entity);
  }

  private rasterizeShape(start: THREE.Vector3, end: THREE.Vector3): VoxelData[] {
    const voxels: VoxelData[] = [];
    let s = { a: Math.round(start.x), b: Math.round(start.z), fixed: Math.round(start.y) };
    let e = { a: Math.round(end.x), b: Math.round(end.z), fixed: Math.round(end.y) };
    if (this.cadPlane === CADPlane.XY) {
        s = { a: Math.round(start.x), b: Math.round(start.y), fixed: Math.round(start.z) };
        e = { a: Math.round(end.x), b: Math.round(end.y), fixed: Math.round(end.z) };
    } else if (this.cadPlane === CADPlane.YZ) {
        s = { a: Math.round(start.y), b: Math.round(start.z), fixed: Math.round(start.x) };
        e = { a: Math.round(end.y), b: Math.round(end.z), fixed: Math.round(end.x) };
    }

    const addVoxel = (a: number, b: number, c: number) => {
      let x, y, z;
      if (this.cadPlane === CADPlane.XZ) { x = a; y = c; z = b; }
      else if (this.cadPlane === CADPlane.XY) { x = a; y = b; z = c; }
      else { x = c; y = a; z = b; }
      voxels.push({ x, y, z, color: this.drawingColor });
    };

    if (this.cadTool === CADTool.LINE) {
        this.rasterizeLine2D(s.a, s.b, e.a, e.b, (a, b) => {
            for (let c = 0; c < this.extrusion; c++) addVoxel(a, b, s.fixed + c);
        });
    } else if (this.cadTool === CADTool.RECTANGLE) {
        this.rasterizeRect2D(s.a, s.b, e.a, e.b, (a, b) => {
            for (let c = 0; c < this.extrusion; c++) addVoxel(a, b, s.fixed + c);
        });
    } else if (this.cadTool === CADTool.CUBE) {
        const minA = Math.min(s.a, e.a), maxA = Math.max(s.a, e.a);
        const minB = Math.min(s.b, e.b), maxB = Math.max(s.b, e.b);
        for (let a = minA; a <= maxA; a++) for (let b = minB; b <= maxB; b++) for (let c = 0; c < this.extrusion; c++) addVoxel(a, b, s.fixed + c);
    }
    return voxels;
  }

  private rasterizeLine2D(a0: number, b0: number, a1: number, b1: number, add: (a: number, b: number) => void) {
    let da = Math.abs(a1 - a0), db = Math.abs(b1 - b0), sa = a0 < a1 ? 1 : -1, sb = b0 < b1 ? 1 : -1, err = da - db;
    while (true) { add(a0, b0); if (a0 === a1 && b0 === b1) break; let e2 = 2 * err; if (e2 > -db) { err -= db; a0 += sa; } if (e2 < da) { err += da; b0 += sb; } }
  }

  private rasterizeRect2D(a1: number, b1: number, a2: number, b2: number, add: (a: number, b: number) => void) {
    const minA = Math.min(a1, a2), maxA = Math.max(a1, a2), minB = Math.min(b1, b2), maxB = Math.max(b1, b2);
    for (let a = minA; a <= maxA; a++) { add(a, minB); add(a, maxB); }
    for (let b = minB + 1; b < maxB; b++) { add(minA, b); add(maxA, b); }
  }

  public setProjectType(type: ProjectType) {
    this.projectType = type;
    this.clearWorld();
    if (type === ProjectType.CAD) { this.camera = this.orthoCamera; this.scene.background = new THREE.Color(0x161824); this.scene.fog = new THREE.FogExp2(0x161824, 0.015); this.world.gravity.set(0, 0, 0); }
    else if (type === ProjectType.CHESS) { this.camera = this.perspectiveCamera; this.scene.background = new THREE.Color(0x0a0a0f); this.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.015); this.world.gravity.set(0, -20, 0); this.setupChessBoard(); }
    else { this.camera = this.perspectiveCamera; this.scene.background = new THREE.Color(0x0f111a); this.scene.fog = new THREE.FogExp2(0x0f111a, 0.015); this.world.gravity.set(0, -9.82, 0); }
    this.controls.object = this.camera;
  }

  private setupChessBoard() {
    const boardVoxels: VoxelData[] = [];
    for (let x = -5; x < 5; x++) {
      for (let z = -5; z < 5; z++) {
        const isWhite = (x + z) % 2 !== 0;
        boardVoxels.push({ x, y: -0.5, z, color: isWhite ? 0xFAF9F6 : 0x1A1210 });
      }
    }
    this.spawnEntity({ id: 'chess_board', name: 'Board', type: 'prop', voxels: boardVoxels, position: { x: 0, y: 0, z: 0 }, behavior: { type: 'static' } });
  }

  public async spawnEntity(entity: GameEntity) {
    if (this.entities.has(entity.id)) this.removeEntity(entity.id);

    let visual: THREE.Object3D | undefined;
    if (entity.modelUrl) {
      try {
        const gltf = await this.loadModel(entity.modelUrl);
        const model = gltf.scene.clone();
        
        // Correct normalization: Align bottom center of model to local origin
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        
        // Pivot group to handle centering and scaling correctly
        const pivot = new THREE.Group();
        model.position.set(-center.x, -box.min.y, -center.z); // Move bottom of model to 0,0,0
        pivot.add(model);
        
        const autoScale = entity.scale || (5 / Math.max(size.x, size.y, size.z));
        pivot.scale.set(autoScale, autoScale, autoScale);
        
        visual = pivot;
        this.scene.add(visual);
        this.entities.set(entity.id, { model: pivot, data: entity });
        
        console.log(`Successfully spawned model: ${entity.name} at scale ${autoScale}`);
      } catch (err) {
        console.error(`Failed to load model: ${entity.modelUrl}`, err);
      }
    } else if (entity.voxels) {
      const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
      const material = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.8 });
      const mesh = new THREE.InstancedMesh(geometry, material, entity.voxels.length);
      entity.voxels.forEach((v, i) => {
        this.dummy.position.set(v.x, v.y, v.z);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        mesh.setColorAt(i, new THREE.Color(v.color));
      });
      visual = mesh;
      this.scene.add(visual);
      this.entities.set(entity.id, { mesh, data: entity });
    }

    if (visual) {
      visual.position.set(entity.position.x, entity.position.y, entity.position.z);
      if (entity.behavior.type === 'dynamic') {
        const box = new THREE.Box3().setFromObject(visual);
        const size = new THREE.Vector3();
        box.getSize(size);
        const body = new CANNON.Body({
          mass: entity.behavior.mass || 1,
          shape: new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2)),
          position: new CANNON.Vec3(entity.position.x, entity.position.y + size.y/2, entity.position.z)
        });
        this.world.addBody(body);
        const entRef = this.entities.get(entity.id);
        if (entRef) entRef.body = body;
      }
    }
    this.updateVoxelCount();
  }

  private async loadModel(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url.trim(), resolve, undefined, reject);
    });
  }

  public removeEntity(id: string) {
    const ent = this.entities.get(id);
    if (ent) {
      if (ent.mesh) this.scene.remove(ent.mesh);
      if (ent.model) this.scene.remove(ent.model);
      if (ent.body) this.world.removeBody(ent.body);
      this.entities.delete(id);
      this.updateVoxelCount();
    }
  }

  private updateVoxelCount() {
    let total = 0;
    this.entities.forEach(e => { total += (e.data.voxels ? e.data.voxels.length : 1); });
    this.onCountChange(total);
  }

  public clearWorld() {
    Array.from(this.entities.keys()).forEach(id => this.removeEntity(id));
  }

  private animate() {
    this.animationId = requestAnimationFrame(this.animate);
    this.world.fixedStep();
    this.controls.update();
    this.syncPhysicsDebug();
    this.entities.forEach((ent) => {
      const visual = ent.mesh || ent.model;
      if (visual && ent.body) {
        visual.position.copy(ent.body.position as any);
        visual.quaternion.copy(ent.body.quaternion as any);
      }
    });
    this.renderer.render(this.scene, this.camera);
  }

  public handleResizeDimensions(width: number, height: number) {
    if (width === 0 || height === 0) return;
    const aspect = width / height;
    
    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.updateProjectionMatrix();

    const d = 30;
    this.orthoCamera.left = -d * aspect;
    this.orthoCamera.right = d * aspect;
    this.orthoCamera.top = d;
    this.orthoCamera.bottom = -d;
    this.orthoCamera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  public handleResize() {
    // Only used for global window resizes if needed, but resizeObserver handles it better
    const rect = this.container.getBoundingClientRect();
    this.handleResizeDimensions(rect.width, rect.height);
  }

  public exportForBlender(): void {
    const payload = Array.from(this.entities.values()).map((e) => e.data);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxel-scene-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public cleanup() {
    cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
