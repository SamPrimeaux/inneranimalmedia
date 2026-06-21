import {
  SHELL_PRODUCTS,
  type ShellProductId,
  type ShellProductItem,
} from '../config/shellNav';
import {
  AGENT_EXAMPLES_TAB,
  AGENT_HOME_PATH,
  getAgentTabFromSearch,
  isAgentExamplesTabActive,
} from './agentRoutes';

export function normalizeDashboardPath(pathname: string): string {
  const raw = String(pathname || '').trim() || '/dashboard/agent';
  return raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

export function pathMatches(pathname: string, path: string, match: 'exact' | 'prefix' = 'exact'): boolean {
  const p = normalizeDashboardPath(pathname);
  const target = normalizeDashboardPath(path);
  if (match === 'prefix') {
    return p === target || p.startsWith(`${target}/`);
  }
  return p === target;
}

export function isProductItemActive(pathname: string, item: ShellProductItem, search = ''): boolean {
  if (item.children?.length) {
    return item.children.some((child) => isProductItemActive(pathname, child, search));
  }
  if (!item.path) return false;
  if (item.id === 'examples') {
    return isAgentExamplesTabActive(pathname, search);
  }
  if (item.id === 'agent' && normalizeDashboardPath(item.path) === AGENT_HOME_PATH) {
    return (
      pathMatches(pathname, item.path, item.match ?? 'exact') &&
      getAgentTabFromSearch(search) !== AGENT_EXAMPLES_TAB
    );
  }
  return pathMatches(pathname, item.path, item.match ?? 'exact');
}

export function resolveActiveProduct(pathname: string): ShellProductId | null {
  const p = normalizeDashboardPath(pathname);
  for (const product of SHELL_PRODUCTS) {
    if (pathMatches(p, product.home, product.home.includes('agent') ? 'prefix' : 'exact')) {
      return product.id;
    }
    if (product.items.some((item) => isProductItemActive(p, item))) {
      return product.id;
    }
  }
  return null;
}

export function isCoreRouteActive(
  pathname: string,
  path: string,
  match: 'exact' | 'prefix' = 'exact',
): boolean {
  return pathMatches(pathname, path, match);
}
