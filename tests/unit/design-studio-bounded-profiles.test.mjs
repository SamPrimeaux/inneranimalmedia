import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWritePolicyJson, resolveUseOAuthParity } from '../../src/core/d1-tool-profile.js';

const migration = readFileSync(
  new URL('../../migrations/940_designstudio_bounded_profiles.sql', import.meta.url),
  'utf8',
);

function profileTools(profileKey) {
  const marker = `'atprof_${profileKey}','${profileKey}'`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `missing profile ${profileKey}`);
  const tail = migration.slice(start);
  const match = tail.match(/\n '(\[[^\n]+\])',(\d+),1,/);
  assert.ok(match, `missing tool array for ${profileKey}`);
  return { tools: JSON.parse(match[1]), maxTools: Number(match[2]) };
}

test('Meshy profiles are bounded and canonical', () => {
  const expected = {
    meshy_generate: [
      'meshy_text_to_3d',
      'meshy_text_to_3d_refine',
      'meshy_image_to_3d',
      'meshy_multi_image_to_3d',
      'meshy_get_task_status',
    ],
    meshy_transform: [
      'meshy_remesh',
      'meshy_retexture',
      'meshy_convert',
      'meshy_resize',
      'meshy_uv_unwrap',
      'meshy_get_task_status',
    ],
    meshy_animation: ['meshy_rig', 'meshy_animate', 'meshy_get_task_status'],
    meshy_manage: ['meshy_get_task_status', 'meshy_list_tasks', 'meshy_cancel_task'],
  };
  for (const [key, tools] of Object.entries(expected)) {
    const profile = profileTools(key);
    assert.deepEqual(profile.tools, tools);
    assert.equal(profile.maxTools, tools.length);
    assert.equal(profile.tools.some((tool) => tool.startsWith('meshyai_')), false);
    assert.equal(profile.tools.includes('illustration_create'), false);
  }
});

test('Studio base and CAD intake are not Meshy aliases', () => {
  const base = profileTools('design_studio_base');
  const cad = profileTools('cad_generation');
  assert.equal(base.tools.some((tool) => tool.startsWith('meshy_')), false);
  assert.equal(cad.tools.some((tool) => tool.startsWith('meshy_')), false);
  assert.equal(base.maxTools, base.tools.length);
  assert.equal(cad.maxTools, cad.tools.length);
});

test('bound prompt routes retire independently authored tool menus', () => {
  assert.match(
    migration,
    /SET tool_keys = NULL, max_tools = NULL/,
  );
});

test('profile ownership is the default and v2 capability policy arrays survive parsing', () => {
  assert.equal(resolveUseOAuthParity({}), false);
  assert.equal(resolveUseOAuthParity({ mcpOAuthParity: true }), true);
  assert.deepEqual(
    parseWritePolicyJson(
      '{"version":2,"allow_mutating_capabilities":["media.transform"],"deny_capabilities":[]}',
    ),
    {
      version: 2,
      allow_mutating_capabilities: ['media.transform'],
      deny_capabilities: [],
    },
  );
});
