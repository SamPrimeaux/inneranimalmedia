import test from 'node:test';
import assert from 'node:assert/strict';
import { openaiSafetyIdentifier } from '../../src/integrations/openai-responses-ws.js';

test('openaiSafetyIdentifier hashes user id (not raw au_*)', async () => {
  const a = await openaiSafetyIdentifier('au_871d920d1233cbd1');
  const b = await openaiSafetyIdentifier('au_871d920d1233cbd1');
  const c = await openaiSafetyIdentifier('au_other');
  assert.equal(typeof a, 'string');
  assert.equal(a.length, 64);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(!a.includes('au_'));
});

test('openaiSafetyIdentifier empty → null', async () => {
  assert.equal(await openaiSafetyIdentifier(''), null);
  assert.equal(await openaiSafetyIdentifier(null), null);
});
