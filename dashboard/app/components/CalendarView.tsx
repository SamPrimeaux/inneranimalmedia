import React from 'react';
import { Calendar as CalIcon, ChevronLeft, ChevronRight, Plus, Clock } from 'lucide-react';

export const CalendarView: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-app)] h-full overflow-hidden p-6 gap-6">
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-black italic tracking-tighter uppercase text-white flex items-center gap-3">
            <CalIcon size={20} className="text-[var(--solar-cyan)]" />
            Agenda
          </h1>
          <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest">April 2026 — Schedule & Tasks</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
            <button className="p-2 hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"><ChevronLeft size={16} /></button>
            <span className="px-3 text-[12px] font-bold">Today</span>
            <button className="p-2 hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"><ChevronRight size={16} /></button>
          </div>
          <button className="px-4 py-2 bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/20 rounded-lg text-[12px] font-bold shadow-[0_0_15px_rgba(45,212,191,0.05)] hover:bg-[var(--solar-cyan)]/20 transition-all flex items-center gap-2">
            <Plus size={14} /> New Event
          </button>
        </div>
      </div>

      {/* ── High-Fidelity Agenda List ── */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
        <AgendaItem time="09:30 AM" title="Daily Standup — Inner Animal Media" tags={['Team', 'Internal']} active />
        <AgendaItem time="11:00 AM" title="Dashboard Rebuild — Phase 1 Review" tags={['Design', 'Dev']} />
        <AgendaItem time="02:00 PM" title="Client Call: Neauveau.ai" tags={['External', 'Sales']} />
        <AgendaItem time="04:30 PM" title="Edge Infrastructure Sync" tags={['Cloudflare', 'D1']} />
      </div>

    </div>
  );
};

const AgendaItem: React.FC<{ time: string; title: string; tags: string[]; active?: boolean }> = ({ time, title, tags, active }) => (
  <div className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
    active 
      ? 'bg-[var(--solar-cyan)]/5 border-[var(--solar-cyan)]/30' 
      : 'bg-[var(--bg-panel)]/50 border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/40 hover:bg-[var(--bg-panel)]'
  }`}>
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <Clock size={12} className={active ? 'text-[var(--solar-cyan)]' : ''} />
        <span className="text-[10px] font-mono uppercase tracking-widest">{time}</span>
      </div>
      <div className="flex gap-1.5">
        {tags.map(t => (
          <span key={t} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-[9px] text-[var(--text-muted)]">
            {t}
          </span>
        ))}
      </div>
    </div>
    <h3 className={`text-[13px] font-bold ${active ? 'text-white' : 'text-[var(--text-main)] group-hover:text-white'}`}>
      {title}
    </h3>
  </div>
);
