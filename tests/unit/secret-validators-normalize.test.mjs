import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeApiKeySecret } from '../../src/core/secret-validators.js';

test('normalizeApiKeySecret strips Bearer prefix and whitespace', () => {
  assert.equal(normalizeApiKeySecret('  Bearer abc-def_123  '), 'abc-def_123');
  assert.equal(normalizeApiKeySecret('abc\n def'), 'abcdef');
  assert.equal(normalizeApiKeySecret(''), '');
});
