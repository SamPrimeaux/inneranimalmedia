#!/usr/bin/env node
/**
 * Scans worker.js and writes docs/route-map.md with one ## section per route (for ingest chunking).
 * Run from repo root: node scripts/generate-route-map.js
 */
import fs from 'fs';
import pathMod from 'path';
import { fileURLToPath } from 'url';

const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));

const root = pathMod.join(__dirname, '..');
const workerPath = pathMod.join(root, 'worker.js');
const outPath = pathMod.join(root, 'docs', 'route-map.md');

const src = fs.readFileSync(workerPath, 'utf8');
const lines = src.split('\n');

const asyncFuncs = [];
const reAsync = /^async function (\w+)\s*\(/;
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(reAsync);
  if (m) asyncFuncs.push({ name: m[1], start: i + 1 });
}
for (let i = 0; i < asyncFuncs.length; i++) {
  asyncFuncs[i].end = asyncFuncs[i + 1] ? asyncFuncs[i + 1].start - 1 : lines.length;
}

function enclosingHandler(lineNo) {
  for (const f of asyncFuncs) {
    if (lineNo >= f.start && lineNo <= f.end) return `${f.name} (lines ${f.start}-${f.end})`;
  }
  return 'module scope';
}

function guessMethod(lineText, nextLine) {
  const combo = lineText + '\n' + (nextLine || '');
  if (/method\s*===\s*['"]([A-Z]+)['"]/.test(combo)) {
    const ms = [...combo.matchAll(/method\s*===\s*['"]([A-Z]+)['"]/g)].map((x) => x[1]);
    return [...new Set(ms)].join('|');
  }
  if (/methodUpper\s*===\s*['"]([A-Z]+)['"]/.test(combo)) {
    const ms = [...combo.matchAll(/methodUpper\s*===\s*['"]([A-Z]+)['"]/g)].map((x) => x[1]);
    return [...new Set(ms)].join('|');
  }
  const g = combo.match(/(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)/g);
  if (g) return [...new Set(g)].join('|');
  return 'varies';
}

function guessAuth(path, lineText, handlerName) {
  const t = lineText.toLowerCase();
  if (path.includes('/webhook') || path.includes('/hooks/') && path.includes('stripe')) return 'webhook / provider secret';
  if (path.includes('/oauth/') || path.includes('/auth/callback')) return 'OAuth state / callback';
  if (path.includes('/health')) return 'public';
  if (path.includes('/api/internal/')) return 'internal / optional secret';
  if (t.includes('getauthuser') || t.includes('getsession')) return 'session / auth required';
  if (path.startsWith('/api/')) return 'usually session (see handler)';
  return 'see handler';
}

/** Short human descriptions for high-traffic routes (path without *). */
const PATH_HINTS = {
  '/api/agent/chat':
    'Main Agent Sam chat. JSON body: messages, model_id, mode, stream, tools. Runs AutoRAG (AI Search) when enabled; prepends pgvector `match_documents` context when HYPERDRIVE is bound.',
  '/api/search':
    'POST/GET search. With HYPERDRIVE: embed query (bge-large-en-v1.5) and `match_documents` via pg; else Vectorize `vectorizeRagSearch`. Logs to ai_rag_search_history.',
  '/api/search/federated': 'POST federated search across configured sources; `handleFederatedSearch`.',
  '/auth/callback/google': 'Google OAuth callback (locked handler). Uses KV SESSION_CACHE for state.',
  '/auth/callback/github': 'GitHub OAuth callback (locked handler).',
  '/api/oauth/google/callback': 'Google OAuth redirect URI used by worker.',
  '/api/oauth/github/callback': 'GitHub OAuth redirect URI used by worker.',
};

function guessBindings(path) {
  const b = new Set(['DB']);
  if (path.includes('/agent') || path.includes('/rag') || path.includes('/search')) {
    b.add('AI');
    b.add('HYPERDRIVE');
  }
  if (path.includes('/r2') || path.includes('draw')) b.add('DASHBOARD');
  if (path.includes('/mcp')) b.add('KV');
  if (path.includes('/browser') || path.includes('playwright')) b.add('MYBROWSER');
  if (path.includes('/vault')) b.add('SESSION_CACHE');
  return [...b].sort().join(', ');
}

const seen = new Set();
const routes = [];

function addRoute(lineNo, method, routePath, kind) {
  const key = `${method}::${routePath}`;
  if (seen.has(key)) return;
  seen.add(key);
  const lineText = lines[lineNo - 1] || '';
  const handler = enclosingHandler(lineNo);
  const basePath = routePath.replace(/\*$/, '');
  const hint = PATH_HINTS[basePath];
  const desc = hint
    ? hint
    : kind === 'prefix'
      ? `Path prefix. Sub-routes resolved inside ${handler.split(' ')[0]}.`
      : 'Matched in worker.js branch.';
  routes.push({
    lineNo,
    method,
    path: routePath,
    handler,
    lineText: lineText.trim().slice(0, 200),
    kind,
    auth: guessAuth(routePath, lineText, handler),
    bindings: guessBindings(routePath),
    desc,
  });
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const ln = i + 1;
  const next = lines[i + 1] || '';

  const starts = [...line.matchAll(/pathLower\.startsWith\(\s*['"]([^'"]+)['"]\s*\)/g)];
  for (const m of starts) {
    addRoute(ln, 'prefix', m[1] + '*', 'prefix');
  }

  const pathsEq = [...line.matchAll(/pathLower\s*===\s*['"]([^'"]+)['"]/g)];
  for (const m of pathsEq) {
    const method = guessMethod(line, next);
    addRoute(ln, method, m[1], 'exact');
  }

  const urlP = [...line.matchAll(/url\.pathname\s*===\s*['"]([^'"]+)['"]/g)];
  for (const m of urlP) {
    const method = guessMethod(line, next);
    addRoute(ln, method, m[1], 'exact');
  }

  if (/^\s*if\s*\(\s*path\s*===/.test(line)) {
    const pathOnly = [...line.matchAll(/\bpath\s*===\s*['"]([^'"]+)['"]/g)];
    for (const m of pathOnly) {
      if (!/^\/(api\/health|health|index\.html)?$/.test(m[1]) && m[1] !== '/') continue;
      const method = guessMethod(line, next);
      addRoute(ln, method, m[1], 'exact');
    }
  }
}

let md = `# IAM worker route map

Auto-generated from \`worker.js\` (Cloudflare Workers \`fetch\`, not Express). Each \`##\` section below is one ingest chunk (method + path as title).

Total route patterns: **${routes.length}**.

`;

const flat = [...routes].sort((a, b) => {
  const pa = a.path.replace(/\*$/, '');
  const pb = b.path.replace(/\*$/, '');
  return pa.localeCompare(pb) || a.method.localeCompare(b.method);
});

for (const r of flat) {
  const title = `${r.method} ${r.path}`.replace(/\|/g, '/');
  md += `## ${title}\n\n`;
  md += `- **Handler:** ${r.handler}\n`;
  md += `- **Line:** ~${r.lineNo}\n`;
  md += `- **Auth:** ${r.auth}\n`;
  md += `- **Description:** ${r.desc}\n`;
  md += `- **Bindings (typical):** ${r.bindings}\n`;
  md += `- **Code:** \`${r.lineText.replace(/`/g, "'")}\`\n\n`;
}

fs.mkdirSync(pathMod.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md, 'utf8');
console.log('Wrote', outPath, 'routes:', routes.length);
