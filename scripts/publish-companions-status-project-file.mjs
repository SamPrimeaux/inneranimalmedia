#!/usr/bin/env node
/** Upload PROJECT_STATUS to R2 + patch projects.metadata_json.project_files for Files tab. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'docs/clients/companionscpas/PROJECT_STATUS_2026-07-06.md');
const BUCKET = 'inneranimalmedia';
const R2_KEY = 'projects/proj_companions_cpas_web/files/PROJECT_STATUS_2026-07-06.md';
const PROJECT_ID = 'proj_companions_cpas_web';
const FILE_NAME = 'PROJECT_STATUS_2026-07-06.md';
const PUBLIC_URL = `https://inneranimalmedia.com/api/r2/buckets/${encodeURIComponent(BUCKET)}/object/${encodeURIComponent(R2_KEY)}`;

function wrangler(args, { json = false } = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: root,
    stdio: json ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
}

function d1Query(sql) {
  const raw = wrangler([
    'd1', 'execute', 'inneranimalmedia-business',
    '--remote', '-c', 'wrangler.production.toml',
    '--command', sql,
    '--json',
  ], { json: true });
  const parsed = JSON.parse(raw);
  return parsed?.[0]?.results ?? parsed?.results ?? [];
}

function d1File(filePath) {
  wrangler([
    'd1', 'execute', 'inneranimalmedia-business',
    '--remote', '-c', 'wrangler.production.toml',
    '--file', filePath,
  ]);
}

const size = statSync(SOURCE).size;
readFileSync(SOURCE, 'utf8');

console.log(`Uploading PROJECT_STATUS (${size} bytes) → ${BUCKET}/${R2_KEY}`);
wrangler([
  'r2', 'object', 'put', `${BUCKET}/${R2_KEY}`,
  '--remote', '--file', SOURCE,
  '--content-type', 'text/markdown; charset=utf-8',
]);

const fileRef = {
  name: FILE_NAME,
  url: PUBLIC_URL,
  uploaded_at: Date.now(),
  kind: 'document',
  r2_bucket: BUCKET,
  r2_key: R2_KEY,
};

const row = d1Query(`SELECT metadata_json FROM projects WHERE id = '${PROJECT_ID}' LIMIT 1`)[0];
let meta = {};
try {
  meta = row?.metadata_json ? JSON.parse(row.metadata_json) : {};
} catch {
  meta = {};
}
const existing = Array.isArray(meta.project_files) ? meta.project_files : [];
const nextFiles = [
  fileRef,
  ...existing.filter((f) => f?.name !== FILE_NAME),
];
meta.project_files = nextFiles;

const tmpDir = path.join(root, '.scratch');
mkdirSync(tmpDir, { recursive: true });
const tmpSql = path.join(tmpDir, 'patch-companions-project-files.sql');
const metaJson = JSON.stringify(meta).replace(/'/g, "''");
writeFileSync(tmpSql, `UPDATE projects SET metadata_json = '${metaJson}', updated_at = datetime('now') WHERE id = '${PROJECT_ID}';`);

console.log('Patching projects.metadata_json.project_files …');
d1File(tmpSql);

console.log('Done. Open Files tab on proj_companions_cpas_web or visit:');
console.log(PUBLIC_URL);
