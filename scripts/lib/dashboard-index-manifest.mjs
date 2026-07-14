/**
 * Git-discovered dashboard codebase index manifest.
 * Canonical source: git ls-files + policy — not a hand-maintained path array.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

/** Prefixes and explicit paths eligible for CODE lane indexing. */
export const DASHBOARD_INCLUDE_ROOTS = Object.freeze([
  'dashboard/',
  'scripts/lib/pwa-sw-manifest-tiers.mjs',
]);

/** Must-not-miss files — fail if absent from git or final manifest. */
export const DASHBOARD_EXPLICIT_REQUIRED_FILES = Object.freeze([
  'dashboard/App.tsx',
  'dashboard/components/ChatAssistant/ChatAssistant.tsx',
  'dashboard/public/sw-agent-cache.js',
  'dashboard/src/pwa/registerServiceWorker.ts',
  'dashboard/src/pwa/warmAgentChunks.ts',
  'scripts/lib/pwa-sw-manifest-tiers.mjs',
]);

export const DASHBOARD_EXCLUDE_PATTERNS = Object.freeze([
  /node_modules\//,
  /\/dist\//,
  /^dist\//,
  /\/build\//,
  /^build\//,
  /\/coverage\//,
  /^coverage\//,
  /playwright-report\//,
  /\.map$/,
  /\.log$/,
  /\.test\.(ts|tsx|js|mjs)$/,
  /\.spec\.(ts|tsx|js|mjs)$/,
  /(__tests__|__mocks__)\//,
  /\.snap$/,
]);

const INDEXABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css']);

/**
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function discoverGitTrackedFiles(repoRoot) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split('\0')
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * @param {string} filePath
 */
export function isDeniedPath(filePath) {
  return DASHBOARD_EXCLUDE_PATTERNS.some((re) => re.test(filePath));
}

/**
 * @param {string} filePath
 */
export function hasIndexableExtension(filePath) {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return false;
  return INDEXABLE_EXTENSIONS.has(filePath.slice(dot));
}

/**
 * @param {string} filePath
 */
export function isUnderIncludeRoot(filePath) {
  if (DASHBOARD_EXPLICIT_REQUIRED_FILES.includes(filePath)) return true;
  return DASHBOARD_INCLUDE_ROOTS.some((root) => {
    if (root.endsWith('/')) return filePath.startsWith(root);
    return filePath === root;
  });
}

/**
 * @param {string} filePath
 */
export function isDashboardIndexableFile(filePath) {
  if (isDeniedPath(filePath)) return false;
  if (!hasIndexableExtension(filePath)) return false;
  return isUnderIncludeRoot(filePath);
}

/**
 * @param {string[]} paths
 */
export function assertNoDuplicatePaths(paths) {
  const seen = new Set();
  const dupes = [];
  for (const p of paths) {
    if (seen.has(p)) dupes.push(p);
    seen.add(p);
  }
  if (dupes.length) {
    throw new Error(`Duplicate paths in manifest: ${[...new Set(dupes)].join(', ')}`);
  }
}

/**
 * @param {string} repoRoot
 * @param {string[]} paths
 */
export function assertAllPathsExist(repoRoot, paths) {
  const missing = paths.filter((p) => !existsSync(join(repoRoot, p)));
  if (missing.length) {
    throw new Error(`${missing.length} manifest path(s) missing on disk: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
  }
}

/**
 * @param {string[]} paths
 */
export function assertNoDeniedPaths(paths) {
  const denied = paths.filter((p) => isDeniedPath(p));
  if (denied.length) {
    throw new Error(`${denied.length} denied path(s) in manifest: ${denied.slice(0, 8).join(', ')}`);
  }
}

/**
 * @param {string[]} paths
 */
export function assertRequiredPathsIncluded(paths) {
  const set = new Set(paths);
  const missing = DASHBOARD_EXPLICIT_REQUIRED_FILES.filter((p) => !set.has(p));
  if (missing.length) {
    throw new Error(`Required paths not in manifest: ${missing.join(', ')}`);
  }
}

/**
 * @param {string} repoRoot
 * @param {string[]} paths
 */
export function assertManifestIntegrity(repoRoot, paths) {
  assertNoDuplicatePaths(paths);
  assertAllPathsExist(repoRoot, paths);
  assertNoDeniedPaths(paths);
  assertRequiredPathsIncluded(paths);
}

/**
 * Build sorted eligible manifest from git + policy.
 * @param {string} repoRoot
 */
export function buildEligibleManifest(repoRoot) {
  const gitFiles = discoverGitTrackedFiles(repoRoot);
  const gitSet = new Set(gitFiles);

  const missingRequiredInGit = DASHBOARD_EXPLICIT_REQUIRED_FILES.filter((p) => !gitSet.has(p));
  if (missingRequiredInGit.length) {
    throw new Error(
      `${missingRequiredInGit.length} required file(s) not tracked in git: ${missingRequiredInGit.join(', ')}`,
    );
  }

  let deniedSkipped = 0;
  const eligible = new Set();

  for (const p of gitFiles) {
    if (!isUnderIncludeRoot(p)) continue;
    if (isDeniedPath(p)) {
      deniedSkipped++;
      continue;
    }
    if (!hasIndexableExtension(p)) continue;
    eligible.add(p);
  }

  for (const p of DASHBOARD_EXPLICIT_REQUIRED_FILES) {
    eligible.add(p);
  }

  const paths = [...eligible].sort((a, b) => a.localeCompare(b));
  assertManifestIntegrity(repoRoot, paths);

  return { paths, deniedSkipped, gitTrackedUnderRoots: gitFiles.filter(isUnderIncludeRoot).length };
}

/**
 * @param {import('pg').Client} client
 * @param {string} workspaceUuid
 * @returns {Promise<Set<string>>}
 */
export async function loadPreviouslyIndexedPaths(client, workspaceUuid) {
  const res = await client.query(
    `SELECT file_path FROM agentsam.agentsam_codebase_files_oai3large_1536
     WHERE workspace_id = $1::uuid`,
    [workspaceUuid],
  );
  return new Set(res.rows.map((r) => r.file_path));
}

/**
 * @param {{ eligiblePaths: string[], indexedPaths: Set<string>, requiredFiles?: readonly string[] }} p
 */
export function summarizeManifestDrift(p) {
  const eligibleSet = new Set(p.eligiblePaths);
  const indexed = p.indexedPaths;
  const required = p.requiredFiles ?? DASHBOARD_EXPLICIT_REQUIRED_FILES;

  const newEligible = p.eligiblePaths.filter((path) => !indexed.has(path));
  const staleIndexed = [...indexed].filter((path) => !eligibleSet.has(path)).sort();

  return {
    eligibleCount: p.eligiblePaths.length,
    indexedCount: indexed.size,
    newEligible,
    staleIndexed,
    requiredIncluded: required.every((f) => eligibleSet.has(f)),
  };
}

/**
 * @param {ReturnType<typeof summarizeManifestDrift>} drift
 * @param {number} deniedSkipped
 */
export function printManifestDriftSummary(drift, deniedSkipped) {
  console.log('manifest drift summary');
  console.log(`  eligible files from git:     ${drift.eligibleCount}`);
  console.log(`  currently indexed (mirror):  ${drift.indexedCount}`);
  console.log(`  required files included:     ${drift.requiredIncluded ? 'yes' : 'NO'}`);
  console.log(`  denied/skipped by policy:    ${deniedSkipped}`);
  console.log(`  newly eligible (not indexed): ${drift.newEligible.length}`);
  if (drift.newEligible.length) {
    for (const p of drift.newEligible.slice(0, 15)) console.log(`    + ${p}`);
    if (drift.newEligible.length > 15) console.log(`    … and ${drift.newEligible.length - 15} more`);
  }
  console.log(`  stale indexed (would prune): ${drift.staleIndexed.length}`);
  for (const p of drift.staleIndexed.slice(0, 15)) console.log(`    - ${p}`);
  if (drift.staleIndexed.length > 15) console.log(`    … and ${drift.staleIndexed.length - 15} more`);
  console.log('');
}
