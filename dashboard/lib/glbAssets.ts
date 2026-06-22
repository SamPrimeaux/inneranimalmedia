/**
 * Canonical GLB URLs for chess pieces (optimized white meshes + runtime materials).
 */

const CHESS_PIECES_CDN = 'https://assets.inneranimalmedia.com/chess-pieces';
const CHESS_PIECES = ['king', 'queen', 'bishop', 'knight', 'rook', 'pawn'] as const;

/** Optimized white piece mesh — amber/glass applied at load time for orange/white sides. */
export function chessOptimizedPieceUrl(piece: string): string {
  const p = String(piece || 'pawn')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const safe = CHESS_PIECES.includes(p as (typeof CHESS_PIECES)[number]) ? p : 'pawn';
  return `${CHESS_PIECES_CDN}/chess_${safe}_white_opt.glb`;
}

/** @deprecated Board is procedural — kept for legacy callers that skip import. */
export function chessBoardGlbPath(): string {
  return `${CHESS_PIECES_CDN}/chess_board_opt.glb`;
}

/** Same white GLB for both colors; apply glass or amber material after load. */
export function chessPieceGlbPath(_color: 'white' | 'black', piece: string): string {
  return chessOptimizedPieceUrl(piece);
}

/**
 * Flatten legacy or absolute GLB URLs to canonical chess-pieces CDN when possible.
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
      if (p.startsWith('chess-pieces/')) {
        return `${CHESS_PIECES_CDN}/${p.replace(/^chess-pieces\//, '')}`;
      }
      if (p.startsWith('glb/')) return `/assets/${p}`;
      if (p.startsWith('assets/')) return `/${p}`;
    }

    if (u.hostname.includes('inneranimalmedia.com') && u.pathname.startsWith('/assets/')) {
      return u.pathname;
    }

    const chessOpt = u.pathname.match(/chess_([a-z]+)_white_opt\.glb$/i);
    if (chessOpt) return chessOptimizedPieceUrl(chessOpt[1]);

    const m = u.pathname.match(/\/glb\/chess\/v1\/(.+)$/i);
    if (m) {
      const tail = m[1];
      const pieceMatch = tail.match(/pieces\/(?:white|black)\/([a-z]+)\.glb$/i);
      if (pieceMatch) return chessOptimizedPieceUrl(pieceMatch[1]);
    }

    if (u.hostname.includes('pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev')) {
      const tail = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
      if (tail.includes('chess_') && tail.endsWith('_opt.glb')) {
        const name = tail.split('/').pop() || tail;
        const pm = name.match(/chess_([a-z]+)_white_opt\.glb/i);
        if (pm) return chessOptimizedPieceUrl(pm[1]);
      }
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
