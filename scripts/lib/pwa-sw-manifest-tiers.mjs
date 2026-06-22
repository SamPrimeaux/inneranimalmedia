#!/usr/bin/env node
/**
 * Build tiered PWA precache manifest from dashboard/dist at deploy time.
 * Tier-1 / tier-2 URLs are derived from dist filenames (never hardcoded chunk names).
 *
 * cache_bust: read from ?v= on dashboard.js|dashboard.css in dist/index.html (bump-cache.js).
 * Used by: scripts/r2-dashboard-manifest-reconcile.mjs, deploy ingest curl.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import pathMod from 'path';
import { fileURLToPath } from 'url';

/** @typedef {{ deploy_id: string, cache_bust: string, git_sha: string, created_at: string, tier0: string[], tier1: string[], tier2: Record<string, string[]>, tier2_tabs: Record<string, string[]> }} SwTieredManifest */

export const SERVICES_MANIFEST_URL = 'https://services.inneranimalmedia.com/sw/manifest.json';
export const JS_RUNTIME_CACHE_NAME = 'iam-dashboard-js-v1';
export const CACHE_BUST_STORAGE_KEY = 'iam_sw_cache_bust';
export const TIER2_TABS_SESSION_KEY = 'iam_sw_tier2_tabs';
export const MANIFEST_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const STATIC_APP_PREFIX = '/static/dashboard/app/';

/** Tier 0 — boot shell (stable paths; not dist-scanned). */
const TIER0_URLS = [
  '/static/dashboard/shell.css',
  `${STATIC_APP_PREFIX}dashboard.css`,
  `${STATIC_APP_PREFIX}dashboard.js`,
  `${STATIC_APP_PREFIX}vendor-react.js`,
  `${STATIC_APP_PREFIX}vendor-icons.js`,
  '/manifest.webmanifest',
  `${STATIC_APP_PREFIX}pwa/icon-192.png`,
  `${STATIC_APP_PREFIX}pwa/icon-512.png`,
  '/offline.html',
];

/** Tier 1 — agent shell warm (dist pattern match; skip silently if missing). */
const TIER1_GLOBS = ['MonacoEditorView*.js', 'vendor-editor*.js'];

/** Tier 2 — route lazy precache (dist pattern match per route). */
const TIER2_ROUTE_GLOBS = {
  '/dashboard/designstudio': ['DesignStudioPage*.js', 'vendor-three*.js', 'AgentSamEngine*.js'],
  '/dashboard/learn': ['LearnPage*.js', 'LearnPage*.css'],
  '/dashboard/workflows': ['WorkflowsPage*.js', 'vendor-charts*.js'],
  '/dashboard/meet': ['MeetPage*.js', 'vendor-realtimekit*.js'],
};

/** Tier 2 tabs — warm on openTab (keys match App.tsx TabId lazy tabs). */
const TIER2_TAB_GLOBS = {
  code: ['MonacoEditorView*.js', 'vendor-editor*.js'],
  excalidraw: ['ExcalidrawView*.js', 'vendor-excalidraw*.js'],
  moviemode: ['MovieModeStudio*.js', 'vendor-remotion*.js'],
  glb: ['DesignStudioPage*.js', 'vendor-three*.js'],
};

/**
 * @param {string} glob e.g. "MonacoEditorView*.js"
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * @param {string} absDir
 * @param {string} [relDir]
 * @returns {string[]} paths relative to absDir (posix slashes)
 */
export function walkDistRelative(absDir, relDir = '') {
  const abs = relDir ? pathMod.join(absDir, relDir) : absDir;
  if (!existsSync(abs)) return [];

  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(abs)) {
    const rel = relDir ? `${relDir}/${name}` : name;
    const fp = pathMod.join(absDir, rel);
    if (statSync(fp).isDirectory()) {
      out.push(...walkDistRelative(absDir, rel));
    } else {
      out.push(rel.split(pathMod.sep).join('/'));
    }
  }
  return out;
}

/**
 * @param {string} distRelative e.g. "assets/LearnPage.css"
 */
export function distRelToPublicUrl(distRelative) {
  return `${STATIC_APP_PREFIX}${distRelative}`;
}

/**
 * Match dist files by basename globs; return public URLs (deduped, stable order).
 * Missing patterns → skipped silently (empty contribution).
 *
 * @param {string} absDist
 * @param {string[]} globs
 * @returns {string[]}
 */
export function matchDistUrls(absDist, globs) {
  if (!globs.length || !existsSync(absDist)) return [];

  const files = walkDistRelative(absDist);
  /** @type {string[]} */
  const urls = [];
  const seen = new Set();

  for (const glob of globs) {
    const re = globToRegExp(glob);
    for (const rel of files) {
      const base = pathMod.basename(rel);
      if (!re.test(base)) continue;
      const url = distRelToPublicUrl(rel);
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

/**
 * Read cache_bust stamp from dist/index.html (?v= on dashboard.js or dashboard.css).
 * Must run after bump-cache.js.
 *
 * @param {string} absIndexPath
 * @returns {string}
 */
export function readCacheBustFromIndexHtml(absIndexPath) {
  if (!existsSync(absIndexPath)) {
    throw new Error(`[pwa-sw-manifest-tiers] missing index.html: ${absIndexPath}`);
  }
  const html = readFileSync(absIndexPath, 'utf8');
  const m =
    html.match(/dashboard\.js\?v=([^"'<> \t]+)/i) ||
    html.match(/dashboard\.css\?v=([^"'<> \t]+)/i);
  if (!m?.[1]) {
    throw new Error(
      '[pwa-sw-manifest-tiers] no ?v= stamp on dashboard.js|dashboard.css — run bump-cache.js first',
    );
  }
  return m[1];
}

/**
 * @param {Record<string, string[]>} globMap
 * @param {string} absDist
 * @returns {Record<string, string[]>}
 */
function buildTierMapFromGlobs(globMap, absDist) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [key, globs] of Object.entries(globMap)) {
    const urls = matchDistUrls(absDist, globs);
    if (urls.length) out[key] = urls;
  }
  return out;
}

/**
 * Build services-facing tiered manifest from a post-bump dist tree.
 *
 * @param {{ absDist: string, gitSha?: string, deployId?: string }} opts
 * @returns {SwTieredManifest}
 */
export function buildSwManifestTiers(opts) {
  const absDist = pathMod.resolve(opts.absDist);
  const absIndex = pathMod.join(absDist, 'index.html');
  const cache_bust = readCacheBustFromIndexHtml(absIndex);
  const git_sha = String(opts.gitSha || '').trim();
  const deploy_id =
    String(opts.deployId || '').trim() ||
    (git_sha ? git_sha.slice(0, 8) : cache_bust.slice(0, 8));

  return {
    deploy_id,
    cache_bust,
    git_sha,
    created_at: new Date().toISOString(),
    tier0: [...TIER0_URLS],
    tier1: matchDistUrls(absDist, TIER1_GLOBS),
    tier2: buildTierMapFromGlobs(TIER2_ROUTE_GLOBS, absDist),
    tier2_tabs: buildTierMapFromGlobs(TIER2_TAB_GLOBS, absDist),
  };
}

/**
 * CLI: node scripts/lib/pwa-sw-manifest-tiers.mjs --dist dashboard/dist [--git-sha ...]
 */
function parseCliArgs(argv) {
  const a = argv.slice(2);
  const get = (name, def = '') => {
    const i = a.indexOf(name);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  return {
    dist: get('--dist', 'dashboard/dist'),
    gitSha: get('--git-sha', ''),
    deployId: get('--deploy-id', ''),
  };
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathMod.resolve(entry) === pathMod.resolve(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  const cli = parseCliArgs(process.argv);
  const absDist = pathMod.isAbsolute(cli.dist) ? cli.dist : pathMod.join(process.cwd(), cli.dist);
  const manifest = buildSwManifestTiers({
    absDist,
    gitSha: cli.gitSha,
    deployId: cli.deployId,
  });
  console.log(JSON.stringify(manifest, null, 2));
}
