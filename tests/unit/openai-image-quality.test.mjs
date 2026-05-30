import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOpenAiImageQuality } from '../../src/integrations/openai.js';
import { isCodeImplementationIntent } from '../../src/core/code-implementation-intent.js';

test('gpt-image maps legacy standard quality to auto', () => {
  assert.equal(normalizeOpenAiImageQuality('gpt-image-1-mini', 'standard'), 'auto');
  assert.equal(normalizeOpenAiImageQuality('gpt-image-2', 'hd'), 'high');
  assert.equal(normalizeOpenAiImageQuality('gpt-image-1', 'high'), 'high');
});

test('dall-e-3 keeps standard and hd', () => {
  assert.equal(normalizeOpenAiImageQuality('dall-e-3', 'standard'), 'standard');
  assert.equal(normalizeOpenAiImageQuality('dall-e-3', 'hd'), 'hd');
});

test('vite demo brief is code implementation intent', () => {
  const msg = `We are finishing a lightweight Vite/React demo for Chrystal Clear Insurance.
Use chrystal-clear-insurance-demo/ — entry src/main.jsx, styles src/styles.css.
Goal: finish a one-page demo with anchor sections: Home / Hero, Services, About, Contact.`;
  assert.equal(isCodeImplementationIntent(msg), true);
});
