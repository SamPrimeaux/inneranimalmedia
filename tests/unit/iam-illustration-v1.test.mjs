import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ILLUSTRATION_SCHEMA,
  parseIllustrationEnvelope,
  normalizeIllustrationEnvelope,
  validateIllustrationEnvelope,
  resolveIllustrationRoute,
  illustrationSurfaceFromRoute,
} from '../../src/core/iam-illustration-v1.js';

test('parseIllustrationEnvelope accepts nested illustration field', () => {
  const env = parseIllustrationEnvelope({
    illustration: {
      schema: ILLUSTRATION_SCHEMA,
      intent: 'diagram',
      brief: 'System map',
    },
  });
  assert.ok(env);
  assert.equal(env?.intent, 'diagram');
});

test('normalizeIllustrationEnvelope fills schema and scope ids', () => {
  const env = normalizeIllustrationEnvelope(
    { intent: 'sketch', brief: 'Quick idea' },
    { workspaceId: 'ws_1', tenantId: 'tn_1', userId: 'au_1', title: 'Idea' },
  );
  assert.equal(env.schema, ILLUSTRATION_SCHEMA);
  assert.equal(env.workspace_id, 'ws_1');
  assert.equal(env.title, 'Idea');
  assert.equal(env.engine, 'auto');
});

test('validateIllustrationEnvelope rejects missing brief', () => {
  const env = normalizeIllustrationEnvelope(
    { intent: 'sketch' },
    { workspaceId: 'ws_1', tenantId: 'tn_1', userId: 'au_1' },
  );
  const valid = validateIllustrationEnvelope(env);
  assert.equal(valid.ok, false);
  assert.match(valid.errors.join(' '), /brief or payload required/);
});

test('resolveIllustrationRoute maps sketch to excalidraw', () => {
  const route = resolveIllustrationRoute({
    intent: 'sketch',
    fidelity: 'sketch',
    engine: 'auto',
  });
  assert.equal(route.lane, 'excalidraw');
  assert.equal(route.engine, 'excalidraw');
});

test('resolveIllustrationRoute maps house floor plan to CAD openscad', () => {
  const route = resolveIllustrationRoute({
    intent: 'house_floor_plan',
    fidelity: 'technical_2d',
    engine: 'auto',
  });
  assert.equal(route.lane, 'cad');
  assert.equal(route.engine, 'openscad');
});

test('resolveIllustrationRoute maps architectural 3d to freecad', () => {
  const route = resolveIllustrationRoute({
    intent: 'house_floor_plan',
    fidelity: 'architectural_3d',
    engine: 'auto',
  });
  assert.equal(route.lane, 'cad');
  assert.equal(route.engine, 'freecad');
});

test('resolveIllustrationRoute honors explicit engine meshy', () => {
  const route = resolveIllustrationRoute({
    intent: 'diagram',
    fidelity: 'diagram',
    engine: 'meshy',
  });
  assert.equal(route.lane, 'meshy');
  assert.equal(route.engine, 'meshy');
});

test('illustrationSurfaceFromRoute returns draw vs designstudio paths', () => {
  assert.equal(
    illustrationSurfaceFromRoute({ lane: 'excalidraw', engine: 'excalidraw' }).dashboard_path,
    '/dashboard/draw',
  );
  assert.equal(
    illustrationSurfaceFromRoute({ lane: 'cad', engine: 'openscad' }).dashboard_path,
    '/dashboard/designstudio',
  );
});
