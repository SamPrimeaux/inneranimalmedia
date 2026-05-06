import { platformTenantIdFromEnv } from '../core/auth.js';

/** Prefer Workers `TENANT_ID` binding for cron-scoped D1 writes (memory rollups, finance alerts). */
export function cronTenantId(env) {
  return platformTenantIdFromEnv(env) || null;
}
