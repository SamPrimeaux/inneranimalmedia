/**
 * Canonical chess piece GLB URLs on R2 — no Worker proxy, no transforms.
 */
export const CHESS_PIECES_BASE = 'https://assets.inneranimalmedia.com/chess-pieces';

/** Curated runtime astronaut rig — 5 clips, meshopt (~4.69 MB). R2 is canonical in prod. */
export const ASTRONAUT_GLB_BASE = '/assets/glb/astronaut';

export const ASTRONAUT_RUNTIME_GLB = `${ASTRONAUT_GLB_BASE}/astronaut_rig_animations_opt.glb`;

export const ASTRONAUT_ANIMATION_CLIPS = ['walking', 'running', 'boxing', 'climb_fall', 'fall'] as const;

export type AstronautAnimationClip = (typeof ASTRONAUT_ANIMATION_CLIPS)[number];

export const CHESS_PIECE_URLS = {
  king: `${CHESS_PIECES_BASE}/chess_king_white_opt.glb`,
  queen: `${CHESS_PIECES_BASE}/chess_queen_white_opt.glb`,
  bishop: `${CHESS_PIECES_BASE}/chess_bishop_white_opt.glb`,
  knight: `${CHESS_PIECES_BASE}/chess_knight_white_opt.glb`,
  rook: `${CHESS_PIECES_BASE}/chess_rook_white_opt.glb`,
  pawn: `${CHESS_PIECES_BASE}/chess_pawn_white_opt.glb`,
} as const;

export type ChessPieceType = keyof typeof CHESS_PIECE_URLS;

/** Same white mesh URL for both sides — glass/amber applied at runtime. */
export function chessPieceGlbPath(_color: 'white' | 'black', piece: string): string {
  const p = String(piece || 'pawn')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '') as ChessPieceType;
  return CHESS_PIECE_URLS[p in CHESS_PIECE_URLS ? p : 'pawn'];
}

/** @deprecated Use chessPieceGlbPath — alias kept for ChessViewport imports. */
export function chessOptimizedPieceUrl(piece: string): string {
  return chessPieceGlbPath('white', piece);
}

/** Non-chess GLB URL normalization only — never rewrite chess piece URLs. */
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

    if (u.hostname.includes('inneranimalmedia.com') && u.pathname.startsWith('/assets/')) {
      return u.pathname;
    }

    if (u.hostname.includes('assets.inneranimalmedia.com')) {
      const p = u.pathname.replace(/^\/+/, '');
      if (p.startsWith('chess-pieces/')) {
        return `/assets/glb/chess/${p.replace(/^chess-pieces\//, '')}`;
      }
      if (p.startsWith('glb/')) return `/assets/${p}`;
      if (p.startsWith('assets/')) return `/assets/${p}`;
      if (p) return `/assets/glb/${p}`;
    }

    if (u.hostname.includes('pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev')) {
      const tail = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
      if (tail) return `/assets/glb/${tail}`;
    }
  } catch {
    /* keep raw */
  }

  return s;
}

export function normalizeChessPieceUrls<T extends { type?: string; white_url?: string; black_url?: string }>(
  row: T,
): T {
  return {
    ...row,
    white_url: row.white_url ? normalizeGlbUrl(row.white_url) : row.white_url,
    black_url: row.black_url ? normalizeGlbUrl(row.black_url) : row.black_url,
  };
}
