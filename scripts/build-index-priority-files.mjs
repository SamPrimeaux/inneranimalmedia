#!/usr/bin/env node
/**
 * Writes analytics/codebase-index/<WORKSPACE_ID>/index-priority-files.json for R2 upload
 * (see src/queue/codebase-index-sync.js — expects { path, content } entries).
 *
 * Run from deploy after route-map: `node scripts/build-index-priority-files.mjs`
 * Requires WORKSPACE_ID (or .deploy-run-context.json workspace_id).
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { repoRoot, DEPLOY_CONTEXT_FILE } from './lib/supabase-deploy-paths.mjs';
import { loadDotEnvCloudflare } from './lib/supabase-deploy-context.mjs';
import { collectAllPriorityRelPaths } from './lib/priority-codebase-sources.mjs';
import { shouldIgnoreCodebaseIndexPath } from '../src/lib/codebase-index-ignore.js';

const root = repoRoot();
loadDotEnvCloudflare(root);

let workspaceId = String(process.env.WORKSPACE_ID ?? '').trim();
const ctxPath = join(root, DEPLOY_CONTEXT_FILE);
if (existsSync(ctxPath)) {
  try {
    const c = JSON.parse(readFileSync(ctxPath, 'utf8'));
    if (c.workspace_id) workspaceId = String(c.workspace_id).trim();
  } catch {
    /* ignore */
  }
}

if (!workspaceId) {
  console.warn('[build-index-priority-files] Missing WORKSPACE_ID — skip JSON write');
  process.exit(0);
}

const rels = collectAllPriorityRelPaths(root).filter((rel) => !shouldIgnoreCodebaseIndexPath(rel));
const files = [];
for (const rel of rels) {
  const abs = join(root, rel);
  let content;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  if (content.length > 900_000) {
    console.warn('[build-index-priority-files] truncating large file', rel);
    content = content.slice(0, 900_000);
  }
  files.push({ path: rel, content });
}

const outDir = join(root, 'analytics', 'codebase-index', workspaceId);
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'index-priority-files.json');
writeFileSync(outPath, JSON.stringify(files, null, 0), 'utf8');
console.log(`[build-index-priority-files] wrote ${files.length} files → ${outPath.replace(root + '/', '')}`);
