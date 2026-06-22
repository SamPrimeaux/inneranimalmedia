import React, { useEffect, useState } from 'react';
import { Sword, UserCircle } from 'lucide-react';
import { normalizeChessPieceUrls } from '../../lib/glbAssets';

type Props = {
  onSpawnModel: (name: string, url: string, scale: number) => void;
};

export function GamesToolDock({ onSpawnModel }: Props) {
  const [chessPieces, setChessPieces] = useState<
    { type: string; name: string; white_url: string; black_url: string }[]
  >([]);

  useEffect(() => {
    fetch('/api/games/pieces')
      .then((r) => r.json())
      .then(({ results }) => {
        const map: Record<
          string,
          { type: string; name: string; white_url?: string; black_url?: string }
        > = {};
        for (const row of results || []) {
          let meta: Record<string, unknown> = {};
          try {
            meta =
              typeof (row as { metadata?: unknown }).metadata === 'string'
                ? JSON.parse((row as { metadata: string }).metadata || '{}')
                : ((row as { metadata?: Record<string, unknown> }).metadata ?? {});
          } catch {
            meta = {};
          }
          const piece = meta.piece;
          const color = meta.color;
          if (typeof piece !== 'string' || typeof color !== 'string') continue;
          if (!map[piece]) {
            const label = meta.piece_armory_label;
            map[piece] = {
              type: piece,
              name: typeof label === 'string' ? label : piece,
            };
          }
          if (color === 'white' || color === 'black') {
            map[piece][`${color}_url` as 'white_url' | 'black_url'] = (row as { public_url: string })
              .public_url;
          }
        }
        setChessPieces(
          Object.values(map).map((p) =>
            normalizeChessPieceUrls({
              type: p.type,
              name: p.name,
              white_url: p.white_url || '',
              black_url: p.black_url || '',
            }),
          ),
        );
      })
      .catch((e) => console.warn('[Piece Armory] fetch failed', e));
  }, []);

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
                disabled={!piece.white_url}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
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
                onClick={() => onSpawnModel(`Orange ${piece.name}`, piece.black_url || piece.white_url, 0.8)}
                disabled={!piece.black_url}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
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
