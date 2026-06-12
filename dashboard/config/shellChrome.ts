/**
 * Dashboard chrome visibility — status bar, mobile nav offsets.
 * Create surfaces (Design Studio, CMS, Movie Mode, …) hide the dev status lip.
 */
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

export function showDashboardStatusBar(pathname: string): boolean {
  return !isCreateSurfaceRoute(pathname);
}

/** Fixed mobile tab bar sits above the 1.5rem StatusBar when visible. */
export const MOBILE_TAB_BAR_BOTTOM_WITH_STATUS =
  'calc(1.5rem + env(safe-area-inset-bottom, 0px))';

export const MOBILE_TAB_BAR_BOTTOM_FLUSH = 'env(safe-area-inset-bottom, 0px)';

export function mobileTabBarBottomOffset(showStatusBar: boolean): string {
  return showStatusBar ? MOBILE_TAB_BAR_BOTTOM_WITH_STATUS : MOBILE_TAB_BAR_BOTTOM_FLUSH;
}
