/**
 * Legacy vector sync must enqueue outbox — never use embedded_at as authority.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, '../../src/core/agentsam-memory-vector-sync.js'),
  'utf8',
);

describe('legacy memory vector sync disposition', () => {
  it('does not SELECT or UPDATE using embedded_at as success evidence', () => {
    assert.doesNotMatch(src, /embedded_at\s*(IS NULL|<|<=|=)/i);
    assert.doesNotMatch(src, /SET embedded_at/i);
  });

  it('enqueues outbox jobs instead of writing pgvector directly', () => {
    assert.match(src, /agentsam_memory_outbox/);
    assert.match(src, /legacy_outbox_enqueue/);
    assert.doesNotMatch(src, /INSERT INTO agentsam\.agentsam_memory_oai3large/);
  });
});
