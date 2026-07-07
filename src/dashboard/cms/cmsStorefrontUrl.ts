/**
 * Dashboard storefront URL helpers — domain must come from /api/cms/workspace-context or bootstrap.
 */
import { resolveCmsStorefrontUrl } from '../../core/cms-storefront-url';

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

/** Resolve the live public storefront URL from API-provided domains only. */
export function resolveStorefrontUrl(input: StorefrontUrlInput): string | null {
  const path = normalizePath(input.path);
  for (const candidate of [input.siteDomain, input.publicDomain, input.tenantDomain]) {
    if (!candidate?.trim()) continue;
    const trimmed = candidate.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return `${trimmed.replace(/\/$/, '')}${path}`;
    }
    return `https://${trimmed.replace(/^\/\//, '')}${path}`;
  }
  return resolveCmsStorefrontUrl(null, path || '/');
}

export function storefrontDisplayHost(url: string | null | undefined): string {
  if (!url) return 'Domain not configured';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
