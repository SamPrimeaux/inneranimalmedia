#!/usr/bin/env node
/**
 * Discover PWA root artifacts from dashboard/dist after Vite + bump-cache.
 * Never hardcode workbox-* hashes — Workbox emits a new filename each build.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import pathMod from 'path';

export const PWA_R2_PREFIX = 'static/dashboard';

/** Files served at site root (/{file}) from R2 static/dashboard/{file}. */
export const PWA_FIXED_ROOT_FILES = [
  {
    file: 'sw.js',
    contentType: 'application/javascript; charset=utf-8',
    noCache: true,
  },
  {
    file: 'push-handler.js',
    contentType: 'application/javascript; charset=utf-8',
    noCache: true,
  },
  {
    file: 'sw-agent-cache.js',
    contentType: 'application/javascript; charset=utf-8',
    noCache: true,
  },
  {
    file: 'manifest.webmanifest',
    contentType: 'application/manifest+json; charset=utf-8',
    noCache: false,
  },
  {
    file: 'offline.html',
    contentType: 'text/html; charset=utf-8',
    noCache: false,
  },
];

const WORKBOX_BASENAME_RE = /^workbox-[a-f0-9]+\.js$/i;

/**
 * @param {string} distDir
 * @returns {string[]}
 */
export function discoverWorkboxFiles(distDir) {
  if (!existsSync(distDir)) return [];
  return readdirSync(distDir)
    .filter((name) => WORKBOX_BASENAME_RE.test(name))
    .sort();
}

/**
 * Parse workbox chunk referenced by generated sw.js (empty when runtime is inlined).
 *
 * @param {string} distDir
 * @returns {string | null} basename e.g. workbox-b688af8b.js
 */
export function parseWorkboxImportFromSw(distDir) {
  const swPath = pathMod.join(distDir, 'sw.js');
  if (!existsSync(swPath)) return null;
  const sw = readFileSync(swPath, 'utf8');
  const m =
    sw.match(/define\(\['\.\/(workbox-[a-f0-9]+)'\]/i) ||
    sw.match(/importScripts\(['"](?:\.\/)?(workbox-[a-f0-9]+\.js)['"]\)/i);
  if (!m?.[1]) return null;
  const base = m[1].replace(/^\.\//, '');
  return base.endsWith('.js') ? base : `${base}.js`;
}

/**
 * @param {string} distDir
 * @returns {{ artifacts: Array<{ file: string, r2Key: string, contentType: string, noCache: boolean, publicPath: string }>, workbox_files: string[], workbox_import: string | null, inline_workbox: boolean }}
 */
export function buildPwaPublishPlan(distDir) {
  const absDist = pathMod.resolve(distDir);
  /** @type {ReturnType<typeof buildPwaPublishPlan>['artifacts']} */
  const artifacts = [];

  for (const spec of PWA_FIXED_ROOT_FILES) {
    artifacts.push({
      file: spec.file,
      r2Key: `${PWA_R2_PREFIX}/${spec.file}`,
      contentType: spec.contentType,
      noCache: spec.noCache,
      publicPath: `/${spec.file}`,
    });
  }

  const workbox_files = discoverWorkboxFiles(absDist);
  const workbox_import = parseWorkboxImportFromSw(absDist);

  for (const file of workbox_files) {
    artifacts.push({
      file,
      r2Key: `${PWA_R2_PREFIX}/${file}`,
      contentType: 'application/javascript; charset=utf-8',
      noCache: false,
      publicPath: `/${file}`,
    });
  }

  if (workbox_import && !workbox_files.includes(workbox_import)) {
    throw new Error(
      `[pwa-deploy-artifacts] sw.js imports ${workbox_import} but file missing in ${absDist}`,
    );
  }

  return {
    artifacts,
    workbox_files,
    workbox_import,
    inline_workbox: workbox_files.length === 0,
  };
}

/**
 * @param {string} pathname
 */
export function isWorkboxPublicPath(pathname) {
  return WORKBOX_BASENAME_RE.test(String(pathname || '').replace(/^\//, ''));
}
