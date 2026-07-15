/**
 * Local durable checkpoint for long codebase reindex runs (Mac sleep / crash resume).
 * Stored under .scratch/ (gitignored).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join } from 'path';

/**
 * @param {string} repoRoot
 * @param {string} scriptKey
 * @param {string | null} prefix
 */
export function checkpointPath(repoRoot, scriptKey, prefix = null) {
  const safeKey = String(scriptKey || 'reindex').replace(/[^\w.-]+/g, '_');
  const safePrefix = prefix ? `__${String(prefix).replace(/[^\w.-]+/g, '_')}` : '';
  return join(repoRoot, '.scratch', `code-reindex-checkpoint-${safeKey}${safePrefix}.json`);
}

/**
 * @param {string} absPath
 */
export function loadCheckpoint(absPath) {
  if (!existsSync(absPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(absPath, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.done || typeof raw.done !== 'object') raw.done = {};
    if (!raw.failed || typeof raw.failed !== 'object') raw.failed = {};
    return raw;
  } catch {
    return null;
  }
}

/**
 * @param {object} p
 * @param {string} p.absPath
 * @param {string} p.scriptKey
 * @param {string | null} [p.prefix]
 * @param {string} [p.gitCommitSha]
 * @param {number} [p.fileCount]
 */
export function createEmptyCheckpoint(p) {
  return {
    version: 2,
    scriptKey: p.scriptKey,
    prefix: p.prefix || null,
    /** Pinned for the whole run — never rewrite on resume when HEAD drifts. */
    gitCommitSha: p.gitCommitSha || null,
    fileCount: p.fileCount || 0,
    status: 'running',
    done: {},
    failed: {},
    chunksTotal: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Resume is only valid when checkpoint is pinned to the same commit as this process.
 * @param {object | null} cp
 * @param {string} pinnedSha
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function assertCheckpointCommitPin(cp, pinnedSha) {
  if (!cp) return { ok: true };
  const pinned = String(pinnedSha || '').trim();
  const cpSha = String(cp.gitCommitSha || '').trim();
  if (!cpSha) {
    return { ok: false, reason: 'checkpoint missing gitCommitSha — use --fresh to start a pinned run' };
  }
  if (!pinned || pinned === 'unknown') {
    return { ok: false, reason: 'unable to resolve HEAD for commit pin' };
  }
  if (cpSha !== pinned) {
    return {
      ok: false,
      reason:
        `checkpoint pinned to ${cpSha.slice(0, 12)} but HEAD is ${pinned.slice(0, 12)} — abort (use --fresh or --allow-commit-drift)`,
    };
  }
  return { ok: true };
}

/**
 * Atomic-ish write (temp + rename).
 * @param {string} absPath
 * @param {object} data
 */
export function saveCheckpoint(absPath, data) {
  const dir = dirname(absPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const payload = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  const tmp = `${absPath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  renameSync(tmp, absPath);
}

/**
 * @param {object} cp
 * @param {string} filePath
 * @param {{ hash: string, chunks: number }} info
 */
export function markFileDone(cp, filePath, info) {
  cp.done[filePath] = {
    hash: info.hash,
    chunks: Number(info.chunks) || 0,
    at: new Date().toISOString(),
  };
  delete cp.failed[filePath];
  cp.chunksTotal = Object.values(cp.done).reduce((n, row) => n + (Number(row?.chunks) || 0), 0);
  cp.status = 'running';
}

/**
 * @param {object} cp
 * @param {string} filePath
 * @param {unknown} err
 */
export function markFileFailed(cp, filePath, err) {
  cp.failed[filePath] = {
    error: String(err?.message || err).slice(0, 400),
    at: new Date().toISOString(),
  };
}

/**
 * @param {object | null} cp
 * @param {string} filePath
 * @param {string} hash
 */
export function isCheckpointDone(cp, filePath, hash) {
  if (!cp?.done?.[filePath]) return false;
  return String(cp.done[filePath].hash || '') === String(hash);
}

/**
 * Count done entries that still match current on-disk content hashes when provided.
 * Path-only counts overstate progress after edits.
 * @param {object} cp
 * @param {string[]} eligiblePaths
 * @param {Map<string, string> | null} [pathToHash]
 */
export function summarizeCheckpoint(cp, eligiblePaths, pathToHash = null) {
  const doneCount = eligiblePaths.filter((p) => {
    if (!cp.done?.[p]) return false;
    if (!pathToHash) return true;
    const expect = pathToHash.get(p);
    if (expect == null) return Boolean(cp.done[p]);
    return String(cp.done[p].hash || '') === String(expect);
  }).length;
  return {
    doneCount,
    remaining: eligiblePaths.length - doneCount,
    chunksTotal: Number(cp.chunksTotal) || 0,
    status: cp.status,
  };
}
