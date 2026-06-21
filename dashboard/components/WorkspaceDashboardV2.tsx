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
import type { QuickstartTemplate } from './AgentQuickstartPage';
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
  onOpenExamples?: () => void;
  onBeginTemplate?: (template: QuickstartTemplate) => void;
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
  { id: 'start',     slug: 'start-anywhere',    icon: Plus,          label: 'Start anywhere',    sub: 'Add a file and design',    start: true },
  { id: 'slides',    slug: 'card-slides',        icon: Layout,        label: 'Slides',            sub: 'Decks & reviews' },
  { id: 'prototype', slug: 'card-prototype',     icon: MousePointer,  label: 'Prototype',         sub: 'Clickable & interactive' },
  { id: 'wireframe', slug: 'card-wireframe',     icon: Square,        label: 'Product wireframe', sub: 'Lo-fi screens & flows' },
  { id: 'doc',       slug: 'card-doc',           icon: FileText,      label: 'Doc',               sub: 'Resumes, PDFs, etc.' },
  { id: 'animation', slug: 'card-animation',     icon: Film,          label: 'Animation',         sub: 'Motion & video' },
  { id: 'blank',     slug: 'card-blank-canvas',  icon: Square,        label: 'Blank canvas',      sub: 'Start from scratch' },
  { id: 'flow',      slug: 'card-flowchart',     icon: GitBranch,     label: 'Flowchart',         sub: 'Diagrams & maps' },
  { id: 'component', slug: 'card-component-set', icon: Sparkles,      label: 'Component set',     sub: 'Reusable UI pieces' },
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
  onOpenExamples,
  onBeginTemplate,
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
  const [showDSSetup, setShowDSSetup] = useState(false);
  const [templateMap, setTemplateMap] = useState<Record<string, import('./AgentQuickstartPage').QuickstartTemplate>>({});

  useEffect(() => {
    fetch('/api/agent/quickstart/templates', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { templates?: import('./AgentQuickstartPage').QuickstartTemplate[] }) => {
        if (!Array.isArray(body.templates)) return;
        const map: Record<string, import('./AgentQuickstartPage').QuickstartTemplate> = {};
        for (const t of body.templates) map[t.slug] = t;
        setTemplateMap(map);
      })
      .catch(() => { /* silently fall back to hardcoded seeds */ });
  }, []);
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
              onClick={() => {
                if (n.id === 'examples') {
                  onOpenExamples?.();
                  return;
                }
                setActiveNav(n.id);
                setShowDSSetup(n.id === 'systems');
              }}
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
      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ position: 'relative' }}>

        {/* ── Design System Setup full panel ── */}
        {showDSSetup && (
          <div
            className="flex flex-col h-full overflow-y-auto no-scrollbar"
            style={{ background: 'var(--dashboard-canvas)' }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-8 py-5"
              style={{ borderBottom: '1px solid var(--dashboard-border)' }}
            >
              <button
                type="button"
                onClick={() => setShowDSSetup(false)}
                className="flex items-center gap-1.5 text-[13px] transition-colors"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--dashboard-text)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2L3 7l6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
              </button>
              <button
                type="button"
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[12px] font-medium"
                style={{
                  background: 'var(--dashboard-panel)',
                  border: '1px solid var(--dashboard-border)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                Continue to generation
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col items-center px-8 py-12 gap-8" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>

              {/* Icon + title */}
              <div className="flex flex-col items-center gap-3 text-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--dashboard-text)' }}>
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                </svg>
                <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--dashboard-text)' }}>
                  Set up your design system
                </h2>
                <p className="text-[13px]" style={{ color: 'var(--text-muted)', maxWidth: 400 }}>
                  Tell Agent Sam about your company and attach any design resources you have.
                </p>
              </div>

              {/* Company blurb */}
              <div className="flex flex-col gap-2 w-full">
                <label className="text-[12px] font-medium" style={{ color: 'var(--dashboard-text)' }}>
                  Company name and blurb{' '}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(or name of design system)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Inner Animal Media — AI agent SaaS platform. Dark-first UI, Cloudflare Workers + React/Vite, no emoji in agent output, D1-driven everything."
                  className="w-full rounded-lg px-4 py-3 text-[13px] resize-none"
                  style={{
                    background: 'var(--dashboard-panel)',
                    border: '1px solid var(--dashboard-border)',
                    color: 'var(--dashboard-text)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Upload group */}
              <div className="flex flex-col gap-2 w-full">
                <div className="flex flex-col gap-0.5 mb-1">
                  <span className="text-[13px] font-medium" style={{ color: 'var(--dashboard-text)' }}>
                    Provide examples of your design system and products{' '}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(all optional)</span>
                  </span>
                  <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    What works best: code and designs for your design system and your code products.
                  </span>
                </div>

                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--dashboard-border)' }}>
                  {/* GitHub row */}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--dashboard-border)' }}>
                    <span className="text-[12px] font-medium" style={{ color: 'var(--dashboard-text)' }}>Link code from GitHub</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="https://github.com/owner/repo"
                        className="rounded-md px-3 py-1.5 text-[12px]"
                        style={{
                          background: 'var(--dashboard-canvas)',
                          border: '1px solid var(--dashboard-border)',
                          color: 'var(--dashboard-text)',
                          outline: 'none',
                          width: 220,
                          fontFamily: 'inherit',
                        }}
                      />
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-md text-[12px]"
                        style={{
                          background: 'var(--dashboard-canvas)',
                          border: '1px solid var(--dashboard-border)',
                          color: 'var(--dashboard-text)',
                          cursor: 'pointer',
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Computer row */}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--dashboard-border)' }}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[12px] font-medium" style={{ color: 'var(--dashboard-text)' }}>Link code from your computer</span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>For large codebases, recommend attaching a frontend-focused subfolder.</span>
                    </div>
                    <button type="button" className="px-3 py-1.5 rounded-md text-[12px] whitespace-nowrap ml-4" style={{ background: 'var(--dashboard-canvas)', border: '1px solid var(--dashboard-border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      Drag a folder here or browse
                    </button>
                  </div>

                  {/* Fig row */}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--dashboard-border)' }}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[12px] font-medium" style={{ color: 'var(--dashboard-text)' }}>Upload a .fig file</span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Parsed locally in your browser — never uploaded.</span>
                    </div>
                    <button type="button" className="px-3 py-1.5 rounded-md text-[12px] whitespace-nowrap ml-4" style={{ background: 'var(--dashboard-canvas)', border: '1px solid var(--dashboard-border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      Drop .fig here or browse
                    </button>
                  </div>

                  {/* Assets row */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[12px] font-medium" style={{ color: 'var(--dashboard-text)' }}>Add fonts, logos and assets</span>
                    <button type="button" className="px-3 py-1.5 rounded-md text-[12px] whitespace-nowrap ml-4" style={{ background: 'var(--dashboard-canvas)', border: '1px solid var(--dashboard-border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      Drag files here or browse
                    </button>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-2 w-full">
                <label className="text-[12px] font-medium" style={{ color: 'var(--dashboard-text)' }}>Any other notes?</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Solar cyan (#00d4c8) is our primary accent. No !important in CSS. All colors via CSS vars. Dark-first, light-mode as override."
                  className="w-full rounded-lg px-4 py-3 text-[13px] resize-none"
                  style={{
                    background: 'var(--dashboard-panel)',
                    border: '1px solid var(--dashboard-border)',
                    color: 'var(--dashboard-text)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                  }}
                />
              </div>

            </div>
          </div>
        )}

        {/* ── Normal body content ── */}
        {!showDSSetup && <div className="px-8 py-8">


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
                    onClick={() => {
                      if (onBeginTemplate) {
                        onBeginTemplate({
                          id: `card_${card.id}`,
                          slug: card.slug,
                          name: card.label,
                          description: card.sub,
                          modelHint: 'auto',
                          seedMessage: templateMap[card.slug]?.seedMessage
                            ?? `Quickstart: ${card.label}. Ask the user what they need before doing anything. Wait for answers before generating.`,
                          task_type: templateMap[card.slug]?.task_type ?? 'design_intake',
                          route_key: templateMap[card.slug]?.route_key ?? 'design_intake',
                          subagentSlug: templateMap[card.slug]?.subagentSlug,
                          subagentProfileId: templateMap[card.slug]?.subagentProfileId ?? null,
                        });
                      } else {
                        onQuickstart();
                      }
                    }}
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-[14px] font-medium" style={{ color: 'var(--dashboard-text)' }}>
              {activeNav === 'workspaces' ? 'Workspaces' : activeNav === 'systems' ? 'Design systems' : 'Designs'}
            </p>

          </div>

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
        </div>}{/* end !showDSSetup */}
      </div>
    </div>
  );
};
