import React from 'react';
import { Sword, UserCircle } from 'lucide-react';
import { chessPieceGlbPath } from '../../lib/glbAssets';

const ARMORY_PIECES = [
  { type: 'king', name: 'King' },
  { type: 'queen', name: 'Queen' },
  { type: 'rook', name: 'Rook' },
  { type: 'bishop', name: 'Bishop' },
  { type: 'knight', name: 'Knight' },
  { type: 'pawn', name: 'Pawn' },
] as const;

type Props = {
  onSpawnModel: (name: string, url: string, scale: number) => void;
};

export function GamesToolDock({ onSpawnModel }: Props) {
  const chessPieces = ARMORY_PIECES.map((p) => ({
    type: p.type,
    name: p.name,
    white_url: chessPieceGlbPath('white', p.type),
    black_url: chessPieceGlbPath('black', p.type),
  }));

  return (
    <section className="bg-[var(--bg-hover)] p-4 rounded-2xl border border-[var(--border-subtle)] space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Sword size={14} className="text-[var(--solar-violet)]" />
        <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Piece Armory</p>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-2">White Pieces</p>
          <div className="grid grid-cols-3 gap-2">
            {chessPieces.map((piece) => (
              <button
                type="button"
                key={`white-${piece.type}`}
                onClick={() => onSpawnModel(`White ${piece.name}`, piece.white_url, 0.8)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
              >
                <UserCircle size={16} className="text-[var(--text-muted)]" />
                <span className="text-[8px] font-black uppercase text-[var(--text-muted)]">{piece.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-2">Orange Pieces</p>
          <div className="grid grid-cols-3 gap-2">
            {chessPieces.map((piece) => (
              <button
                type="button"
                key={`black-${piece.type}`}
                onClick={() => onSpawnModel(`Orange ${piece.name}`, piece.black_url, 0.8)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
              >
                <UserCircle size={16} className="text-[var(--solar-violet)]" />
                <span className="text-[8px] font-black uppercase text-[var(--text-muted)]">{piece.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
