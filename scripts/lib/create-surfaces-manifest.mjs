/**
 * Focused CODE lane manifest — Create surfaces + shell/PWA/terminal (not full dashboard reindex).
 */
import { existsSync } from 'fs';
import { join } from 'path';
import {
  discoverGitTrackedFiles,
  hasIndexableExtension,
  isDeniedPath,
} from './dashboard-index-manifest.mjs';

/** Prefixes / explicit paths for tonight's Create remaster ingest. */
export const CREATE_SURFACE_PREFIXES = Object.freeze([
  'dashboard/App.tsx',
  'dashboard/components/DesignStudioPage.tsx',
  'dashboard/components/UIOverlay.tsx',
  'dashboard/components/ExcalidrawView.tsx',
  'dashboard/components/XTermShell.tsx',
  'dashboard/components/ChatAssistant/',
  'dashboard/components/SecurityShieldBanner.tsx',
  'dashboard/components/StoragePage.tsx',
  'dashboard/components/shell/',
  'dashboard/pages/cms/',
  'dashboard/pages/draw/',
  'dashboard/pages/moviemode/',
  'dashboard/features/moviemode/',
  'src/dashboard/cms/',
  'src/api/cms.js',
  'dashboard/public/sw-agent-cache.js',
  'dashboard/src/pwa/',
  'scripts/lib/pwa-sw-manifest-tiers.mjs',
  'dashboard/config/shellNav.ts',
]);

/**
 * @param {string} filePath
 */
function matchesCreateSurface(filePath) {
  return CREATE_SURFACE_PREFIXES.some((entry) => {
    if (entry.endsWith('/')) return filePath.startsWith(entry);
    return filePath === entry;
  });
}

/**
 * @param {string} repoRoot
 */
export function buildCreateSurfacesManifest(repoRoot) {
  const gitFiles = discoverGitTrackedFiles(repoRoot);
  let deniedSkipped = 0;
  const eligible = [];

  for (const p of gitFiles) {
    if (!matchesCreateSurface(p)) continue;
    if (isDeniedPath(p)) {
      deniedSkipped++;
      continue;
    }
    if (!hasIndexableExtension(p)) continue;
    if (!existsSync(join(repoRoot, p))) continue;
    eligible.push(p);
  }

  eligible.sort();
  return { paths: eligible, deniedSkipped };
}
