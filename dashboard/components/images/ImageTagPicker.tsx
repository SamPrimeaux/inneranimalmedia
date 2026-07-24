import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';

export type ImageTagPickerProps = {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
};

export function ImageTagPicker({ tags, suggestions, onChange }: ImageTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setDraft('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const pool = suggestions.filter((s) => !tags.includes(s));
    if (!q) return pool.slice(0, 12);
    return pool.filter((s) => s.toLowerCase().includes(q)).slice(0, 12);
  }, [draft, suggestions, tags]);

  const draftNorm = draft.trim().toLowerCase();
  const exactMatch =
    !!draftNorm &&
    (tags.includes(draftNorm) ||
      suggestions.some((s) => s.toLowerCase() === draftNorm) ||
      filtered.some((s) => s.toLowerCase() === draftNorm));
  const showCreate =
    !!draftNorm && !tags.includes(draftNorm) && !suggestions.some((s) => s.toLowerCase() === draftNorm);

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setDraft('');
    setOpen(false);
  };

  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--solar-cyan) 16%, transparent)',
              border: '1px solid color-mix(in srgb, var(--solar-cyan) 35%, transparent)',
              color: 'var(--solar-cyan)',
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'inherit',
                lineHeight: 1,
                display: 'flex',
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 999,
            border: '1px dashed var(--border-subtle)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Plus size={11} />
          Add tag
        </button>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            top: '100%',
            left: 0,
            minWidth: 260,
            maxWidth: 320,
            marginTop: 4,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', padding: 8, borderBottom: '1px solid var(--border-subtle)' }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (showCreate) addTag(draft);
                  else if (filtered[0]) addTag(filtered[0]);
                }
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="Search or create…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '7px 10px 7px 28px',
                borderRadius: 7,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel)',
                color: 'var(--text-main)',
                fontSize: 12,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 4, maxHeight: 220, overflowY: 'auto' }}>
            {filtered.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => addTag(s)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: 6,
                    background: 'transparent',
                    color: 'var(--text-main)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-panel)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
            {showCreate && !exactMatch && (
              <li>
                <button
                  type="button"
                  onClick={() => addTag(draft)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: 6,
                    background: 'transparent',
                    color: 'var(--solar-cyan)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 500,
                  }}
                >
                  Create key &apos;{draftNorm}&apos;
                </button>
              </li>
            )}
            {!filtered.length && !showCreate && (
              <li style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                No matching tags
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ImageTagPicker;
