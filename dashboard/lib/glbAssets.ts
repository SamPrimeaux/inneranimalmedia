/**
 * Canonical GLB URL flattening for Design Studio / VoxelEngine.
 * Always prefer same-origin `/assets/glb/...` so Worker → R2 passthrough works (no CF bot wall).
 */

const CANONICAL_CHESS_BASE = '/assets/glb/chess/v1';

/** Relative path for a chess piece GLB (Worker ASSETS key: glb/chess/v1/pieces/{color}/{piece}.glb). */
export function chessPieceGlbPath(color: 'white' | 'black', piece: string): string {
  const c = color === 'white' || color === 'black' ? color : 'white';
  const p = String(piece || 'pawn')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return `${CANONICAL_CHESS_BASE}/pieces/${c}/${p || 'pawn'}.glb`;
}

/**
 * Flatten any legacy or absolute GLB URL to a same-origin `/assets/...` path when possible.
 * Leaves external URLs (pub-*.r2.dev, etc.) unchanged.
 */
export function normalizeGlbUrl(input: string | null | undefined): string {
  const s = String(input ?? '').trim();
  if (!s) return '';

  if (s.startsWith('/assets/')) return s;

  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://inneranimalmedia.com';
    const u = new URL(s, base);

    if (u.hostname === 'assets.inneranimalmedia.com') {
      const p = u.pathname.replace(/^\/+/, '');
      if (p.startsWith('glb/')) return `/assets/${p}`;
      if (p.startsWith('assets/')) return `/${p}`;
    }

    if (u.hostname.includes('inneranimalmedia.com') && u.pathname.startsWith('/assets/')) {
      return u.pathname;
    }

    const m = u.pathname.match(/\/glb\/chess\/v1\/(.+)$/i);
    if (m) return `${CANONICAL_CHESS_BASE}/${m[1]}`;

    // Legacy pub R2 bucket — serve via Worker /assets/glb/* (CORS-safe for GLTFLoader).
    if (u.hostname.includes('pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev')) {
      const tail = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
      if (tail) return `/assets/glb/${tail}`;
    }
  } catch {
    /* keep raw */
  }

  return s;
}

export function normalizeChessPieceUrls<T extends { white_url?: string; black_url?: string }>(row: T): T {
  return {
    ...row,
    white_url: row.white_url ? normalizeGlbUrl(row.white_url) : row.white_url,
    black_url: row.black_url ? normalizeGlbUrl(row.black_url) : row.black_url,
  };
}
