/**
 * Database operation policy — read-only vs owner-approval vs blocked (Agent Sam data plane).
 */
import { classifyDatabaseSqlStatement, isReadOnlyDatabaseSql } from './database-sql-safety.js';
import { authUserIsSuperadmin } from './auth.js';

/** @typedef {'read_only'|'owner_approval_required'|'blocked'} DbOperationClass */

/** @typedef {{
 *   user_id: string|null,
 *   tenant_id: string|null,
 *   workspace_id: string|null,
 *   roles: string[],
 *   is_owner: boolean,
 *   is_superadmin: boolean,
 *   can_run_d1: boolean,
 *   can_run_hyperdrive: boolean,
 *   can_apply_ddl: boolean,
 *   allowed_schemas: string[],
 *   approval_required: boolean,
 * }} DatabaseRuntimeContext */

const OWNER_PLATFORM_SCHEMAS = ['agentsam'];
const NON_OWNER_ALLOWED_SCHEMAS = ['agentsam'];

const BLOCKED_PATTERNS = [
  /\bauth\.users\b/i,
  /\bpg_authid\b/i,
  /\buser_secrets\b/i,
  /\bvault\./i,
  /\bSET\s+ROLE\s+superuser\b/i,
  /\bBYPASSRLS\b/i,
  /\bSECURITY\s+DEFINER\b/i,
];

const GLOBAL_DDL_RE =
  /\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|SCHEMA|POLICY|FUNCTION|TRIGGER|VIEW)\b/i;

/**
 * @param {unknown} authUser
 * @param {{
 *   tenantId?: string|null,
 *   workspaceId?: string|null,
 *   role?: string|null,
 *   canRunD1?: boolean,
 *   canRunHyperdrive?: boolean,
 * }} [opts]
 * @returns {DatabaseRuntimeContext}
 */
export function resolveDatabaseRuntimeContext(authUser, opts = {}) {
  const userId = authUser?.id != null ? String(authUser.id) : null;
  const tenantId =
    opts.tenantId != null && String(opts.tenantId).trim()
      ? String(opts.tenantId).trim()
      : authUser?.tenant_id != null
        ? String(authUser.tenant_id)
        : null;
  const workspaceId =
    opts.workspaceId != null && String(opts.workspaceId).trim() ? String(opts.workspaceId).trim() : null;
  const role = String(opts.role ?? authUser?.role ?? '').trim().toLowerCase();
  const isSuperadmin = authUserIsSuperadmin(authUser);
  const isOwner = isSuperadmin || role === 'owner';
  const canRunD1 = opts.canRunD1 !== false;
  const canRunHyperdrive = opts.canRunHyperdrive !== false;

  return {
    user_id: userId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    roles: role ? [role] : [],
    is_owner: isOwner,
    is_superadmin: isSuperadmin,
    can_run_d1: canRunD1,
    can_run_hyperdrive: canRunHyperdrive,
    can_apply_ddl: isOwner,
    allowed_schemas: isOwner ? [...OWNER_PLATFORM_SCHEMAS, 'public'] : [...NON_OWNER_ALLOWED_SCHEMAS],
    approval_required: !isOwner,
  };
}

/**
 * @param {string} sql
 * @returns {DbOperationClass}
 */
export function classifyDatabaseOperation(sql) {
  const trimmed = String(sql || '').trim();
  if (!trimmed) return 'blocked';

  for (const re of BLOCKED_PATTERNS) {
    if (re.test(trimmed)) return 'blocked';
  }

  const stmtKind = classifyDatabaseSqlStatement(trimmed);
  if (stmtKind === 'read' || stmtKind === 'explain') return 'read_only';
  if (stmtKind === 'unknown') return 'blocked';

  if (stmtKind === 'destructive' || stmtKind === 'schema' || stmtKind === 'mutation') {
    return 'owner_approval_required';
  }

  return 'owner_approval_required';
}

/**
 * @param {string} sql
 * @param {DatabaseRuntimeContext} ctx
 * @param {{ surface?: string, explicitApprovalId?: string|null }} [opts]
 */
export function evaluateDatabaseOperation(sql, ctx, opts = {}) {
  const operationClass = classifyDatabaseOperation(sql);
  const readOnly = operationClass === 'read_only' || isReadOnlyDatabaseSql(sql);
  const explicitApproval = opts.explicitApprovalId != null && String(opts.explicitApprovalId).trim();

  if (operationClass === 'blocked') {
    return {
      allowed: false,
      operation_class: operationClass,
      read_only: false,
      requires_approval: false,
      reason: 'blocked_sql_pattern',
    };
  }

  if (readOnly) {
    if (!ctx.can_run_d1 && !ctx.can_run_hyperdrive) {
      return {
        allowed: false,
        operation_class: 'read_only',
        read_only: true,
        requires_approval: false,
        reason: 'database_lane_unavailable',
      };
    }
    return {
      allowed: true,
      operation_class: 'read_only',
      read_only: true,
      requires_approval: false,
      reason: 'read_only_ok',
    };
  }

  if (!ctx.is_owner && !ctx.is_superadmin) {
    return {
      allowed: false,
      operation_class: operationClass,
      read_only: false,
      requires_approval: true,
      reason: 'non_owner_mutation_blocked',
    };
  }

  if (!ctx.can_apply_ddl && GLOBAL_DDL_RE.test(sql)) {
    return {
      allowed: false,
      operation_class: operationClass,
      read_only: false,
      requires_approval: true,
      reason: 'ddl_not_permitted',
    };
  }

  if (operationClass === 'owner_approval_required' && !explicitApproval) {
    return {
      allowed: false,
      operation_class: operationClass,
      read_only: false,
      requires_approval: true,
      reason: 'owner_approval_required',
    };
  }

  return {
    allowed: true,
    operation_class: operationClass,
    read_only: false,
    requires_approval: operationClass === 'owner_approval_required',
    reason: explicitApproval ? 'approved_mutation' : 'owner_direct',
  };
}

/**
 * @param {string} schemaName
 * @param {DatabaseRuntimeContext} ctx
 */
export function isSchemaAllowedForContext(schemaName, ctx) {
  const schema = String(schemaName || 'agentsam').trim().toLowerCase() || 'agentsam';
  if (ctx.is_owner || ctx.is_superadmin) {
    return ctx.allowed_schemas.includes(schema) || schema === 'information_schema' || schema === 'pg_catalog';
  }
  return NON_OWNER_ALLOWED_SCHEMAS.includes(schema);
}
