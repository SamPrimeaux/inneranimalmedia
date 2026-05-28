#!/usr/bin/env node
/**
 * agentsam_codebase_reindex.mjs
 * ----------------------------
 * Targeted code intelligence indexing for the /dashboard/agent dependency neighborhood.
 *
 * This script intentionally does NOT embed the entire repository. It:
 * - builds a lightweight file catalog for selected files
 * - chunks only selected files (syntax-ish heuristics + safe fallback)
 * - embeds chunks using OpenAI text-embedding-3-large @ 1536 dims
 * - writes chunk vectors to Supabase (agentsam schema) and optionally Cloudflare Vectorize
 *
 * Dry-run is the default. Use explicit flags to write.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { execFileSync } from 'child_process';
import { sbRequest } from './lib/supabase-rest.mjs';

const DEFAULT_MAX_FILE_BYTES = 250 * 1024;
const DEFAULT_CHUNK_TARGET_TOKENS = 750;
const DEFAULT_CHUNK_MAX_TOKENS = 1200;
const DEFAULT_CHUNK_OVERLAP_TOKENS = 100;
const DEFAULT_MAX_FILES = 35;
const DEFAULT_MAX_CHUNKS = 250;

function nowIso() {
  return new Date().toISOString();
}

function sha256Hex(s) {
  const buf = new TextEncoder().encode(String(s ?? ''));
  // node 18+ has global crypto
  return crypto.subtle.digest('SHA-256', buf).then((d) =>
    Array.from(new Uint8Array(d))
      .map((n) => n.toString(16).padStart(2, '0'))
      .join(''),
  );
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const k = a.slice(2);
    const next = argv[i + 1];
    const isBool =
      next == null || next.startsWith('--') || k === 'dry-run' || k === 'write-supabase' || k === 'write-vectorize';
    if (isBool) {
      out[k] = true;
    } else {
      out[k] = next;
      i++;
    }
  }
  return out;
}

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function gitDiffNameOnly(root, baseSha, sha) {
  if (!baseSha || !sha) return [];
  try {
    const raw = execFileSync('git', ['diff', '--name-only', `${baseSha}..${sha}`], { cwd: root, encoding: 'utf8' });
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function fileLanguage(relPath) {
  const ext = extname(relPath).toLowerCase();
  if (ext === '.md' || ext === '.mdc') return 'markdown';
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  if (ext === '.sql') return 'sql';
  if (ext === '.toml' || ext === '.json' || ext === '.jsonc' || ext === '.yaml' || ext === '.yml') return 'config';
  if (ext === '.py') return 'python';
  if (ext === '.sh' || ext === '.zsh') return 'shell';
  return 'text';
}

function isBinaryLike(relPath) {
  const ext = extname(relPath).toLowerCase();
  return (
    ext === '.png' ||
    ext === '.jpg' ||
    ext === '.jpeg' ||
    ext === '.webp' ||
    ext === '.gif' ||
    ext === '.pdf' ||
    ext === '.zip' ||
    ext === '.gz' ||
    ext === '.woff' ||
    ext === '.woff2' ||
    ext === '.ttf' ||
    ext === '.ico'
  );
}

function shouldExcludePath(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (
    p.startsWith('node_modules/') ||
    p.startsWith('dist/') ||
    p.startsWith('build/') ||
    p.startsWith('.next/') ||
    p.startsWith('.wrangler/') ||
    p.startsWith('.git/') ||
    p.startsWith('coverage/') ||
    p.endsWith('.min.js') ||
    p.endsWith('.map')
  )
    return true;
  // Keep selection tight: these are huge/volatile inventories, not dashboard_agent code intelligence.
  if (p.startsWith('docs/db/') || p.startsWith('docs/db-audit/')) return true;
  if (p.startsWith('docs/agentsam_knowledge/')) return true; // default exclude (can be re-enabled via dependency reachability)
  if (p === 'package-lock.json' || p === 'pnpm-lock.yaml' || p === 'yarn.lock') return true;
  if (isBinaryLike(p)) return true;
  return false;
}

function globToRegExp(glob) {
  // Very small glob subset: **, *, ?
  const g = glob.replace(/\\/g, '/');
  let re = '^';
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    const next = g[i + 1];
    if (ch === '*' && next === '*') {
      // ** -> match any chars incl /
      re += '.*';
      i++;
      continue;
    }
    if (ch === '*') {
      re += '[^/]*';
      continue;
    }
    if (ch === '?') {
      re += '.';
      continue;
    }
    re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  re += '$';
  return new RegExp(re);
}

function matchesAny(relPath, globs) {
  const p = relPath.replace(/\\/g, '/');
  for (const g of globs) {
    const r = globToRegExp(g);
    if (r.test(p)) return true;
  }
  return false;
}

function walkFiles(rootDir) {
  const out = [];
  const skipDir = new Set(['node_modules', '.git', '.wrangler', 'dist', 'build', 'coverage', '.next']);
  const walk = (dir) => {
    let ents;
    try {
      ents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const abs = join(dir, e.name);
      const rel = relative(rootDir, abs).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (skipDir.has(e.name)) continue;
        walk(abs);
      } else if (e.isFile()) {
        out.push(rel);
      }
    }
  };
  walk(rootDir);
  return out;
}

function estimateTokens(text) {
  // Cheap estimate (good enough for chunk sizing).
  const s = String(text ?? '');
  return Math.max(1, Math.ceil(s.length / 4));
}

function normalizeChunkHashInput(s) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitMarkdownByHeadings(text) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  let cur = [];
  let start = 1;
  let title = null;
  const flush = (endLine) => {
    const content = cur.join('\n').trim();
    if (content) blocks.push({ start_line: start, end_line: endLine, symbol_name: title, symbol_type: 'markdown_section', content });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(#{1,6})\s+(.+)\s*$/);
    if (m && cur.length) {
      flush(i);
      cur = [];
      start = i + 1;
      title = m[2].trim().slice(0, 200);
    }
    if (m && !cur.length) {
      title = m[2].trim().slice(0, 200);
    }
    cur.push(line);
  }
  flush(lines.length);
  return blocks.length ? blocks : [{ start_line: 1, end_line: lines.length, symbol_name: null, symbol_type: 'markdown_section', content: String(text ?? '').trim() }];
}

function markdownBlocksAsChunks(blocks, maxTokens) {
  const out = [];
  for (const b of blocks) {
    const t = String(b.content ?? '').trim();
    if (!t) continue;
    // If a heading block is huge, fall back to windows.
    if (estimateTokens(t) > maxTokens) {
      out.push(
        ...chunkBlocksToTokenWindows(
          { ...b, content: t },
          Math.min(900, maxTokens),
          maxTokens,
          100,
        ),
      );
    } else {
      out.push({
        start_line: b.start_line,
        end_line: b.end_line,
        symbol_name: b.symbol_name,
        symbol_type: b.symbol_type,
        content: t,
      });
    }
  }
  return out;
}

function splitJsTsBySymbols(text) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  const startRe =
    /^\s*(export\s+)?(default\s+)?(async\s+)?(function|class|const|let|var)\s+([A-Za-z0-9_$]+)?/;
  let cur = [];
  let start = 1;
  let symbol = null;
  let symbolType = 'unknown';
  const flush = (endLine) => {
    const content = cur.join('\n').trim();
    if (content) blocks.push({ start_line: start, end_line: endLine, symbol_name: symbol, symbol_type: symbolType, content });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(startRe);
    const isNew = Boolean(m) && (line.includes('function') || line.includes('class') || line.includes('const') || line.includes('export'));
    if (isNew && cur.length >= 20) {
      flush(i);
      cur = [];
      start = i + 1;
    }
    if (isNew && !cur.length) {
      symbol = (m?.[5] || null)?.slice?.(0, 200) ?? null;
      if (line.includes('class')) symbolType = 'component';
      else if (line.includes('function')) symbolType = 'function';
      else if (line.includes('const') && line.includes('use')) symbolType = 'hook';
      else symbolType = 'unknown';
    }
    cur.push(line);
  }
  flush(lines.length);
  return blocks.length ? blocks : [{ start_line: 1, end_line: lines.length, symbol_name: null, symbol_type: 'unknown', content: String(text ?? '').trim() }];
}

function chunkBlocksToTokenWindows(block, targetTokens, maxTokens, overlapTokens) {
  const lines = String(block.content ?? '').split('\n');
  if (!lines.length) return [];
  const out = [];
  let i = 0;
  const overlapLines = Math.max(0, Math.floor(overlapTokens / 8));
  const windowLines = Math.max(20, Math.floor(targetTokens / 8));
  while (i < lines.length) {
    const slice = lines.slice(i, i + windowLines);
    const content = slice.join('\n').trim();
    if (content) {
      const start_line = block.start_line + i;
      const end_line = Math.min(block.start_line + i + slice.length - 1, block.end_line);
      // Enforce maxTokens by shrinking if needed
      let c = content;
      while (estimateTokens(c) > maxTokens && c.length > 200) c = c.slice(0, Math.floor(c.length * 0.9));
      out.push({
        start_line,
        end_line,
        symbol_name: block.symbol_name,
        symbol_type: block.symbol_type,
        content: c,
      });
    }
    if (i + windowLines >= lines.length) break;
    i += windowLines - overlapLines;
  }
  return out;
}

function buildChunkHeader({ file_path, branch, sha, language, start_line, end_line, scope, symbol_name }) {
  return [
    `FILE: ${file_path}`,
    `BRANCH: ${branch}`,
    `SHA: ${sha}`,
    `LANG: ${language}`,
    `RANGE: ${start_line}-${end_line}`,
    `SCOPE: ${scope}`,
    `SYMBOL: ${symbol_name || ''}`,
    `---`,
    ``,
  ].join('\n');
}

function shortVectorizeId({ scope, filePathHash16, chunkIndex }) {
  const scopeTag = scope === 'dashboard_agent' ? 'da' : 's';
  const idx = String(Number(chunkIndex) || 0).padStart(4, '0');
  // Cloudflare Vectorize id max is 64 bytes; keep it short + deterministic.
  return `codebase::${scopeTag}::${filePathHash16}::${idx}`;
}

async function openaiEmbedBatch(apiKey, texts, dimensions = 1536) {
  const base = String(process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/$/, '');
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-large', input: texts, dimensions }),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI embeddings: non-JSON (${res.status})`);
  }
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI embeddings HTTP ${res.status}`);
  const vecs = data?.data?.map((d) => d?.embedding) || [];
  for (const v of vecs) {
    if (!Array.isArray(v) || v.length !== dimensions) {
      throw new Error(`Embedding dimension mismatch: expected ${dimensions}, got ${v?.length ?? 0}`);
    }
  }
  return vecs;
}

async function vectorizeUpsertNdjson({ accountId, apiToken, indexName, vectors }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${indexName}/upsert`;
  const ndjson = vectors.map((v) => JSON.stringify(v)).join('\n');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/x-ndjson' },
    body: ndjson,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok || json?.success === false) {
    throw new Error(`Vectorize upsert failed: HTTP ${res.status} ${text.slice(0, 400)}`);
  }
  return json;
}

function selectionReasonFor(relPath, changedSet) {
  const p = relPath.toLowerCase();
  if (p.includes('/dashboard/agent') || p.endsWith('/agent.html') || p.endsWith('agent.html')) return 'dashboard_agent_surface';
  if (p.includes('chatassistant')) return 'chatassistant';
  if (p.includes('agent-chat') || p.includes('agentchat')) return 'agent_chat';
  if (p.includes('rag-lanes') || p.includes('agentsam-vectorize')) return 'rag_or_vectorize_support';
  if (changedSet.has(relPath)) return 'changed_in_range';
  return 'allowlist';
}

function isAllowedDoc(relPath) {
  const p = relPath.replace(/\\/g, '/');
  return p === 'docs/supabase/AGENTSAM_RAG_LANE_SCHEMA_REFERENCE.md';
}

function isDocsPath(relPath) {
  return relPath.replace(/\\/g, '/').startsWith('docs/');
}

function shouldChunkFile(relPath) {
  const p = relPath.replace(/\\/g, '/');
  // Hard rule: do not chunk/embed/vectorize docs. (Catalog-only allowed in dry-run.)
  if (isDocsPath(p)) return false;
  if (p.startsWith('dashboard/components/ChatAssistant/')) return true;
  // Minimal IDE neighborhood for /dashboard/agent usefulness.
  if (
    p === 'dashboard/components/MonacoEditorView.tsx' ||
    p === 'dashboard/components/VirtualizedFileTree.tsx' ||
    p === 'dashboard/src/lib/localFileTree.ts' ||
    p === 'dashboard/src/lib/monacoModelRegistry.ts' ||
    p === 'dashboard/src/lib/fileKind.ts' ||
    p === 'dashboard/src/components/SetiFileIcon.tsx' ||
    p === 'dashboard/src/ideWorkspace.ts' ||
    p === 'dashboard/types.ts'
  ) {
    return true;
  }
  return false;
}

function isRuntimeConfigEligible(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (p === 'wrangler.production.toml' || p === 'wrangler.toml' || p === 'wrangler.jsonc') return true;
  return false;
}

function fileExtCandidates(spec) {
  // Resolve TS/JS without extension.
  if (spec.endsWith('.js') || spec.endsWith('.jsx') || spec.endsWith('.ts') || spec.endsWith('.tsx') || spec.endsWith('.mjs') || spec.endsWith('.cjs')) return [spec];
  return [`${spec}.ts`, `${spec}.tsx`, `${spec}.js`, `${spec}.jsx`, `${spec}.mjs`, `${spec}.cjs`];
}

function parseImports(relPath, body) {
  const lang = fileLanguage(relPath);
  if (!(lang === 'typescript' || lang === 'javascript')) return [];
  const out = new Set();
  const s = String(body ?? '');
  // import ... from '...'
  for (const m of s.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = m?.[1] ? String(m[1]) : '';
    if (!spec.startsWith('.')) continue;
    out.add(spec);
  }
  // re-export ... from '...'
  for (const m of s.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const spec = m?.[1] ? String(m[1]) : '';
    if (!spec.startsWith('.')) continue;
    out.add(spec);
  }
  for (const m of s.matchAll(/export\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/g)) {
    const spec = m?.[1] ? String(m[1]) : '';
    if (!spec.startsWith('.')) continue;
    out.add(spec);
  }
  // dynamic import('...')
  for (const m of s.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m?.[1] ? String(m[1]) : '';
    if (!spec.startsWith('.')) continue;
    out.add(spec);
  }
  // require('...')
  for (const m of s.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m?.[1] ? String(m[1]) : '';
    if (!spec.startsWith('.')) continue;
    out.add(spec);
  }
  return [...out];
}

function resolveImportToRelPaths(fromRel, spec) {
  const fromDir = fromRel.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const base = (fromDir ? `${fromDir}/` : '') + spec.replace(/\\/g, '/');
  const norm = base
    .split('/')
    .reduce((acc, part) => {
      if (!part || part === '.') return acc;
      if (part === '..') return acc.slice(0, -1);
      return [...acc, part];
    }, [])
    .join('/');
  const candidates = [];
  for (const c of fileExtCandidates(norm)) candidates.push(c);
  // index.* fallback
  candidates.push(...fileExtCandidates(`${norm}/index`));
  return candidates;
}

function readTextIfExists(root, rel) {
  try {
    const abs = join(root, rel);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function computeProductionGraph({ root, entrypoints, maxHops, edgeAllow = null }) {
  /** @type {Map<string, { hop: number, reason: string, via: string | null }>} */
  const live = new Map();
  /** @type {Array<{ parent: string, child: string }>} */
  const edges = [];
  const q = [];
  for (const e of entrypoints) {
    live.set(e, { hop: 0, reason: 'direct_route', via: null });
    q.push(e);
  }

  while (q.length) {
    const cur = q.shift();
    const meta = live.get(cur);
    if (!meta) continue;
    if (meta.hop >= maxHops) continue;
    const body = readTextIfExists(root, cur);
    if (!body) continue;
    const imports = parseImports(cur, body);
    for (const spec of imports) {
      for (const cand of resolveImportToRelPaths(cur, spec)) {
        if (shouldExcludePath(cand)) continue;
        if (!existsSync(join(root, cand))) continue;
        if (typeof edgeAllow === 'function' && !edgeAllow(cur, cand)) continue;
        edges.push({ parent: cur, child: cand });
        if (!live.has(cand)) {
          live.set(cand, { hop: meta.hop + 1, reason: 'import_dependency', via: cur });
          q.push(cand);
        }
      }
    }
  }
  return { live, edges };
}

function isChangedFileEligible(relPath) {
  return /dashboard\/agent|chatassistant|agent-chat|monaco.*markdown|monaco|rag|vectorize|supabase|agentsam/i.test(relPath);
}

function safeBool(v) {
  return v === true || v === 'true' || v === 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const workspaceKey = String(args['workspace-key'] || '').trim();
  const workspaceId = String(args['workspace-id'] || '').trim();
  const scope = String(args.scope || '').trim() || 'dashboard_agent';
  const branch = String(args.branch || '').trim() || 'production';
  const sha = String(args.sha || '').trim();
  const baseSha = String(args['base-sha'] || '').trim();
  const dryRun = Boolean(args['dry-run'] || (!args['write-supabase'] && !args['write-vectorize']));
  const writeSupabase = Boolean(args['write-supabase']);
  const writeVectorize = Boolean(args['write-vectorize']);
  const limitFiles = args['limit-files'] ? Number(args['limit-files']) : null;
  const limitChunks = args['limit-chunks'] ? Number(args['limit-chunks']) : null;
  const allowLargeRun = Boolean(args['allow-large-run']);

  if (!workspaceKey) die('Missing --workspace-key');
  if (!workspaceId) die('Missing --workspace-id');
  if (!sha) die('Missing --sha');
  if (!baseSha) die('Missing --base-sha');
  if (scope !== 'dashboard_agent') die('Only --scope dashboard_agent supported for now');

  const root = repoRoot();
  const maxFileBytes = args['max-file-bytes'] ? Number(args['max-file-bytes']) : DEFAULT_MAX_FILE_BYTES;
  const maxFiles = args['max-files'] ? Number(args['max-files']) : DEFAULT_MAX_FILES;
  const maxChunks = args['max-chunks'] ? Number(args['max-chunks']) : DEFAULT_MAX_CHUNKS;

  // ── Route entrypoint discovery (repo-derived, no HTTP crawling) ────────────
  // For this pipeline, the "production-live" graph should be seeded from the actual dashboard SPA surface
  // plus the Agent shell neighborhood (ChatAssistant entry + route helpers). Avoid Durable Object classes.
  const explicitEntrypoints = [
    'dashboard/App.tsx',
    'dashboard/lib/agentRoutes.ts',
    'dashboard/components/ChatAssistant/index.ts',
    'dashboard/components/ChatAssistant/ChatAssistant.tsx',
  ].filter((p) => existsSync(join(root, p)));

  const entrypoints = explicitEntrypoints;

  const agentShellAllowRe = new RegExp(
    [
      '^dashboard/(?:',
      // ChatAssistant neighborhood
      'components/ChatAssistant/(?:.+)',
      '|components/ChatAssistant\\.tsx',
      // Core agent IDE surface panels (tight subset)
      '|components/(?:XTermShell|TerminalSessionPane|MonacoEditorView|LocalExplorer|VirtualizedFileTree)\\.tsx',
      // Route helpers / constants
      '|lib/(?:agentRoutes|sanitizeBrowserUrl)\\.ts',
      '|agent(?:ChatConstants|SessionsCatalog)\\.ts',
      '|types\\.ts',
      // Supporting dashboard src modules used by agent shell
      '|src/(?:ideWorkspace\\.ts|EditorContext\\.tsx|MeetContext\\.tsx|shellVersion\\.ts|applyCmsTheme\\.ts|recentWorkspacesStorage\\.ts)',
      '|src/components/(?:SetiFileIcon|ThinkingCard|ToolApprovalModal|FilePreview)\\.tsx',
      '|src/lib/(?:fileKind|setiFileIcon|mediaPreview|monacoModelRegistry|monacoThemes|localFileTree|r2Buckets|r2Listing)\\.ts',
      ')$',
    ].join(''),
  );

  const edgeAllow = (parent, child) => {
    if (!agentShellAllowRe.test(child)) return false;

    // Keep the graph tight by parent-specific pruning (repo-derived, deterministic).
    if (parent === 'dashboard/App.tsx') {
      return (
        child === 'dashboard/components/ChatAssistant/index.ts' ||
        child === 'dashboard/lib/agentRoutes.ts' ||
        child === 'dashboard/lib/sanitizeBrowserUrl.ts' ||
        child === 'dashboard/agentChatConstants.ts' ||
        child === 'dashboard/types.ts' ||
        child === 'dashboard/src/ideWorkspace.ts' ||
        child === 'dashboard/src/EditorContext.tsx' ||
        child === 'dashboard/components/MonacoEditorView.tsx' ||
        child === 'dashboard/components/LocalExplorer.tsx' ||
        child === 'dashboard/components/XTermShell.tsx' ||
        child === 'dashboard/src/components/SetiFileIcon.tsx'
      );
    }

    if (parent === 'dashboard/components/LocalExplorer.tsx') {
      return (
        child === 'dashboard/components/VirtualizedFileTree.tsx' ||
        child === 'dashboard/src/lib/localFileTree.ts' ||
        child === 'dashboard/src/lib/r2Buckets.ts' ||
        child === 'dashboard/src/lib/r2Listing.ts' ||
        child === 'dashboard/src/lib/mediaPreview.ts' ||
        child === 'dashboard/types.ts' ||
        child === 'dashboard/src/components/SetiFileIcon.tsx'
      );
    }

    if (parent === 'dashboard/components/MonacoEditorView.tsx') {
      return (
        child === 'dashboard/types.ts' ||
        child === 'dashboard/src/EditorContext.tsx' ||
        child === 'dashboard/src/components/FilePreview.tsx' ||
        child === 'dashboard/src/components/SetiFileIcon.tsx' ||
        child === 'dashboard/src/lib/fileKind.ts' ||
        child === 'dashboard/src/lib/mediaPreview.ts' ||
        child === 'dashboard/src/lib/monacoThemes.ts' ||
        child === 'dashboard/src/lib/monacoModelRegistry.ts' ||
        child === 'dashboard/src/ideWorkspace.ts'
      );
    }

    // Default: allow traversal (within allowed neighborhood) for ChatAssistant internal modules.
    return true;
  };

  const { live: productionGraph, edges: dependencyEdges } = computeProductionGraph({
    root,
    entrypoints,
    maxHops: 2,
    edgeAllow,
  });

  const changed = gitDiffNameOnly(root, baseSha, sha);
  const changedSet = new Set(changed);

  const all = walkFiles(root);
  /** @type {any[]} */
  const willIndexAndChunk = [];
  /** @type {any[]} */
  const selectedButNotChunked = [];
  /** @type {any[]} */
  const rejected = [];

  for (const rel of all) {
    if (shouldExcludePath(rel)) {
      rejected.push({ file_path: rel, rejection_reason: 'excluded_path' });
      continue;
    }
    const st = (() => {
      try {
        return statSync(join(root, rel));
      } catch {
        return null;
      }
    })();
    if (!st || !st.isFile()) continue;
    if (st.size > maxFileBytes && !changedSet.has(rel)) {
      rejected.push({ file_path: rel, rejection_reason: `too_large>${maxFileBytes}` });
      continue;
    }

    const lang = fileLanguage(rel);
    const isDoc = rel.replace(/\\/g, '/').startsWith('docs/');
    if (isDoc && !isAllowedDoc(rel)) {
      rejected.push({ file_path: rel, rejection_reason: 'docs-only, not schema contract' });
      continue;
    }

    // scripts/** default exclude except this script and support libs it uses.
    const isScript =
      rel.replace(/\\/g, '/').startsWith('scripts/') &&
      !(
        rel === 'scripts/agentsam_codebase_reindex.mjs' ||
        rel === 'scripts/lib/supabase-rest.mjs' ||
        rel === 'scripts/lib/supabase-deploy-context.mjs'
      );
    if (isScript) {
      rejected.push({ file_path: rel, rejection_reason: 'script not part of runtime or current ingestion contract' });
      continue;
    }

    // Production-live proof rules.
    let production_live = false;
    let production_live_reason = null;
    let dependency_hop = null;

    if (productionGraph.has(rel)) {
      const meta = productionGraph.get(rel);
      production_live = true;
      dependency_hop = meta.hop;
      production_live_reason =
        meta.hop === 0 ? 'direct route' : `import dependency (via ${meta.via || 'unknown'})`;
    } else if (changedSet.has(rel) && isChangedFileEligible(rel)) {
      // Changed in range is not enough alone; it must be runtime config eligible or in dashboard/src neighborhood.
      if (isRuntimeConfigEligible(rel)) {
        production_live = true;
        dependency_hop = 0;
        production_live_reason = 'vectorize binding config';
      } else {
        rejected.push({ file_path: rel, rejection_reason: 'not_in_repo_dependency_graph' });
        continue;
      }
    } else if (isAllowedDoc(rel)) {
      production_live = true;
      dependency_hop = 0;
      production_live_reason = 'schema contract';
    } else {
      rejected.push({ file_path: rel, rejection_reason: 'not_in_repo_dependency_graph' });
      continue;
    }

    if (lang === 'text') {
      selectedButNotChunked.push({ file_path: rel, reason: 'unknown_language' });
      continue;
    }

    const selection_reason = selectionReasonFor(rel, changedSet);
    willIndexAndChunk.push({
      file_path: rel,
      language: lang,
      size_bytes: st.size,
      selection_reason,
      changed_in_range: changedSet.has(rel),
      production_live,
      production_live_reason,
      dependency_hop,
    });
  }

  willIndexAndChunk.sort((a, b) => a.file_path.localeCompare(b.file_path));
  const cappedFiles = limitFiles ? willIndexAndChunk.slice(0, limitFiles) : willIndexAndChunk;

  const chunkTargetTokens = args['chunk-target-tokens'] ? Number(args['chunk-target-tokens']) : DEFAULT_CHUNK_TARGET_TOKENS;
  const chunkMaxTokens = args['chunk-max-tokens'] ? Number(args['chunk-max-tokens']) : DEFAULT_CHUNK_MAX_TOKENS;
  const chunkOverlapTokens = args['chunk-overlap-tokens'] ? Number(args['chunk-overlap-tokens']) : DEFAULT_CHUNK_OVERLAP_TOKENS;

  // Dry-run stats
  let estimatedChunks = 0;
  const fileChunkEstimates = new Map();
  for (const f of cappedFiles) {
    if (!shouldChunkFile(f.file_path)) {
      fileChunkEstimates.set(f.file_path, 0);
      selectedButNotChunked.push({ file_path: f.file_path, reason: 'catalog_only_not_chunked_in_first_run' });
      continue;
    }
    const body = readTextIfExists(root, f.file_path);
    if (!body) {
      selectedButNotChunked.push({ file_path: f.file_path, reason: 'unreadable' });
      continue;
    }
    const blocks =
      f.language === 'markdown'
        ? splitMarkdownByHeadings(body)
        : f.language === 'typescript' || f.language === 'javascript'
          ? splitJsTsBySymbols(body)
          : [{ start_line: 1, end_line: body.split('\n').length, symbol_name: null, symbol_type: 'unknown', content: body }];
    let fileChunks = 0;
    if (f.language === 'markdown') {
      fileChunks = markdownBlocksAsChunks(blocks, chunkMaxTokens).length;
    } else {
      for (const b of blocks) fileChunks += chunkBlocksToTokenWindows(b, chunkTargetTokens, chunkMaxTokens, chunkOverlapTokens).length;
    }
    fileChunkEstimates.set(f.file_path, fileChunks);
    estimatedChunks += fileChunks;
  }

  console.log('[agentsam_codebase_reindex] mode=%s', dryRun ? 'dry-run' : 'write');
  console.log('  workspace_id=%s', workspaceId);
  console.log('  workspace_key=%s', workspaceKey);
  console.log('  scope=%s branch=%s sha=%s base_sha=%s', scope, branch, sha, baseSha);
  console.log('  will_index_files=%s selected_but_not_chunked=%s rejected=%s changed_files_in_range=%s', cappedFiles.length, selectedButNotChunked.length, rejected.length, changed.length);
  console.log('  estimated_chunks=%s', estimatedChunks);

  console.log('\nROUTE_ENTRYPOINTS');
  if (!entrypoints.length) console.log('(none)');
  for (const p of entrypoints) console.log(`- ${p}`);

  console.log('\nDEPENDENCY_GRAPH_EDGES');
  if (!dependencyEdges.length) console.log('(none)');
  for (const e of dependencyEdges.slice(0, 250)) console.log(`- ${e.parent} -> ${e.child}`);
  if (dependencyEdges.length > 250) console.log(`... (${dependencyEdges.length - 250} more)`);

  console.log('\nA. WILL_INDEX_AND_CHUNK');
  for (const f of cappedFiles) {
    const est = fileChunkEstimates.get(f.file_path) ?? 0;
    const importedBy = productionGraph.get(f.file_path)?.via ?? null;
    console.log(
      `- ${f.file_path} | ${f.size_bytes}b | ${f.language} | est_chunks=${est} | live=${f.production_live_reason} | hop=${f.dependency_hop} | imported_by=${importedBy || ''} | changed=${f.changed_in_range} | reason=${f.selection_reason}`,
    );
  }

  console.log('\nB. SELECTED_BUT_NOT_CHUNKED');
  if (!selectedButNotChunked.length) console.log('(none)');
  for (const r of selectedButNotChunked) console.log(`- ${r.file_path} | ${r.reason}`);

  console.log('\nC. REJECTED (summary)');
  const rejCounts = {};
  for (const r of rejected) rejCounts[r.rejection_reason] = (rejCounts[r.rejection_reason] || 0) + 1;
  for (const [k, v] of Object.entries(rejCounts).sort((a, b) => b[1] - a[1])) console.log(`- ${k}: ${v}`);

  if (dryRun) {
    process.exit(0);
  }

  // ── Writes ────────────────────────────────────────────────────────────────
  if (!writeSupabase && !writeVectorize) die('Refusing to write with no --write-supabase or --write-vectorize');

  // Safety gates
  if (workspaceId !== 'fa1f12a8-c841-4b79-a26c-d53a78b17dac') die('Safety gate: unexpected workspace_id');
  if (workspaceKey !== 'ws_inneranimalmedia') die('Safety gate: unexpected workspace_key');
  if (scope !== 'dashboard_agent') die('Safety gate: unexpected scope');
  if (branch !== 'production') die('Safety gate: unexpected branch');
  if (!allowLargeRun) {
    if (cappedFiles.length > maxFiles) die(`Safety gate: selected files > ${maxFiles} (pass --allow-large-run)`);
    if (estimatedChunks > maxChunks) die(`Safety gate: estimated chunks > ${maxChunks} (pass --allow-large-run)`);
  }
  for (const f of cappedFiles) {
    if (f.production_live !== true) die(`Safety gate: non-production_live file selected: ${f.file_path}`);
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (writeSupabase && (!supabaseUrl || !supabaseKey)) die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!openaiKey) die('OPENAI_API_KEY required');

  const cfAccount = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const cfToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const vectorizeIndex = String(process.env.CLOUDFLARE_VECTORIZE_INDEX_NAME || 'agentsam-codebase-oai3large-1536').trim();
  if (writeVectorize && (!cfAccount || !cfToken)) die('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required for vectorize');

  let wroteFiles = 0;
  let wroteChunks = 0;
  let wroteVectors = 0;

  const EMBED_BATCH = 20;
  const VECTORIZE_BATCH = 100;

  for (const f of cappedFiles) {
    const abs = join(root, f.file_path);
    if (!existsSync(abs)) continue;
    const raw = readFileSync(abs, 'utf8');
    const fileHash = await sha256Hex(raw);
    const filePathHash16 = (await sha256Hex(f.file_path)).slice(0, 16);

    // Check prior hash BEFORE any upsert so "unchanged" is meaningful.
    let existingFile = null;
    if (writeSupabase) {
      const checkUrl = `${supabaseUrl}/rest/v1/agentsam_codebase_files_oai3large_1536?select=id,metadata&workspace_id=eq.${encodeURIComponent(
        workspaceId,
      )}&file_path=eq.${encodeURIComponent(f.file_path)}&limit=1`;
      const got = await sbRequest('GET', checkUrl, supabaseKey, null, { 'Accept-Profile': 'agentsam', 'Content-Profile': 'agentsam' });
      existingFile = got?.[0] ?? null;
      const prevHash = existingFile?.metadata?.file_hash ? String(existingFile.metadata.file_hash) : null;
      if (prevHash && prevHash === fileHash) {
        // Still update last_indexed (cheap), but skip re-chunking.
        const patchUrl = `${supabaseUrl}/rest/v1/agentsam_codebase_files_oai3large_1536?id=eq.${encodeURIComponent(
          existingFile.id,
        )}`;
        await sbRequest(
          'PATCH',
          patchUrl,
          supabaseKey,
          { last_indexed: nowIso(), updated_at: nowIso() },
          { Prefer: 'return=minimal', 'Accept-Profile': 'agentsam', 'Content-Profile': 'agentsam' },
        );
        continue;
      }
    }

    const fileRow = {
      workspace_id: workspaceId,
      file_path: f.file_path,
      language: f.language,
      size_bytes: f.size_bytes,
      last_indexed: nowIso(),
      metadata: {
        repo: 'github.com/SamPrimeaux/inneranimalmedia',
        branch,
        git_sha: sha,
        base_sha: baseSha,
        workspace_key: workspaceKey,
        workspace_id: workspaceId,
        scope,
        source: 'agentsam_codebase_reindex',
        file_hash: fileHash,
        language: f.language,
        size_bytes: f.size_bytes,
        selection_reason: f.selection_reason,
        production_live: true,
        production_live_reason: f.production_live_reason,
        dependency_hop: f.dependency_hop,
        changed_in_range: f.changed_in_range,
        chunked: true,
        vectorized: Boolean(writeVectorize),
        indexed_at: nowIso(),
      },
    };

    let fileId = null;
    if (writeSupabase) {
      const q = new URLSearchParams({ on_conflict: 'workspace_id,file_path' });
      const url = `${supabaseUrl}/rest/v1/agentsam_codebase_files_oai3large_1536?${q.toString()}&select=id`;
      const res = await sbRequest('POST', url, supabaseKey, [fileRow], {
        Prefer: 'resolution=merge-duplicates,return=representation',
        'Accept-Profile': 'agentsam',
        'Content-Profile': 'agentsam',
      });
      fileId = res?.[0]?.id || null;
      if (!fileId) throw new Error(`Supabase file upsert missing id for ${f.file_path}`);
      wroteFiles++;
    }

    // Catalog-only: do not chunk/embed/vectorize in the first run.
    if (!shouldChunkFile(f.file_path)) {
      continue;
    }

    // Delete old chunks for this file_path (idempotent rewrite)
    if (writeSupabase) {
      const delUrl = `${supabaseUrl}/rest/v1/agentsam_codebase_chunks_oai3large_1536?workspace_id=eq.${encodeURIComponent(
        workspaceId,
      )}&file_path=eq.${encodeURIComponent(f.file_path)}`;
      await sbRequest('DELETE', delUrl, supabaseKey, null, {
        Prefer: 'return=minimal',
        'Accept-Profile': 'agentsam',
        'Content-Profile': 'agentsam',
      });
    }

    // Build chunks
    const baseBlocks =
      f.language === 'markdown'
        ? splitMarkdownByHeadings(raw)
        : f.language === 'typescript' || f.language === 'javascript'
          ? splitJsTsBySymbols(raw)
          : [{ start_line: 1, end_line: raw.split('\n').length, symbol_name: null, symbol_type: 'unknown', content: raw }];

    const chunks = [];
    for (const b of baseBlocks) {
      const windows =
        f.language === 'markdown'
          ? markdownBlocksAsChunks([b], chunkMaxTokens)
          : chunkBlocksToTokenWindows(b, chunkTargetTokens, chunkMaxTokens, chunkOverlapTokens);
      for (const w of windows) {
        const header = buildChunkHeader({
          file_path: f.file_path,
          branch,
          sha,
          language: f.language,
          start_line: w.start_line,
          end_line: w.end_line,
          scope,
          symbol_name: w.symbol_name,
        });
        const chunkBody = `${header}${w.content}`.trim();
        const chunkHash = await sha256Hex(normalizeChunkHashInput(chunkBody));
        const idx = chunks.length;
        const vectorizeId = shortVectorizeId({
          scope,
          filePathHash16,
          chunkIndex: idx,
        });
        chunks.push({
          file_path: f.file_path,
          file_id: fileId,
          chunk_index: idx,
          content: chunkBody,
          token_count: estimateTokens(chunkBody),
          start_line: w.start_line,
          end_line: w.end_line,
          symbol_name: w.symbol_name,
          symbol_type: w.symbol_type,
          chunk_hash: chunkHash,
          file_hash: fileHash,
          vectorize_id: vectorizeId,
          embedding_model: 'text-embedding-3-large',
          embedding_dimensions: 1536,
          selection_reason: f.selection_reason,
        });
        if (limitChunks && chunks.length >= limitChunks) break;
      }
      if (limitChunks && chunks.length >= limitChunks) break;
    }

    // Embed + write
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const vecs = await openaiEmbedBatch(openaiKey, batch.map((c) => c.content), 1536);
      for (const v of vecs) {
        if (!Array.isArray(v) || v.length !== 1536) throw new Error('Safety gate: embedding dim mismatch');
      }

      const chunkRows = batch.map((c, j) => ({
        workspace_id: workspaceId,
        file_id: c.file_id,
        file_path: c.file_path,
        content: c.content,
        embedding: vecs[j],
        chunk_index: c.chunk_index,
        token_count: c.token_count,
        metadata: {
          repo: 'github.com/SamPrimeaux/inneranimalmedia',
          branch,
          git_sha: sha,
          base_sha: baseSha,
          workspace_key: workspaceKey,
          workspace_id: workspaceId,
          scope,
          source: 'agentsam_codebase_reindex',
          file_path: c.file_path,
          language: f.language,
          start_line: c.start_line,
          end_line: c.end_line,
          symbol_name: c.symbol_name,
          symbol_type: c.symbol_type,
          chunk_hash: c.chunk_hash,
          file_hash: c.file_hash,
          vectorize_id: c.vectorize_id,
          chunk_index: c.chunk_index,
          token_count: c.token_count,
          selection_reason: c.selection_reason,
          production_live: true,
          production_live_reason: f.production_live_reason,
          dependency_hop: f.dependency_hop,
          embedding_model: c.embedding_model,
          embedding_dimensions: c.embedding_dimensions,
          vectorize_binding: 'AGENTSAM_VECTORIZE_CODE',
          vectorize_index: vectorizeIndex,
          indexed_at: nowIso(),
        },
      }));

      if (writeSupabase) {
        // Safety gate: file_id must exist for every chunk
        for (const r of chunkRows) {
          if (!r.file_id) throw new Error(`Safety gate: missing file_id for chunk ${r.file_path}#${r.chunk_index}`);
          if (!r.token_count || r.token_count <= 0) throw new Error('Safety gate: bad token_count');
          if (!r.metadata?.vectorize_id) throw new Error('Safety gate: missing vectorize_id');
          if (r.metadata?.production_live !== true) throw new Error('Safety gate: chunk not production_live');
        }
        const url = `${supabaseUrl}/rest/v1/agentsam_codebase_chunks_oai3large_1536`;
        await sbRequest('POST', url, supabaseKey, chunkRows, {
          Prefer: 'return=minimal',
          'Accept-Profile': 'agentsam',
          'Content-Profile': 'agentsam',
        });
        wroteChunks += chunkRows.length;
      }

      if (writeVectorize) {
        // Mirror Supabase chunks only (one vector per chunk row)
        const vectors = batch.map((c, j) => ({
          id: c.vectorize_id,
          values: vecs[j],
          metadata: {
            workspace_id: workspaceId,
            workspace_key: workspaceKey,
            scope,
            file_path: c.file_path,
            chunk_index: c.chunk_index,
            start_line: c.start_line,
            end_line: c.end_line,
            language: f.language,
            git_sha: sha,
            base_sha: baseSha,
            chunk_hash: c.chunk_hash,
            file_hash: c.file_hash,
            production_live: true,
            production_live_reason: f.production_live_reason,
            source: 'agentsam_codebase_reindex',
          },
        }));
        for (let v = 0; v < vectors.length; v += VECTORIZE_BATCH) {
          const part = vectors.slice(v, v + VECTORIZE_BATCH);
          await vectorizeUpsertNdjson({ accountId: cfAccount, apiToken: cfToken, indexName: vectorizeIndex, vectors: part });
          wroteVectors += part.length;
        }
      }
    }
  }

  console.log('[agentsam_codebase_reindex] wrote files=%s chunks=%s vectors=%s', wroteFiles, wroteChunks, wroteVectors);

  // Post-write verification (Supabase-only; prints quick counts).
  if (writeSupabase) {
    const q = (sql) =>
      sbRequest(
        'POST',
        `${supabaseUrl}/rest/v1/rpc/hyperdrive_query`,
        supabaseKey,
        { query: sql },
        { 'Accept-Profile': 'public' },
      ).catch(() => null);
    console.log('[agentsam_codebase_reindex] verify: run SQL in Supabase console for deep checks.');
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});

