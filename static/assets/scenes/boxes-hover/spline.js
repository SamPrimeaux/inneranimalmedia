import { createSplineSceneController } from '../shared/spline-runtime.js';

/** Set after Spline publish (app.spline.design → Export → Publish). */
const SCENE_URL = '';

const canvas = document.getElementById('boxes-hover-canvas');
const scene = createSplineSceneController({
  canvas,
  sceneUrl: SCENE_URL || document.querySelector('meta[name="iam-spline-scene-url"]')?.content || '',
  logPrefix: '[boxes-hover]',
  findRootNames: ['Boxes', 'Scene', 'Group', 'Root'],
});

window.BoxesHoverScene = scene;
await scene.boot();
