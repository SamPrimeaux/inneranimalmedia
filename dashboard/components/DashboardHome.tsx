/**
 * DashboardHome — /dashboard/home
 *
 * Design intent: clean macOS-launcher feel. Big greeting, project cards with
 * thumbnail art, activity feed sidebar, icon quick-access grid.
 * No stat walls. No tables. Easy to revise section by section.
 *
 * Modularity guide
 * ─────────────────
 * Each named section (GREETING, SEARCH, CREATE, PROJECTS, QUICK, ACTIVITY) is
 * a self-contained block with a clear comment header. To swap a section, delete
 * its block and drop in a new component. Data lives in the DATA LAYER at the top.
 *
 * To connect real data:
 *   - Replace MOCK_PROJECTS with a useFetch('/api/designstudio/scenes') call
 *   - Replace MOCK_ACTIVITY with an SSE or poll of /api/agent/runs
 *   - Replace MOCK_QUICK with whatever nav targets you want at that moment
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── DATA LAYER ───────────────────────────────────────────────────────────────
// Swap these for real API responses; shapes are intentionally flat.

const MOCK_PROJECTS = [
  { id: 'cpas',  name: 'Companions of Caddo', thumb: '/assets/projects/cpas-thumb.jpg',  updated: '2h ago',  members: 1 },
  { id: 'iam',   name: 'Inner Animal Website', thumb: '/assets/projects/iam-thumb.jpg',   updated: '5h ago',  members: 2 },
  { id: 'meaux', name: 'Meauxbility Rebrand',  thumb: '/assets/projects/meaux-thumb.jpg', updated: '1d ago',  members: 2 },
];

const MOCK_ACTIVITY = [
  { color: '#22c55e', title: 'Render complete',    sub: 'Companions Scene', ts: 'Just now' },
  { color: '#3b82f6', title: 'Model exported',     sub: 'Panther_v2.glb',   ts: '1m ago'   },
  { color: '#a855f7', title: 'Email sent',          sub: 'Client Update',    ts: '15m ago'  },
  { color: '#f59e0b', title: 'Workflow finished',   sub: 'Daily Backup',     ts: '1h ago'   },
];

const MOCK_QUICK = [
  { id: 'studio', label: 'Studio',     sub: 'Design, model, animate', bg: '#4f46e5', path: '/dashboard/designstudio',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="#fff" strokeWidth="1.6"/><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="#fff" strokeWidth="1.6"/><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="#fff" strokeWidth="1.6"/><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="#fff" strokeWidth="1.6"/></svg> },
  { id: 'agent',  label: 'Agent',      sub: 'Chat, plan, execute',    bg: '#16a34a', path: '/dashboard/agent',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="5" y="8" width="14" height="11" rx="3" stroke="#fff" strokeWidth="1.6"/><path d="M12 4v4M9 13h.01M15 13h.01" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg> },
  { id: 'ops',    label: 'Operations', sub: 'Email, DB, deploy',      bg: '#0ea5e9', path: '/dashboard/collaborate',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h10M4 18h7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/><circle cx="19" cy="17" r="3" stroke="#fff" strokeWidth="1.6"/></svg> },
  { id: 'files',  label: 'Files',      sub: 'Your assets & docs',     bg: '#ea580c', path: '/dashboard/artifacts',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 012-2h4.586a1 1 0 01.707.293l2.414 2.414A1 1 0 0013.414 8H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="#fff" strokeWidth="1.6"/></svg> },
];

const CREATE_ACTIONS = [
  { label: 'New Project',    color: '#3b82f6', path: '/dashboard/projects',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 012-2h4.586a1 1 0 01.707.293l2.414 2.414A1 1 0 0013.414 8H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.6"/><path d="M12 11v6M9 14h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> },
  { label: 'New Design',     color: '#a855f7', path: '/dashboard/designstudio',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> },
  { label: 'New Agent Chat', color: '#22c55e', path: '/dashboard/chats',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg> },
  { label: 'New Workflow',   color: '#f59e0b', path: '/dashboard/workflows',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg> },
  { label: 'Import',         color: '#6366f1', path: '/dashboard/artifacts',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 21h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> },
];

// ─── SMALL ATOMS ─────────────────────────────────────────────────────────────

function PeopleCount({ n }: { n: number }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,.38)', fontSize: 12 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="17" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M21 20c0-2.5-1.8-4-4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      {n}
    </span>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function DashboardHome() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const hour = new Date().getHours();
  const tod = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto',
      background: 'var(--bg-app, #111214)',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      color: 'var(--text-main, #e8eaf0)',
    }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '36px 32px 80px' }}>

        {/* ── GREETING ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.15 }}>
              Good {tod},{' '}
              <span style={{ color: '#04a9fb' }}>Sam.</span>
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,.38)', fontWeight: 400 }}>
              What do you want to create today?
            </p>
          </div>
          {/* Top-right icon buttons — swap freely */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            {([
              <path key="bell" d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>,
              <><circle key="c" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>,
              <rect key="gr" x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5"/>,
            ] as React.ReactNode[]).map((icon, i) => (
              <button key={i} style={{
                width: 36, height: 36, border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 9, background: 'rgba(255,255,255,.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'rgba(255,255,255,.45)',
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">{icon}</svg>
              </button>
            ))}
          </div>
        </div>

        {/* ── SEARCH ───────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.09)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 28,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="rgba(255,255,255,.3)" strokeWidth="1.8"/>
            <path d="m20 20-3.2-3.2" stroke="rgba(255,255,255,.3)" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search anything..."
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent', color: 'var(--text-main, #e8eaf0)',
              fontSize: 14, fontFamily: 'inherit',
            }}
          />
          <kbd style={{
            fontSize: 11, color: 'rgba(255,255,255,.28)',
            background: 'rgba(255,255,255,.08)', borderRadius: 5,
            padding: '2px 7px', fontFamily: 'inherit',
          }}>⌘ K</kbd>
        </div>

        {/* ── CREATE NEW ───────────────────────────────────────────────── */}
        <div style={{ marginBottom: 36 }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.38)', letterSpacing: '.5px', textTransform: 'uppercase' }}>
            Create new
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CREATE_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => navigate(a.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 15px', borderRadius: 9,
                  border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)',
                  cursor: 'pointer', color: a.color, fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                  transition: 'background .15s, border-color .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.09)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.17)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; }}
              >
                {a.icon}{a.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 2-COLUMN: PROJECTS + ACTIVITY ────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 272px', gap: 28, alignItems: 'start' }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>

            {/* ── RECENT PROJECTS ────────────────────────────────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Recent projects</span>
                <button
                  onClick={() => navigate('/dashboard/projects')}
                  style={{ fontSize: 13, color: 'rgba(255,255,255,.38)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  View all
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                {MOCK_PROJECTS.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                      background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
                      transition: 'border-color .15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.18)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)')}
                  >
                    {/* Thumb — falls back to gradient when image 404s */}
                    <div style={{
                      height: 92,
                      background: `url(${p.thumb}) center/cover no-repeat, linear-gradient(135deg,#1c1e2a,#252838)`,
                    }} />
                    <div style={{ padding: '10px 11px 12px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5 }}>
                        {p.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.3)' }}>Updated {p.updated}</span>
                        <PeopleCount n={p.members} />
                      </div>
                    </div>
                  </div>
                ))}

                {/* New project tile */}
                <div
                  onClick={() => navigate('/dashboard/projects')}
                  style={{
                    borderRadius: 10, border: '1.5px dashed rgba(255,255,255,.12)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 6, cursor: 'pointer', minHeight: 148,
                    color: 'rgba(255,255,255,.28)', transition: 'border-color .15s, color .15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.25)'; e.currentTarget.style.color = 'rgba(255,255,255,.5)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.12)'; e.currentTarget.style.color = 'rgba(255,255,255,.28)'; }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>New project</span>
                </div>
              </div>
            </div>

            {/* ── QUICK ACCESS ───────────────────────────────────────── */}
            <div>
              <span style={{ fontSize: 15, fontWeight: 600, display: 'block', marginBottom: 14 }}>Quick access</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                {MOCK_QUICK.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => navigate(q.path)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 13,
                      padding: '14px 16px', borderRadius: 10,
                      background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
                      cursor: 'pointer', transition: 'background .15s, border-color .15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.09)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.15)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: q.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {q.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{q.label}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>{q.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── ACTIVITY ───────────────────────────────────────────────── */}
          <div style={{
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{ padding: '15px 18px 12px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Activity</span>
            </div>
            {MOCK_ACTIVITY.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 11,
                padding: '13px 18px',
                borderBottom: i < MOCK_ACTIVITY.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: a.color,
                  flexShrink: 0, marginTop: 4, boxShadow: `0 0 6px ${a.color}88`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>{a.sub}</div>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.25)', flexShrink: 0, paddingTop: 2 }}>{a.ts}</div>
              </div>
            ))}
            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 13, color: 'rgba(255,255,255,.38)',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              }}>
                View all activity
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 8l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
