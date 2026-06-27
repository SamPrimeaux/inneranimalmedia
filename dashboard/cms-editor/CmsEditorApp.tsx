// @ts-nocheck — incremental TS migration; types live in ../../src/types/cms.ts
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/* ═══════════════════════════════════════════════════════════
   CMS Editor Core v2 — Inner Animal Media (Vite bundle)
   Layout: [icon-rail 48px] [sidebar 240px] [iframe flex] [panel 300px]
═══════════════════════════════════════════════════════════ */

/* ── API ──────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body instanceof FormData ? opts.body
      : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || res.statusText }; }
  if (!res.ok) {
    const errMsg = data.error || data.message || res.statusText;
    const e = new Error(typeof data === 'object' ? JSON.stringify(data) : errMsg);
    e.status = res.status;
    e.payload = data;
    throw e;
  }
  return data;
}

function isFullHtmlDocument(html) {
  const raw = String(html || '').trim();
  if (!raw) return false;
  if (/^<!doctype\s/i.test(raw)) return true;
  return /<html[\s>]/i.test(raw);
}

function readCtx() {
  const p = new URLSearchParams(location.search);
  return {
    project: p.get('project') || p.get('site') || 'inneranimalmedia',
    pageId: p.get('page') || p.get('page_id') || '',
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

function resolvePreviewHost(boot = null, ctx = readCtx()) {
  const project = ctx.project || boot?.project_slug || 'inneranimalmedia';
  const tenantDomain = String(boot?.tenant?.domain || boot?.public_domain || ctx.publicDomain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .trim();
  if (tenantDomain) return tenantDomain;
  return STOREFRONT_APEX[project] || `${project}.meauxbility.workers.dev`;
}

/** @param {'live'|'embed'|'preview-draft'|'preview-published'} mode */
function pageToUrl(page, boot = null, mode = 'embed') {
  if (!page) return null;
  const ctx = readCtx();
  const path = pagePath(page);
  const host = resolvePreviewHost(boot, ctx);
  const base = `https://${host}${path}`;
  try {
    const url = new URL(base);
    const isDraft = String(page?.status || '').toLowerCase() === 'draft';
    if (mode === 'embed') {
      url.searchParams.set('cms', '1');
      if (isDraft) {
        url.searchParams.set('preview', 'draft');
        if (page.id) url.searchParams.set('page_id', page.id);
      }
    }
    if (mode === 'preview-draft') {
      url.searchParams.set('preview', 'draft');
      url.searchParams.set('cms', '1');
      if (page.id) url.searchParams.set('page_id', page.id);
    }
    if (mode === 'preview-published') {
      url.searchParams.set('preview', 'published');
      url.searchParams.set('cms', '1');
    }
    return url.toString();
  } catch {
    if (mode === 'preview-draft') {
      return `${base}?preview=draft&cms=1&page_id=${encodeURIComponent(page.id || '')}`;
    }
    if (mode === 'preview-published') return `${base}?preview=published&cms=1`;
    return `${base}${base.includes('?') ? '&' : '?'}cms=1`;
  }
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

const BLANK_PAGE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>New Page</title><style>*{box-sizing:border-box;margin:0}body{font-family:Inter,system-ui,sans-serif;background:#0a0a0f;color:#e2e8f0;min-height:100vh}.cms-canvas{padding:80px 24px;text-align:center;min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}.cms-canvas h1{font-size:clamp(1.75rem,4vw,2.75rem);font-weight:700;letter-spacing:-.02em}.cms-canvas p{color:#64748b;max-width:440px;line-height:1.65}</style></head><body><section data-cms-section="main-content" class="cms-canvas"><h1>Clean canvas</h1><p>Add sections from the CMS wizard. This page is yours — start fresh.</p></section></body></html>`;

const BLANK_PAGE_SECTIONS = [
  {
    section_type: 'custom',
    section_name: 'main-content',
    section_data: {
      headline: 'Clean canvas',
      body: 'Add sections from the CMS wizard. This page is yours — start fresh.',
      html_source: 'template',
    },
    sort_order: 10,
  },
];

const STARTER_PAGE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Starter Page</title><style>*{box-sizing:border-box;margin:0}body{font-family:Inter,system-ui,sans-serif;background:#0a0a0f;color:#e2e8f0}section{padding:72px 24px;max-width:960px;margin:0 auto}.hero{text-align:center;padding-top:96px;padding-bottom:96px}.hero h1{font-size:clamp(2rem,5vw,3rem);margin-bottom:16px}.hero p{color:#94a3b8;max-width:520px;margin:0 auto 24px;line-height:1.6}.cta{display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600}</style></head><body><section data-cms-section="main-hero" class="hero"><h1>Your headline here</h1><p>Starter template — edit content in the Content tab.</p><a class="cta" href="#">Get started</a></section><!-- cms-inject:capabilities --><!-- cms-inject:closing-cta --></body></html>`;

const PAGE_TEMPLATES = {
  blank: {
    id: 'blank',
    label: 'Blank canvas',
    desc: 'Empty page — build from scratch',
    html: BLANK_PAGE_HTML,
    sections: BLANK_PAGE_SECTIONS,
  },
  starter: {
    id: 'starter',
    label: 'Starter page',
    desc: 'Hero + services + CTA scaffold',
    html: STARTER_PAGE_HTML,
    sections: [
      { section_type: 'hero', section_name: 'main-hero', section_data: { headline: 'Your headline here', subheadline: 'Starter template — edit in Content tab.', cta_label: 'Get started', cta_href: '#' }, sort_order: 10 },
      { section_type: 'services', section_name: 'capabilities', section_data: { headline: 'What we do', bullets: ['Capability one', 'Capability two', 'Capability three'] }, sort_order: 20 },
      { section_type: 'cta', section_name: 'closing-cta', section_data: { headline: 'Ready to begin?', cta_label: 'Contact us', cta_href: '/contact' }, sort_order: 30 },
    ],
  },
};

const SECTION_TEMPLATES = [
  { id: 'hero', label: 'Hero', type: 'hero', name: 'main-hero', data: { eyebrow: 'Welcome', headline: 'Your headline', subheadline: 'Supporting copy goes here.', cta_label: 'Get started', cta_href: '#' } },
  { id: 'services', label: 'Services grid', type: 'services', name: 'capabilities', data: { headline: 'Services', bullets: ['Service one', 'Service two', 'Service three'] } },
  { id: 'faq', label: 'FAQ', type: 'faq', name: 'faq', data: { headline: 'Questions', bullets: ['Question one?', 'Question two?'] } },
  { id: 'cta', label: 'Call to action', type: 'cta', name: 'closing-cta', data: { headline: 'Ready?', cta_label: 'Contact us', cta_href: '/contact' } },
  { id: 'custom', label: 'Content block', type: 'custom', name: 'content-block', data: { headline: 'Content block', body: 'Edit in the Content tab.' } },
];

function sectionInjectHtml(tpl) {
  const d = tpl.data || {};
  const h = d.headline || d.title || tpl.name;
  const body = d.subheadline || d.body || d.description || '';
  return `<section data-cms-section="${tpl.name}" style="padding:64px 24px;text-align:center;background:#0d1117;color:#e2e8f0"><h2 style="font-size:1.75rem;margin-bottom:12px">${h}</h2><p style="color:#94a3b8;max-width:520px;margin:0 auto;line-height:1.6">${body}</p></section>`;
}

const WIZARD_STYLES = `
.wizard-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px}
.wizard-modal{background:#fff;border-radius:16px;width:min(520px,100%);max-height:min(90vh,680px);overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.25);color:#1a1a1a}
.wizard-head{padding:20px 22px 12px;border-bottom:1px solid #e8e4dc;display:flex;align-items:center;justify-content:space-between}
.wizard-head h2{font-size:17px;font-weight:700;margin:0}
.wizard-close{background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;padding:4px 8px;border-radius:6px}
.wizard-close:hover{background:#f1f5f9}
.wizard-body{padding:16px 22px 22px;overflow-y:auto;flex:1}
.wizard-step-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:12px}
.wizard-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.wizard-card{border:1px solid #e8e4dc;border-radius:10px;padding:14px;cursor:pointer;background:#faf9f7;transition:all .12s;text-align:left}
.wizard-card:hover{border-color:#2563eb;background:#eff6ff}
.wizard-card.active{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 2px rgba(37,99,235,.2)}
.wizard-card-title{font-size:13px;font-weight:700;margin-bottom:4px}
.wizard-card-desc{font-size:11px;color:#64748b;line-height:1.45}
.wizard-field{margin-bottom:12px}
.wizard-field label{display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
.wizard-field input,.wizard-field select{width:100%;padding:9px 11px;border:1px solid #e8e4dc;border-radius:8px;font-size:13px;background:#fff}
.wizard-actions{display:flex;gap:8px;margin-top:16px}
.wizard-actions .btn{flex:1;justify-content:center;height:36px}
.wizard-menu-item{display:flex;align-items:center;gap:12px;width:100%;padding:14px;border:1px solid #e8e4dc;border-radius:10px;background:#fff;cursor:pointer;text-align:left;margin-bottom:8px;transition:background .12s}
.wizard-menu-item:hover{background:#f8fafc;border-color:#cbd5e1}
.wizard-menu-icon{width:40px;height:40px;border-radius:10px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.wizard-menu-text strong{display:block;font-size:13px;margin-bottom:2px}
.wizard-menu-text span{font-size:11px;color:#64748b}
.canvas-welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:320px;padding:32px;text-align:center;background:linear-gradient(180deg,#0d1117 0%,#161b22 100%);color:#e2e8f0}
.canvas-welcome h2{font-size:1.35rem;margin-bottom:8px;font-weight:700}
.canvas-welcome p{color:#64748b;font-size:13px;max-width:360px;line-height:1.6;margin-bottom:20px}
.canvas-welcome .btn.pub{background:#2563eb;border-color:#2563eb}
.picker-footer{border-top:1px solid #e8e4dc;padding:8px;display:flex;flex-direction:column;gap:4px;background:#faf9f7;flex-shrink:0}
.picker-action{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:none;background:none;cursor:pointer;border-radius:8px;font-size:12px;font-weight:600;color:#2563eb;text-align:left}
.picker-action:hover{background:#eff6ff}
.picker-action:disabled{opacity:.45;cursor:not-allowed}
.picker-action:disabled:hover{background:none}
.picker-action svg,.picker-action-icon svg{width:15px;height:15px;flex-shrink:0;display:block}
.picker-action-icon{width:15px;height:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#2563eb}
`;

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
  html,body,#app{height:100%;overflow:hidden;background:#F9F7F2;color:#1a1a1a;-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
  html,body,#app{height:100dvh;height:-webkit-fill-available}
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
html,body,#app{background:#F9F7F2;color:#1a1a1a;height:100dvh;height:-webkit-fill-available}
.shell.theme-studio{
  display:grid;
  grid-template-columns:minmax(240px,280px) minmax(0,1fr) minmax(280px,340px);
  grid-template-rows:auto minmax(0,1fr);
  height:100dvh;
  height:-webkit-fill-available;
  max-height:100dvh;
  overflow:hidden;
  font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;
  font-size:13px;
  color:#1a1a1a;
  background:#F9F7F2;
}
.shell.theme-studio .icon-rail{display:none}
.shell.theme-studio .sidebar{grid-column:1;grid-row:2;background:#fff;border-right:1px solid #e8e4dc;min-width:0;min-height:0}
.shell.theme-studio .canvas{grid-column:2;grid-row:2;background:#F9F7F2;min-width:0;min-height:0}
.shell.theme-studio .rpanel{grid-column:3;grid-row:2;background:#fff;border-left:1px solid #e8e4dc;min-width:0;min-height:0}
.shell.theme-studio .topbar{
  grid-column:1/-1;
  min-height:52px;
  display:flex;
  align-items:center;
  background:rgba(251,248,241,.98);
  border-bottom:1px solid rgba(43,39,31,.1);
  padding:8px 14px;
  gap:10px;
  backdrop-filter:blur(18px);
  -webkit-backdrop-filter:blur(18px);
  box-shadow:0 1px 0 rgba(255,255,255,.72) inset;
  flex-wrap:nowrap;
}
.ts-brand{display:flex;align-items:center;gap:8px;min-width:0;flex-shrink:0;max-width:38vw;position:relative}
.ts-brand-pencil{position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:#0d9488;border-radius:50%;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s;pointer-events:none}
.ts-brand-pencil svg{width:9px;height:9px;stroke:#fff;stroke-width:2.5}
.ts-brand:hover .ts-brand-pencil{opacity:1}
.ts-logo-popover{position:absolute;top:calc(100% + 10px);left:0;width:240px;background:#fff;border:1px solid #e8e4dc;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,.12);z-index:500;padding:14px;display:flex;flex-direction:column}
.ts-logo-pop-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.ts-sec-group-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;padding:10px 14px 4px;flex-shrink:0}
.ts-logo{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#0d9488,#115e59);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;letter-spacing:-.04em;flex-shrink:0}
.ts-brand-name{font-size:14px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts-nav-icons{display:flex;align-items:center;gap:2px;margin-left:2px;flex-shrink:0}
.ts-icon-btn{width:36px;height:36px;min-width:36px;min-height:36px;border:none;background:transparent;border-radius:10px;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s,color .12s}
.ts-icon-btn:hover,.ts-icon-btn:active{background:#f1ede6;color:#334155}
.ts-icon-btn svg{width:18px;height:18px}
.ts-page-select{height:36px;min-width:180px;border:1px solid #e8e4dc;border-radius:10px;background:#fff;color:#111;padding:0 32px 0 12px;font-size:13px;font-weight:600;cursor:pointer;outline:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}
.ts-page-select:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.12)}
.ts-page-picker{position:relative;min-width:0;width:100%;max-width:min(420px,100%);z-index:320}
.ts-page-picker-btn{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;height:40px;border:1px solid #e8e4dc;border-radius:12px;background:#fff;color:#111;padding:0 14px;font-size:13px;font-weight:600;cursor:pointer;outline:none;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.ts-page-picker-btn:hover,.ts-page-picker-btn:active{border-color:#d6d0c4;background:#faf8f4}
.ts-page-picker-btn svg{width:14px;height:14px;color:#64748b;flex-shrink:0}
.ts-page-picker-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.ts-page-picker-menu{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);width:min(360px,calc(100vw - 24px));max-height:min(420px,58dvh);background:#fff;border:1px solid #e8e4dc;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,.12);z-index:400;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.ts-page-picker-search{height:42px;border:none;border-bottom:1px solid #f0ebe3;padding:0 14px;font-size:16px;outline:none;background:#faf8f4;border-radius:0;flex-shrink:0}
.ts-page-picker-search:focus{background:#fff}
.ts-page-picker-list{overflow-y:auto;padding:6px;-webkit-overflow-scrolling:touch;flex:1 1 auto;min-height:0;max-height:min(280px,42dvh)}
.ts-page-picker-item{display:flex;align-items:flex-start;gap:8px;width:100%;border:none;background:transparent;text-align:left;padding:12px;border-radius:10px;cursor:pointer;color:#111;min-height:44px}
.ts-page-picker-item:hover,.ts-page-picker-item:active{background:#faf8f4}
.ts-page-picker-item.active{background:#eff6ff}
.ts-page-check{width:18px;height:18px;color:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.ts-page-check svg{width:14px;height:14px}
.ts-page-picker-item-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.ts-page-picker-item-title{font-size:14px;font-weight:600;line-height:1.3}
.ts-page-picker-item-path{font-size:11px;color:#64748b}
.ts-page-picker-empty{padding:16px 12px;color:#64748b;font-size:12px;line-height:1.45;text-align:center}
.ts-page-picker-empty-state{display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 16px;text-align:center;color:#64748b}
.ts-page-picker-empty-icon{width:36px;height:36px;border-radius:10px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ts-page-picker-empty-icon svg{width:18px;height:18px;display:block}
.ts-page-picker-empty-state strong{font-size:13px;color:#334155;font-weight:600}
.ts-page-picker-empty-state span{font-size:11px;line-height:1.45}
.ts-topbar-center{flex:1;display:flex;align-items:center;justify-content:center;min-width:0;padding:0 4px;overflow:visible;position:relative;z-index:350}
.ts-topbar-right{display:flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0}
.ts-topbar-actions-compact{display:none;align-items:center;gap:4px}
.shell.theme-studio .vp-group{background:#f5f2eb;border:1px solid #e8e4dc;border-radius:10px;flex-shrink:0}
.shell.theme-studio .vp-btn{color:#64748b;padding:8px 12px;font-size:12px;min-width:44px;min-height:36px}
.shell.theme-studio .vp-btn.active{background:#fff;color:#111;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.shell.theme-studio .btn{height:36px;min-height:36px;padding:0 14px;background:#fff;border:1px solid #e8e4dc;color:#334155;border-radius:10px;font-weight:600;font-size:12px}
.shell.theme-studio .btn:hover,.shell.theme-studio .btn:active{background:#faf8f4}
.shell.theme-studio .btn.pub,.shell.theme-studio .btn-save{background:#0d9488;border-color:#0d9488;color:#fff}
.shell.theme-studio .btn.pub:hover,.shell.theme-studio .btn.pub:active,.shell.theme-studio .btn-save:hover{background:#0f766e}
.ts-sections-head{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px;border-bottom:1px solid #f0ebe3;flex-shrink:0}
.ts-sections-title{font-size:13px;font-weight:700;color:#111}
.ts-sections-actions{display:flex;gap:4px}
.ts-search-wrap{padding:10px 12px 6px;flex-shrink:0}
.ts-search{width:100%;height:40px;border:1px solid #e8e4dc;border-radius:10px;background:#faf8f4;padding:0 10px 0 32px;font-size:16px;color:#111;outline:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='M21 21l-4.35-4.35'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:10px center}
.ts-search:focus{border-color:#0d9488;background-color:#fff}
.shell.theme-studio .sec-list{padding:6px 8px 12px;-webkit-overflow-scrolling:touch}
.shell.theme-studio .sec-row{border-left:none;border-radius:10px;padding:10px;margin-bottom:2px;border:1px solid transparent;min-height:44px}
.shell.theme-studio .sec-row:hover,.shell.theme-studio .sec-row:active{background:#faf8f4}
.shell.theme-studio .sec-row.active{background:#eff6ff;border-color:#3b82f6;box-shadow:0 0 0 1px rgba(59,130,246,.15)}
.shell.theme-studio .sec-row.active .sec-name{color:#1e40af;font-weight:600}
.shell.theme-studio .sec-name{color:#111;font-size:13px}
.shell.theme-studio .sec-type{color:#64748b;font-size:11px}
.shell.theme-studio .drag-grip{color:#cbd5e1}
.shell.theme-studio .sec-icon{background:#f5f2eb;border:1px solid #ebe6de}
.shell.theme-studio .eye-btn{color:#94a3b8;min-width:36px;min-height:36px}
.shell.theme-studio .add-sec-btn{margin:4px 12px 12px;border-color:#d6d0c4;color:#64748b;background:#faf8f4;border-radius:10px;min-height:44px}
.shell.theme-studio .add-sec-btn:hover{border-color:#0d9488;color:#0d9488;background:#f0fdfa}
.ts-sections-hint{padding:0 14px 12px;font-size:11px;color:#94a3b8}
.shell.theme-studio .canvas-bar{display:none}
.shell.theme-studio .canvas-stage{padding:12px;background:#F9F7F2;align-items:stretch;justify-content:center;height:100%;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;flex:1}
.shell.theme-studio .frame-shell{
  border-radius:12px;
  box-shadow:0 4px 24px rgba(0,0,0,.08),0 1px 3px rgba(0,0,0,.04);
  border:1px solid #e8e4dc;
  width:100%;
  max-width:100%;
  height:100%;
  min-height:240px;
  flex:1 1 auto;
  position:relative;
  overflow:hidden;
  background:#fff;
}
.shell.theme-studio.vp-desktop .frame-shell{max-width:100%}
.shell.theme-studio.vp-tablet .frame-shell{max-width:768px;margin:0 auto}
.shell.theme-studio.vp-mobile .frame-shell{max-width:390px;margin:0 auto}
.shell.theme-studio .frame-highlight{border:2px solid #3b82f6;border-radius:12px;opacity:0}
.shell.theme-studio .frame-highlight.show{opacity:1}
.site-iframe{width:100%;height:100%;min-height:200px;border:none;display:block;background:#fff}
.ts-frame-label{position:absolute;top:-1px;left:12px;transform:translateY(-50%);background:#3b82f6;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;z-index:12;pointer-events:none}
.ts-frame-actions{position:absolute;top:12px;right:12px;display:flex;gap:6px;z-index:12}
.ts-frame-act{width:36px;height:36px;border-radius:10px;border:1px solid #e8e4dc;background:#fff;color:#475569;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.ts-frame-act:hover,.ts-frame-act:active{background:#f8fafc;color:#111}
.ts-frame-act.danger{color:#dc2626;border-color:#fecaca}
.shell.theme-studio .rp-tabs{border-bottom:1px solid #f0ebe3;background:#fff;flex-shrink:0}
.shell.theme-studio .rp-tab{color:#64748b;font-size:12px;font-weight:600;text-transform:none;letter-spacing:0;padding:12px 8px;min-height:44px}
.shell.theme-studio .rp-tab.active{color:#111;border-bottom-color:#0d9488}
.shell.theme-studio .rp-body{padding:16px;-webkit-overflow-scrolling:touch}
.shell.theme-studio .field-label{color:#64748b;font-size:11px;font-weight:600;text-transform:none;letter-spacing:0;margin-bottom:6px}
.shell.theme-studio .field input,.shell.theme-studio .field textarea,.shell.theme-studio .field select{background:#fff;border:1px solid #e8e4dc;border-radius:10px;color:#111;padding:10px 12px;font-size:16px}
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
.ts-richbar{display:flex;align-items:center;gap:4px;padding:6px 8px;border:1px solid #e8e4dc;border-bottom:none;border-radius:10px 10px 0 0;background:#faf8f4}
.ts-richbtn{width:32px;height:32px;border:none;background:transparent;border-radius:8px;color:#64748b;cursor:pointer;font-size:12px;font-weight:700}
.ts-richbtn:hover{background:#f1ede6;color:#111}
.ts-richarea{border-radius:0 0 10px 10px;border-top:none;min-height:88px;width:100%;background:#fff;border:1px solid #e8e4dc;color:#111;padding:10px 12px;font-size:16px;resize:vertical;outline:none;line-height:1.45}
.ts-richarea:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.1)}
.ts-layout-block{margin-top:8px;padding-top:16px;border-top:1px solid #f0ebe3}
.ts-layout-label{font-size:12px;font-weight:700;color:#111;margin-bottom:10px}
.ts-align-row{display:flex;gap:6px}
.ts-align-btn{width:40px;height:40px;border:1px solid #e8e4dc;border-radius:10px;background:#fff;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center}
.ts-align-btn.active{background:#eff6ff;border-color:#3b82f6;color:#1d4ed8}
.shell.theme-studio .vis-row{background:#faf8f4;border-color:#ebe6de}
.shell.theme-studio .vis-label{color:#475569}
.shell.theme-studio .toggle{background:#e2e8f0;border-color:#cbd5e1}
.shell.theme-studio .toggle.on{background:#0d9488;border-color:#0d9488}
.shell.theme-studio .rp-empty{color:#94a3b8}
.shell.theme-studio .cms-toast{background:#111;border-color:#333;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.15);bottom:calc(18px + env(safe-area-inset-bottom,0px))}
.shell.theme-studio ::-webkit-scrollbar-thumb{background:rgba(0,0,0,.12)}
.ts-sheet-backdrop{position:fixed;inset:0;background:rgba(24,22,17,.28);z-index:40;opacity:0;pointer-events:none;transition:opacity .28s ease}
.ts-sheet-backdrop.show{opacity:1;pointer-events:auto}
.ts-sheet-grab{width:36px;height:4px;border-radius:99px;background:#d6d0c4;margin:8px auto 4px;flex-shrink:0}
.ts-mobile-dock{
  display:none;
  grid-column:1/-1;
  align-items:stretch;
  justify-content:space-around;
  gap:4px;
  padding:6px 10px calc(6px + env(safe-area-inset-bottom,0px));
  background:rgba(251,248,241,.98);
  border-top:1px solid rgba(43,39,31,.1);
  backdrop-filter:blur(18px);
  -webkit-backdrop-filter:blur(18px);
  z-index:30;
}
.ts-dock-btn{
  flex:1;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:3px;
  min-height:48px;
  border:none;
  background:transparent;
  color:#786f62;
  border-radius:12px;
  cursor:pointer;
  font-size:10px;
  font-weight:600;
  letter-spacing:.01em;
  padding:4px 6px;
}
.ts-dock-btn svg{width:20px;height:20px}
.ts-dock-btn.active{background:#fff;color:#0d9488;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.ts-dock-btn:active{transform:scale(.98)}

@media (max-width:767px){
  .shell.theme-studio{
    grid-template-columns:1fr;
    grid-template-rows:auto minmax(0,1fr) auto;
  }
  .shell.theme-studio .topbar{
    padding:max(8px,env(safe-area-inset-top,0px)) 10px 8px;
    gap:8px;
    align-items:center;
    flex-wrap:wrap;
  }
  .ts-brand{max-width:none;flex:0 0 auto}
  .ts-brand-name{display:none}
  .ts-topbar-center{order:3;flex:1 1 100%;padding:0}
  .ts-topbar-right.ts-topbar-actions-full{display:none!important}
  .ts-topbar-actions-compact{display:flex!important}
  .shell.theme-studio .sidebar,
  .shell.theme-studio .rpanel{
    position:fixed;
    left:0;right:0;bottom:0;
    z-index:50;
    width:100%;
    max-width:100%;
    max-height:min(82dvh,calc(100dvh - env(safe-area-inset-top,0px) - 56px));
    border-radius:18px 18px 0 0;
    box-shadow:0 -12px 40px rgba(0,0,0,.14);
    transform:translate3d(0,105%,0);
    transition:transform .34s cubic-bezier(.32,.72,0,1);
    grid-column:1!important;
    grid-row:auto!important;
    border-left:none;
    border-right:none;
    padding-bottom:env(safe-area-inset-bottom,0px);
  }
  .shell.theme-studio.mobile-panel-sections .sidebar{transform:translate3d(0,0,0)}
  .shell.theme-studio.mobile-panel-inspector .rpanel{transform:translate3d(0,0,0)}
  .shell.theme-studio .canvas{grid-column:1;grid-row:2}
  .shell.theme-studio .canvas-stage{padding:8px}
  .shell.theme-studio.vp-mobile .frame-shell,
  .shell.theme-studio.vp-desktop .frame-shell,
  .shell.theme-studio.vp-tablet .frame-shell{
    max-width:100%;
    width:100%;
    min-height:0;
    height:100%;
    border-radius:10px;
  }
  .ts-mobile-dock{display:flex}
  .ts-page-picker-menu{
    position:fixed;
    left:12px;right:12px;top:auto;bottom:calc(64px + env(safe-area-inset-bottom,0px));
    transform:none;
    width:auto;
    max-height:min(52dvh,420px);
  }
  .shell.theme-studio .rp-body{padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px))}
  .ts-frame-actions{top:auto;bottom:12px;right:12px}
}
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
  s.textContent = STYLES + WIZARD_STYLES + (themeStudio ? THEME_STUDIO_STYLES : '');
}

/* ══════════════════════════════════════════════════════════════
   SVG ICONS
══════════════════════════════════════════════════════════════ */
const I = {
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  layoutList: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><path d="M14 4h7M14 9h7M14 15h7M14 20h7"/></svg>,
  pencilSmall: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  agentSam: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M15 8h.01M9 8h.01"/></svg>,
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
  chevronDown: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>,
  sliders: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  undo: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13"/></svg>,
  page: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  block: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
};

function useIsMobile(breakpoint = 767) {
  const query = `(max-width: ${breakpoint}px)`;
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setMobile(mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, [query]);
  return mobile;
}

function dedupePages(pages) {
  const seen = new Set();
  const list = [];
  for (const page of pages || []) {
    if (!page?.id || seen.has(page.id)) continue;
    seen.add(page.id);
    list.push(page);
  }
  return list.sort((a, b) => {
    if (a.is_homepage && !b.is_homepage) return -1;
    if (!a.is_homepage && b.is_homepage) return 1;
    const ao = Number(a.sort_order) || 0;
    const bo = Number(b.sort_order) || 0;
    if (ao !== bo) return ao - bo;
    return String(a.title || a.route_path || a.slug || '').localeCompare(String(b.title || b.route_path || b.slug || ''));
  });
}

function scrollPreviewToSection(iframeRef, sectionName) {
  const frame = iframeRef.current;
  const raw = String(sectionName || '').trim();
  if (!frame || !raw) return;
  const run = () => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const keys = [raw, raw.replace(/_/g, '-'), raw.replace(/-/g, '_')];
      let el = null;
      for (const key of keys) {
        el = doc.querySelector(`[data-cms-section="${key}"]`) || doc.getElementById(key);
        if (el) break;
      }
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      doc.querySelectorAll('.iam-cms-section-focus').forEach(node => node.classList.remove('iam-cms-section-focus'));
      el.classList.add('iam-cms-section-focus');
      window.setTimeout(() => el.classList.remove('iam-cms-section-focus'), 1800);
    } catch (_) {}
  };
  try {
    if (frame.contentDocument?.readyState === 'complete') run();
    else frame.addEventListener('load', run, { once: true });
  } catch (_) {}
}

function CanvasWelcome({ onOpenWizard, error, pagesCount, project }) {
  if (error) {
    return (
      <div className="canvas-welcome">
        <div style={{ fontSize: 40, marginBottom: 8, opacity: .5 }}>⚠</div>
        <h2>CMS could not load this site</h2>
        <p style={{ color: '#b45309' }}>{error}</p>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
          Site: <code>{project || 'inneranimalmedia'}</code>
          {pagesCount != null ? ` · ${pagesCount} pages in bootstrap` : ''}
        </p>
        <button type="button" className="btn pub" style={{ marginTop: 12 }} onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }
  return (
    <div className="canvas-welcome">
      <div style={{ fontSize: 40, marginBottom: 8, opacity: .5 }}>◱</div>
      <h2>Start from a clean canvas</h2>
      <p>Create a new page with a blank canvas or starter template. Your existing marketing pages stay untouched until you open them from the dropdown.</p>
      <button type="button" className="btn pub" onClick={() => onOpenWizard('page')}>+ Create page</button>
      <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => onOpenWizard('menu')}>Browse templates</button>
    </div>
  );
}

function CmsWizard({ open, step, onClose, onStep, project, activePage, onCreatePage, onCreateSection, busy }) {
  const [pageTitle, setPageTitle] = useState('');
  const [pageSlug, setPageSlug] = useState('');
  const [pageRoute, setPageRoute] = useState('');
  const [pageTemplate, setPageTemplate] = useState('blank');
  const [sectionTpl, setSectionTpl] = useState(SECTION_TEMPLATES[0]?.id || 'hero');
  const [sectionName, setSectionName] = useState('');
  const [injectHtml, setInjectHtml] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPageTitle('');
    setPageSlug('');
    setPageRoute('');
    setPageTemplate('blank');
    setSectionTpl('hero');
    setSectionName('');
    setInjectHtml(true);
  }, [open, step]);

  useEffect(() => {
    const tpl = SECTION_TEMPLATES.find(t => t.id === sectionTpl);
    if (tpl && !sectionName) setSectionName(tpl.name);
  }, [sectionTpl, sectionName]);

  if (!open) return null;

  const tpl = PAGE_TEMPLATES[pageTemplate] || PAGE_TEMPLATES.blank;
  const secTpl = SECTION_TEMPLATES.find(t => t.id === sectionTpl) || SECTION_TEMPLATES[0];

  return (
    <div className="wizard-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wizard-modal" role="dialog" aria-label="CMS wizard">
        <div className="wizard-head">
          <h2>{step === 'menu' ? 'Create' : step === 'page' ? 'New page' : 'New section'}</h2>
          <button type="button" className="wizard-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="wizard-body">
          {step === 'menu' && (
            <>
              <div className="wizard-step-label">What would you like to add?</div>
              <button type="button" className="wizard-menu-item" onClick={() => onStep('page')}>
                <div className="wizard-menu-icon">{I.page}</div>
                <div className="wizard-menu-text"><strong>Add page</strong><span>Blank canvas or starter template</span></div>
              </button>
              <button type="button" className="wizard-menu-item" onClick={() => onStep('section')} disabled={!activePage}>
                <div className="wizard-menu-icon">{I.block}</div>
                <div className="wizard-menu-text"><strong>Add section</strong><span>{activePage ? `On ${activePage.title}` : 'Select a page first'}</span></div>
              </button>
            </>
          )}

          {step === 'page' && (
            <>
              <div className="wizard-step-label">Choose a template</div>
              <div className="wizard-grid">
                {Object.values(PAGE_TEMPLATES).map(t => (
                  <button key={t.id} type="button" className={`wizard-card ${pageTemplate === t.id ? 'active' : ''}`} onClick={() => setPageTemplate(t.id)}>
                    <div className="wizard-card-title">{t.label}</div>
                    <div className="wizard-card-desc">{t.desc}</div>
                  </button>
                ))}
              </div>
              <div className="wizard-field">
                <label>Page title</label>
                <input type="text" value={pageTitle} placeholder="My new page" onChange={e => {
                  setPageTitle(e.target.value);
                  if (!pageSlug) setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                  if (!pageRoute) setPageRoute('/' + (e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page'));
                }} />
              </div>
              <div className="wizard-field">
                <label>Slug</label>
                <input type="text" value={pageSlug} placeholder="my-new-page" onChange={e => { setPageSlug(e.target.value); setPageRoute('/' + e.target.value.replace(/^\//, '')); }} />
              </div>
              <div className="wizard-field">
                <label>Route path</label>
                <input type="text" value={pageRoute} placeholder="/my-new-page" onChange={e => setPageRoute(e.target.value)} />
              </div>
              <div className="wizard-actions">
                <button type="button" className="btn" onClick={() => onStep('menu')}>Back</button>
                <button type="button" className="btn pub" disabled={busy || !pageTitle.trim() || !pageSlug.trim()} onClick={() => onCreatePage({
                  title: pageTitle.trim(),
                  slug: pageSlug.trim().replace(/^\//, ''),
                  route_path: pageRoute.trim().startsWith('/') ? pageRoute.trim() : `/${pageRoute.trim()}`,
                  template: tpl,
                })}>
                  {busy ? 'Creating…' : 'Create page'}
                </button>
              </div>
            </>
          )}

          {step === 'section' && (
            <>
              <div className="wizard-step-label">Section template</div>
              <div className="wizard-grid">
                {SECTION_TEMPLATES.map(t => (
                  <button key={t.id} type="button" className={`wizard-card ${sectionTpl === t.id ? 'active' : ''}`} onClick={() => { setSectionTpl(t.id); setSectionName(t.name); }}>
                    <div className="wizard-card-title">{t.label}</div>
                    <div className="wizard-card-desc">{t.type}</div>
                  </button>
                ))}
              </div>
              <div className="wizard-field">
                <label>Section name</label>
                <input type="text" value={sectionName} placeholder="main-hero" onChange={e => setSectionName(e.target.value)} />
              </div>
              <div className="wizard-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', fontWeight: 500 }}>
                  <input type="checkbox" checked={injectHtml} onChange={e => setInjectHtml(e.target.checked)} />
                  Also inject HTML preview block to R2
                </label>
              </div>
              <div className="wizard-actions">
                <button type="button" className="btn" onClick={() => onStep('menu')}>Back</button>
                <button type="button" className="btn pub" disabled={busy || !sectionName.trim() || !activePage} onClick={() => onCreateSection({
                  template: secTpl,
                  section_name: sectionName.trim(),
                  injectHtml,
                })}>
                  {busy ? 'Adding…' : 'Add section'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PagePicker({ pages, activePage, onSelect, onOpenWizard }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const sortedPages = useMemo(() => dedupePages(pages), [pages]);
  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedPages;
    return sortedPages.filter(page =>
      String(page.title || '').toLowerCase().includes(q) ||
      String(page.slug || '').toLowerCase().includes(q) ||
      String(page.route_path || '').toLowerCase().includes(q),
    );
  }, [sortedPages, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const label = activePage?.title || activePage?.slug || 'Choose page…';

  return (
    <div className="ts-page-picker" ref={wrapRef}>
      <button
        type="button"
        className="ts-page-picker-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(v => !v)}
      >
        <span className="ts-page-picker-label">{label}</span>
        {I.chevronDown}
      </button>
      {open ? (
        <div className="ts-page-picker-menu" role="listbox" aria-label="Pages">
          <input
            type="search"
            className="ts-page-picker-search"
            placeholder="Search pages…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <div className="ts-page-picker-list">
            {!sortedPages.length ? (
              <div className="ts-page-picker-empty-state">
                <span className="ts-page-picker-empty-icon" aria-hidden="true">{I.page}</span>
                <strong>No pages yet</strong>
                <span>Create a page to start editing this site.</span>
              </div>
            ) : filteredPages.map(page => (
              <button
                key={page.id}
                type="button"
                role="option"
                aria-selected={activePage?.id === page.id}
                className={`ts-page-picker-item ${activePage?.id === page.id ? 'active' : ''}`}
                onClick={() => {
                  onSelect(page);
                  setOpen(false);
                  setQuery('');
                }}
              >
                {activePage?.id === page.id ? (
                  <span className="ts-page-check">{I.check}</span>
                ) : (
                  <span className="ts-page-check" aria-hidden="true" />
                )}
                <span className="ts-page-picker-item-text">
                  <span className="ts-page-picker-item-title">{page.title || page.slug || 'Untitled page'}</span>
                  {page.route_path ? (
                    <span className="ts-page-picker-item-path">{page.route_path}</span>
                  ) : null}
                </span>
              </button>
            ))}
            {sortedPages.length && !filteredPages.length ? (
              <div className="ts-page-picker-empty">No matching pages</div>
            ) : null}
          </div>
          <div className="picker-footer">
            <button type="button" className="picker-action" onClick={() => { setOpen(false); onOpenWizard?.('page'); }}>
              <span className="picker-action-icon" aria-hidden="true">{I.page}</span>
              Add page
            </button>
            <button type="button" className="picker-action" onClick={() => { setOpen(false); onOpenWizard?.('section'); }} disabled={!activePage && !sortedPages.length}>
              <span className="picker-action-icon" aria-hidden="true">{I.plus}</span>
              Add section
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROOT COMPONENT
══════════════════════════════════════════════════════════════ */
function CmsEditor() {
  const ctx = readCtx();
  const isThemeStudio = ctx.view === 'themeEditor';
  injectStyles(isThemeStudio);

  /* ── state ── */
  const [bootstrap, setBootstrap]   = useState(null);
  const [siteShell, setSiteShell]   = useState(null);
  const [activeShellPart, setActiveShellPart] = useState(null);
  const [shellHtml, setShellHtml]   = useState('');
  const [shellDirty, setShellDirty] = useState(false);
  const [booting, setBooting]       = useState(false);
  const [bootstrapError, setBootstrapError] = useState(null);
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
  const [previewUrls, setPreviewUrls] = useState(null);
  const [sectionQuery, setSectionQuery] = useState('');
  const [mobilePanel, setMobilePanel] = useState('canvas');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState('menu');
  const [wizardBusy, setWizardBusy] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [lastRollback, setLastRollback] = useState(null);
  const [logoPopoverOpen, setLogoPopoverOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoWidth, setLogoWidth] = useState(120);
  const [savingLogo, setSavingLogo] = useState(false);

  const isMobile = useIsMobile();
  const iframeRef = useRef(null);

  const closeMobilePanel = useCallback(() => setMobilePanel('canvas'), []);
  const openMobileSections = useCallback(() => {
    setMobilePanel(prev => (prev === 'sections' ? 'canvas' : 'sections'));
  }, []);
  const openMobileInspector = useCallback(() => {
    setMobilePanel(prev => (prev === 'inspector' ? 'canvas' : 'inspector'));
  }, []);

  useEffect(() => {
    if (!isMobile) setMobilePanel('canvas');
  }, [isMobile]);

  useEffect(() => {
    if (isMobile && isThemeStudio) setVp('mobile');
  }, [isMobile, isThemeStudio]);

  useEffect(() => {
    if (!isMobile || mobilePanel === 'canvas') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, mobilePanel]);

  /* ── bootstrap ── */
  useEffect(() => {
    if (!ctx.project) return;
    setBooting(true);
    api(`/api/cms/bootstrap?project_slug=${encodeURIComponent(ctx.project)}&site=${encodeURIComponent(ctx.project)}`)
      .then(data => {
        if (data.error && !data.pages?.length) {
          setBootstrapError(data.message || data.error);
          setPages([]);
          setBootstrap(data);
          return;
        }
        setBootstrapError(null);
        setBootstrap(data);
        setSiteShell(data.site_shell || null);
        const pg = data.pages || [];
        setPages(pg);
        const forceWizard = new URLSearchParams(location.search).get('wizard') === '1';
        const first = !forceWizard && ctx.pageId ? pg.find(p => p.id === ctx.pageId) : null;
        if (first) {
          loadPage(first, data, { syncParent: false });
        } else if (!forceWizard && !ctx.pageId) {
          const home =
            pg.find((p) => p.id === 'page_home') ||
            (data.home_page?.id && pg.find((p) => p.id === data.home_page.id)) ||
            pg.find((p) => p.is_homepage) ||
            pg.find((p) => p.route_path === '/' || p.slug === 'home') ||
            pg[0];
          if (home) loadPage(home, data, { syncParent: false });
          else if (!pg.length) setBootstrapError('No CMS pages found for this site. Check workspace and site slug.');
        } else if ((!ctx.pageId || forceWizard) && isThemeStudio) {
          const embedded =
            window.parent !== window ||
            Boolean(new URLSearchParams(location.search).get('parent_origin'));
          if (!embedded || forceWizard) {
            setWizardOpen(true);
            setWizardStep('menu');
          }
        }
        if (ctx.view === 'themeEditor') {
          setRailMode('sections');
          setRpTab('edit');
        }
      })
      .catch(e => {
        setBootstrapError(e.message || 'Bootstrap failed');
        showToast('Failed to load: ' + e.message, 'err');
      })
      .finally(() => setBooting(false));
  }, [ctx.project, ctx.pageId]);

  const pushUndo = useCallback((entry) => {
    setUndoStack(prev => [...prev.slice(-29), { ...entry, at: Date.now() }]);
  }, []);

  async function reloadBootstrap(pageId = activePage?.id) {
    const data = await api(`/api/cms/bootstrap?project_slug=${encodeURIComponent(ctx.project)}`);
    setBootstrap(data);
    setPages(data.pages || []);
    if (pageId) {
      const pg = (data.pages || []).find(p => p.id === pageId);
      if (pg) {
        const secs = ((data.sections_by_page || {})[pageId] || [])
          .slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setSections(secs);
        setActivePage(pg);
      }
    }
    return data;
  }

  async function wizardCreatePage({ title, slug, route_path, template }) {
    setWizardBusy(true);
    try {
      const res = await api('/api/cms/pages', {
        method: 'POST',
        body: {
          project_id: ctx.project,
          slug,
          title,
          route_path,
          status: 'draft',
          content: template.html,
          sections: template.sections || [],
        },
      });
      pushUndo({ kind: 'page_create', pageId: res.id });
      const data = await reloadBootstrap(res.id);
      const page = (data.pages || []).find(p => p.id === res.id) || {
        id: res.id,
        title,
        slug,
        route_path,
        status: 'draft',
      };
      if (res.preview_urls) setPreviewUrls(res.preview_urls);
      setWizardOpen(false);
      setWizardStep('menu');
      setRpTab('edit');
      loadPage(page, data, { syncParent: true });
      const secs = ((data.sections_by_page || {})[page.id] || [])
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      if (secs.length) {
        setActiveSection(secs[0]);
        setMobilePanel('inspector');
      } else {
        setWizardOpen(true);
        setWizardStep('section');
      }
      showToast('Page created · ' + title, 'ok');
    } catch (e) {
      showToast('Create page failed: ' + e.message, 'err');
    } finally {
      setWizardBusy(false);
    }
  }

  async function wizardCreateSection({ template, section_name, injectHtml: doInject }) {
    if (!activePage) { showToast('Select a page first', 'err'); return; }
    setWizardBusy(true);
    try {
      let sec;
      if (doInject) {
        const html = sectionInjectHtml({ ...template, name: section_name });
        const result = await api('/api/cms/sections/save-injected', {
          method: 'POST',
          body: {
            page_id: activePage.id,
            section_type: template.type,
            section_name,
            html,
            position: 'end',
            sort_order: (sections.length + 1) * 10,
            project_slug: ctx.project,
          },
        });
        sec = result.section;
      } else {
        const result = await api('/api/cms/sections', {
          method: 'POST',
          body: {
            page_id: activePage.id,
            section_type: template.type,
            section_name,
            sort_order: (sections.length + 1) * 10,
            section_data: template.data,
          },
        });
        sec = result.section || { id: result.id, section_name, section_type: template.type, section_data: template.data, is_visible: 1 };
      }
      pushUndo({ kind: 'section_create', sectionId: sec.id, pageId: activePage.id });
      setSections(prev => [...prev, sec]);
      setActiveSection(sec);
      setDirty({});
      setRpTab('edit');
      setWizardOpen(false);
      setWizardStep('menu');
      showToast('Section added · ' + section_name, 'ok');
      await refreshDraftPreview();
    } catch (e) {
      showToast('Add section failed: ' + e.message, 'err');
    } finally {
      setWizardBusy(false);
    }
  }

  async function undoLast() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) { showToast('Nothing to undo', 'err'); return; }
    try {
      if (entry.kind === 'section_data') {
        await api(`/api/cms/sections/${encodeURIComponent(entry.sectionId)}`, {
          method: 'PUT', body: { section_data: entry.before },
        });
        const upd = { ...entry.sectionSnapshot, section_data: entry.before };
        setSections(prev => prev.map(s => s.id === entry.sectionId ? upd : s));
        if (activeSection?.id === entry.sectionId) setActiveSection(upd);
        setDirty({});
      } else if (entry.kind === 'section_create') {
        await api(`/api/cms/sections/${encodeURIComponent(entry.sectionId)}`, { method: 'DELETE' });
        setSections(prev => prev.filter(s => s.id !== entry.sectionId));
        if (activeSection?.id === entry.sectionId) setActiveSection(null);
      } else if (entry.kind === 'section_delete') {
        const s = entry.section;
        const res = await api('/api/cms/sections', {
          method: 'POST',
          body: {
            page_id: entry.pageId,
            section_type: s.section_type,
            section_name: s.section_name,
            sort_order: s.sort_order,
            section_data: typeof s.section_data === 'string' ? JSON.parse(s.section_data) : s.section_data,
          },
        });
        const restored = res.section || { ...s, id: res.id };
        setSections(prev => [...prev, restored].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
      } else if (entry.kind === 'publish' && entry.rollback_id) {
        await api('/api/cms/rollback', {
          method: 'POST',
          body: { rollback_id: entry.rollback_id, page_id: entry.page_id },
        });
        await reloadBootstrap(entry.page_id);
        showLiveSite(activePage);
      } else if (entry.kind === 'page_create') {
        showToast('Page create undo not supported — delete page from Advanced tab', 'err');
        return;
      }
      setUndoStack(prev => prev.slice(0, -1));
      showToast('Undone', 'ok');
      await refreshDraftPreview();
    } catch (e) {
      showToast('Undo failed: ' + e.message, 'err');
    }
  }

  function openWizard(step = 'menu') {
    setWizardStep(step === 'section' && !activePage ? 'menu' : step);
    setWizardOpen(true);
  }

  function loadPage(page, boot = bootstrap, opts = {}) {
    const syncParent = opts.syncParent !== false;
    setActivePage(page);
    setActiveSection(null);
    setActiveShellPart(null);
    setShellHtml('');
    setShellDirty(false);
    setDirty({});
    setPrev(false);
    setDraftPreview(false);
    setPreviewUrls(null);
    const secs = ((boot?.sections_by_page || {})[page.id] || [])
      .slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    setSections(secs);
    api(`/api/cms/pages/${encodeURIComponent(page.id)}/preview-urls?project_slug=${encodeURIComponent(ctx.project)}`)
      .then(urls => setPreviewUrls(urls))
      .catch(() => setPreviewUrls(null));
    const frame = iframeRef.current;
    if (frame) {
      const needsSrcdoc =
        String(page?.status || '').toLowerCase() === 'draft' ||
        !page?.r2_key ||
        boot?.cms_hosting === 'client_worker';
      if (needsSrcdoc) {
        api(`/api/cms/pages/${encodeURIComponent(page.id)}?draft=1&project_slug=${encodeURIComponent(ctx.project)}`)
          .then(data => {
            if (data.preview_html && iframeRef.current) {
              iframeRef.current.removeAttribute('src');
              iframeRef.current.srcdoc = data.preview_html;
              setDraftPreview(true);
            } else {
              const url = pageToUrl(page, boot, 'embed');
              if (url) {
                frame.removeAttribute('srcdoc');
                frame.src = url;
              }
            }
          })
          .catch(() => {
            const url = pageToUrl(page, boot, 'embed');
            if (url) {
              frame.removeAttribute('srcdoc');
              frame.src = url;
            }
          });
      } else {
        const url = pageToUrl(page, boot, 'embed');
        if (url) {
          frame.removeAttribute('srcdoc');
          frame.src = url;
        } else if (opts.fallbackHtml) {
          frame.removeAttribute('src');
          frame.srcdoc = opts.fallbackHtml;
        }
      }
    }
    const navCtx = readCtx();
    if (syncParent && page?.id && navCtx.project) {
      postParent('iam-cms-navigate', {
        path: `/dashboard/cms/pages/${encodeURIComponent(page.id)}?site=${encodeURIComponent(navCtx.project)}`,
        replace: true,
      });
    }
  }

  useEffect(() => {
    function onHostMessage(e) {
      const parentOrigin = (() => {
        try {
          return new URLSearchParams(location.search).get('parent_origin') || '';
        } catch {
          return '';
        }
      })();
      const allowed = [window.location.origin];
      if (parentOrigin) allowed.push(parentOrigin);
      if (!allowed.includes(e.origin)) return;
      const data = e.data;
      if (!data || data.type !== 'iam-cms-set-page' || !data.detail?.pageId) return;
      const targetId = String(data.detail.pageId);
      const pg = pages.find(p => p.id === targetId);
      if (pg) {
        loadPage(pg, bootstrap, { syncParent: false });
        return;
      }
      reloadBootstrap(targetId).then(nextData => {
        const next = (nextData.pages || []).find(p => p.id === targetId);
        if (next) loadPage(next, nextData, { syncParent: false });
      }).catch(() => {});
    }
    window.addEventListener('message', onHostMessage);
    return () => window.removeEventListener('message', onHostMessage);
  }, [pages, bootstrap]);

  async function selectShellPart(partId) {
    const id = String(partId || '').trim();
    if (!id) return;
    setActiveSection(null);
    setDirty({});
    setActiveShellPart(id);
    setRpTab(isThemeStudio ? 'advanced' : 'html');
    try {
      const res = await api(
        `/api/cms/site-shell/${encodeURIComponent(id)}?draft=1&project_slug=${encodeURIComponent(ctx.project)}`,
      );
      setShellHtml(res.part?.html || '');
      setShellDirty(false);
    } catch (e) {
      showToast('Failed to load chrome: ' + e.message, 'err');
    }
  }

  async function saveShellPart() {
    if (!activeShellPart) return;
    setSaving(true);
    try {
      await api(
        `/api/cms/site-shell/${encodeURIComponent(activeShellPart)}?project_slug=${encodeURIComponent(ctx.project)}`,
        { method: 'PUT', body: { html: shellHtml } },
      );
      setShellDirty(false);
      showToast('Site chrome draft saved');
      const meta = await api(`/api/cms/site-shell?project_slug=${encodeURIComponent(ctx.project)}`);
      setSiteShell(meta.site_shell || null);
      await refreshDraftPreview();
    } catch (e) {
      showToast('Chrome save failed: ' + e.message, 'err');
    } finally {
      setSaving(false);
    }
  }

  async function publishShellPart() {
    if (!activeShellPart) return;
    if (!confirm('Publish this header/footer to the live site?')) return;
    setSaving(true);
    try {
      if (shellDirty) {
        await api(
          `/api/cms/site-shell/${encodeURIComponent(activeShellPart)}?project_slug=${encodeURIComponent(ctx.project)}`,
          { method: 'PUT', body: { html: shellHtml } },
        );
        setShellDirty(false);
      }
      await api(
        `/api/cms/site-shell/${encodeURIComponent(activeShellPart)}/publish?project_slug=${encodeURIComponent(ctx.project)}`,
        { method: 'POST', body: {} },
      );
      showToast('Site chrome published', 'ok');
      const meta = await api(`/api/cms/site-shell?project_slug=${encodeURIComponent(ctx.project)}`);
      setSiteShell(meta.site_shell || null);
      await refreshDraftPreview();
    } catch (e) {
      showToast('Chrome publish failed: ' + e.message, 'err');
    } finally {
      setSaving(false);
    }
  }

  async function refreshDraftPreview(page = activePage) {
    if (!page) return;
    const frame = iframeRef.current;
    if (!frame) return;
    const previewUrl =
      previewUrls?.preview_draft_url ||
      pageToUrl(page, bootstrap, 'preview-draft');
    if (previewUrl) {
      frame.removeAttribute('srcdoc');
      frame.src = previewUrl;
      setDraftPreview(true);
      setPrev(false);
      showToast('Draft preview · real route');
      return;
    }
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
    const url = pageToUrl(page, bootstrap, draftPreview ? 'embed' : 'embed');
    if (url) frame.src = url;
  }

  async function savePageMeta(fields) {
    if (!activePage) return;
    setSaving(true);
    try {
      const res = await api(`/api/cms/pages/${encodeURIComponent(activePage.id)}`, {
        method: 'PUT',
        body: fields,
      });
      const updated = res.page || { ...activePage, ...fields };
      setActivePage(updated);
      setPages(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
      if (res.preview_urls) setPreviewUrls(res.preview_urls);
      showToast('Page route saved', 'ok');
    } catch (e) {
      showToast('Route save failed: ' + e.message, 'err');
    } finally {
      setSaving(false);
    }
  }

  async function saveSectionMeta(sectionId, fields) {
    setSaving(true);
    try {
      const res = await api(`/api/cms/sections/${encodeURIComponent(sectionId)}`, {
        method: 'PUT',
        body: fields,
      });
      const sec = res.section;
      if (sec) {
        setSections(prev => prev.map(s => s.id === sec.id ? sec : s));
        if (activeSection?.id === sec.id) setActiveSection(sec);
      }
      showToast('Section updated', 'ok');
      if (draftPreview) await refreshDraftPreview();
      else {
        const frame = iframeRef.current;
        const url = pageToUrl(activePage, bootstrap, 'embed');
        if (frame && url) { frame.src = url; }
      }
    } catch (e) {
      showToast('Section update failed: ' + e.message, 'err');
    } finally {
      setSaving(false);
    }
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
      pushUndo({
        kind: 'section_data',
        sectionId: activeSection.id,
        before: base,
        after: merged,
        sectionSnapshot: activeSection,
      });
      await api(`/api/cms/sections/${encodeURIComponent(activeSection.id)}`, {
        method: 'PUT', body: { section_data: merged },
      });
      const upd = { ...activeSection, section_data: merged };
      setActiveSection(upd);
      setSections(prev => prev.map(s => s.id === activeSection.id ? upd : s));
      setDirty({});
      showToast('Saved · ' + activeSection.section_name, 'ok');
      if (draftPreview) await refreshDraftPreview();
      else {
        const frame = iframeRef.current;
        if (frame && liveUrl) { frame.removeAttribute('srcdoc'); frame.src = liveUrl; }
      }
    } catch (e) { showToast('Save failed: ' + e.message, 'err'); }
    finally { setSaving(false); }
  }

  /* ── publish ── */
  async function saveFullPageHtmlDraft(html, { silent } = {}) {
    if (!activePage || !html.trim()) return null;
    const result = await api(`/api/cms/pages/${encodeURIComponent(activePage.id)}`, {
      method: 'PUT',
      body: { content: html, title: activePage.title || undefined },
    });
    if (!silent) showToast('Full page saved to draft R2', 'ok');
    return result;
  }

  async function flushPendingHtmlBeforePublish() {
    if (!htmlCode.trim() || !activePage) return;
    const fullPage = isFullHtmlDocument(htmlCode);
    if (!fullPage && !previewing) return;
    if (!fullPage && sections.length > 0) return;
    await saveFullPageHtmlDraft(htmlCode, { silent: true });
    setPrev(false);
    setHtmlCode('');
    setHtmlName('');
  }

  async function publishPage() {
    if (!activePage) return;
    if (Object.keys(dirty).length && activeSection) {
      await saveSection();
    }
    setPub(true);
    try {
      await flushPendingHtmlBeforePublish();
      let snap = null;
      try {
        snap = await api(`/api/cms/pages/${encodeURIComponent(activePage.id)}/snapshot`, { method: 'POST' });
        setLastRollback(snap.id);
      } catch (_) {}
      if (snap?.id) {
        pushUndo({ kind: 'publish', rollback_id: snap.id, page_id: activePage.id });
      }
      const pub = await api(`/api/cms/pages/${encodeURIComponent(activePage.id)}/publish`, { method: 'POST' });
      const urls = pub.preview_urls || null;
      if (urls) setPreviewUrls(urls);
      const live = urls?.live_url || pub.live_url || pageToUrl(activePage, bootstrap, 'embed');
      showToast('Published · ' + (activePage.title || activePage.slug) + (live ? ' · live on ' + new URL(live).host : ''), 'ok');
      setDraftPreview(false);
      setPrev(false);
      const frame = iframeRef.current;
      if (frame && live) {
        frame.removeAttribute('srcdoc');
        frame.src = urls?.embed_url || live + (live.includes('?') ? '&' : '?') + 'cms=1';
      }
      const data = await reloadBootstrap(activePage.id);
      const pg = (data.pages || []).find(p => p.id === activePage.id);
      if (pg) setActivePage(pg);
    } catch (e) {
      let msg = String(e.message || 'Publish failed');
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error === 'publish_gate_blocked') {
          const blocked = (parsed.blocked || []).join(', ');
          msg = blocked ? `Publish blocked: ${blocked}` : 'Publish blocked — check SEO/route in Advanced';
        } else if (parsed?.error) {
          msg = parsed.error;
        }
      } catch (_) {
        if (msg.includes('publish_gate')) {
          msg = 'Publish blocked — add SEO title/description in Advanced tab';
        }
      }
      showToast(msg.startsWith('Publish') ? msg : 'Publish failed: ' + msg, 'err');
    }
    finally { setPub(false); }
  }

  async function deleteSection(sec) {
    if (!sec || !confirm('Delete section "' + sec.section_name + '"?')) return;
    try {
      pushUndo({
        kind: 'section_delete',
        pageId: activePage?.id,
        section: { ...sec, section_data: secData(sec) },
      });
      await api(`/api/cms/sections/${encodeURIComponent(sec.id)}`, { method: 'DELETE' });
      setSections(prev => prev.filter(s => s.id !== sec.id));
      if (activeSection?.id === sec.id) setActiveSection(null);
      showToast('Section deleted');
      await refreshDraftPreview();
    } catch (e) { showToast('Delete failed', 'err'); }
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
    if (!htmlCode.trim() || !activePage) { showToast('Paste HTML first', 'err'); return; }
    setSaving(true);
    try {
      if (isFullHtmlDocument(htmlCode)) {
        const sectionName = htmlName.trim() || activePage.slug || 'page';
        await saveFullPageHtmlDraft(htmlCode, { silent: true });
        try {
          await api('/api/cms/sections/save-injected', {
            method: 'POST',
            body: {
              page_id: activePage.id,
              section_type: htmlType || 'custom',
              section_name: sectionName,
              html: htmlCode,
              position: htmlPos,
              sort_order: htmlPos === 'end' ? (sections.length + 1) * 10 : 5,
              project_slug: ctx.project,
            },
          });
        } catch (_) {}
        setHtmlCode('');
        setHtmlName('');
        clearPreview();
        showToast('Full page saved — click Publish to go live', 'ok');
        await refreshDraftPreview();
        return;
      }

      if (!htmlName.trim()) { showToast('Section name required for partial HTML', 'err'); return; }
      const existing = sections.find(s => String(s.section_name || '').trim() === htmlName.trim());
      const result = await api('/api/cms/sections/save-injected', {
        method: 'POST',
        body: {
          page_id: activePage.id,
          section_id: existing?.id || undefined,
          section_type: htmlType,
          section_name: htmlName,
          html: htmlCode,
          position: htmlPos,
          sort_order: htmlPos === 'end' ? (sections.length + 1) * 10 : 5,
          project_slug: ctx.project,
        },
      });
      const sec = result.section || { id: result.id, section_name: htmlName, section_type: htmlType, section_data: { r2_key: result.r2_key, public_url: result.public_url, html_source: 'injected' }, sort_order: htmlPos === 'end' ? (sections.length + 1) * 10 : 5, is_visible: 1 };
      setSections(prev => {
        const idx = prev.findIndex(s => s.id === sec.id);
        if (idx >= 0) return prev.map(s => s.id === sec.id ? sec : s);
        return htmlPos === 'end' ? [...prev, sec] : [sec, ...prev];
      });
      if (activeSection?.id === sec.id) setActiveSection(sec);
      setHtmlCode(''); setHtmlName('');
      clearPreview();
      showToast(result.created ? 'Section published → R2 + D1' : 'Section updated → R2 + D1', 'ok');
      await refreshDraftPreview();
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

  const liveUrl = activePage
    ? (previewUrls?.embed_url || pageToUrl(activePage, bootstrap, 'embed'))
    : null;
  const draftPreviewUrl = activePage
    ? (previewUrls?.preview_draft_url || pageToUrl(activePage, bootstrap, 'preview-draft'))
    : null;
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

  useEffect(() => {
    if (!activeSection?.section_name) return;
    scrollPreviewToSection(iframeRef, activeSection.section_name);
  }, [activeSection?.id, activeSection?.section_name, liveUrl, draftPreview, previewing]);

  /* ── RENDER ── */
  const shellClass = [
    'shell',
    isThemeStudio ? 'theme-studio' : '',
    isThemeStudio ? `vp-${vp}` : '',
    isMobile && isThemeStudio ? 'mobile' : '',
    isMobile && isThemeStudio && mobilePanel !== 'canvas' ? `mobile-panel-${mobilePanel}` : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div id="cms-toast" className="cms-toast" />

      {isMobile && isThemeStudio && mobilePanel !== 'canvas' ? (
        <button
          type="button"
          className={`ts-sheet-backdrop show`}
          aria-label="Close panel"
          onClick={closeMobilePanel}
        />
      ) : null}

      <div className={shellClass}>

        {/* ═══ TOPBAR ═══ */}
        {isThemeStudio ? (
          <div className="topbar">
            <div className="ts-brand" style={{ position: 'relative' }}>
              {/* Logo area with pencil edit trigger */}
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setLogoPopoverOpen(v => !v)}
                title="Edit logo"
              >
                {logoUrl
                  ? <img src={logoUrl} alt={brandName} style={{ height: 28, width: logoWidth, objectFit: 'contain', borderRadius: 6 }} />
                  : <div className="ts-logo">{brandInitials}</div>
                }
                <span className="ts-brand-pencil" aria-hidden="true">{I.pencilSmall}</span>
              </div>
              <span className="ts-brand-name">{brandName}</span>

              {/* Logo edit popover */}
              {logoPopoverOpen && (
                <div className="ts-logo-popover" onClick={e => e.stopPropagation()}>
                  <div className="ts-logo-pop-head">
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Site logo</span>
                    <button type="button" className="ts-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setLogoPopoverOpen(false)}>×</button>
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label className="field-label">Logo URL</label>
                    <input type="text" value={logoUrl} placeholder="https://… or R2 URL" onChange={e => setLogoUrl(e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label className="field-label">Width (px)</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="range" min={40} max={280} value={logoWidth} onChange={e => setLogoWidth(Number(e.target.value))} style={{ flex: 1 }} />
                      <span style={{ fontSize: 11, color: '#64748b', minWidth: 32 }}>{logoWidth}px</span>
                    </div>
                  </div>
                  {logoUrl && (
                    <div style={{ marginBottom: 10, padding: 8, background: '#f5f2eb', borderRadius: 8, display: 'flex', justifyContent: 'center' }}>
                      <img src={logoUrl} alt="preview" style={{ height: 32, maxWidth: logoWidth, objectFit: 'contain' }} />
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm pub"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={savingLogo}
                    onClick={async () => {
                      setSavingLogo(true);
                      try {
                        await api(`/api/cms/bootstrap/logo`, {
                          method: 'POST',
                          body: { project_slug: ctx.project, logo_url: logoUrl, logo_width: logoWidth },
                        });
                        showToast('Logo saved', 'ok');
                        setLogoPopoverOpen(false);
                      } catch (e) {
                        showToast('Save failed: ' + e.message, 'err');
                      } finally {
                        setSavingLogo(false);
                      }
                    }}
                  >
                    {savingLogo ? 'Saving…' : 'Save logo'}
                  </button>
                </div>
              )}

              {/* 3 nav icons: back, sections, settings */}
              <div className="ts-nav-icons">
                <button type="button" className="ts-icon-btn" title="Exit editor" onClick={() => postParent('iam-cms-exit', {})}>
                  {I.back}
                </button>
                <button type="button" className="ts-icon-btn" title="Sections" onClick={() => setMobilePanel(p => p === 'sections' ? 'canvas' : 'sections')}>
                  {I.layoutList}
                </button>
                <button type="button" className="ts-icon-btn" title="Design settings" onClick={() => setRpTab('design')}>
                  {I.settings}
                </button>
              </div>
            </div>

            <div className="ts-topbar-center">
              <PagePicker
                pages={pages}
                activePage={activePage}
                onSelect={loadPage}
                onOpenWizard={openWizard}
              />
            </div>

            <div className="ts-topbar-right ts-topbar-actions-full">
              <button type="button" className="btn btn-sm ts-icon-btn" title="Ask Agent Sam" onClick={() => postParent('iam-cms-open-agent', { page_id: activePage?.id, section_id: activeSection?.id, surface: 'cms_editor', project_slug: ctx.project })}>
                {I.agentSam}
              </button>
              <button type="button" className="btn btn-sm ts-icon-btn" title="Add" onClick={() => openWizard('menu')}>{I.plus}</button>
              <button type="button" className="btn btn-sm ts-icon-btn" title="Undo" disabled={!undoStack.length} onClick={undoLast}>{I.undo}</button>
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
            <div className="ts-topbar-right ts-topbar-actions-compact">
              <button type="button" className="btn btn-sm ts-icon-btn" title="Undo" disabled={!undoStack.length} onClick={undoLast}>{I.undo}</button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={saveSection}
                disabled={saving || !activeSection || !Object.keys(dirty).length}
                title="Save section"
              >
                {saving ? '…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-sm pub"
                onClick={publishPage}
                disabled={!activePage || publishing}
                title="Publish page"
              >
                {publishing ? '…' : 'Publish'}
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
          {isThemeStudio && isMobile ? <div className="ts-sheet-grab" aria-hidden="true" /> : null}
          {isThemeStudio ? (
            <>
              <div className="ts-sections-head">
                <span className="ts-sections-title">Sections</span>
                <div className="ts-sections-actions">
                  <button type="button" className="ts-icon-btn" title="Add section" onClick={() => openWizard('section')}>{I.plus}</button>
                </div>
              </div>
              <div className="sec-list">
                {booting && (
                  <div style={{ padding: '16px 12px', color: '#94a3b8', fontSize: 12 }}>
                    <span className="spin">⟳</span> Loading…
                  </div>
                )}

                {/* ── HEADER (global R2 chrome) ── */}
                {siteShell?.enabled ? (
                  <>
                    <div className="ts-sec-group-label">Header</div>
                    {(() => {
                      const meta = (siteShell.parts || []).find((p) => p.id === 'header');
                      const isActive = activeShellPart === 'header';
                      return (
                        <div
                          className={`sec-row ${isActive ? 'active' : ''}`}
                          onClick={() => selectShellPart('header')}
                        >
                          <div className="sec-icon" style={{ color: '#60a5fa', background: '#60a5fa18' }}>HD</div>
                          <div className="sec-info">
                            <div className="sec-name">iam-header.html</div>
                            <div className="sec-type">
                              {meta?.has_draft ? 'Draft · publish to go live' : 'Global site chrome (R2)'}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (() => {
                  const headerSecs = sections.filter(s => s.section_type === 'header' || s.section_name === 'header');
                  return headerSecs.length > 0 ? (
                    <>
                      <div className="ts-sec-group-label">Header</div>
                      {headerSecs.map(sec => {
                        const isActive = activeSection?.id === sec.id;
                        return (
                          <div
                            key={sec.id}
                            className={`sec-row ${isActive ? 'active' : ''} ${!sec.is_visible ? 'hidden' : ''}`}
                            onClick={() => { setActiveShellPart(null); setActiveSection(sec); setRpTab('edit'); setDirty({}); scrollPreviewToSection(iframeRef, sec.section_name); if (isMobile) { setMobilePanel('canvas'); setTimeout(() => setMobilePanel('inspector'), 120); } }}
                          >
                            <div className="sec-icon" style={{ color: '#60a5fa', background: '#60a5fa18' }}>HD</div>
                            <div className="sec-info">
                              <div className="sec-name">{sec.section_name}</div>
                              <div className="sec-type">Global header</div>
                            </div>
                            <button type="button" className="eye-btn" title={sec.is_visible ? 'Hide' : 'Show'} onClick={e => { e.stopPropagation(); toggleVis(sec); }}>
                              {sec.is_visible ? I.eye : I.eyeOff}
                            </button>
                          </div>
                        );
                      })}
                    </>
                  ) : null;
                })()}

                {/* ── TEMPLATE group (draggable) ── */}
                {(() => {
                  const templateSecs = sections.filter(s => s.section_type !== 'header' && s.section_name !== 'header' && s.section_type !== 'footer' && s.section_name !== 'footer');
                  return (
                    <>
                      <div className="ts-sec-group-label">Template</div>
                      {templateSecs.map((sec) => {
                        const realIdx = sections.findIndex(s => s.id === sec.id);
                        const color = SECTION_TYPE_COLORS[sec.section_type] || SECTION_TYPE_COLORS.default;
                        const isActive = activeSection?.id === sec.id;
                        const blurb = SECTION_BLURBS[sec.section_type] || sec.section_type || 'Section';
                        return (
                          <div
                            key={sec.id}
                            className={`sec-row ${isActive ? 'active' : ''} ${!sec.is_visible ? 'hidden' : ''}`}
                            onClick={() => {
                              setActiveShellPart(null);
                              setActiveSection(sec);
                              setRpTab('edit');
                              setDirty({});
                              scrollPreviewToSection(iframeRef, sec.section_name);
                              if (isMobile) {
                                setMobilePanel('canvas');
                                if (isThemeStudio) setTimeout(() => setMobilePanel('inspector'), 120);
                              }
                            }}
                            {...dragH(realIdx >= 0 ? realIdx : 0)}
                          >
                            <span className="drag-grip">⋮⋮</span>
                            <div className="sec-icon" style={{ color, background: color + '18' }}>
                              {(sec.section_type || 'S').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="sec-info">
                              <div className="sec-name">{sec.section_name}</div>
                              <div className="sec-type">{blurb}</div>
                            </div>
                            <button type="button" className="eye-btn" title={sec.is_visible ? 'Hide' : 'Show'} onClick={e => { e.stopPropagation(); toggleVis(sec); }}>
                              {sec.is_visible ? I.eye : I.eyeOff}
                            </button>
                          </div>
                        );
                      })}
                      {!templateSecs.length && !booting && (
                        <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 11 }}>No template sections yet</div>
                      )}
                    </>
                  );
                })()}

                {/* ── FOOTER (global R2 chrome) ── */}
                {siteShell?.enabled ? (
                  <>
                    <div className="ts-sec-group-label">Footer</div>
                    {(() => {
                      const meta = (siteShell.parts || []).find((p) => p.id === 'footer');
                      const isActive = activeShellPart === 'footer';
                      return (
                        <div
                          className={`sec-row ${isActive ? 'active' : ''}`}
                          onClick={() => selectShellPart('footer')}
                        >
                          <div className="sec-icon" style={{ color: '#a78bfa', background: '#a78bfa18' }}>FT</div>
                          <div className="sec-info">
                            <div className="sec-name">iam-footer.html</div>
                            <div className="sec-type">
                              {meta?.has_draft ? 'Draft · publish to go live' : 'Global site chrome (R2)'}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (() => {
                  const footerSecs = sections.filter(s => s.section_type === 'footer' || s.section_name === 'footer');
                  return footerSecs.length > 0 ? (
                    <>
                      <div className="ts-sec-group-label">Footer</div>
                      {footerSecs.map(sec => {
                        const isActive = activeSection?.id === sec.id;
                        return (
                          <div
                            key={sec.id}
                            className={`sec-row ${isActive ? 'active' : ''} ${!sec.is_visible ? 'hidden' : ''}`}
                            onClick={() => { setActiveShellPart(null); setActiveSection(sec); setRpTab('edit'); setDirty({}); scrollPreviewToSection(iframeRef, sec.section_name); if (isMobile) { setMobilePanel('canvas'); setTimeout(() => setMobilePanel('inspector'), 120); } }}
                          >
                            <div className="sec-icon" style={{ color: '#a78bfa', background: '#a78bfa18' }}>FT</div>
                            <div className="sec-info">
                              <div className="sec-name">{sec.section_name}</div>
                              <div className="sec-type">Global footer</div>
                            </div>
                            <button type="button" className="eye-btn" title={sec.is_visible ? 'Hide' : 'Show'} onClick={e => { e.stopPropagation(); toggleVis(sec); }}>
                              {sec.is_visible ? I.eye : I.eyeOff}
                            </button>
                          </div>
                        );
                      })}
                    </>
                  ) : null;
                })()}
              </div>
              <button type="button" className="add-sec-btn" onClick={() => openWizard('section')}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                Add section
              </button>
              <div className="ts-sections-hint">Drag template sections to reorder.</div>
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
              {siteShell?.enabled && (
                <>
                  <div className="sb-group">Site chrome</div>
                  <div className="sec-list" style={{ marginBottom: 8 }}>
                    {['header', 'footer'].map((partId) => {
                      const meta = (siteShell.parts || []).find((p) => p.id === partId);
                      const isActive = activeShellPart === partId;
                      return (
                        <div
                          key={partId}
                          className={`sec-row ${isActive ? 'active' : ''}`}
                          onClick={() => selectShellPart(partId)}
                        >
                          <div className="sec-icon" style={{ color: partId === 'header' ? '#60a5fa' : '#a78bfa', background: partId === 'header' ? '#60a5fa18' : '#a78bfa18' }}>
                            {partId === 'header' ? 'HD' : 'FT'}
                          </div>
                          <div className="sec-info">
                            <div className="sec-name">{partId === 'header' ? 'iam-header.html' : 'iam-footer.html'}</div>
                            <div className="sec-type">{meta?.has_draft ? 'Draft pending' : 'R2 chrome'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
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
                      onClick={() => {
                        setActiveShellPart(null);
                        setActiveSection(sec);
                        setRpTab('edit');
                        setDirty({});
                        scrollPreviewToSection(iframeRef, sec.section_name);
                        if (isMobile) {
                          setMobilePanel('canvas');
                          if (isThemeStudio) setTimeout(() => setMobilePanel('inspector'), 120);
                        }
                      }}
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
                style={!isThemeStudio ? {
                  width: vpDef.w ? Math.min(vpDef.w, window.innerWidth - 600) : '100%',
                  height: 'calc(100dvh - 44px - 36px - 32px)',
                  maxWidth: '100%',
                } : undefined}
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
                          onClick={() => deleteSection(activeSection)}
                        >
                          {I.trash}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              isThemeStudio ? (
                <CanvasWelcome
                  onOpenWizard={openWizard}
                  error={bootstrapError}
                  pagesCount={pages.length}
                  project={ctx.project}
                />
              ) : (
              <div className="canvas-empty-state">
                <div className="ces-icon">◱</div>
                <div className="ces-text">Select a page to preview</div>
              </div>
              )
            )}
          </div>
        </div>

        {/* ═══ RIGHT PANEL ═══ */}
        <div className="rpanel">
          {isThemeStudio && isMobile ? <div className="ts-sheet-grab" aria-hidden="true" /> : null}
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
            {rpTab === 'edit' && activeShellPart ? (
              <SiteShellPanel
                partId={activeShellPart}
                label={(siteShell?.parts || []).find((p) => p.id === activeShellPart)?.label || activeShellPart}
                publishedKey={(siteShell?.parts || []).find((p) => p.id === activeShellPart)?.published_key}
                hasDraft={(siteShell?.parts || []).find((p) => p.id === activeShellPart)?.has_draft}
                code={shellHtml}
                setCode={(v) => { setShellHtml(v); setShellDirty(true); }}
                onSave={saveShellPart}
                onPublish={publishShellPart}
                saving={saving}
                dirty={shellDirty}
              />
            ) : rpTab === 'edit' && (
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
                  onSaveMeta={saveSectionMeta}
                  onDelete={() => activeSection && deleteSection(activeSection)}
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
                onSaveMeta={saveSectionMeta}
                onDelete={() => activeSection && deleteSection(activeSection)}
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
                  onRevert={() => setDirty({})}
                />
                <div className="divider" />
                <ThemePanel bootstrap={bootstrap} project={ctx.project} />
              </>
            )}
            {isThemeStudio && rpTab === 'advanced' && activeShellPart ? (
              <SiteShellPanel
                partId={activeShellPart}
                label={(siteShell?.parts || []).find((p) => p.id === activeShellPart)?.label || activeShellPart}
                publishedKey={(siteShell?.parts || []).find((p) => p.id === activeShellPart)?.published_key}
                hasDraft={(siteShell?.parts || []).find((p) => p.id === activeShellPart)?.has_draft}
                code={shellHtml}
                setCode={(v) => { setShellHtml(v); setShellDirty(true); }}
                onSave={saveShellPart}
                onPublish={publishShellPart}
                saving={saving}
                dirty={shellDirty}
              />
            ) : isThemeStudio && rpTab === 'advanced' && (
              <>
                <PagePanel
                  page={activePage}
                  sections={sections}
                  url={liveUrl}
                  previewUrls={previewUrls}
                  onSaveRoute={savePageMeta}
                  saving={saving}
                />
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
                      onClick={() => deleteSection(activeSection)}
                    >
                      Delete section
                    </button>
                  </>
                ) : null}
              </>
            )}
            {!isThemeStudio && rpTab === 'html' && activeShellPart ? (
              <SiteShellPanel
                partId={activeShellPart}
                label={(siteShell?.parts || []).find((p) => p.id === activeShellPart)?.label || activeShellPart}
                publishedKey={(siteShell?.parts || []).find((p) => p.id === activeShellPart)?.published_key}
                hasDraft={(siteShell?.parts || []).find((p) => p.id === activeShellPart)?.has_draft}
                code={shellHtml}
                setCode={(v) => { setShellHtml(v); setShellDirty(true); }}
                onSave={saveShellPart}
                onPublish={publishShellPart}
                saving={saving}
                dirty={shellDirty}
              />
            ) : !isThemeStudio && rpTab === 'html' && (
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
              <PagePanel
                page={activePage}
                sections={sections}
                url={liveUrl}
                previewUrls={previewUrls}
                onSaveRoute={savePageMeta}
                saving={saving}
              />
            )}
            {!isThemeStudio && rpTab === 'theme' && (
              <ThemePanel bootstrap={bootstrap} project={ctx.project} />
            )}
          </div>
        </div>

        {isThemeStudio && isMobile ? (
          <nav className="ts-mobile-dock" aria-label="Editor panels">
            <button
              type="button"
              className={`ts-dock-btn ${mobilePanel === 'sections' ? 'active' : ''}`}
              onClick={openMobileSections}
            >
              {I.sections}
              <span>Sections</span>
            </button>
            <button
              type="button"
              className={`ts-dock-btn ${mobilePanel === 'canvas' ? 'active' : ''}`}
              onClick={closeMobilePanel}
            >
              {I.eye}
              <span>Preview</span>
            </button>
            <button
              type="button"
              className={`ts-dock-btn ${mobilePanel === 'inspector' ? 'active' : ''}`}
              onClick={openMobileInspector}
            >
              {I.sliders}
              <span>Content</span>
            </button>
          </nav>
        ) : null}

      </div>

      <CmsWizard
        open={wizardOpen}
        step={wizardStep}
        onClose={() => { setWizardOpen(false); setWizardStep('menu'); }}
        onStep={setWizardStep}
        project={ctx.project}
        activePage={activePage}
        onCreatePage={wizardCreatePage}
        onCreateSection={wizardCreateSection}
        busy={wizardBusy}
      />
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

function ThemeStudioContentPanel({ section, data, onChange, dirty, onSave, saving, onRevert, onToggle, onSaveMeta, onDelete }) {
  const [secName, setSecName] = useState('');
  const [secType, setSecType] = useState('');
  useEffect(() => {
    setSecName(section?.section_name || '');
    setSecType(section?.section_type || '');
  }, [section?.id, section?.section_name, section?.section_type]);

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

      <div className="field" style={{ marginBottom: 8 }}>
        <label className="field-label">Section name</label>
        <input type="text" value={secName} onChange={e => setSecName(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label className="field-label">Section type</label>
        <input type="text" value={secType} onChange={e => setSecType(e.target.value)} />
      </div>
      {(secName !== section.section_name || secType !== section.section_type) && onSaveMeta && (
        <button type="button" className="btn btn-sm" style={{ width: '100%', marginBottom: 12, justifyContent: 'center' }} disabled={saving}
          onClick={() => onSaveMeta(section.id, { section_name: secName.trim(), section_type: secType.trim() })}>
          Save name / type
        </button>
      )}

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
      {onDelete && (
        <button type="button" className="btn btn-del" style={{ marginTop: 8 }} onClick={onDelete}>Delete section</button>
      )}
    </div>
  );
}

function ThemeStudioDesignPanel({ section, data, onChange, onSave, saving, dirty, onRevert }) {
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
        <button type="button" className="btn btn-revert btn-sm" onClick={onRevert} disabled={!Object.keys(dirty).length}>Revert</button>
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

function EditPanel({ section, data, onChange, dirty, onSave, saving, onRevert, onToggle, onDelete, onSaveMeta }) {
  const [secName, setSecName] = useState('');
  const [secType, setSecType] = useState('');
  useEffect(() => {
    setSecName(section?.section_name || '');
    setSecType(section?.section_type || '');
  }, [section?.id, section?.section_name, section?.section_type]);

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
        <div className="field" style={{ marginBottom: 8 }}>
          <label className="field-label">Section name</label>
          <input
            type="text"
            value={secName}
            onChange={e => setSecName(e.target.value)}
            placeholder="e.g. agent_sam_platform_services"
          />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label className="field-label">Section type</label>
          <input
            type="text"
            value={secType}
            onChange={e => setSecType(e.target.value)}
            placeholder="e.g. custom"
          />
        </div>
        {(secName !== section.section_name || secType !== section.section_type) && onSaveMeta && (
          <button
            className="btn btn-sm"
            style={{ marginBottom: 10, width: '100%', justifyContent: 'center' }}
            disabled={saving}
            onClick={() => onSaveMeta(section.id, {
              section_name: secName.trim(),
              section_type: secType.trim(),
            })}
          >
            Save name / type
          </button>
        )}
        <div className="sec-meta-type">
          <span className="type-chip">{section.section_type}</span>
          <span style={{ fontSize: 10, color: '#475569', marginLeft: 6 }}>{section.id}</span>
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
   SITE SHELL PANEL (iam-header / iam-footer R2 chrome)
══════════════════════════════════════════════════════════════ */
function SiteShellPanel({ partId, label, publishedKey, hasDraft, code, setCode, onSave, onPublish, saving, dirty }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{label || partId}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, lineHeight: 1.45 }}>
        Edits the shared R2 chrome injected on every marketing page.
        {publishedKey ? (
          <> Key: <code style={{ fontSize: 10 }}>{publishedKey}</code></>
        ) : null}
        {hasDraft ? (
          <span style={{ color: '#0d9488', fontWeight: 600 }}> · draft pending publish</span>
        ) : null}
      </div>

      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>HTML</label>
      <div className="inject-code">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="<!-- iam-header.html or iam-footer.html -->"
          spellCheck={false}
        />
        <div className="inject-footer">
          <span>{code.length.toLocaleString()} chars</span>
          <span>{code.split('\n').length} lines</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} disabled={saving || !dirty} onClick={onSave}>
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        <button className="btn pub" style={{ flex: 1, justifyContent: 'center' }} disabled={saving} onClick={onPublish}>
          Publish chrome
        </button>
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.45 }}>
        Draft preview uses <code>?preview=draft</code> on the live route. Publish copies draft → published R2 key.
      </p>
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
        disabled={saving || !code.trim()}
      >
        {saving && <span className="spin">⟳</span>}
        {saving ? 'Publishing…' : 'Save HTML → R2 + D1'}
      </button>

      <div className="divider" />
      <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.65 }}>
        Full-page HTML (<code style={{ color: '#67e8f9' }}>&lt;!DOCTYPE html&gt;</code>) saves to draft — use top <strong>Publish</strong> to go live.<br />
        Partial HTML needs a section name and is stored at <code style={{ color: '#67e8f9' }}>cms/sections/{'{page}'}/{'{name}'}/</code>.
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PAGE INFO PANEL
══════════════════════════════════════════════════════════════ */
function PagePanel({ page, sections, url, previewUrls, onSaveRoute, saving }) {
  const [routePath, setRoutePath] = useState('');
  const [slug, setSlug] = useState('');
  useEffect(() => {
    setRoutePath(page?.route_path || pagePath(page));
    setSlug(page?.slug || '');
  }, [page?.id, page?.route_path, page?.slug]);

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
      <div className="field" style={{ marginTop: 8 }}>
        <label className="field-label">Route path</label>
        <input type="text" value={routePath} onChange={e => setRoutePath(e.target.value)} placeholder="/ or /marketing/my-page" />
      </div>
      <div className="field">
        <label className="field-label">Slug</label>
        <input type="text" value={slug} onChange={e => setSlug(e.target.value)} placeholder="home" />
      </div>
      {(routePath !== (page.route_path || pagePath(page)) || slug !== (page.slug || '')) && onSaveRoute && (
        <button
          className="btn btn-sm btn-save"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
          disabled={saving}
          onClick={() => onSaveRoute({ route_path: routePath.trim(), slug: slug.trim() })}
        >
          Save route
        </button>
      )}
      <div className="meta-row"><span className="meta-key">Type</span><span className="meta-val">{page.page_type || '—'}</span></div>
      <div className="meta-row"><span className="meta-key">Sections</span><span className="meta-val">{sections.length} total · {vis} visible</span></div>
      <div className="meta-row"><span className="meta-key">Last edited</span><span className="meta-val">{fmt(page.updated_at)}</span></div>
      <div className="meta-row"><span className="meta-key">Page ID</span><span className="meta-val" style={{ fontSize: 10 }}>{page.id}</span></div>

      {url && (
        <>
          <div className="divider" />
          <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Preview URLs</div>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Live (published)</div>
          <a href={previewUrls?.live_url || url.replace(/\?.*$/, '')} target="_blank" rel="noopener noreferrer" className="live-link">{previewUrls?.live_url || url.replace(/\?.*$/, '')} ↗</a>
          <div style={{ fontSize: 10, color: '#64748b', margin: '8px 0 4px' }}>Draft preview (?preview=draft)</div>
          <a href={previewUrls?.preview_draft_url || url} target="_blank" rel="noopener noreferrer" className="live-link">{previewUrls?.preview_draft_url || url} ↗</a>
          <div style={{ fontSize: 10, color: '#64748b', margin: '8px 0 4px' }}>Editor embed (?cms=1)</div>
          <a href={previewUrls?.embed_url || url} target="_blank" rel="noopener noreferrer" className="live-link">{previewUrls?.embed_url || url} ↗</a>
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

export default CmsEditor;
