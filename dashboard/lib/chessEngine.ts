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

/** Random legal reply for practice vs Agent Sam. */
export function pickAgentSamMove(
  fen: string,
): { from: string; to: string; fen: string; turn: 'white' | 'black' } | null {
  try {
    const chess = new Chess(fen || START);
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return null;
    const move = moves[Math.floor(Math.random() * moves.length)];
    chess.move(move);
    return {
      from: move.from,
      to: move.to,
      fen: chess.fen(),
      turn: chess.turn() === 'w' ? 'white' : 'black',
    };
  } catch {
    return null;
  }
}
