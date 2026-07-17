import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateToolProfileKeys,
  resolveToolKeyWithAlias,
  listExcalidrawOpenAliases,
  EXCALIDRAW_PRIVATE_HANDLER_KEYS,
} from '../../src/core/validate-tool-profile-keys.js';
import { resolveCatalogDispatchToolKey } from '../../src/core/catalog-tool-key-resolve.js';

const ACTIVE = new Set([
  'agentsam_excalidraw',
  'illustration_create',
  'excalidraw_export',
  'excalidraw_load_library',
  'excalidraw_plan_map_create',
  'agentsam_memory_manager',
  'agentsam_autorag',
  'agentsam_d1_query',
  'generate_execution_plan',
]);

test('excalidraw_open resolves to agentsam_excalidraw', () => {
  assert.equal(resolveCatalogDispatchToolKey('excalidraw_open'), 'agentsam_excalidraw');
  assert.equal(resolveToolKeyWithAlias('excalidraw_open').canonical, 'agentsam_excalidraw');
  assert.equal(resolveToolKeyWithAlias('excalidraw_open').viaAlias, true);
});

test('legacy Meshy keys resolve to canonical model-visible tools', () => {
  assert.equal(resolveCatalogDispatchToolKey('meshyai_text_to_3d'), 'meshy_text_to_3d');
  assert.equal(resolveCatalogDispatchToolKey('meshyai_rigging'), 'meshy_rig');
  assert.equal(resolveCatalogDispatchToolKey('meshyai_animation'), 'meshy_animate');
  assert.equal(resolveCatalogDispatchToolKey('meshyai_get_task'), 'meshy_get_task_status');
});

test('visual_canvas profile keys all resolve', () => {
  const keys = [
    'agentsam_excalidraw',
    'illustration_create',
    'excalidraw_export',
    'excalidraw_load_library',
    'agentsam_memory_manager',
  ];
  const out = validateToolProfileKeys(keys, ACTIVE);
  assert.equal(out.valid, true);
  assert.deepEqual(out.unresolvedKeys, []);
  assert.deepEqual(out.privateHandlerLeaks, []);
});

test('plan route keys all resolve including plan_map', () => {
  const keys = [
    'agentsam_autorag',
    'agentsam_d1_query',
    'generate_execution_plan',
    'agentsam_excalidraw',
    'illustration_create',
    'excalidraw_load_library',
    'excalidraw_plan_map_create',
    'agentsam_memory_manager',
  ];
  const out = validateToolProfileKeys(keys, ACTIVE);
  assert.equal(out.valid, true);
});

test('legacy excalidraw_open pin resolves via alias', () => {
  const out = validateToolProfileKeys(['excalidraw_open', 'illustration_create'], ACTIVE);
  assert.equal(out.valid, true);
  assert.equal(out.resolvedAliases.excalidraw_open, 'agentsam_excalidraw');
});

test('private handlers are rejected as profile pins', () => {
  const out = validateToolProfileKeys(
    ['illustration_create', 'excalidraw_add_elements', 'excalidraw_clear'],
    ACTIVE,
  );
  assert.equal(out.valid, false);
  assert.ok(out.privateHandlerLeaks.includes('excalidraw_add_elements'));
  assert.ok(out.privateHandlerLeaks.includes('excalidraw_clear'));
  assert.ok(EXCALIDRAW_PRIVATE_HANDLER_KEYS.includes('excalidraw_add_elements'));
});

test('dead ghost pin fails clearly', () => {
  const out = validateToolProfileKeys(['excalidraw_open', 'not_a_real_tool'], ACTIVE);
  assert.equal(out.valid, false);
  assert.ok(out.unresolvedKeys.includes('not_a_real_tool'));
  assert.equal(out.resolvedAliases.excalidraw_open, 'agentsam_excalidraw');
});

test('listExcalidrawOpenAliases documents redirect', () => {
  const aliases = listExcalidrawOpenAliases();
  assert.ok(aliases.some((a) => a.from === 'excalidraw_open' && a.to === 'agentsam_excalidraw'));
});

test('visual_canvas must not include CAD/Meshy pins', () => {
  const keys = [
    'agentsam_excalidraw',
    'illustration_create',
    'excalidraw_export',
    'excalidraw_load_library',
    'agentsam_memory_manager',
  ];
  for (const bad of ['meshyai_text_to_3d', 'openscad', 'freecad', 'blender']) {
    assert.equal(keys.includes(bad), false);
  }
});
