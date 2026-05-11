#!/usr/bin/env node
/**
 * Stable SHA-256 of deploy input trees (content + paths) for skipping expensive steps.
 * Usage: node scripts/compute-deploy-input-hash.mjs supabase-docs|migrations
 */
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try {
      const st = statSync(p);
      if (st.isDirectory()) walkFiles(p, acc);
      else acc.push(p);
    } catch {
      /* skip unreadable */
    }
  }
  return acc;
}

const mode = (process.argv[2] || '').trim().toLowerCase();
const h = createHash('sha256');

if (mode === 'supabase-docs') {
  const manifest = join(root, 'scripts', 'supabase-documents-selected-manifest.json');
  if (existsSync(manifest)) {
    h.update('manifest:');
    h.update(readFileSync(manifest));
  }
  const docsDir = join(root, 'docs');
  const files = walkFiles(docsDir).sort();
  for (const f of files) {
    h.update(f.slice(root.length));
    h.update(readFileSync(f));
  }
} else if (mode === 'migrations') {
  const migDir = join(root, 'migrations');
  const files = walkFiles(migDir).sort();
  for (const f of files) {
    h.update(f.slice(root.length));
    h.update(readFileSync(f));
  }
} else {
  console.error('usage: compute-deploy-input-hash.mjs supabase-docs | migrations');
  process.exit(1);
}

console.log(h.digest('hex'));
