/**
 * Dashboard chrome visibility — status bar, mobile nav offsets.
 * Create surfaces (Design Studio, CMS, Movie Mode, …) hide the dev status lip.
 */
import { isAgentShellPath } from '../lib/agentRoutes';
import { SHELL_PRODUCTS } from './shellNav';

/** Routes under the Create product menu — no git/notifications status bar. */
export function isCreateSurfaceRoute(pathname: string): boolean {
  const create = SHELL_PRODUCTS.find((p) => p.id === 'create');
  if (!create) return false;
  for (const item of create.items) {
    const path = item.path;
    if (!path) continue;
    if (item.match === 'exact') {
      if (pathname === path) return true;
    } else if (pathname === path || pathname.startsWith(`${path}/`)) {
      return true;
    }
  }
  return false;
}

export function showDashboardStatusBar(pathname: string, isNarrow = false): boolean {
  if (isNarrow && isAgentShellPath(pathname)) return false;
  return !isCreateSurfaceRoute(pathname);
}

/** Fixed dashboard status lip height (matches StatusBar row). */
export const DASHBOARD_STATUS_BAR_INSET = '1.5rem';

/** Bottom padding for floating chat composer — clears status bar + safe area. */
export function dashboardComposerBottomPad(pathname: string, isNarrow: boolean, extraPx = 16): string {
  const status = showDashboardStatusBar(pathname, isNarrow) ? `${DASHBOARD_STATUS_BAR_INSET} + ` : '';
  return `calc(${status}env(safe-area-inset-bottom, 0px) + ${extraPx}px)`;
}

/** Fixed mobile tab bar sits above the 1.5rem StatusBar when visible. */
export const MOBILE_TAB_BAR_BOTTOM_WITH_STATUS =
  'calc(1.5rem + env(safe-area-inset-bottom, 0px))';

export const MOBILE_TAB_BAR_BOTTOM_FLUSH = 'env(safe-area-inset-bottom, 0px)';

export function mobileTabBarBottomOffset(showStatusBar: boolean): string {
  return showStatusBar ? MOBILE_TAB_BAR_BOTTOM_WITH_STATUS : MOBILE_TAB_BAR_BOTTOM_FLUSH;
}
