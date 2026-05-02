import React from 'react';
import {
  Search,
  Database,
  Box,
  Code2,
  Wrench,
  Cloud,
  BarChart2,
  BookOpen,
  Network,
  Bot,
} from 'lucide-react';

export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}K`;
  return String(Math.round(n));
}

export function formatUsdMaybe(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `$${Number(n).toFixed(2)}`;
}

export function relativeTime(input: string | number | null | undefined): string {
  if (input == null || input === '') return '—';
  const d =
    typeof input === 'number'
      ? new Date(input > 1e12 ? input : input * 1000)
      : new Date(String(input));
  const t = d.getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.round((Date.now() - t) / 1000);
  const abs = Math.abs(s);
  const fmt = (n: number, unit: string) => `${n}${unit}${s >= 0 ? ' ago' : ''}`;
  if (abs < 60) return fmt(abs, 's');
  const m = Math.round(abs / 60);
  if (m < 60) return fmt(m, 'm');
  const h = Math.round(m / 60);
  if (h < 48) return fmt(h, 'h');
  const days = Math.round(h / 24);
  if (days < 14) return fmt(days, 'd');
  const weeks = Math.round(days / 7);
  return fmt(weeks, 'w');
}

export function initialsFromDisplayName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return t.length >= 2 ? t.slice(0, 2).toUpperCase() : t[0].toUpperCase();
}

export function formatPlanLabel(plan: string | null): string {
  if (plan == null || String(plan).trim() === '') return '—';
  const p = String(plan).trim().toLowerCase();
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export function formatVaultCreated(at: string | number | null | undefined): string {
  if (at == null || at === '') return '—';
  const n = typeof at === 'string' ? Number.parseInt(at, 10) : Number(at);
  if (Number.isFinite(n) && n > 0 && n < 1e12) {
    return new Date(n * 1000).toLocaleString();
  }
  const d = new Date(String(at));
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—';
}

export const categoryIcon = (cat: string) => {
  const map: Record<string, { icon: React.ReactNode; color: string }> = {
    ai: { icon: <Bot size={14} />, color: 'text-[var(--solar-cyan)]' },
    storage: { icon: <Database size={14} />, color: 'text-[var(--solar-blue)]' },
    platform: { icon: <Cloud size={14} />, color: 'text-[var(--solar-violet)]' },
    analytics: { icon: <BarChart2 size={14} />, color: 'text-[var(--solar-yellow)]' },
    ui: { icon: <Box size={14} />, color: 'text-[var(--solar-magenta)]' },
    code: { icon: <Code2 size={14} />, color: 'text-[var(--solar-green)]' },
    network: { icon: <Network size={14} />, color: 'text-[var(--solar-blue)]' },
    docs: { icon: <BookOpen size={14} />, color: 'text-[var(--solar-orange)]' },
    search: { icon: <Search size={14} />, color: 'text-[var(--solar-violet)]' },
  };
  const key = Object.keys(map).find((k) => cat?.toLowerCase().includes(k));
  return key ? map[key] : { icon: <Wrench size={14} />, color: 'text-[var(--text-muted)]' };
};

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!on)}
    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-[var(--solar-cyan)]' : 'bg-[var(--border-subtle)]'}`}
  >
    <div
      className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--toggle-knob)] shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}
    />
  </button>
);

export const StatusDot: React.FC<{ on: boolean }> = ({ on }) => (
  <span
    className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-[var(--color-success)]' : 'bg-[var(--border-subtle)]'}`}
  />
);
