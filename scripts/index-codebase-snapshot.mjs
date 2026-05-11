#!/usr/bin/env node
/**
 * Insert codebase_snapshots + codebase_files + codebase_symbols (+ optional chunks with embeddings).
 * Requires explicit TENANT_ID / WORKSPACE_ID via .deploy-run-context.json or env.
 *
 * Usage: node scripts/index-codebase-snapshot.mjs [--apply]
 */
import { readFileSync, existsSync, readdirSync, appendFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { resolveDeployScope, requireSupabaseRest } from './lib/supabase-deploy-context.mjs';
import { sbRequest } from './lib/supabase-rest.mjs';
import {
  repoRoot,
  DEPLOY_CONTEXT_FILE,
  DEPLOY_TOOL_EVENTS_FILE,
  DEPLOY_CODEBASE_INDEX_STATS_FILE,
} from './lib/supabase-deploy-paths.mjs';
import { collectAllPriorityRelPaths, AGENT_SAM_CANONICAL_KNOWLEDGE_EDGES } from './lib/priority-codebase-sources.mjs';

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

/** Line windows for code/SQL — better semantic chunks than raw char splits. */
function chunkByLines(text, lineWindow = 100, overlap = 18) {
  const lines = String(text ?? '').split('\n');
  if (!lines.length) return [''];
  const win = Math.max(20, lineWindow);
  const ov = Math.max(0, Math.min(overlap, win - 1));
  const out = [];
  for (let i = 0; i < lines.length; i += win - ov) {
    out.push(lines.slice(i, i + win).join('\n'));
    if (i + win >= lines.length) break;
  }
  return out.length ? out : [''];
}

function chunkSourceForIndex(rel, body) {
  if (/\.sql$/i.test(rel)) return chunkByLines(body, 85, 14);
  if (/\.(tsx?|jsx?|mjs|cjs)$/i.test(rel)) return chunkByLines(body, 110, 20);
  return chunkText(body, 5200);
}

const MAX_PRIORITY_EMBEDDED_CHUNKS = 220;
const MAX_CHUNKS_PER_PRIORITY_FILE = 38;

async function upsertCanonicalKnowledgeEdges(base, key, tenantId, workspaceId, snapshotId) {
  const rows = AGENT_SAM_CANONICAL_KNOWLEDGE_EDGES.map((e) => ({
    entity_a: e.entity_a,
    relation: e.relation,
    entity_b: e.entity_b,
    source_type: e.source_type,
    tenant_id: tenantId,
    confidence: 1,
    metadata: {
      workspace_id: workspaceId,
      snapshot_id: snapshotId,
      ingested_via: 'index_codebase_snapshot',
    },
  }));
  const q = new URLSearchParams({
    on_conflict: 'entity_a,relation,entity_b,tenant_id',
  });
  await sbRequest('POST', `${base}/rest/v1/knowledge_edges?${q}`, key, rows, {
    Prefer: 'resolution=merge-duplicates,return=minimal',
  });
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
    try {
      writeFileSync(
        join(root, DEPLOY_CODEBASE_INDEX_STATS_FILE),
        JSON.stringify({
          codebase_index_status: 'skipped',
          codebase_index_ms: 0,
          reason: 'missing_tenant_or_workspace',
        }),
        'utf8',
      );
    } catch {
      /* optional */
    }
    console.warn('[index-codebase] Missing TENANT_ID/WORKSPACE_ID — skipping');
    process.exit(0);
  }

  if (!apply) {
    console.log('[index-codebase] Dry run — pass --apply to write Supabase');
    process.exit(0);
  }

  const sb = requireSupabaseRest(scope);
  if (!sb.supabaseUrl || !sb.serviceKey) {
    try {
      writeFileSync(
        join(root, DEPLOY_CODEBASE_INDEX_STATS_FILE),
        JSON.stringify({
          codebase_index_status: 'skipped',
          codebase_index_ms: 0,
          reason: 'no_supabase_credentials',
        }),
        'utf8',
      );
    } catch {
      /* optional */
    }
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
  const priorityRelSet = new Set(collectAllPriorityRelPaths(root));
  for (const rel of priorityRelSet) {
    const abs = join(root, rel);
    if (existsSync(abs) && !paths.includes(abs)) paths.push(abs);
  }
  paths = [...new Set(paths)].slice(0, 950);

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
      category: rel.startsWith('docs/')
        ? 'docs'
        : rel.startsWith('src/')
          ? 'src'
          : rel.startsWith('dashboard/')
            ? 'dashboard'
            : 'scripts',
      is_priority: priorityRelSet.has(rel),
      metadata: { indexed_at: new Date().toISOString() },
    });
  }

  const routeMapPath = join(root, 'docs/route-map.md');
  let symbols = [];
  if (existsSync(routeMapPath)) {
    symbols = parseRouteMapSymbols(readFileSync(routeMapPath, 'utf8'), 'docs/route-map.md');
  }

  const priorityFiles = [...priorityRelSet]
    .map((rel) => join(root, rel))
    .filter((abs) => existsSync(abs));

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

  /** public.codebase_snapshots.upload_status CHECK: uploading | complete | failed | stale */
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
    upload_status: 'uploading',
    metadata: snapMeta,
  });

  const snapPatchUrl = `${base}/rest/v1/codebase_snapshots?snapshot_id=eq.${encodeURIComponent(snapshotId)}`;

  async function setSnapshotUploadStatus(status, extra = {}) {
    await sbRequest('PATCH', snapPatchUrl, key, { upload_status: status, ...extra }, {
      Prefer: 'return=minimal',
    });
  }

  function appendToolFailureEvent(errMsg) {
    try {
      let ctx = {};
      if (existsSync(ctxPath)) ctx = JSON.parse(readFileSync(ctxPath, 'utf8'));
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        run_group_id: ctx.run_group_id || process.env.RUN_GROUP_ID || null,
        tenant_id: ctx.tenant_id || tenantId,
        workspace_id: ctx.workspace_id || workspaceId,
        d1_auth_user_id: ctx.d1_auth_user_id || process.env.D1_AUTH_USER_ID || null,
        user_email: ctx.user_email || process.env.DEPLOY_USER_EMAIL || null,
        agent_tool: 'deploy_automation',
        tool_name: 'index_codebase_snapshot',
        tool_category: 'deploy',
        tool_source: 'script',
        duration_ms: 0,
        success: false,
        error_message: String(errMsg || '').slice(0, 1200),
        input_preview: snapshotId,
        output_preview: null,
        input_json: { snapshot_id: snapshotId },
        output_json: {},
        metadata: { phase: 'index_codebase_snapshot' },
      });
      appendFileSync(join(root, DEPLOY_TOOL_EVENTS_FILE), `${line}\n`, 'utf8');
    } catch {
      /* optional */
    }
  }

  const idxStart = Date.now();
  try {
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

    let chunkTotal = 0;
    if (priorityFiles.length && token && accountId) {
      outer: for (const fp of priorityFiles) {
        const rel = relative(root, fp).replace(/\\/g, '/');
        const body = readFileSync(fp, 'utf8');
        const parts = chunkSourceForIndex(rel, body);
        let idx = 0;
        let perFile = 0;
        for (const part of parts) {
          if (perFile >= MAX_CHUNKS_PER_PRIORITY_FILE) break;
          if (chunkTotal >= MAX_PRIORITY_EMBEDDED_CHUNKS) break outer;
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
            metadata: { deploy_index: true, priority_source: true },
          };
          await sbRequest('POST', `${base}/rest/v1/codebase_chunks`, key, row, {
            Prefer: 'return=minimal',
          });
          chunkTotal += 1;
          perFile += 1;
          idx += 1;
        }
      }
    } else if (!token || !accountId) {
      console.warn('[index-codebase] No CLOUDFLARE_API_TOKEN/ACCOUNT_ID — skipped chunk embeddings');
    }

    await setSnapshotUploadStatus('complete', { chunk_count: chunkTotal });

    try {
      await upsertCanonicalKnowledgeEdges(base, key, tenantId, workspaceId, snapshotId);
      console.log('[index-codebase] knowledge_edges canonical upsert ok');
    } catch (ke) {
      console.warn('[index-codebase] knowledge_edges upsert skipped:', ke?.message ?? ke);
    }

    try {
      writeFileSync(
        join(root, DEPLOY_CODEBASE_INDEX_STATS_FILE),
        JSON.stringify({
          codebase_index_status: 'passed',
          codebase_index_ms: Date.now() - idxStart,
          files_indexed: fileRows.length,
          route_map_symbols: symbols.length,
          chunks_written: chunkTotal,
        }),
        'utf8',
      );
    } catch {
      /* optional */
    }

    console.log(
      `[index-codebase] snapshot ${snapshotId} files=${fileRows.length} symbols=${symbols.length} chunks=${chunkTotal} upload_status=complete`,
    );
  } catch (e) {
    const msg = String(e?.message || e);
    try {
      writeFileSync(
        join(root, DEPLOY_CODEBASE_INDEX_STATS_FILE),
        JSON.stringify({
          codebase_index_status: 'failed',
          codebase_index_ms: Math.max(0, Date.now() - idxStart),
          error_preview: msg.slice(0, 200),
        }),
        'utf8',
      );
    } catch {
      /* optional */
    }
    try {
      await setSnapshotUploadStatus('failed');
    } catch {
      /* ignore */
    }
    appendToolFailureEvent(msg);
    console.error('[index-codebase] FAILED:', msg);
    if (e?.stack) console.error(e.stack.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[index-codebase]', e);
  process.exit(1);
});
