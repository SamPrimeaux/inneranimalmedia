/**
 * Live Worker / services / containers runtime — CODE lane include roots.
 * git ls-files + policy (not a hand-maintained file list).
 *
 * Intentionally excludes dashboard/ (separate SPA index) and vendored trees.
 * SSOT counts drift as the tree grows; re-run dry-run to see eligible totals.
 */
import { existsSync } from 'fs';
import { join, extname } from 'path';
import {
  discoverGitTrackedFiles,
  assertNoDuplicatePaths,
  assertAllPathsExist,
} from './dashboard-index-manifest.mjs';

/** Prefixes that must be indexed for Agent Sam backend understanding. */
export const RUNTIME_INCLUDE_ROOTS = Object.freeze([
  'src/core/',
  'src/api/',
  'src/tools/',
  'src/cron/',
  'src/integrations/',
  'src/do/',
  'src/queue/',
  'services/moviemode-service/',
  'services/iam-workflows/',
  'containers/iam-cad-worker/',
  'containers/iam-sandbox/',
  'containers/moviemode-render/',
]);

/** Always include even if under a thin root. */
export const RUNTIME_EXPLICIT_FILES = Object.freeze([
  'src/index.js',
  'scripts/agentsam_codebase_reindex.mjs',
]);

/** Fail dry-run / live if these are missing from the final manifest. */
export const RUNTIME_REQUIRED_FILES = Object.freeze([
  'src/index.js',
  'src/core/production-dispatch.js',
  'src/core/catalog-tool-executor.js',
  'scripts/agentsam_codebase_reindex.mjs',
]);

export const RUNTIME_EXCLUDE_PATTERNS = Object.freeze([
  /node_modules\//,
  /\/dist\//,
  /^dist\//,
  /\/build\//,
  /^build\//,
  /\/coverage\//,
  /playwright-report\//,
  /python_modules\//,
  /\.map$/,
  /\.log$/,
  /\.pyi$/,
  /\.test\.(ts|tsx|js|mjs|py)$/,
  /\.spec\.(ts|tsx|js|mjs|py)$/,
  /(__tests__|__mocks__)\//,
  /\.snap$/,
  /\.d\.ts$/,
]);

const INDEXABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.py']);

/**
 * @param {string} filePath
 */
export function isRuntimeDeniedPath(filePath) {
  return RUNTIME_EXCLUDE_PATTERNS.some((re) => re.test(filePath));
}

/**
 * @param {string} filePath
 */
export function hasRuntimeIndexableExtension(filePath) {
  const ext = extname(filePath).toLowerCase();
  return INDEXABLE_EXTENSIONS.has(ext);
}

/**
 * @param {string} filePath
 */
export function isUnderRuntimeIncludeRoot(filePath) {
  if (RUNTIME_EXPLICIT_FILES.includes(filePath)) return true;
  return RUNTIME_INCLUDE_ROOTS.some((root) => filePath.startsWith(root));
}

/**
 * @param {string} filePath
 */
export function isRuntimeIndexableFile(filePath) {
  if (isRuntimeDeniedPath(filePath)) return false;
  if (!hasRuntimeIndexableExtension(filePath)) return false;
  return isUnderRuntimeIncludeRoot(filePath);
}

/**
 * Optional progressive slice: keep only paths under one prefix (or explicit files that match).
 * Examples: `src/core`, `src/api`, `services/moviemode-service`, `containers/iam-cad-worker`
 * @param {string[]} paths
 * @param {string | null} prefix
 */
export function filterRuntimePathsByPrefix(paths, prefix) {
  if (!prefix) return paths;
  const p = String(prefix).replace(/^\.\//, '').replace(/\/$/, '');
  return paths.filter((filePath) => {
    if (filePath === p || filePath.startsWith(`${p}/`)) return true;
    // Keep required anchors when slicing their parent root
    if (RUNTIME_REQUIRED_FILES.includes(filePath) && filePath.startsWith(`${p.split('/')[0]}/`)) {
      return filePath.startsWith(`${p}/`) || filePath === p;
    }
    return false;
  });
}

/**
 * @param {string[]} paths
 */
export function summarizeRuntimeRoots(paths) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const filePath of paths) {
    let key = filePath;
    if (filePath.startsWith('src/')) {
      const parts = filePath.split('/');
      key = parts.length >= 2 ? `src/${parts[1]}/` : 'src/';
      if (parts.length === 2) key = filePath; // src/index.js
    } else if (filePath.startsWith('services/')) {
      key = filePath.split('/').slice(0, 2).join('/') + '/';
    } else if (filePath.startsWith('containers/')) {
      key = filePath.split('/').slice(0, 2).join('/') + '/';
    } else if (filePath.startsWith('scripts/')) {
      key = 'scripts/';
    }
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * @param {string} repoRoot
 * @param {{ prefix?: string | null }} [opts]
 */
export function buildRuntimeEligibleManifest(repoRoot, opts = {}) {
  const gitFiles = discoverGitTrackedFiles(repoRoot);
  const gitSet = new Set(gitFiles);

  const missingRequiredInGit = RUNTIME_REQUIRED_FILES.filter((p) => !gitSet.has(p));
  if (missingRequiredInGit.length) {
    throw new Error(
      `${missingRequiredInGit.length} runtime required file(s) not tracked in git: ${missingRequiredInGit.join(', ')}`,
    );
  }

  let deniedSkipped = 0;
  const eligible = new Set();

  for (const p of gitFiles) {
    if (!isUnderRuntimeIncludeRoot(p)) continue;
    if (isRuntimeDeniedPath(p)) {
      deniedSkipped++;
      continue;
    }
    if (!hasRuntimeIndexableExtension(p)) continue;
    eligible.add(p);
  }

  for (const p of RUNTIME_EXPLICIT_FILES) {
    if (gitSet.has(p) && hasRuntimeIndexableExtension(p) && !isRuntimeDeniedPath(p)) {
      eligible.add(p);
    }
  }

  let paths = [...eligible].sort((a, b) => a.localeCompare(b));
  const prefix = opts.prefix ? String(opts.prefix).trim() : null;
  if (prefix) {
    paths = filterRuntimePathsByPrefix(paths, prefix);
  }

  assertNoDuplicatePaths(paths);
  assertAllPathsExist(repoRoot, paths);

  if (!prefix) {
    const set = new Set(paths);
    const missingReq = RUNTIME_REQUIRED_FILES.filter((p) => !set.has(p));
    if (missingReq.length) {
      throw new Error(`Runtime required paths missing from manifest: ${missingReq.join(', ')}`);
    }
  }

  const diskMissing = paths.filter((p) => !existsSync(join(repoRoot, p)));
  if (diskMissing.length) {
    throw new Error(`Runtime path(s) missing on disk: ${diskMissing.slice(0, 5).join(', ')}`);
  }

  return {
    paths,
    deniedSkipped,
    rootCounts: summarizeRuntimeRoots(paths),
    prefix: prefix || null,
  };
}
