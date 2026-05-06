/**
 * Shared helpers for R2 inventory / deploy manifest scripts (D1 + rclone).
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import pathMod from 'path';
import { fileURLToPath } from 'url';

const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
export const scriptsLibDir = __dirname;
export const repoRootDefault = pathMod.join(__dirname, '..', '..');

export function loadEnvCloudflare(repoRoot = repoRootDefault) {
  try {
    const p = pathMod.join(repoRoot, '.env.cloudflare');
    const lines = readFileSync(p, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

/** @param {string} s */
export function escapeSqlString(s) {
  return String(s).replace(/'/g, "''");
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function sha256File(absPath) {
  return sha256Hex(readFileSync(absPath));
}

/** Protected key prefixes — never auto-pruned unless --force-protected */
export const PROTECTED_PREFIXES = [
  'docs/',
  'analytics/',
  'manifests/',
  'snapshots/',
  'captures/',
  'codebase-index/',
  'reports/',
  'backups/',
  '.well-known/',
];

export function isProtectedObjectKey(key) {
  const k = String(key || '');
  for (const p of PROTECTED_PREFIXES) {
    if (k.startsWith(p)) return true;
  }
  return false;
}

/**
 * List objects via rclone (same credentials as deploy-frontend).
 * @returns {Array<{ Path: string, Size?: number, MimeType?: string }>}
 */
export function rcloneLsJson(repoRoot, bucket) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const keyId = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  if (!account || !keyId || !secret) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY');
  }
  const endpoint = `https://${account}.r2.cloudflarestorage.com`;
  const remote = `:s3:${bucket}`;
  const args = [
    'lsjson',
    remote,
    '--recursive',
    '--s3-provider',
    'Cloudflare',
    '--s3-access-key-id',
    keyId,
    '--s3-secret-access-key',
    secret,
    '--s3-endpoint',
    endpoint,
  ];
  const raw = execFileSync('rclone', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const arr = JSON.parse(raw || '[]');
  return Array.isArray(arr) ? arr : [];
}

export function stableInventoryId(bucketName, objectKey) {
  return createHash('sha256').update(`${bucketName}\n${objectKey}`, 'utf8').digest('hex').slice(0, 40);
}
