/**
 * Unit: hybrid search suppresses sub-threshold semantic noise.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MEMORY_MIN_SEMANTIC_SCORE } from '../../src/core/agentsam-memory-hybrid-search.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, '../../src/core/agentsam-memory-hybrid-search.js'),
  'utf8',
);

describe('hybrid search relevance floor', () => {
  it('exports a semantic floor above the observed 0.212 noise hit', () => {
    assert.ok(MEMORY_MIN_SEMANTIC_SCORE > 0.212);
    assert.ok(MEMORY_MIN_SEMANTIC_SCORE >= 0.3);
  });

  it('returns no_relevant_memory when semantic hits are suppressed', () => {
    assert.match(src, /no_relevant_memory/);
    assert.match(src, /suppressed_low_score/);
    assert.match(src, /pipeline_version/);
  });
});
