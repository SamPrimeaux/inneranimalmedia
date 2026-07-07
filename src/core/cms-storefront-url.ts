/**
 * Canonical public storefront hostnames for CMS tenants.
 * TypeScript source — Worker and dashboard import this module.
 * Domain SSOT: cms_tenants.domain (pass tenantDomain) — no hardcoded slug→host maps.
 */

/** Optional slug aliases resolved via cms_tenants lookup upstream (e.g. nicoc → newiberiachurchofchrist). */
export const CMS_TENANT_SLUG_ALIASES: Record<string, string> = {
  nicoc: 'newiberiachurchofchrist',
};

export function resolveCmsPublicDomain(
  projectSlug?: string | null,
  tenantDomain?: string | null,
): string {
  const fromTenant = String(tenantDomain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .trim();
  if (fromTenant) return fromTenant;

  const slug = String(projectSlug || '').trim();
  if (slug) return `${slug}.meauxbility.workers.dev`;
  return 'inneranimalmedia.com';
}

export function resolveCmsStorefrontUrl(
  projectSlug?: string | null,
  tenantDomain?: string | null,
  path = '/',
): string {
  const host = resolveCmsPublicDomain(projectSlug, tenantDomain);
  let route = String(path || '/').trim() || '/';
  if (!route.startsWith('/')) route = `/${route}`;
  return `https://${host}${route}`;
}
