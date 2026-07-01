/** Client surface hint for agent / terminal routing (sent in workspaceContext). */

export type ClientSurface = 'mobile_ios' | 'mobile_web' | 'desktop_web' | 'desktop_pwa';

export function detectClientSurface(): ClientSurface {
  if (typeof window === 'undefined') return 'desktop_web';
  const narrow = window.matchMedia('(max-width: 767px)').matches;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true) ??
    false;
  if (narrow) {
    if (ios) return standalone ? 'mobile_ios' : 'mobile_ios';
    return 'mobile_web';
  }
  if (standalone) return 'desktop_pwa';
  return 'desktop_web';
}

export function isMobileClientSurface(surface: string | null | undefined): boolean {
  const s = String(surface || '').trim().toLowerCase();
  return s.startsWith('mobile');
}
