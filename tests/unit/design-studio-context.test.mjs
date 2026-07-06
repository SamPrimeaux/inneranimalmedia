import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDesignStudioCadCreateIntent,
  isDesignStudioSurfaceContext,
  resolveDesignStudioChatOverrides,
} from '../../src/core/design-studio-context.js';

test('isDesignStudioSurfaceContext requires surface design_studio', () => {
  assert.equal(isDesignStudioSurfaceContext({ surface: 'design_studio' }), true);
  assert.equal(isDesignStudioSurfaceContext({ surface: 'agent' }), false);
  assert.equal(isDesignStudioSurfaceContext(null), false);
});

test('isDesignStudioCadCreateIntent detects CAD create phrasing', () => {
  assert.equal(
    isDesignStudioCadCreateIntent(
      'make Cubechair -> illustration_create: generate an openscad modern chair, show in viewer',
    ),
    true,
  );
  assert.equal(isDesignStudioCadCreateIntent('what do you see open in our viewer'), false);
});

test('resolveDesignStudioChatOverrides pins route and skips RWS', () => {
  const overrides = resolveDesignStudioChatOverrides(
    {
      designStudioContext: {
        surface: 'design_studio',
        entity_count: 1,
      },
    },
    {},
    'generate an openscad modern chair',
  );
  assert.deepEqual(overrides, {
    route_key: 'design_studio',
    task_type: 'cad_generation',
    subagent_slug: 'cadcreator',
    skip_rws_fanout: true,
  });
});
