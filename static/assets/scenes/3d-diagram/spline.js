import { createSplineSceneController } from '../shared/spline-runtime.js';

/** Set after Spline publish (app.spline.design → Export → Publish). */
const SCENE_URL = '';

const canvas = document.getElementById('diagram-3d-canvas');
const scene = createSplineSceneController({
  canvas,
  sceneUrl: SCENE_URL || document.querySelector('meta[name="iam-spline-scene-url"]')?.content || '',
  logPrefix: '[3d-diagram]',
  findRootNames: ['Group', 'Grid', 'Scene', 'Root'],
});

window.Diagram3dScene = scene;
await scene.boot();
