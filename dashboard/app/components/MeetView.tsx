import React from 'react';
import { Video, Mic, Shield, Users, ArrowRight, Play, Settings } from 'lucide-react';

export const MeetView: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-app)] h-full overflow-hidden p-6 gap-8">
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-black italic tracking-tighter uppercase text-white flex items-center gap-3">
            <Video size={20} className="text-[var(--solar-cyan)]" />
            Meetings
          </h1>
          <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Connect with your team and virtual agents</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-5 py-2.5 bg-white text-black rounded-xl text-[12px] font-black italic tracking-tighter uppercase shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-105 transition-all flex items-center gap-2">
            New Meeting
          </button>
        </div>
      </div>

      {/* ── Live Hero ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Next Meeting Card */}
        <div className="lg:col-span-2 relative aspect-video rounded-3xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-panel)] group">
          <img 
            src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=1200" 
            alt="Meeting Background" 
            className="absolute inset-0 w-full h-full object-cover opacity-20 blur-[2px] scale-110 group-hover:scale-100 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-app)] to-transparent" />
          
          <div className="absolute inset-x-8 bottom-8 flex items-end justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[var(--solar-cyan)] mb-2">
                <span className="w-2 h-2 rounded-full bg-[var(--solar-cyan)] animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Next Meeting in 12m</span>
              </div>
              <h2 className="text-3xl font-black italic tracking-tighter uppercase text-white leading-none">
                Architecture Review
              </h2>
              <p className="text-[13px] text-[var(--text-muted)] max-w-sm">
                Discussing Phase 1 shell rollout and Cloudflare D1 performance optimizations.
              </p>
            </div>
            <button className="h-14 w-14 rounded-full bg-[var(--solar-cyan)] text-[#071020] flex items-center justify-center shadow-[0_0_30px_rgba(45,212,191,0.3)] hover:scale-110 transition-all">
              <Play size={24} fill="currentColor" />
            </button>
          </div>
        </div>

        {/* Sidebar Mini-Controls */}
        <div className="flex flex-col gap-4">
          <div className="flex-1 bg-[var(--bg-panel)]/50 border border-[var(--border-subtle)] rounded-3xl p-6 flex flex-col justify-between">
            <div className="flex flex-col gap-4">
               <ControlRow icon={Shield} label="Privacy" value="Encrypted" />
               <ControlRow icon={Users}  label="Room Size" value="8 / 12" />
               <ControlRow icon={Mic}    label="Audio Source" value="System Default" />
            </div>
            <button className="w-full py-3 rounded-2xl border border-[var(--border-subtle)] text-[12px] font-bold text-[var(--text-muted)] hover:text-white transition-all flex items-center justify-center gap-2">
              <Settings size={14} /> Open Settings
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};

const ControlRow: React.FC<{ icon: any; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center justify-between group cursor-default">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors">
        <Icon size={14} />
      </div>
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
    </div>
    <span className="text-[11px] font-bold text-[var(--text-main)]">{value}</span>
  </div>
);
