/**
 * Dashboard storefront URL helpers — delegates to core TypeScript module.
 */
import {
  CMS_TENANT_SLUG_ALIASES,
  resolveCmsPublicDomain,
  resolveCmsStorefrontUrl,
} from '../../core/cms-storefront-url';

export { CMS_TENANT_SLUG_ALIASES, resolveCmsPublicDomain };

export type StorefrontUrlInput = {
  projectSlug?: string | null;
  tenantDomain?: string | null;
  /** Workspace-level public domain — only for the active/primary site */
  publicDomain?: string | null;
  siteDomain?: string | null;
  path?: string;
};

function normalizePath(path?: string): string {
  if (!path?.trim()) return '';
  return path.startsWith('/') ? path : `/${path}`;
}

/** Resolve the live public storefront URL — never a fake workers.dev placeholder for known tenants */
export function resolveStorefrontUrl(input: StorefrontUrlInput): string {
  const path = normalizePath(input.path);
  for (const candidate of [input.siteDomain, input.publicDomain, input.tenantDomain]) {
    if (!candidate?.trim()) continue;
    const trimmed = candidate.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return `${trimmed.replace(/\/$/, '')}${path}`;
    }
    return `https://${trimmed.replace(/^\/\//, '')}${path}`;
  }
  return resolveCmsStorefrontUrl(input.projectSlug, null, path || '/');
}

export function storefrontDisplayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
