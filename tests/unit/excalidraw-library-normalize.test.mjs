import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExcalidrawLibraryPayload } from '../../src/core/excalidraw-library-normalize.js';

const sampleEl = {
  id: 'el1',
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
};

test('normalizeExcalidrawLibraryPayload converts v1 library[][] to libraryItems', () => {
  const items = normalizeExcalidrawLibraryPayload(
    {
      type: 'excalidrawlib',
      version: 1,
      library: [[sampleEl], [{ ...sampleEl, id: 'el2' }]],
    },
    { slug: 'uml-er', itemNamePrefix: 'UML' },
  );
  assert.equal(items.length, 2);
  assert.equal(items[0].status, 'published');
  assert.ok(Array.isArray(items[0].elements));
  assert.equal(items[0].elements[0].id, 'el1');
  assert.match(items[0].id, /^uml-er_g0_/);
});

test('normalizeExcalidrawLibraryPayload passes through v2 libraryItems', () => {
  const v2 = [
    {
      id: 'item-1',
      status: 'published',
      created: 1,
      elements: [sampleEl],
    },
  ];
  const items = normalizeExcalidrawLibraryPayload({ libraryItems: v2 });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'item-1');
});

test('normalizeExcalidrawLibraryPayload returns empty for invalid payload', () => {
  assert.deepEqual(normalizeExcalidrawLibraryPayload(null), []);
  assert.deepEqual(normalizeExcalidrawLibraryPayload({ library: [] }), []);
});
