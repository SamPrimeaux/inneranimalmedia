export const REGISTRY_TO_CATALOG_SLUG: Record<string, string> = {
  cloudflare_oauth: 'cloudflare',
  supabase_oauth: 'supabase',
};

export function registrySlugForCatalog(catalogSlug: string): string {
  const slug = String(catalogSlug || '').trim().toLowerCase();
  for (const [registry, catalog] of Object.entries(REGISTRY_TO_CATALOG_SLUG)) {
    if (catalog === slug) return registry;
  }
  return slug;
}

export function catalogSlugForRegistry(providerKey: string): string {
  const key = String(providerKey || '').trim().toLowerCase();
  return REGISTRY_TO_CATALOG_SLUG[key] || key;
}

export function isSlugConnected(slug: string, connectedSlugs: Set<string>): boolean {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return false;
  if (connectedSlugs.has(s)) return true;
  for (const [registry, catalog] of Object.entries(REGISTRY_TO_CATALOG_SLUG)) {
    if (catalog === s && connectedSlugs.has(registry)) return true;
  }
  return false;
}
