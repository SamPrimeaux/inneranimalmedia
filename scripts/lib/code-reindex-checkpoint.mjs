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
    version: 1,
    scriptKey: p.scriptKey,
    prefix: p.prefix || null,
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
 * @param {object} cp
 * @param {string[]} eligiblePaths
 */
export function summarizeCheckpoint(cp, eligiblePaths) {
  const doneCount = eligiblePaths.filter((p) => cp.done?.[p]).length;
  return {
    doneCount,
    remaining: eligiblePaths.length - doneCount,
    chunksTotal: Number(cp.chunksTotal) || 0,
    status: cp.status,
  };
}
