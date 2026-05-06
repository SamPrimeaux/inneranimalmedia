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

/** Resolve tenant/workspace/project from CLI flag or env — never hardcode tenant defaults here. */
export function resolveTenantId(cliFlag) {
  return String(cliFlag || process.env.TENANT_ID || '').trim();
}

export function resolveWorkspaceId(cliFlag) {
  return String(cliFlag || process.env.WORKSPACE_ID || '').trim();
}

export function resolveProjectId(cliFlag) {
  return String(cliFlag || process.env.DEPLOY_PROJECT_ID || process.env.DOCUMENTS_PROJECT_ID || '').trim();
}

/** Inventory upserts only — actor metadata for D1 row attribution. */
export function resolveInventoryEditedBy(cliFlag) {
  return String(cliFlag || process.env.D1_AUTH_USER_ID || process.env.DEPLOY_USER_EMAIL || '').trim();
}

function printMissing(label, lines) {
  console.error(`${label} missing required TENANT_ID/WORKSPACE_ID/PROJECT_ID`);
  for (const line of lines) console.error(`  - ${line}`);
}

/** Exit if tenant/workspace/project missing (manifest build + reconcile). */
export function exitUnlessManifestScope(tenantId, workspaceId, projectId, label = '[r2-manifest]') {
  const missing = [];
  if (!tenantId) missing.push('TENANT_ID or --tenant-id');
  if (!workspaceId) missing.push('WORKSPACE_ID or --workspace-id');
  if (!projectId) missing.push('DEPLOY_PROJECT_ID, DOCUMENTS_PROJECT_ID, or --project-id');
  if (!missing.length) return;
  printMissing(label, missing);
  process.exit(1);
}

/** Exit if reconcile scope missing (same three IDs as manifest). */
export function exitUnlessReconcileScope(tenantId, workspaceId, projectId, label = '[r2-reconcile]') {
  const missing = [];
  if (!tenantId) missing.push('TENANT_ID or --tenant-id');
  if (!workspaceId) missing.push('WORKSPACE_ID or --workspace-id');
  if (!projectId) missing.push('DEPLOY_PROJECT_ID, DOCUMENTS_PROJECT_ID, or --project-id');
  if (!missing.length) return;
  printMissing(label, missing);
  process.exit(1);
}

/** Exit if D1 inventory upsert scope missing (includes edited_by). */
export function exitUnlessInventoryUpsertScope(tenantId, workspaceId, projectId, editedBy, label = '[r2-inventory]') {
  const missing = [];
  if (!tenantId) missing.push('TENANT_ID or --tenant-id');
  if (!workspaceId) missing.push('WORKSPACE_ID or --workspace-id');
  if (!projectId) missing.push('DEPLOY_PROJECT_ID, DOCUMENTS_PROJECT_ID, or --project-id');
  if (!editedBy) missing.push('D1_AUTH_USER_ID, DEPLOY_USER_EMAIL, or --edited-by');
  if (!missing.length) return;
  console.error(`${label} missing required TENANT_ID/WORKSPACE_ID/PROJECT_ID`);
  for (const line of missing) console.error(`  - ${line}`);
  process.exit(1);
}
