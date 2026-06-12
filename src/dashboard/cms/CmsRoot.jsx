/**
 * IAM CMS — React module (Phase 2, complete)
 *
 * Mount: <Route path="/dashboard/cms/*" element={<CmsRoot />} />
 *
 * Features over v1:
 *  - R2 file upload wired (POST /api/r2/upload, multipart)
 *  - Real publish flow (POST /api/cms/pages/:id/publish)
 *  - Draft autosave with dirty indicator
 *  - Section drag-to-reorder (HTML5 drag API → POST /api/cms/sections/reorder)
 *  - AGENT_SESSION DO inline chat via /api/agent/chat (injected CMS context)
 *  - IAM_COLLAB DO presence via /api/collab/room/cms:{pageId} (WebSocket)
 *  - cms_live_rollbacks support (GET /api/cms/pages/:id/rollbacks, POST /api/cms/rollback)
 *  - cms_activity_log feed (GET /api/cms/activity?page_id=)
 *  - Template → add to page (POST /api/cms/sections from template)
 *  - Liquid import with real R2 upload
 *  - Page metadata editor (title, seo_title, meta_description, robots)
 *  - Asset picker (GET /api/cms/assets browse + insert URL into field)
 *  - Theme CSS preview (injects compiled CSS into iframe-less preview via style tag)
 *  - All state scoped — no global overrides, no emojis
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { CmsStudioEditor } from './CmsStudioEditor.jsx';

const CMS_PROJECT_KEY = 'iam_cms_project';
const PRIMARY_CMS_SLUG = 'inneranimalmedia';

function persistCmsProject(slug) {
  try {
    if (slug) localStorage.setItem(CMS_PROJECT_KEY, slug);
  } catch {
    /* ignore */
  }
}

function sortWebsites(list) {
  const arr = [...(list || [])];
  arr.sort((a, b) => {
    if (a.slug === PRIMARY_CMS_SLUG) return -1;
    if (b.slug === PRIMARY_CMS_SLUG) return 1;
    return String(a.name || a.slug).localeCompare(String(b.name || b.slug));
  });
  return arr;
}

// ─── API helper ───────────────────────────────────────────────────────────────

const api = async (path, opts = {}) => {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, {
    headers: isForm ? {} : { 'Content-Type': 'application/json', ...opts.headers },
    credentials: 'include',
    ...opts,
    body: isForm ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const STYLES = `
.iam-cms-root {
  display:flex;flex-direction:column;height:100%;min-height:0;
  font-size:13px;color:var(--color-text-primary,#f0f0f8);
  --cv:var(--dashboard-panel,#18181f);
  --ce:var(--dashboard-canvas,#141418);
  --cb:var(--dashboard-border,rgba(255,255,255,.08));
  --ca:var(--solar-cyan,#1de9b6);--ct:var(--solar-cyan,#1de9b6);--cg:#22c55e;--cam:#f59e0b;--cr:#ef4444;
  --cm:var(--color-text-secondary,#6b7080);
  --mono:JetBrains Mono,ui-monospace,monospace;
}
.cms-page-hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;
  padding:20px 24px 12px;flex-shrink:0;border-bottom:1px solid var(--cb);}
.cms-page-hdr h1{margin:0;font-size:20px;font-weight:600;color:var(--color-text-primary,#f0f0f8);}
.cms-page-hdr p{margin:4px 0 0;font-size:12px;color:var(--cm);}
.cms-page-hdr-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.cms-topbar{display:flex;align-items:center;gap:8px;padding:0 16px;height:44px;
  border-bottom:1px solid var(--cb);background:var(--cv);flex-shrink:0;}
.cms-topbar-crumb{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--cm);}
.cms-topbar-crumb button,.cms-topbar-crumb a{background:none;border:none;padding:0;
  cursor:pointer;color:var(--cm);font-size:13px;text-decoration:none;}
.cms-topbar-crumb button:hover,.cms-topbar-crumb a:hover{color:var(--color-text-primary,#f0f0f8);}
.cms-spacer{flex:1;}
.cms-pill{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;
  border-radius:20px;font-size:11px;font-family:var(--mono);border:1px solid var(--cb);}
.cms-dot{width:6px;height:6px;border-radius:50%;background:currentColor;}

.cms-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;
  border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;
  border:1px solid var(--cb);background:transparent;color:var(--color-text-primary,#f0f0f8);
  transition:background 120ms,border-color 120ms;}
.cms-btn:hover{background:var(--ce);border-color:rgba(255,255,255,.15);}
.cms-btn:disabled{opacity:.4;cursor:not-allowed;}
.cms-btn-p{background:var(--ca);border-color:var(--ca);color:#0a0f14;font-weight:600;}
.cms-btn-p:hover{opacity:.92;}
.cms-btn-t{background:transparent;border-color:var(--ct);color:var(--ct);}
.cms-btn-t:hover{background:rgba(29,233,182,.08);}
.cms-btn-d{border-color:transparent;}
.cms-btn-d:hover{background:var(--ce);border-color:var(--cb);}
.cms-btn-sm{padding:3px 8px;font-size:11px;}
.cms-btn-ic{padding:5px;width:28px;height:28px;justify-content:center;}
.cms-btn-danger{border-color:rgba(239,68,68,.4);color:var(--cr);}
.cms-btn-danger:hover{background:rgba(239,68,68,.08);}

.cms-body{display:flex;flex:1;min-height:0;overflow:hidden;}

/* Left panel */
.cms-left{width:228px;flex-shrink:0;background:var(--cv);
  border-right:1px solid var(--cb);display:flex;flex-direction:column;overflow-y:auto;}
.cms-lsec{padding:10px 12px 6px;}
.cms-llabel{font-family:var(--mono);font-size:10px;letter-spacing:.06em;
  text-transform:uppercase;color:var(--cm);margin-bottom:6px;padding:0 2px;}
.cms-ldiv{height:1px;background:var(--cb);margin:6px 0;}

.cms-page-row{display:flex;align-items:center;gap:6px;padding:5px 8px;
  border-radius:5px;cursor:pointer;transition:background 100ms;}
.cms-page-row:hover{background:var(--ce);}
.cms-page-row.active{background:rgba(124,106,255,.12);}
.cms-page-route{flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cms-page-tag{font-family:var(--mono);font-size:9px;padding:1px 5px;
  border-radius:3px;border:1px solid;opacity:.7;}

.cms-sec-row{display:flex;align-items:center;gap:6px;padding:4px 8px;
  border-radius:5px;cursor:pointer;transition:background 100ms;user-select:none;}
.cms-sec-row:hover{background:var(--ce);}
.cms-sec-row.active{background:rgba(124,106,255,.12);}
.cms-sec-row.dragging{opacity:.4;}
.cms-sec-row.drag-over{border-top:2px solid var(--ca);}
.cms-sec-icon{width:18px;height:18px;border-radius:3px;display:flex;align-items:center;
  justify-content:center;font-family:var(--mono);font-size:9px;font-weight:700;
  background:var(--ce);color:var(--cm);flex-shrink:0;}
.cms-sec-name{flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cms-sec-type{font-family:var(--mono);font-size:9px;color:var(--cm);opacity:.7;}
.cms-sec-vis{background:none;border:none;cursor:pointer;padding:0;
  color:var(--cm);font-size:11px;line-height:1;}
.cms-sec-vis:hover{color:var(--color-text-primary,#f0f0f8);}
.cms-sec-handle{color:var(--cm);font-size:11px;cursor:grab;padding:0 2px;flex-shrink:0;}
.cms-sec-handle:active{cursor:grabbing;}

.cms-theme-pill{display:flex;align-items:center;gap:6px;padding:5px 8px;
  border-radius:5px;cursor:pointer;border:1px solid var(--cb);background:var(--ce);
  transition:border-color 100ms;}
.cms-theme-pill:hover{border-color:rgba(255,255,255,.2);}

.cms-import-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;
  border-radius:4px;font-size:10px;font-family:var(--mono);
  border:1px solid var(--ct);color:var(--ct);background:rgba(29,233,182,.06);}

/* Dirty indicator */
.cms-dirty-dot{width:6px;height:6px;border-radius:50%;background:var(--cam);flex-shrink:0;}

/* Canvas */
.cms-canvas{flex:1;overflow-y:auto;padding:20px;
  background:var(--color-background-primary,#0f0f13);position:relative;}
.cms-canvas-empty{display:flex;align-items:center;justify-content:center;
  height:100%;color:var(--cm);font-size:13px;text-align:center;flex-direction:column;gap:12px;}

.cms-sec-card{border:1.5px solid var(--cb);border-radius:6px;margin-bottom:6px;
  background:var(--cv);overflow:hidden;cursor:pointer;transition:border-color 120ms;}
.cms-sec-card:hover{border-color:rgba(124,106,255,.4);}
.cms-sec-card.active{border-color:var(--ca);}
.cms-sec-card-hdr{display:flex;align-items:center;gap:8px;padding:8px 12px;
  border-bottom:1px solid var(--cb);background:var(--ce);}
.cms-sec-card-tag{font-family:var(--mono);font-size:9px;letter-spacing:.04em;
  padding:2px 5px;border-radius:3px;background:rgba(124,106,255,.15);color:var(--ca);
  border:1px solid rgba(124,106,255,.25);}
.cms-sec-card-name{font-size:12px;font-weight:500;flex:1;}
.cms-sec-card-body{padding:12px;}
.cms-sec-preview{font-size:12px;color:var(--cm);line-height:1.5;}
.cms-sec-preview strong{color:var(--color-text-primary,#f0f0f8);display:block;
  font-size:14px;margin-bottom:4px;}
.cms-hidden{opacity:.35;}

/* Presence dots */
.cms-presence{display:flex;gap:4px;align-items:center;}
.cms-presence-dot{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0;
  border:2px solid var(--cv);}

/* Right panel */
.cms-right{width:268px;flex-shrink:0;background:var(--ce);
  border-left:1px solid var(--cb);display:flex;flex-direction:column;overflow:hidden;}
.cms-right-hdr{display:flex;align-items:center;gap:8px;padding:10px 12px 9px;
  border-bottom:1px solid var(--cb);flex-shrink:0;}
.cms-right-title{font-size:12px;font-weight:500;flex:1;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cms-right-tabs{display:flex;border-bottom:1px solid var(--cb);flex-shrink:0;}
.cms-right-tab{flex:1;padding:7px 4px;background:none;border:none;cursor:pointer;
  font-size:11px;color:var(--cm);border-bottom:2px solid transparent;transition:color 100ms;}
.cms-right-tab:hover{color:var(--color-text-primary,#f0f0f8);}
.cms-right-tab.active{color:var(--ca);border-bottom-color:var(--ca);}
.cms-right-body{flex:1;overflow-y:auto;padding:12px;}
.cms-right-footer{padding:10px 12px;border-top:1px solid var(--cb);
  display:flex;flex-direction:column;gap:6px;flex-shrink:0;}

/* Fields */
.cms-field{margin-bottom:10px;}
.cms-field-label{font-family:var(--mono);font-size:10px;color:var(--cm);
  margin-bottom:3px;display:flex;align-items:center;gap:6px;}
.cms-field-label-text{flex:1;}
.cms-field input,.cms-field textarea,.cms-field select{
  width:100%;background:var(--cv);border:1px solid var(--cb);border-radius:5px;
  color:var(--color-text-primary,#f0f0f8);font-size:12px;padding:5px 8px;
  resize:none;font-family:inherit;box-sizing:border-box;transition:border-color 100ms;}
.cms-field input:focus,.cms-field textarea:focus,.cms-field select:focus{
  outline:none;border-color:var(--ca);}
.cms-field textarea{line-height:1.5;}
.cms-field-row{display:flex;gap:6px;}
.cms-field-row .cms-field{flex:1;margin-bottom:0;}
.cms-save-ind{font-family:var(--mono);font-size:10px;color:var(--cm);text-align:center;height:14px;}
.cms-field-pick-row{display:flex;gap:4px;}
.cms-field-pick-row .cms-field{flex:1;margin-bottom:0;}

/* Agent chat */
.cms-agent-panel{display:flex;flex-direction:column;height:100%;}
.cms-agent-msgs{flex:1;overflow-y:auto;padding:8px 0;display:flex;flex-direction:column;gap:6px;}
.cms-agent-msg{padding:6px 8px;border-radius:5px;font-size:12px;line-height:1.5;}
.cms-agent-msg.user{background:rgba(124,106,255,.12);color:var(--color-text-primary,#f0f0f8);}
.cms-agent-msg.assistant{background:var(--cv);color:var(--cm);}
.cms-agent-msg.system{color:var(--cm);font-size:11px;font-family:var(--mono);opacity:.6;}
.cms-agent-input-row{display:flex;gap:6px;padding-top:8px;border-top:1px solid var(--cb);}
.cms-agent-input{flex:1;background:var(--cv);border:1px solid var(--cb);border-radius:5px;
  color:var(--color-text-primary,#f0f0f8);font-size:12px;padding:5px 8px;
  font-family:inherit;resize:none;}
.cms-agent-input:focus{outline:none;border-color:var(--ca);}

/* Activity feed */
.cms-activity-item{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--cb);}
.cms-activity-action{font-family:var(--mono);font-size:10px;color:var(--ca);}
.cms-activity-res{font-size:11px;color:var(--cm);flex:1;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cms-activity-time{font-family:var(--mono);font-size:10px;color:var(--cm);opacity:.5;}

/* Rollback list */
.cms-rollback-item{display:flex;align-items:center;gap:8px;padding:6px 0;
  border-bottom:1px solid var(--cb);}
.cms-rollback-hash{font-family:var(--mono);font-size:10px;color:var(--cm);flex:1;}
.cms-rollback-time{font-family:var(--mono);font-size:10px;color:var(--cm);opacity:.5;}

/* Websites — Shopify-style site list */
.cms-sites-wrap{flex:1;overflow-y:auto;padding:0 24px 24px;}
.cms-sites-section{margin-top:20px;}
.cms-sites-section-label{font-family:var(--mono);font-size:10px;letter-spacing:.08em;
  text-transform:uppercase;color:var(--cm);margin:0 0 10px;}
.cms-site-row{display:flex;align-items:stretch;gap:16px;padding:16px;
  border:1px solid var(--cb);border-radius:10px;background:var(--cv);
  transition:border-color 120ms,box-shadow 120ms;cursor:pointer;}
.cms-site-row:hover{border-color:rgba(29,233,182,.35);box-shadow:0 4px 24px rgba(0,0,0,.18);}
.cms-site-row.primary{border-color:rgba(29,233,182,.25);}
.cms-site-thumb{width:120px;min-height:72px;border-radius:6px;background:var(--ce);
  border:1px solid var(--cb);flex-shrink:0;display:flex;align-items:center;
  justify-content:center;font-size:10px;color:var(--cm);text-align:center;padding:8px;}
.cms-site-body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:4px;}
.cms-site-title{font-size:14px;font-weight:600;color:var(--color-text-primary,#f0f0f8);}
.cms-site-domain{font-size:12px;color:var(--cm);}
.cms-site-meta{font-size:11px;color:var(--cm);}
.cms-site-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}
.cms-site-actions-col{display:flex;flex-direction:column;align-items:flex-end;
  justify-content:center;gap:8px;flex-shrink:0;}
.cms-site-card.add{border-style:dashed;text-align:center;color:var(--cm);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:6px;min-height:88px;margin-top:12px;}
.cms-site-card.add:hover{border-color:var(--ca);color:var(--ca);}

/* Templates */
.cms-tmpl-layout{display:flex;flex-direction:column;height:100%;}
.cms-tmpl-hdr{display:flex;align-items:center;gap:8px;padding:10px 16px;
  border-bottom:1px solid var(--cb);background:var(--cv);flex-shrink:0;}
.cms-tmpl-filters{display:flex;gap:4px;padding:10px 16px;flex-shrink:0;
  border-bottom:1px solid var(--cb);overflow-x:auto;}
.cms-filter-btn{padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;
  border:1px solid var(--cb);background:none;color:var(--cm);white-space:nowrap;}
.cms-filter-btn:hover{border-color:rgba(255,255,255,.2);color:var(--color-text-primary,#f0f0f8);}
.cms-filter-btn.active{background:rgba(124,106,255,.15);border-color:var(--ca);color:var(--ca);}
.cms-tmpl-body{flex:1;overflow-y:auto;padding:16px;}
.cms-tmpl-section{margin-bottom:24px;}
.cms-tmpl-section-title{font-size:12px;font-weight:600;margin-bottom:4px;}
.cms-tmpl-section-sub{font-size:11px;color:var(--cm);margin-bottom:10px;}
.cms-tmpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;}
.cms-tmpl-card{background:var(--ce);border:1px solid var(--cb);border-radius:6px;
  overflow:hidden;cursor:pointer;transition:border-color 100ms;}
.cms-tmpl-card:hover{border-color:rgba(124,106,255,.4);}
.cms-tmpl-preview{height:80px;background:var(--cv);display:flex;align-items:center;
  justify-content:center;font-family:var(--mono);font-size:11px;color:var(--cm);
  border-bottom:1px solid var(--cb);overflow:hidden;}
.cms-tmpl-meta{padding:8px;}
.cms-tmpl-name{font-size:11px;font-weight:500;}
.cms-tmpl-tags{display:flex;gap:3px;margin-top:4px;flex-wrap:wrap;}
.cms-tmpl-tag{font-family:var(--mono);font-size:9px;padding:1px 5px;border-radius:3px;
  border:1px solid var(--cb);color:var(--cm);}
.cms-tmpl-actions{padding:0 8px 8px;}

/* Imports */
.cms-imports-layout{display:flex;flex-direction:column;height:100%;}
.cms-imports-hdr{padding:10px 16px;border-bottom:1px solid var(--cb);background:var(--cv);
  flex-shrink:0;display:flex;align-items:center;gap:8px;}
.cms-imports-body{flex:1;overflow-y:auto;padding:16px;}
.cms-dropzone{border:1.5px dashed var(--cb);border-radius:8px;padding:32px;
  text-align:center;color:var(--cm);cursor:pointer;transition:border-color 120ms,color 120ms;
  margin-bottom:16px;}
.cms-dropzone:hover,.cms-dropzone.drag-over{border-color:var(--ct);color:var(--ct);}
.cms-dropzone-title{font-size:13px;font-weight:500;margin-bottom:4px;}
.cms-dropzone-sub{font-size:11px;margin-bottom:10px;}
.cms-import-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;}
.cms-import-card{background:var(--ce);border:1px solid var(--cb);border-radius:6px;
  padding:12px;cursor:pointer;transition:border-color 100ms;}
.cms-import-card:hover{border-color:rgba(124,106,255,.4);}
.cms-import-name{font-size:12px;font-weight:500;margin-bottom:4px;}
.cms-import-meta{font-family:var(--mono);font-size:10px;color:var(--cm);}
.cms-import-status{display:inline-block;margin-top:6px;padding:1px 6px;
  border-radius:3px;font-size:10px;font-family:var(--mono);}
.cms-import-status.complete{background:rgba(34,197,94,.12);color:var(--cg);}
.cms-import-status.pending{background:rgba(245,158,11,.12);color:var(--cam);}
.cms-import-status.error{background:rgba(239,68,68,.12);color:var(--cr);}

/* Asset picker modal */
.cms-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);
  display:flex;align-items:center;justify-content:center;z-index:9000;}
.cms-modal{background:var(--cv);border:1px solid var(--cb);border-radius:8px;
  width:600px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;}
.cms-modal-hdr{display:flex;align-items:center;padding:12px 16px;
  border-bottom:1px solid var(--cb);gap:8px;}
.cms-modal-title{font-size:13px;font-weight:500;flex:1;}
.cms-modal-body{flex:1;overflow-y:auto;padding:12px;}
.cms-asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;}
.cms-asset-thumb{border-radius:5px;overflow:hidden;cursor:pointer;
  border:1.5px solid var(--cb);aspect-ratio:1;
  display:flex;align-items:center;justify-content:center;background:var(--ce);}
.cms-asset-thumb:hover{border-color:var(--ca);}
.cms-asset-thumb img{width:100%;height:100%;object-fit:cover;}
.cms-asset-key{font-family:var(--mono);font-size:9px;color:var(--cm);
  padding:3px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* Page meta editor */
.cms-meta-editor{padding:4px 0;}

/* Toast */
.cms-toast-wrap{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
  z-index:9999;pointer-events:none;}
.cms-toast{padding:8px 14px;border-radius:6px;font-size:12px;background:var(--ce);
  border:1px solid var(--cb);box-shadow:0 4px 16px rgba(0,0,0,.4);
  animation:toast-in 200ms ease;}
@keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

.cms-loading{padding:40px;text-align:center;color:var(--cm);font-size:12px;}
.cms-error{padding:40px;text-align:center;color:var(--cr);font-size:12px;}

/* Theme swatches */
.cms-swatches{display:flex;gap:2px;}
.cms-swatch{width:10px;height:10px;border-radius:50%;border:1px solid rgba(255,255,255,.12);}
.cms-theme-list{display:flex;flex-direction:column;gap:4px;}
.cms-theme-row{display:flex;align-items:center;gap:8px;padding:6px 8px;
  border-radius:5px;cursor:pointer;border:1px solid transparent;
  transition:border-color 100ms,background 100ms;}
.cms-theme-row:hover{background:var(--cv);}
.cms-theme-row.active{border-color:var(--ca);background:rgba(124,106,255,.08);}
.cms-theme-row-name{flex:1;font-size:12px;}
.cms-theme-row-fam{font-family:var(--mono);font-size:9px;color:var(--cm);}

/* Divider label */
.cms-divider-label{display:flex;align-items:center;gap:6px;margin:10px 0 6px;}
.cms-divider-label span{font-family:var(--mono);font-size:9px;color:var(--cm);
  text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;}
.cms-divider-label::before,.cms-divider-label::after{
  content:'';flex:1;height:1px;background:var(--cb);}
`;

function injectStyles() {
  if (document.getElementById('iam-cms-v2-styles')) return;
  const el = document.createElement('style');
  el.id = 'iam-cms-v2-styles';
  el.textContent = STYLES;
  document.head.appendChild(el);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const statusColor = s =>
  s === 'published' ? 'var(--cg)' : s === 'draft' ? 'var(--cam)' : 'var(--cm)';

const ICONS = { hero:'H', services:'S', statement:'T', cta:'C', service:'S',
  principles:'P', overview:'O', skills:'K', founder_story:'F', form_info:'F',
  intake_cta:'I', 'case-study':'W', default:'#' };
const sIcon = t => ICONS[t] || ICONS.default;

const relTime = ts => {
  if (!ts) return '';
  const s = Math.floor((Date.now() - (typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime())) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
};

const PRESENCE_COLORS = ['#7c6aff','#1de9b6','#f59e0b','#ef4444','#22c55e','#3b82f6'];

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState(null);
  const show = useCallback((text, ms = 2200) => {
    setMsg(text);
    setTimeout(() => setMsg(null), ms);
  }, []);
  return { msg, show };
}
function Toast({ msg }) {
  if (!msg) return null;
  return <div className="cms-toast-wrap"><div className="cms-toast">{msg}</div></div>;
}

// ─── Asset Picker Modal ───────────────────────────────────────────────────────

function AssetPicker({ onSelect, onClose }) {
  const [assets, setAssets] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api('/api/cms/assets?category=image').then(d => setAssets(d.assets || [])).catch(() => setAssets([]));
  }, []);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('bucket', 'inneranimalmedia');
      form.append('key', `cms/uploads/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, '_')}`);
      const result = await api('/api/r2/upload', { method: 'POST', body: form });
      const url = result.url || `/api/r2/buckets/inneranimalmedia/object/${encodeURIComponent(result.key)}`;
      onSelect(url);
    } catch (e) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="cms-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cms-modal">
        <div className="cms-modal-hdr">
          <span className="cms-modal-title">Asset library</span>
          <button className="cms-btn cms-btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload file'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
            onChange={e => handleUpload(e.target.files[0])} />
          <button className="cms-btn cms-btn-ic cms-btn-d" onClick={onClose}>x</button>
        </div>
        <div className="cms-modal-body">
          {!assets ? (
            <div className="cms-loading">Loading assets...</div>
          ) : (
            <div className="cms-asset-grid">
              {assets.map(a => (
                <div key={a.id} className="cms-asset-thumb" onClick={() => onSelect(a.public_url || a.cdn_url || a.path)}>
                  <img src={a.public_url || a.cdn_url || a.path} alt={a.alt_text || a.filename}
                    onError={e => { e.target.style.display = 'none'; }} />
                </div>
              ))}
              {assets.length === 0 && (
                <div style={{ color:'var(--cm)', fontSize:12, gridColumn:'1/-1', textAlign:'center', padding:'20px 0' }}>
                  No assets yet. Upload one above.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section fields editor ────────────────────────────────────────────────────

function SectionFields({ section, onSave, onToast }) {
  const [data, setData] = useState(() => section.section_data || {});
  const [saving, setSaving] = useState(false);
  const [assetPickerField, setAssetPickerField] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => { setData(section.section_data || {}); }, [section.id]);

  const update = (key, value) => {
    const next = { ...data, [key]: value };
    setData(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSave(next), 1200);
  };

  const doSave = async (d) => {
    setSaving(true);
    try {
      await api(`/api/cms/sections/${section.id}`, { method: 'PUT', body: { section_data: d } });
      onSave?.(section.id, d);
      onToast('Saved');
    } catch (e) {
      onToast(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const keys = Object.keys(data);
  const isUrlKey = k => k.endsWith('_url') || k.endsWith('_image') || k.endsWith('_src');

  return (
    <div>
      {keys.map(key => {
        const val = data[key];
        if (typeof val === 'object' && val !== null) return null;
        const isLong = String(val).length > 60 || ['body','paragraph','description','subheadline','subheading'].some(s => key.includes(s));
        const isUrl = isUrlKey(key);
        return (
          <div className="cms-field" key={key}>
            <label className="cms-field-label">
              <span className="cms-field-label-text">{key}</span>
              {isUrl && (
                <button className="cms-btn cms-btn-sm cms-btn-d" style={{ fontSize:10 }}
                  onClick={() => setAssetPickerField(key)}>
                  Pick
                </button>
              )}
            </label>
            {isLong ? (
              <textarea value={String(val)} rows={3} onChange={e => update(key, e.target.value)} />
            ) : (
              <input value={String(val)} onChange={e => update(key, e.target.value)} />
            )}
          </div>
        );
      })}
      {keys.length === 0 && (
        <div style={{ color:'var(--cm)', fontSize:11, padding:'8px 0' }}>
          No editable fields. section_data is empty.
        </div>
      )}
      <div className="cms-save-ind">{saving ? 'Saving...' : ''}</div>

      {assetPickerField && (
        <AssetPicker
          onSelect={url => { update(assetPickerField, url); setAssetPickerField(null); }}
          onClose={() => setAssetPickerField(null)}
        />
      )}
    </div>
  );
}

// ─── Page meta editor ─────────────────────────────────────────────────────────

function PageMetaEditor({ page, onToast }) {
  const [title, setTitle] = useState(page.title || '');
  const [seoTitle, setSeoTitle] = useState(page.seo_title || '');
  const [metaDesc, setMetaDesc] = useState(page.meta_description || '');
  const [robots, setRobots] = useState(page.robots || 'index,follow');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/cms/pages/${page.id}`, {
        method: 'PUT',
        body: { title, seo_title: seoTitle, meta_description: metaDesc, robots }
      });
      onToast('Page settings saved');
    } catch (e) {
      onToast(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cms-meta-editor">
      <div className="cms-field">
        <label className="cms-field-label"><span>title</span></label>
        <input value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div className="cms-field">
        <label className="cms-field-label"><span>seo_title</span></label>
        <input value={seoTitle} onChange={e => setSeoTitle(e.target.value)} />
      </div>
      <div className="cms-field">
        <label className="cms-field-label"><span>meta_description</span></label>
        <textarea value={metaDesc} rows={3} onChange={e => setMetaDesc(e.target.value)} />
      </div>
      <div className="cms-field">
        <label className="cms-field-label"><span>robots</span></label>
        <select value={robots} onChange={e => setRobots(e.target.value)}>
          <option value="index,follow">index,follow</option>
          <option value="noindex,follow">noindex,follow</option>
          <option value="index,nofollow">index,nofollow</option>
          <option value="noindex,nofollow">noindex,nofollow</option>
        </select>
      </div>
      <button className="cms-btn cms-btn-p cms-btn-sm" style={{ width:'100%', justifyContent:'center' }}
        onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save page settings'}
      </button>
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

function ActivityFeed({ pageId }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!pageId) return;
    api(`/api/cms/activity?page_id=${pageId}`).then(d => setItems(d.activity || [])).catch(() => setItems([]));
  }, [pageId]);

  if (!pageId) return <div style={{ color:'var(--cm)', fontSize:11, padding:'8px 0' }}>Select a page.</div>;
  if (!items) return <div className="cms-loading">Loading...</div>;
  if (!items.length) return <div style={{ color:'var(--cm)', fontSize:11, padding:'8px 0' }}>No activity yet.</div>;

  return (
    <div>
      {items.map(a => (
        <div key={a.id} className="cms-activity-item">
          <span className="cms-activity-action">{a.action}</span>
          <span className="cms-activity-res">{a.resource_type}/{a.resource_id}</span>
          <span className="cms-activity-time">{relTime(a.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Rollback panel ───────────────────────────────────────────────────────────

function RollbackPanel({ pageId, onRollback, onToast }) {
  const [items, setItems] = useState(null);
  const [rolling, setRolling] = useState(null);

  useEffect(() => {
    if (!pageId) return;
    api(`/api/cms/pages/${pageId}/rollbacks`).then(d => setItems(d.rollbacks || [])).catch(() => setItems([]));
  }, [pageId]);

  const doRollback = async (item) => {
    if (!confirm('Rollback to this version?')) return;
    setRolling(item.id);
    try {
      await api('/api/cms/rollback', { method: 'POST', body: { rollback_id: item.id, page_id: pageId } });
      onToast('Rolled back');
      onRollback?.();
    } catch (e) {
      onToast(`Error: ${e.message}`);
    } finally {
      setRolling(null);
    }
  };

  if (!pageId) return <div style={{ color:'var(--cm)', fontSize:11, padding:'8px 0' }}>Select a page.</div>;
  if (!items) return <div className="cms-loading">Loading...</div>;
  if (!items.length) return <div style={{ color:'var(--cm)', fontSize:11, padding:'8px 0' }}>No rollback snapshots yet. They are created automatically on publish.</div>;

  return (
    <div>
      {items.map(item => (
        <div key={item.id} className="cms-rollback-item">
          <span className="cms-rollback-hash">{item.deployed_html_hash?.slice(0,12) || item.id.slice(0,12)}</span>
          <span className="cms-rollback-time">{relTime(item.created_at)}</span>
          <button className="cms-btn cms-btn-sm cms-btn-danger"
            disabled={rolling === item.id} onClick={() => doRollback(item)}>
            {rolling === item.id ? '...' : 'Restore'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Agent Sam inline chat ────────────────────────────────────────────────────

function AgentCmsPanel({ pageId, sectionId, sectionType, onApply, onToast }) {
  const [msgs, setMsgs] = useState([
    { role:'system', content:`CMS context: page=${pageId}, section=${sectionId || 'none'}, type=${sectionType || 'none'}` }
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    const userMsg = { role:'user', content:text };
    setMsgs(m => [...m, userMsg]);
    setStreaming(true);
    const assistantMsg = { role:'assistant', content:'' };
    setMsgs(m => [...m, assistantMsg]);

    try {
      const systemPrompt = `You are an inline CMS editor assistant for Inner Animal Media.
Current page_id: ${pageId}. Current section_id: ${sectionId || 'none'}. Section type: ${sectionType || 'none'}.
Help the user improve copy, suggest section_data field values, or describe changes.
If you produce updated section_data, output ONLY a JSON object wrapped in <section_data>...</section_data> tags.
Keep responses concise and actionable.`;

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [...msgs.filter(m => m.role !== 'system'), userMsg].map(m => ({
            role: m.role, content: m.content
          })),
          system: systemPrompt,
          stream: true,
          mode: 'ask',
          cms_context: { page_id: pageId, section_id: sectionId, section_type: sectionType },
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        // Handle SSE lines: data: {...} or data: [DONE]
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            const delta = obj.choices?.[0]?.delta?.content || obj.content || obj.text || '';
            full += delta;
            setMsgs(m => {
              const copy = [...m];
              copy[copy.length - 1] = { role:'assistant', content: full };
              return copy;
            });
          } catch (_) {}
        }
      }

      // Check for <section_data> tag
      const match = full.match(/<section_data>([\s\S]*?)<\/section_data>/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1].trim());
          onApply?.(parsed);
          onToast('Agent applied changes');
        } catch (_) {}
      }
    } catch (e) {
      setMsgs(m => {
        const copy = [...m];
        copy[copy.length - 1] = { role:'assistant', content:`Error: ${e.message}` };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="cms-agent-panel">
      <div className="cms-agent-msgs">
        {msgs.filter(m => m.role !== 'system').map((m, i) => (
          <div key={i} className={`cms-agent-msg ${m.role}`}>{m.content}</div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="cms-agent-input-row">
        <textarea
          className="cms-agent-input"
          rows={2}
          value={input}
          placeholder="Rewrite this headline, improve the CTA, add a services list..."
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="cms-btn cms-btn-p cms-btn-sm" onClick={send} disabled={streaming}>
          {streaming ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ─── Theme panel ──────────────────────────────────────────────────────────────

function ThemePanel({ themes, activeThemeId, projectSlug, onActivate, onToast }) {
  const [activating, setActivating] = useState(null);

  const activate = async (theme) => {
    setActivating(theme.id);
    try {
      await api('/api/cms/themes/activate', {
        method: 'POST',
        body: { theme_id: theme.id, theme_slug: theme.slug, project_slug: projectSlug }
      });
      onActivate(theme.id, theme);
      onToast(`Theme: ${theme.name}`);
    } catch (e) {
      onToast(`Error: ${e.message}`);
    } finally {
      setActivating(null);
    }
  };

  return (
    <div className="cms-theme-list">
      {themes.map(t => {
        const vars = t.css_vars || {};
        const swatchColors = ['--color-accent','--color-background-primary','--color-text-primary','--color-surface']
          .map(k => vars[k]).filter(Boolean);
        return (
          <div key={t.id}
            className={`cms-theme-row${t.id === activeThemeId ? ' active' : ''}`}
            onClick={() => t.id !== activeThemeId && activate(t)}>
            <div className="cms-swatches">
              {swatchColors.slice(0,4).map((c,i) => (
                <div key={i} className="cms-swatch" style={{ background:c }} />
              ))}
            </div>
            <span className="cms-theme-row-name">{t.name}</span>
            <span className="cms-theme-row-fam">{t.theme_family}</span>
            {activating === t.id && <span style={{ fontSize:10, color:'var(--cm)' }}>...</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Presence indicator ───────────────────────────────────────────────────────

function usePresence(pageId, workspaceId) {
  const [peers, setPeers] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!pageId || !workspaceId) return;
    const room = `cms:${pageId}`;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/collab/room/${encodeURIComponent(room)}?workspace_id=${workspaceId}`;

    let ws;
    try {
      ws = new WebSocket(url);
      wsRef.current = ws;
    } catch (_) { return; }

    ws.onopen = () => ws.send(JSON.stringify({ type:'presence_join', page_id: pageId }));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'presence_state') {
          setPeers(msg.peers || []);
        }
      } catch (_) {}
    };
    ws.onclose = () => setPeers([]);

    // Send heartbeat
    const heartbeat = setInterval(() => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type:'heartbeat' }));
    }, 15000);

    return () => {
      clearInterval(heartbeat);
      ws.close();
    };
  }, [pageId, workspaceId]);

  return peers;
}

// ─── Main Editor view ─────────────────────────────────────────────────────────

function EditorView({ projectSlug, workspaceId, pageId, onNavigate, onNavigatePath }) {
  const [bootstrap, setBootstrap] = useState(null);
  const [error, setError] = useState(null);
  const [activePage, setActivePage] = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [rightTab, setRightTab] = useState('fields'); // 'fields' | 'theme' | 'agent' | 'activity' | 'rollbacks' | 'meta'
  const [publishing, setPublishing] = useState(false);
  const [dirtyPages, setDirtyPages] = useState(new Set());
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const { msg: toastMsg, show: showToast } = useToast();
  const slug = projectSlug || PRIMARY_CMS_SLUG;
  const peers = usePresence(activePage?.id, workspaceId);

  const selectPage = useCallback(
    (page) => {
      if (!page) return;
      setActivePage(page);
      const params = new URLSearchParams();
      params.set('project', slug);
      params.set('page', page.id);
      onNavigatePath?.(`/dashboard/cms/editor?${params.toString()}`, { replace: true });
    },
    [onNavigatePath, slug],
  );

  useEffect(() => {
    persistCmsProject(slug);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setBootstrap(null);
    setError(null);
    api(`/api/cms/bootstrap?project_slug=${encodeURIComponent(slug)}`)
      .then((d) => {
        if (!cancelled) setBootstrap(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!bootstrap?.pages?.length) return;
    const pages = bootstrap.pages;
    if (pageId) {
      const p = pages.find((x) => x.id === pageId);
      if (p) setActivePage(p);
      return;
    }
    const home = pages.find((p) => p.is_homepage) || pages[0];
    if (home) selectPage(home);
  }, [bootstrap, pageId, selectPage]);

  const currentSections = activePage
    ? ((bootstrap?.sections_by_page?.[activePage.id] || [])).slice().sort((a,b) => a.sort_order - b.sort_order)
    : [];

  const activeTheme = bootstrap?.active_theme;

  // Inject theme CSS when active theme changes
  useEffect(() => {
    if (!activeTheme?.css_r2_key) return;
    const existing = document.getElementById('iam-cms-preview-theme');
    if (existing) existing.remove();
    // Fetch the compiled CSS from R2 and inject it
    // (scoped to canvas via .cms-canvas only — no global injection)
    fetch(`/api/r2/buckets/inneranimalmedia/object/${encodeURIComponent(activeTheme.css_r2_key)}`)
      .then(r => r.text())
      .then(css => {
        const style = document.createElement('style');
        style.id = 'iam-cms-preview-theme';
        // Scope all rules to .cms-canvas-preview
        style.textContent = css.replace(/([^{}]+)\{/g, (_, sel) =>
          `.cms-canvas-preview ${sel.trim()} {`
        );
        document.head.appendChild(style);
      })
      .catch(() => {});
    return () => { document.getElementById('iam-cms-preview-theme')?.remove(); };
  }, [activeTheme?.id]);

  const markDirty = (pageId) => setDirtyPages(prev => new Set([...prev, pageId]));

  const handleSectionSave = useCallback((sectionId, newData) => {
    if (!activePage) return;
    setBootstrap(prev => {
      if (!prev) return prev;
      const pid = activePage.id;
      const secs = (prev.sections_by_page?.[pid] || []).map(s =>
        s.id === sectionId ? { ...s, section_data: newData } : s
      );
      return { ...prev, sections_by_page: { ...prev.sections_by_page, [pid]: secs } };
    });
    markDirty(activePage.id);
  }, [activePage]);

  const handleVisibilityToggle = async (section) => {
    const next = section.is_visible ? 0 : 1;
    try {
      await api(`/api/cms/sections/${section.id}/visibility`, { method:'POST', body:{ is_visible:next } });
      setBootstrap(prev => {
        if (!prev || !activePage) return prev;
        const pid = activePage.id;
        const secs = (prev.sections_by_page?.[pid] || []).map(s =>
          s.id === section.id ? { ...s, is_visible: next } : s
        );
        return { ...prev, sections_by_page: { ...prev.sections_by_page, [pid]: secs } };
      });
      showToast(next ? 'Section shown' : 'Section hidden');
    } catch (e) { showToast(`Error: ${e.message}`); }
  };

  // Drag-to-reorder
  const handleDragStart = (id) => setDragging(id);
  const handleDragEnd = () => { setDragging(null); setDragOver(null); };
  const handleDragOver = (e, id) => { e.preventDefault(); setDragOver(id); };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    if (!dragging || dragging === targetId || !activePage) return;
    const pid = activePage.id;
    const secs = (bootstrap?.sections_by_page?.[pid] || []).slice().sort((a,b) => a.sort_order - b.sort_order);
    const fromIdx = secs.findIndex(s => s.id === dragging);
    const toIdx = secs.findIndex(s => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...secs];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const order = reordered.map((s, i) => ({ id: s.id, sort_order: i * 10 }));
    // Optimistic update
    const updatedSecs = reordered.map((s, i) => ({ ...s, sort_order: i * 10 }));
    setBootstrap(prev => prev ? {
      ...prev, sections_by_page: { ...prev.sections_by_page, [pid]: updatedSecs }
    } : prev);
    setDragging(null); setDragOver(null);
    try {
      await api('/api/cms/sections/reorder', { method:'POST', body:{ order } });
      showToast('Reordered');
    } catch (e) { showToast(`Error: ${e.message}`); }
  };

  const handlePublish = async () => {
    if (!activePage) return;
    setPublishing(true);
    try {
      // Write rollback snapshot first
      await api('/api/cms/pages/' + activePage.id + '/snapshot', { method:'POST', body:{} }).catch(() => {});
      await api('/api/cms/pages/' + activePage.id + '/publish', { method:'POST', body:{} });
      setDirtyPages(prev => { const n = new Set(prev); n.delete(activePage.id); return n; });
      setBootstrap(prev => prev ? {
        ...prev,
        pages: (prev.pages || []).map(p => p.id === activePage.id ? { ...p, status:'published' } : p)
      } : prev);
      showToast('Published');
    } catch (e) { showToast(`Error: ${e.message}`); }
    finally { setPublishing(false); }
  };

  const handleAgentApply = useCallback((newData) => {
    if (!activeSection) return;
    handleSectionSave(activeSection.id, { ...activeSection.section_data, ...newData });
    setActiveSection(s => s ? { ...s, section_data: { ...s.section_data, ...newData } } : s);
  }, [activeSection, handleSectionSave]);

  if (error) return <div className="cms-error">{error}</div>;
  if (!bootstrap) return <div className="cms-loading">Loading...</div>;

  const pages = bootstrap.pages || [];
  const themes = bootstrap.themes || [];
  const isDirty = activePage && dirtyPages.has(activePage.id);

  // Right panel tabs
  const TABS = [
    { id:'fields', label:'Fields' },
    { id:'theme', label:'Theme' },
    { id:'meta', label:'Meta' },
    { id:'agent', label:'Agent' },
    { id:'activity', label:'Log' },
    { id:'rollbacks', label:'History' },
  ];

  return (
    <>
      <div className="cms-topbar">
        <div className="cms-topbar-crumb">
          <button type="button" onClick={() => onNavigate('sites')}>Sites</button>
          <span style={{ opacity:.4 }}>/</span>
          <span style={{ color:'var(--cm)' }}>{slug}</span>
          {activePage && <>
            <span style={{ opacity:.4 }}>/</span>
            <span style={{ color:'var(--color-text-primary,#f0f0f8)', fontWeight:500 }}>
              {activePage.route_path}
            </span>
          </>}
        </div>
        <div className="cms-spacer" />
        {/* Presence dots */}
        {peers.length > 0 && (
          <div className="cms-presence">
            {peers.slice(0,4).map((p, i) => (
              <div key={p.id || i} className="cms-presence-dot"
                style={{ background: PRESENCE_COLORS[i % PRESENCE_COLORS.length] }}
                title={p.user_id || 'Editor'}>
                {(p.user_id || 'U')[0].toUpperCase()}
              </div>
            ))}
          </div>
        )}
        {isDirty && <div className="cms-dirty-dot" title="Unsaved changes" />}
        {activePage && (
          <span className="cms-pill">
            <span className="cms-dot" style={{ color: statusColor(activePage.status) }} />
            <span style={{ fontSize:10, color: statusColor(activePage.status) }}>{activePage.status}</span>
          </span>
        )}
        <button className="cms-btn cms-btn-p cms-btn-sm" disabled={publishing || !activePage}
          onClick={handlePublish}>
          {publishing ? 'Publishing...' : 'Publish'}
        </button>
      </div>

      <div className="cms-body">
        {/* Left */}
        <div className="cms-left">
          <div className="cms-lsec">
            <div className="cms-llabel">Pages</div>
            {pages.map(p => (
              <div key={p.id}
                className={`cms-page-row${activePage?.id === p.id ? ' active' : ''}`}
                onClick={() => { selectPage(p); setActiveSection(null); }}>
                <span className="cms-dot" style={{ color: statusColor(p.status), flexShrink:0 }} />
                <span className="cms-page-route">{p.route_path}</span>
                {dirtyPages.has(p.id) && <div className="cms-dirty-dot" />}
                <span className="cms-page-tag"
                  style={{ borderColor: statusColor(p.status), color: statusColor(p.status) }}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>

          {activePage && <>
            <div className="cms-ldiv" />
            <div className="cms-lsec">
              <div className="cms-llabel">Sections</div>
              {currentSections.map(s => (
                <div key={s.id}
                  className={`cms-sec-row${activeSection?.id === s.id ? ' active' : ''}${dragging === s.id ? ' dragging' : ''}${dragOver === s.id ? ' drag-over' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(s.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={e => handleDragOver(e, s.id)}
                  onDrop={e => handleDrop(e, s.id)}
                  onClick={() => { setActiveSection(s); setRightTab('fields'); }}>
                  <span className="cms-sec-handle" title="Drag to reorder">&#8942;</span>
                  <span className="cms-sec-icon">{sIcon(s.section_type)}</span>
                  <span className="cms-sec-name">{s.section_name}</span>
                  <span className="cms-sec-type">{s.section_type}</span>
                  <button className="cms-sec-vis"
                    onClick={e => { e.stopPropagation(); handleVisibilityToggle(s); }}>
                    {s.is_visible ? 'v' : '-'}
                  </button>
                </div>
              ))}
              <button className="cms-btn cms-btn-t cms-btn-sm"
                style={{ width:'100%', marginTop:6, justifyContent:'center' }}
                onClick={() => onNavigate('templates')}>
                + Add section
              </button>
            </div>
          </>}

          <div className="cms-ldiv" />
          <div className="cms-lsec">
            <div className="cms-llabel">Theme</div>
            {activeTheme ? (
              <div className="cms-theme-pill" onClick={() => setRightTab('theme')}>
                <div className="cms-swatches">
                  {Object.values(activeTheme.css_vars || {}).filter(v => v.startsWith('#')).slice(0,4).map((c,i) => (
                    <div key={i} className="cms-swatch" style={{ background:c }} />
                  ))}
                </div>
                <span style={{ flex:1, fontSize:11, overflow:'hidden', textOverflow:'ellipsis' }}>
                  {activeTheme.name}
                </span>
                <span style={{ fontSize:10, color:'var(--cm)' }}>Change</span>
              </div>
            ) : (
              <button className="cms-btn cms-btn-sm" style={{ width:'100%' }}
                onClick={() => setRightTab('theme')}>
                Pick theme
              </button>
            )}
          </div>

          <div className="cms-ldiv" />
          <div className="cms-lsec">
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
              <div className="cms-llabel" style={{ margin:0 }}>Liquid imports</div>
              <span className="cms-import-badge">{bootstrap.liquid_imports?.length || 0} imported</span>
            </div>
            <button className="cms-btn cms-btn-t cms-btn-sm"
              style={{ width:'100%', justifyContent:'center' }}
              onClick={() => onNavigate('imports')}>
              + Import .zip / .tar.gz
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="cms-canvas">
          {!activePage ? (
            <div className="cms-canvas-empty">
              <div>Select a page to start editing</div>
            </div>
          ) : currentSections.length === 0 ? (
            <div className="cms-canvas-empty">
              <div>No sections on this page.</div>
              <button className="cms-btn cms-btn-t cms-btn-sm"
                onClick={() => onNavigate('templates')}>
                Add a section from templates
              </button>
            </div>
          ) : (
            <div className="cms-canvas-preview">
              {currentSections.map(s => (
                <div key={s.id}
                  className={`cms-sec-card${activeSection?.id === s.id ? ' active' : ''}${!s.is_visible ? ' cms-hidden' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(s.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={e => handleDragOver(e, s.id)}
                  onDrop={e => handleDrop(e, s.id)}
                  onClick={() => { setActiveSection(s); setRightTab('fields'); }}>
                  <div className="cms-sec-card-hdr">
                    <span style={{ width:18, height:18, borderRadius:3, display:'flex',
                      alignItems:'center', justifyContent:'center',
                      background:'var(--cv)', color:'var(--cm)', fontFamily:'var(--mono)',
                      fontSize:9, fontWeight:700, flexShrink:0 }}>{sIcon(s.section_type)}</span>
                    <span className="cms-sec-card-name">{s.section_name}</span>
                    <span className="cms-sec-card-tag">{s.section_type}</span>
                    {!s.is_visible && (
                      <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--cm)',
                        border:'1px solid', padding:'1px 4px', borderRadius:3 }}>hidden</span>
                    )}
                  </div>
                  <div className="cms-sec-card-body">
                    <div className="cms-sec-preview">
                      {(() => {
                        const d = s.section_data || {};
                        const headline = d.headline || d.heading || d.title || '';
                        const body = d.body || d.paragraph || d.description || '';
                        return <>
                          {headline && <strong>{String(headline).slice(0,80)}</strong>}
                          {body && <div>{String(body).slice(0,100)}{String(body).length > 100 ? '...' : ''}</div>}
                        </>;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="cms-right">
          <div className="cms-right-hdr">
            <span className="cms-right-title">
              {activeSection ? activeSection.section_name : 'Inspector'}
            </span>
            {activeSection && (
              <span className="cms-sec-card-tag"
                style={{ fontFamily:'var(--mono)', fontSize:9, padding:'2px 5px', borderRadius:3,
                  background:'rgba(124,106,255,.15)', color:'var(--ca)', border:'1px solid rgba(124,106,255,.25)' }}>
                {activeSection.section_type}
              </span>
            )}
          </div>
          <div className="cms-right-tabs">
            {TABS.map(tab => (
              <button key={tab.id}
                className={`cms-right-tab${rightTab === tab.id ? ' active' : ''}`}
                onClick={() => setRightTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="cms-right-body">
            {rightTab === 'fields' && (
              activeSection
                ? <SectionFields key={activeSection.id} section={activeSection}
                    onSave={handleSectionSave} onToast={showToast} />
                : <div style={{ color:'var(--cm)', fontSize:11 }}>Select a section to edit its fields.</div>
            )}
            {rightTab === 'theme' && (
              <ThemePanel themes={themes} activeThemeId={activeTheme?.id}
                projectSlug={slug}
                onActivate={(id, theme) => setBootstrap(prev => prev ? {
                  ...prev,
                  active_theme: theme,
                  themes: prev.themes.map(t => ({ ...t, is_active: t.id === id }))
                } : prev)}
                onToast={showToast} />
            )}
            {rightTab === 'meta' && activePage && (
              <PageMetaEditor page={activePage} onToast={showToast} />
            )}
            {rightTab === 'agent' && (
              <AgentCmsPanel
                pageId={activePage?.id}
                sectionId={activeSection?.id}
                sectionType={activeSection?.section_type}
                onApply={handleAgentApply}
                onToast={showToast} />
            )}
            {rightTab === 'activity' && (
              <ActivityFeed pageId={activePage?.id} />
            )}
            {rightTab === 'rollbacks' && (
              <RollbackPanel
                pageId={activePage?.id}
                onRollback={() => {
                  api(`/api/cms/bootstrap?project_slug=${slug}`).then(d => setBootstrap(d)).catch(() => {});
                }}
                onToast={showToast} />
            )}
          </div>
          {(rightTab === 'fields' && activeSection) && (
            <div className="cms-right-footer">
              <button className="cms-btn cms-btn-p"
                style={{ width:'100%', justifyContent:'center' }}
                onClick={handlePublish} disabled={publishing}>
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          )}
        </div>
      </div>
      <Toast msg={toastMsg} />
    </>
  );
}

// ─── Websites view ────────────────────────────────────────────────────────────

function WebsitesView({ onNavigatePath }) {
  const [websites, setWebsites] = useState(null);
  const [error, setError] = useState(null);
  const { msg, show } = useToast();

  const openEditor = useCallback(
    (slug) => {
      persistCmsProject(slug);
      onNavigatePath?.(`/dashboard/cms/${encodeURIComponent(slug)}/pages`);
    },
    [onNavigatePath],
  );

  useEffect(() => {
    api('/api/cms/websites')
      .then((d) => setWebsites(sortWebsites(d.websites || [])))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="cms-error">{error}</div>;
  if (!websites) return <div className="cms-loading">Loading sites…</div>;

  const primary = websites.find((w) => w.slug === PRIMARY_CMS_SLUG);
  const others = websites.filter((w) => w.slug !== PRIMARY_CMS_SLUG);

  const renderSiteRow = (w, { primarySite = false } = {}) => {
    const domain = w.domain || `${w.slug}.workers.dev`;
    const storeUrl = w.domain ? `https://${w.domain}` : null;
    return (
      <div
        key={w.id}
        className={`cms-site-row${primarySite ? ' primary' : ''}`}
        onClick={() => openEditor(w.slug)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openEditor(w.slug);
        }}
      >
        <div className="cms-site-thumb">{w.name || w.slug}</div>
        <div className="cms-site-body">
          <div className="cms-site-title">{w.name || w.slug}</div>
          <div className="cms-site-domain">{domain}</div>
          <div className="cms-site-meta">
            {w.page_count} page{w.page_count !== 1 ? 's' : ''}
            {w.theme ? ` · ${w.theme} theme` : ''}
          </div>
          <div className="cms-site-badges">
            {primarySite ? (
              <span className="cms-pill">
                <span className="cms-dot" style={{ color: 'var(--ca)' }} />
                <span style={{ fontSize: 10, color: 'var(--ca)' }}>Primary</span>
              </span>
            ) : null}
            <span className="cms-pill">
              <span className="cms-dot" style={{ color: 'var(--cg)' }} />
              <span style={{ fontSize: 10, color: 'var(--cg)' }}>Live</span>
            </span>
          </div>
        </div>
        <div className="cms-site-actions-col">
          {storeUrl ? (
            <a
              className="cms-btn cms-btn-sm cms-btn-d"
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              View store
            </a>
          ) : null}
          <button
            type="button"
            className="cms-btn cms-btn-p cms-btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              openEditor(w.slug);
            }}
          >
            Customize
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="cms-page-hdr">
        <div>
          <h1>Sites</h1>
          <p>Websites connected to your workspace. Edit pages and publish to production.</p>
        </div>
        <div className="cms-page-hdr-actions">
          {primary?.domain ? (
            <a
              className="cms-btn cms-btn-sm cms-btn-d"
              href={`https://${primary.domain}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View inneranimalmedia.com
            </a>
          ) : null}
          <button type="button" className="cms-btn cms-btn-sm" onClick={() => show('Tenant onboarding — coming soon')}>
            Add site
          </button>
        </div>
      </div>
      <div className="cms-sites-wrap">
        {primary ? (
          <div className="cms-sites-section">
            <p className="cms-sites-section-label">Current site</p>
            {renderSiteRow(primary, { primarySite: true })}
          </div>
        ) : null}
        {others.length > 0 ? (
          <div className="cms-sites-section">
            <p className="cms-sites-section-label">All sites</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {others.map((w) => renderSiteRow(w))}
            </div>
          </div>
        ) : null}
        <div
          className="cms-site-card add"
          role="button"
          tabIndex={0}
          onClick={() => show('Tenant onboarding — coming soon')}
        >
          <span style={{ fontSize: 20, opacity: 0.5 }}>+</span>
          <span style={{ fontSize: 12 }}>Connect another website</span>
        </div>
      </div>
      <Toast msg={msg} />
    </>
  );
}

// ─── Templates view ───────────────────────────────────────────────────────────

function TemplatesView({ onNavigate, addToPageId }) {
  const [templates, setTemplates] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(null);
  const { msg, show } = useToast();

  useEffect(() => {
    api('/api/cms/templates').then(d => setTemplates(d.templates || [])).catch(e => setError(e.message));
  }, []);

  if (error) return <div className="cms-error">{error}</div>;
  if (!templates) return <div className="cms-loading">Loading...</div>;

  const categories = ['All', ...Array.from(new Set(templates.map(t => t.category).filter(Boolean))).sort()];
  const filtered = activeCategory === 'All' ? templates : templates.filter(t => t.category === activeCategory);
  const groups = {};
  for (const t of filtered) {
    const cat = t.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  }

  const handleUse = async (template) => {
    if (!addToPageId) { show('Open a page first, then add a section from here'); return; }
    setAdding(template.id);
    try {
      const sectionData = template.template_data
        ? (typeof template.template_data === 'string' ? JSON.parse(template.template_data) : template.template_data)
        : {};
      await api('/api/cms/sections', {
        method: 'POST',
        body: {
          page_id: addToPageId,
          section_type: template.template_type,
          section_name: template.template_name,
          section_data: sectionData,
          sort_order: 999,
        }
      });
      show(`Added: ${template.template_name}`);
      setTimeout(() => onNavigate('editor'), 800);
    } catch (e) {
      show(`Error: ${e.message}`);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="cms-tmpl-layout">
      <div className="cms-tmpl-hdr">
        <button className="cms-btn cms-btn-d cms-btn-sm" onClick={() => onNavigate('editor')}>Back</button>
        <span style={{ fontWeight:500, fontSize:13 }}>Template library</span>
        <div style={{ flex:1 }} />
        <button className="cms-btn cms-btn-p cms-btn-sm" onClick={() => show('Coming soon')}>
          New template
        </button>
      </div>
      <div className="cms-tmpl-filters">
        {categories.map(c => (
          <button key={c} className={`cms-filter-btn${activeCategory === c ? ' active' : ''}`}
            onClick={() => setActiveCategory(c)}>{c}</button>
        ))}
      </div>
      <div className="cms-tmpl-body">
        {Object.entries(groups).map(([cat, items]) => (
          <div key={cat} className="cms-tmpl-section">
            <div className="cms-tmpl-section-title">{cat}</div>
            <div className="cms-tmpl-grid">
              {items.map(t => (
                <div key={t.id} className="cms-tmpl-card">
                  <div className="cms-tmpl-preview">
                    {t.preview_image_url
                      ? <img src={t.preview_image_url} alt={t.template_name}
                          style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : <span>{t.template_type}</span>}
                  </div>
                  <div className="cms-tmpl-meta">
                    <div className="cms-tmpl-name">{t.template_name}</div>
                    <div className="cms-tmpl-tags">
                      <span className="cms-tmpl-tag">{t.template_type}</span>
                    </div>
                  </div>
                  <div className="cms-tmpl-actions">
                    <button className="cms-btn cms-btn-p cms-btn-sm"
                      style={{ width:'100%', justifyContent:'center' }}
                      disabled={adding === t.id}
                      onClick={() => handleUse(t)}>
                      {adding === t.id ? '...' : addToPageId ? 'Add to page' : 'Use template'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Toast msg={msg} />
    </div>
  );
}

// ─── Liquid imports view ──────────────────────────────────────────────────────

function LiquidImportsView({ onNavigate }) {
  const [imports, setImports] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const { msg, show } = useToast();

  const loadImports = () =>
    api('/api/cms/liquid-imports').then(d => setImports(d.imports || [])).catch(() => setImports([]));

  useEffect(() => { loadImports(); }, []);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      // Step 1: upload to R2
      const r2Key = `cms/liquid-imports/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi,'_')}`;
      const form = new FormData();
      form.append('file', file);
      form.append('bucket', 'inneranimalmedia');
      form.append('key', r2Key);
      await api('/api/r2/upload', { method:'POST', body: form });

      // Step 2: create import record
      const importName = file.name.replace(/\.(zip|tar\.gz|tgz)$/, '').replace(/[_-]+/g, ' ');
      await api('/api/cms/liquid-imports', {
        method:'POST',
        body: { import_name: importName, source_type:'shopify_zip', r2_key: r2Key, r2_bucket:'inneranimalmedia' }
      });

      await loadImports();
      show('Import queued — sections will appear once extraction completes');
    } catch (e) {
      show(`Error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const statusClass = s => s === 'complete' ? 'complete' : s === 'pending' || s === 'running' ? 'pending' : 'error';

  return (
    <div className="cms-imports-layout">
      <div className="cms-imports-hdr">
        <button className="cms-btn cms-btn-d cms-btn-sm" onClick={() => onNavigate('editor')}>Back</button>
        <span style={{ fontWeight:500, fontSize:13 }}>Liquid imports</span>
        <div style={{ flex:1 }} />
        <span style={{ fontSize:11, color:'var(--cm)' }}>
          Import Shopify theme .zip / .tar.gz — sections map to templates automatically
        </span>
      </div>
      <div className="cms-imports-body">
        <div
          className={`cms-dropzone${dragOver ? ' drag-over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}>
          <div className="cms-dropzone-title">
            {uploading ? 'Uploading to R2...' : 'Drop your Shopify .zip or .tar.gz here'}
          </div>
          <div className="cms-dropzone-sub">
            Extracted, parsed, and mapped to component templates automatically
          </div>
          <button className="cms-btn cms-btn-t cms-btn-sm"
            onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>
            Browse files
          </button>
          <input ref={fileRef} type="file" accept=".zip,.tar.gz,.tgz" style={{ display:'none' }}
            onChange={e => handleFile(e.target.files[0])} />
        </div>

        {!imports ? (
          <div className="cms-loading">Loading...</div>
        ) : imports.length === 0 ? (
          <div style={{ color:'var(--cm)', fontSize:12, textAlign:'center', padding:'20px 0' }}>
            No imports yet. Upload a Shopify theme above.
          </div>
        ) : (
          <div className="cms-import-grid">
            {imports.map(imp => (
              <div key={imp.id} className="cms-import-card">
                <div className="cms-import-name">{imp.import_name}</div>
                <div className="cms-import-meta">
                  {imp.sections_found} sections found · {imp.sections_mapped} mapped
                </div>
                <div className={`cms-import-status ${statusClass(imp.status)}`}>{imp.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Toast msg={msg} />
    </div>
  );
}

const CMS_VIEWS = ['sites', 'pages', 'editor', 'templates', 'imports'];

function normalizeCmsView(segment) {
  if (!segment || segment === 'websites') return 'sites';
  if (segment === 'editor') return 'pages';
  return CMS_VIEWS.includes(segment) ? segment : 'sites';
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function CmsRoot({
  workspaceId: propWorkspaceId,
  view = 'sites',
  projectSlug: projectSlugProp,
  pageId = null,
  studioPanel = 'pages',
  addToPageId = null,
  onNavigate,
  onNavigatePath,
}) {
  useEffect(() => {
    injectStyles();
  }, []);

  const resolvedWorkspaceId =
    propWorkspaceId ||
    window.__IAM_USER?.active_workspace_id ||
    window.__IAM_USER?.workspace_id ||
    '';

  const projectSlug = projectSlugProp || PRIMARY_CMS_SLUG;
  const studioView = view === 'editor' ? 'pages' : view;
  const panel =
    studioPanel ||
    (studioView === 'templates' ? 'templates' : studioView === 'imports' ? 'imports' : 'pages');

  return (
    <div className="iam-cms-root" style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
      {studioView === 'sites' && <WebsitesView onNavigatePath={onNavigatePath} />}
      {(studioView === 'pages' || studioView === 'templates' || studioView === 'imports') && (
        <CmsStudioEditor
          projectSlug={projectSlug}
          pageId={pageId || addToPageId}
          panel={panel}
          workspaceId={resolvedWorkspaceId}
        />
      )}
      {!CMS_VIEWS.includes(studioView) && <WebsitesView onNavigatePath={onNavigatePath} />}
    </div>
  );
}

export default CmsRoot;
