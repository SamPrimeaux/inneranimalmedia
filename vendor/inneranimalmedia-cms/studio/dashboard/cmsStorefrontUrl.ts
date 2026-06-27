/** Legacy project_key slugs → cms_tenants.slug */
const CMS_TENANT_SLUG_ALIASES: Record<string, string> = {
  nicoc: 'newiberiachurchofchrist',
};

/** Production apex hostnames keyed by cms project slug (D1 cms_tenants.slug). */
const PRODUCTION_APEX_HOST: Record<string, string> = {
  inneranimalmedia: 'inneranimalmedia.com',
  fuelnfreetime: 'fuelnfreetime.com',
  meauxbility: 'meauxbility.org',
  newiberiachurchofchrist: 'newiberiachurchofchrist.com',
  nicoc: 'newiberiachurchofchrist.com',
};

export type StorefrontUrlInput = {
  projectSlug?: string | null;
  tenantDomain?: string | null;
  /** Workspace-level public domain — only for the active/primary site, not every connected row. */
  publicDomain?: string | null;
  siteDomain?: string | null;
  path?: string;
};

function normalizePath(path?: string): string {
  if (!path?.trim()) return '';
  return path.startsWith('/') ? path : `/${path}`;
}

function hostToHttps(raw: string, path: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return `${trimmed.replace(/\/$/, '')}${path}`;
  }
  return `https://${trimmed.replace(/^\/\//, '')}${path}`;
}

/** Resolve the live public storefront URL — never a fake placeholder. */
export function resolveStorefrontUrl(input: StorefrontUrlInput): string {
  const path = normalizePath(input.path);
  const slug = input.projectSlug?.trim() || '';

  for (const candidate of [input.publicDomain, input.tenantDomain, input.siteDomain]) {
    const url = candidate ? hostToHttps(candidate, path) : '';
    if (url) return url;
  }

  const apexSlug = CMS_TENANT_SLUG_ALIASES[slug] || slug;
  const apex = apexSlug ? PRODUCTION_APEX_HOST[apexSlug] || PRODUCTION_APEX_HOST[slug] : null;
  if (apex) return `https://${apex}${path}`;

  if (slug) return `https://${slug}.meauxbility.workers.dev${path}`;
  return `https://inneranimalmedia.com${path}`;
}

export function storefrontDisplayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
