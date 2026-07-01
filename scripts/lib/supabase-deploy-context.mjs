/**
 * Resolve explicit deploy identity for Supabase writes (never rely on DB column defaults).
 * Required for strict mode (default): TENANT_ID, WORKSPACE_ID, DOCUMENTS_PROJECT_ID or DEPLOY_PROJECT_ID.
 *
 * Full mapping of optional deploy env vars → Supabase/D1 tables: docs/DEPLOY_ENV_SUPABASE_MAPPING.md
 * (RUN_GROUP_ID, TRIGGER_SOURCE, DEPLOY_SCRIPT_NAME, DEPLOY_SMOKE_BASE_URL, DEPLOY_USER_EMAIL,
 * D1_AUTH_USER_ID, DEPLOYED_BY, etc.)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadDotEnvCloudflare(repoRoot) {
  try {
    const p = resolve(repoRoot, '.env.cloudflare');
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

/**
 * @param {{ strict?: boolean, repoRoot?: string }} o
 */
export function resolveDeployScope(o = {}) {
  const strict = o.strict !== false;
  const repoRoot = o.repoRoot || resolve(__dirname, '..', '..');
  loadDotEnvCloudflare(repoRoot);

  const tenantId = String(process.env.TENANT_ID ?? process.env.DEPLOY_TENANT_ID ?? '').trim();
  const workspaceId = String(process.env.WORKSPACE_ID ?? process.env.DEPLOY_WORKSPACE_ID ?? '').trim();
  const projectId = String(
    process.env.DOCUMENTS_PROJECT_ID ?? process.env.DEPLOY_PROJECT_ID ?? process.env.PROJECT_ID ?? '',
  ).trim();
  const d1AuthUserId = String(
    process.env.D1_AUTH_USER_ID ??
      process.env.IAM_D1_AUTH_USER_ID ??
      process.env.OPERATOR_USER_ID ??
      '',
  ).trim();
  const supabaseUserId = String(process.env.IAM_SUPABASE_USER_ID ?? '').trim();
  const supabaseWorkspaceUuid = String(
    process.env.IAM_SUPABASE_WORKSPACE_ID ?? process.env.SUPABASE_WORKSPACE_UUID ?? '',
  ).trim();
  const userEmail = String(
    process.env.OPERATOR_USER_EMAIL ??
      process.env.DEPLOY_USER_EMAIL ??
      process.env.IAM_USER_EMAIL ??
      '',
  ).trim();
  const deployedBy = String(process.env.DEPLOYED_BY ?? process.env.DEPLOY_DEPLOYED_BY ?? '').trim();
  const triggeredBy = String(process.env.TRIGGERED_BY ?? process.env.DEPLOY_TRIGGERED_BY ?? deployedBy).trim();

  if (strict && (!tenantId || !workspaceId || !projectId)) {
    throw new Error(
      'Missing explicit deploy scope. Set TENANT_ID, WORKSPACE_ID, and DOCUMENTS_PROJECT_ID (or DEPLOY_PROJECT_ID). Do not rely on Supabase table defaults.',
    );
  }

  return {
    repoRoot,
    tenantId: tenantId || null,
    workspaceId: workspaceId || null,
    projectId: projectId || null,
    d1AuthUserId: d1AuthUserId || null,
    supabaseUserId: supabaseUserId || null,
    supabaseWorkspaceUuid: supabaseWorkspaceUuid || null,
    userEmail: userEmail || null,
    deployedBy: deployedBy || null,
    triggeredBy: triggeredBy || null,
    supabaseUrl: String(process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, ''),
    serviceKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  };
}

export function requireSupabaseRest(ctx) {
  if (!ctx.supabaseUrl || !ctx.serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for deploy recording.');
  }
  return ctx;
}
