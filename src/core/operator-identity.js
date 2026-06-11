/**
 * Platform operator identity — person_uuid SSOT with transitional auth_users fallback.
 * Replaces superadmin_identity / admin email lookups in hot paths.
 */

const CACHE_TTL_MS = 60_000;
/** @type {{ at: number, personUuids: Set<string>, defaultTenantId: string|null, defaultWorkspaceId: string|null }} */
let operatorCache = {
  at: 0,
  personUuids: new Set(),
  defaultTenantId: null,
  defaultWorkspaceId: null,
};

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function normalizeUserRow(userRow) {
  if (!userRow || typeof userRow !== 'object') return null;
  return {
    id: trim(userRow.id),
    email: trim(userRow.email).toLowerCase(),
    role: trim(userRow.role),
    tenant_id: trim(userRow.tenant_id),
    person_uuid: trim(userRow.person_uuid),
    is_superadmin: Number(userRow.is_superadmin || 0) === 1,
  };
}

/**
 * @param {object|null|undefined} userRow
 * @param {{ personUuids?: Set<string>, defaultTenantId?: string|null }} [registry]
 */
export function isPlatformOperatorSync(userRow, registry = {}) {
  const row = normalizeUserRow(userRow);
  if (!row) return false;

  const personUuid = row.person_uuid;
  if (personUuid && registry.personUuids?.size && registry.personUuids.has(personUuid)) {
    return true;
  }

  const defaultTenant = trim(registry.defaultTenantId);
  if (row.role === 'superadmin' && defaultTenant && row.tenant_id === defaultTenant) {
    return true;
  }

  return row.role === 'superadmin' && row.tenant_id === 'tenant_sam_primeaux';
}

/**
 * @param {any} env
 * @returns {Promise<{ personUuids: Set<string>, defaultTenantId: string|null, defaultWorkspaceId: string|null }>}
 */
export async function loadPlatformOperatorRegistry(env) {
  const now = Date.now();
  if (now - operatorCache.at < CACHE_TTL_MS && operatorCache.personUuids.size) {
    return operatorCache;
  }

  const empty = {
    personUuids: new Set(),
    defaultTenantId: null,
    defaultWorkspaceId: null,
  };
  if (!env?.DB) return empty;

  try {
    const { results } = await env.DB.prepare(
      `SELECT person_uuid, default_tenant_id, default_workspace_id
         FROM platform_operators
        WHERE COALESCE(is_active, 1) = 1`,
    ).all();

    const personUuids = new Set();
    let defaultTenantId = null;
    let defaultWorkspaceId = null;
    for (const row of results || []) {
      const pu = trim(row.person_uuid);
      if (pu) personUuids.add(pu);
      if (!defaultTenantId && trim(row.default_tenant_id)) {
        defaultTenantId = trim(row.default_tenant_id);
      }
      if (!defaultWorkspaceId && trim(row.default_workspace_id)) {
        defaultWorkspaceId = trim(row.default_workspace_id);
      }
    }

    operatorCache = { at: now, personUuids, defaultTenantId, defaultWorkspaceId };
    return operatorCache;
  } catch (e) {
    console.warn('[platform_operators] registry load failed:', e?.message ?? e);
    return empty;
  }
}

/**
 * Returns true if this auth_users row is a platform operator.
 *
 * @param {any} env
 * @param {object|null|undefined} userRow — auth_users row (role, tenant_id, person_uuid)
 * @returns {Promise<boolean>}
 */
export async function isPlatformOperator(env, userRow) {
  const registry = await loadPlatformOperatorRegistry(env);
  return isPlatformOperatorSync(userRow, registry);
}

/**
 * Resolve auth_users row for operator checks from a session/auth payload.
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 */
export async function resolveOperatorAuthUserRow(env, authUser) {
  const existing = normalizeUserRow(authUser);
  if (existing?.person_uuid && existing.role && existing.tenant_id) return existing;

  const userId = trim(authUser?.id);
  if (!userId || !env?.DB) return existing;

  try {
    const row = await env.DB.prepare(
      `SELECT id, email, role, tenant_id, person_uuid, COALESCE(is_superadmin, 0) AS is_superadmin
         FROM auth_users
        WHERE id = ?
        LIMIT 1`,
    )
      .bind(userId)
      .first();
    return normalizeUserRow(row) || existing;
  } catch {
    return existing;
  }
}

/**
 * Unified platform-owner check (replaces superadmin_identity email allowlist).
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 */
export async function isPlatformOwner(env, authUser) {
  const row = await resolveOperatorAuthUserRow(env, authUser);
  return isPlatformOperator(env, row);
}

/**
 * Operator default workspace from D1 registry (e.g. ws_inneranimalmedia).
 * @param {any} env
 */
export async function platformOperatorDefaultWorkspaceId(env) {
  const registry = await loadPlatformOperatorRegistry(env);
  return registry.defaultWorkspaceId || 'ws_inneranimalmedia';
}
