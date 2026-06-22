import React from 'react';
import { LayoutGrid, Mountain, Sparkles, Sword, Trees, UserCircle, Zap } from 'lucide-react';
import { ArtStyle, type GenerationConfig } from '../../types';
import { chessPieceGlbPath } from '../../lib/glbAssets';

type Props = {
  genConfig: GenerationConfig;
  onUpdateGenConfig: (config: Partial<GenerationConfig>) => void;
  onSpawnModel: (name: string, url: string, scale: number) => void;
};

const styles = [
  { id: ArtStyle.CYBERPUNK, name: 'Cyberpunk', icon: <Zap size={14} />, colors: 'from-cyan-500 to-blue-600' },
  { id: ArtStyle.BRUTALIST, name: 'Brutalist', icon: <Mountain size={14} />, colors: 'from-slate-600 to-slate-800' },
  { id: ArtStyle.ORGANIC, name: 'Organic', icon: <Trees size={14} />, colors: 'from-emerald-500 to-teal-600' },
  { id: ArtStyle.LOW_POLY, name: 'Low-Poly', icon: <LayoutGrid size={14} />, colors: 'from-amber-400 to-orange-500' },
];

const ARMORY_PIECES = [
  { type: 'king', name: 'King' },
  { type: 'queen', name: 'Queen' },
  { type: 'rook', name: 'Rook' },
  { type: 'bishop', name: 'Bishop' },
  { type: 'knight', name: 'Knight' },
  { type: 'pawn', name: 'Pawn' },
] as const;

export function AnimationTweaksPanel({ genConfig, onUpdateGenConfig, onSpawnModel }: Props) {
  const chessPieces = ARMORY_PIECES.map((p) => ({
    type: p.type,
    name: p.name,
    white_url: chessPieceGlbPath('white', p.type),
    black_url: chessPieceGlbPath('black', p.type),
  }));

  return (
    <div className="space-y-4">
      <section className="bg-[var(--bg-hover)] p-4 rounded-2xl border border-[var(--border-subtle)] space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--solar-violet)]" />
          <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">
            Art direction
          </p>
        </div>
        <div>
          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase block mb-2">
            Scene style preset
          </label>
          <div className="grid grid-cols-2 gap-2">
            {styles.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => onUpdateGenConfig({ style: s.id })}
                className={`flex items-center gap-2 p-2 rounded-xl border text-[10px] font-black ${
                  genConfig.style === s.id
                    ? `bg-gradient-to-br ${s.colors} text-white border-transparent`
                    : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {s.icon}
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-hover)] p-4 rounded-2xl border border-[var(--border-subtle)] space-y-3">
        <div className="flex items-center gap-2">
          <Sword size={14} className="text-[var(--solar-violet)]" />
          <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">
            Character armory
          </p>
        </div>
        <p className="text-[9px] text-[var(--text-muted)]">
          Drop chess pieces into the scene for games and motion tests.
        </p>
        <div>
          <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-2">White pieces</p>
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
          <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-2">Orange pieces</p>
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
      </section>
    </div>
  );
}
