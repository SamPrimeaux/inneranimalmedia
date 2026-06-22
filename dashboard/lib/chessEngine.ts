import { Chess, type Square } from 'chess.js';

const START =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function legalMoveTargets(fen: string, from: string): string[] {
  try {
    const chess = new Chess(fen || START);
    const moves = chess.moves({ square: from as Square, verbose: true });
    return moves.map((m) => m.to);
  } catch {
    return [];
  }
}

export function tryMove(
  fen: string,
  from: string,
  to: string,
): { ok: boolean; fen: string; turn: 'white' | 'black' } {
  try {
    const chess = new Chess(fen || START);
    const move = chess.move({ from: from as Square, to: to as Square, promotion: 'q' });
    if (!move) return { ok: false, fen: fen || START, turn: chess.turn() === 'w' ? 'white' : 'black' };
    return { ok: true, fen: chess.fen(), turn: chess.turn() === 'w' ? 'white' : 'black' };
  } catch {
    return { ok: false, fen: fen || START, turn: 'white' };
  }
}
