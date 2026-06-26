/* ═══════════════════════════════════════════════════════════
   CMS Editor Core v2 — Inner Animal Media
   Layout: [icon-rail 48px] [sidebar 240px] [iframe flex] [panel 300px]
   Matches: Shopify theme editor reference screenshots exactly
═══════════════════════════════════════════════════════════ */
const { useState, useEffect, useRef, useCallback, useMemo } = React;

/* ── API ──────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body instanceof FormData ? opts.body
      : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(e.error || res.statusText);
  }
  return res.json();
}

function readCtx() {
  const p = new URLSearchParams(location.search);
  return {
    project: p.get('project') || 'inneranimalmedia',
    pageId: p.get('page') || '',
    workspaceId: p.get('workspace_id') || '',
    publicDomain: p.get('public_domain') || '',
    view: p.get('view') || '',
    panel: p.get('panel') || 'pages',
  };
}

function cmsDashboardPath(project, segment, pageId = null) {
  const site = encodeURIComponent(project || 'inneranimalmedia');
  const base = `/dashboard/cms/${segment}?site=${site}`;
  if (pageId && segment === 'pages') {
    return `/dashboard/cms/pages/${encodeURIComponent(pageId)}?site=${site}`;
  }
  return base;
}

const STOREFRONT_APEX = {
  inneranimalmedia: 'inneranimalmedia.com',
  fuelnfreetime: 'fuelnfreetime.com',
  meauxbility: 'meauxbility.org',
  newiberiachurchofchrist: 'newiberiachurchofchrist.com',
  nicoc: 'newiberiachurchofchrist.com',
};

function pagePath(page) {
  const route = String(page?.route_path || '').trim();
  if (route) return route.startsWith('/') ? route : `/${route}`;
  const slug = String(page?.slug || '').trim();
  if (!slug || slug === 'home') return '/';
  return `/${slug}`;
}

function pageToUrl(page, boot = bootstrap) {
  if (!page) return null;
  const ctx = readCtx();
  const path = pagePath(page);
  const domain =
    boot?.tenant?.domain ||
    ctx.publicDomain ||
    STOREFRONT_APEX[ctx.project] ||
    STOREFRONT_APEX[boot?.project_slug];
  if (domain) {
    const host = String(domain).replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${host}${path}`;
  }
  const project = ctx.project || boot?.project_slug || 'inneranimalmedia';
  return `https://${project}.meauxbility.workers.dev${path}`;
}

function postParent(type, detail = {}) {
  try { window.parent.postMessage({ type, detail }, '*'); } catch (_) {}
}

let _toastTimer;
function showToast(msg, type = 'ok') {
  const el = document.getElementById('cms-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'cms-toast show ' + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'cms-toast'; }, 2800);
}

const VIEWPORTS = [
  { id: 'desktop', w: null,  label: 'Desktop' },
  { id: 'tablet',  w: 768,   label: 'Tablet'  },
  { id: 'mobile',  w: 390,   label: 'Mobile'  },
];

const SECTION_TYPE_COLORS = {
  hero: '#60a5fa', services: '#fb923c', work: '#a78bfa',
  faq: '#34d399', cta: '#f472b6', overview: '#a78bfa',
  portfolio_gallery: '#a78bfa', statement: '#60a5fa',
  contact_path: '#818cf8', service: '#60a5fa', closing: '#f472b6',
  default: '#64748b',
};

/* ── DRAG REORDER ─────────────────────────────────────────── */
function useDrag(list, onDrop) {
  const from = useRef(null);
  const over = useRef(null);
  return (i) => ({
    draggable: true,
    onDragStart: () => { from.current = i; },
    onDragEnter: () => { over.current = i; },
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => {
      e.preventDefault();
      if (from.current === null || from.current === over.current) return;
      const next = [...list];
      const [m] = next.splice(from.current, 1);
      next.splice(over.current, 0, m);
      from.current = null; over.current = null;
      onDrop(next);
    },
    onDragEnd: () => { from.current = null; over.current = null; },
  });
}

/* ══════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════ */
const STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
html,body,#app{height:100%;overflow:hidden;background:#0d1117;color:#e2e8f0;font-family:Inter,-apple-system,sans-serif;font-size:13px}
button,input,select,textarea{font:inherit;color:inherit}

/* ── SHELL ── */
.shell{display:grid;grid-template-columns:48px 240px 1fr 300px;grid-template-rows:44px 1fr;height:100vh;overflow:hidden}

/* ── TOPBAR ── */
.topbar{grid-column:1/-1;height:44px;background:#161b22;border-bottom:1px solid rgba(255,255,255,.08);
  display:flex;align-items:center;padding:0 16px 0 0;gap:0;z-index:20;flex-shrink:0}
.topbar-page-label{font-size:12px;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.topbar-draft{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:4px;
  font-size:11px;font-weight:700;background:rgba(251,191,36,.12);color:#fbbf24;margin-left:8px}
.topbar-mid{flex:1;display:flex;align-items:center;justify-content:center;gap:0}
.vp-group{display:flex;background:#0d1117;border:1px solid rgba(255,255,255,.1);border-radius:6px;overflow:hidden}
.vp-btn{padding:5px 10px;border:none;background:none;color:#64748b;font-size:11px;font-weight:600;cursor:pointer;transition:all .1s;display:flex;align-items:center;gap:4px}
.vp-btn.active{background:#1f2937;color:#e2e8f0}
.vp-btn svg{width:13px;height:13px;flex-shrink:0}
.topbar-right{display:flex;align-items:center;gap:8px;margin-left:auto;padding-right:2px}
.btn{height:30px;padding:0 12px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:#1f2937;
  color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;transition:background .12s}
.btn:hover{background:#374151}
.btn.pub{background:#2563eb;border-color:#2563eb;color:#fff}
.btn.pub:hover{background:#1d4ed8}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-sm{height:26px;padding:0 10px;font-size:11px;border-radius:5px}

/* ── ICON RAIL (leftmost column) ── */
.icon-rail{grid-column:1;grid-row:2;background:#161b22;border-right:1px solid rgba(255,255,255,.06);
  display:flex;flex-direction:column;align-items:center;padding:8px 0;gap:2px;overflow:hidden}
.rail-btn{width:36px;height:36px;border-radius:8px;border:none;background:none;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  color:#475569;transition:all .14s;position:relative}
.rail-btn:hover{background:rgba(255,255,255,.06);color:#94a3b8}
.rail-btn.active{background:rgba(37,99,235,.18);color:#60a5fa}
.rail-btn svg{width:18px;height:18px;flex-shrink:0}
.rail-btn .rail-label{font-size:8px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;line-height:1}
.rail-spacer{flex:1}
.rail-divider{width:24px;height:1px;background:rgba(255,255,255,.06);margin:4px 0}

/* ── SIDEBAR ── */
.sidebar{grid-column:2;grid-row:2;background:#161b22;border-right:1px solid rgba(255,255,255,.06);
  display:flex;flex-direction:column;overflow:hidden}

/* sidebar header with page selector */
.sb-head{padding:0;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0}
.sb-page-selector{width:100%;padding:10px 12px 8px}
.sb-page-label{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}
.sb-page-select{width:100%;height:30px;background:#0d1117;border:1px solid rgba(255,255,255,.1);border-radius:6px;
  color:#e2e8f0;font-size:12px;padding:0 8px;cursor:pointer;outline:none}
.sb-page-select:focus{border-color:rgba(96,165,250,.5)}

/* group label */
.sb-group{padding:8px 12px 4px;font-size:10px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.08em}

/* section row */
.sec-list{flex:1;overflow-y:auto;padding-bottom:8px}
.sec-row{display:flex;align-items:center;gap:7px;padding:5px 8px 5px 10px;cursor:pointer;
  position:relative;transition:background .1s;border-left:2px solid transparent;user-select:none}
.sec-row:hover{background:rgba(255,255,255,.04)}
.sec-row.active{background:rgba(37,99,235,.1);border-left-color:#2563eb}
.sec-row.hidden{opacity:.4}
.drag-grip{color:#1e293b;cursor:grab;flex-shrink:0;font-size:14px;line-height:1;padding:0 2px}
.drag-grip:hover{color:#475569}
.sec-icon{width:20px;height:20px;border-radius:4px;display:flex;align-items:center;justify-content:center;
  font-size:9px;font-weight:900;flex-shrink:0;background:rgba(255,255,255,.05)}
.sec-info{flex:1;min-width:0}
.sec-name{font-size:12px;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.3}
.sec-type{font-size:10px;color:#475569;line-height:1.2}
.eye-btn{width:20px;height:20px;border:none;background:none;cursor:pointer;color:#374151;
  display:flex;align-items:center;justify-content:center;border-radius:3px;flex-shrink:0;font-size:12px;padding:0}
.eye-btn:hover{color:#94a3b8;background:rgba(255,255,255,.07)}

/* add section */
.add-sec-btn{display:flex;align-items:center;gap:8px;padding:8px 12px;margin:4px 8px;border-radius:7px;
  border:1px dashed rgba(255,255,255,.1);background:none;color:#475569;cursor:pointer;font-size:12px;transition:all .12s}
.add-sec-btn:hover{border-color:rgba(255,255,255,.2);color:#94a3b8}

/* ── CANVAS ── */
.canvas{grid-column:3;grid-row:2;background:#0a0a0f;display:flex;flex-direction:column;overflow:hidden;position:relative}
.canvas-bar{height:36px;background:#161b22;border-bottom:1px solid rgba(255,255,255,.06);
  display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0}
.canvas-dots{display:flex;gap:5px}
.canvas-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.1)}
.canvas-url{flex:1;font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
.canvas-url a{color:#475569;text-decoration:none}
.canvas-url a:hover{color:#94a3b8}
.canvas-stage{flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:16px}
.frame-shell{background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,.7);
  transition:width .25s ease;flex-shrink:0;position:relative}
.frame-highlight{position:absolute;inset:0;pointer-events:none;border:2px solid #2563eb;z-index:10;border-radius:6px;
  opacity:0;transition:opacity .2s}
.frame-highlight.show{opacity:1}
.site-iframe{width:100%;border:none;display:block;background:#fff}
.canvas-empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:14px;color:#374151;text-align:center}
.ces-icon{font-size:36px;opacity:.3}
.ces-text{font-size:13px}

/* ── RIGHT PANEL ── */
.rpanel{grid-column:4;grid-row:2;background:#161b22;border-left:1px solid rgba(255,255,255,.06);
  display:flex;flex-direction:column;overflow:hidden}
.rp-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0}
.rp-tab{flex:1;padding:10px 6px;font-size:11px;font-weight:700;color:#475569;border:none;background:none;
  cursor:pointer;border-bottom:2px solid transparent;letter-spacing:.03em;text-transform:uppercase;transition:all .1s}
.rp-tab.active{color:#e2e8f0;border-bottom-color:#2563eb}
.rp-body{flex:1;overflow-y:auto;padding:14px}
.rp-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;color:#374151;text-align:center;padding:30px 16px;height:180px}
.rp-empty-icon{font-size:22px;opacity:.35}

/* ── FIELDS ── */
.field{margin-bottom:14px}
.field-label{display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}
.field input,.field textarea,.field select{width:100%;background:#0d1117;border:1px solid rgba(255,255,255,.1);
  border-radius:6px;color:#e2e8f0;padding:7px 10px;outline:none;line-height:1.45}
.field input:focus,.field textarea:focus{border-color:rgba(96,165,250,.4)}
.field textarea{resize:vertical;min-height:62px}
.sec-meta-head{padding-bottom:12px;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,.06)}
.sec-meta-name{font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:2px}
.sec-meta-type{font-size:11px;color:#475569}
.type-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:4px;
  font-size:10px;font-weight:700;background:rgba(255,255,255,.06);color:#64748b}

.vis-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding:8px 10px;
  background:rgba(255,255,255,.03);border-radius:6px;border:1px solid rgba(255,255,255,.06)}
.vis-label{font-size:12px;color:#94a3b8}
.toggle{width:32px;height:18px;border-radius:9px;background:#1e293b;border:1px solid rgba(255,255,255,.1);
  position:relative;cursor:pointer;transition:background .18s;flex-shrink:0}
.toggle.on{background:#2563eb;border-color:#2563eb}
.toggle::after{content:'';position:absolute;left:2px;top:2px;width:12px;height:12px;
  border-radius:50%;background:#fff;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.toggle.on::after{left:16px}

.divider{height:1px;background:rgba(255,255,255,.06);margin:14px 0}
.btn-row{display:flex;gap:7px}
.btn-save{background:#2563eb;border-color:#2563eb;color:#fff;flex:1;justify-content:center}
.btn-save:hover{background:#1d4ed8}
.btn-save:disabled{opacity:.4}
.btn-del{color:#f87171;border-color:rgba(248,113,113,.2);background:rgba(248,113,113,.06);width:100%;justify-content:center;margin-top:6px}
.btn-del:hover{background:rgba(248,113,113,.12)}
.btn-revert{color:#94a3b8}

/* bullets */
.bullet-row{display:flex;gap:5px;margin-bottom:5px}
.bullet-row input{flex:1}
.bullet-del{width:26px;height:32px;border:1px solid rgba(248,113,113,.2);border-radius:5px;
  background:rgba(248,113,113,.06);color:#f87171;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
.add-bullet{width:100%;padding:5px;border:1px dashed rgba(255,255,255,.08);border-radius:5px;
  background:none;color:#475569;cursor:pointer;font-size:11px;transition:all .1s;margin-top:4px}
.add-bullet:hover{border-color:rgba(255,255,255,.18);color:#94a3b8}

/* HTML inject */
.inject-code{background:#0d1117;border:1px solid rgba(255,255,255,.1);border-radius:7px;overflow:hidden;margin-bottom:10px}
.inject-code textarea{width:100%;min-height:200px;background:none;border:none;padding:10px;
  font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;line-height:1.65;color:#67e8f9;resize:vertical;outline:none}
.inject-footer{display:flex;justify-content:space-between;padding:5px 9px;background:rgba(255,255,255,.03);
  border-top:1px solid rgba(255,255,255,.06);font-size:10px;color:#374151}
.preview-notice{padding:8px 10px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.2);
  border-radius:6px;font-size:11px;color:#93c5fd;margin-bottom:10px}

/* page meta */
.meta-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;
  border-bottom:1px solid rgba(255,255,255,.05)}
.meta-key{font-size:11px;color:#475569}
.meta-val{font-size:11px;color:#94a3b8;font-family:monospace;text-align:right;max-width:160px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.status-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
.status-published{background:rgba(34,197,94,.12);color:#4ade80}
.status-draft{background:rgba(251,191,36,.1);color:#fbbf24}
.status-archived{background:rgba(255,255,255,.05);color:#64748b}
.live-link{color:#60a5fa;font-size:12px;text-decoration:none;display:block;margin-top:4px}
.live-link:hover{text-decoration:underline}

/* theme settings panel */
.theme-section{margin-bottom:16px}
.theme-section-head{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;
  margin-bottom:8px;display:flex;align-items:center;gap:6px}
.theme-section-head::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.06)}
.color-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px}
.color-swatch{width:100%;aspect-ratio:1;border-radius:5px;border:2px solid transparent;cursor:pointer;transition:transform .1s}
.color-swatch:hover{transform:scale(1.1)}
.color-swatch.active{border-color:#fff}

/* activity log */
.act-item{display:flex;gap:9px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.act-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:4px}
.act-dot.edit{background:#3b82f6}
.act-dot.pub{background:#22c55e}
.act-dot.default{background:#374151}
.act-text{font-size:11px;color:#64748b;line-height:1.45}
.act-time{font-size:10px;color:#374151;margin-top:2px}

/* toast */
.cms-toast{position:fixed;bottom:18px;right:18px;background:#1e293b;border:1px solid rgba(255,255,255,.12);
  border-radius:8px;padding:10px 14px;font-size:12px;color:#e2e8f0;opacity:0;transform:translateY(6px);
  transition:all .2s;pointer-events:none;z-index:9999;max-width:260px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
.cms-toast.show{opacity:1;transform:translateY(0)}
.cms-toast.err{border-color:rgba(248,113,113,.3);color:#fca5a5}
.cms-toast.ok{border-color:rgba(34,197,94,.25);color:#86efac}

/* scrollbar */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:2px}

/* spin */
@keyframes spin{to{transform:rotate(360deg)}}
.spin{display:inline-block;animation:spin .7s linear infinite;margin-right:4px}

/* highlight pulse on section click */
@keyframes pulse-border{0%,100%{opacity:1}50%{opacity:.5}}
`;

const THEME_STUDIO_STYLES = `
html,body,#app{background:#F9F7F2;color:#1a1a1a}
.shell.theme-studio{display:grid;grid-template-columns:280px 1fr 340px;grid-template-rows:52px 1fr;height:100vh;font-family:Inter,-apple-system,sans-serif;font-size:13px;color:#1a1a1a}
.shell.theme-studio .icon-rail{display:none}
.shell.theme-studio .sidebar{grid-column:1;grid-row:2;background:#fff;border-right:1px solid #e8e4dc}
.shell.theme-studio .canvas{grid-column:2;grid-row:2;background:#F9F7F2}
.shell.theme-studio .rpanel{grid-column:3;grid-row:2;background:#fff;border-left:1px solid #e8e4dc}
.shell.theme-studio .topbar{grid-column:1/-1;height:64px;background:rgba(251,248,241,.96);border-bottom:1px solid rgba(43,39,31,.12);padding:0 18px;gap:18px;backdrop-filter:blur(18px);box-shadow:0 1px 0 rgba(255,255,255,.72) inset}
.ts-brand{display:flex;align-items:center;gap:10px;min-width:0;flex-shrink:0}
.ts-logo{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#0d9488,#115e59);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;letter-spacing:-.04em}
.ts-brand-name{font-size:14px;font-weight:700;color:#111;white-space:nowrap}
.ts-nav-icons{display:flex;align-items:center;gap:4px;margin-left:4px}
.ts-icon-btn{width:32px;height:32px;border:none;background:transparent;border-radius:8px;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s,color .12s}
.ts-icon-btn:hover{background:#f1ede6;color:#334155}
.ts-icon-btn svg{width:16px;height:16px}
.ts-page-select{height:34px;min-width:180px;border:1px solid #e8e4dc;border-radius:8px;background:#fff;color:#111;padding:0 32px 0 12px;font-size:13px;font-weight:600;cursor:pointer;outline:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}
.ts-page-select:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.12)}
.ts-topbar-center{flex:1;display:flex;align-items:center;justify-content:center;min-width:0}
.ts-topbar-right{display:flex;align-items:center;gap:8px;margin-left:auto;flex-shrink:0}
.shell.theme-studio .vp-group{background:#f5f2eb;border:1px solid #e8e4dc;border-radius:8px}
.shell.theme-studio .vp-btn{color:#64748b;padding:6px 12px;font-size:12px}
.shell.theme-studio .vp-btn.active{background:#fff;color:#111;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.shell.theme-studio .btn{height:34px;background:#fff;border:1px solid #e8e4dc;color:#334155;border-radius:8px;font-weight:600}
.shell.theme-studio .btn:hover{background:#faf8f4}
.shell.theme-studio .btn.pub,.shell.theme-studio .btn-save{background:#0d9488;border-color:#0d9488;color:#fff}
.shell.theme-studio .btn.pub:hover,.shell.theme-studio .btn-save:hover{background:#0f766e}
.ts-sections-head{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px;border-bottom:1px solid #f0ebe3;flex-shrink:0}
.ts-sections-title{font-size:13px;font-weight:700;color:#111}
.ts-sections-actions{display:flex;gap:4px}
.ts-search-wrap{padding:10px 12px 6px;flex-shrink:0}
.ts-search{width:100%;height:34px;border:1px solid #e8e4dc;border-radius:8px;background:#faf8f4;padding:0 10px 0 32px;font-size:12px;color:#111;outline:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='M21 21l-4.35-4.35'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:10px center}
.ts-search:focus{border-color:#0d9488;background-color:#fff}
.shell.theme-studio .sec-list{padding:6px 8px 12px}
.shell.theme-studio .sec-row{border-left:none;border-radius:10px;padding:8px 10px;margin-bottom:2px;border:1px solid transparent}
.shell.theme-studio .sec-row:hover{background:#faf8f4}
.shell.theme-studio .sec-row.active{background:#eff6ff;border-color:#3b82f6;box-shadow:0 0 0 1px rgba(59,130,246,.15)}
.shell.theme-studio .sec-row.active .sec-name{color:#1e40af;font-weight:600}
.shell.theme-studio .sec-name{color:#111;font-size:13px}
.shell.theme-studio .sec-type{color:#64748b;font-size:11px}
.shell.theme-studio .drag-grip{color:#cbd5e1}
.shell.theme-studio .sec-icon{background:#f5f2eb;border:1px solid #ebe6de}
.shell.theme-studio .eye-btn{color:#94a3b8}
.shell.theme-studio .add-sec-btn{margin:4px 12px 12px;border-color:#d6d0c4;color:#64748b;background:#faf8f4;border-radius:10px}
.shell.theme-studio .add-sec-btn:hover{border-color:#0d9488;color:#0d9488;background:#f0fdfa}
.ts-sections-hint{padding:0 14px 12px;font-size:11px;color:#94a3b8}
.shell.theme-studio .canvas-bar{display:none}
.shell.theme-studio .canvas-stage{padding:24px;background:#F9F7F2;align-items:flex-start}
.shell.theme-studio .frame-shell{border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08),0 1px 3px rgba(0,0,0,.04);border:1px solid #e8e4dc;height:calc(100vh - 52px - 48px)!important;max-height:none}
.shell.theme-studio .frame-highlight{border:2px solid #3b82f6;border-radius:12px;opacity:0}
.shell.theme-studio .frame-highlight.show{opacity:1}
.ts-frame-label{position:absolute;top:-1px;left:12px;transform:translateY(-50%);background:#3b82f6;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;z-index:12;pointer-events:none}
.ts-frame-actions{position:absolute;top:12px;right:12px;display:flex;gap:6px;z-index:12}
.ts-frame-act{width:32px;height:32px;border-radius:8px;border:1px solid #e8e4dc;background:#fff;color:#475569;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.ts-frame-act:hover{background:#f8fafc;color:#111}
.ts-frame-act.danger{color:#dc2626;border-color:#fecaca}
.shell.theme-studio .rp-tabs{border-bottom:1px solid #f0ebe3;background:#fff}
.shell.theme-studio .rp-tab{color:#64748b;font-size:12px;font-weight:600;text-transform:none;letter-spacing:0;padding:12px 8px}
.shell.theme-studio .rp-tab.active{color:#111;border-bottom-color:#0d9488}
.shell.theme-studio .rp-body{padding:16px}
.shell.theme-studio .field-label{color:#64748b;font-size:11px;font-weight:600;text-transform:none;letter-spacing:0;margin-bottom:6px}
.shell.theme-studio .field input,.shell.theme-studio .field textarea,.shell.theme-studio .field select{background:#fff;border:1px solid #e8e4dc;border-radius:8px;color:#111;padding:9px 11px}
.shell.theme-studio .field input:focus,.shell.theme-studio .field textarea:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.1)}
.shell.theme-studio .sec-meta-head{border-bottom-color:#f0ebe3;padding-bottom:14px;margin-bottom:16px}
.shell.theme-studio .sec-meta-name{font-size:15px;font-weight:700;color:#111}
.shell.theme-studio .sec-meta-type{color:#64748b}
.shell.theme-studio .type-chip{background:#f5f2eb;color:#64748b;border:1px solid #ebe6de}
.ts-panel-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #f0ebe3}
.ts-panel-icon{width:36px;height:36px;border-radius:10px;background:#f5f2eb;border:1px solid #ebe6de;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#0d9488;flex-shrink:0}
.ts-panel-title{font-size:14px;font-weight:700;color:#111;line-height:1.2}
.ts-panel-sub{font-size:12px;color:#64748b;margin-top:2px}
.ts-field-row{display:flex;gap:8px;align-items:flex-start}
.ts-field-row .field{flex:1;margin-bottom:14px}
.ts-color-swatch{width:36px;height:36px;border-radius:8px;border:1px solid #e8e4dc;cursor:pointer;flex-shrink:0;padding:0;background:#fff;overflow:hidden}
.ts-color-swatch input{width:150%;height:150%;border:none;padding:0;margin:-25%;cursor:pointer}
.ts-richbar{display:flex;align-items:center;gap:4px;padding:6px 8px;border:1px solid #e8e4dc;border-bottom:none;border-radius:8px 8px 0 0;background:#faf8f4}
.ts-richbtn{width:28px;height:28px;border:none;background:transparent;border-radius:6px;color:#64748b;cursor:pointer;font-size:12px;font-weight:700}
.ts-richbtn:hover{background:#f1ede6;color:#111}
.ts-richarea{border-radius:0 0 8px 8px;border-top:none;min-height:88px;width:100%;background:#fff;border:1px solid #e8e4dc;color:#111;padding:9px 11px;resize:vertical;outline:none;line-height:1.45}
.ts-richarea:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.1)}
.ts-layout-block{margin-top:8px;padding-top:16px;border-top:1px solid #f0ebe3}
.ts-layout-label{font-size:12px;font-weight:700;color:#111;margin-bottom:10px}
.ts-align-row{display:flex;gap:6px}
.ts-align-btn{width:36px;height:36px;border:1px solid #e8e4dc;border-radius:8px;background:#fff;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center}
.ts-align-btn.active{background:#eff6ff;border-color:#3b82f6;color:#1d4ed8}
.shell.theme-studio .vis-row{background:#faf8f4;border-color:#ebe6de}
.shell.theme-studio .vis-label{color:#475569}
.shell.theme-studio .toggle{background:#e2e8f0;border-color:#cbd5e1}
.shell.theme-studio .toggle.on{background:#0d9488;border-color:#0d9488}
.shell.theme-studio .rp-empty{color:#94a3b8}
.shell.theme-studio .cms-toast{background:#111;border-color:#333;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.15)}
.shell.theme-studio ::-webkit-scrollbar-thumb{background:rgba(0,0,0,.12)}
`;

const SECTION_BLURBS = {
  header: 'Site navigation',
  hero: 'Intro section',
  services: 'Services grid',
  work: 'Selected work',
  portfolio_gallery: 'Portfolio showcase',
  journal: 'Blog / journal',
  about: 'About block',
  footer: 'Site footer',
  faq: 'Questions',
  cta: 'Call to action',
  overview: 'Overview',
  statement: 'Statement',
  contact_path: 'Contact',
  service: 'Service detail',
  closing: 'Closing section',
  custom: 'Custom section',
};

function injectStyles(themeStudio) {
  const id = 'cms-editor-v2';
  let s = document.getElementById(id);
  if (!s) {
    s = document.createElement('style');
    s.id = id;
    document.head.appendChild(s);
  }
  s.textContent = STYLES + (themeStudio ? THEME_STUDIO_STYLES : '');
}

/* ══════════════════════════════════════════════════════════════
   SVG ICONS
══════════════════════════════════════════════════════════════ */
const I = {
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  sections: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  theme: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  desktop: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  tablet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>,
  mobile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>,
  eye: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  link: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  pencil: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>,
  more: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>,
};

/* ══════════════════════════════════════════════════════════════
   ROOT COMPONENT
══════════════════════════════════════════════════════════════ */
function CmsEditor() {
  const ctx = readCtx();
  const isThemeStudio = ctx.view === 'themeEditor';
  injectStyles(isThemeStudio);

  /* ── state ── */
  const [bootstrap, setBootstrap]   = useState(null);
  const [booting, setBooting]       = useState(false);
  const [pages, setPages]           = useState([]);
  const [activePage, setActivePage] = useState(null);
  const [sections, setSections]     = useState([]);
  const [activeSection, setActiveSection] = useState(null);

  // Rail: which side-panel mode
  const [railMode, setRailMode] = useState('sections'); // sections | theme

  // Right panel tab
  const [rpTab, setRpTab] = useState('edit'); // edit | html | page

  // Viewport
  const [vp, setVp] = useState('desktop');

  // Dirty fields for section editing
  const [dirty, setDirty]     = useState({});
  const [saving, setSaving]   = useState(false);
  const [publishing, setPub]  = useState(false);

  // HTML inject
  const [htmlCode, setHtmlCode]   = useState('');
  const [htmlName, setHtmlName]   = useState('');
  const [htmlType, setHtmlType]   = useState('custom');
  const [htmlPos, setHtmlPos]     = useState('end');
  const [previewing, setPrev]     = useState(false);
  const [draftPreview, setDraftPreview] = useState(false);
  const [sectionQuery, setSectionQuery] = useState('');

  const iframeRef = useRef(null);

  /* ── bootstrap ── */
  useEffect(() => {
    if (!ctx.project) return;
    setBooting(true);
    api(`/api/cms/bootstrap?project_slug=${encodeURIComponent(ctx.project)}`)
      .then(data => {
        setBootstrap(data);
        const pg = data.pages || [];
        setPages(pg);
        const first = ctx.pageId
          ? pg.find(p => p.id === ctx.pageId)
          : pg.find(p => p.is_homepage) || pg[0];
        if (first) loadPage(first, data);
        if (ctx.view === 'themeEditor') {
          setRailMode('sections');
          setRpTab('edit');
        }
      })
      .catch(e => showToast('Failed to load: ' + e.message, 'err'))
      .finally(() => setBooting(false));
  }, []);

  function loadPage(page, boot = bootstrap) {
    setActivePage(page);
    setActiveSection(null);
    setDirty({});
    setPrev(false);
    setDraftPreview(false);
    const secs = ((boot?.sections_by_page || {})[page.id] || [])
      .slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    setSections(secs);
    const frame = iframeRef.current;
    if (frame) {
      frame.removeAttribute('srcdoc');
      const url = pageToUrl(page, boot);
      if (url) frame.src = url;
    }
    const ctx = readCtx();
    if (page?.id && ctx.project) {
      postParent('iam-cms-navigate', {
        path: `/dashboard/cms/pages/${encodeURIComponent(page.id)}?site=${encodeURIComponent(ctx.project)}`,
        replace: true,
      });
    }
  }

  async function refreshDraftPreview(page = activePage) {
    if (!page) return;
    const frame = iframeRef.current;
    if (!frame) return;
    try {
      const data = await api(
        `/api/cms/pages/${encodeURIComponent(page.id)}?draft=1&project_slug=${encodeURIComponent(ctx.project)}`,
      );
      if (data.preview_html) {
        frame.removeAttribute('src');
        frame.srcdoc = data.preview_html;
        setDraftPreview(true);
        setPrev(false);
        return;
      }
      if (data.content_url) {
        frame.removeAttribute('srcdoc');
        frame.src = data.content_url;
        setDraftPreview(true);
        setPrev(false);
      }
    } catch (e) {
      showToast('Draft preview failed: ' + e.message, 'err');
    }
  }

  function showLiveSite(page = activePage) {
    const frame = iframeRef.current;
    if (!frame || !page) return;
    frame.removeAttribute('srcdoc');
    setDraftPreview(false);
    setPrev(false);
    const url = pageToUrl(page);
    if (url) frame.src = url;
  }

  /* ── drag reorder ── */
  const dragH = useDrag(sections, async next => {
    setSections(next);
    const order = next.map((s, i) => ({ id: s.id, sort_order: (i + 1) * 10 }));
    try {
      await api('/api/cms/sections/reorder', { method: 'POST', body: { page_id: activePage?.id, order } });
      showToast('Order saved');
    } catch (e) { showToast('Reorder failed', 'err'); }
  });

  /* ── visibility toggle ── */
  async function toggleVis(sec) {
    const updated = { ...sec, is_visible: sec.is_visible ? 0 : 1 };
    setSections(prev => prev.map(s => s.id === sec.id ? updated : s));
    if (activeSection?.id === sec.id) setActiveSection(updated);
    try {
      await api(`/api/cms/sections/${encodeURIComponent(sec.id)}/visibility`, {
        method: 'POST', body: { is_visible: updated.is_visible ? 1 : 0 },
      });
      showToast(updated.is_visible ? 'Section visible' : 'Section hidden');
      await refreshDraftPreview();
    } catch (_) { showToast('Failed', 'err'); }
  }

  /* ── save section ── */
  async function saveSection() {
    if (!activeSection || !Object.keys(dirty).length) return;
    setSaving(true);
    try {
      const base = secData(activeSection);
      const merged = { ...base, ...dirty };
      await api(`/api/cms/sections/${encodeURIComponent(activeSection.id)}`, {
        method: 'PUT', body: { section_data: merged },
      });
      const upd = { ...activeSection, section_data: merged };
      setActiveSection(upd);
      setSections(prev => prev.map(s => s.id === activeSection.id ? upd : s));
      setDirty({});
      showToast('Saved · ' + activeSection.section_name, 'ok');
      await refreshDraftPreview();
    } catch (e) { showToast('Save failed: ' + e.message, 'err'); }
    finally { setSaving(false); }
  }

  /* ── publish ── */
  async function publishPage() {
    if (!activePage) return;
    setPub(true);
    try {
      await api(`/api/cms/pages/${encodeURIComponent(activePage.id)}/publish`, { method: 'POST' });
      showToast('Published · ' + activePage.title, 'ok');
      showLiveSite(activePage);
      const data = await api(`/api/cms/bootstrap?project_slug=${encodeURIComponent(ctx.project)}`);
      setBootstrap(data);
      setPages(data.pages || []);
    } catch (e) { showToast('Publish failed: ' + e.message, 'err'); }
    finally { setPub(false); }
  }

  /* ── HTML inject preview ── */
  function previewHtml() {
    if (!htmlCode.trim()) { showToast('Paste HTML first', 'err'); return; }
    const frame = iframeRef.current;
    if (!frame) return;
    frame.removeAttribute('src');
    frame.srcdoc = htmlCode;
    setPrev(true);
    showToast('Preview loaded — check all 3 viewports');
  }

  function clearPreview() {
    setPrev(false);
    showLiveSite(activePage);
  }

  async function publishHtmlSection() {
    if (!htmlCode.trim() || !htmlName.trim()) { showToast('Name + HTML required', 'err'); return; }
    if (!activePage) { showToast('Select a page first', 'err'); return; }
    setSaving(true);
    try {
      const r2 = await api('/api/cms/sections/upload-html', {
        method: 'POST',
        body: { page_id: activePage.id, section_name: htmlName, section_type: htmlType, html: htmlCode, project_slug: ctx.project },
      });
      const sec = await api('/api/cms/sections', {
        method: 'POST',
        body: {
          page_id: activePage.id, section_type: htmlType, section_name: htmlName,
          sort_order: htmlPos === 'end' ? (sections.length + 1) * 10 : 5,
          is_visible: 1,
          section_data: { r2_key: r2.r2_key, public_url: r2.public_url, html_source: 'injected' },
        },
      });
      setSections(prev => htmlPos === 'end' ? [...prev, sec] : [sec, ...prev]);
      setHtmlCode(''); setHtmlName('');
      clearPreview();
      showToast('Section published → R2 + D1', 'ok');
    } catch (e) { showToast('Publish failed: ' + e.message, 'err'); }
    finally { setSaving(false); }
  }

  /* ── helpers ── */
  function secData(sec) {
    if (!sec) return {};
    const d = sec.section_data;
    if (typeof d === 'string') { try { return JSON.parse(d); } catch { return {}; } }
    return d || {};
  }

  const liveUrl = activePage ? pageToUrl(activePage) : null;
  const vpDef = VIEWPORTS.find(v => v.id === vp) || VIEWPORTS[0];
  const brandName = bootstrap?.tenant?.name || bootstrap?.project_name || 'Inner Animal';
  const brandInitials = brandName.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'IA';
  const sectionQueryNorm = sectionQuery.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!sectionQueryNorm) return sections;
    return sections.filter(sec =>
      String(sec.section_name || '').toLowerCase().includes(sectionQueryNorm) ||
      String(sec.section_type || '').toLowerCase().includes(sectionQueryNorm),
    );
  }, [sections, sectionQueryNorm]);
  const themeViewports = isThemeStudio ? VIEWPORTS.filter(v => v.id === 'desktop' || v.id === 'mobile') : VIEWPORTS;

  /* ── iframe src effect ── */
  useEffect(() => {
    if (previewing || draftPreview) return;
    const frame = iframeRef.current;
    if (!frame || !liveUrl) return;
    frame.src = liveUrl;
  }, [liveUrl, previewing, draftPreview]);

  /* ── RENDER ── */
  return (
    <>
      <div id="cms-toast" className="cms-toast" />

      <div className={`shell${isThemeStudio ? ' theme-studio' : ''}`}>

        {/* ═══ TOPBAR ═══ */}
        {isThemeStudio ? (
          <div className="topbar">
            <div className="ts-brand">
              <div className="ts-logo">{brandInitials}</div>
              <span className="ts-brand-name">{brandName}</span>
              <div className="ts-nav-icons">
                <button type="button" className="ts-icon-btn" title="Back to CMS" onClick={() => postParent('iam-cms-navigate', { path: `/dashboard/cms/pages?site=${encodeURIComponent(ctx.project)}` })}>
                  {I.back}
                </button>
                <button type="button" className="ts-icon-btn" title="All pages" onClick={() => postParent('iam-cms-navigate', { path: `/dashboard/cms/pages?site=${encodeURIComponent(ctx.project)}` })}>
                  {I.grid}
                </button>
                <button type="button" className="ts-icon-btn" title="Theme settings" onClick={() => setRpTab('design')}>
                  {I.settings}
                </button>
              </div>
            </div>

            <div className="ts-topbar-center">
              <select
                className="ts-page-select"
                value={activePage?.id || ''}
                onChange={e => {
                  const p = pages.find(pg => pg.id === e.target.value);
                  if (p) loadPage(p);
                }}
              >
                {!activePage && <option value="">Choose page…</option>}
                {pages.map(p => (
                  <option key={p.id} value={p.id}>{p.title || p.slug || 'Untitled page'}</option>
                ))}
              </select>
            </div>

            <div className="ts-topbar-right">
              <div className="vp-group">
                {themeViewports.map(v => (
                  <button key={v.id} type="button" className={`vp-btn ${vp === v.id ? 'active' : ''}`} onClick={() => setVp(v.id)} title={v.label}>
                    {v.id === 'desktop' ? I.desktop : I.mobile}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-sm ts-icon-btn" title="Preview" onClick={() => (draftPreview ? showLiveSite(activePage) : refreshDraftPreview())}>
                {I.eye}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={saveSection}
                disabled={saving || !activeSection || !Object.keys(dirty).length}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-sm pub"
                onClick={publishPage}
                disabled={!activePage || publishing}
              >
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </div>
        ) : (
        <div className="topbar">
          {/* left: page title + draft badge */}
          <div style={{ width: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
          <div style={{ width: 240, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, borderRight: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
            <span className="topbar-page-label">{activePage?.title || 'CMS Studio'}</span>
            {activePage && <span className="topbar-draft">{draftPreview ? 'Draft preview' : 'Editing'}</span>}
          </div>

          {/* center: viewport toggle */}
          <div className="topbar-mid">
            <div className="vp-group">
              {VIEWPORTS.map(v => (
                <button key={v.id} className={`vp-btn ${vp === v.id ? 'active' : ''}`} onClick={() => setVp(v.id)}>
                  {v.id === 'desktop' ? I.desktop : v.id === 'tablet' ? I.tablet : I.mobile}
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* right: actions */}
          <div className="topbar-right">
            {previewing && (
              <button className="btn btn-sm" onClick={clearPreview}>← Live site</button>
            )}
            {!previewing && activePage && (
              draftPreview ? (
                <button className="btn btn-sm" onClick={() => showLiveSite(activePage)}>View live</button>
              ) : (
                <button className="btn btn-sm" onClick={() => refreshDraftPreview()}>Draft preview</button>
              )
            )}
            {liveUrl && (
              <a className="btn btn-sm" href={liveUrl} target="_blank" rel="noopener noreferrer">Open site</a>
            )}
            <button className="btn btn-sm" onClick={() => { setRpTab('html'); }}>+ HTML</button>
            <button
              className="btn btn-sm pub"
              onClick={publishPage}
              disabled={!activePage || publishing}
            >
              {publishing && <span className="spin">⟳</span>}
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>
        )}

        {/* ═══ ICON RAIL ═══ */}
        {!isThemeStudio && (
        <div className="icon-rail">
          {/* Back to dashboard */}
          <button
            className="rail-btn"
            title="Back to dashboard"
            onClick={() => postParent('iam-cms-navigate', { path: '/dashboard/cms' })}
          >
            {I.back}
            <span className="rail-label">Back</span>
          </button>

          <div className="rail-divider" />

          {/* Sections */}
          <button
            className={`rail-btn ${railMode === 'sections' ? 'active' : ''}`}
            title="Sections"
            onClick={() => setRailMode('sections')}
          >
            {I.sections}
            <span className="rail-label">Sections</span>
          </button>

          {/* Theme */}
          <button
            className={`rail-btn ${railMode === 'theme' ? 'active' : ''}`}
            title="Theme settings"
            onClick={() => { setRailMode('theme'); setRpTab('theme'); }}
          >
            {I.theme}
            <span className="rail-label">Theme</span>
          </button>

          <div className="rail-spacer" />
        </div>
        )}

        {/* ═══ SIDEBAR ═══ */}
        <div className="sidebar">
          {isThemeStudio ? (
            <>
              <div className="ts-sections-head">
                <span className="ts-sections-title">Sections</span>
                <div className="ts-sections-actions">
                  <button type="button" className="ts-icon-btn" title="Search sections">{I.search}</button>
                  <button type="button" className="ts-icon-btn" title="Add section" onClick={() => setRpTab('advanced')}>{I.plus}</button>
                </div>
              </div>
              <div className="ts-search-wrap">
                <input
                  type="search"
                  className="ts-search"
                  placeholder="Search sections…"
                  value={sectionQuery}
                  onChange={e => setSectionQuery(e.target.value)}
                />
              </div>
              <div className="sec-list">
                {booting && (
                  <div style={{ padding: '16px 12px', color: '#94a3b8', fontSize: 12 }}>
                    <span className="spin">⟳</span> Loading…
                  </div>
                )}
                {visibleSections.map((sec, idx) => {
                  const realIdx = sections.findIndex(s => s.id === sec.id);
                  const color = SECTION_TYPE_COLORS[sec.section_type] || SECTION_TYPE_COLORS.default;
                  const isActive = activeSection?.id === sec.id;
                  const blurb = SECTION_BLURBS[sec.section_type] || sec.section_type || 'Section';
                  return (
                    <div
                      key={sec.id}
                      className={`sec-row ${isActive ? 'active' : ''} ${!sec.is_visible ? 'hidden' : ''}`}
                      onClick={() => { setActiveSection(sec); setRpTab('edit'); setDirty({}); }}
                      {...dragH(realIdx >= 0 ? realIdx : idx)}
                    >
                      <span className="drag-grip">⋮⋮</span>
                      <div className="sec-icon" style={{ color, background: color + '18' }}>
                        {(sec.section_type || 'S').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="sec-info">
                        <div className="sec-name">{sec.section_name}</div>
                        <div className="sec-type">{blurb}</div>
                      </div>
                      <button type="button" className="eye-btn" title="More" onClick={e => e.stopPropagation()}>
                        {I.more}
                      </button>
                    </div>
                  );
                })}
                {!visibleSections.length && !booting && (
                  <div style={{ padding: '14px 12px', color: '#94a3b8', fontSize: 12 }}>
                    {sectionQueryNorm ? 'No matching sections' : 'No sections yet'}
                  </div>
                )}
              </div>
              <button type="button" className="add-sec-btn" onClick={() => setRpTab('advanced')}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                Add section
              </button>
              <div className="ts-sections-hint">Drag sections to reorder.</div>
            </>
          ) : (
          <>
          <div className="sb-head">
            <div className="sb-page-selector">
              <div className="sb-page-label">Page</div>
              <select
                className="sb-page-select"
                value={activePage?.id || ''}
                onChange={e => {
                  const p = pages.find(pg => pg.id === e.target.value);
                  if (p) loadPage(p);
                }}
              >
                {!activePage && <option value="">Choose page…</option>}
                {pages.map(p => (
                  <option key={p.id} value={p.id}>{p.title || p.slug}</option>
                ))}
              </select>
            </div>
          </div>

          {railMode === 'sections' ? (
            <>
              {/* Header group */}
              {sections.length > 0 && <div className="sb-group">Template</div>}

              <div className="sec-list">
                {booting && (
                  <div style={{ padding: '16px 12px', color: '#374151', fontSize: 12 }}>
                    <span className="spin">⟳</span> Loading…
                  </div>
                )}
                {sections.map((sec, idx) => {
                  const color = SECTION_TYPE_COLORS[sec.section_type] || SECTION_TYPE_COLORS.default;
                  const isActive = activeSection?.id === sec.id;
                  return (
                    <div
                      key={sec.id}
                      className={`sec-row ${isActive ? 'active' : ''} ${!sec.is_visible ? 'hidden' : ''}`}
                      onClick={() => { setActiveSection(sec); setRpTab('edit'); setDirty({}); }}
                      {...dragH(idx)}
                    >
                      <span className="drag-grip">⋮⋮</span>
                      <div className="sec-icon" style={{ color, background: color + '18' }}>
                        {(sec.section_type || 'S').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="sec-info">
                        <div className="sec-name">{sec.section_name}</div>
                        <div className="sec-type">{sec.section_type}</div>
                      </div>
                      <button
                        className="eye-btn"
                        title={sec.is_visible ? 'Hide' : 'Show'}
                        onClick={e => { e.stopPropagation(); toggleVis(sec); }}
                      >
                        {sec.is_visible ? I.eye : I.eyeOff}
                      </button>
                    </div>
                  );
                })}
                {!sections.length && !booting && (
                  <div style={{ padding: '14px 12px', color: '#374151', fontSize: 12 }}>
                    No sections yet
                  </div>
                )}
              </div>

              <button className="add-sec-btn" onClick={() => setRpTab('html')}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                Add section
              </button>
            </>
          ) : (
            /* Theme mode: show theme settings tree */
            <div className="sec-list" style={{ padding: '8px 0' }}>
              <div className="sb-group">Global settings</div>
              {['Logo', 'Colors', 'Typography', 'Layout', 'Animations', 'Buttons', 'Inputs'].map(s => (
                <div
                  key={s}
                  className="sec-row"
                  onClick={() => { setRpTab('theme'); }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="sec-info" style={{ paddingLeft: 4 }}>
                    <div className="sec-name">{s}</div>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </div>

        {/* ═══ CANVAS ═══ */}
        <div className="canvas">
          <div className="canvas-bar">
            <div className="canvas-dots">
              <div className="canvas-dot" />
              <div className="canvas-dot" />
              <div className="canvas-dot" />
            </div>
            <div className="canvas-url">
              {previewing
                ? '⚡ HTML Preview'
                : liveUrl
                  ? <a href={liveUrl} target="_blank" rel="noopener noreferrer">{liveUrl} {I.link}</a>
                  : 'No page selected'}
            </div>
          </div>

          <div className="canvas-stage">
            {activePage || previewing ? (
              <div
                className="frame-shell"
                style={{
                  width: vpDef.w ? Math.min(vpDef.w, window.innerWidth - (isThemeStudio ? 640 : 600)) : '100%',
                  height: isThemeStudio ? undefined : 'calc(100vh - 44px - 36px - 32px)',
                  maxWidth: '100%',
                }}
              >
                <iframe
                  ref={iframeRef}
                  className="site-iframe"
                  title="CMS Preview"
                  style={{ height: '100%' }}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
                <div className={`frame-highlight ${activeSection ? 'show' : ''}`}>
                  {isThemeStudio && activeSection ? (
                    <>
                      <span className="ts-frame-label">{activeSection.section_name}</span>
                      <div className="ts-frame-actions">
                        <button type="button" className="ts-frame-act" title="Edit section" onClick={() => setRpTab('edit')}>{I.pencil}</button>
                        <button
                          type="button"
                          className="ts-frame-act danger"
                          title="Delete section"
                          onClick={async () => {
                            if (!confirm('Delete section?')) return;
                            try {
                              await api(`/api/cms/sections/${encodeURIComponent(activeSection.id)}`, { method: 'DELETE' });
                              setSections(prev => prev.filter(s => s.id !== activeSection.id));
                              setActiveSection(null);
                              showToast('Deleted');
                            } catch (e) { showToast('Delete failed', 'err'); }
                          }}
                        >
                          {I.trash}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="canvas-empty-state">
                <div className="ces-icon">◱</div>
                <div className="ces-text">Select a page to preview</div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT PANEL ═══ */}
        <div className="rpanel">
          <div className="rp-tabs">
            {isThemeStudio ? (
              <>
                <button type="button" className={`rp-tab ${rpTab === 'edit' ? 'active' : ''}`} onClick={() => setRpTab('edit')}>Content</button>
                <button type="button" className={`rp-tab ${rpTab === 'design' ? 'active' : ''}`} onClick={() => setRpTab('design')}>Design</button>
                <button type="button" className={`rp-tab ${rpTab === 'advanced' ? 'active' : ''}`} onClick={() => setRpTab('advanced')}>Advanced</button>
              </>
            ) : (
              <>
                <button className={`rp-tab ${rpTab === 'edit' ? 'active' : ''}`} onClick={() => setRpTab('edit')}>Edit</button>
                <button className={`rp-tab ${rpTab === 'html' ? 'active' : ''}`} onClick={() => setRpTab('html')}>HTML</button>
                <button className={`rp-tab ${rpTab === 'page' ? 'active' : ''}`} onClick={() => setRpTab('page')}>Page</button>
                <button className={`rp-tab ${rpTab === 'theme' ? 'active' : ''}`} onClick={() => setRpTab('theme')}>Theme</button>
              </>
            )}
          </div>

          <div className="rp-body">
            {rpTab === 'edit' && (
              isThemeStudio ? (
                <ThemeStudioContentPanel
                  section={activeSection}
                  data={{ ...secData(activeSection), ...dirty }}
                  onChange={(k, v) => setDirty(prev => ({ ...prev, [k]: v }))}
                  dirty={dirty}
                  onSave={saveSection}
                  saving={saving}
                  onRevert={() => setDirty({})}
                  onToggle={() => activeSection && toggleVis(activeSection)}
                />
              ) : (
              <EditPanel
                section={activeSection}
                data={{ ...secData(activeSection), ...dirty }}
                onChange={(k, v) => setDirty(prev => ({ ...prev, [k]: v }))}
                dirty={dirty}
                onSave={saveSection}
                saving={saving}
                onRevert={() => setDirty({})}
                onToggle={() => activeSection && toggleVis(activeSection)}
                onDelete={async () => {
                  if (!activeSection || !confirm('Delete section?')) return;
                  try {
                    await api(`/api/cms/sections/${encodeURIComponent(activeSection.id)}`, { method: 'DELETE' });
                    setSections(prev => prev.filter(s => s.id !== activeSection.id));
                    setActiveSection(null);
                    showToast('Deleted');
                  } catch (e) { showToast('Delete failed', 'err'); }
                }}
              />
              )
            )}
            {isThemeStudio && rpTab === 'design' && (
              <>
                <ThemeStudioDesignPanel
                  section={activeSection}
                  data={{ ...secData(activeSection), ...dirty }}
                  onChange={(k, v) => setDirty(prev => ({ ...prev, [k]: v }))}
                  onSave={saveSection}
                  saving={saving}
                  dirty={dirty}
                />
                <div className="divider" />
                <ThemePanel bootstrap={bootstrap} project={ctx.project} />
              </>
            )}
            {isThemeStudio && rpTab === 'advanced' && (
              <>
                <PagePanel page={activePage} sections={sections} url={liveUrl} />
                <div className="divider" />
                <HtmlPanel
                  code={htmlCode} setCode={setHtmlCode}
                  name={htmlName} setName={setHtmlName}
                  type={htmlType} setType={setHtmlType}
                  pos={htmlPos} setPos={setHtmlPos}
                  previewing={previewing}
                  onPreview={previewHtml}
                  onClearPreview={clearPreview}
                  onPublish={publishHtmlSection}
                  saving={saving}
                />
                {activeSection ? (
                  <>
                    <div className="divider" />
                    <button
                      type="button"
                      className="btn btn-del"
                      onClick={async () => {
                        if (!confirm('Delete section?')) return;
                        try {
                          await api(`/api/cms/sections/${encodeURIComponent(activeSection.id)}`, { method: 'DELETE' });
                          setSections(prev => prev.filter(s => s.id !== activeSection.id));
                          setActiveSection(null);
                          showToast('Deleted');
                        } catch (e) { showToast('Delete failed', 'err'); }
                      }}
                    >
                      Delete section
                    </button>
                  </>
                ) : null}
              </>
            )}
            {!isThemeStudio && rpTab === 'html' && (
              <HtmlPanel
                code={htmlCode} setCode={setHtmlCode}
                name={htmlName} setName={setHtmlName}
                type={htmlType} setType={setHtmlType}
                pos={htmlPos} setPos={setHtmlPos}
                previewing={previewing}
                onPreview={previewHtml}
                onClearPreview={clearPreview}
                onPublish={publishHtmlSection}
                saving={saving}
              />
            )}
            {!isThemeStudio && rpTab === 'page' && (
              <PagePanel page={activePage} sections={sections} url={liveUrl} />
            )}
            {!isThemeStudio && rpTab === 'theme' && (
              <ThemePanel bootstrap={bootstrap} project={ctx.project} />
            )}
          </div>
        </div>

      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   THEME STUDIO PANELS (light layout)
══════════════════════════════════════════════════════════════ */
function ThemeStudioPanelHead({ section }) {
  if (!section) return null;
  const blurb = SECTION_BLURBS[section.section_type] || section.section_type || 'Section';
  const initials = (section.section_type || 'S').slice(0, 2).toUpperCase();
  return (
    <div className="ts-panel-head">
      <div className="ts-panel-icon">{initials}</div>
      <div>
        <div className="ts-panel-title">{section.section_name}</div>
        <div className="ts-panel-sub">{blurb}</div>
      </div>
    </div>
  );
}

function ThemeField({ label, value, onChange, type = 'input', colorValue = null, onColorChange = null }) {
  const field = type === 'textarea' ? (
    <>
      <div className="ts-richbar">
        <button type="button" className="ts-richbtn">B</button>
        <button type="button" className="ts-richbtn"><em>I</em></button>
        <button type="button" className="ts-richbtn">Link</button>
      </div>
      <textarea className="ts-richarea" rows={3} value={value || ''} onChange={e => onChange(e.target.value)} />
    </>
  ) : (
    <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} />
  );
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {onColorChange ? (
        <div className="ts-field-row">
          <div style={{ flex: 1 }}>{field}</div>
          <label className="ts-color-swatch" title="Color">
            <input type="color" value={colorValue || '#111111'} onChange={e => onColorChange(e.target.value)} />
          </label>
        </div>
      ) : field}
    </div>
  );
}

function ThemeStudioContentPanel({ section, data, onChange, dirty, onSave, saving, onRevert, onToggle }) {
  if (!section) return (
    <div className="rp-empty">
      <div className="rp-empty-icon">✦</div>
      <div style={{ fontSize: 12 }}>Select a section to edit its content</div>
    </div>
  );

  const headingVal = data.heading ?? data.headline ?? data.title ?? '';
  const descVal = data.description ?? data.subheadline ?? data.sub ?? data.body ?? data.copy ?? '';
  const ctaLabel = data.cta_label ?? data.primary_button_label ?? data.button_label ?? '';
  const ctaHref = data.cta_href ?? data.primary_button_link ?? data.button_href ?? data.button_link ?? '';
  const highlight = data.highlight_words ?? data.highlight ?? '';
  const align = data.content_alignment ?? data.alignment ?? 'left';
  const spacing = data.vertical_spacing ?? data.spacing ?? 'large';

  const setIfPresent = (keys, val) => {
    for (const k of keys) {
      if (data[k] !== undefined || keys[0] === k) { onChange(k, val); return; }
    }
    onChange(keys[0], val);
  };

  return (
    <div>
      <ThemeStudioPanelHead section={section} />

      <div className="vis-row">
        <span className="vis-label">{section.is_visible ? 'Visible on page' : 'Hidden from page'}</span>
        <div className={`toggle ${section.is_visible ? 'on' : ''}`} onClick={onToggle} role="button" tabIndex={0} />
      </div>

      {(data.eyebrow !== undefined || section.section_type === 'hero') && (
        <ThemeField
          label="Eyebrow"
          value={data.eyebrow || ''}
          onChange={v => onChange('eyebrow', v)}
          colorValue={data.eyebrow_color || '#64748b'}
          onColorChange={v => onChange('eyebrow_color', v)}
        />
      )}

      {(headingVal !== '' || data.heading !== undefined || data.headline !== undefined || data.title !== undefined || section.section_type === 'hero') && (
        <ThemeField
          label="Heading"
          type="textarea"
          value={headingVal}
          onChange={v => setIfPresent(['heading', 'headline', 'title'], v)}
          colorValue={data.heading_color || data.title_color || '#111111'}
          onColorChange={v => onChange('heading_color', v)}
        />
      )}

      {(highlight !== '' || data.highlight_words !== undefined || data.highlight !== undefined || section.section_type === 'hero') && (
        <ThemeField
          label="Highlight words"
          value={highlight}
          onChange={v => setIfPresent(['highlight_words', 'highlight'], v)}
          colorValue={data.highlight_color || '#0d9488'}
          onColorChange={v => onChange('highlight_color', v)}
        />
      )}

      {(descVal !== '' || data.description !== undefined || data.subheadline !== undefined || data.body !== undefined || section.section_type === 'hero') && (
        <ThemeField
          label="Description"
          type="textarea"
          value={descVal}
          onChange={v => setIfPresent(['description', 'subheadline', 'sub', 'body', 'copy'], v)}
        />
      )}

      {(ctaLabel !== '' || data.cta_label !== undefined || section.section_type === 'hero') && (
        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Primary button</label>
          <div className="field" style={{ marginBottom: 8 }}>
            <label className="field-label" style={{ fontSize: 10, textTransform: 'uppercase' }}>Label</label>
            <input type="text" value={ctaLabel} onChange={e => setIfPresent(['cta_label', 'primary_button_label', 'button_label'], e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label" style={{ fontSize: 10, textTransform: 'uppercase' }}>Link</label>
            <input type="text" value={ctaHref} onChange={e => setIfPresent(['cta_href', 'primary_button_link', 'button_href', 'button_link'], e.target.value)} />
          </div>
        </div>
      )}

      {FIELD_MAP.filter(([k]) => !['headline','title','heading','eyebrow','subheadline','sub','body','copy','cta_label','cta_href','secondary_cta_label','secondary_cta_href'].includes(k) && data[k] !== undefined).map(([key, label, type]) => {
        let val = data[key];
        if (val && typeof val === 'object') val = val.text || JSON.stringify(val);
        return (
          <div className="field" key={key}>
            <label className="field-label">{label}</label>
            {type === 'textarea'
              ? <textarea rows={3} value={val || ''} onChange={e => onChange(key, e.target.value)} />
              : <input type="text" value={val || ''} onChange={e => onChange(key, e.target.value)} />
            }
          </div>
        );
      })}

      {Array.isArray(data.bullets) && (
        <BulletsEditor bullets={data.bullets} onChange={b => onChange('bullets', b)} />
      )}

      <div className="ts-layout-block">
        <div className="ts-layout-label">Layout</div>
        <div className="field">
          <label className="field-label">Content alignment</label>
          <div className="ts-align-row">
            {['left', 'center', 'right'].map(id => (
              <button
                key={id}
                type="button"
                className={`ts-align-btn ${align === id ? 'active' : ''}`}
                onClick={() => setIfPresent(['content_alignment', 'alignment'], id)}
                title={id}
              >
                {id === 'left' ? '←' : id === 'center' ? '↔' : '→'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label">Vertical spacing</label>
          <select value={spacing} onChange={e => setIfPresent(['vertical_spacing', 'spacing'], e.target.value)}>
            <option value="compact">Compact</option>
            <option value="default">Default</option>
            <option value="large">Large</option>
          </select>
        </div>
      </div>

      <div className="divider" />
      <div className="btn-row">
        <button type="button" className="btn btn-save" onClick={onSave} disabled={saving || !Object.keys(dirty).length}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="btn btn-revert btn-sm" onClick={onRevert}>Revert</button>
      </div>
    </div>
  );
}

function ThemeStudioDesignPanel({ section, data, onChange, onSave, saving, dirty }) {
  if (!section) return (
    <div className="rp-empty">
      <div className="rp-empty-icon">◑</div>
      <div style={{ fontSize: 12 }}>Select a section for design options</div>
    </div>
  );

  return (
    <div>
      <ThemeStudioPanelHead section={section} />
      <div className="field">
        <label className="field-label">Background color</label>
        <div className="ts-field-row">
          <input type="text" value={data.background_color || data.bg_color || ''} placeholder="#F9F7F2" onChange={e => onChange('background_color', e.target.value)} />
          <label className="ts-color-swatch"><input type="color" value={data.background_color || '#f9f7f2'} onChange={e => onChange('background_color', e.target.value)} /></label>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Text color</label>
        <div className="ts-field-row">
          <input type="text" value={data.text_color || ''} placeholder="#1a1a1a" onChange={e => onChange('text_color', e.target.value)} />
          <label className="ts-color-swatch"><input type="color" value={data.text_color || '#1a1a1a'} onChange={e => onChange('text_color', e.target.value)} /></label>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Accent color</label>
        <div className="ts-field-row">
          <input type="text" value={data.accent_color || ''} placeholder="#0d9488" onChange={e => onChange('accent_color', e.target.value)} />
          <label className="ts-color-swatch"><input type="color" value={data.accent_color || '#0d9488'} onChange={e => onChange('accent_color', e.target.value)} /></label>
        </div>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-save" onClick={onSave} disabled={saving || !Object.keys(dirty).length}>
          {saving ? 'Saving…' : 'Save design'}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   EDIT PANEL
══════════════════════════════════════════════════════════════ */
const FIELD_MAP = [
  ['headline',             'Headline',            'input'],
  ['title',                'Title',               'input'],
  ['heading',              'Heading',             'input'],
  ['eyebrow',              'Eyebrow',             'input'],
  ['subheadline',          'Subheadline',         'textarea'],
  ['sub',                  'Subtext',             'textarea'],
  ['body',                 'Body copy',           'textarea'],
  ['copy',                 'Copy',                'textarea'],
  ['email',                'Email',               'input'],
  ['cta_label',            'CTA label',           'input'],
  ['cta_href',             'CTA link',            'input'],
  ['secondary_cta_label',  'Secondary CTA label', 'input'],
  ['secondary_cta_href',   'Secondary CTA link',  'input'],
];

function EditPanel({ section, data, onChange, dirty, onSave, saving, onRevert, onToggle, onDelete }) {
  if (!section) return (
    <div className="rp-empty">
      <div className="rp-empty-icon">✦</div>
      <div style={{ fontSize: 12, color: '#374151' }}>Click a section in the sidebar to edit it</div>
    </div>
  );

  const shown = FIELD_MAP.filter(([k]) => data[k] !== undefined);

  return (
    <div>
      <div className="sec-meta-head">
        <div className="sec-meta-name">{section.section_name}</div>
        <div className="sec-meta-type">
          <span className="type-chip">{section.section_type}</span>
        </div>
      </div>

      {/* visibility */}
      <div className="vis-row">
        <span className="vis-label">{section.is_visible ? 'Visible' : 'Hidden'}</span>
        <div
          className={`toggle ${section.is_visible ? 'on' : ''}`}
          onClick={onToggle}
        />
      </div>

      {!shown.length && (
        <div style={{ color: '#374151', fontSize: 12, marginBottom: 14 }}>
          No text fields detected. Use Raw JSON below.
        </div>
      )}

      {shown.map(([key, label, type]) => {
        let val = data[key];
        if (val && typeof val === 'object') val = val.text || JSON.stringify(val);
        return (
          <div className="field" key={key}>
            <label className="field-label">{label}</label>
            {type === 'textarea'
              ? <textarea rows={3} value={val || ''} onChange={e => onChange(key, e.target.value)} />
              : <input type="text" value={val || ''} onChange={e => onChange(key, e.target.value)} />
            }
          </div>
        );
      })}

      {/* bullets */}
      {Array.isArray(data.bullets) && (
        <BulletsEditor
          bullets={data.bullets}
          onChange={b => onChange('bullets', b)}
        />
      )}

      {/* feature cards */}
      {Array.isArray(data.feature_cards) && (
        <div className="field">
          <label className="field-label">Feature cards</label>
          {data.feature_cards.map((card, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 6, padding: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#475569', marginBottom: 6 }}>Card {i + 1} · {card.key}</div>
              <input type="text" value={card.title || ''} placeholder="Title" style={{ width: '100%', background: '#0d1117', border: '1px solid rgba(255,255,255,.1)', borderRadius: 5, color: '#e2e8f0', padding: '5px 8px', marginBottom: 4 }}
                onChange={e => {
                  const cards = [...data.feature_cards];
                  cards[i] = { ...cards[i], title: e.target.value };
                  onChange('feature_cards', cards);
                }} />
              <textarea rows={2} value={card.description || ''} placeholder="Description" style={{ width: '100%', background: '#0d1117', border: '1px solid rgba(255,255,255,.1)', borderRadius: 5, color: '#e2e8f0', padding: '5px 8px', resize: 'vertical' }}
                onChange={e => {
                  const cards = [...data.feature_cards];
                  cards[i] = { ...cards[i], description: e.target.value };
                  onChange('feature_cards', cards);
                }} />
            </div>
          ))}
        </div>
      )}

      {/* raw JSON toggle */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 11, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>Raw JSON</summary>
        <textarea
          style={{ width: '100%', minHeight: 90, marginTop: 6, background: '#0d1117', border: '1px solid rgba(255,255,255,.08)', borderRadius: 5, color: '#67e8f9', padding: 8, fontFamily: 'monospace', fontSize: 10, resize: 'vertical' }}
          value={JSON.stringify(data, null, 2)}
          onChange={e => { try { const p = JSON.parse(e.target.value); Object.entries(p).forEach(([k, v]) => onChange(k, v)); } catch (_) {} }}
        />
      </details>

      <div className="divider" />

      <div className="btn-row">
        <button className="btn btn-save" onClick={onSave} disabled={saving || !Object.keys(dirty).length}>
          {saving && <span className="spin">⟳</span>}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn-revert btn-sm" onClick={onRevert}>Revert</button>
      </div>
      <button className="btn btn-del" onClick={onDelete}>Delete section</button>
    </div>
  );
}

function BulletsEditor({ bullets, onChange }) {
  return (
    <div className="field">
      <label className="field-label">Bullets</label>
      {bullets.map((b, i) => (
        <div className="bullet-row" key={i}>
          <input type="text" value={b}
            onChange={e => { const n = [...bullets]; n[i] = e.target.value; onChange(n); }} />
          <button className="bullet-del" onClick={() => onChange(bullets.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="add-bullet" onClick={() => onChange([...bullets, ''])}>+ Add bullet</button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   HTML INJECT PANEL
══════════════════════════════════════════════════════════════ */
function HtmlPanel({ code, setCode, name, setName, type, setType, pos, setPos,
  previewing, onPreview, onClearPreview, onPublish, saving }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Inject HTML section</div>

      <div className="field">
        <label className="field-label">Section name</label>
        <input type="text" value={name} placeholder="e.g. hero-redesign" onChange={e => setName(e.target.value)} />
      </div>

      <div className="field">
        <label className="field-label">Type</label>
        <select value={type} onChange={e => setType(e.target.value)}>
          {['hero','services','work','faq','cta','overview','case-study','statement','contact_path','service','closing','custom'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field-label">Position</label>
        <select value={pos} onChange={e => setPos(e.target.value)}>
          <option value="end">End of page</option>
          <option value="start">Start of page</option>
        </select>
      </div>

      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>HTML</label>
      <div className="inject-code">
        <textarea
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="<!-- Paste your HTML here -->"
          spellCheck={false}
        />
        <div className="inject-footer">
          <span>{code.length.toLocaleString()} chars</span>
          <span>{code.split('\n').length} lines</span>
        </div>
      </div>

      {previewing && (
        <div className="preview-notice">
          ⚡ Previewing in canvas — toggle Desktop / Tablet / Mobile above
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {!previewing
          ? <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onPreview}>Preview in canvas</button>
          : <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClearPreview}>← Live site</button>
        }
      </div>

      <button
        className="btn pub"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={onPublish}
        disabled={saving || !code.trim() || !name.trim()}
      >
        {saving && <span className="spin">⟳</span>}
        {saving ? 'Publishing…' : 'Publish → R2 + D1'}
      </button>

      <div className="divider" />
      <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.65 }}>
        HTML is stored in R2 at <code style={{ color: '#67e8f9' }}>cms/sections/{'{page}'}/{'{name}'}/</code>.<br />
        D1 stores only metadata — no HTML in the database.
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PAGE INFO PANEL
══════════════════════════════════════════════════════════════ */
function PagePanel({ page, sections, url }) {
  if (!page) return (
    <div className="rp-empty">
      <div className="rp-empty-icon">◱</div>
      <div style={{ fontSize: 12, color: '#374151' }}>Select a page</div>
    </div>
  );

  const vis = sections.filter(s => s.is_visible).length;
  const statusClass = page.status === 'published' ? 'status-published'
    : page.status === 'draft' ? 'status-draft' : 'status-archived';

  function fmt(ts) {
    if (!ts) return '—';
    const n = Number(ts);
    const d = Number.isFinite(n) && n > 1e8 ? new Date(n * 1000) : new Date(ts);
    return isNaN(d.getTime()) ? String(ts)
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', marginBottom: 12 }}>{page.title}</div>
      <div className="meta-row"><span className="meta-key">Status</span><span className={`status-pill ${statusClass}`}>{page.status}</span></div>
      <div className="meta-row"><span className="meta-key">Slug</span><span className="meta-val">/{page.slug}</span></div>
      <div className="meta-row"><span className="meta-key">Type</span><span className="meta-val">{page.page_type || '—'}</span></div>
      <div className="meta-row"><span className="meta-key">Sections</span><span className="meta-val">{sections.length} total · {vis} visible</span></div>
      <div className="meta-row"><span className="meta-key">Last edited</span><span className="meta-val">{fmt(page.updated_at)}</span></div>
      <div className="meta-row"><span className="meta-key">Page ID</span><span className="meta-val" style={{ fontSize: 10 }}>{page.id}</span></div>

      {url && (
        <>
          <div className="divider" />
          <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Live URL</div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="live-link">{url} ↗</a>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   THEME SETTINGS PANEL
══════════════════════════════════════════════════════════════ */
function ThemePanel({ bootstrap, project }) {
  const theme = bootstrap?.active_theme || {};
  const [accentColor, setAccent] = useState(theme.accent || '#3b82f6');

  const PALETTE = ['#3b82f6','#8b5cf6','#ec4899','#ef4444','#f97316','#22c55e','#14b8a6','#0ea5e9','#a3a3a3','#1a1a1a'];

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Theme settings</div>

      <div className="theme-section">
        <div className="theme-section-head">Colors</div>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>Accent color</div>
        <div className="color-grid">
          {PALETTE.map(c => (
            <div
              key={c}
              className={`color-swatch ${accentColor === c ? 'active' : ''}`}
              style={{ background: c, borderColor: accentColor === c ? '#fff' : 'transparent' }}
              onClick={() => setAccent(c)}
            />
          ))}
        </div>
        <div className="field">
          <label className="field-label">Custom hex</label>
          <input type="text" value={accentColor} onChange={e => setAccent(e.target.value)} />
        </div>
      </div>

      <div className="theme-section">
        <div className="theme-section-head">Active theme</div>
        {theme.name && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{theme.name}</div>
        )}
        {theme.slug && (
          <div style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>{theme.slug}</div>
        )}
      </div>

      <div className="divider" />
      <button
        className="btn pub"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={async () => {
          try {
            await api('/api/cms/themes/activate', { method: 'POST', body: { slug: theme.slug, accent: accentColor } });
            showToast('Theme settings saved', 'ok');
          } catch (e) { showToast('Save failed: ' + e.message, 'err'); }
        }}
      >
        Save theme settings
      </button>
    </div>
  );
}

/* ── mount ── */
ReactDOM.createRoot(document.getElementById('app')).render(<CmsEditor />);
