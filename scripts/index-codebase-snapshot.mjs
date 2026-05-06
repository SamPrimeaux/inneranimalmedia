#!/usr/bin/env node
/**
 * Insert codebase_snapshots + codebase_files + codebase_symbols (+ optional chunks with embeddings).
 * Requires explicit TENANT_ID / WORKSPACE_ID via .deploy-run-context.json or env.
 *
 * Usage: node scripts/index-codebase-snapshot.mjs [--apply]
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { resolveDeployScope, requireSupabaseRest } from './lib/supabase-deploy-context.mjs';
import { sbRequest } from './lib/supabase-rest.mjs';
import { repoRoot, DEPLOY_CONTEXT_FILE } from './lib/supabase-deploy-paths.mjs';

const MODEL = '@cf/baai/bge-large-en-v1.5';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');

const SKIP_DIR = new Set([
  'node_modules',
  '.git',
  '.wrangler',
  '.cache',
  'dashboard/dist',
  'dist',
  'analytics/deploys',
]);

const EXT_OK = /\.(js|mjs|cjs|ts|tsx|jsx|md)$/i;

function walkFiles(dir, root, out = []) {
  let ents;
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const p = join(dir, e.name);
    const rel = relative(root, p);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      walkFiles(p, root, out);
    } else if (e.isFile() && EXT_OK.test(e.name) && !rel.startsWith('analytics/deploys')) {
      out.push(p);
    }
  }
  return out;
}

function countLines(s) {
  if (!s) return 0;
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++;
  return n;
}

function langFromPath(fp) {
  if (/\.md$/i.test(fp)) return 'markdown';
  if (/\.tsx?$/i.test(fp)) return 'typescript';
  if (/\.jsx?$/i.test(fp)) return 'javascript';
  return 'text';
}

function parseRouteMapSymbols(content, filePath) {
  const out = [];
  const lines = content.split('\n');
  const headRe = /^##\s+(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hm = line.match(headRe);
    if (!hm) continue;
    const title = hm[1].trim();
    if (/^Total route patterns/i.test(title)) continue;
    const bits = title.split(/\s+/).filter(Boolean);
    if (bits.length < 2) continue;
    let methods = bits[0];
    let pathPart = bits.slice(1).join(' ').split(/[\s`]/)[0];
    if (!pathPart || !pathPart.startsWith('/')) continue;
    if (/varies|prefix/i.test(methods)) continue;
    const meth =
      methods.includes('/') || methods === '*' ? methods.replace(/\//g, ',') : methods;
    out.push({
      symbol_type: 'route',
      symbol_name: `${meth} ${pathPart}`.slice(0, 500),
      http_method: meth.includes(',')
        ? meth
        : meth === 'GET' || meth === 'POST' || meth === 'PUT' || meth === 'DELETE' || meth === 'PATCH'
          ? meth
          : null,
      line_number: i + 1,
      signature: title.slice(0, 800),
    });
    if (out.length >= 400) break;
  }
  return out.map((s) => ({ ...s, file_path: filePath }));
}

async function embedText(token, accountId, text) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: String(text).slice(0, 8000) }),
  });
  const j = await r.json().catch(() => ({}));
  const vec = j?.result?.data?.[0] ?? j?.result?.[0];
  if (!Array.isArray(vec) || vec.length !== 1024) return null;
  return vec;
}

function chunkText(s, max = 5500) {
  const t = String(s);
  if (t.length <= max) return [t];
  const parts = [];
  for (let i = 0; i < t.length; i += max) parts.push(t.slice(i, i + max));
  return parts;
}

async function main() {
  const root = repoRoot();
  let scope = resolveDeployScope({ repoRoot: root, strict: false });
  let snapSuffix =
    process.env.RUN_GROUP_ID?.trim().replace(/[^a-zA-Z0-9_-]/g, '_') ||
    `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const ctxPath = join(root, DEPLOY_CONTEXT_FILE);
  if (existsSync(ctxPath)) {
    try {
      const c = JSON.parse(readFileSync(ctxPath, 'utf8'));
      if (c.run_group_id) snapSuffix = String(c.run_group_id).replace(/[^a-zA-Z0-9_-]/g, '_');
      scope = {
        ...scope,
        tenantId: c.tenant_id || scope.tenantId,
        workspaceId: c.workspace_id || scope.workspaceId,
        projectId: c.project_id || scope.projectId,
      };
    } catch {
      /* ignore */
    }
  }

  const snapshotId = `snap_${snapSuffix}`;
  const tenantId = scope.tenantId;
  const workspaceId = scope.workspaceId;

  if (!tenantId || !workspaceId) {
    console.warn('[index-codebase] Missing TENANT_ID/WORKSPACE_ID — skipping');
    process.exit(0);
  }

  if (!apply) {
    console.log('[index-codebase] Dry run — pass --apply to write Supabase');
    process.exit(0);
  }

  const sb = requireSupabaseRest(scope);
  if (!sb.supabaseUrl || !sb.serviceKey) {
    console.warn('[index-codebase] No SUPABASE_URL/SERVICE_ROLE_KEY — skipping');
    process.exit(0);
  }

  const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();

  const repoUrl =
    process.env.GITHUB_REPOSITORY || 'https://github.com/SamPrimeaux/inneranimalmedia';

  const execSyncMod = await import('child_process');
  const sha = execSyncMod.execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    cwd: root,
  }).trim();
  const branch = execSyncMod
    .execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      cwd: root,
    })
    .trim();

  const roots = ['src', 'docs', 'scripts'].map((d) => join(root, d)).filter((p) => existsSync(p));
  let paths = [];
  for (const r0 of roots) walkFiles(r0, root, paths);
  paths = [...new Set(paths)].slice(0, 900);

  let totalLines = 0;
  let totalBytes = 0;
  const fileRows = [];

  for (const fp of paths) {
    let raw;
    try {
      raw = readFileSync(fp, 'utf8');
    } catch {
      continue;
    }
    const rel = relative(root, fp).replace(/\\/g, '/');
    const lines = countLines(raw);
    const bytes = Buffer.byteLength(raw, 'utf8');
    totalLines += lines;
    totalBytes += bytes;
    fileRows.push({
      snapshot_id: snapshotId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      file_path: rel,
      file_size_bytes: bytes,
      line_count: lines,
      language: langFromPath(rel),
      category: rel.startsWith('docs/') ? 'docs' : rel.startsWith('src/') ? 'src' : 'scripts',
      is_priority: /unified-search|route-map|index\.js|production-dispatch/.test(rel),
      metadata: { indexed_at: new Date().toISOString() },
    });
  }

  const routeMapPath = join(root, 'docs/route-map.md');
  let symbols = [];
  if (existsSync(routeMapPath)) {
    symbols = parseRouteMapSymbols(readFileSync(routeMapPath, 'utf8'), 'docs/route-map.md');
  }

  const priorityFiles = fileRows
    .filter((f) => f.is_priority)
    .map((f) => join(root, f.file_path))
    .slice(0, 25);

  const base = sb.supabaseUrl.replace(/\/$/, '');
  const key = sb.serviceKey;

  const snapMeta = {
    run_group_id: existsSync(ctxPath)
      ? JSON.parse(readFileSync(ctxPath, 'utf8')).run_group_id
      : null,
    commit_sha: sha,
    file_rows: fileRows.length,
    symbol_rows: symbols.length,
  };

  await sbRequest('POST', `${base}/rest/v1/codebase_snapshots`, key, {
    snapshot_id: snapshotId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    commit_sha: sha,
    branch,
    repo_url: repoUrl,
    file_count: fileRows.length,
    total_lines: totalLines,
    total_bytes: totalBytes,
    chunk_count: 0,
    r2_prefix: 'static/dashboard/agent',
    upload_status: 'uploaded',
    metadata: snapMeta,
  });

  const batchSize = 80;
  for (let i = 0; i < fileRows.length; i += batchSize) {
    const chunk = fileRows.slice(i, i + batchSize);
    await sbRequest('POST', `${base}/rest/v1/codebase_files`, key, chunk, {
      Prefer: 'return=minimal',
    });
  }

  const symPayload = symbols.map((s) => ({
    snapshot_id: snapshotId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    file_path: s.file_path,
    symbol_type: s.symbol_type,
    symbol_name: s.symbol_name,
    http_method: s.http_method,
    line_number: s.line_number,
    signature: s.signature,
    metadata: {},
  }));
  for (let i = 0; i < symPayload.length; i += batchSize) {
    await sbRequest('POST', `${base}/rest/v1/codebase_symbols`, key, symPayload.slice(i, i + batchSize), {
      Prefer: 'return=minimal',
    });
  }

  if (priorityFiles.length && token && accountId) {
    let chunkTotal = 0;
    for (const fp of priorityFiles) {
      const rel = relative(root, fp).replace(/\\/g, '/');
      const body = readFileSync(fp, 'utf8');
      const parts = chunkText(body, 5200);
      let idx = 0;
      for (const part of parts) {
        const vec = await embedText(token, accountId, part);
        await new Promise((r) => setTimeout(r, Number(process.env.INGEST_DELAY_MS || 120)));
        const row = {
          snapshot_id: snapshotId,
          file_id: null,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          file_path: rel,
          chunk_index: idx,
          chunk_type: 'code',
          content: part.slice(0, 12000),
          embedding: vec,
          line_start: null,
          line_end: null,
          symbol_name: null,
          language: langFromPath(rel),
          embed_model: MODEL,
          metadata: { deploy_index: true },
        };
        await sbRequest('POST', `${base}/rest/v1/codebase_chunks`, key, row, {
          Prefer: 'return=minimal',
        });
        chunkTotal += 1;
        idx += 1;
        if (chunkTotal >= 80) break;
      }
      if (chunkTotal >= 80) break;
    }

    await sbRequest(
      'PATCH',
      `${base}/rest/v1/codebase_snapshots?snapshot_id=eq.${encodeURIComponent(snapshotId)}`,
      key,
      { chunk_count: chunkTotal },
      { Prefer: 'return=minimal' },
    );
  } else if (!token || !accountId) {
    console.warn('[index-codebase] No CLOUDFLARE_API_TOKEN/ACCOUNT_ID — skipped chunk embeddings');
  }

  console.log(
    `[index-codebase] snapshot ${snapshotId} files=${fileRows.length} symbols=${symbols.length}`,
  );
}

main().catch((e) => {
  console.error('[index-codebase]', e);
  process.exit(1);
});
