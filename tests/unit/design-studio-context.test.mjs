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

test('formatDesignStudioContextForAgent includes spatial block', async () => {
  const { formatDesignStudioContextForAgent } = await import('../../src/core/design-studio-context.js');
  const text = formatDesignStudioContextForAgent({
    surface: 'design_studio',
    entity_count: 1,
    spatial: {
      units: 'm',
      spawn_profile: 'bim',
      up_axis: 'Z',
      ground_y: 0,
      rotation_euler_deg: { x: 0, y: 90, z: 0 },
      world_bbox: { size: { x: 30, y: 12, z: 24 } },
    },
  });
  assert.match(text, /spatial_world_bbox: W=30\.000 H=12\.000 D=24\.000/);
  assert.match(text, /spatial_rotation_deg: x=0\.0 y=90\.0 z=0\.0/);
  assert.match(text, /spatial_ground_y: 0/);
});
