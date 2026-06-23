import React, { useMemo, useState } from 'react';
import { Clapperboard, Search, X } from 'lucide-react';

export type AnimationClip = {
  action_id: number;
  name: string;
  category?: string;
};

export type AnimationLibraryPanelProps = {
  clips: AnimationClip[];
  selectedActionId: number | null;
  addedActionIds: number[];
  onSelect: (clip: AnimationClip) => void;
  onToggleAdded: (actionId: number) => void;
  onClose?: () => void;
  loading?: boolean;
};

const FALLBACK_CLIPS: AnimationClip[] = [
  { action_id: 92, name: 'Walking' },
  { action_id: 93, name: 'Running' },
  { action_id: 94, name: 'Idle' },
  { action_id: 95, name: 'Jump' },
  { action_id: 96, name: 'Wave' },
  { action_id: 97, name: 'Air Squat' },
  { action_id: 98, name: 'Agree Gesture' },
  { action_id: 99, name: 'Alert' },
];

export function AnimationLibraryPanel({
  clips,
  selectedActionId,
  addedActionIds,
  onSelect,
  onToggleAdded,
  onClose,
  loading = false,
}: AnimationLibraryPanelProps) {
  const [tab, setTab] = useState<'library' | 'added'>('library');
  const [search, setSearch] = useState('');

  const source = clips.length > 0 ? clips : FALLBACK_CLIPS;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list =
      tab === 'added'
        ? source.filter((c) => addedActionIds.includes(c.action_id))
        : source;
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [source, tab, addedActionIds, search]);

  return (
    <aside className="cad-editor cad-editor--animation-library">
      <div className="cad-anim-lib__head">
        <div className="cad-anim-lib__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`cad-anim-lib__tab${tab === 'library' ? ' active' : ''}`}
            onClick={() => setTab('library')}
          >
            Library
          </button>
          <button
            type="button"
            role="tab"
            className={`cad-anim-lib__tab${tab === 'added' ? ' active' : ''}`}
            onClick={() => setTab('added')}
          >
            Added
          </button>
        </div>
        {onClose ? (
          <button
            type="button"
            className="cad-anim-lib__close"
            onClick={onClose}
            title="Close Animation Library"
            aria-label="Close Animation Library"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      <div className="cad-anim-lib__search-wrap">
        <Search size={12} className="cad-anim-lib__search-icon" />
        <input
          className="cad-anim-lib__search"
          placeholder="Search animation"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="cad-anim-lib__body">
        {loading ? (
          <p className="cad-anim-lib__empty">Loading animations…</p>
        ) : filtered.length === 0 ? (
          <p className="cad-anim-lib__empty">
            {tab === 'added' ? 'No added animations yet.' : 'No animations match your search.'}
          </p>
        ) : (
          <div className="cad-anim-lib__grid">
            {filtered.map((clip) => {
              const active = selectedActionId === clip.action_id;
              const added = addedActionIds.includes(clip.action_id);
              return (
                <button
                  key={`${clip.action_id}-${clip.name}`}
                  type="button"
                  className={`cad-anim-lib__card${active ? ' active' : ''}`}
                  onClick={() => onSelect(clip)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onToggleAdded(clip.action_id);
                  }}
                  title={added ? 'Right-click to remove from Added' : 'Right-click to add to Added'}
                >
                  <span className="cad-anim-lib__silhouette" aria-hidden="true" />
                  <span className="cad-anim-lib__label">
                    <Clapperboard size={10} className="cad-anim-lib__label-icon" />
                    <span className="cad-anim-lib__label-text">{clip.name}</span>
                  </span>
                  {added ? <span className="cad-anim-lib__badge">+</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
