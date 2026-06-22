import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const sceneCanvas = document.querySelector(".scene-canvas");
const trainSpeedInput = document.querySelector("#train-speed");
const trainSpeedValue = document.querySelector("#train-speed-value");
const routeReadout = document.querySelector("#route-readout");
const followTrainButton = document.querySelector("#follow-train");
const povTrainButton = document.querySelector("#pov-train");
const povThrottleButton = document.querySelector("#pov-throttle");
const povBrakeButton = document.querySelector("#pov-brake");
const povHornButton = document.querySelector("#pov-horn");
const resetOverviewButton = document.querySelector("#reset-overview");
const presetButtons = [...document.querySelectorAll("[data-preset]")];
const sceneModeButtons = [...document.querySelectorAll("[data-scene-mode]")];
const autoShowButton = document.querySelector("#auto-show");
const hudPanel = document.querySelector(".hud-panel");
const hudToggleButton = document.querySelector("#hud-toggle");
const cabPointer = new THREE.Vector2();
const cabRaycaster = new THREE.Raycaster();
const cabInteractiveMeshes = [];
const cabDragState = {
  activeControl: null,
  pointerId: null,
  startY: 0,
  startSpeed: 1,
};
let latestElapsedTime = 0;
let trainAudioContext = null;
let driverCab = null;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: sceneCanvas,
    antialias: true,
    alpha: false,
  });
} catch (webglCreationError) {
  const fallbackPanel = document.createElement("div");
  fallbackPanel.className = "webgl-fallback";
  fallbackPanel.textContent = "This toy railway needs WebGL to run. Try a browser with hardware graphics enabled.";
  document.body.append(fallbackPanel);
  throw webglCreationError;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaee6ff);

const camera = new THREE.PerspectiveCamera(
  window.innerWidth <= 720 ? 52 : 42,
  window.innerWidth / window.innerHeight,
  0.1,
  220,
);
camera.position.set(34, 28, 35);
scene.add(camera);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.enablePan = true;
orbitControls.screenSpacePanning = true;
orbitControls.minDistance = 8;
orbitControls.maxDistance = 130;
orbitControls.minPolarAngle = Math.PI * 0.04;
orbitControls.maxPolarAngle = Math.PI * 0.495;
orbitControls.target.set(1.5, 4.6, 0.8);
orbitControls.update();

const hemisphereLight = new THREE.HemisphereLight(0xf2fbff, 0xbfe8ff, 1.5);
scene.add(hemisphereLight);

const mainSunLight = new THREE.DirectionalLight(0xfff3c4, 1.16);
mainSunLight.position.set(26, 35, 18);
scene.add(mainSunLight);

const fillSunLight = new THREE.DirectionalLight(0xd8f1ff, 0.58);
fillSunLight.position.set(-16, 18, -10);
scene.add(fillSunLight);

const toyPalette = {
  red: 0xf04438,
  blue: 0x1976e8,
  yellow: 0xffce2e,
  green: 0x47c95b,
  river: 0x28bdf5,
  navy: 0x214a8e,
  paleStone: 0xe8f4ff,
  warmStone: 0xdba348,
  cream: 0xf8fcff,
  trackBed: 0xeaf7ff,
  trackBedSide: 0xb8dff2,
  trackSleeper: 0xd8edf8,
  trackRail: 0x2a80d7,
  trackSupport: 0x7fd3e6,
  trackTunnel: 0xd3f3ff,
  trackSignal: 0xffdc6c,
  brick: 0xc96a4c,
  wood: 0x9a5a2f,
  grass: 0x79d95d,
  park: 0x42b84e,
  teal: 0x6ed8ef,
  roofBlue: 0x5aaaf8,
  roofSlate: 0x7ea7de,
  shadowBlue: 0xa8c5e8,
  darkBlue: 0x18355e,
  metal: 0xb8cbe4,
  flowerPink: 0xff6b86,
  flowerYellow: 0xffd85e,
  flowerBlue: 0x63beff,
};

const appState = {
  westTunnelActive: false,
  eastFlyoverActive: false,
  trainCount: 6,
  speedFactor: trainSpeedInput ? Number(trainSpeedInput.value) : 1,
  followTrainActive: false,
  povTrainActive: false,
  selectedTrainIndex: 0,
  sceneMode: "spring",
  autoShowActive: false,
  autoShowModeIndex: 0,
  autoShowBaseModeIndex: 0,
  autoShowBaseRoutePhase: 0,
  autoShowStartedAt: 0,
  autoShowRouteStartedAt: 0,
};
driverCab = createDriverCab();
syncDriverCabControls();

const autoShowModeDuration = 5.8;
const autoShowRouteDuration = 2.9;
const sceneModeOrder = ["spring", "summer", "autumn", "winter", "golden", "night"];
const sceneModeConfigs = {
  spring: {
    label: "Spring",
    sky: 0xb8efff,
    cssSkyTop: "#b8efff",
    cssSkyBottom: "#ffe6f2",
    ground: 0x7fe868,
    park: 0x57cf67,
    parkBorder: 0x2ea24f,
    river: 0x29c6ff,
    bank: 0x72d56b,
    promenade: 0xff8fc3,
    trees: [0x6fe36a, 0xffa7ce, 0xffd1e3],
    flowers: [0xff4f9a, 0xffd85e, 0x63beff],
    roomFloor: 0xe0f6ff,
    rug: 0xf2d7f0,
    tableWood: 0xb66d3e,
    tableTrim: 0x80482b,
    hemiSky: 0xffffff,
    hemiGround: 0xcfffc8,
    hemiIntensity: 1.62,
    sun: 0xfff6cd,
    sunIntensity: 1.22,
    sunPosition: [18, 38, 20],
    fill: 0xffc1df,
    fillIntensity: 0.62,
    fillPosition: [-18, 18, -12],
    exposure: 1.1,
    snowOpacity: 0,
    starsOpacity: 0,
    festiveLights: false,
    holidayFeature: false,
    route: { westTunnelActive: false, eastFlyoverActive: false },
  },
  summer: {
    label: "Summer",
    sky: 0xaee6ff,
    cssSkyTop: "#aee6ff",
    cssSkyBottom: "#eefbff",
    ground: 0x76d95c,
    park: 0x42b84e,
    parkBorder: 0x208f3f,
    river: 0x28bdf5,
    bank: 0x4fc85e,
    promenade: 0xffa24c,
    trees: [0x42b84e, 0x79d95d, 0x68cb5a],
    flowers: [toyPalette.flowerPink, toyPalette.flowerBlue, toyPalette.flowerYellow],
    roomFloor: 0xd7e9f6,
    rug: 0xcce9f5,
    tableWood: toyPalette.wood,
    tableTrim: 0x7a4426,
    hemiSky: 0xf2fbff,
    hemiGround: 0xbfe8ff,
    hemiIntensity: 1.5,
    sun: 0xfff3c4,
    sunIntensity: 1.16,
    sunPosition: [24, 36, 18],
    fill: 0xd8f1ff,
    fillIntensity: 0.58,
    fillPosition: [-16, 18, -10],
    exposure: 1.05,
    snowOpacity: 0,
    starsOpacity: 0,
    festiveLights: false,
    holidayFeature: false,
    route: { westTunnelActive: false, eastFlyoverActive: false },
  },
  autumn: {
    label: "Autumn",
    sky: 0xffb25c,
    cssSkyTop: "#ff9f4a",
    cssSkyBottom: "#ffe16f",
    ground: 0xa7cf45,
    park: 0xc77b27,
    parkBorder: 0x8f4b1e,
    river: 0x1fa8e8,
    bank: 0xd48b2e,
    promenade: 0xff5e3f,
    trees: [0xffc247, 0xff7a3f, 0xc9362e],
    flowers: [0xffd43f, 0xff8d55, 0xd64035],
    roomFloor: 0xffcc75,
    rug: 0xff9e63,
    tableWood: 0xa9562f,
    tableTrim: 0x74351f,
    hemiSky: 0xfff1b8,
    hemiGround: 0xff9c4e,
    hemiIntensity: 1.46,
    sun: 0xff832e,
    sunIntensity: 1.52,
    sunPosition: [-20, 18, -28],
    fill: 0xff4f68,
    fillIntensity: 0.64,
    fillPosition: [20, 16, 22],
    exposure: 1.14,
    snowOpacity: 0,
    starsOpacity: 0,
    festiveLights: false,
    holidayFeature: false,
    route: { westTunnelActive: true, eastFlyoverActive: false },
  },
  winter: {
    label: "Winter",
    sky: 0xcaf4ff,
    cssSkyTop: "#bdefff",
    cssSkyBottom: "#fff2f6",
    ground: 0xf7fdff,
    park: 0xe4faff,
    parkBorder: 0x82cae4,
    river: 0x6bdcff,
    bank: 0xf0fbff,
    promenade: 0xff405f,
    trees: [0x0e8b58, 0x23b06b, 0x0f6b4a],
    flowers: [0xef334b, 0xffdc6c, 0xffffff],
    roomFloor: 0xeaf7ff,
    rug: 0xd8f1ff,
    tableWood: 0xa96038,
    tableTrim: 0x74412a,
    hemiSky: 0xffffff,
    hemiGround: 0xc9ecff,
    hemiIntensity: 1.86,
    sun: 0xfff7df,
    sunIntensity: 1.18,
    sunPosition: [3, 34, 22],
    fill: 0x9fe8ff,
    fillIntensity: 0.92,
    fillPosition: [-18, 20, -14],
    exposure: 1.2,
    snowOpacity: 1,
    starsOpacity: 0.28,
    festiveLights: true,
    holidayFeature: true,
    route: { westTunnelActive: true, eastFlyoverActive: true },
  },
  night: {
    label: "Night run",
    sky: 0x14274a,
    cssSkyTop: "#0f2143",
    cssSkyBottom: "#233e67",
    ground: 0x316f54,
    park: 0x1f6c4c,
    parkBorder: 0x174c38,
    river: 0x174e7e,
    bank: 0x244e42,
    promenade: 0xc98c4d,
    trees: [0x195c42, 0x237753, 0x2c8a60],
    flowers: [0xff6b86, 0xffdc6c, 0x63beff],
    roomFloor: 0x233d61,
    rug: 0x1f395f,
    tableWood: 0x6a432d,
    tableTrim: 0x4f2e21,
    hemiSky: 0x9fc8ff,
    hemiGround: 0x10233d,
    hemiIntensity: 0.78,
    sun: 0x8fc7ff,
    sunIntensity: 0.46,
    sunPosition: [-24, 22, -28],
    fill: 0x284f8a,
    fillIntensity: 0.42,
    fillPosition: [18, 14, 22],
    exposure: 1.22,
    snowOpacity: 0,
    starsOpacity: 1,
    festiveLights: true,
    holidayFeature: false,
    route: { westTunnelActive: false, eastFlyoverActive: true },
  },
  golden: {
    label: "Golden hour",
    sky: 0xff7a4f,
    cssSkyTop: "#ff6f45",
    cssSkyBottom: "#ffd43f",
    ground: 0x7cd954,
    park: 0x54c957,
    parkBorder: 0x2b9a3f,
    river: 0x22b8ef,
    bank: 0x6ed35a,
    promenade: 0xff7a3f,
    trees: [0x4aa94a, 0x8cd64e, 0xffb13d],
    flowers: [0xff4f68, 0xff8b2e, 0xffd43f],
    roomFloor: 0xffb05f,
    rug: 0xe8a35f,
    tableWood: 0xb9582f,
    tableTrim: 0x8f341f,
    hemiSky: 0xffdb73,
    hemiGround: 0xff7a4f,
    hemiIntensity: 1.42,
    sun: 0xff7a28,
    sunIntensity: 1.82,
    sunPosition: [-32, 8, -30],
    fill: 0xff5d7d,
    fillIntensity: 0.72,
    fillPosition: [20, 15, 24],
    exposure: 1.18,
    snowOpacity: 0,
    starsOpacity: 0,
    festiveLights: false,
    holidayFeature: false,
    route: { westTunnelActive: true, eastFlyoverActive: false },
  },
};

const cameraPresets = {
  fullTable: {
    position: new THREE.Vector3(31, 22.5, 36),
    target: new THREE.Vector3(1.2, 4.2, 0.2),
    mobilePosition: new THREE.Vector3(51, 41, 60),
    mobileTarget: new THREE.Vector3(0, 4.2, 0.2),
  },
  westminster: {
    position: new THREE.Vector3(-38.0, 16.8, 18.8),
    target: new THREE.Vector3(-16.9, 7.3, -2.35),
    mobilePosition: new THREE.Vector3(-43.0, 21.2, 22.4),
    mobileTarget: new THREE.Vector3(-16.7, 7.1, -2.45),
  },
  londonEye: {
    position: new THREE.Vector3(-18.5, 11.8, 22.8),
    target: new THREE.Vector3(-7.8, 5.9, 9.8),
    mobilePosition: new THREE.Vector3(-24.5, 15.4, 27.5),
    mobileTarget: new THREE.Vector3(-7.8, 5.8, 9.8),
  },
  shardView: {
    position: new THREE.Vector3(20.5, 14.2, 16.8),
    target: new THREE.Vector3(8.9, 8.3, 0.6),
    mobilePosition: new THREE.Vector3(26.5, 18.4, 22.8),
    mobileTarget: new THREE.Vector3(8.9, 8.1, 0.7),
  },
  towerBridge: {
    position: new THREE.Vector3(34.0, 13.4, 9.8),
    target: new THREE.Vector3(20.8, 5.5, -4.7),
    mobilePosition: new THREE.Vector3(40.0, 17.4, 12.8),
    mobileTarget: new THREE.Vector3(20.8, 5.4, -4.7),
  },
};

const cameraState = {
  desiredPosition: camera.position.clone(),
  desiredTarget: orbitControls.target.clone(),
  presetMode: false,
  lastPresetName: "fullTable",
  userIsOrbiting: false,
};

const matrixScratch = new THREE.Matrix4();
const quaternionScratch = new THREE.Quaternion();
const scaleScratch = new THREE.Vector3();
const seasonalParticleEuler = new THREE.Euler();
const forwardScratch = new THREE.Vector3();
const rightScratch = new THREE.Vector3();
const upScratch = new THREE.Vector3();
const basisScratch = new THREE.Matrix4();
const positionScratch = new THREE.Vector3();
const lookAtScratch = new THREE.Vector3();
const orientationHelper = new THREE.Object3D();

const instanceStore = {
  supportMatrices: [],
  archBeamMatrices: [],
  treeTrunkMatrices: [],
  treeCanopyMatrices: [],
  flowerStemMatrices: [],
  flowerHeadMatrices: [],
  lampPostMatrices: [],
  lampHeadMatrices: [],
  benchLegMatrices: [],
  benchSeatMatrices: [],
  houseBodyMatrices: [],
  houseRoofMatrices: [],
  windowMatrices: [],
  boatBodyMatrices: [],
  boatCabinMatrices: [],
  treeCanopyColors: [],
  flowerHeadColors: [],
  lampHeadColors: [],
  houseBodyColors: [],
  houseRoofColors: [],
  windowColors: [],
  boatBodyColors: [],
};

const tableSurfaceY = 0.72;
const waterSurfaceY = tableSurfaceY + 0.15;
const parkSurfaceY = tableSurfaceY + 0.11;
const landmarkLayout = {
  westminster: { x: -16.2, z: -3.65 },
  londonEye: { x: -7.8, z: 10.1 },
  stPauls: { x: 3.7, z: -8.35 },
  shard: { x: 9.8, z: 2.55 },
  towerBridge: { x: 20.6, z: -4.65, rotationY: Math.PI * 0.5 },
  battersea: { x: -16.4, z: 12.35 },
};

const rotatingEyeMeshes = [];
const londonEyeCapsuleRecords = [];
const boatAnimationRecords = [];
const riverShipRecords = [];
const smokePuffRecords = [];
const trainWheelRecords = [];
const trainHeadlightRecords = [];
const festiveLightRecords = [];
const atmosphereLayerRecords = [];
const seasonalParticleSystems = [];
let holidayFeatureGroup = null;
let snowPoints = null;
let starPoints = null;
let sunsetSunGroup = null;
let sunsetRayGroup = null;
let springBloomGroup = null;
let summerCloudGroup = null;
let autumnGlowGroup = null;
let frostHazeGroup = null;
let moonGroup = null;
let sunsetReflectionGroup = null;
const animatedInstanceRefs = {
  boatBodyMesh: null,
  boatCabinMesh: null,
};
const visualRefs = {
  roomFloorMaterials: [],
  rugMaterials: [],
  grassMaterials: [],
  parkMaterials: [],
  parkBorderMaterials: [],
  waterMaterials: [],
  riverBankMaterials: [],
  promenadeMaterials: [],
  tableMaterials: [],
  tableTrimMaterials: [],
  treeCanopyMesh: null,
  flowerHeadMesh: null,
  lampHeadMaterial: null,
  windowMaterial: null,
};

function pushMatrix(targetList, matrixValue) {
  targetList.push(matrixValue.clone());
}

function pushColoredMatrix(targetList, colorList, matrixValue, colorValue) {
  targetList.push(matrixValue.clone());
  colorList.push(new THREE.Color(colorValue));
}

function buildInstancedMesh(geometryValue, materialValue, matrixValues, colorValues = null) {
  const instancedMesh = new THREE.InstancedMesh(geometryValue, materialValue, matrixValues.length);

  matrixValues.forEach((matrixValue, instanceIndex) => {
    instancedMesh.setMatrixAt(instanceIndex, matrixValue);
    if (colorValues) {
      instancedMesh.setColorAt(instanceIndex, colorValues[instanceIndex]);
    }
  });

  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) {
    instancedMesh.instanceColor.needsUpdate = true;
  }

  return instancedMesh;
}

function composeMatrixFromPosition(positionValue, rotationQuaternion, scaleValue) {
  matrixScratch.compose(positionValue, rotationQuaternion, scaleValue);
  return matrixScratch.clone();
}

function composeTrackMatrix(trackPosition, trackTangent, trackRight, scaleValue, verticalOffset, lateralOffset) {
  forwardScratch.copy(trackTangent).normalize();
  rightScratch.copy(trackRight).normalize();

  if (rightScratch.lengthSq() < 0.0001) {
    rightScratch.set(1, 0, 0);
  }

  upScratch.crossVectors(rightScratch, forwardScratch).normalize();
  basisScratch.makeBasis(rightScratch, upScratch, forwardScratch);
  quaternionScratch.setFromRotationMatrix(basisScratch);
  scaleScratch.copy(scaleValue);

  positionScratch.copy(trackPosition).add(rightScratch.clone().multiplyScalar(lateralOffset));
  positionScratch.y += verticalOffset;

  matrixScratch.compose(positionScratch, quaternionScratch, scaleScratch);
  return matrixScratch.clone();
}

function buildPlaque(textValue, backgroundColor, foregroundColor) {
  const plaqueCanvas = document.createElement("canvas");
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 144;
  const plaqueContext = plaqueCanvas.getContext("2d");

  const radiusValue = 28;
  plaqueContext.beginPath();
  plaqueContext.moveTo(20 + radiusValue, 18);
  plaqueContext.lineTo(492 - radiusValue, 18);
  plaqueContext.quadraticCurveTo(492, 18, 492, 18 + radiusValue);
  plaqueContext.lineTo(492, 126 - radiusValue);
  plaqueContext.quadraticCurveTo(492, 126, 492 - radiusValue, 126);
  plaqueContext.lineTo(20 + radiusValue, 126);
  plaqueContext.quadraticCurveTo(20, 126, 20, 126 - radiusValue);
  plaqueContext.lineTo(20, 18 + radiusValue);
  plaqueContext.quadraticCurveTo(20, 18, 20 + radiusValue, 18);
  plaqueContext.closePath();

  plaqueContext.fillStyle = backgroundColor;
  plaqueContext.fill();
  plaqueContext.lineWidth = 8;
  plaqueContext.strokeStyle = "rgba(255,255,255,0.75)";
  plaqueContext.stroke();

  plaqueContext.fillStyle = foregroundColor;
  plaqueContext.font = "700 48px Avenir Next";
  plaqueContext.textAlign = "center";
  plaqueContext.textBaseline = "middle";
  plaqueContext.fillText(textValue, 256, 72);

  const plaqueTexture = new THREE.CanvasTexture(plaqueCanvas);
  plaqueTexture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: plaqueTexture,
      transparent: true,
      depthWrite: false,
    }),
  );
}

function createRadialTexture(colorStops) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const textureContext = textureCanvas.getContext("2d");
  const radialGradient = textureContext.createRadialGradient(128, 128, 0, 128, 128, 128);

  colorStops.forEach(([stopOffset, stopColor]) => {
    radialGradient.addColorStop(stopOffset, stopColor);
  });

  textureContext.fillStyle = radialGradient;
  textureContext.fillRect(0, 0, 256, 256);

  const radialTexture = new THREE.CanvasTexture(textureCanvas);
  radialTexture.colorSpace = THREE.SRGBColorSpace;
  return radialTexture;
}

function createSoftBandTexture(colorValue) {
  const bandCanvas = document.createElement("canvas");
  const bandWidth = 512;
  const bandHeight = 128;
  bandCanvas.width = bandWidth;
  bandCanvas.height = bandHeight;
  const bandContext = bandCanvas.getContext("2d");
  const bandColor = new THREE.Color(colorValue);
  const redValue = Math.round(bandColor.r * 255);
  const greenValue = Math.round(bandColor.g * 255);
  const blueValue = Math.round(bandColor.b * 255);
  const bandImage = bandContext.createImageData(bandWidth, bandHeight);

  for (let yValue = 0; yValue < bandHeight; yValue += 1) {
    const verticalFade = Math.sin((Math.PI * yValue) / (bandHeight - 1));
    for (let xValue = 0; xValue < bandWidth; xValue += 1) {
      const horizontalFade = Math.sin((Math.PI * xValue) / (bandWidth - 1));
      const alphaValue = Math.pow(Math.max(0, horizontalFade), 0.42) * Math.pow(Math.max(0, verticalFade), 0.72);
      const pixelOffset = (yValue * bandWidth + xValue) * 4;
      bandImage.data[pixelOffset] = redValue;
      bandImage.data[pixelOffset + 1] = greenValue;
      bandImage.data[pixelOffset + 2] = blueValue;
      bandImage.data[pixelOffset + 3] = Math.round(alphaValue * 255);
    }
  }

  bandContext.putImageData(bandImage, 0, 0);
  const bandTexture = new THREE.CanvasTexture(bandCanvas);
  bandTexture.colorSpace = THREE.SRGBColorSpace;
  return bandTexture;
}

function registerAtmosphereLayer(layerObject, opacityByMode) {
  layerObject.traverse((childObject) => {
    if (!childObject.material) {
      return;
    }

    const childMaterials = Array.isArray(childObject.material) ? childObject.material : [childObject.material];
    childMaterials.forEach((childMaterial) => {
      childMaterial.transparent = true;
      childMaterial.depthWrite = false;
      if (childMaterial.userData.baseOpacity === undefined) {
        childMaterial.userData.baseOpacity = childMaterial.opacity ?? 1;
      }
    });
  });

  const layerRecord = { object: layerObject, opacityByMode };
  atmosphereLayerRecords.push(layerRecord);
  setAtmosphereLayerOpacity(layerRecord, 0);
  return layerObject;
}

function setAtmosphereLayerOpacity(layerRecord, opacityValue) {
  const layerIsVisible = opacityValue > 0.01;
  layerRecord.object.visible = layerIsVisible;
  layerRecord.object.traverse((childObject) => {
    if (!childObject.material) {
      return;
    }

    childObject.visible = layerIsVisible;
    const childMaterials = Array.isArray(childObject.material) ? childObject.material : [childObject.material];
    childMaterials.forEach((childMaterial) => {
      childMaterial.opacity = childMaterial.userData.baseOpacity * opacityValue;
      childMaterial.needsUpdate = true;
    });
  });
}

function applyAtmosphereMode(modeName) {
  atmosphereLayerRecords.forEach((layerRecord) => {
    setAtmosphereLayerOpacity(layerRecord, layerRecord.opacityByMode[modeName] ?? 0);
  });
}

function createAtmosphereSprite(textureValue, xValue, yValue, zValue, scaleX, scaleY, baseOpacity = 1) {
  const spriteMaterial = new THREE.SpriteMaterial({
    map: textureValue,
    transparent: true,
    opacity: baseOpacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const atmosphereSprite = new THREE.Sprite(spriteMaterial);
  atmosphereSprite.position.set(xValue, yValue, zValue);
  atmosphereSprite.scale.set(scaleX, scaleY, 1);
  atmosphereSprite.renderOrder = -20;
  return atmosphereSprite;
}

function createSkyBand(widthValue, heightValue, colorValue, opacityValue, xValue, yValue, zValue, rotationZValue = 0) {
  const bandMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: createSoftBandTexture(colorValue),
    transparent: true,
    opacity: opacityValue,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const bandMesh = new THREE.Mesh(new THREE.PlaneGeometry(widthValue, heightValue), bandMaterial);
  bandMesh.position.set(xValue, yValue, zValue);
  bandMesh.rotation.z = rotationZValue;
  bandMesh.renderOrder = -25;
  return bandMesh;
}

function createToyMaterial(colorValue, roughnessValue = 0.56, metalnessValue = 0.03) {
  return new THREE.MeshStandardMaterial({
    color: colorValue,
    roughness: roughnessValue,
    metalness: metalnessValue,
  });
}

function createCabMaterial(colorValue, opacityValue = 1) {
  return new THREE.MeshBasicMaterial({
    color: colorValue,
    transparent: opacityValue < 1,
    opacity: opacityValue,
    depthTest: false,
    depthWrite: false,
  });
}

function prepareCabMesh(meshValue, controlName = "") {
  meshValue.renderOrder = 120;
  if (controlName) {
    meshValue.userData.cabControl = controlName;
    cabInteractiveMeshes.push(meshValue);
  }
  return meshValue;
}

function addCabBox(targetGroup, widthValue, heightValue, depthValue, colorValue, xValue, yValue, zValue, controlName = "", opacityValue = 1) {
  const boxMesh = new THREE.Mesh(
    new THREE.BoxGeometry(widthValue, heightValue, depthValue),
    createCabMaterial(colorValue, opacityValue),
  );
  boxMesh.position.set(xValue, yValue, zValue);
  targetGroup.add(prepareCabMesh(boxMesh, controlName));
  return boxMesh;
}

function addCabCylinder(targetGroup, radiusTopValue, radiusBottomValue, heightValue, colorValue, xValue, yValue, zValue, controlName = "", opacityValue = 1) {
  const cylinderMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTopValue, radiusBottomValue, heightValue, 28),
    createCabMaterial(colorValue, opacityValue),
  );
  cylinderMesh.position.set(xValue, yValue, zValue);
  cylinderMesh.rotation.x = Math.PI * 0.5;
  targetGroup.add(prepareCabMesh(cylinderMesh, controlName));
  return cylinderMesh;
}

function addCabSphere(targetGroup, radiusValue, colorValue, xValue, yValue, zValue, controlName = "") {
  const sphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radiusValue, 24, 16),
    createCabMaterial(colorValue),
  );
  sphereMesh.position.set(xValue, yValue, zValue);
  targetGroup.add(prepareCabMesh(sphereMesh, controlName));
  return sphereMesh;
}

function addCabLabel(targetGroup, labelTextValue, xValue, yValue, zValue, widthValue = 0.46) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 320;
  labelCanvas.height = 96;
  const labelContext = labelCanvas.getContext("2d");
  labelContext.clearRect(0, 0, labelCanvas.width, labelCanvas.height);

  const accentColors = {
    SPEED: "#8ce9ff",
    THROTTLE: "#ffce2e",
    BRAKE: "#f34848",
    HORN: "#fff28f",
  };
  const accentColor = accentColors[labelTextValue] ?? "#8ce9ff";
  const roundedRect = (x, y, width, height, radius) => {
    labelContext.beginPath();
    labelContext.moveTo(x + radius, y);
    labelContext.lineTo(x + width - radius, y);
    labelContext.quadraticCurveTo(x + width, y, x + width, y + radius);
    labelContext.lineTo(x + width, y + height - radius);
    labelContext.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    labelContext.lineTo(x + radius, y + height);
    labelContext.quadraticCurveTo(x, y + height, x, y + height - radius);
    labelContext.lineTo(x, y + radius);
    labelContext.quadraticCurveTo(x, y, x + radius, y);
    labelContext.closePath();
  };

  roundedRect(18, 16, 284, 60, 18);
  labelContext.fillStyle = "rgba(3, 16, 34, 0.94)";
  labelContext.fill();
  labelContext.lineWidth = 4;
  labelContext.strokeStyle = "rgba(216, 247, 255, 0.78)";
  labelContext.stroke();
  labelContext.fillStyle = accentColor;
  labelContext.fillRect(34, 64, 252, 5);

  labelContext.shadowColor = "rgba(0, 0, 0, 0.72)";
  labelContext.shadowBlur = 7;
  labelContext.shadowOffsetY = 2;
  labelContext.fillStyle = "#ffffff";
  labelContext.font = "800 30px Avenir Next, Arial, sans-serif";
  labelContext.textAlign = "center";
  labelContext.textBaseline = "middle";
  labelContext.fillText(labelTextValue, labelCanvas.width / 2, 44);
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  labelSprite.position.set(xValue, yValue, zValue);
  labelSprite.scale.set(widthValue, widthValue * 0.3, 1);
  labelSprite.renderOrder = 122;
  targetGroup.add(labelSprite);
  return labelSprite;
}

function createDriverCab() {
  const cabGroup = new THREE.Group();
  cabGroup.visible = false;
  camera.add(cabGroup);

  const glassMaterial = createCabMaterial(0x8ce9ff, 0.13);
  const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.55, 1.6), glassMaterial);
  glassMesh.position.set(0, 0.0, -3.12);
  glassMesh.renderOrder = 116;
  cabGroup.add(glassMesh);

  addCabBox(cabGroup, 3.65, 0.08, 0.08, 0x071a33, 0, 0.82, -3.0);
  addCabBox(cabGroup, 3.35, 0.1, 0.1, 0x071a33, 0, -0.78, -2.92);
  addCabBox(cabGroup, 0.08, 1.75, 0.08, 0x071a33, -1.72, 0.03, -2.96);
  addCabBox(cabGroup, 0.08, 1.75, 0.08, 0x071a33, 1.72, 0.03, -2.96);
  addCabBox(cabGroup, 0.06, 1.48, 0.08, 0x0c3157, 0, 0.02, -2.98);

  addCabBox(cabGroup, 3.18, 0.48, 0.18, 0x06172e, 0.08, -1.1, -2.55);
  addCabBox(cabGroup, 3.24, 0.16, 0.22, 0x0b2a4a, 0.08, -1.36, -2.42);
  addCabBox(cabGroup, 2.76, 0.045, 0.05, 0x81e9ff, 0.08, -0.83, -2.38, "", 0.82);

  const speedGauge = new THREE.Group();
  speedGauge.position.set(-0.82, -1.08, -2.34);
  cabGroup.add(speedGauge);
  addCabCylinder(speedGauge, 0.23, 0.23, 0.035, 0xdff7ff, 0, 0, 0);
  addCabCylinder(speedGauge, 0.245, 0.245, 0.018, 0x0a2a4b, 0, 0, 0.02);
  const speedNeedleGroup = new THREE.Group();
  speedNeedleGroup.position.set(0, 0, 0.055);
  addCabBox(speedNeedleGroup, 0.025, 0.17, 0.02, 0xf34848, 0, 0.085, 0);
  speedGauge.add(speedNeedleGroup);
  addCabLabel(cabGroup, "SPEED", -0.82, -0.76, -2.34, 0.54);

  addCabBox(cabGroup, 0.16, 0.66, 0.045, 0xd5e5eb, 0.0, -1.07, -2.3, "throttle", 0.82);
  addCabBox(cabGroup, 0.052, 0.58, 0.035, 0xffce2e, 0.0, -1.07, -2.26, "throttle");
  const throttleHandle = new THREE.Group();
  throttleHandle.position.set(0.0, -1.07, -2.2);
  throttleHandle.userData.cabControl = "throttle";
  cabGroup.add(throttleHandle);
  addCabBox(throttleHandle, 0.34, 0.085, 0.1, 0xffce2e, 0, 0, 0, "throttle");
  addCabSphere(throttleHandle, 0.07, 0xfff4a3, 0.15, 0.015, 0.035, "throttle");
  addCabLabel(cabGroup, "THROTTLE", 0.0, -0.72, -2.3, 0.72);

  const brakeGroup = new THREE.Group();
  brakeGroup.position.set(0.66, -1.08, -2.24);
  cabGroup.add(brakeGroup);
  const brakeStem = addCabBox(brakeGroup, 0.065, 0.38, 0.07, 0xd8edf8, 0, 0.02, 0, "brake");
  brakeStem.rotation.z = -0.24;
  addCabSphere(brakeGroup, 0.095, 0xf34848, 0.06, 0.22, 0.03, "brake");
  addCabLabel(cabGroup, "BRAKE", 0.68, -0.72, -2.28, 0.5);

  const hornButton = addCabCylinder(cabGroup, 0.16, 0.16, 0.08, 0xf34848, 1.22, -1.08, -2.24, "horn");
  const hornCap = addCabCylinder(cabGroup, 0.1, 0.1, 0.09, 0xfff28f, 1.22, -1.08, -2.18, "horn");
  addCabLabel(cabGroup, "HORN", 1.22, -0.72, -2.28, 0.48);

  const signalLight = addCabSphere(cabGroup, 0.035, 0x47c95b, -1.34, -1.2, -2.3);
  addCabSphere(cabGroup, 0.028, 0x63beff, -1.23, -1.2, -2.3);
  addCabSphere(cabGroup, 0.028, 0xffd85e, -1.12, -1.2, -2.3);

  return {
    group: cabGroup,
    speedNeedleGroup,
    throttleHandle,
    brakeGroup,
    hornButton,
    hornCap,
    signalLight,
    hornPressedUntil: 0,
    brakePressedUntil: 0,
  };
}

function addBoxToGroup(targetGroup, widthValue, heightValue, depthValue, colorValue, xValue, yValue, zValue, materialOptions = {}) {
  const boxMaterial = createToyMaterial(
    colorValue,
    materialOptions.roughness ?? 0.56,
    materialOptions.metalness ?? 0.03,
  );
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(widthValue, heightValue, depthValue), boxMaterial);
  boxMesh.position.set(xValue, yValue, zValue);
  if (materialOptions.rotationY) {
    boxMesh.rotation.y = materialOptions.rotationY;
  }
  if (materialOptions.rotationZ) {
    boxMesh.rotation.z = materialOptions.rotationZ;
  }
  targetGroup.add(boxMesh);
  return boxMesh;
}

function addCylinderToGroup(targetGroup, radiusTopValue, radiusBottomValue, heightValue, colorValue, xValue, yValue, zValue, radialSegmentsValue = 16, materialOptions = {}) {
  const cylinderMaterial = createToyMaterial(
    colorValue,
    materialOptions.roughness ?? 0.56,
    materialOptions.metalness ?? 0.03,
  );
  const cylinderMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTopValue, radiusBottomValue, heightValue, radialSegmentsValue),
    cylinderMaterial,
  );
  cylinderMesh.position.set(xValue, yValue, zValue);
  if (materialOptions.rotationX) {
    cylinderMesh.rotation.x = materialOptions.rotationX;
  }
  if (materialOptions.rotationZ) {
    cylinderMesh.rotation.z = materialOptions.rotationZ;
  }
  targetGroup.add(cylinderMesh);
  return cylinderMesh;
}

function addCylinderBetweenPoints(targetGroup, startVector, endVector, radiusValue, colorValue, radialSegmentsValue = 12, materialOptions = {}) {
  const cylinderDirection = endVector.clone().sub(startVector);
  const cylinderLength = cylinderDirection.length();
  const cylinderMaterial = createToyMaterial(
    colorValue,
    materialOptions.roughness ?? 0.5,
    materialOptions.metalness ?? 0.04,
  );
  const cylinderMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusValue, radiusValue, cylinderLength, radialSegmentsValue),
    cylinderMaterial,
  );
  const cylinderMidpoint = startVector.clone().add(endVector).multiplyScalar(0.5);
  cylinderMesh.position.copy(cylinderMidpoint);
  cylinderMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cylinderDirection.normalize());
  targetGroup.add(cylinderMesh);
  return cylinderMesh;
}

function addConeToGroup(targetGroup, radiusValue, heightValue, colorValue, xValue, yValue, zValue, radialSegmentsValue = 4, materialOptions = {}) {
  const coneMaterial = createToyMaterial(
    colorValue,
    materialOptions.roughness ?? 0.54,
    materialOptions.metalness ?? 0.03,
  );
  const coneMesh = new THREE.Mesh(new THREE.ConeGeometry(radiusValue, heightValue, radialSegmentsValue), coneMaterial);
  coneMesh.position.set(xValue, yValue, zValue);
  if (materialOptions.rotationY) {
    coneMesh.rotation.y = materialOptions.rotationY;
  }
  targetGroup.add(coneMesh);
  return coneMesh;
}

function addPlaqueToScene(labelTextValue, xValue, yValue, zValue, backgroundColor = "#ef4343", widthScale = 2.2) {
  const labelSprite = buildPlaque(labelTextValue, backgroundColor, "#ffffff");
  labelSprite.position.set(xValue, yValue, zValue);
  labelSprite.scale.set(widthScale, 0.6, 1);
  scene.add(labelSprite);
  return labelSprite;
}

function createCurveSegment(segmentName, pointTriples, closedValue = false) {
  const curvePoints = pointTriples.map(
    ([pointX, pointY, pointZ]) => new THREE.Vector3(pointX, pointY, pointZ),
  );
  const segmentCurve = new THREE.CatmullRomCurve3(curvePoints, closedValue, "centripetal", 0.18);

  return {
    name: segmentName,
    curve: segmentCurve,
    length: segmentCurve.getLength(),
  };
}

function sampleTrackFrames(trackCurve, spacingValue) {
  const sampledFrames = [];
  const curveLength = trackCurve.getLength();

  for (let distanceValue = 0; distanceValue <= curveLength + 0.0001; distanceValue += spacingValue) {
    const ratioValue = curveLength === 0 ? 0 : Math.min(distanceValue / curveLength, 1);
    const sampledPosition = trackCurve.getPointAt(ratioValue);
    const sampledTangent = trackCurve.getTangentAt(ratioValue).normalize();
    const sampledRight = new THREE.Vector3(sampledTangent.z, 0, -sampledTangent.x).normalize();

    if (sampledRight.lengthSq() < 0.001) {
      sampledRight.set(1, 0, 0);
    }

    sampledFrames.push({
      position: sampledPosition,
      tangent: sampledTangent,
      right: sampledRight,
      ratio: ratioValue,
      distance: distanceValue,
    });
  }

  return sampledFrames;
}

function getTrackOffsetFrame(trackCurve, ratioValue, lateralOffset, verticalOffset) {
  const trackPosition = trackCurve.getPointAt(ratioValue);
  const trackTangent = trackCurve.getTangentAt(ratioValue).normalize();
  const trackRight = new THREE.Vector3(trackTangent.z, 0, -trackTangent.x);

  if (trackRight.lengthSq() < 0.001) {
    trackRight.set(1, 0, 0);
  } else {
    trackRight.normalize();
  }

  const offsetPosition = trackPosition.clone().add(trackRight.clone().multiplyScalar(lateralOffset));
  offsetPosition.y += verticalOffset;

  return {
    position: offsetPosition,
    tangent: trackTangent,
    right: trackRight,
  };
}

function setYawRotationFromTangent(targetObject, tangentVector) {
  const flatTangent = new THREE.Vector3(tangentVector.x, 0, tangentVector.z);
  if (flatTangent.lengthSq() < 0.001) {
    targetObject.rotation.y = 0;
    return;
  }

  flatTangent.normalize();
  targetObject.rotation.y = Math.atan2(flatTangent.x, flatTangent.z);
}

function createStripMesh(curvePoints, stripWidth, stripHeight, stripColor, transparencyValue = 1) {
  const leftPoints = [];
  const rightPoints = [];

  curvePoints.forEach((curvePoint, pointIndex) => {
    const previousPoint = curvePoints[Math.max(0, pointIndex - 1)];
    const nextPoint = curvePoints[Math.min(curvePoints.length - 1, pointIndex + 1)];
    const travelVector = nextPoint.clone().sub(previousPoint).normalize();
    const lateralVector = new THREE.Vector3(travelVector.z, 0, -travelVector.x).normalize();
    const leftPoint = curvePoint.clone().add(lateralVector.clone().multiplyScalar(-stripWidth * 0.5));
    const rightPoint = curvePoint.clone().add(lateralVector.clone().multiplyScalar(stripWidth * 0.5));

    leftPoint.y += stripHeight;
    rightPoint.y += stripHeight;

    leftPoints.push(leftPoint);
    rightPoints.push(rightPoint);
  });

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  leftPoints.forEach((leftPoint, pointIndex) => {
    const rightPoint = rightPoints[pointIndex];
    positions.push(leftPoint.x, leftPoint.y, leftPoint.z);
    positions.push(rightPoint.x, rightPoint.y, rightPoint.z);
    normals.push(0, 1, 0, 0, 1, 0);

    const uvRatio = leftPoints.length <= 1 ? 0 : pointIndex / (leftPoints.length - 1);
    uvs.push(0, uvRatio, 1, uvRatio);
  });

  for (let indexValue = 0; indexValue < leftPoints.length - 1; indexValue += 1) {
    const baseIndex = indexValue * 2;
    indices.push(baseIndex, baseIndex + 2, baseIndex + 1);
    indices.push(baseIndex + 1, baseIndex + 2, baseIndex + 3);
  }

  const stripGeometry = new THREE.BufferGeometry();
  stripGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  stripGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  stripGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  stripGeometry.setIndex(indices);

  return new THREE.Mesh(
    stripGeometry,
    new THREE.MeshStandardMaterial({
      color: stripColor,
      roughness: 0.8,
      metalness: 0.02,
      transparent: transparencyValue < 1,
      opacity: transparencyValue,
    }),
  );
}

function createFinishedTrackBed(trackCurve, bedWidth = 2.08) {
  const bedPointCount = Math.max(168, Math.ceil(trackCurve.getLength() * 7.4));
  const bedPoints = trackCurve.getSpacedPoints(bedPointCount);
  const baseMesh = createStripMesh(bedPoints, bedWidth + 0.34, -0.29, toyPalette.trackBedSide, 1);
  baseMesh.material.roughness = 0.62;
  baseMesh.material.metalness = 0.02;
  baseMesh.renderOrder = -4;
  baseMesh.receiveShadow = true;
  scene.add(baseMesh);

  const deckMesh = createStripMesh(bedPoints, bedWidth, -0.21, toyPalette.trackBed, 1);
  deckMesh.material.roughness = 0.56;
  deckMesh.material.metalness = 0.02;
  deckMesh.renderOrder = -3;
  deckMesh.receiveShadow = true;
  scene.add(deckMesh);

  const lipMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.trackBedSide,
    roughness: 0.48,
    metalness: 0.03,
  });
  const centerInlayMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fdff,
    roughness: 0.5,
    metalness: 0.02,
  });
  addTrackTube(trackCurve, lipMaterial, -bedWidth * 0.5, 0.02, 0.055, 8, 5.8);
  addTrackTube(trackCurve, lipMaterial, bedWidth * 0.5, 0.02, 0.055, 8, 5.8);
  addTrackTube(trackCurve, centerInlayMaterial, 0, 0.015, 0.025, 6, 4.8);

  return deckMesh;
}

function createOffsetTrackCurve(trackCurve, lateralOffset, verticalOffset, sampleDensity = 6.8) {
  const sourceLength = trackCurve.getLength();
  const totalSamples = Math.max(36, Math.ceil(sourceLength * sampleDensity));
  const offsetPoints = [];
  const lastSampleIndex = trackCurve.closed ? totalSamples - 1 : totalSamples;

  for (let sampleIndex = 0; sampleIndex <= lastSampleIndex; sampleIndex += 1) {
    const sampleRatio = sampleIndex / totalSamples;
    const sourcePoint = trackCurve.getPointAt(sampleRatio);
    const tangentVector = trackCurve.getTangentAt(sampleRatio).normalize();
    const lateralVector = new THREE.Vector3(tangentVector.z, 0, -tangentVector.x);

    if (lateralVector.lengthSq() < 0.001) {
      lateralVector.set(1, 0, 0);
    } else {
      lateralVector.normalize();
    }

    const offsetPoint = sourcePoint.clone().add(lateralVector.multiplyScalar(lateralOffset));
    offsetPoint.y += verticalOffset;
    offsetPoints.push(offsetPoint);
  }

  return new THREE.CatmullRomCurve3(offsetPoints, trackCurve.closed, "centripetal", 0.08);
}

function addTrackTube(trackCurve, tubeMaterial, lateralOffset, verticalOffset, radiusValue, radialSegments, densityValue) {
  const tubeCurve = createOffsetTrackCurve(trackCurve, lateralOffset, verticalOffset, densityValue);
  const tubeSegments = Math.max(42, Math.ceil(trackCurve.getLength() * densityValue));
  const tubeGeometry = new THREE.TubeGeometry(tubeCurve, tubeSegments, radiusValue, radialSegments, trackCurve.closed);
  const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
  tubeMesh.castShadow = true;
  tubeMesh.receiveShadow = true;
  scene.add(tubeMesh);
  return tubeMesh;
}

function addContinuousRailDetails(trackCurve, railTubeMaterial) {
  addTrackTube(trackCurve, railTubeMaterial, -0.58, 0.28, 0.054, 10, 7.8);
  addTrackTube(trackCurve, railTubeMaterial, 0.58, 0.28, 0.054, 10, 7.8);
}

function createJunctionCollar(positionValue, radiusValue = 1.72) {
  const collarBaseMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.trackBedSide,
    roughness: 0.58,
    metalness: 0.02,
  });
  const collarTopMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.trackBed,
    roughness: 0.52,
    metalness: 0.02,
  });

  const collarBase = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusValue + 0.22, radiusValue + 0.22, 0.08, 36),
    collarBaseMaterial,
  );
  collarBase.position.set(positionValue.x, positionValue.y - 0.29, positionValue.z);
  collarBase.renderOrder = -4;
  scene.add(collarBase);

  const collarTop = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusValue, radiusValue, 0.06, 36),
    collarTopMaterial,
  );
  collarTop.position.set(positionValue.x, positionValue.y - 0.22, positionValue.z);
  collarTop.renderOrder = -3;
  scene.add(collarTop);
}

function syncSpeedReadout() {
  if (trainSpeedInput) {
    trainSpeedInput.value = appState.speedFactor.toFixed(2);
  }
  if (trainSpeedValue) {
    trainSpeedValue.textContent = `${appState.speedFactor.toFixed(2)}x`;
  }
  syncDriverCabControls();
}

function getSpeedControlRange() {
  return {
    min: Number(trainSpeedInput?.min ?? 0.55),
    max: Number(trainSpeedInput?.max ?? 1.85),
  };
}

function syncDriverCabControls() {
  if (!driverCab) {
    return;
  }
  const speedRange = getSpeedControlRange();
  const speedRatio = THREE.MathUtils.clamp(
    (appState.speedFactor - speedRange.min) / (speedRange.max - speedRange.min),
    0,
    1,
  );
  driverCab.throttleHandle.position.y = THREE.MathUtils.lerp(-1.23, -0.87, speedRatio);
  driverCab.speedNeedleGroup.rotation.z = THREE.MathUtils.lerp(-0.82, 0.82, speedRatio);
  driverCab.signalLight.material.color.set(appState.speedFactor > 1.04 ? 0x47c95b : 0xffd85e);
}

function setTrainSpeedFactor(nextSpeedFactor, options = {}) {
  const speedRange = getSpeedControlRange();
  const previousSpeedFactor = appState.speedFactor;
  appState.speedFactor = THREE.MathUtils.clamp(nextSpeedFactor, speedRange.min, speedRange.max);
  syncSpeedReadout();

  if (options.sound && Math.abs(appState.speedFactor - previousSpeedFactor) > 0.001) {
    playCabControlTone(appState.speedFactor > previousSpeedFactor ? "up" : "down");
  }
}

function getTrainAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }
  if (!trainAudioContext) {
    trainAudioContext = new AudioContextClass();
  }
  if (trainAudioContext.state === "suspended") {
    trainAudioContext.resume();
  }
  return trainAudioContext;
}

function playCabControlTone(directionValue) {
  const audioContext = getTrainAudioContext();
  if (!audioContext) {
    return;
  }

  const startTime = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(directionValue === "up" ? 360 : 230, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(directionValue === "up" ? 520 : 160, startTime + 0.12);
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.08, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.16);
  oscillator.connect(gainNode).connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + 0.18);
}

function playTrainHorn() {
  const audioContext = getTrainAudioContext();
  if (driverCab) {
    driverCab.hornPressedUntil = latestElapsedTime + 0.24;
  }
  if (!audioContext) {
    return;
  }

  const startTime = audioContext.currentTime;
  [0, 0.06].forEach((delayValue, oscillatorIndex) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(oscillatorIndex === 0 ? 220 : 294, startTime + delayValue);
    oscillator.frequency.linearRampToValueAtTime(oscillatorIndex === 0 ? 205 : 278, startTime + 0.62 + delayValue);
    gainNode.gain.setValueAtTime(0.0001, startTime + delayValue);
    gainNode.gain.exponentialRampToValueAtTime(0.11, startTime + 0.08 + delayValue);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.74 + delayValue);
    oscillator.connect(gainNode).connect(audioContext.destination);
    oscillator.start(startTime + delayValue);
    oscillator.stop(startTime + 0.8 + delayValue);
  });
}

function updateCabPointer(eventValue) {
  const canvasRect = renderer.domElement.getBoundingClientRect();
  cabPointer.x = ((eventValue.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
  cabPointer.y = -((eventValue.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
}

function getCabIntersection(eventValue) {
  if (!appState.povTrainActive || !driverCab?.group.visible) {
    return null;
  }
  updateCabPointer(eventValue);
  cabRaycaster.setFromCamera(cabPointer, camera);
  return cabRaycaster.intersectObjects(cabInteractiveMeshes, false)[0] ?? null;
}

function handleCabPointerDown(eventValue) {
  const cabHit = getCabIntersection(eventValue);
  if (!cabHit) {
    return;
  }

  const controlName = cabHit.object.userData.cabControl;
  eventValue.preventDefault();
  eventValue.stopPropagation();

  if (controlName === "horn") {
    playTrainHorn();
    return;
  }

  if (controlName === "brake") {
    driverCab.brakePressedUntil = latestElapsedTime + 0.28;
    setTrainSpeedFactor(appState.speedFactor - 0.22, { sound: true });
    return;
  }

  if (controlName === "throttle") {
    cabDragState.activeControl = "throttle";
    cabDragState.pointerId = eventValue.pointerId;
    cabDragState.startY = eventValue.clientY;
    cabDragState.startSpeed = appState.speedFactor;
    if (renderer.domElement.setPointerCapture) {
      renderer.domElement.setPointerCapture(eventValue.pointerId);
    }
    renderer.domElement.style.cursor = "grabbing";
  }
}

function handleCabPointerMove(eventValue) {
  if (cabDragState.activeControl === "throttle") {
    const dragDelta = (cabDragState.startY - eventValue.clientY) / 160;
    setTrainSpeedFactor(cabDragState.startSpeed + dragDelta * 1.25);
    eventValue.preventDefault();
    return;
  }

  const cabHit = getCabIntersection(eventValue);
  renderer.domElement.style.cursor = cabHit ? "pointer" : "";
}

function finishCabDrag(eventValue) {
  if (!cabDragState.activeControl) {
    return;
  }
  if (
    renderer.domElement.releasePointerCapture &&
    renderer.domElement.hasPointerCapture?.(cabDragState.pointerId)
  ) {
    renderer.domElement.releasePointerCapture(cabDragState.pointerId);
  }
  cabDragState.activeControl = null;
  cabDragState.pointerId = null;
  renderer.domElement.style.cursor = "";
  setTrainSpeedFactor(appState.speedFactor, { sound: true });
  eventValue?.preventDefault();
}

function addWindowGrid(centerX, centerY, centerZ, spanWidth, spanHeight, columns, rows, normalVector, paneColor) {
  addWindowGridOnAxes(
    new THREE.Vector3(centerX, centerY, centerZ),
    new THREE.Vector3(1, 0, 0),
    spanWidth,
    spanHeight,
    columns,
    rows,
    normalVector,
    paneColor,
  );
}

function addWindowGridOnAxes(centerVector, horizontalVector, spanWidth, spanHeight, columns, rows, normalVector, paneColor) {
  const normalizedHorizontal = horizontalVector.clone().normalize();
  const paneQuaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normalVector.clone().normalize(),
  );

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const horizontalRatio = columns === 1 ? 0 : columnIndex / (columns - 1) - 0.5;
      const verticalRatio = rows === 1 ? 0 : rowIndex / (rows - 1) - 0.5;
      const panePosition = centerVector.clone()
        .add(normalizedHorizontal.clone().multiplyScalar(horizontalRatio * spanWidth))
        .add(new THREE.Vector3(0, verticalRatio * spanHeight, 0));
      const paneMatrix = composeMatrixFromPosition(
        panePosition,
        paneQuaternion,
        new THREE.Vector3(0.26, 0.28, 0.08),
      );
      pushColoredMatrix(instanceStore.windowMatrices, instanceStore.windowColors, paneMatrix, paneColor);
    }
  }
}

function transformLocalXZ(originX, originZ, rotationY, localX, localZ) {
  const cosValue = Math.cos(rotationY);
  const sinValue = Math.sin(rotationY);
  return new THREE.Vector3(
    originX + localX * cosValue + localZ * sinValue,
    0,
    originZ - localX * sinValue + localZ * cosValue,
  );
}

function rotatedHorizontalAxis(rotationY) {
  return new THREE.Vector3(Math.cos(rotationY), 0, -Math.sin(rotationY));
}

function rotatedNormalAxis(rotationY) {
  return new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
}

function createPlayroomBase() {
  const baseGroup = new THREE.Group();

  const floorMesh = new THREE.Mesh(
    new THREE.CircleGeometry(100, 64),
    new THREE.MeshStandardMaterial({
      color: 0xd7e9f6,
      roughness: 1,
      metalness: 0,
    }),
  );
  visualRefs.roomFloorMaterials.push(floorMesh.material);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -16.1;
  baseGroup.add(floorMesh);

  const rugMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(13.6, 13.6, 0.18, 56),
    new THREE.MeshStandardMaterial({
      color: 0xcce9f5,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.68,
    }),
  );
  visualRefs.rugMaterials.push(rugMesh.material);
  rugMesh.scale.set(1.24, 1, 0.72);
  rugMesh.position.set(9, -15.98, 7.5);
  baseGroup.add(rugMesh);

  const tableMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.wood,
    roughness: 0.82,
    metalness: 0.02,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x7a4426,
    roughness: 0.74,
    metalness: 0.02,
  });
  const feltMaterial = new THREE.MeshStandardMaterial({
    color: 0x76d95c,
    roughness: 0.94,
    metalness: 0.01,
  });
  visualRefs.tableMaterials.push(tableMaterial);
  visualRefs.tableTrimMaterials.push(trimMaterial);
  visualRefs.grassMaterials.push(feltMaterial);

  const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(72, 3.2, 52), tableMaterial);
  slabMesh.position.set(0, -1.7, 0);
  baseGroup.add(slabMesh);

  const feltMesh = new THREE.Mesh(new THREE.BoxGeometry(66.2, 0.65, 44.2), feltMaterial);
  feltMesh.position.set(0, 0.34, 0);
  baseGroup.add(feltMesh);

  const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(72, 1.22, 1.32), trimMaterial);
  frontTrim.position.set(0, 0.3, 25.35);
  baseGroup.add(frontTrim);

  const backTrim = frontTrim.clone();
  backTrim.position.z = -25.35;
  baseGroup.add(backTrim);

  const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(1.32, 1.22, 49.2), trimMaterial);
  sideTrim.position.set(-35.35, 0.3, 0);
  baseGroup.add(sideTrim);

  const oppositeSideTrim = sideTrim.clone();
  oppositeSideTrim.position.x = 35.35;
  baseGroup.add(oppositeSideTrim);

  const legGeometry = new THREE.BoxGeometry(2.4, 14, 2.4);
  const legPositions = [
    [-30, -9.1, -20],
    [30, -9.1, -20],
    [-30, -9.1, 20],
    [30, -9.1, 20],
  ];

  legPositions.forEach(([legX, legY, legZ]) => {
    const legMesh = new THREE.Mesh(legGeometry, tableMaterial);
    legMesh.position.set(legX, legY, legZ);
    baseGroup.add(legMesh);
  });

  scene.add(baseGroup);
}

function createRiverShip(riverCurve, options = {}) {
  const shipGroup = new THREE.Group();
  const hullColor = options.hullColor ?? toyPalette.red;
  const roofColor = options.roofColor ?? toyPalette.yellow;
  const flagColor = options.flagColor ?? toyPalette.trackSignal;

  addBoxToGroup(shipGroup, 1.84, 0.28, 0.62, hullColor, 0, 0.18, 0, { roughness: 0.38, metalness: 0.03 });
  addBoxToGroup(shipGroup, 0.62, 0.2, 0.66, hullColor, 0, 0.2, -0.52, { roughness: 0.34, metalness: 0.03 });
  addBoxToGroup(shipGroup, 0.52, 0.18, 0.54, hullColor, 0, 0.22, 0.54, { roughness: 0.34, metalness: 0.03 });
  addBoxToGroup(shipGroup, 1.28, 0.22, 0.5, 0xffffff, 0, 0.42, -0.12, { roughness: 0.22, metalness: 0.02 });
  addBoxToGroup(shipGroup, 1.36, 0.12, 0.58, roofColor, 0, 0.62, -0.12, { roughness: 0.32, metalness: 0.03 });
  addBoxToGroup(shipGroup, 0.18, 0.54, 0.18, toyPalette.darkBlue, 0, 0.66, 0.5, { roughness: 0.42, metalness: 0.04 });
  addBoxToGroup(shipGroup, 0.52, 0.2, 0.05, hullColor, 0.29, 0.86, 0.5, { roughness: 0.34, metalness: 0.02 });
  addCylinderToGroup(shipGroup, 0.055, 0.055, 0.92, toyPalette.cream, -0.52, 0.72, 0.26, 10, { roughness: 0.38 });
  addBoxToGroup(shipGroup, 0.34, 0.2, 0.035, flagColor, -0.34, 1.04, 0.26, { roughness: 0.34, metalness: 0.02 });

  [-0.42, 0, 0.42].forEach((windowX) => {
    addBoxToGroup(shipGroup, 0.18, 0.14, 0.04, toyPalette.trackSignal, windowX, 0.44, -0.39, { roughness: 0.2 });
  });

  [-0.96, 0.96].forEach((sideX) => {
    const lifebuoyMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.028, 8, 18),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xff4f68,
        emissiveIntensity: 0.12,
        roughness: 0.32,
        metalness: 0.02,
      }),
    );
    lifebuoyMesh.position.set(sideX, 0.38, -0.06);
    lifebuoyMesh.rotation.y = Math.PI * 0.5;
    shipGroup.add(lifebuoyMesh);
  });

  const cabinLightMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 8),
    new THREE.MeshStandardMaterial({
      color: 0xfff2a7,
      emissive: 0xffdc6c,
      emissiveIntensity: 0.54,
      roughness: 0.18,
      metalness: 0.02,
    }),
  );
  cabinLightMesh.position.set(0, 0.74, -0.12);
  shipGroup.add(cabinLightMesh);

  const wakeMaterial = new THREE.MeshBasicMaterial({
    color: 0xd8f7ff,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const wakeMeshes = [-0.32, 0.32].map((wakeX) => {
    const wakeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.18), wakeMaterial.clone());
    wakeMesh.position.set(wakeX, 0.03, -0.92);
    wakeMesh.rotation.x = -Math.PI * 0.5;
    wakeMesh.rotation.z = wakeX < 0 ? -0.16 : 0.16;
    shipGroup.add(wakeMesh);
    return wakeMesh;
  });

  scene.add(shipGroup);
  riverShipRecords.push({
    group: shipGroup,
    curve: riverCurve,
    ratio: options.ratio ?? 0,
    speed: options.speed ?? 0.016,
    bobPhase: options.bobPhase ?? 0,
    scale: options.scale ?? 1,
    wakeMeshes,
  });
}

function createMilitaryShip(riverCurve) {
  const shipRatio = 0.7;
  const riverPosition = riverCurve.getPointAt(shipRatio);
  const riverTangent = riverCurve.getTangentAt(shipRatio).normalize();
  const riverRight = new THREE.Vector3(riverTangent.z, 0, -riverTangent.x).normalize();
  const shipGroup = new THREE.Group();
  shipGroup.position.copy(riverPosition).add(riverRight.multiplyScalar(0.85));
  shipGroup.position.y = waterSurfaceY + 0.24;
  setYawRotationFromTangent(shipGroup, riverTangent);
  shipGroup.scale.setScalar(1.14);

  const hullColor = 0x71869a;
  const deckColor = 0xc8d4de;
  const darkNavy = 0x18355e;
  addBoxToGroup(shipGroup, 1.04, 0.34, 4.7, hullColor, 0, 0.18, 0, { roughness: 0.46, metalness: 0.05 });
  addBoxToGroup(shipGroup, 0.74, 0.24, 0.96, hullColor, 0, 0.18, -2.15, { roughness: 0.46, metalness: 0.05 });
  addBoxToGroup(shipGroup, 0.74, 0.24, 0.96, hullColor, 0, 0.18, 2.15, { roughness: 0.46, metalness: 0.05 });
  addBoxToGroup(shipGroup, 0.9, 0.11, 4.2, deckColor, 0, 0.42, 0, { roughness: 0.32, metalness: 0.04 });
  addBoxToGroup(shipGroup, 0.56, 0.46, 0.82, 0xe7eef4, 0, 0.73, -0.2, { roughness: 0.36, metalness: 0.03 });
  addBoxToGroup(shipGroup, 0.42, 0.34, 0.62, deckColor, 0, 1.1, 0.08, { roughness: 0.34, metalness: 0.04 });
  addCylinderToGroup(shipGroup, 0.04, 0.04, 1.45, darkNavy, 0, 1.55, 0.42, 10, { roughness: 0.32, metalness: 0.06 });
  addBoxToGroup(shipGroup, 0.44, 0.18, 0.035, toyPalette.red, 0.22, 2.12, 0.42, { roughness: 0.3, metalness: 0.02 });

  [-1.42, 1.42].forEach((turretZ) => {
    addCylinderToGroup(shipGroup, 0.21, 0.23, 0.14, deckColor, 0, 0.58, turretZ, 18, {
      roughness: 0.34,
      metalness: 0.06,
    });
    addBoxToGroup(shipGroup, 0.1, 0.08, 0.78, darkNavy, 0, 0.65, turretZ + (turretZ < 0 ? -0.42 : 0.42), {
      roughness: 0.3,
      metalness: 0.08,
    });
  });

  [-0.36, 0.36].forEach((sideX) => {
    [-1.95, -0.72, 0.76, 1.95].forEach((portholeZ) => {
      const portholeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 8),
        new THREE.MeshStandardMaterial({
          color: 0xd8f7ff,
          emissive: 0x63beff,
          emissiveIntensity: 0.2,
          roughness: 0.18,
          metalness: 0.03,
        }),
      );
      portholeMesh.position.set(sideX, 0.28, portholeZ);
      shipGroup.add(portholeMesh);
    });
  });

  const wakeMaterial = new THREE.MeshBasicMaterial({
    color: 0xd8f7ff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  [-0.46, 0.46].forEach((wakeX) => {
    const wakeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 2.2), wakeMaterial.clone());
    wakeMesh.position.set(wakeX, 0.02, 2.95);
    wakeMesh.rotation.x = -Math.PI * 0.5;
    wakeMesh.rotation.z = wakeX < 0 ? -0.08 : 0.08;
    shipGroup.add(wakeMesh);
  });

  scene.add(shipGroup);
}

function createRiverAndRoads() {
  const riverCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-28, 0, 8.1),
      new THREE.Vector3(-18, 0, 5.9),
      new THREE.Vector3(-8.2, 0, 3.2),
      new THREE.Vector3(0, 0, -0.1),
      new THREE.Vector3(9.8, 0, -2.7),
      new THREE.Vector3(20.6, 0, -4.65),
      new THREE.Vector3(28.5, 0, -4.1),
    ],
    false,
    "catmullrom",
    0.14,
  );

  const riverPoints = riverCurve.getSpacedPoints(96);
  const outerBankMesh = createStripMesh(riverPoints, 10.8, tableSurfaceY + 0.02, 0x4fc85e);
  const promenadeMesh = createStripMesh(riverPoints, 8.3, tableSurfaceY + 0.07, 0xffa24c);
  const riverMesh = createStripMesh(riverPoints, 7.2, waterSurfaceY, toyPalette.river, 1);
  visualRefs.riverBankMaterials.push(outerBankMesh.material);
  visualRefs.promenadeMaterials.push(promenadeMesh.material);
  visualRefs.waterMaterials.push(riverMesh.material);
  scene.add(outerBankMesh);
  scene.add(promenadeMesh);
  scene.add(riverMesh);

  const waterDetailGroup = new THREE.Group();
  const rippleMaterial = new THREE.MeshStandardMaterial({
    color: 0x38caec,
    emissive: 0x0aa7e2,
    emissiveIntensity: 0.04,
    roughness: 0.34,
    metalness: 0.02,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const waveMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9fbff,
    emissive: 0xb8f7ff,
    emissiveIntensity: 0.08,
    roughness: 0.18,
    metalness: 0.02,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
  });
  visualRefs.waterMaterials.push(rippleMaterial, waveMaterial);

  for (let rippleIndex = 0; rippleIndex < 30; rippleIndex += 1) {
    const rippleRatio = 0.035 + rippleIndex * 0.032;
    const ripplePosition = riverCurve.getPointAt(rippleRatio);
    const rippleTangent = riverCurve.getTangentAt(rippleRatio).normalize();
    const rippleRight = new THREE.Vector3(rippleTangent.z, 0, -rippleTangent.x).normalize();
    const rippleSideOffset = (((rippleIndex * 2) % 5) - 2) * 0.72;
    const rippleFinalPosition = ripplePosition.clone().add(rippleRight.clone().multiplyScalar(rippleSideOffset));
    const rippleLength = 0.92 + (rippleIndex % 4) * 0.28;
    const rippleMesh = new THREE.Mesh(new THREE.BoxGeometry(rippleLength, 0.018, 0.08), rippleMaterial);
    rippleMesh.position.set(rippleFinalPosition.x, waterSurfaceY + 0.095, rippleFinalPosition.z);
    rippleMesh.rotation.y = Math.atan2(rippleTangent.x, rippleTangent.z);
    rippleMesh.renderOrder = 2;
    waterDetailGroup.add(rippleMesh);
  }

  for (let waveIndex = 0; waveIndex < 24; waveIndex += 1) {
    const waveRatio = 0.05 + waveIndex * 0.039;
    const wavePosition = riverCurve.getPointAt(waveRatio);
    const waveTangent = riverCurve.getTangentAt(waveRatio).normalize();
    const waveRight = new THREE.Vector3(waveTangent.z, 0, -waveTangent.x).normalize();
    const waveSideOffset = ((waveIndex % 3) - 1) * 1.15;
    const waveFinalPosition = wavePosition.clone().add(waveRight.multiplyScalar(waveSideOffset));
    const waveMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.055), waveMaterial);
    waveMesh.position.set(waveFinalPosition.x, waterSurfaceY + 0.125, waveFinalPosition.z);
    waveMesh.rotation.y = Math.atan2(waveTangent.x, waveTangent.z);
    waveMesh.renderOrder = 3;
    waterDetailGroup.add(waveMesh);
  }

  scene.add(waterDetailGroup);

  sunsetReflectionGroup = new THREE.Group();
  const reflectionColors = [0xffd43f, 0xff8d2e, 0xff4f68];
  for (let reflectionIndex = 0; reflectionIndex < 18; reflectionIndex += 1) {
    const reflectionRatio = 0.16 + reflectionIndex * 0.035;
    const reflectionPosition = riverCurve.getPointAt(reflectionRatio);
    const reflectionTangent = riverCurve.getTangentAt(reflectionRatio).normalize();
    const reflectionRight = new THREE.Vector3(reflectionTangent.z, 0, -reflectionTangent.x).normalize();
    const reflectionSideOffset = ((reflectionIndex % 5) - 2) * 0.42;
    const reflectionFinalPosition = reflectionPosition.clone().add(reflectionRight.multiplyScalar(reflectionSideOffset));
    const reflectionMaterial = new THREE.MeshBasicMaterial({
      color: reflectionColors[reflectionIndex % reflectionColors.length],
      transparent: true,
      opacity: 0.38 - (reflectionIndex % 3) * 0.045,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const reflectionMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9 + (reflectionIndex % 4) * 0.55, 0.12),
      reflectionMaterial,
    );
    reflectionMesh.position.set(reflectionFinalPosition.x, waterSurfaceY + 0.155, reflectionFinalPosition.z);
    reflectionMesh.rotation.x = -Math.PI * 0.5;
    reflectionMesh.rotation.y = Math.atan2(reflectionTangent.x, reflectionTangent.z);
    reflectionMesh.renderOrder = 5;
    sunsetReflectionGroup.add(reflectionMesh);
  }
  scene.add(registerAtmosphereLayer(sunsetReflectionGroup, { golden: 0.95 }));

  for (let treeLineIndex = 0; treeLineIndex < 26; treeLineIndex += 1) {
    const treeLineRatio = 0.04 + treeLineIndex * 0.036;
    const treeLinePosition = riverCurve.getPointAt(treeLineRatio);
    const treeLineTangent = riverCurve.getTangentAt(treeLineRatio).normalize();
    const treeLineRight = new THREE.Vector3(treeLineTangent.z, 0, -treeLineTangent.x).normalize();
    const treeLineSide = treeLineIndex % 2 === 0 ? -1 : 1;
    const treeLineOffset = 5.3 + (treeLineIndex % 3) * 0.24;
    const treeLineFinalPosition = treeLinePosition.clone().add(treeLineRight.multiplyScalar(treeLineSide * treeLineOffset));
    const trunkHeight = 0.95 + (treeLineIndex % 4) * 0.14;
    const riverTreeTrunkMatrix = composeMatrixFromPosition(
      new THREE.Vector3(treeLineFinalPosition.x, tableSurfaceY + trunkHeight * 0.5, treeLineFinalPosition.z),
      new THREE.Quaternion(),
      new THREE.Vector3(0.2, trunkHeight, 0.2),
    );
    pushMatrix(instanceStore.treeTrunkMatrices, riverTreeTrunkMatrix);

    const canopyScale = 0.9 + (treeLineIndex % 3) * 0.11;
    const riverTreeCanopyMatrix = composeMatrixFromPosition(
      new THREE.Vector3(treeLineFinalPosition.x, tableSurfaceY + 0.9 + trunkHeight * 0.36, treeLineFinalPosition.z),
      new THREE.Quaternion(),
      new THREE.Vector3(canopyScale, canopyScale * 0.9, canopyScale),
    );
    pushColoredMatrix(
      instanceStore.treeCanopyMatrices,
      instanceStore.treeCanopyColors,
      riverTreeCanopyMatrix,
      treeLineIndex % 2 === 0 ? toyPalette.park : toyPalette.grass,
    );
  }

  const roadCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-22, 0, 13),
      new THREE.Vector3(-15, 0, 14.5),
      new THREE.Vector3(-3, 0, 13.8),
      new THREE.Vector3(9, 0, 13),
      new THREE.Vector3(18, 0, 9.5),
      new THREE.Vector3(22, 0, 2),
      new THREE.Vector3(20, 0, -7),
      new THREE.Vector3(11, 0, -12),
      new THREE.Vector3(-2, 0, -13.5),
      new THREE.Vector3(-15, 0, -10),
      new THREE.Vector3(-21, 0, -3),
    ],
    true,
    "catmullrom",
    0.16,
  );
  const roadMesh = createStripMesh(roadCurve.getSpacedPoints(84), 2.7, tableSurfaceY + 0.045, 0xaebfd1);
  scene.add(roadMesh);

  const boatPositions = [0.22, 0.68];
  boatPositions.forEach((ratioValue, boatIndex) => {
    const boatPosition = riverCurve.getPointAt(ratioValue);
    const boatMatrix = composeMatrixFromPosition(
      new THREE.Vector3(boatPosition.x, waterSurfaceY + 0.16, boatPosition.z),
      new THREE.Quaternion(),
      new THREE.Vector3(1.2, 0.28, 0.56),
    );
    pushColoredMatrix(
      instanceStore.boatBodyMatrices,
      instanceStore.boatBodyColors,
      boatMatrix,
      boatIndex === 0 ? toyPalette.red : toyPalette.yellow,
    );

    const boatCabinMatrix = composeMatrixFromPosition(
      new THREE.Vector3(boatPosition.x, waterSurfaceY + 0.44, boatPosition.z),
      new THREE.Quaternion(),
      new THREE.Vector3(0.52, 0.26, 0.38),
    );
    pushMatrix(instanceStore.boatCabinMatrices, boatCabinMatrix);

    boatAnimationRecords.push({
      ratio: ratioValue,
      speed: boatIndex === 0 ? 0.017 : 0.012,
      bodyIndex: boatIndex,
      cabinIndex: boatIndex,
      curve: riverCurve,
    });
  });

  createRiverShip(riverCurve, {
    ratio: 0.06,
    speed: 0.018,
    hullColor: toyPalette.red,
    roofColor: toyPalette.yellow,
    flagColor: toyPalette.trackSignal,
    bobPhase: 0.2,
    scale: 1.05,
  });
  createRiverShip(riverCurve, {
    ratio: 0.42,
    speed: 0.014,
    hullColor: toyPalette.blue,
    roofColor: 0xffffff,
    flagColor: toyPalette.red,
    bobPhase: 1.7,
    scale: 0.92,
  });
  createRiverShip(riverCurve, {
    ratio: 0.78,
    speed: 0.011,
    hullColor: 0xff8d55,
    roofColor: toyPalette.trackSignal,
    flagColor: toyPalette.yellow,
    bobPhase: 3.1,
    scale: 0.84,
  });
  createMilitaryShip(riverCurve);
}

function createParkPatch(centerX, centerZ, spanX, spanZ, treeCount, withFlowers = true) {
  const patchMesh = new THREE.Mesh(
    new THREE.BoxGeometry(spanX, 0.18, spanZ),
    new THREE.MeshStandardMaterial({
      color: toyPalette.park,
      roughness: 0.96,
      metalness: 0.01,
    }),
  );
  visualRefs.parkMaterials.push(patchMesh.material);
  patchMesh.position.set(centerX, parkSurfaceY, centerZ);
  scene.add(patchMesh);

  const parkBorderMaterial = createToyMaterial(0x208f3f, 0.86, 0.01);
  visualRefs.parkBorderMaterials.push(parkBorderMaterial);
  const parkBorderY = parkSurfaceY + 0.14;
  const horizontalBorderDepth = 0.16;
  const verticalBorderWidth = 0.16;
  const northBorderMesh = new THREE.Mesh(new THREE.BoxGeometry(spanX, 0.05, horizontalBorderDepth), parkBorderMaterial);
  northBorderMesh.position.set(centerX, parkBorderY, centerZ - spanZ * 0.5);
  scene.add(northBorderMesh);
  const southBorderMesh = northBorderMesh.clone();
  southBorderMesh.position.z = centerZ + spanZ * 0.5;
  scene.add(southBorderMesh);
  const westBorderMesh = new THREE.Mesh(new THREE.BoxGeometry(verticalBorderWidth, 0.05, spanZ), parkBorderMaterial);
  westBorderMesh.position.set(centerX - spanX * 0.5, parkBorderY, centerZ);
  scene.add(westBorderMesh);
  const eastBorderMesh = westBorderMesh.clone();
  eastBorderMesh.position.x = centerX + spanX * 0.5;
  scene.add(eastBorderMesh);

  for (let treeIndex = 0; treeIndex < treeCount; treeIndex += 1) {
    const horizontalRatio = treeCount <= 1 ? 0.5 : treeIndex / (treeCount - 1);
    const treePositionX = centerX - spanX * 0.34 + horizontalRatio * spanX * 0.68;
    const treePositionZ = centerZ + Math.sin(horizontalRatio * Math.PI * 2.8) * spanZ * 0.24;
    const trunkHeight = 1.1 + (treeIndex % 3) * 0.18;
    const canopyScale = 1.05 + (treeIndex % 2) * 0.18;

    const trunkMatrix = composeMatrixFromPosition(
      new THREE.Vector3(treePositionX, tableSurfaceY + trunkHeight * 0.5, treePositionZ),
      new THREE.Quaternion(),
      new THREE.Vector3(0.22, trunkHeight, 0.22),
    );
    pushMatrix(instanceStore.treeTrunkMatrices, trunkMatrix);

    const canopyMatrix = composeMatrixFromPosition(
      new THREE.Vector3(treePositionX, tableSurfaceY + 1.0 + trunkHeight * 0.4, treePositionZ),
      new THREE.Quaternion(),
      new THREE.Vector3(canopyScale, canopyScale * 0.92, canopyScale),
    );
    pushColoredMatrix(
      instanceStore.treeCanopyMatrices,
      instanceStore.treeCanopyColors,
      canopyMatrix,
      treeIndex % 2 === 0 ? 0x68cb5a : 0x85df66,
    );
  }

  if (withFlowers) {
    for (let flowerIndex = 0; flowerIndex < 14; flowerIndex += 1) {
      const flowerOffsetX = centerX + (Math.sin(flowerIndex * 1.7) * spanX) / 3.3;
      const flowerOffsetZ = centerZ + (Math.cos(flowerIndex * 1.4) * spanZ) / 3.4;
      const stemMatrix = composeMatrixFromPosition(
        new THREE.Vector3(flowerOffsetX, tableSurfaceY + 0.28, flowerOffsetZ),
        new THREE.Quaternion(),
        new THREE.Vector3(0.06, 0.55, 0.06),
      );
      pushMatrix(instanceStore.flowerStemMatrices, stemMatrix);

      const flowerMatrix = composeMatrixFromPosition(
        new THREE.Vector3(flowerOffsetX, tableSurfaceY + 0.58, flowerOffsetZ),
        new THREE.Quaternion(),
        new THREE.Vector3(0.18, 0.18, 0.18),
      );
      const flowerColor = [toyPalette.flowerPink, toyPalette.flowerBlue, toyPalette.flowerYellow][flowerIndex % 3];
      pushColoredMatrix(instanceStore.flowerHeadMatrices, instanceStore.flowerHeadColors, flowerMatrix, flowerColor);
    }
  }
}

function addBench(centerX, centerZ, rotationY) {
  const benchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
  const legOffsets = [-0.48, 0.48];

  legOffsets.forEach((offsetValue) => {
    const legPosition = new THREE.Vector3(centerX + Math.cos(rotationY) * offsetValue, tableSurfaceY + 0.18, centerZ + Math.sin(rotationY) * offsetValue);
    const legMatrix = composeMatrixFromPosition(legPosition, benchQuaternion, new THREE.Vector3(0.08, 0.36, 0.28));
    pushMatrix(instanceStore.benchLegMatrices, legMatrix);
  });

  const seatMatrix = composeMatrixFromPosition(
    new THREE.Vector3(centerX, tableSurfaceY + 0.39, centerZ),
    benchQuaternion,
    new THREE.Vector3(1.08, 0.08, 0.34),
  );
  pushMatrix(instanceStore.benchSeatMatrices, seatMatrix);
}

function addLamp(centerX, centerZ) {
  const postMatrix = composeMatrixFromPosition(
    new THREE.Vector3(centerX, tableSurfaceY + 1.05, centerZ),
    new THREE.Quaternion(),
    new THREE.Vector3(0.1, 2.1, 0.1),
  );
  pushMatrix(instanceStore.lampPostMatrices, postMatrix);

  const headMatrix = composeMatrixFromPosition(
    new THREE.Vector3(centerX, tableSurfaceY + 2.23, centerZ),
    new THREE.Quaternion(),
    new THREE.Vector3(0.24, 0.24, 0.24),
  );
  pushColoredMatrix(instanceStore.lampHeadMatrices, instanceStore.lampHeadColors, headMatrix, 0xfff2a7);
}

function addTownhouse(centerX, centerZ, bodyColor, roofColor) {
  const houseMatrix = composeMatrixFromPosition(
    new THREE.Vector3(centerX, 1.1, centerZ),
    new THREE.Quaternion(),
    new THREE.Vector3(1.6, 2.0, 1.55),
  );
  pushColoredMatrix(instanceStore.houseBodyMatrices, instanceStore.houseBodyColors, houseMatrix, bodyColor);

  const roofMatrix = composeMatrixFromPosition(
    new THREE.Vector3(centerX, 2.28, centerZ),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI * 0.25),
    new THREE.Vector3(1.52, 0.24, 1.3),
  );
  pushColoredMatrix(instanceStore.houseRoofMatrices, instanceStore.houseRoofColors, roofMatrix, roofColor);

  addWindowGrid(centerX, 1.35, centerZ + 0.78, 0.9, 0.9, 2, 3, new THREE.Vector3(0, 0, 1), 0xffef9f);
}

function createNeighborhoods() {
  const rowOneColors = [
    [0xffcf7f, 0x4f97ef],
    [0xf39a79, 0xef4343],
    [0x7ad1f8, 0xf6c644],
    [0xffe29a, 0x61c754],
  ];
  const rowTwoColors = [
    [0x9ad9ff, 0x4f97ef],
    [0xffb67b, 0xef4343],
    [0xffe18a, 0x71cf61],
    [0xffd59b, 0xf6c644],
  ];

  rowOneColors.forEach(([bodyColor, roofColor], rowIndex) => {
    addTownhouse(-7 + rowIndex * 2.1, 11.4, bodyColor, roofColor);
    addTownhouse(19.4 + rowIndex * 1.85, 12.8, bodyColor, roofColor);
  });

  rowTwoColors.forEach(([bodyColor, roofColor], rowIndex) => {
    addTownhouse(-16 + rowIndex * 2.15, -8.5, bodyColor, roofColor);
  });

  [
    [-12, 11.4, 0.25],
    [-3.4, 11.2, -0.2],
    [8.8, 9.2, 0.25],
    [21.0, 11.1, -0.3],
    [-17.8, -8.1, 0.6],
    [-9.6, -8.1, -0.4],
  ].forEach(([benchX, benchZ, rotationValue]) => {
    addBench(benchX, benchZ, rotationValue);
  });

  [
    [-18, 12.5],
    [-10, 12.8],
    [-2, 12.4],
    [8, 10.8],
    [20.8, 11.5],
    [24.4, 12.1],
    [-18, -9.6],
    [-10.5, -9.9],
  ].forEach(([lampX, lampZ]) => {
    addLamp(lampX, lampZ);
  });
}

function createToyBus(centerX, centerZ, rotationY, labelTextValue = null) {
  const busGroup = new THREE.Group();
  busGroup.position.set(centerX, 0.42, centerZ);
  busGroup.rotation.y = rotationY;

  addBoxToGroup(busGroup, 2.35, 0.65, 0.82, toyPalette.red, 0, 0.42, 0, { roughness: 0.46 });
  addBoxToGroup(busGroup, 2.16, 0.55, 0.78, toyPalette.red, 0, 1.02, 0, { roughness: 0.46 });
  addBoxToGroup(busGroup, 1.72, 0.12, 0.86, toyPalette.yellow, 0.02, 1.35, 0, { roughness: 0.38 });
  [-0.7, 0, 0.7].forEach((windowOffset) => {
    addBoxToGroup(busGroup, 0.34, 0.23, 0.04, 0xe9fbff, windowOffset, 1.05, 0.42, { roughness: 0.2 });
    addBoxToGroup(busGroup, 0.34, 0.23, 0.04, 0xe9fbff, windowOffset, 1.05, -0.42, { roughness: 0.2 });
  });
  [-0.78, 0.78].forEach((wheelOffset) => {
    addCylinderToGroup(busGroup, 0.19, 0.19, 0.13, toyPalette.darkBlue, wheelOffset, 0.18, 0.48, 14, { rotationX: Math.PI * 0.5, roughness: 0.42 });
    addCylinderToGroup(busGroup, 0.19, 0.19, 0.13, toyPalette.darkBlue, wheelOffset, 0.18, -0.48, 14, { rotationX: Math.PI * 0.5, roughness: 0.42 });
  });

  scene.add(busGroup);
  if (labelTextValue) {
    addPlaqueToScene(labelTextValue, centerX, 1.85, centerZ + 0.95, "#ef4343", 1.7);
  }
  return busGroup;
}

function createToyTaxi(centerX, centerZ, rotationY) {
  const taxiGroup = new THREE.Group();
  taxiGroup.position.set(centerX, 0.38, centerZ);
  taxiGroup.rotation.y = rotationY;
  addBoxToGroup(taxiGroup, 1.6, 0.42, 0.78, toyPalette.darkBlue, 0, 0.38, 0, { roughness: 0.42 });
  addBoxToGroup(taxiGroup, 0.84, 0.34, 0.66, 0x263f63, -0.08, 0.76, 0, { roughness: 0.38 });
  addBoxToGroup(taxiGroup, 0.44, 0.09, 0.42, toyPalette.yellow, 0.02, 1.0, 0, { roughness: 0.35 });
  addBoxToGroup(taxiGroup, 0.34, 0.2, 0.035, 0xe9fbff, -0.45, 0.76, 0.4, { roughness: 0.2 });
  scene.add(taxiGroup);
  return taxiGroup;
}

function createPhoneBox(centerX, centerZ, rotationY) {
  const phoneGroup = new THREE.Group();
  phoneGroup.position.set(centerX, 0.32, centerZ);
  phoneGroup.rotation.y = rotationY;
  addBoxToGroup(phoneGroup, 0.55, 1.25, 0.55, toyPalette.red, 0, 0.78, 0, { roughness: 0.46 });
  addBoxToGroup(phoneGroup, 0.68, 0.16, 0.68, toyPalette.yellow, 0, 1.5, 0, { roughness: 0.38 });
  addBoxToGroup(phoneGroup, 0.38, 0.38, 0.04, 0xeaffff, 0, 0.9, 0.29, { roughness: 0.18 });
  scene.add(phoneGroup);
  return phoneGroup;
}

function createUndergroundRoundel(centerX, centerZ, rotationY, scaleValue = 1) {
  const roundelGroup = new THREE.Group();
  roundelGroup.position.set(centerX, 0.72, centerZ);
  roundelGroup.rotation.y = rotationY;
  roundelGroup.scale.setScalar(scaleValue);

  addCylinderToGroup(roundelGroup, 0.09, 0.09, 1.35, toyPalette.darkBlue, 0, 0.58, 0, 10, { roughness: 0.44 });
  const ringMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.075, 10, 28),
    createToyMaterial(toyPalette.red, 0.4, 0.03),
  );
  ringMesh.position.set(0, 1.28, 0);
  ringMesh.rotation.y = Math.PI * 0.5;
  roundelGroup.add(ringMesh);
  addBoxToGroup(roundelGroup, 0.94, 0.16, 0.08, toyPalette.blue, 0, 1.28, 0, { roughness: 0.38 });
  scene.add(roundelGroup);
  return roundelGroup;
}

function createBonusSkylineIcons() {
  const skylineGroup = new THREE.Group();
  skylineGroup.position.set(8.2, 0, 8.8);

  addCylinderToGroup(skylineGroup, 0.8, 0.58, 4.2, 0xa9edff, -1.4, 2.1, 0, 20, { roughness: 0.32, metalness: 0.04 });
  addBoxToGroup(skylineGroup, 0.12, 4.1, 0.12, toyPalette.blue, -1.4, 2.15, 0.72, { roughness: 0.34 });
  addBoxToGroup(skylineGroup, 1.5, 5.2, 1.25, 0xc4eaff, 1.05, 2.6, 0.05, { roughness: 0.32, rotationZ: -0.08 });
  addBoxToGroup(skylineGroup, 0.35, 0.35, 1.35, toyPalette.yellow, 1.3, 5.35, 0.05, { roughness: 0.34 });
  addBoxToGroup(skylineGroup, 2.3, 0.42, 1.3, toyPalette.red, 1.0, 0.45, 0.05, { roughness: 0.48 });

  scene.add(skylineGroup);
}

function createTrafalgarToySquare() {
  const squareGroup = new THREE.Group();
  squareGroup.position.set(-3.7, 0.08, -8.2);

  addBoxToGroup(squareGroup, 3.6, 0.18, 2.6, 0xffe6a6, 0, 0.15, 0, { roughness: 0.86 });
  addCylinderToGroup(squareGroup, 0.22, 0.28, 2.4, 0xf7ecd2, 0, 1.45, 0, 12, { roughness: 0.72 });
  addBoxToGroup(squareGroup, 0.9, 0.26, 0.9, toyPalette.blue, 0, 0.42, 0, { roughness: 0.48 });
  addConeToGroup(squareGroup, 0.22, 0.52, toyPalette.yellow, 0, 2.86, 0, 4, { rotationY: Math.PI * 0.25, roughness: 0.42 });
  [-1.25, 1.25].forEach((fountainOffset) => {
    addCylinderToGroup(squareGroup, 0.52, 0.52, 0.16, toyPalette.river, fountainOffset, 0.35, 0.72, 18, { roughness: 0.22 });
    addCylinderToGroup(squareGroup, 0.08, 0.08, 0.45, 0xe9fbff, fountainOffset, 0.62, 0.72, 10, { roughness: 0.24 });
  });

  scene.add(squareGroup);
}

function createExtraLondonToyDetails() {
  createToyBus(-1.4, 14.8, -0.08, null);
  createToyBus(14.8, 7.4, -0.45, null);
  createToyTaxi(-20.2, 15.5, 0.12);
  createToyTaxi(24.4, -0.6, -1.2);
  createPhoneBox(landmarkLayout.westminster.x - 1.2, landmarkLayout.westminster.z + 3.5, 0.3);
  createPhoneBox(landmarkLayout.towerBridge.x + 2.7, landmarkLayout.towerBridge.z - 5.0, -0.2);
  createPhoneBox(landmarkLayout.battersea.x - 2.6, landmarkLayout.battersea.z + 2.35, 0.35);
  createUndergroundRoundel(landmarkLayout.londonEye.x - 1.2, landmarkLayout.londonEye.z - 1.7, -0.35, 1.08);
  createUndergroundRoundel(landmarkLayout.towerBridge.x - 2.0, landmarkLayout.towerBridge.z + 3.3, 0.4, 1.0);
  createUndergroundRoundel(landmarkLayout.battersea.x + 1.5, landmarkLayout.battersea.z + 2.35, 0.15, 0.94);
  createBonusSkylineIcons();
  createTrafalgarToySquare();
}

function createElizabethTowerGroup() {
  const landmarkPosition = landmarkLayout.westminster;
  const group = new THREE.Group();
  group.position.set(landmarkPosition.x, 0, landmarkPosition.z);

  const palaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xdba348,
    roughness: 0.82,
    metalness: 0.03,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.roofBlue,
    roughness: 0.56,
    metalness: 0.03,
  });

  addBoxToGroup(group, 11.7, 0.18, 4.7, 0xf2d792, 1, 0.08, 0, { roughness: 0.88, metalness: 0.01 });

  const palaceBody = new THREE.Mesh(new THREE.BoxGeometry(10.4, 2.4, 3.2), palaceMaterial);
  palaceBody.position.set(1, 1.2, 0);
  group.add(palaceBody);

  const palaceRoof = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.35, 3.8), roofMaterial);
  palaceRoof.position.set(1, 2.6, 0);
  group.add(palaceRoof);

  const palaceTurretOffsets = [-3.4, -0.8, 1.8, 4.2];
  palaceTurretOffsets.forEach((offsetValue) => {
    const turretMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.5), palaceMaterial);
    turretMesh.position.set(offsetValue + 1, 1.9, 1.4);
    group.add(turretMesh);

    const turretRoof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 4), roofMaterial);
    turretRoof.position.set(offsetValue + 1, 4.05, 1.4);
    turretRoof.rotation.y = Math.PI * 0.25;
    group.add(turretRoof);
  });

  const towerBody = new THREE.Mesh(new THREE.BoxGeometry(1.85, 12.8, 1.85), palaceMaterial);
  towerBody.position.set(-4.6, 6.4, 0);
  group.add(towerBody);

  const towerTop = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.55, 2.3), palaceMaterial);
  towerTop.position.set(-4.6, 13.6, 0);
  group.add(towerTop);

  const towerSpire = new THREE.Mesh(new THREE.ConeGeometry(0.92, 2.85, 4), roofMaterial);
  towerSpire.position.set(-4.6, 15.8, 0);
  towerSpire.rotation.y = Math.PI * 0.25;
  group.add(towerSpire);

  const clockMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffcf4,
    roughness: 0.45,
    metalness: 0.01,
  });
  const frontClock = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), clockMaterial);
  frontClock.position.set(-4.6, 11.2, 0.94);
  group.add(frontClock);

  const sideClock = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), clockMaterial);
  sideClock.position.set(-3.66, 11.2, 0);
  sideClock.rotation.y = Math.PI * 0.5;
  group.add(sideClock);

  const clockRimMaterial = createToyMaterial(toyPalette.darkBlue, 0.38, 0.02);
  const frontClockRim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 28), clockRimMaterial);
  frontClockRim.position.set(-4.6, 11.2, 0.99);
  group.add(frontClockRim);

  const sideClockRim = frontClockRim.clone();
  sideClockRim.position.set(-3.61, 11.2, 0);
  sideClockRim.rotation.y = Math.PI * 0.5;
  group.add(sideClockRim);

  addBoxToGroup(group, 2.05, 0.12, 2.05, toyPalette.yellow, -4.6, 12.25, 0, { roughness: 0.36 });
  addBoxToGroup(group, 2.25, 0.12, 2.25, toyPalette.yellow, -4.6, 14.42, 0, { roughness: 0.36 });

  [-5.48, -3.72].forEach((cornerX) => {
    [-0.92, 0.92].forEach((cornerZ) => {
      addCylinderToGroup(group, 0.055, 0.055, 12.4, 0xb87928, cornerX, 6.65, cornerZ, 8, { roughness: 0.42 });
    });
  });
  addCylinderToGroup(group, 0.055, 0.07, 1.55, toyPalette.yellow, -4.6, 18.0, 0, 10, { roughness: 0.32 });

  const clockHandMaterial = createToyMaterial(toyPalette.darkBlue, 0.34, 0.02);
  const frontMinuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.42, 0.035), clockHandMaterial);
  frontMinuteHand.position.set(-4.6, 11.31, 0.975);
  frontMinuteHand.rotation.z = -0.58;
  group.add(frontMinuteHand);

  const frontHourHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.3, 0.035), clockHandMaterial);
  frontHourHand.position.set(-4.51, 11.18, 0.98);
  frontHourHand.rotation.z = 0.86;
  group.add(frontHourHand);

  const sideMinuteHand = frontMinuteHand.clone();
  sideMinuteHand.position.set(-3.635, 11.31, 0);
  sideMinuteHand.rotation.y = Math.PI * 0.5;
  sideMinuteHand.rotation.z = -0.58;
  group.add(sideMinuteHand);

  const sideHourHand = frontHourHand.clone();
  sideHourHand.position.set(-3.632, 11.18, 0.09);
  sideHourHand.rotation.y = Math.PI * 0.5;
  sideHourHand.rotation.z = 0.86;
  group.add(sideHourHand);

  addWindowGrid(landmarkPosition.x + 1.0, 1.3, landmarkPosition.z + 1.22, 8.4, 0.9, 12, 2, new THREE.Vector3(0, 0, 1), toyPalette.trackSignal);
  addWindowGrid(landmarkPosition.x - 4.6, 6.7, landmarkPosition.z + 0.22, 0.9, 7.4, 1, 9, new THREE.Vector3(0, 0, 1), toyPalette.trackSignal);

  scene.add(group);
  addPlaqueToScene("Westminster", landmarkPosition.x - 0.2, 3.6, landmarkPosition.z + 2.2, "#ef4343", 2.55);
}

function createLondonEyeGroup() {
  const landmarkPosition = landmarkLayout.londonEye;
  const group = new THREE.Group();
  group.position.set(landmarkPosition.x, 0.25, landmarkPosition.z);
  group.rotation.y = Math.PI * 0.5;

  const supportMaterial = new THREE.MeshStandardMaterial({
    color: 0x5caef7,
    roughness: 0.54,
    metalness: 0.05,
  });
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fcff,
    roughness: 0.38,
    metalness: 0.04,
  });

  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(0, 5.4, 0);
  rotatingEyeMeshes.push(wheelGroup);

  const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.24, 10, 56), ringMaterial);
  wheelRing.rotation.y = Math.PI * 0.5;
  wheelGroup.add(wheelRing);

  const innerWheelRing = new THREE.Mesh(new THREE.TorusGeometry(3.18, 0.09, 8, 48), ringMaterial);
  innerWheelRing.rotation.y = Math.PI * 0.5;
  wheelGroup.add(innerWheelRing);

  const spokeMaterial = new THREE.MeshStandardMaterial({
    color: 0xbdefff,
    roughness: 0.36,
    metalness: 0.05,
  });
  for (let spokeIndex = 0; spokeIndex < 16; spokeIndex += 1) {
    const spokeAngle = (spokeIndex / 16) * Math.PI * 2;
    const spokeDirection = new THREE.Vector3(
      0,
      Math.sin(spokeAngle),
      Math.cos(spokeAngle),
    ).normalize();
    const spokeLength = 4.18;
    const spokeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, spokeLength, 0.08), spokeMaterial);
    spokeMesh.position.copy(spokeDirection.clone().multiplyScalar(spokeLength * 0.5));
    spokeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spokeDirection);
    wheelGroup.add(spokeMesh);
  }

  group.add(wheelGroup);

  addBoxToGroup(group, 1.9, 0.28, 7.2, 0x79cff7, 0, 0.28, 0, { roughness: 0.44 });
  addBoxToGroup(group, 1.35, 0.18, 5.8, toyPalette.yellow, 0, 0.56, 0, { roughness: 0.5 });
  addBoxToGroup(group, 0.46, 0.2, 6.6, 0xf8fcff, -1.18, 0.66, 0, { roughness: 0.5 });
  addBoxToGroup(group, 0.46, 0.2, 6.6, 0xf8fcff, 1.18, 0.66, 0, { roughness: 0.5 });

  for (let capsuleIndex = 0; capsuleIndex < 14; capsuleIndex += 1) {
    const capsuleAngle = (capsuleIndex / 14) * Math.PI * 2;
    const capsuleMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.34, 0.46),
      new THREE.MeshStandardMaterial({
        color: capsuleIndex % 2 === 0 ? toyPalette.yellow : toyPalette.red,
        roughness: 0.48,
        metalness: 0.03,
      }),
    );
    group.add(capsuleMesh);
    londonEyeCapsuleRecords.push({
      mesh: capsuleMesh,
      parentGroup: group,
      phase: capsuleAngle,
      radius: 4.55,
    });
  }

  const axlePosition = new THREE.Vector3(0, 5.4, 0);
  const supportFootPositions = [
    new THREE.Vector3(-2.9, 0.62, -0.9),
    new THREE.Vector3(2.9, 0.62, -0.9),
    new THREE.Vector3(-2.2, 0.62, 1.12),
    new THREE.Vector3(2.2, 0.62, 1.12),
  ];
  supportFootPositions.forEach((supportFootPosition) => {
    addCylinderBetweenPoints(group, supportFootPosition, axlePosition, 0.1, 0x5caef7, 10, { roughness: 0.44 });
  });
  addCylinderBetweenPoints(group, new THREE.Vector3(-2.9, 0.78, -0.9), new THREE.Vector3(2.9, 0.78, -0.9), 0.08, 0x5caef7, 10, { roughness: 0.44 });
  addCylinderBetweenPoints(group, new THREE.Vector3(-2.2, 0.78, 1.12), new THREE.Vector3(2.2, 0.78, 1.12), 0.08, 0x5caef7, 10, { roughness: 0.44 });

  const axleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 16), supportMaterial);
  axleMesh.position.set(0, 5.4, 0);
  group.add(axleMesh);

  scene.add(group);
  addPlaqueToScene("London Eye", landmarkPosition.x, 2.8, landmarkPosition.z + 4.7, "#1f7de1", 2.35);
}

function createStPaulsGroup() {
  const landmarkPosition = landmarkLayout.stPauls;
  const group = new THREE.Group();
  group.position.set(landmarkPosition.x, 0, landmarkPosition.z);

  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0xf3fbff,
    roughness: 0.78,
    metalness: 0.03,
  });
  const domeMaterial = new THREE.MeshStandardMaterial({
    color: 0x73baf2,
    roughness: 0.56,
    metalness: 0.04,
  });
  const whiteTrimMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.64,
    metalness: 0.02,
  });

  const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(7.1, 1.55, 4.9), stoneMaterial);
  baseMesh.position.set(0, 0.78, 0);
  group.add(baseMesh);

  const naveMesh = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.0, 3.45), stoneMaterial);
  naveMesh.position.set(0, 2.22, 0);
  group.add(naveMesh);

  addBoxToGroup(group, 7.95, 1.55, 1.22, 0xc3dcf5, 0, 2.56, 0.03, { roughness: 0.74 });
  addBoxToGroup(group, 6.05, 0.24, 0.84, 0xffffff, 0, 0.58, 2.9, { roughness: 0.66 });
  addBoxToGroup(group, 5.18, 0.2, 0.7, 0xffffff, 0, 0.88, 3.0, { roughness: 0.66 });
  addBoxToGroup(group, 4.65, 0.18, 0.44, toyPalette.yellow, 0, 1.1, 3.13, { roughness: 0.46 });

  const domeDrum = new THREE.Mesh(new THREE.CylinderGeometry(2.28, 2.28, 1.45, 24), stoneMaterial);
  domeDrum.position.set(0, 4.42, 0);
  group.add(domeDrum);

  const domeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.82, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5),
    domeMaterial,
  );
  domeMesh.position.set(0, 5.02, 0);
  domeMesh.scale.y = 0.95;
  group.add(domeMesh);

  const lowerDomeRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.52, 0.1, 8, 48),
    whiteTrimMaterial,
  );
  lowerDomeRing.position.set(0, 5.0, 0);
  lowerDomeRing.rotation.x = Math.PI * 0.5;
  group.add(lowerDomeRing);

  const upperDomeRing = lowerDomeRing.clone();
  upperDomeRing.geometry = new THREE.TorusGeometry(1.32, 0.065, 8, 40);
  upperDomeRing.position.y = 6.04;
  group.add(upperDomeRing);

  for (let ribIndex = 0; ribIndex < 12; ribIndex += 1) {
    const ribAngle = (ribIndex / 12) * Math.PI * 2;
    const ribMesh = new THREE.Mesh(new THREE.BoxGeometry(0.085, 1.82, 0.085), whiteTrimMaterial);
    ribMesh.position.set(Math.cos(ribAngle) * 1.38, 5.78, Math.sin(ribAngle) * 1.38);
    ribMesh.rotation.z = Math.cos(ribAngle) * 0.36;
    ribMesh.rotation.x = -Math.sin(ribAngle) * 0.36;
    group.add(ribMesh);
  }

  const lanternMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.62, 2.1, 14),
    domeMaterial,
  );
  lanternMesh.position.set(0, 7.02, 0);
  group.add(lanternMesh);

  const sideTowerOffsets = [-2.92, 2.92];
  sideTowerOffsets.forEach((offsetValue) => {
    const sideTower = new THREE.Mesh(new THREE.BoxGeometry(1.18, 4.95, 1.12), stoneMaterial);
    sideTower.position.set(offsetValue, 3.1, 1.86);
    group.add(sideTower);

    const sideRoof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.42, 12), domeMaterial);
    sideRoof.position.set(offsetValue, 6.14, 1.86);
    group.add(sideRoof);

    addBoxToGroup(group, 0.13, 0.72, 0.13, toyPalette.yellow, offsetValue, 6.9, 1.86, { roughness: 0.34 });
  });

  [-2.05, -1.25, -0.45, 0.45, 1.25, 2.05].forEach((columnOffset) => {
    addCylinderToGroup(group, 0.13, 0.13, 1.95, 0xffffff, columnOffset, 1.24, 2.52, 10, { roughness: 0.7 });
  });
  addBoxToGroup(group, 4.78, 0.2, 0.36, 0xffffff, 0, 2.32, 2.52, { roughness: 0.68 });

  const porticoPedimentShape = new THREE.Shape();
  porticoPedimentShape.moveTo(-2.45, 0);
  porticoPedimentShape.lineTo(2.45, 0);
  porticoPedimentShape.lineTo(0, 0.74);
  porticoPedimentShape.lineTo(-2.45, 0);
  const porticoPedimentGeometry = new THREE.ExtrudeGeometry(porticoPedimentShape, {
    depth: 0.34,
    bevelEnabled: false,
  });
  const porticoPedimentMesh = new THREE.Mesh(porticoPedimentGeometry, stoneMaterial);
  porticoPedimentMesh.position.set(0, 2.43, 2.36);
  group.add(porticoPedimentMesh);

  addBoxToGroup(group, 0.2, 1.35, 0.2, toyPalette.yellow, 0, 8.82, 0, { roughness: 0.34 });
  addBoxToGroup(group, 0.98, 0.16, 0.16, toyPalette.yellow, 0, 9.22, 0, { roughness: 0.34 });

  addWindowGrid(landmarkPosition.x, 1.9, landmarkPosition.z + 2.55, 4.8, 1.16, 6, 3, new THREE.Vector3(0, 0, 1), toyPalette.flowerYellow);

  scene.add(group);
  addPlaqueToScene("St Paul's", landmarkPosition.x, 3.45, landmarkPosition.z + 3.95, "#1f7de1", 2.25);
}

function createShardGroup() {
  const landmarkPosition = landmarkLayout.shard;
  const group = new THREE.Group();
  group.position.set(landmarkPosition.x, 0, landmarkPosition.z);

  const shardMaterial = new THREE.MeshStandardMaterial({
    color: 0xecf8ff,
    roughness: 0.3,
    metalness: 0.05,
  });
  const shardGlassMaterial = new THREE.MeshStandardMaterial({
    color: 0xcdf4ff,
    roughness: 0.2,
    metalness: 0.06,
    transparent: true,
    opacity: 0.78,
  });

  const shardSegments = [
    { width: 2.75, depth: 2.15, height: 3.6, y: 1.8 },
    { width: 2.2, depth: 1.72, height: 3.45, y: 5.15 },
    { width: 1.6, depth: 1.36, height: 3.35, y: 8.45 },
    { width: 1.04, depth: 1.02, height: 3.2, y: 11.72 },
    { width: 0.58, depth: 0.66, height: 2.8, y: 14.65 },
  ];

  shardSegments.forEach((segmentValue, segmentIndex) => {
    const shardLayer = new THREE.Mesh(
      new THREE.BoxGeometry(segmentValue.width, segmentValue.height, segmentValue.depth),
      shardMaterial,
    );
    shardLayer.position.set(0, segmentValue.y, 0);
    shardLayer.rotation.z = (segmentIndex - 2) * 0.018;
    group.add(shardLayer);
  });

  const shardSpear = new THREE.Mesh(new THREE.ConeGeometry(2.25, 17.8, 4), shardGlassMaterial);
  shardSpear.position.set(0, 8.9, 0);
  shardSpear.rotation.y = Math.PI * 0.25;
  shardSpear.scale.set(0.72, 1, 0.56);
  group.add(shardSpear);

  const shardEdgeMaterial = createToyMaterial(0x79cdfa, 0.24, 0.05);
  [-0.92, -0.32, 0.32, 0.92].forEach((edgeOffset, edgeIndex) => {
    const shardEdge = new THREE.Mesh(new THREE.BoxGeometry(0.075, 15.8, 0.075), shardEdgeMaterial);
    shardEdge.position.set(edgeOffset, 8.55, 1.26);
    shardEdge.rotation.z = (edgeIndex - 1.5) * 0.09;
    group.add(shardEdge);
  });
  addConeToGroup(group, 0.55, 2.5, 0xdaf5ff, 0, 17.65, 0, 4, { rotationY: Math.PI * 0.25, roughness: 0.28 });

  addWindowGrid(landmarkPosition.x, 8.2, landmarkPosition.z + 1.22, 2.2, 10.8, 4, 10, new THREE.Vector3(0, 0, 1), 0xcaf8ff);

  scene.add(group);
  addPlaqueToScene("The Shard", landmarkPosition.x, 4.4, landmarkPosition.z + 2.65, "#5caef7", 2.15);
}

function createTowerBridgeGroup() {
  const landmarkPosition = landmarkLayout.towerBridge;
  const group = new THREE.Group();
  group.position.set(landmarkPosition.x, 0.15, landmarkPosition.z);
  group.rotation.y = landmarkPosition.rotationY;

  const towerMaterial = new THREE.MeshStandardMaterial({
    color: 0xe6f4ff,
    roughness: 0.74,
    metalness: 0.03,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.roofBlue,
    roughness: 0.5,
    metalness: 0.04,
  });
  const abutmentMaterial = new THREE.MeshStandardMaterial({
    color: 0x65cf63,
    roughness: 0.9,
    metalness: 0.01,
  });

  [-9.35, 9.35].forEach((abutmentOffset) => {
    const abutmentMesh = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.28, 5.2), abutmentMaterial);
    abutmentMesh.position.set(abutmentOffset, 0.08, 0);
    group.add(abutmentMesh);
  });

  const towerOffsets = [-5.85, 5.85];
  towerOffsets.forEach((offsetValue) => {
    const towerMesh = new THREE.Mesh(new THREE.BoxGeometry(2.55, 8.15, 2.65), towerMaterial);
    towerMesh.position.set(offsetValue, 3.95, 0);
    group.add(towerMesh);

    const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(1.16, 2.12, 4), accentMaterial);
    roofMesh.position.set(offsetValue, 9.0, 0);
    roofMesh.rotation.y = Math.PI * 0.25;
    group.add(roofMesh);

    [-0.82, 0.82].forEach((turretZOffset) => {
      addCylinderToGroup(group, 0.22, 0.28, 2.6, towerMaterial.color.getHex(), offsetValue - 0.78, 6.0, turretZOffset, 8, { roughness: 0.72 });
      addCylinderToGroup(group, 0.22, 0.28, 2.6, towerMaterial.color.getHex(), offsetValue + 0.78, 6.0, turretZOffset, 8, { roughness: 0.72 });
      addConeToGroup(group, 0.28, 0.7, toyPalette.roofBlue, offsetValue - 0.78, 7.66, turretZOffset, 4, { rotationY: Math.PI * 0.25, roughness: 0.46 });
      addConeToGroup(group, 0.28, 0.7, toyPalette.roofBlue, offsetValue + 0.78, 7.66, turretZOffset, 4, { rotationY: Math.PI * 0.25, roughness: 0.46 });
    });
  });

  const upperWalkway = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.48, 1.42), accentMaterial);
  upperWalkway.position.set(0, 7.05, 0);
  group.add(upperWalkway);

  const lowerDeck = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.42, 2.05), towerMaterial);
  lowerDeck.position.set(0, 2.5, 0);
  group.add(lowerDeck);
  addBoxToGroup(group, 16.6, 0.14, 0.16, toyPalette.blue, 0, 3.14, -1.18, { roughness: 0.38 });
  addBoxToGroup(group, 16.6, 0.14, 0.16, toyPalette.blue, 0, 3.14, 1.18, { roughness: 0.38 });
  [-6.8, -3.4, 0, 3.4, 6.8].forEach((railingPostOffset) => {
    addBoxToGroup(group, 0.12, 0.72, 0.12, toyPalette.blue, railingPostOffset, 3.42, -1.16, { roughness: 0.38 });
    addBoxToGroup(group, 0.12, 0.72, 0.12, toyPalette.blue, railingPostOffset, 3.42, 1.16, { roughness: 0.38 });
  });

  const basculeLeft = addBoxToGroup(group, 4.75, 0.22, 1.62, toyPalette.blue, -2.38, 2.82, 0, { roughness: 0.42 });
  basculeLeft.rotation.z = Math.PI * 0.055;
  const basculeRight = addBoxToGroup(group, 4.75, 0.22, 1.62, toyPalette.red, 2.38, 2.82, 0, { roughness: 0.42 });
  basculeRight.rotation.z = -Math.PI * 0.055;

  [-1.08, 1.08].forEach((sideOffset) => {
    addBoxToGroup(group, 11.8, 0.12, 0.12, toyPalette.blue, 0, 5.9, sideOffset, { roughness: 0.36 });
    [-5.35, -2.68, 0, 2.68, 5.35].forEach((cableOffset) => {
      const cableMesh = addBoxToGroup(group, 0.08, 2.28, 0.08, toyPalette.blue, cableOffset, 4.72, sideOffset, { roughness: 0.36 });
      cableMesh.rotation.z = cableOffset < 0 ? -0.2 : cableOffset > 0 ? 0.2 : 0;
    });
  });

  const braceOffsets = [-5.75, 5.75];
  braceOffsets.forEach((offsetValue, braceIndex) => {
    const braceMesh = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.26, 0.32), accentMaterial);
    braceMesh.position.set(offsetValue, 4.65, 0);
    braceMesh.rotation.z = braceIndex === 0 ? Math.PI * 0.18 : -Math.PI * 0.18;
    group.add(braceMesh);
  });

  const bridgeWindowHorizontal = rotatedHorizontalAxis(landmarkPosition.rotationY);
  const bridgeWindowNormal = rotatedNormalAxis(landmarkPosition.rotationY);
  [-5.85, 5.85].forEach((towerOffset) => {
    const towerWindowPosition = transformLocalXZ(
      landmarkPosition.x,
      landmarkPosition.z,
      landmarkPosition.rotationY,
      towerOffset,
      1.3,
    );
    towerWindowPosition.y = 4.8;
    addWindowGridOnAxes(towerWindowPosition, bridgeWindowHorizontal, 1.2, 4.2, 2, 5, bridgeWindowNormal, toyPalette.trackSignal);
  });

  scene.add(group);
  addPlaqueToScene("Tower Bridge", landmarkPosition.x + 3.0, 3.75, landmarkPosition.z - 4.7, "#ef4343", 2.7);
}

function createBatterseaGroup() {
  const landmarkPosition = landmarkLayout.battersea;
  const group = new THREE.Group();
  group.position.set(landmarkPosition.x, 0, landmarkPosition.z);

  const brickMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.brick,
    roughness: 0.78,
    metalness: 0.02,
  });
  const chimneyMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.cream,
    roughness: 0.7,
    metalness: 0.02,
  });

  const powerHouse = new THREE.Mesh(new THREE.BoxGeometry(7.4, 3.6, 4.0), brickMaterial);
  powerHouse.position.set(0, 1.8, 0);
  group.add(powerHouse);

  const roofStrip = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.32, 4.2), new THREE.MeshStandardMaterial({
    color: toyPalette.roofSlate,
    roughness: 0.54,
    metalness: 0.03,
  }));
  roofStrip.position.set(0, 3.7, 0);
  group.add(roofStrip);

  [
    [-2.55, 6.5, -1.28],
    [2.55, 6.5, -1.28],
    [-2.55, 6.5, 1.28],
    [2.55, 6.5, 1.28],
  ].forEach(([chimneyX, chimneyY, chimneyZ]) => {
    const chimneyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 5.45, 12), chimneyMaterial);
    chimneyMesh.position.set(chimneyX, chimneyY, chimneyZ);
    group.add(chimneyMesh);

    addCylinderToGroup(group, 0.41, 0.41, 0.18, toyPalette.red, chimneyX, chimneyY + 2.05, chimneyZ, 12, { roughness: 0.42 });
    addCylinderToGroup(group, 0.42, 0.42, 0.18, toyPalette.blue, chimneyX, chimneyY - 0.35, chimneyZ, 12, { roughness: 0.42 });

    const smokePuffMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0,
        transparent: true,
        opacity: 0.64,
      }),
    );
    smokePuffMesh.position.set(chimneyX + 0.18, chimneyY + 3.1, chimneyZ + 0.12);
    group.add(smokePuffMesh);
    smokePuffRecords.push({
      mesh: smokePuffMesh,
      baseY: chimneyY + 3.1,
      phase: chimneyX + chimneyZ,
    });
  });

  addWindowGrid(landmarkPosition.x, 1.8, landmarkPosition.z + 2.07, 5.4, 1.7, 8, 3, new THREE.Vector3(0, 0, 1), toyPalette.trackSignal);

  scene.add(group);
  addPlaqueToScene("Battersea", landmarkPosition.x, 3.95, landmarkPosition.z + 2.85, "#ef4343", 2.25);
}

function createLandmarks() {
  createElizabethTowerGroup();
  createLondonEyeGroup();
  createStPaulsGroup();
  createShardGroup();
  createTowerBridgeGroup();
  createBatterseaGroup();

  createParkPatch(-25.0, -5.2, 6.3, 8.4, 6);
  createParkPatch(-22.8, 15.0, 6.4, 4.2, 5);
  createParkPatch(-7.2, 14.2, 7.4, 3.9, 5);
  createParkPatch(3.8, 12.5, 10.6, 4.0, 8);
  createParkPatch(15.0, 5.9, 5.8, 3.6, 5, false);
  createParkPatch(25.2, -12.8, 7.8, 4.8, 6);
  createParkPatch(5.8, -12.7, 7.4, 3.7, 5, false);

  createNeighborhoods();
}

const outerRoute = {
  name: "Capital Loop",
  startingSegmentKey: "southReturn",
  segments: {
    westScenic: createCurveSegment("westScenic", [
      [-23, 3.2, 12],
      [-25.1, 3.7, 8.8],
      [-25.0, 3.92, 3.1],
      [-23.6, 4.02, -2.8],
      [-21.4, 4.08, -7.6],
      [-18.3, 4.15, -10.8],
    ]),
    westTunnel: createCurveSegment("westTunnel", [
      [-23, 3.2, 12],
      [-24.2, 2.78, 7.6],
      [-23.4, 2.48, 1.4],
      [-21.7, 2.58, -4.8],
      [-18.3, 4.15, -10.8],
    ]),
    northRun: createCurveSegment("northRun", [
      [-18.3, 4.15, -10.8],
      [-10.2, 4.9, -13.8],
      [-1.0, 5.05, -14.7],
      [8.5, 4.7, -13.0],
      [12.0, 4.25, -10.6],
    ]),
    eastBridge: createCurveSegment("eastBridge", [
      [12.0, 4.25, -10.6],
      [16.6, 4.62, -13.0],
      [27.6, 5.0, -14.0],
      [30.4, 4.82, -5.6],
      [29.4, 4.24, 6.8],
      [18.2, 3.2, 9.1],
    ]),
    eastFlyover: createCurveSegment("eastFlyover", [
      [12.0, 4.25, -10.6],
      [16.4, 5.62, -15.2],
      [20.0, 6.74, -18.5],
      [29.6, 7.3, -17.6],
      [32.0, 7.15, -7.8],
      [30.0, 6.6, 7.2],
      [18.2, 3.2, 9.1],
    ]),
    southReturn: createCurveSegment("southReturn", [
      [18.2, 3.2, 9.1],
      [9.0, 3.1, 16.4],
      [-2.4, 3.0, 18.8],
      [-13.8, 3.1, 19.0],
      [-23.6, 3.14, 16.8],
      [-23, 3.2, 12],
    ]),
  },
  getNextSegmentKey(currentSegmentKey, routeState) {
    if (currentSegmentKey === "southReturn") {
      return routeState.westTunnelActive ? "westTunnel" : "westScenic";
    }
    if (currentSegmentKey === "westScenic" || currentSegmentKey === "westTunnel") {
      return "northRun";
    }
    if (currentSegmentKey === "northRun") {
      return routeState.eastFlyoverActive ? "eastFlyover" : "eastBridge";
    }
    if (currentSegmentKey === "eastBridge" || currentSegmentKey === "eastFlyover") {
      return "southReturn";
    }
    return "southReturn";
  },
};

const tubeRoute = {
  name: "Tube Circle",
  startingSegmentKey: "tubeCircle",
  segments: {
    tubeCircle: createCurveSegment(
      "tubeCircle",
      [
        [-21.6, 2.0, 7.1],
        [-21.2, 2.05, -8.2],
        [-12.2, 2.25, -14.8],
        [-1.0, 2.45, -16.1],
        [9.8, 2.62, -14.4],
        [15.6, 2.72, -7.3],
        [15.6, 2.82, 6.5],
        [0.6, 2.55, 16.6],
        [-10.8, 2.28, 17.6],
        [-21.6, 2.22, 17.4],
        [-23.0, 2.2, 8.0],
      ],
      true,
    ),
  },
  getNextSegmentKey() {
    return "tubeCircle";
  },
};

const docklandsRoute = {
  name: "Docklands Loop",
  startingSegmentKey: "docklandsLoop",
  segments: {
    docklandsLoop: createCurveSegment(
      "docklandsLoop",
      [
        [26.7, 9.4, -17.4],
        [31.8, 10.1, -13.8],
        [33.4, 10.35, -3.5],
        [32.9, 10.1, 9.8],
        [27.9, 9.75, 12.7],
        [31.4, 9.7, 2.6],
        [31.3, 9.72, -9.8],
      ],
      true,
    ),
  },
  getNextSegmentKey() {
    return "docklandsLoop";
  },
};

const allRoutes = [outerRoute, tubeRoute, docklandsRoute];

function computeRouteLength(routeDefinition, routeState) {
  let activeSegmentKey = routeDefinition.startingSegmentKey;
  let routeLength = 0;
  const visitedSegments = new Set();

  while (!visitedSegments.has(activeSegmentKey)) {
    visitedSegments.add(activeSegmentKey);
    routeLength += routeDefinition.segments[activeSegmentKey].length;
    activeSegmentKey = routeDefinition.getNextSegmentKey(activeSegmentKey, routeState);
  }

  return routeLength;
}

function addTrackSupport(frameValue) {
  const supportHeight = frameValue.position.y - 0.18;
  if (supportHeight <= 1.35) {
    return;
  }

  [-0.82, 0.82].forEach((supportOffset) => {
    const supportPosition = frameValue.position.clone().add(frameValue.right.clone().multiplyScalar(supportOffset));
    const supportMatrix = composeMatrixFromPosition(
      new THREE.Vector3(supportPosition.x, supportHeight * 0.5, supportPosition.z),
      new THREE.Quaternion(),
      new THREE.Vector3(0.16, supportHeight, 0.16),
    );
    pushMatrix(instanceStore.supportMatrices, supportMatrix);
  });

  const crossBeamMatrix = composeTrackMatrix(
    frameValue.position,
    frameValue.tangent,
    frameValue.right,
    new THREE.Vector3(1.86, 0.1, 0.18),
    -0.2,
    0,
  );
  pushMatrix(instanceStore.archBeamMatrices, crossBeamMatrix);
}

function createTrackMeshes() {
  const railTubeMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.trackRail,
    roughness: 0.34,
    metalness: 0.16,
  });

  createFinishedTrackBed(outerRoute.segments.southReturn.curve, 1.96);
  createFinishedTrackBed(outerRoute.segments.northRun.curve, 1.96);
  createFinishedTrackBed(outerRoute.segments.westScenic.curve, 1.96);
  createFinishedTrackBed(outerRoute.segments.westTunnel.curve, 1.96);
  createFinishedTrackBed(outerRoute.segments.eastBridge.curve, 1.96);
  createFinishedTrackBed(outerRoute.segments.eastFlyover.curve, 1.96);
  createFinishedTrackBed(tubeRoute.segments.tubeCircle.curve, 1.96);
  createFinishedTrackBed(docklandsRoute.segments.docklandsLoop.curve, 1.96);

  [
    new THREE.Vector3(-23.0, 3.2, 12.0),
    new THREE.Vector3(-18.3, 4.15, -10.8),
    new THREE.Vector3(12.0, 4.25, -10.6),
    new THREE.Vector3(18.2, 3.2, 9.1),
  ].forEach((junctionPosition) => createJunctionCollar(junctionPosition));

  allRoutes.forEach((routeDefinition) => {
    Object.values(routeDefinition.segments).forEach((routeSegment) => {
      addContinuousRailDetails(routeSegment.curve, railTubeMaterial);

      const supportFrames = sampleTrackFrames(routeSegment.curve, 1.16);

      supportFrames.forEach((frameValue, frameIndex) => {
        if (frameIndex % 5 === 0) {
          addTrackSupport(frameValue);
        }
      });
    });
  });

  const supportMaterial = new THREE.MeshStandardMaterial({
    color: 0xaee5ef,
    roughness: 0.58,
    metalness: 0.04,
  });
  const underBeamMaterial = new THREE.MeshStandardMaterial({
    color: 0xccecf5,
    roughness: 0.6,
    metalness: 0.02,
  });
  scene.add(buildInstancedMesh(new THREE.BoxGeometry(1, 1, 1), supportMaterial, instanceStore.supportMatrices));
  scene.add(buildInstancedMesh(new THREE.BoxGeometry(1, 1, 1), underBeamMaterial, instanceStore.archBeamMatrices));
}

function seededUnit(indexValue, saltValue) {
  return Math.sin(indexValue * 12.9898 + saltValue * 78.233) * 43758.5453 % 1;
}

function positiveSeededUnit(indexValue, saltValue) {
  return Math.abs(seededUnit(indexValue, saltValue));
}

function createFestiveLights() {
  const lightCurves = [
    outerRoute.segments.westScenic.curve,
    outerRoute.segments.southReturn.curve,
    outerRoute.segments.eastBridge.curve,
    docklandsRoute.segments.docklandsLoop.curve,
  ];
  const bulbColors = [0xef4343, 0xffdc6c, 0x59c8ff, 0x47c95b, 0xffffff];

  lightCurves.forEach((lightCurve, curveIndex) => {
    const bulbCount = curveIndex === 3 ? 28 : 24;
    for (let bulbIndex = 0; bulbIndex < bulbCount; bulbIndex += 1) {
      const bulbRatio = (bulbIndex + 0.5) / bulbCount;
      const bulbPosition = lightCurve.getPointAt(bulbRatio);
      const bulbTangent = lightCurve.getTangentAt(bulbRatio).normalize();
      const bulbRight = new THREE.Vector3(bulbTangent.z, 0, -bulbTangent.x).normalize();
      const sideSign = bulbIndex % 2 === 0 ? -1 : 1;
      const bulbColor = bulbColors[(bulbIndex + curveIndex * 2) % bulbColors.length];
      const bulbMaterial = new THREE.MeshStandardMaterial({
        color: bulbColor,
        emissive: bulbColor,
        emissiveIntensity: 0.8,
        roughness: 0.22,
        metalness: 0.02,
        transparent: true,
        opacity: 0.98,
      });
      const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bulbMaterial);
      bulbMesh.position
        .copy(bulbPosition)
        .add(bulbRight.multiplyScalar(sideSign * 0.92));
      bulbMesh.position.y += 0.72;
      bulbMesh.visible = false;
      scene.add(bulbMesh);
      festiveLightRecords.push({
        mesh: bulbMesh,
        material: bulbMaterial,
        baseScale: 0.86 + (bulbIndex % 4) * 0.08,
        phase: bulbIndex * 0.54 + curveIndex * 1.3,
      });
    }
  });
}

function createHolidayFeature() {
  holidayFeatureGroup = new THREE.Group();
  holidayFeatureGroup.position.set(-3.8, tableSurfaceY + 0.1, 13.1);

  const trunkMaterial = createToyMaterial(0x8d6638, 0.8, 0.01);
  const branchMaterial = new THREE.MeshStandardMaterial({
    color: 0x16854f,
    roughness: 0.68,
    metalness: 0.02,
  });
  const starMaterial = new THREE.MeshStandardMaterial({
    color: 0xffdc6c,
    emissive: 0xffdc6c,
    emissiveIntensity: 0.72,
    roughness: 0.28,
    metalness: 0.04,
  });

  const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 1.1, 10), trunkMaterial);
  trunkMesh.position.y = 0.58;
  holidayFeatureGroup.add(trunkMesh);

  [1.08, 1.76, 2.38].forEach((layerY, layerIndex) => {
    const coneMesh = new THREE.Mesh(new THREE.ConeGeometry(1.42 - layerIndex * 0.28, 1.18, 18), branchMaterial);
    coneMesh.position.y = layerY;
    holidayFeatureGroup.add(coneMesh);
  });

  const starMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.33, 0), starMaterial);
  starMesh.position.y = 3.1;
  holidayFeatureGroup.add(starMesh);

  const ornamentColors = [0xef4343, 0xffdc6c, 0x59c8ff, 0xffffff];
  for (let ornamentIndex = 0; ornamentIndex < 20; ornamentIndex += 1) {
    const ornamentAngle = ornamentIndex * 1.9;
    const layerRatio = ornamentIndex / 20;
    const ornamentRadius = 0.36 + (1 - layerRatio) * 0.64;
    const ornamentY = 1.08 + layerRatio * 1.62;
    const ornamentColor = ornamentColors[ornamentIndex % ornamentColors.length];
    const ornamentMaterial = new THREE.MeshStandardMaterial({
      color: ornamentColor,
      emissive: ornamentColor,
      emissiveIntensity: 0.28,
      roughness: 0.26,
      metalness: 0.03,
    });
    const ornamentMesh = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), ornamentMaterial);
    ornamentMesh.position.set(
      Math.cos(ornamentAngle) * ornamentRadius,
      ornamentY,
      Math.sin(ornamentAngle) * ornamentRadius,
    );
    holidayFeatureGroup.add(ornamentMesh);
  }

  holidayFeatureGroup.visible = false;
  scene.add(holidayFeatureGroup);
}

function createSeasonSkyEffects() {
  const sunHaloTexture = createRadialTexture([
    [0, "rgba(255, 248, 166, 0.95)"],
    [0.2, "rgba(255, 177, 61, 0.58)"],
    [0.48, "rgba(255, 86, 82, 0.24)"],
    [1, "rgba(255, 86, 82, 0)"],
  ]);
  const sunCoreTexture = createRadialTexture([
    [0, "rgba(255, 255, 230, 1)"],
    [0.5, "rgba(255, 218, 74, 0.95)"],
    [0.82, "rgba(255, 121, 42, 0.42)"],
    [1, "rgba(255, 121, 42, 0)"],
  ]);
  const cloudTexture = createRadialTexture([
    [0, "rgba(255, 255, 255, 0.96)"],
    [0.52, "rgba(255, 255, 255, 0.82)"],
    [0.78, "rgba(180, 232, 255, 0.22)"],
    [1, "rgba(180, 232, 255, 0)"],
  ]);
  const moonTexture = createRadialTexture([
    [0, "rgba(255, 255, 255, 1)"],
    [0.56, "rgba(222, 239, 255, 0.92)"],
    [0.82, "rgba(118, 183, 255, 0.28)"],
    [1, "rgba(118, 183, 255, 0)"],
  ]);
  const frostTexture = createRadialTexture([
    [0, "rgba(255, 255, 255, 0.88)"],
    [0.38, "rgba(204, 241, 255, 0.4)"],
    [0.72, "rgba(128, 205, 255, 0.16)"],
    [1, "rgba(128, 205, 255, 0)"],
  ]);
  const blossomTexture = createRadialTexture([
    [0, "rgba(255, 255, 255, 0.96)"],
    [0.34, "rgba(255, 148, 204, 0.7)"],
    [0.72, "rgba(255, 94, 166, 0.18)"],
    [1, "rgba(255, 94, 166, 0)"],
  ]);
  const leafGlowTexture = createRadialTexture([
    [0, "rgba(255, 241, 130, 0.92)"],
    [0.32, "rgba(255, 133, 54, 0.64)"],
    [0.7, "rgba(201, 54, 46, 0.22)"],
    [1, "rgba(201, 54, 46, 0)"],
  ]);

  sunsetSunGroup = new THREE.Group();
  sunsetSunGroup.add(createAtmosphereSprite(sunHaloTexture, -25.5, 9.1, -37, 24, 24, 0.9));
  sunsetSunGroup.add(createAtmosphereSprite(sunCoreTexture, -25.5, 9.1, -36.5, 6.4, 6.4, 1));
  sunsetSunGroup.add(createAtmosphereSprite(sunCoreTexture, -25.5, 9.1, -36.2, 3.9, 3.9, 0.95));
  scene.add(registerAtmosphereLayer(sunsetSunGroup, { golden: 1 }));

  sunsetRayGroup = new THREE.Group();
  sunsetRayGroup.add(createSkyBand(76, 13, 0xff5a45, 0.32, -5, 9.6, -38, 0));
  sunsetRayGroup.add(createSkyBand(62, 7.5, 0xffd43f, 0.26, -1.5, 12.9, -37.7, 0.02));
  sunsetRayGroup.add(createSkyBand(46, 0.56, 0xfff0a8, 0.34, -9.5, 12.4, -36.8, 0.22));
  sunsetRayGroup.add(createSkyBand(54, 0.7, 0xff8d2e, 0.22, -7.5, 15.6, -36.6, 0.34));
  sunsetRayGroup.add(createSkyBand(40, 0.48, 0xfff3c4, 0.24, -13.8, 18.3, -36.4, 0.5));
  sunsetRayGroup.add(createSkyBand(34, 2.2, 0xff4f68, 0.13, 12, 19.4, -36.2, -0.16));
  sunsetRayGroup.add(createAtmosphereSprite(cloudTexture, -13.4, 18.2, -35.8, 12, 4.4, 0.26));
  sunsetRayGroup.add(createAtmosphereSprite(cloudTexture, 5.2, 21.4, -35.9, 14, 4.8, 0.22));
  scene.add(registerAtmosphereLayer(sunsetRayGroup, { golden: 1 }));

  springBloomGroup = new THREE.Group();
  springBloomGroup.add(createSkyBand(78, 7.5, 0xff77bd, 0.18, -2, 11.2, -38, -0.02));
  springBloomGroup.add(createSkyBand(52, 1.2, 0xffffff, 0.2, -11, 16.8, -37.1, 0.2));
  springBloomGroup.add(createAtmosphereSprite(blossomTexture, -23, 16.2, -35.8, 12.5, 7.2, 0.42));
  springBloomGroup.add(createAtmosphereSprite(blossomTexture, 12.5, 15.2, -35.9, 14.5, 7.8, 0.36));
  springBloomGroup.add(createAtmosphereSprite(cloudTexture, -2, 21.0, -36.2, 18, 5.6, 0.32));
  scene.add(registerAtmosphereLayer(springBloomGroup, { spring: 1, summer: 0.12 }));

  summerCloudGroup = new THREE.Group();
  summerCloudGroup.add(createAtmosphereSprite(sunHaloTexture, 21, 18.4, -35, 12.5, 12.5, 0.36));
  summerCloudGroup.add(createAtmosphereSprite(sunCoreTexture, 21, 18.4, -34.7, 3.4, 3.4, 0.74));
  [
    [-24, 17.8, -36, 12, 4.2],
    [-7.5, 19.2, -36.4, 10, 3.6],
    [16, 17.6, -36.1, 11.5, 4.1],
  ].forEach(([cloudX, cloudY, cloudZ, cloudScaleX, cloudScaleY]) => {
    summerCloudGroup.add(createAtmosphereSprite(cloudTexture, cloudX, cloudY, cloudZ, cloudScaleX, cloudScaleY, 0.46));
    summerCloudGroup.add(createAtmosphereSprite(cloudTexture, cloudX + 3.3, cloudY + 0.4, cloudZ, cloudScaleX * 0.62, cloudScaleY * 0.82, 0.38));
    summerCloudGroup.add(createAtmosphereSprite(cloudTexture, cloudX - 3.1, cloudY - 0.25, cloudZ, cloudScaleX * 0.7, cloudScaleY * 0.78, 0.34));
  });
  scene.add(registerAtmosphereLayer(summerCloudGroup, { summer: 1, golden: 0.16 }));

  autumnGlowGroup = new THREE.Group();
  autumnGlowGroup.add(createSkyBand(78, 11, 0xff5e3f, 0.28, -5, 10.6, -38, 0));
  autumnGlowGroup.add(createSkyBand(66, 3.4, 0xffd43f, 0.32, 2, 15.2, -37.4, -0.08));
  autumnGlowGroup.add(createSkyBand(44, 1.0, 0xc9362e, 0.2, -12, 19.4, -36.8, 0.18));
  autumnGlowGroup.add(createAtmosphereSprite(leafGlowTexture, -18, 14.6, -35.8, 13.5, 7.4, 0.42));
  autumnGlowGroup.add(createAtmosphereSprite(leafGlowTexture, 16, 16.2, -35.9, 15, 7.8, 0.36));
  scene.add(registerAtmosphereLayer(autumnGlowGroup, { autumn: 1, golden: 0.24 }));

  frostHazeGroup = new THREE.Group();
  frostHazeGroup.add(createSkyBand(76, 9, 0xdff7ff, 0.2, -2, 11.3, -38, 0));
  frostHazeGroup.add(createSkyBand(66, 3.2, 0xffffff, 0.15, -3, 6.8, -37.6, -0.03));
  frostHazeGroup.add(createSkyBand(48, 1.6, 0xff405f, 0.16, -13, 13.8, -37.2, 0.16));
  frostHazeGroup.add(createSkyBand(48, 1.5, 0x47c95b, 0.18, 14, 15.2, -37.3, -0.14));
  frostHazeGroup.add(createAtmosphereSprite(frostTexture, -18, 17.2, -35.7, 20, 8, 0.32));
  frostHazeGroup.add(createAtmosphereSprite(frostTexture, 17, 15.4, -35.8, 18, 7.5, 0.3));
  scene.add(registerAtmosphereLayer(frostHazeGroup, { winter: 1, night: 0.18 }));

  moonGroup = new THREE.Group();
  moonGroup.add(createAtmosphereSprite(moonTexture, -24, 21.4, -35.4, 13, 13, 0.54));
  moonGroup.add(createAtmosphereSprite(moonTexture, -24, 21.4, -35.1, 4.2, 4.2, 0.92));
  moonGroup.add(createSkyBand(50, 9, 0x245a9f, 0.22, 4, 11.3, -38, 0.02));
  scene.add(registerAtmosphereLayer(moonGroup, { night: 1, winter: 0.18 }));
}

function createSeasonalParticleSystem(modeName, countValue, colorValues, options = {}) {
  const particleGeometry = new THREE.PlaneGeometry(1, 1);
  const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const particleMesh = new THREE.InstancedMesh(particleGeometry, particleMaterial, countValue);
  particleMesh.frustumCulled = false;
  particleMesh.visible = false;

  const particleRecords = [];
  for (let particleIndex = 0; particleIndex < countValue; particleIndex += 1) {
    const particleRecord = {
      x: -34 + positiveSeededUnit(particleIndex, options.seed ?? 18) * 68,
      y: (options.minY ?? 2) + positiveSeededUnit(particleIndex, (options.seed ?? 18) + 1) * ((options.maxY ?? 24) - (options.minY ?? 2)),
      z: -24 + positiveSeededUnit(particleIndex, (options.seed ?? 18) + 2) * 48,
      speed: (options.speedMin ?? 0.55) + positiveSeededUnit(particleIndex, (options.seed ?? 18) + 3) * ((options.speedMax ?? 1.2) - (options.speedMin ?? 0.55)),
      drift: (positiveSeededUnit(particleIndex, (options.seed ?? 18) + 4) - 0.5) * (options.drift ?? 1.2),
      phase: positiveSeededUnit(particleIndex, (options.seed ?? 18) + 5) * Math.PI * 2,
      spin: (positiveSeededUnit(particleIndex, (options.seed ?? 18) + 6) - 0.5) * (options.spin ?? 4.2),
      sizeX: (options.sizeX ?? 0.18) * (0.72 + positiveSeededUnit(particleIndex, (options.seed ?? 18) + 7) * 0.66),
      sizeY: (options.sizeY ?? 0.09) * (0.72 + positiveSeededUnit(particleIndex, (options.seed ?? 18) + 8) * 0.66),
    };
    particleRecords.push(particleRecord);
    particleMesh.setColorAt(particleIndex, new THREE.Color(colorValues[particleIndex % colorValues.length]));
  }
  if (particleMesh.instanceColor) {
    particleMesh.instanceColor.needsUpdate = true;
  }

  scene.add(particleMesh);
  seasonalParticleSystems.push({
    modeName,
    mesh: particleMesh,
    material: particleMaterial,
    records: particleRecords,
    minY: options.minY ?? 2,
    maxY: options.maxY ?? 24,
    opacity: options.opacity ?? 0.85,
    seed: options.seed ?? 18,
    drift: options.drift ?? 1.2,
    verticalDirection: options.verticalDirection ?? -1,
  });
}

function createAtmosphereEffects() {
  const snowCount = 1680;
  const snowPositions = new Float32Array(snowCount * 3);
  for (let snowIndex = 0; snowIndex < snowCount; snowIndex += 1) {
    snowPositions[snowIndex * 3] = -35 + positiveSeededUnit(snowIndex, 1) * 70;
    snowPositions[snowIndex * 3 + 1] = 2.4 + positiveSeededUnit(snowIndex, 2) * 26;
    snowPositions[snowIndex * 3 + 2] = -25 + positiveSeededUnit(snowIndex, 3) * 50;
  }
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const snowMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.26,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  snowPoints = new THREE.Points(snowGeometry, snowMaterial);
  snowPoints.frustumCulled = false;
  snowPoints.visible = false;
  scene.add(snowPoints);

  const starCount = 180;
  const starPositions = new Float32Array(starCount * 3);
  for (let starIndex = 0; starIndex < starCount; starIndex += 1) {
    starPositions[starIndex * 3] = -54 + positiveSeededUnit(starIndex, 4) * 108;
    starPositions[starIndex * 3 + 1] = 18 + positiveSeededUnit(starIndex, 5) * 28;
    starPositions[starIndex * 3 + 2] = -42 + positiveSeededUnit(starIndex, 6) * 58;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.28,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  starPoints = new THREE.Points(starGeometry, starMaterial);
  starPoints.visible = false;
  scene.add(starPoints);

  createSeasonalParticleSystem("spring", 160, [0xff8fc3, 0xffffff, 0xffd1e3], {
    minY: 2.4,
    maxY: 20,
    speedMin: 0.46,
    speedMax: 1.05,
    drift: 0.8,
    spin: 2.6,
    sizeX: 0.16,
    sizeY: 0.08,
    opacity: 0.7,
    seed: 31,
  });
  createSeasonalParticleSystem("summer", 180, [0xfff3c4, 0xffffff, 0x63beff, 0xff8fc3], {
    minY: 1.8,
    maxY: 19,
    speedMin: 0.34,
    speedMax: 0.86,
    drift: 1.55,
    spin: 2.2,
    sizeX: 0.14,
    sizeY: 0.14,
    opacity: 0.58,
    seed: 47,
    verticalDirection: 1,
  });
  createSeasonalParticleSystem("autumn", 260, [0xffce2e, 0xff8d55, 0xef4343, 0xb9582f], {
    minY: 2.1,
    maxY: 24,
    speedMin: 0.8,
    speedMax: 1.95,
    drift: 2.1,
    spin: 5.8,
    sizeX: 0.24,
    sizeY: 0.12,
    opacity: 0.86,
    seed: 63,
  });

  createSeasonSkyEffects();
  createFestiveLights();
  createHolidayFeature();
}

function createSceneryInstances() {
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d6638,
    roughness: 0.88,
    metalness: 0.01,
  });
  const whiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.01,
  });
  const canopyMaterial = whiteMaterial.clone();
  const flowerMaterial = whiteMaterial.clone();
  const lampHeadMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: toyPalette.trackSignal,
    emissiveIntensity: 0.18,
    roughness: 0.26,
    metalness: 0.02,
  });
  const darkPostMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.darkBlue,
    roughness: 0.5,
    metalness: 0.08,
  });
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: toyPalette.green,
    roughness: 0.9,
    metalness: 0,
  });
  const benchWoodMaterial = new THREE.MeshStandardMaterial({
    color: 0xc28f50,
    roughness: 0.88,
    metalness: 0.01,
  });
  const houseMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.02,
  });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: toyPalette.trackSignal,
    emissiveIntensity: 0.24,
    roughness: 0.18,
    metalness: 0.02,
  });
  const boatCabinMaterial = new THREE.MeshStandardMaterial({
    color: 0xeaffff,
    roughness: 0.22,
    metalness: 0.03,
  });
  visualRefs.lampHeadMaterial = lampHeadMaterial;
  visualRefs.windowMaterial = windowMaterial;

  scene.add(buildInstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), trunkMaterial, instanceStore.treeTrunkMatrices));
  visualRefs.treeCanopyMesh = buildInstancedMesh(
    new THREE.SphereGeometry(0.5, 14, 12),
    canopyMaterial,
    instanceStore.treeCanopyMatrices,
    instanceStore.treeCanopyColors,
  );
  scene.add(visualRefs.treeCanopyMesh);
  scene.add(buildInstancedMesh(new THREE.BoxGeometry(1, 1, 1), stemMaterial, instanceStore.flowerStemMatrices));
  visualRefs.flowerHeadMesh = buildInstancedMesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    flowerMaterial,
    instanceStore.flowerHeadMatrices,
    instanceStore.flowerHeadColors,
  );
  scene.add(visualRefs.flowerHeadMesh);
  scene.add(buildInstancedMesh(new THREE.BoxGeometry(1, 1, 1), darkPostMaterial, instanceStore.lampPostMatrices));
  scene.add(buildInstancedMesh(new THREE.SphereGeometry(0.5, 12, 10), lampHeadMaterial, instanceStore.lampHeadMatrices, instanceStore.lampHeadColors));
  scene.add(buildInstancedMesh(new THREE.BoxGeometry(1, 1, 1), darkPostMaterial, instanceStore.benchLegMatrices));
  scene.add(buildInstancedMesh(new THREE.BoxGeometry(1, 1, 1), benchWoodMaterial, instanceStore.benchSeatMatrices));
  scene.add(buildInstancedMesh(new THREE.BoxGeometry(1, 1, 1), houseMaterial, instanceStore.houseBodyMatrices, instanceStore.houseBodyColors));
  scene.add(buildInstancedMesh(new THREE.BoxGeometry(1, 1, 1), houseMaterial, instanceStore.houseRoofMatrices, instanceStore.houseRoofColors));
  scene.add(buildInstancedMesh(new THREE.BoxGeometry(1, 1, 1), windowMaterial, instanceStore.windowMatrices, instanceStore.windowColors));
  animatedInstanceRefs.boatBodyMesh = buildInstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    houseMaterial,
    instanceStore.boatBodyMatrices,
    instanceStore.boatBodyColors,
  );
  animatedInstanceRefs.boatCabinMesh = buildInstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    boatCabinMaterial,
    instanceStore.boatCabinMatrices,
  );
  scene.add(animatedInstanceRefs.boatBodyMesh);
  scene.add(animatedInstanceRefs.boatCabinMesh);
}

function addToyWheel(targetGroup, xValue, yValue, zValue, wheelColor = toyPalette.darkBlue) {
  const wheelMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16),
    new THREE.MeshStandardMaterial({
      color: wheelColor,
      roughness: 0.42,
      metalness: 0.05,
    }),
  );
  wheelMesh.position.set(xValue, yValue, zValue);
  wheelMesh.rotation.z = Math.PI * 0.5;
  targetGroup.add(wheelMesh);
  trainWheelRecords.push({ mesh: wheelMesh });
  return wheelMesh;
}

function addTrainWindow(targetGroup, xValue, yValue, zValue, rotationYValue = 0) {
  const windowMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.035),
    new THREE.MeshStandardMaterial({
      color: 0xeafcff,
      emissive: toyPalette.trackSignal,
      emissiveIntensity: 0.26,
      roughness: 0.2,
      metalness: 0.02,
    }),
  );
  windowMesh.position.set(xValue, yValue, zValue);
  windowMesh.rotation.y = rotationYValue;
  targetGroup.add(windowMesh);
  return windowMesh;
}

function createToyLocomotive(bodyColor, roofColor) {
  const group = new THREE.Group();

  const wheelBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.4, 2.55),
    new THREE.MeshStandardMaterial({
      color: toyPalette.darkBlue,
      roughness: 0.5,
      metalness: 0.05,
    }),
  );
  wheelBase.position.set(0, 0.22, 0);
  group.add(wheelBase);

  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 0.9, 1.5),
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.54,
      metalness: 0.03,
    }),
  );
  bodyMesh.position.set(0, 0.84, -0.18);
  group.add(bodyMesh);

  [-0.535, 0.535].forEach((sideX) => {
    addBoxToGroup(group, 0.035, 0.08, 1.24, toyPalette.trackSignal, sideX, 1.06, -0.18, {
      roughness: 0.24,
      metalness: 0.06,
    });
    addBoxToGroup(group, 0.032, 0.06, 1.08, toyPalette.cream, sideX, 0.68, -0.2, {
      roughness: 0.28,
      metalness: 0.03,
    });
  });

  const cabMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.94, 0.82, 0.82),
    new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.52,
      metalness: 0.03,
    }),
  );
  cabMesh.position.set(0, 0.95, 0.86);
  group.add(cabMesh);

  const chimneyMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.17, 0.7, 10),
    new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.46,
      metalness: 0.03,
    }),
  );
  chimneyMesh.position.set(0, 1.38, -0.62);
  group.add(chimneyMesh);

  const roofMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 0.12, 0.96),
    new THREE.MeshStandardMaterial({
      color: toyPalette.cream,
      roughness: 0.48,
      metalness: 0.02,
    }),
  );
  roofMesh.position.set(0, 1.42, 0.86);
  group.add(roofMesh);
  addBoxToGroup(group, 0.72, 0.035, 0.84, 0xffffff, 0, 1.5, 0.86, { roughness: 0.28, metalness: 0.06 });

  [-0.72, 0.72].forEach((wheelX) => {
    [-0.88, 0.18, 1.03].forEach((wheelZ) => {
      addToyWheel(group, wheelX, 0.24, wheelZ);
    });
  });
  addTrainWindow(group, -0.53, 0.95, 0.88, Math.PI * 0.5);
  addTrainWindow(group, 0.53, 0.95, 0.88, -Math.PI * 0.5);

  const headlightMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0xfff2a7,
      emissive: 0xffe166,
      emissiveIntensity: 0.72,
      roughness: 0.24,
      metalness: 0.02,
    }),
  );
  headlightMesh.position.set(0, 0.82, -1.02);
  group.add(headlightMesh);
  trainHeadlightRecords.push({ mesh: headlightMesh, phase: bodyColor * 0.00001 });

  [-0.28, 0.28].forEach((markerX) => {
    const markerMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xfff2a7,
        emissiveIntensity: 0.5,
        roughness: 0.22,
        metalness: 0.02,
      }),
    );
    markerMesh.position.set(markerX, 0.68, -1.04);
    group.add(markerMesh);
    trainHeadlightRecords.push({ mesh: markerMesh, phase: markerX + bodyColor * 0.00001 });
  });

  return group;
}

function createToyCarriage(bodyColor, roofColor) {
  const group = new THREE.Group();

  const baseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.34, 2.04),
    new THREE.MeshStandardMaterial({
      color: toyPalette.darkBlue,
      roughness: 0.48,
      metalness: 0.05,
    }),
  );
  baseMesh.position.set(0, 0.18, 0);
  group.add(baseMesh);

  const cabinMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 0.84, 1.7),
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.54,
      metalness: 0.03,
    }),
  );
  cabinMesh.position.set(0, 0.72, 0);
  group.add(cabinMesh);

  [-0.535, 0.535].forEach((sideX) => {
    addBoxToGroup(group, 0.035, 0.07, 1.5, toyPalette.trackSignal, sideX, 0.96, 0, {
      roughness: 0.24,
      metalness: 0.06,
    });
  });

  const roofMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.12, 0.16, 1.84),
    new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.48,
      metalness: 0.03,
    }),
  );
  roofMesh.position.set(0, 1.18, 0);
  group.add(roofMesh);
  addBoxToGroup(group, 0.74, 0.035, 1.48, 0xffffff, 0, 1.28, 0, { roughness: 0.26, metalness: 0.06 });

  [-0.71, 0.71].forEach((wheelX) => {
    [-0.66, 0.66].forEach((wheelZ) => {
      addToyWheel(group, wheelX, 0.21, wheelZ);
    });
  });
  [-0.48, 0.05, 0.58].forEach((windowZ) => {
    addTrainWindow(group, -0.54, 0.78, windowZ, Math.PI * 0.5);
    addTrainWindow(group, 0.54, 0.78, windowZ, -Math.PI * 0.5);
  });

  return group;
}

function createTubeCar(bodyColor) {
  const group = new THREE.Group();

  const lowerBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.08, 0.58, 2.12),
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.46,
      metalness: 0.03,
    }),
  );
  lowerBody.position.set(0, 0.56, 0);
  group.add(lowerBody);

  const upperBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.46, 1.96),
    new THREE.MeshStandardMaterial({
      color: 0xf7fafc,
      roughness: 0.2,
      metalness: 0.02,
    }),
  );
  upperBody.position.set(0, 0.98, 0);
  group.add(upperBody);

  [-0.475, 0.475].forEach((sideX) => {
    addBoxToGroup(group, 0.028, 0.07, 1.72, toyPalette.trackSignal, sideX, 1.17, 0, {
      roughness: 0.2,
      metalness: 0.06,
    });
    addBoxToGroup(group, 0.03, 0.06, 1.72, toyPalette.blue, sideX, 0.78, 0, {
      roughness: 0.28,
      metalness: 0.05,
    });
  });

  const roofMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.2, 1.82),
    new THREE.MeshStandardMaterial({
      color: toyPalette.blue,
      roughness: 0.42,
      metalness: 0.03,
    }),
  );
  roofMesh.position.set(0, 1.32, 0);
  group.add(roofMesh);
  addBoxToGroup(group, 0.48, 0.035, 1.48, 0xffffff, 0, 1.44, 0, { roughness: 0.22, metalness: 0.07 });

  const undercarriage = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.24, 2.02),
    new THREE.MeshStandardMaterial({
      color: toyPalette.darkBlue,
      roughness: 0.46,
      metalness: 0.05,
    }),
  );
  undercarriage.position.set(0, 0.16, 0);
  group.add(undercarriage);

  [-0.66, 0.66].forEach((wheelX) => {
    [-0.72, 0.72].forEach((wheelZ) => {
      addToyWheel(group, wheelX, 0.2, wheelZ, 0x243f68);
    });
  });
  [-0.58, 0, 0.58].forEach((windowZ) => {
    addTrainWindow(group, -0.49, 0.98, windowZ, Math.PI * 0.5);
    addTrainWindow(group, 0.49, 0.98, windowZ, -Math.PI * 0.5);
  });

  return group;
}

function createDocklandsCar(bodyColor) {
  const group = new THREE.Group();

  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 0.72, 1.76),
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.44,
      metalness: 0.03,
    }),
  );
  bodyMesh.position.set(0, 0.68, 0);
  group.add(bodyMesh);

  const glassMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.84, 0.36, 1.42),
    new THREE.MeshStandardMaterial({
      color: 0xeafcff,
      roughness: 0.14,
      metalness: 0.02,
      transparent: true,
      opacity: 0.82,
    }),
  );
  glassMesh.position.set(0, 1.04, 0);
  group.add(glassMesh);

  [-0.52, 0.52].forEach((sideX) => {
    addBoxToGroup(group, 0.028, 0.08, 1.34, toyPalette.trackSignal, sideX, 1.28, 0, {
      roughness: 0.2,
      metalness: 0.06,
    });
  });

  const baseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 0.24, 1.88),
    new THREE.MeshStandardMaterial({
      color: toyPalette.darkBlue,
      roughness: 0.46,
      metalness: 0.05,
    }),
  );
  baseMesh.position.set(0, 0.16, 0);
  group.add(baseMesh);
  addBoxToGroup(group, 0.72, 0.045, 1.2, 0xffffff, 0, 1.27, 0, { roughness: 0.2, metalness: 0.08 });

  [-0.62, 0.62].forEach((wheelX) => {
    [-0.55, 0.55].forEach((wheelZ) => {
      addToyWheel(group, wheelX, 0.19, wheelZ, 0x243f68);
    });
  });
  addTrainWindow(group, -0.52, 1.04, 0, Math.PI * 0.5);
  addTrainWindow(group, 0.52, 1.04, 0, -Math.PI * 0.5);

  return group;
}

function buildTrainCars(vehicleType) {
  if (vehicleType === "toy") {
    return [
      createToyLocomotive(toyPalette.red, toyPalette.yellow),
      createToyCarriage(toyPalette.red, toyPalette.blue),
      createToyCarriage(toyPalette.yellow, toyPalette.red),
    ];
  }

  if (vehicleType === "tube") {
    return [
      createTubeCar(toyPalette.red),
      createTubeCar(toyPalette.red),
      createTubeCar(toyPalette.red),
      createTubeCar(toyPalette.red),
    ];
  }

  return [
    createDocklandsCar(toyPalette.yellow),
    createDocklandsCar(0x67d1ff),
  ];
}

function initializeTrainHistory(trainRecord) {
  const activeSegment = trainRecord.route.segments[trainRecord.segmentKey];
  const initialRatio = activeSegment.length === 0 ? 0 : trainRecord.distanceOnSegment / activeSegment.length;
  const initialPosition = activeSegment.curve.getPointAt(initialRatio);
  const initialTangent = activeSegment.curve.getTangentAt(initialRatio).normalize();

  trainRecord.history = [];
  trainRecord.totalDistance = 0;

  for (let historyIndex = 0; historyIndex < 280; historyIndex += 1) {
    trainRecord.history.push({
      distance: -historyIndex * 0.2,
      position: initialPosition.clone(),
      tangent: initialTangent.clone(),
    });
  }
}

function advanceTrainRecord(trainRecord, distanceValue, routeState) {
  let remainingDistance = distanceValue;

  while (remainingDistance > 0) {
    const activeSegment = trainRecord.route.segments[trainRecord.segmentKey];
    const segmentDistanceRemaining = activeSegment.length - trainRecord.distanceOnSegment;

    if (remainingDistance < segmentDistanceRemaining) {
      trainRecord.distanceOnSegment += remainingDistance;
      remainingDistance = 0;
      break;
    }

    remainingDistance -= segmentDistanceRemaining;
    trainRecord.segmentKey = trainRecord.route.getNextSegmentKey(trainRecord.segmentKey, routeState);
    trainRecord.distanceOnSegment = 0;
  }

  trainRecord.totalDistance += distanceValue;
  const updatedSegment = trainRecord.route.segments[trainRecord.segmentKey];
  const updatedRatio = updatedSegment.length === 0 ? 0 : trainRecord.distanceOnSegment / updatedSegment.length;
  const updatedPosition = updatedSegment.curve.getPointAt(updatedRatio);
  const updatedTangent = updatedSegment.curve.getTangentAt(updatedRatio).normalize();

  trainRecord.history.unshift({
    distance: trainRecord.totalDistance,
    position: updatedPosition.clone(),
    tangent: updatedTangent.clone(),
  });

  while (
    trainRecord.history.length > 640 ||
    (trainRecord.history.length > 2 && trainRecord.totalDistance - trainRecord.history[trainRecord.history.length - 1].distance > 56)
  ) {
    trainRecord.history.pop();
  }
}

function sampleTrainHistory(trainRecord, offsetDistance) {
  const targetDistance = trainRecord.totalDistance - offsetDistance;
  let earlierSample = trainRecord.history[trainRecord.history.length - 1];
  let laterSample = trainRecord.history[0];

  for (let sampleIndex = 0; sampleIndex < trainRecord.history.length - 1; sampleIndex += 1) {
    const currentSample = trainRecord.history[sampleIndex];
    const nextSample = trainRecord.history[sampleIndex + 1];

    if (currentSample.distance >= targetDistance && nextSample.distance <= targetDistance) {
      laterSample = currentSample;
      earlierSample = nextSample;
      break;
    }
  }

  const sampleSpan = laterSample.distance - earlierSample.distance;
  const interpolationValue = sampleSpan <= 0.0001 ? 0 : (targetDistance - earlierSample.distance) / sampleSpan;
  const sampledPosition = earlierSample.position.clone().lerp(laterSample.position, interpolationValue);
  const sampledTangent = earlierSample.tangent.clone().lerp(laterSample.tangent, interpolationValue).normalize();

  return {
    position: sampledPosition,
    tangent: sampledTangent,
  };
}

function positionCarGroup(carGroup, carPosition, carTangent) {
  carGroup.position.copy(carPosition);
  orientationHelper.position.copy(carPosition);
  lookAtScratch.copy(carPosition).add(carTangent);
  orientationHelper.lookAt(lookAtScratch);
  carGroup.quaternion.copy(orientationHelper.quaternion);
}

function createTrainRecord(routeDefinition, vehicleType, initialPhase, baseSpeed, spacingValue, labelValue) {
  const trainGroup = new THREE.Group();
  scene.add(trainGroup);
  const glowColor = vehicleType === "docklands" ? 0xffdc6c : vehicleType === "tube" ? 0x63beff : 0xff4f68;

  const trainGlowMesh = new THREE.Mesh(
    new THREE.CircleGeometry(1.42, 40),
    new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  trainGlowMesh.rotation.x = -Math.PI * 0.5;
  trainGlowMesh.visible = false;
  scene.add(trainGlowMesh);

  const headlightSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createRadialTexture([
        [0, "rgba(255, 255, 230, 1)"],
        [0.35, "rgba(255, 220, 108, 0.62)"],
        [1, "rgba(255, 220, 108, 0)"],
      ]),
      color: glowColor,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  headlightSprite.visible = false;
  scene.add(headlightSprite);

  const trainHaloMesh = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.46, 36),
    new THREE.MeshBasicMaterial({
      color: 0xffdc6c,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  trainHaloMesh.rotation.x = -Math.PI * 0.5;
  trainHaloMesh.visible = false;
  scene.add(trainHaloMesh);

  const trainCars = buildTrainCars(vehicleType);
  trainCars.forEach((carGroup) => {
    trainGroup.add(carGroup);
  });

  const trainRecord = {
    label: labelValue,
    route: routeDefinition,
    vehicleType,
    segmentKey: routeDefinition.startingSegmentKey,
    distanceOnSegment: 0,
    totalDistance: 0,
    baseSpeed,
    carSpacing: spacingValue,
    trainGroup,
    trainCars,
    haloMesh: trainHaloMesh,
    glowMesh: trainGlowMesh,
    headlightSprite,
    history: [],
    visible: true,
  };

  initializeTrainHistory(trainRecord);

  const defaultRouteState = {
    westTunnelActive: false,
    eastFlyoverActive: false,
  };
  const targetDistance = computeRouteLength(routeDefinition, defaultRouteState) * initialPhase;
  const integrationStep = 0.22;

  for (let coveredDistance = 0; coveredDistance < targetDistance; coveredDistance += integrationStep) {
    const remainingStep = Math.min(integrationStep, targetDistance - coveredDistance);
    advanceTrainRecord(trainRecord, remainingStep, defaultRouteState);
  }

  return trainRecord;
}

const trainFleet = [
  createTrainRecord(outerRoute, "toy", 0.03, 4.18, 2.22, "Scarlet One"),
  createTrainRecord(tubeRoute, "tube", 0.11, 3.44, 2.02, "Tube Eastbound"),
  createTrainRecord(outerRoute, "toy", 0.27, 4.18, 2.22, "Scarlet Two"),
  createTrainRecord(docklandsRoute, "docklands", 0.38, 2.86, 1.8, "Docklands Shuttle"),
  createTrainRecord(outerRoute, "toy", 0.52, 4.18, 2.22, "Scarlet Three"),
  createTrainRecord(tubeRoute, "tube", 0.63, 3.44, 2.02, "Tube Westbound"),
  createTrainRecord(outerRoute, "toy", 0.77, 4.18, 2.22, "Scarlet Four"),
  createTrainRecord(docklandsRoute, "docklands", 0.86, 2.86, 1.8, "Docklands Hopper"),
];

function ensureSelectedTrainVisible() {
  if (appState.selectedTrainIndex >= appState.trainCount) {
    appState.selectedTrainIndex = Math.max(0, appState.trainCount - 1);
  }
}

function updateTrainHaloVisibility() {
  trainFleet.forEach((trainRecord, trainIndex) => {
    trainRecord.haloMesh.visible = trainRecord.visible && trainIndex === appState.selectedTrainIndex;
  });
}

function updateTrainVisibility() {
  ensureSelectedTrainVisible();
  trainFleet.forEach((trainRecord, trainIndex) => {
    const visibleValue = trainIndex < appState.trainCount;
    trainRecord.visible = visibleValue;
    trainRecord.trainGroup.visible = visibleValue;
    if (!visibleValue) {
      trainRecord.haloMesh.visible = false;
      trainRecord.glowMesh.visible = false;
      trainRecord.headlightSprite.visible = false;
    }
  });
  updateTrainHaloVisibility();
}

function getFollowTrain() {
  const selectedTrain = trainFleet[appState.selectedTrainIndex];
  if (selectedTrain?.visible) {
    return selectedTrain;
  }

  return trainFleet.find((trainRecord) => trainRecord.visible) ?? trainFleet[0];
}

function selectNextVisibleTrain() {
  const visibleTrainIndexes = trainFleet
    .map((trainRecord, trainIndex) => (trainRecord.visible ? trainIndex : -1))
    .filter((trainIndex) => trainIndex >= 0);

  if (!visibleTrainIndexes.length) {
    return;
  }

  const currentVisibleIndex = visibleTrainIndexes.indexOf(appState.selectedTrainIndex);
  appState.selectedTrainIndex = visibleTrainIndexes[(currentVisibleIndex + 1) % visibleTrainIndexes.length];
  updateTrainHaloVisibility();
}

function resolveCameraPreset(presetName) {
  const presetValue = cameraPresets[presetName];
  const useMobilePreset = window.innerWidth <= 720;
  return {
    position: useMobilePreset && presetValue.mobilePosition ? presetValue.mobilePosition : presetValue.position,
    target: useMobilePreset && presetValue.mobileTarget ? presetValue.mobileTarget : presetValue.target,
  };
}

function setCameraPreset(presetName) {
  const presetValue = resolveCameraPreset(presetName);
  cameraState.desiredPosition.copy(presetValue.position);
  cameraState.desiredTarget.copy(presetValue.target);
  cameraState.presetMode = true;
  cameraState.userIsOrbiting = false;
  cameraState.lastPresetName = presetName;
  setTrainCameraMode("none");
  orbitControls.enabled = true;

  presetButtons.forEach((buttonElement) => {
    buttonElement.classList.toggle("is-active", buttonElement.dataset.preset === presetName);
  });
}

function setTrainCameraMode(modeName) {
  appState.followTrainActive = modeName === "follow";
  appState.povTrainActive = modeName === "pov";
  followTrainButton?.classList.toggle("is-active", appState.followTrainActive);
  povTrainButton?.classList.toggle("is-active", appState.povTrainActive);
  if (hudPanel) {
    hudPanel.classList.toggle("is-pov", appState.povTrainActive);
  }
  document.body.classList.toggle("is-pov", appState.povTrainActive);
  if (povTrainButton) {
    povTrainButton.textContent = appState.povTrainActive ? "Next POV" : "Train POV";
  }
  if (driverCab) {
    driverCab.group.visible = appState.povTrainActive;
  }
  if (!appState.povTrainActive) {
    cabDragState.activeControl = null;
    cabDragState.pointerId = null;
    renderer.domElement.style.cursor = "";
  }
  orbitControls.enabled = !appState.povTrainActive;
  camera.fov = appState.povTrainActive ? 60 : window.innerWidth <= 720 ? 52 : 42;
  camera.updateProjectionMatrix();
}

function releaseCameraToOrbit() {
  cameraState.presetMode = false;
  cameraState.userIsOrbiting = true;
  setTrainCameraMode("none");
  presetButtons.forEach((buttonElement) => {
    buttonElement.classList.remove("is-active");
  });
  orbitControls.enabled = true;
}

orbitControls.addEventListener("start", releaseCameraToOrbit);

function setMaterialColor(materialList, colorValue) {
  materialList.forEach((materialValue) => {
    materialValue.color.setHex(colorValue);
  });
}

function recolorInstancedMesh(instancedMesh, colorPalette) {
  if (!instancedMesh) {
    return;
  }

  for (let instanceIndex = 0; instanceIndex < instancedMesh.count; instanceIndex += 1) {
    instancedMesh.setColorAt(instanceIndex, new THREE.Color(colorPalette[instanceIndex % colorPalette.length]));
  }
  instancedMesh.instanceColor.needsUpdate = true;
}

function updateSceneModeButtons() {
  sceneModeButtons.forEach((buttonElement) => {
    buttonElement.classList.toggle("is-active", buttonElement.dataset.sceneMode === appState.sceneMode);
  });
  if (autoShowButton) {
    autoShowButton.classList.toggle("is-active", appState.autoShowActive);
  }
  if (hudPanel) {
    Object.keys(sceneModeConfigs).forEach((modeName) => {
      hudPanel.classList.toggle(`is-mode-${modeName}`, appState.sceneMode === modeName);
    });
  }
}

function updateAutoShowProgress(progressValue = 0) {
  if (!autoShowButton) {
    return;
  }

  const progressDegrees = THREE.MathUtils.clamp(progressValue, 0, 1) * 360;
  autoShowButton.style.setProperty("--auto-tour-progress", `${progressDegrees}deg`);
}

function applySceneMode(modeName) {
  const sceneModeConfig = sceneModeConfigs[modeName] ?? sceneModeConfigs.spring;

  scene.background.setHex(sceneModeConfig.sky);
  document.documentElement.style.setProperty("--sky-top", sceneModeConfig.cssSkyTop);
  document.documentElement.style.setProperty("--sky-bottom", sceneModeConfig.cssSkyBottom);
  renderer.toneMappingExposure = sceneModeConfig.exposure;

  hemisphereLight.color.setHex(sceneModeConfig.hemiSky);
  hemisphereLight.groundColor.setHex(sceneModeConfig.hemiGround);
  hemisphereLight.intensity = sceneModeConfig.hemiIntensity;
  mainSunLight.color.setHex(sceneModeConfig.sun);
  mainSunLight.intensity = sceneModeConfig.sunIntensity;
  if (sceneModeConfig.sunPosition) {
    mainSunLight.position.set(...sceneModeConfig.sunPosition);
  }
  fillSunLight.color.setHex(sceneModeConfig.fill);
  fillSunLight.intensity = sceneModeConfig.fillIntensity;
  if (sceneModeConfig.fillPosition) {
    fillSunLight.position.set(...sceneModeConfig.fillPosition);
  }

  setMaterialColor(visualRefs.roomFloorMaterials, sceneModeConfig.roomFloor);
  setMaterialColor(visualRefs.rugMaterials, sceneModeConfig.rug);
  setMaterialColor(visualRefs.tableMaterials, sceneModeConfig.tableWood);
  setMaterialColor(visualRefs.tableTrimMaterials, sceneModeConfig.tableTrim);
  setMaterialColor(visualRefs.grassMaterials, sceneModeConfig.ground);
  setMaterialColor(visualRefs.parkMaterials, sceneModeConfig.park);
  setMaterialColor(visualRefs.parkBorderMaterials, sceneModeConfig.parkBorder);
  setMaterialColor(visualRefs.waterMaterials, sceneModeConfig.river);
  setMaterialColor(visualRefs.riverBankMaterials, sceneModeConfig.bank);
  setMaterialColor(visualRefs.promenadeMaterials, sceneModeConfig.promenade);

  recolorInstancedMesh(visualRefs.treeCanopyMesh, sceneModeConfig.trees);
  recolorInstancedMesh(visualRefs.flowerHeadMesh, sceneModeConfig.flowers);

  if (visualRefs.flowerHeadMesh) {
    visualRefs.flowerHeadMesh.visible = modeName !== "night";
  }
  if (visualRefs.lampHeadMaterial) {
    visualRefs.lampHeadMaterial.emissiveIntensity = sceneModeConfig.festiveLights ? 0.62 : 0.18;
  }
  if (visualRefs.windowMaterial) {
    visualRefs.windowMaterial.emissiveIntensity = sceneModeConfig.festiveLights ? 0.58 : 0.24;
  }
  if (snowPoints) {
    snowPoints.visible = sceneModeConfig.snowOpacity > 0.01;
    snowPoints.material.opacity = sceneModeConfig.snowOpacity;
  }
  if (starPoints) {
    starPoints.visible = sceneModeConfig.starsOpacity > 0.01;
    starPoints.material.opacity = sceneModeConfig.starsOpacity;
  }
  festiveLightRecords.forEach((lightRecord) => {
    lightRecord.mesh.visible = sceneModeConfig.festiveLights;
  });
  if (holidayFeatureGroup) {
    holidayFeatureGroup.visible = sceneModeConfig.holidayFeature;
  }
  applyAtmosphereMode(modeName);
}

function setSceneMode(modeName, options = {}) {
  if (!sceneModeConfigs[modeName]) {
    return;
  }

  if (!options.keepAuto) {
    appState.autoShowActive = false;
    updateAutoShowProgress(0);
  }

  appState.sceneMode = modeName;
  const modeIndex = sceneModeOrder.indexOf(modeName);
  appState.autoShowModeIndex = modeIndex >= 0 ? modeIndex : 0;
  const routeConfig = sceneModeConfigs[modeName].route;
  appState.westTunnelActive = routeConfig.westTunnelActive;
  appState.eastFlyoverActive = routeConfig.eastFlyoverActive;

  applySceneMode(modeName);
  updateRouteLabel();
  updateSceneModeButtons();
}

function getCurrentRoutePhase() {
  if (appState.westTunnelActive && appState.eastFlyoverActive) {
    return 2;
  }
  if (appState.westTunnelActive) {
    return 1;
  }
  if (appState.eastFlyoverActive) {
    return 3;
  }
  return 0;
}

function toggleAutoShow() {
  appState.autoShowActive = !appState.autoShowActive;
  if (appState.autoShowActive) {
    const currentModeIndex = sceneModeOrder.indexOf(appState.sceneMode);
    const nextModeIndex = ((currentModeIndex >= 0 ? currentModeIndex : 0) + 1) % sceneModeOrder.length;
    appState.autoShowStartedAt = latestElapsedTime;
    appState.autoShowBaseModeIndex = nextModeIndex;
    appState.autoShowModeIndex = nextModeIndex;
    setSceneMode(sceneModeOrder[nextModeIndex], { keepAuto: true });
    appState.autoShowBaseRoutePhase = getCurrentRoutePhase();
    appState.autoShowRouteStartedAt = latestElapsedTime;
    updateAutoShowProgress(0);
  } else {
    updateAutoShowProgress(0);
  }
  updateSceneModeButtons();
}

function updateRouteLabel() {
  const sceneModeConfig = sceneModeConfigs[appState.sceneMode] ?? sceneModeConfigs.spring;
  if (routeReadout) {
    routeReadout.textContent = sceneModeConfig.label;
  }
}

function updateBoatInstances(elapsedTime) {
  if (!animatedInstanceRefs.boatBodyMesh || !animatedInstanceRefs.boatCabinMesh) {
    return;
  }

  boatAnimationRecords.forEach((boatRecord) => {
    const animatedRatio = (boatRecord.ratio + elapsedTime * boatRecord.speed) % 1;
    const boatPosition = boatRecord.curve.getPointAt(animatedRatio);
    const boatTangent = boatRecord.curve.getTangentAt(animatedRatio).normalize();
    const boatQuaternion = new THREE.Quaternion();
    orientationHelper.position.copy(boatPosition);
    lookAtScratch.copy(boatPosition).add(boatTangent);
    orientationHelper.lookAt(lookAtScratch);
    boatQuaternion.copy(orientationHelper.quaternion);

    const bodyMatrix = composeMatrixFromPosition(
      new THREE.Vector3(boatPosition.x, waterSurfaceY + 0.16, boatPosition.z),
      boatQuaternion,
      new THREE.Vector3(1.2, 0.28, 0.56),
    );
    animatedInstanceRefs.boatBodyMesh.setMatrixAt(boatRecord.bodyIndex, bodyMatrix);

    const cabinMatrix = composeMatrixFromPosition(
      new THREE.Vector3(boatPosition.x, waterSurfaceY + 0.44, boatPosition.z),
      boatQuaternion,
      new THREE.Vector3(0.52, 0.26, 0.38),
    );
    animatedInstanceRefs.boatCabinMesh.setMatrixAt(boatRecord.cabinIndex, cabinMatrix);
  });

  animatedInstanceRefs.boatBodyMesh.instanceMatrix.needsUpdate = true;
  animatedInstanceRefs.boatCabinMesh.instanceMatrix.needsUpdate = true;
}

function updateRiverShips(elapsedTime) {
  riverShipRecords.forEach((shipRecord) => {
    const shipRatio = (shipRecord.ratio + elapsedTime * shipRecord.speed) % 1;
    const shipPosition = shipRecord.curve.getPointAt(shipRatio);
    const shipTangent = shipRecord.curve.getTangentAt(shipRatio).normalize();
    shipRecord.group.position.set(
      shipPosition.x,
      waterSurfaceY + 0.2 + Math.sin(elapsedTime * 1.8 + shipRecord.bobPhase) * 0.035,
      shipPosition.z,
    );
    setYawRotationFromTangent(shipRecord.group, shipTangent);
    shipRecord.group.scale.setScalar(shipRecord.scale);
    shipRecord.wakeMeshes.forEach((wakeMesh, wakeIndex) => {
      wakeMesh.material.opacity = 0.28 + (Math.sin(elapsedTime * 4.2 + shipRecord.bobPhase + wakeIndex) + 1) * 0.12;
      wakeMesh.scale.x = 0.92 + (Math.sin(elapsedTime * 3.1 + wakeIndex) + 1) * 0.16;
    });
  });
}

function updateLondonEyeCapsules(elapsedTime) {
  londonEyeCapsuleRecords.forEach((capsuleRecord) => {
    const capsuleAngle = capsuleRecord.phase + elapsedTime * 0.45;
    capsuleRecord.mesh.position.set(
      0,
      5.4 + Math.sin(capsuleAngle) * capsuleRecord.radius,
      Math.cos(capsuleAngle) * capsuleRecord.radius,
    );
    capsuleRecord.mesh.rotation.set(0, 0, 0);
  });
}

function updateDriverCab(elapsedTime) {
  if (!driverCab) {
    return;
  }
  driverCab.group.visible = appState.povTrainActive;
  if (!appState.povTrainActive) {
    return;
  }

  syncDriverCabControls();
  const mobileCabScale = window.innerWidth <= 720 ? 0.78 : 1;
  const mobileCabOffsetY = window.innerWidth <= 720 ? -0.24 : 0;
  const hornPressed = elapsedTime < driverCab.hornPressedUntil;
  const brakePressed = elapsedTime < driverCab.brakePressedUntil;
  driverCab.group.scale.set(mobileCabScale, mobileCabScale, 1);
  driverCab.hornButton.scale.setScalar(hornPressed ? 0.88 : 1);
  driverCab.hornCap.scale.setScalar(hornPressed ? 0.82 : 1);
  driverCab.brakeGroup.rotation.z = brakePressed ? -0.22 : 0;
  driverCab.group.position.y = mobileCabOffsetY + Math.sin(elapsedTime * 7.5 * appState.speedFactor) * 0.006;
}

function updateToyMotionDetails(elapsedTime) {
  trainWheelRecords.forEach((wheelRecord) => {
    wheelRecord.mesh.rotation.x = elapsedTime * 8.6 * appState.speedFactor;
    wheelRecord.mesh.rotation.z = Math.PI * 0.5;
  });

  trainHeadlightRecords.forEach((headlightRecord) => {
    const pulseValue = 0.62 + (Math.sin(elapsedTime * 6.5 * appState.speedFactor + headlightRecord.phase) + 1) * 0.12;
    headlightRecord.mesh.material.emissiveIntensity = pulseValue;
  });

  smokePuffRecords.forEach((smokeRecord) => {
    const puffPhase = elapsedTime * (1.1 + appState.speedFactor * 1.2) + smokeRecord.phase;
    const liftValue = (Math.sin(puffPhase) + 1) * 0.22;
    smokeRecord.mesh.position.y = smokeRecord.baseY + liftValue;
    smokeRecord.mesh.scale.setScalar(0.86 + liftValue * 0.7);
    smokeRecord.mesh.material.opacity = 0.42 + (Math.cos(puffPhase) + 1) * 0.11;
  });
}

function updateAtmosphereEffects(elapsedTime, deltaTime) {
  const sceneModeConfig = sceneModeConfigs[appState.sceneMode] ?? sceneModeConfigs.spring;

  if (snowPoints) {
    const snowMaterial = snowPoints.material;
    snowMaterial.opacity += (sceneModeConfig.snowOpacity - snowMaterial.opacity) * 0.08;
    snowPoints.visible = snowMaterial.opacity > 0.02;
    if (snowPoints.visible) {
      const snowPositionAttribute = snowPoints.geometry.getAttribute("position");
      const snowPositions = snowPositionAttribute.array;
      for (let snowIndex = 0; snowIndex < snowPositions.length; snowIndex += 3) {
        const driftValue = Math.sin(elapsedTime * 0.8 + snowIndex * 0.017) * 0.018;
        snowPositions[snowIndex] += driftValue;
        snowPositions[snowIndex + 1] -= deltaTime * (1.9 + (snowIndex % 9) * 0.16);
        if (snowPositions[snowIndex + 1] < 0.9) {
          snowPositions[snowIndex] = -35 + positiveSeededUnit(snowIndex, elapsedTime + 7) * 70;
          snowPositions[snowIndex + 1] = 18 + positiveSeededUnit(snowIndex, elapsedTime + 8) * 10;
          snowPositions[snowIndex + 2] = -25 + positiveSeededUnit(snowIndex, elapsedTime + 9) * 50;
        }
      }
      snowPositionAttribute.needsUpdate = true;
    }
  }

  if (starPoints) {
    starPoints.material.opacity += (sceneModeConfig.starsOpacity - starPoints.material.opacity) * 0.08;
    starPoints.visible = starPoints.material.opacity > 0.02;
    starPoints.rotation.y = Math.sin(elapsedTime * 0.025) * 0.018;
  }

  seasonalParticleSystems.forEach((particleSystem) => {
    const targetOpacity = appState.sceneMode === particleSystem.modeName ? particleSystem.opacity : 0;
    particleSystem.material.opacity += (targetOpacity - particleSystem.material.opacity) * 0.09;
    particleSystem.mesh.visible = particleSystem.material.opacity > 0.02;
    if (!particleSystem.mesh.visible) {
      return;
    }

    particleSystem.records.forEach((particleRecord, particleIndex) => {
      particleRecord.y += deltaTime * particleRecord.speed * particleSystem.verticalDirection;
      particleRecord.x += Math.sin(elapsedTime * 0.8 + particleRecord.phase) * deltaTime * particleSystem.drift;
      particleRecord.z += Math.cos(elapsedTime * 0.6 + particleRecord.phase) * deltaTime * particleSystem.drift * 0.42;
      if (particleSystem.verticalDirection < 0 && particleRecord.y < particleSystem.minY) {
        particleRecord.x = -34 + positiveSeededUnit(particleIndex, elapsedTime + particleSystem.seed) * 68;
        particleRecord.y = particleSystem.maxY;
        particleRecord.z = -24 + positiveSeededUnit(particleIndex, elapsedTime + particleSystem.seed + 1) * 48;
      }
      if (particleSystem.verticalDirection > 0 && particleRecord.y > particleSystem.maxY) {
        particleRecord.x = -34 + positiveSeededUnit(particleIndex, elapsedTime + particleSystem.seed) * 68;
        particleRecord.y = particleSystem.minY;
        particleRecord.z = -24 + positiveSeededUnit(particleIndex, elapsedTime + particleSystem.seed + 1) * 48;
      }

      seasonalParticleEuler.set(
        Math.sin(elapsedTime + particleRecord.phase) * 0.8,
        elapsedTime * particleRecord.spin + particleRecord.phase,
        Math.cos(elapsedTime * 0.7 + particleRecord.phase) * 0.7,
      );
      quaternionScratch.setFromEuler(seasonalParticleEuler);
      matrixScratch.compose(
        new THREE.Vector3(particleRecord.x, particleRecord.y, particleRecord.z),
        quaternionScratch,
        new THREE.Vector3(particleRecord.sizeX, particleRecord.sizeY, 1),
      );
      particleSystem.mesh.setMatrixAt(particleIndex, matrixScratch);
    });
    particleSystem.mesh.instanceMatrix.needsUpdate = true;
  });

  if (sunsetSunGroup) {
    sunsetSunGroup.position.y = Math.sin(elapsedTime * 0.26) * 0.26;
    sunsetSunGroup.scale.setScalar(1 + Math.sin(elapsedTime * 0.42) * 0.018);
  }

  if (sunsetRayGroup) {
    sunsetRayGroup.position.x = Math.sin(elapsedTime * 0.18) * 0.5;
    sunsetRayGroup.position.y = Math.sin(elapsedTime * 0.13) * 0.14;
  }

  if (springBloomGroup) {
    springBloomGroup.position.x = Math.sin(elapsedTime * 0.12) * 0.62;
    springBloomGroup.position.y = Math.cos(elapsedTime * 0.16) * 0.16;
  }

  if (summerCloudGroup) {
    summerCloudGroup.position.x = Math.sin(elapsedTime * 0.09) * 0.7;
    summerCloudGroup.position.y = Math.cos(elapsedTime * 0.11) * 0.16;
  }

  if (autumnGlowGroup) {
    autumnGlowGroup.position.x = Math.sin(elapsedTime * 0.15) * 0.54;
    autumnGlowGroup.position.y = Math.cos(elapsedTime * 0.19) * 0.18;
  }

  if (frostHazeGroup) {
    frostHazeGroup.position.x = Math.sin(elapsedTime * 0.16) * 0.42;
  }

  if (moonGroup) {
    moonGroup.position.y = Math.sin(elapsedTime * 0.21) * 0.18;
  }

  if (sunsetReflectionGroup) {
    sunsetReflectionGroup.children.forEach((reflectionMesh, reflectionIndex) => {
      reflectionMesh.scale.x = 1 + Math.sin(elapsedTime * 1.4 + reflectionIndex * 0.8) * 0.16;
    });
  }

  festiveLightRecords.forEach((lightRecord) => {
    lightRecord.mesh.visible = sceneModeConfig.festiveLights;
    if (!lightRecord.mesh.visible) {
      return;
    }
    const pulseValue = (Math.sin(elapsedTime * 3.8 + lightRecord.phase) + 1) * 0.5;
    lightRecord.mesh.scale.setScalar(lightRecord.baseScale * (0.78 + pulseValue * 0.52));
    lightRecord.material.emissiveIntensity = 0.42 + pulseValue * 0.72;
  });

  if (holidayFeatureGroup) {
    holidayFeatureGroup.visible = sceneModeConfig.holidayFeature;
    if (holidayFeatureGroup.visible) {
      holidayFeatureGroup.rotation.y = Math.sin(elapsedTime * 0.35) * 0.08;
    }
  }
}

function setHudCollapsed(collapsedValue) {
  if (!hudPanel || !hudToggleButton) {
    return;
  }

  hudPanel.classList.toggle("is-collapsed", collapsedValue);
  hudToggleButton.setAttribute("aria-expanded", collapsedValue ? "false" : "true");
  hudToggleButton.textContent = collapsedValue ? "Controls" : "Hide controls";
}

function syncHudForViewport() {
  setHudCollapsed(window.matchMedia("(max-width: 720px)").matches);
}

function wireInterface() {
  if (hudPanel && hudToggleButton) {
    syncHudForViewport();

    hudToggleButton.addEventListener("click", () => {
      setHudCollapsed(!hudPanel.classList.contains("is-collapsed"));
    });
  }

  sceneModeButtons.forEach((buttonElement) => {
    buttonElement.addEventListener("click", () => {
      setSceneMode(buttonElement.dataset.sceneMode);
    });
  });

  autoShowButton?.addEventListener("click", toggleAutoShow);

  trainSpeedInput.addEventListener("input", () => {
    setTrainSpeedFactor(Number(trainSpeedInput.value));
  });

  presetButtons.forEach((buttonElement) => {
    buttonElement.addEventListener("click", () => {
      setCameraPreset(buttonElement.dataset.preset);
    });
  });

  followTrainButton?.addEventListener("click", () => {
    setTrainCameraMode(appState.followTrainActive ? "none" : "follow");
    cameraState.presetMode = false;
    cameraState.userIsOrbiting = false;
    if (window.innerWidth <= 720) {
      setHudCollapsed(true);
    }
    presetButtons.forEach((buttonElement) => {
      buttonElement.classList.remove("is-active");
    });
  });

  povTrainButton?.addEventListener("click", () => {
    if (appState.povTrainActive) {
      selectNextVisibleTrain();
      playCabControlTone("up");
    } else {
      setTrainCameraMode("pov");
    }
    cameraState.presetMode = false;
    cameraState.userIsOrbiting = false;
    if (window.innerWidth <= 720) {
      setHudCollapsed(true);
    }
    presetButtons.forEach((buttonElement) => {
      buttonElement.classList.remove("is-active");
    });
  });

  povThrottleButton?.addEventListener("click", () => {
    setTrainSpeedFactor(appState.speedFactor + 0.16, { sound: true, controlType: "throttle" });
  });

  povBrakeButton?.addEventListener("click", () => {
    setTrainSpeedFactor(appState.speedFactor - 0.2, { sound: true, controlType: "brake" });
  });

  povHornButton?.addEventListener("click", playTrainHorn);

  renderer.domElement.addEventListener("pointerdown", handleCabPointerDown);
  renderer.domElement.addEventListener("pointermove", handleCabPointerMove);
  window.addEventListener("pointerup", finishCabDrag);
  window.addEventListener("pointercancel", finishCabDrag);

  resetOverviewButton.addEventListener("click", () => {
    setCameraPreset("fullTable");
  });

}

function updateTrainPositions(deltaTime) {
  trainFleet.forEach((trainRecord, trainIndex) => {
    if (!trainRecord.visible) {
      return;
    }

    const travelDistance = deltaTime * trainRecord.baseSpeed * appState.speedFactor;
    advanceTrainRecord(trainRecord, travelDistance, appState);

    trainRecord.trainCars.forEach((carGroup, carIndex) => {
      const carSample = sampleTrainHistory(trainRecord, carIndex * trainRecord.carSpacing);
      positionCarGroup(carGroup, carSample.position, carSample.tangent);
    });

    const haloSample = sampleTrainHistory(trainRecord, 0);
    trainRecord.haloMesh.position.set(haloSample.position.x, haloSample.position.y + 0.08, haloSample.position.z);
    trainRecord.haloMesh.rotation.x = -Math.PI * 0.5;
    trainRecord.haloMesh.rotation.z = trainRecord.totalDistance * 0.16;

    const leadTangent = haloSample.tangent.clone().normalize();
    const glowPulse = 0.82 + Math.sin(latestElapsedTime * 3.4 + trainIndex * 0.7) * 0.08;
    trainRecord.glowMesh.visible = trainRecord.visible;
    trainRecord.glowMesh.position.set(haloSample.position.x, haloSample.position.y - 0.16, haloSample.position.z);
    trainRecord.glowMesh.rotation.x = -Math.PI * 0.5;
    trainRecord.glowMesh.rotation.z = trainRecord.totalDistance * 0.08;
    trainRecord.glowMesh.scale.setScalar(glowPulse);
    trainRecord.glowMesh.material.opacity = 0.11 + appState.speedFactor * 0.045;

    trainRecord.headlightSprite.visible = trainRecord.visible;
    trainRecord.headlightSprite.position.copy(haloSample.position).add(leadTangent.multiplyScalar(1.45));
    trainRecord.headlightSprite.position.y += 0.55;
    trainRecord.headlightSprite.scale.set(1.35, 0.72, 1);
    trainRecord.headlightSprite.material.opacity = 0.22 + appState.speedFactor * 0.1;
  });
}

function updateAutoShow(elapsedTime) {
  if (!appState.autoShowActive) {
    return;
  }

  const autoShowElapsedTime = Math.max(0, elapsedTime - appState.autoShowStartedAt);
  updateAutoShowProgress((autoShowElapsedTime % autoShowModeDuration) / autoShowModeDuration);
  const modeIndex =
    (appState.autoShowBaseModeIndex + Math.floor(autoShowElapsedTime / autoShowModeDuration)) % sceneModeOrder.length;
  if (modeIndex !== appState.autoShowModeIndex) {
    appState.autoShowModeIndex = modeIndex;
    setSceneMode(sceneModeOrder[modeIndex], { keepAuto: true });
    appState.autoShowBaseRoutePhase = getCurrentRoutePhase();
    appState.autoShowRouteStartedAt = elapsedTime;
  }

  const routeElapsedTime = Math.max(0, elapsedTime - appState.autoShowRouteStartedAt);
  const routePhase =
    (appState.autoShowBaseRoutePhase + Math.floor(routeElapsedTime / autoShowRouteDuration)) % 4;
  const nextWestTunnelActive = routePhase === 1 || routePhase === 2;
  const nextEastFlyoverActive = routePhase >= 2;
  if (nextWestTunnelActive !== appState.westTunnelActive || nextEastFlyoverActive !== appState.eastFlyoverActive) {
    appState.westTunnelActive = nextWestTunnelActive;
    appState.eastFlyoverActive = nextEastFlyoverActive;
    updateRouteLabel();
  }
}

function updateCamera(deltaTime) {
  orbitControls.enabled = !appState.povTrainActive;

  if (cameraState.userIsOrbiting) {
    orbitControls.update();
    return;
  }

  if (appState.followTrainActive || appState.povTrainActive) {
    const followTrain = getFollowTrain();
    const leadSample = sampleTrainHistory(followTrain, 0);
    const followRight = new THREE.Vector3(leadSample.tangent.z, 0, -leadSample.tangent.x);
    if (followRight.lengthSq() < 0.001) {
      followRight.set(1, 0, 0);
    } else {
      followRight.normalize();
    }
    const isMobileFollowView = window.innerWidth <= 720;
    const followDistance = isMobileFollowView ? 26.0 : 23.0;
    const followSideOffset = isMobileFollowView ? 8.5 : 6.8;
    const followHeight = isMobileFollowView ? 15.5 : 12.8;
    const followLookAhead = isMobileFollowView ? 8.2 : 6.4;
    if (appState.povTrainActive) {
      const povPosition = leadSample.position
        .clone()
        .add(leadSample.tangent.clone().multiplyScalar(isMobileFollowView ? -5.8 : -4.8))
        .add(followRight.clone().multiplyScalar(isMobileFollowView ? 0.7 : 0.55))
        .add(new THREE.Vector3(0, isMobileFollowView ? 5.0 : 4.35, 0));
      const povTarget = leadSample.position
        .clone()
        .add(leadSample.tangent.clone().multiplyScalar(isMobileFollowView ? 18.0 : 16.0))
        .add(new THREE.Vector3(0, isMobileFollowView ? 2.0 : 1.75, 0));
      camera.position.lerp(povPosition, 1 - Math.exp(-deltaTime * 6.4));
      orbitControls.target.lerp(povTarget, 1 - Math.exp(-deltaTime * 6.8));
      camera.lookAt(orbitControls.target);
      return;
    }

    const followOffset = leadSample.tangent
      .clone()
      .multiplyScalar(-followDistance)
      .add(followRight.multiplyScalar(followSideOffset));
    followOffset.y = followHeight;
    const followPosition = leadSample.position.clone().add(followOffset);
    const followTarget = leadSample.position
      .clone()
      .add(leadSample.tangent.clone().multiplyScalar(followLookAhead))
      .add(new THREE.Vector3(0, 2.2, 0));
    camera.position.lerp(followPosition, 1 - Math.exp(-deltaTime * 4.3));
    orbitControls.target.lerp(followTarget, 1 - Math.exp(-deltaTime * 4.6));
    orbitControls.update();
    return;
  }

  if (cameraState.presetMode) {
    camera.position.lerp(cameraState.desiredPosition, 1 - Math.exp(-deltaTime * 4.2));
    orbitControls.target.lerp(cameraState.desiredTarget, 1 - Math.exp(-deltaTime * 4.2));
    orbitControls.update();

    if (
      camera.position.distanceTo(cameraState.desiredPosition) < 0.08 &&
      orbitControls.target.distanceTo(cameraState.desiredTarget) < 0.08
    ) {
      cameraState.presetMode = false;
    }
    return;
  }

  orbitControls.update();
}

function animateDecorations(elapsedTime, deltaTime) {
  rotatingEyeMeshes.forEach((eyeMesh) => {
    eyeMesh.rotation.x = elapsedTime * 0.45;
  });
  updateLondonEyeCapsules(elapsedTime);
  updateBoatInstances(elapsedTime);
  updateRiverShips(elapsedTime);
  updateToyMotionDetails(elapsedTime);
  updateAtmosphereEffects(elapsedTime, deltaTime);
}

createPlayroomBase();
createRiverAndRoads();
createLandmarks();
createExtraLondonToyDetails();
createTrackMeshes();
createSceneryInstances();
createAtmosphereEffects();
updateTrainVisibility();
const urlParams = new URLSearchParams(window.location.search);
const requestedSceneMode = urlParams.get("mode");
const normalizedRequestedSceneMode = requestedSceneMode === "christmas" ? "winter" : requestedSceneMode;
setSceneMode(sceneModeConfigs[normalizedRequestedSceneMode] ? normalizedRequestedSceneMode : "spring");
wireInterface();
const requestedCameraPreset = urlParams.get("camera");
setCameraPreset(cameraPresets[requestedCameraPreset] ? requestedCameraPreset : "fullTable");

const animationClock = new THREE.Clock();

function renderFrame() {
  const rawDeltaTime = animationClock.getDelta();
  const deltaTime = Math.min(rawDeltaTime, 0.05);
  const elapsedTime = animationClock.elapsedTime;
  latestElapsedTime = elapsedTime;

  updateAutoShow(elapsedTime);
  updateTrainPositions(deltaTime);
  updateCamera(deltaTime);
  animateDecorations(elapsedTime, deltaTime);
  updateDriverCab(elapsedTime);

  renderer.render(scene, camera);
  requestAnimationFrame(renderFrame);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = appState.povTrainActive ? 60 : window.innerWidth <= 720 ? 52 : 42;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (!appState.followTrainActive && !appState.povTrainActive && cameraState.lastPresetName) {
    setCameraPreset(cameraState.lastPresetName);
  }
  syncHudForViewport();
});

renderFrame();
