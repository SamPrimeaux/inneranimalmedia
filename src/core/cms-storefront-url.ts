/**
 * Canonical public storefront hostnames for CMS tenants.
 * TypeScript source — Worker and dashboard import this module.
 */

export const CMS_TENANT_SLUG_ALIASES: Record<string, string> = {
  nicoc: 'newiberiachurchofchrist',
};

export const CMS_PRODUCTION_APEX_HOST: Record<string, string> = {
  inneranimalmedia: 'inneranimalmedia.com',
  fuelnfreetime: 'fuelnfreetime.com',
  meauxbility: 'meauxbility.org',
  newiberiachurchofchrist: 'newiberiachurchofchrist.com',
  companionscpas: 'companionscpas.com',
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
  const apexSlug = CMS_TENANT_SLUG_ALIASES[slug] || slug;
  const apex =
    (apexSlug && CMS_PRODUCTION_APEX_HOST[apexSlug]) ||
    (slug && CMS_PRODUCTION_APEX_HOST[slug]) ||
    null;
  if (apex) return apex;

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
