#!/usr/bin/env node
/** Ensure public/ exists; studio build copies into public/studio when present. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const studioDist = path.join(root, 'studio', 'dist');
const studioOut = path.join(publicDir, 'studio');
if (fs.existsSync(studioDist)) {
  fs.cpSync(studioDist, studioOut, { recursive: true });
  console.log('Copied studio/dist → public/studio');
} else {
  console.log('No studio/dist — landing-only build OK');
}

console.log('public build OK');
