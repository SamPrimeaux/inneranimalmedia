/**
 * Load chess piece URLs from GET /api/games/pieces (cms_assets + v1 side GLBs).
 */
import { CHESS_BOARD_URL, chessPieceGlbPath, normalizeGlbUrl, type ChessPieceType } from './glbAssets';

export type PieceUrlEntry = {
  white_url: string;
  black_url: string;
  shared_mesh: boolean;
};

export type ChessPieceRegistry = {
  preserveMaterials: boolean;
  boardUrl: string | null;
  source: string;
  pieces: Record<string, PieceUrlEntry>;
  urlFor(color: 'white' | 'black', piece: string): string;
};

const PIECE_TYPES = ['king', 'queen', 'bishop', 'knight', 'rook', 'pawn'] as const;

function normalizePiece(piece: string): ChessPieceType | 'pawn' {
  const p = String(piece || 'pawn')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return (PIECE_TYPES.includes(p as (typeof PIECE_TYPES)[number]) ? p : 'pawn') as ChessPieceType | 'pawn';
}

function fallbackRegistry(): ChessPieceRegistry {
  const pieces: Record<string, PieceUrlEntry> = {};
  for (const piece of PIECE_TYPES) {
    const url = chessPieceGlbPath('white', piece);
    pieces[piece] = { white_url: url, black_url: url, shared_mesh: true };
  }
  return {
    preserveMaterials: true,
    boardUrl: CHESS_BOARD_URL,
    source: 'legacy_hardcoded',
    pieces,
    urlFor(color, piece) {
      return chessPieceGlbPath(color, normalizePiece(piece));
    },
  };
}

function normalizeEntry(entry: Partial<PieceUrlEntry> | undefined, piece: string): PieceUrlEntry {
  const white = normalizeGlbUrl(entry?.white_url) || chessPieceGlbPath('white', piece);
  const black = normalizeGlbUrl(entry?.black_url) || white;
  return {
    white_url: white,
    black_url: black,
    shared_mesh: Boolean(entry?.shared_mesh ?? white === black),
  };
}

let cached: ChessPieceRegistry | null = null;
let loading: Promise<ChessPieceRegistry> | null = null;

export async function loadChessPieceRegistry(force = false): Promise<ChessPieceRegistry> {
  if (cached && !force) return cached;
  if (loading && !force) return loading;

  loading = (async () => {
    try {
      const res = await fetch('/api/games/pieces', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        preserve_materials?: boolean;
        board_url?: string | null;
        source?: string;
        pieces?: Record<string, Partial<PieceUrlEntry>>;
      };

      const raw = data.pieces || {};
      const pieces: Record<string, PieceUrlEntry> = {};
      for (const piece of PIECE_TYPES) {
        pieces[piece] = normalizeEntry(raw[piece], piece);
      }

      const preserveMaterials = Boolean(data.preserve_materials);
      const boardUrl = data.board_url ? normalizeGlbUrl(data.board_url) : null;
      const registry: ChessPieceRegistry = {
        preserveMaterials,
        boardUrl,
        source: data.source || 'api',
        pieces,
        urlFor(color, piece) {
          const p = normalizePiece(piece);
          const entry = pieces[p] || pieces.pawn;
          return color === 'black' ? entry.black_url : entry.white_url;
        },
      };
      cached = registry;
      return registry;
    } catch (err) {
      console.warn('[chessPieceAssets] API unavailable, using legacy hardcoded URLs', err);
      cached = fallbackRegistry();
      return cached;
    } finally {
      loading = null;
    }
  })();

  return loading;
}
