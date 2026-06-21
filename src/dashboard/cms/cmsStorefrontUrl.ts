/** Production apex hostnames keyed by cms project slug (D1 cms_tenants.slug). */
const PRODUCTION_APEX_HOST: Record<string, string> = {
  inneranimalmedia: 'inneranimalmedia.com',
  fuelnfreetime: 'fuelnfreetime.com',
};

export type StorefrontUrlInput = {
  projectSlug?: string | null;
  tenantDomain?: string | null;
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

  const apex = slug ? PRODUCTION_APEX_HOST[slug] : null;
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
