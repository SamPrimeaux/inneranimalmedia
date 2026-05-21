#!/usr/bin/env node
/**
 * Fresh codebase RAG baseline for ws_inneranimalmedia:
 * 1. Wipe public.codebase_* rows for workspace
 * 2. Index allowlisted paths only (src .js, dashboard components/features/src/pages)
 * 3. Embed chunks via OpenAI text-embedding-3-large @ 1024
 *
 * Usage:
 *   node scripts/fresh-codebase-rag-reindex.mjs --dry-run
 *   node scripts/fresh-codebase-rag-reindex.mjs --apply
 *   node scripts/fresh-codebase-rag-reindex.mjs --apply --skip-embed
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { execFileSync } from 'child_process';
import { repoRoot } from './lib/supabase-deploy-paths.mjs';
import { loadDotEnvCloudflare, resolveDeployScope, requireSupabaseRest } from './lib/supabase-deploy-context.mjs';
import { sbRequest } from './lib/supabase-rest.mjs';
import {
  isCodebaseIndexSourcePath,
  shouldIgnoreCodebaseIndexPath,
  CODEBASE_INDEX_WALK_DIRS,
} from '../src/lib/codebase-index-ignore.js';
import { splitTextIntoTokenChunks, estimateTokenCount } from '../src/queue/codebase-index-sync.js';
import { collectAllPriorityRelPaths } from './lib/priority-codebase-sources.mjs';

const EMBED_MODEL = process.env.RAG_OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-large';
const EMBED_DIM = 1024;
const MAX_FILES = Number(process.env.CODEBASE_INDEX_MAX_FILES || 2500);
const EMBED_BATCH_DELAY_MS = Number(process.env.INGEST_DELAY_MS || 200);

const argv = new Set(process.argv.slice(2));
const apply = argv.has('--apply');
const skipEmbed = argv.has('--skip-embed');
const dryRun = !apply;

function walkSourceFiles(root) {
  const out = [];
  const skipDir = new Set(['node_modules', '.git', '.wrangler', 'dist', '.cache']);
  const walk = (dir) => {
    let ents;
    try {
      ents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (skipDir.has(e.name) || shouldIgnoreCodebaseIndexPath(`${rel}/`)) continue;
        walk(abs);
      } else if (e.isFile() && isCodebaseIndexSourcePath(rel)) {
        out.push(abs);
      }
    }
  };
  for (const r of CODEBASE_INDEX_WALK_DIRS) {
    const d = join(root, r);
    if (existsSync(d)) walk(d);
  }
  return [...new Set(out)].sort();
}

async function openaiEmbed(apiKey, text) {
  const base = String(process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/$/, '');
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: String(text).slice(0, 8000),
      dimensions: EMBED_DIM,
    }),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI embeddings non-JSON (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI embeddings HTTP ${res.status}`);
  }
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== EMBED_DIM) {
    throw new Error(`Expected ${EMBED_DIM} dims, got ${emb?.length ?? 0}`);
  }
  return emb;
}

async function deleteWorkspaceRows(base, key, table, workspaceId) {
  const q = `workspace_id=eq.${encodeURIComponent(workspaceId)}`;
  await sbRequest('DELETE', `${base}/rest/v1/${table}?${q}`, key, null, {
    Prefer: 'return=minimal',
  });
}

async function main() {
  const root = repoRoot();
  loadDotEnvCloudflare(root);
  const scope = resolveDeployScope({ repoRoot: root, strict: false });
  const workspaceId = scope.workspaceId || process.env.WORKSPACE_ID || 'ws_inneranimalmedia';
  const tenantId = scope.tenantId || process.env.TENANT_ID;
  if (!tenantId) {
    console.error('Set TENANT_ID (or .deploy-run-context.json tenant_id)');
    process.exit(1);
  }

  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: root }).trim();
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
    cwd: root,
  }).trim();
  const snapshotId = `fresh_${Date.now().toString(36)}_${sha.slice(0, 7)}`;

  const paths = walkSourceFiles(root);
  const prioritySet = new Set(collectAllPriorityRelPaths(root));
  for (const abs of paths) {
    const rel = relative(root, abs).replace(/\\/g, '/');
    if (prioritySet.has(rel)) prioritySet.add(rel);
  }

  console.log('[fresh-codebase-rag] mode=%s workspace=%s files=%s snapshot=%s', dryRun ? 'dry-run' : 'apply', workspaceId, paths.length, snapshotId);

  if (dryRun) {
    console.log('[fresh-codebase-rag] Sample paths:', paths.slice(0, 8).map((p) => relative(root, p)));
    process.exit(0);
  }

  const sb = requireSupabaseRest(scope);
  const base = sb.supabaseUrl.replace(/\/$/, '');
  const key = sb.serviceKey;
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();

  console.log('[fresh-codebase-rag] Wiping codebase_* for', workspaceId);
  for (const table of ['codebase_chunks', 'codebase_files', 'codebase_symbols', 'codebase_snapshots']) {
    await deleteWorkspaceRows(base, key, table, workspaceId);
  }

  let totalLines = 0;
  let totalBytes = 0;
  const fileRows = [];
  const capped = paths.slice(0, MAX_FILES);

  for (const abs of capped) {
    let raw;
    try {
      raw = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const rel = relative(root, abs).replace(/\\/g, '/');
    const bytes = Buffer.byteLength(raw, 'utf8');
    const lines = raw ? raw.split('\n').length : 0;
    totalLines += lines;
    totalBytes += bytes;
    fileRows.push({
      snapshot_id: snapshotId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      file_path: rel,
      file_size_bytes: bytes,
      line_count: lines,
      language: /\.tsx?$/i.test(rel) ? 'typescript' : 'javascript',
      category: rel.startsWith('dashboard/') ? 'dashboard' : 'src',
      is_priority: prioritySet.has(rel),
      metadata: { fresh_reindex: true, commit_sha: sha },
    });
  }

  await sbRequest('POST', `${base}/rest/v1/codebase_snapshots`, key, {
    snapshot_id: snapshotId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    commit_sha: sha,
    branch,
    repo_url: process.env.GITHUB_REPOSITORY || 'https://github.com/SamPrimeaux/inneranimalmedia',
    file_count: fileRows.length,
    total_lines: totalLines,
    total_bytes: totalBytes,
    chunk_count: 0,
    upload_status: 'uploading',
    metadata: { fresh_reindex: true },
  });

  const batchSize = 80;
  for (let i = 0; i < fileRows.length; i += batchSize) {
    await sbRequest('POST', `${base}/rest/v1/codebase_files`, key, fileRows.slice(i, i + batchSize), {
      Prefer: 'return=minimal',
    });
  }

  let chunkTotal = 0;
  let embedded = 0;

  for (const abs of capped) {
    const rel = relative(root, abs).replace(/\\/g, '/');
    const body = readFileSync(abs, 'utf8');
    const parts = splitTextIntoTokenChunks(body, 500, 50);
    let idx = 0;
    for (const part of parts) {
      const token_count = estimateTokenCount(part);
      const row = {
        snapshot_id: snapshotId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        file_path: rel,
        chunk_index: idx,
        chunk_type: 'code',
        content: part.slice(0, 12000),
        token_count,
        language: /\.tsx?$/i.test(rel) ? 'typescript' : 'javascript',
        embed_model: skipEmbed ? null : EMBED_MODEL,
        metadata: { fresh_reindex: true },
      };

      if (!skipEmbed && openaiKey) {
        try {
          row.embedding = await openaiEmbed(openaiKey, part);
          embedded += 1;
          if (EMBED_BATCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, EMBED_BATCH_DELAY_MS));
        } catch (e) {
          console.warn('[fresh-codebase-rag] embed failed', rel, idx, e?.message ?? e);
        }
      }

      await sbRequest('POST', `${base}/rest/v1/codebase_chunks`, key, row, {
        Prefer: 'return=minimal',
      });
      chunkTotal += 1;
      idx += 1;
    }
  }

  await sbRequest(
    'PATCH',
    `${base}/rest/v1/codebase_snapshots?snapshot_id=eq.${encodeURIComponent(snapshotId)}`,
    key,
    { upload_status: 'complete', chunk_count: chunkTotal },
    { Prefer: 'return=minimal' },
  );

  console.log(
    '[fresh-codebase-rag] done files=%s chunks=%s embedded=%s model=%s',
    fileRows.length,
    chunkTotal,
    embedded,
    skipEmbed ? '(skipped)' : EMBED_MODEL,
  );
}

main().catch((e) => {
  console.error('[fresh-codebase-rag]', e);
  process.exit(1);
});
