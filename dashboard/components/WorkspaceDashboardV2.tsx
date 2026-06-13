import React, { useState, useRef, useEffect } from 'react';
import {
  FolderOpen,
  Github,
  ArrowRight,
  Target,
  Sparkles,
  ChevronDown,
  Database,
  Zap,
  Globe,
  Search,
  History as HistoryIcon,
  Plus,
  Layout,
  MousePointer,
  FileText,
  Film,
  Square,
  GitBranch,
} from 'lucide-react';
import type { RecentFileEntry } from '../src/ideWorkspace';
import { SetiFileIcon } from '../src/components/SetiFileIcon';
import { usePlanTasksRealtime } from '../src/hooks/usePlanTasksRealtime';
import { readRecentWorkspacesFromLocalStorage } from '../src/recentWorkspacesStorage';

interface WorkspaceDashboardProps {
  onOpenFolder: () => void;
  onConnectWorkspace: () => void;
  onGithubSync: () => void;
  recentFiles: RecentFileEntry[];
  workspaceRows: Array<{ id: string; name: string }>;
  authWorkspaceId: string | null;
  onSwitchWorkspace: (id: string) => void;
  onQuickstart: () => void;
  onRunVerificationCommand?: (command: string) => void;
  onOpenEditor?: () => void;
  onOpenRecent: (entry: RecentFileEntry) => void;
  workspacePlanTasks?: unknown[];
  activePlanId?: string | null;
  workspaceActivity?: unknown[];
  workspaceVerificationCommands?: unknown[];
  activeAgentSlug?: string | null;
  sessionUserId?: string | null;
}

type NavTab = 'recent' | 'workspaces' | 'systems' | 'examples';

const TEMPLATE_CARDS = [
  { id: 'start',     icon: Plus,          label: 'Start anywhere',    sub: 'Add a file and design',    start: true },
  { id: 'slides',    icon: Layout,        label: 'Slides',            sub: 'Decks & reviews' },
  { id: 'prototype', icon: MousePointer,  label: 'Prototype',         sub: 'Clickable & interactive' },
  { id: 'wireframe', icon: Square,        label: 'Product wireframe', sub: 'Lo-fi screens & flows' },
  { id: 'doc',       icon: FileText,      label: 'Doc',               sub: 'Resumes, PDFs, etc.' },
  { id: 'animation', icon: Film,          label: 'Animation',         sub: 'Motion & video' },
  { id: 'blank',     icon: Square,        label: 'Blank canvas',      sub: 'Start from scratch' },
  { id: 'flow',      icon: GitBranch,     label: 'Flowchart',         sub: 'Diagrams & maps' },
  { id: 'component', icon: Sparkles,      label: 'Component set',     sub: 'Reusable UI pieces' },
] as const;

function summarizeUnknownTask(row: unknown): string {
  if (row == null) return '';
  if (typeof row === 'string') return row;
  if (typeof row === 'object' && row !== null && 'title' in row && typeof (row as { title?: unknown }).title === 'string') {
    return String((row as { title: string }).title);
  }
  try { return JSON.stringify(row).slice(0, 200); } catch { return String(row); }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const WorkspaceDashboardV2: React.FC<WorkspaceDashboardProps> = ({
  onOpenFolder,
  onConnectWorkspace,
  onGithubSync,
  recentFiles,
  workspaceRows,
  authWorkspaceId,
  onSwitchWorkspace,
  onQuickstart,
  onRunVerificationCommand,
  onOpenRecent,
  workspacePlanTasks = [],
  activePlanId = null,
  workspaceActivity = [],
  workspaceVerificationCommands = [],
  activeAgentSlug = null,
  sessionUserId = null,
}) => {
  const { tasks: realtimePlanTasks } = usePlanTasksRealtime(activePlanId ?? null);
  const displayPlanTasks: unknown[] = activePlanId ? (realtimePlanTasks as unknown[]) : workspacePlanTasks;

  const [activeNav, setActiveNav] = useState<NavTab>('recent');
  const [searchVal, setSearchVal] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dirRef = useRef<number>(0);

  const recentWorkspaces = readRecentWorkspacesFromLocalStorage(sessionUserId);
  const activeWorkspace = workspaceRows.find((w) => w.id === authWorkspaceId);

  // edge-scroll
  const startScroll = (dir: number) => {
    dirRef.current = dir;
    const tick = () => {
      if (!dirRef.current || !scrollRef.current) return;
      scrollRef.current.scrollLeft += dirRef.current * 4;
      rafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  };
  const stopScroll = () => {
    dirRef.current = 0;
    cancelAnimationFrame(rafRef.current);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const hasStatusBanner =
    activeAgentSlug ||
    displayPlanTasks.length > 0 ||
    workspaceActivity.length > 0 ||
    workspaceVerificationCommands.length > 0;

  const allRecentRows: Array<{ key: string; name: string; sub: string; ts: number; onOpen: () => void }> = [
    ...recentWorkspaces.slice(0, 3).map((ws) => ({
      key: `ws-${ws.id}`,
      name: ws.display_name || ws.slug || ws.id,
      sub: `Workspace · ${ws.slug || ws.id}`,
      ts: ws.openedAt ?? 0,
      onOpen: () => onSwitchWorkspace(ws.id),
    })),
    ...recentFiles.slice(0, 8).map((f) => ({
      key: `f-${f.id}`,
      name: f.name,
      sub: f.label || f.workspacePath || '',
      ts: f.openedAt ?? 0,
      onOpen: () => onOpenRecent(f),
    })),
  ];

  const filteredRows = searchVal.trim()
    ? allRecentRows.filter(
        (r) =>
          r.name.toLowerCase().includes(searchVal.toLowerCase()) ||
          r.sub.toLowerCase().includes(searchVal.toLowerCase()),
      )
    : allRecentRows;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--dashboard-canvas)', color: 'var(--dashboard-text)' }}
    >
      {/* ── TOP NAV ── */}
      <div
        className="shrink-0 flex items-center gap-6 px-8 border-b"
        style={{
          height: 52,
          background: 'var(--dashboard-panel)',
          borderColor: 'var(--dashboard-border)',
        }}
      >
        {/* Nav links */}
        <div className="flex items-center gap-1 flex-1">
          {(
            [
              { id: 'workspaces', label: 'Workspaces' },
              { id: 'recent',     label: 'Recent' },
              { id: 'systems',    label: 'Design systems' },
              { id: 'examples',   label: 'Examples' },
            ] as { id: NavTab; label: string }[]
          ).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setActiveNav(n.id)}
              className="relative px-3 py-1.5 text-[13px] rounded-md transition-colors"
              style={{
                color: activeNav === n.id ? 'var(--dashboard-text)' : 'var(--text-muted)',
                fontWeight: activeNav === n.id ? 500 : 400,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {n.label}
              {activeNav === n.id && (
                <span
                  className="absolute left-3 right-3 rounded-t"
                  style={{
                    bottom: -13,
                    height: 2,
                    background: 'var(--dashboard-text)',
                    display: 'block',
                  }}
                />
              )}
            </button>
          ))}
        </div>


      </div>

      {/* ── BODY ── */}
      <div className="flex-1 overflow-y-auto px-8 py-8 no-scrollbar">


        {/* Make something new */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[14px] font-medium" style={{ color: 'var(--dashboard-text)' }}>
              Make something new
            </span>
            <button
              type="button"
              onClick={onConnectWorkspace}
              className="flex items-center gap-1 text-[12px] px-2 py-0.5 rounded"
              style={{
                border: '1px solid var(--dashboard-border)',
                color: 'var(--text-muted)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              Design System <ChevronDown size={10} />
            </button>
          </div>

          {/* Scrollable card strip */}
          <div className="relative">
            {/* left fade + scroll zone */}
            <div
              className="absolute left-0 top-0 bottom-0 z-10 pointer-events-none"
              style={{ width: 48, background: 'linear-gradient(to right, var(--dashboard-canvas), transparent)' }}
            />
            <div
              className="absolute left-0 top-0 bottom-0 z-20"
              style={{ width: 64, cursor: 'default' }}
              onMouseEnter={() => startScroll(-1)}
              onMouseLeave={stopScroll}
            />
            {/* right fade + scroll zone */}
            <div
              className="absolute right-0 top-0 bottom-0 z-10 pointer-events-none"
              style={{ width: 48, background: 'linear-gradient(to left, var(--dashboard-canvas), transparent)' }}
            />
            <div
              className="absolute right-0 top-0 bottom-0 z-20"
              style={{ width: 64, cursor: 'default' }}
              onMouseEnter={() => startScroll(1)}
              onMouseLeave={stopScroll}
            />

            <div
              ref={scrollRef}
              className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1"
              style={{ scrollBehavior: 'smooth' }}
            >
              {TEMPLATE_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={onQuickstart}
                    className="flex-none flex flex-col rounded-xl overflow-hidden transition-all text-left"
                    style={{
                      width: 148,
                      background: 'start' in card && card.start ? 'var(--dashboard-canvas)' : 'var(--dashboard-panel)',
                      border: 'start' in card && card.start
                        ? '1.5px dashed var(--dashboard-border)'
                        : '1px solid var(--dashboard-border)',
                      opacity: 'start' in card && card.start ? 0.75 : 1,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-muted)';
                      (e.currentTarget as HTMLElement).style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      const isStart = card.id === 'start';
                      (e.currentTarget as HTMLElement).style.borderColor = isStart ? 'var(--dashboard-border)' : 'var(--dashboard-border)';
                      (e.currentTarget as HTMLElement).style.opacity = isStart ? '0.75' : '1';
                    }}
                  >
                    {/* thumb */}
                    <div
                      className="flex items-center justify-center"
                      style={{
                        height: 96,
                        background: 'var(--dashboard-canvas)',
                        borderBottom: '1px solid var(--dashboard-border)',
                      }}
                    >
                      <Icon size={28} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                    </div>
                    {/* label */}
                    <div className="px-3 py-2.5">
                      <p className="text-[12px] font-medium leading-tight" style={{ color: 'var(--dashboard-text)' }}>{card.label}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{card.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Designs / Recent table */}
        <div>
          <p className="text-[14px] font-medium mb-3" style={{ color: 'var(--dashboard-text)' }}>
            {activeNav === 'workspaces' ? 'Workspaces' : 'Designs'}
          </p>

          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--dashboard-border)', background: 'var(--dashboard-panel)' }}
          >
            {/* header row */}
            <div
              className="grid text-[11px] px-4 py-2.5"
              style={{
                gridTemplateColumns: '1fr 160px 100px',
                borderBottom: '1px solid var(--dashboard-border)',
                color: 'var(--text-muted)',
              }}
            >
              <span>Name</span>
              <span>Last viewed</span>
              <span>Owner</span>
            </div>

            {activeNav === 'workspaces' ? (
              workspaceRows.length > 0 ? workspaceRows.map((ws) => (
                <div
                  key={ws.id}
                  role="button"
                  tabIndex={0}
                  className="grid items-center px-4 py-3 transition-colors cursor-pointer group"
                  style={{
                    gridTemplateColumns: '1fr 160px 100px',
                    borderBottom: '1px solid var(--dashboard-border)',
                    color: 'var(--dashboard-text)',
                  }}
                  onClick={() => onSwitchWorkspace(ws.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSwitchWorkspace(ws.id); }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                      style={{ background: 'var(--dashboard-canvas)' }}
                    >
                      <Database size={12} style={{ color: 'var(--solar-cyan)' }} />
                    </div>
                    <span className="text-[13px] truncate">{ws.name}</span>
                    {authWorkspaceId === ws.id && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--solar-cyan)', color: '#000', fontWeight: 600 }}
                      >
                        active
                      </span>
                    )}
                  </div>
                  <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>—</span>
                  <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>You</span>
                </div>
              )) : (
                <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  No workspaces yet.
                </div>
              )
            ) : (
              filteredRows.length > 0 ? filteredRows.map((row) => (
                <div
                  key={row.key}
                  role="button"
                  tabIndex={0}
                  className="grid items-center px-4 py-3 transition-colors cursor-pointer"
                  style={{
                    gridTemplateColumns: '1fr 160px 100px',
                    borderBottom: '1px solid var(--dashboard-border)',
                    color: 'var(--dashboard-text)',
                    background: 'transparent',
                  }}
                  onClick={row.onOpen}
                  onKeyDown={(e) => { if (e.key === 'Enter') row.onOpen(); }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                      style={{ background: 'var(--dashboard-canvas)' }}
                    >
                      <SetiFileIcon filename={row.name} size={13} />
                    </div>
                    <span className="text-[13px] truncate">{row.name}</span>
                  </div>
                  <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    {row.ts ? timeAgo(row.ts) : '—'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold"
                      style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                    >
                      S
                    </div>
                    <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>You</span>
                  </div>
                </div>
              )) : (
                <div className="px-4 py-8 text-center text-[12px] italic" style={{ color: 'var(--text-muted)' }}>
                  {searchVal ? `No results for "${searchVal}"` : 'No recent work yet — switch a workspace or open a file to get started.'}
                </div>
              )
            )}
          </div>

          {/* Quick actions footer */}
          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={onOpenFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors"
              style={{
                border: '1px solid var(--dashboard-border)',
                color: 'var(--text-muted)',
                background: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--dashboard-text)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              <FolderOpen size={13} /> Local folder
            </button>
            <button
              type="button"
              onClick={onGithubSync}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors"
              style={{
                border: '1px solid var(--dashboard-border)',
                color: 'var(--text-muted)',
                background: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--dashboard-text)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              <Github size={13} /> Clone repo
            </button>
            <button
              type="button"
              onClick={onQuickstart}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors"
              style={{
                border: '1px solid var(--dashboard-border)',
                color: 'var(--text-muted)',
                background: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--dashboard-text)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              <Zap size={13} /> Quickstart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
