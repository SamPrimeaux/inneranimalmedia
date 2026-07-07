#!/usr/bin/env node
/** BIM spawn orientation — Z-up source + Y-up GLB must not double-rotate. */
import assert from 'node:assert/strict';

function resolveGlbUpAxis(sidecar, meta) {
  if (sidecar?.glb_up_axis === 'Y' || sidecar?.glb_up_axis === 'Z') return sidecar.glb_up_axis;
  const raw = meta?.glb_up_axis;
  if (raw === 'Y' || raw === 'Z') return raw;
  if (sidecar?.up_axis === 'Z' || meta?.up_axis === 'Z' || meta?.spawn_profile === 'bim') return 'Y';
  return null;
}

function resolveModelUpAxis(sidecar, meta) {
  if (sidecar?.up_axis === 'Y' || sidecar?.up_axis === 'Z') return sidecar.up_axis;
  const raw = meta?.up_axis;
  if (raw === 'Y' || raw === 'Z') return raw;
  if (meta?.spawn_profile === 'bim') return 'Z';
  return null;
}

function applySourceOrientation(model, sidecar, meta) {
  const sourceUp = resolveModelUpAxis(sidecar, meta);
  const glbUp = resolveGlbUpAxis(sidecar, meta);
  if (sourceUp === 'Z' && glbUp !== 'Y') {
    model.rotation.x -= Math.PI / 2;
  }
}

const sidecar = { up_axis: 'Z', glb_up_axis: 'Y' };
const model = { rotation: { x: 0 } };
applySourceOrientation(model, sidecar, { spawn_profile: 'bim' });
assert.equal(model.rotation.x, 0);

const model2 = { rotation: { x: 0 } };
applySourceOrientation(model2, { up_axis: 'Z', glb_up_axis: 'Z' }, null);
assert.ok(Math.abs(model2.rotation.x + Math.PI / 2) < 0.001);

console.log('agentSamSpatial orientation: ok');
