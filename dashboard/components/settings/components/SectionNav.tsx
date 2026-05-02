import React from 'react';
import { Search } from 'lucide-react';
import type { NavSectionItem } from '../types';

export type SectionNavProps = {
  sections: NavSectionItem[];
  activeSection: string;
  onSelect: (id: string) => void;
  filter: string;
  onFilterChange: (v: string) => void;
};

export function SectionNav({
  sections,
  activeSection,
  onSelect,
  filter,
  onFilterChange,
}: SectionNavProps) {
  return (
    <>
      <div className="px-2 py-2 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5">
          <Search size={10} className="text-[var(--text-muted)] shrink-0" />
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="bg-transparent text-[11px] focus:outline-none text-[var(--text-main)] placeholder:text-[var(--text-muted)] w-full"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors text-left ${
              activeSection === item.id
                ? 'bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] border-r-2 border-[var(--solar-cyan)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <span className="shrink-0">{item.icon}</span>
            {item.id}
          </button>
        ))}
      </div>
    </>
  );
}
