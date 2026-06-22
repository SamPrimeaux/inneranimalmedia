/** Minimal SVG silhouettes for captured-piece rails (SparkChess-style). */
const PATHS: Record<string, string> = {
  pawn: 'M12 4c-1.5 0-2.5 1.2-2.5 2.5 0 1 .5 1.8 1.2 2.3L8 18h8l-2.7-9.2c.7-.5 1.2-1.3 1.2-2.3C14.5 5.2 13.5 4 12 4z',
  rook: 'M8 6h8v2H8V6zm0 3h8l-1 9H9L8 9zm-1-4h10v2H7V5z',
  knight: 'M16 6c-1 2-2.5 3.2-4 4.2.3 1.2.5 2.5.5 3.8H8c0-3 1-5.5 2.5-7.5C9 5 8 4.5 7 4.5 9 3 11 3 13 4c1.5 1 2.5 2.5 3 4z',
  bishop: 'M12 4c-2 0-3.5 1.5-3.5 3.5S10 11 12 11s3.5-3.5 3.5-3.5S14 4 12 4zm-2 8l-1.5 6h7L14 12h-4z',
  queen: 'M12 3l1.2 3h3.3l-2.7 2 1 3.3L12 10l-2.8 1.6 1-3.3-2.7-2h3.3L12 3zm-3 9l-1 6h8l-1-6H9z',
  king: 'M11 4h2v3h3v2h-3v2h3v2h-3v3h-2v-3H8v-2h3v-2H8V7h3V4z',
};

export function capturedPieceSvg(piece: string, color: 'white' | 'black'): string {
  const p = String(piece || 'pawn').toLowerCase();
  const d = PATHS[p in PATHS ? p : 'pawn'];
  const fill = color === 'white' ? '#d4f5ee' : '#e8821a';
  const stroke = color === 'white' ? '#7ee8cc' : '#ffb04a';
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/></svg>`;
}
