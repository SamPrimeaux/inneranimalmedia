/* CMS Editor Core — Inner Animal Media
   Three-column Shopify-style editor:
   LEFT: page nav + draggable section tree
   CENTER: live site iframe with viewport switcher
   RIGHT: contextual panel (section meta | HTML inject | page info)
*/
const { useState, useEffect, useRef, useCallback, useMemo } = React;

/* ── helpers ───────────────────────────────────────────── */
function readCtx() {
  const p = new URLSearchParams(location.search);
  return {
    project: p.get('project') || '',
    pageId: p.get('page') || '',
    workspaceId: p.get('workspace_id') || '',
    workspaceLabel: p.get('workspace_label') || '',
    panel: p.get('panel') || 'pages',
  };
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body instanceof FormData
      ? opts.body
      : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(e.error || res.statusText);
  }
  return res.json();
}

function postParent(type, detail = {}) {
  try { window.parent.postMessage({ type, detail }, window.location.origin); } catch (_) {}
}

function toast(msg, kind = 'ok') {
  const el = document.getElementById('iam-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `iam-toast show ${kind}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = 'iam-toast', 2600);
}

function slugToUrl(project, slug) {
  if (!project) return null;
  const base = `https://${project}.com`;
  if (!slug || slug === 'home') return base + '/';
  return `${base}/${slug}`;
}

const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', width: 1280, icon: '⬜' },
  { id: 'tablet',  label: 'Tablet',  width: 768,  icon: '▭' },
  { id: 'mobile',  label: 'Mobile',  width: 390,  icon: '▯' },
];

const TYPE_ICONS = {
  hero: '⬛', services: '◎', work: '▤', faq: '?', cta: '→',
  overview: '◱', portfolio_gallery: '▤', 'case-study': '◻',
  statement: '✦', contact_path: '◉', collaborate: '◯',
  service: '◎', closing: '⬤', default: '▫',
};

/* ── drag-reorder hook ─────────────────────────────────── */
function useDragReorder(items, onReorder) {
  const dragIdx = useRef(null);
  const dragOver = useRef(null);

  const handlers = (idx) => ({
    draggable: true,
    onDragStart: (e) => { dragIdx.current = idx; e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: (e) => { e.preventDefault(); dragOver.current = idx; },
    onDrop: (e) => {
      e.preventDefault();
      if (dragIdx.current === null || dragIdx.current === dragOver.current) return;
      const next = [...items];
      const [moved] = next.splice(dragIdx.current, 1);
      next.splice(dragOver.current, 0, moved);
      dragIdx.current = null;
      dragOver.current = null;
      onReorder(next);
    },
    onDragEnd: () => { dragIdx.current = null; dragOver.current = null; },
  });

  return handlers;
}

/* ── CSS ───────────────────────────────────────────────── */
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0c0f;--bg1:#10141a;--bg2:#161c24;--bg3:#1d2530;
  --border:rgba(255,255,255,0.07);--border-hi:rgba(255,255,255,0.13);
  --text:#e2e8f0;--muted:#64748b;--faint:#374151;
  --blue:#3b82f6;--green:#22c55e;--orange:#f97316;--red:#ef4444;
}
body{background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif;font-size:13px;height:100vh;overflow:hidden}
button,input,select,textarea{font:inherit;color:inherit}
input,select,textarea{background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);outline:none;padding:6px 10px}
input:focus,select:focus,textarea:focus{border-color:rgba(59,130,246,.5)}

/* layout */
.shell{display:grid;grid-template-columns:240px 1fr 320px;height:100vh;overflow:hidden}

/* topbar */
.topbar{height:44px;background:var(--bg1);border-bottom:1px solid var(--border);
  display:flex;align-items:center;padding:0 14px;gap:10px;grid-column:1/-1;position:sticky;top:0;z-index:50}
.topbar-logo{font-weight:700;font-size:13px;letter-spacing:-.01em;margin-right:4px}
.topbar-dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px rgba(34,197,94,.15);flex-shrink:0}
.topbar-sep{width:1px;height:18px;background:var(--border);margin:0 4px}
.page-select{height:28px;border-radius:7px;font-size:12px;min-width:140px;cursor:pointer}
.vp-toggle{display:flex;gap:2px;background:var(--bg2);border-radius:7px;padding:2px;border:1px solid var(--border)}
.vp-btn{padding:3px 9px;border-radius:5px;border:none;background:none;color:var(--muted);font-size:11px;cursor:pointer;transition:all .1s}
.vp-btn.active{background:var(--bg3);color:var(--text)}
.topbar-right{margin-left:auto;display:flex;gap:7px;align-items:center}
.btn{height:30px;padding:0 12px;border-radius:7px;border:1px solid var(--border);background:var(--bg2);color:var(--text);cursor:pointer;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:6px;transition:background .12s}
.btn:hover{background:var(--bg3)}
.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
.btn.primary:hover{background:#2563eb}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-sm{height:26px;padding:0 9px;font-size:11px}

/* sidebar */
.sidebar{background:var(--bg1);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;min-height:0}
.sidebar-head{padding:10px 12px 8px;border-bottom:1px solid var(--border);flex-shrink:0}
.sidebar-label{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}
.section-list{flex:1;overflow-y:auto;padding:6px 0}
.section-row{display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;border-radius:0;transition:background .1s;position:relative;user-select:none}
.section-row:hover{background:var(--bg2)}
.section-row.active{background:rgba(59,130,246,.12)}
.section-row.active::before{content:'';position:absolute;left:0;top:4px;bottom:4px;width:2px;background:var(--blue);border-radius:0 2px 2px 0}
.drag-handle{color:var(--faint);cursor:grab;font-size:12px;flex-shrink:0}
.drag-handle:active{cursor:grabbing}
.section-icon{width:22px;height:22px;border-radius:5px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;color:var(--muted)}
.section-name{flex:1;font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.section-type{font-size:10px;color:var(--muted)}
.eye-btn{width:22px;height:22px;border:none;background:none;color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:4px;flex-shrink:0;font-size:12px}
.eye-btn:hover{color:var(--text);background:var(--bg3)}
.hidden-row{opacity:.45}
.add-section-btn{display:flex;align-items:center;gap:7px;padding:8px 12px;margin:4px 8px;border-radius:7px;border:1px dashed var(--border);background:none;color:var(--muted);cursor:pointer;font-size:12px;transition:all .12s}
.add-section-btn:hover{border-color:var(--border-hi);color:var(--text);background:var(--bg2)}

/* canvas */
.canvas{background:#1a1a2e;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.canvas-chrome{height:32px;background:var(--bg1);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0}
.chrome-dot{width:8px;height:8px;border-radius:50%;background:var(--bg3)}
.chrome-url{flex:1;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.canvas-body{flex:1;overflow:hidden;display:flex;align-items:flex-start;justify-content:center;padding:16px}
.frame-wrap{background:#fff;border-radius:4px;overflow:hidden;transition:width .2s;max-height:100%;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.site-frame{width:100%;height:100%;border:none;display:block;min-height:600px}
.canvas-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--muted);font-size:13px}
.canvas-empty-icon{font-size:32px;opacity:.3}

/* panel */
.panel{background:var(--bg1);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;min-height:0}
.panel-tabs{display:flex;border-bottom:1px solid var(--border);flex-shrink:0}
.panel-tab{flex:1;padding:10px 8px;font-size:11px;font-weight:600;color:var(--muted);border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;letter-spacing:.02em;transition:all .1s;text-align:center}
.panel-tab.active{color:var(--text);border-bottom-color:var(--blue)}
.panel-body{flex:1;overflow-y:auto;padding:14px}
.panel-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:8px;color:var(--muted);text-align:center;padding:20px}
.panel-empty-icon{font-size:24px;opacity:.3}

/* fields */
.field{margin-bottom:14px}
.field-label{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px}
.field input,.field textarea,.field select{width:100%}
.field textarea{resize:vertical;min-height:60px;line-height:1.5}
.field-hint{font-size:10px;color:var(--faint);margin-top:3px}
.section-meta-head{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.type-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:var(--bg3);color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.divider{height:1px;background:var(--border);margin:14px 0}
.toggle-row{display:flex;justify-content:space-between;align-items:center}
.toggle{width:32px;height:18px;border-radius:9px;background:var(--bg3);border:1px solid var(--border);position:relative;cursor:pointer;transition:background .2s}
.toggle.on{background:var(--blue);border-color:var(--blue)}
.toggle::after{content:'';position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .2s}
.toggle.on::after{left:16px}
.btn-row{display:flex;gap:7px;margin-top:14px}
.btn-danger{color:var(--red);border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08)}
.btn-danger:hover{background:rgba(239,68,68,.15)}
.btn-green{color:var(--green);border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.08)}
.btn-green:hover{background:rgba(34,197,94,.15)}

/* HTML inject panel */
.inject-area{background:var(--bg2);border:1px solid var(--border);border-radius:7px;overflow:hidden;margin-bottom:12px}
.inject-area textarea{width:100%;min-height:220px;background:none;border:none;padding:10px;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.6;color:#a5f3fc;resize:vertical}
.inject-meta{font-size:10px;color:var(--muted);padding:6px 10px;border-top:1px solid var(--border);background:var(--bg3);display:flex;justify-content:space-between}
.section-name-input{width:100%;margin-bottom:8px}
.section-type-select{width:100%;margin-bottom:8px}
.position-select{width:100%;margin-bottom:12px}
.preview-note{font-size:11px;color:var(--muted);padding:8px 10px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.15);border-radius:6px;margin-bottom:10px}

/* meta panel */
.meta-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)}
.meta-key{font-size:11px;color:var(--muted)}
.meta-val{font-size:11px;color:var(--text);font-family:monospace}
.status-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase}
.status-published{background:rgba(34,197,94,.15);color:var(--green)}
.status-draft{background:rgba(249,115,22,.15);color:var(--orange)}
.status-archived{background:var(--bg3);color:var(--muted)}
.live-link{color:var(--blue);font-size:12px;text-decoration:none}
.live-link:hover{text-decoration:underline}

/* activity */
.activity-item{display:flex;gap:9px;padding:8px 0;border-bottom:1px solid var(--border)}
.activity-dot{width:7px;height:7px;border-radius:50%;background:var(--faint);flex-shrink:0;margin-top:4px}
.activity-dot.edit{background:var(--blue)}
.activity-dot.pub{background:var(--green)}
.act-action{font-size:11px;color:var(--muted)}
.act-time{font-size:10px;color:var(--faint);margin-top:2px}

/* toast */
.iam-toast{position:fixed;bottom:20px;right:20px;background:var(--bg2);border:1px solid var(--border-hi);border-radius:8px;padding:9px 14px;font-size:12px;color:var(--text);opacity:0;transform:translateY(6px);transition:all .2s;pointer-events:none;z-index:9999;max-width:280px}
.iam-toast.show{opacity:1;transform:translateY(0)}
.iam-toast.err{border-color:rgba(239,68,68,.4)}
.iam-toast.ok{border-color:rgba(34,197,94,.3)}

/* scrollbar */
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--bg3);border-radius:2px}

/* saving spinner */
@keyframes spin{to{transform:rotate(360deg)}}
.spin{display:inline-block;animation:spin .7s linear infinite}
`;

function injectCSS(css) {
  const id = 'iam-cms-editor-styles';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════════ */
function CmsEditor() {
  injectCSS(CSS);

  const ctx = readCtx();
  const [bootstrap, setBootstrap] = useState(null);
  const [loadingBoot, setLoadingBoot] = useState(false);
  const [activePage, setActivePage] = useState(null);
  const [sections, setSections] = useState([]);
  const [activeSection, setActiveSection] = useState(null);
  const [viewport, setViewport] = useState('desktop');
  const [panelTab, setPanelTab] = useState('section'); // section | inject | meta
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // HTML inject state
  const [injectHtml, setInjectHtml] = useState('');
  const [injectName, setInjectName] = useState('');
  const [injectType, setInjectType] = useState('custom');
  const [injectPosition, setInjectPosition] = useState('end');
  const [injectPreviewing, setInjectPreviewing] = useState(false);

  // Section dirty tracking
  const [dirtyData, setDirtyData] = useState({});

  const iframeRef = useRef(null);

  /* load bootstrap */
  useEffect(() => {
    if (!ctx.project) return;
    setLoadingBoot(true);
    api(`/api/cms/bootstrap?project_slug=${encodeURIComponent(ctx.project)}`)
      .then((data) => {
        setBootstrap(data);
        const pages = data.pages || [];
        const preferred = ctx.pageId
          ? pages.find((p) => p.id === ctx.pageId)
          : pages.find((p) => p.is_homepage) || pages[0];
        if (preferred) selectPage(preferred, data);
      })
      .catch((e) => { toast('Bootstrap failed: ' + e.message, 'err'); })
      .finally(() => setLoadingBoot(false));
  }, [ctx.project]);

  function selectPage(page, boot = bootstrap) {
    setActivePage(page);
    setActiveSection(null);
    setDirtyData({});
    const s = (boot?.sections_by_page?.[page.id] || [])
      .slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    setSections(s);
    setInjectPreviewing(false);
  }

  /* drag reorder */
  const dragHandlers = useDragReorder(sections, async (next) => {
    setSections(next);
    const order = next.map((s, i) => ({ id: s.id, sort_order: (i + 1) * 10 }));
    try {
      await api('/api/cms/sections/reorder', { method: 'POST', body: { page_id: activePage?.id, order } });
      toast('Order saved');
    } catch (e) {
      toast('Reorder failed: ' + e.message, 'err');
    }
  });

  /* toggle visibility */
  async function toggleVisibility(sec) {
    const updated = { ...sec, is_visible: sec.is_visible ? 0 : 1 };
    setSections((prev) => prev.map((s) => s.id === sec.id ? updated : s));
    if (activeSection?.id === sec.id) setActiveSection(updated);
    try {
      await api(`/api/cms/sections/${encodeURIComponent(sec.id)}`, {
        method: 'PUT',
        body: { is_visible: updated.is_visible },
      });
      toast(updated.is_visible ? 'Section shown' : 'Section hidden');
    } catch (e) {
      toast('Visibility update failed', 'err');
    }
  }

  /* save section data */
  async function saveSection() {
    if (!activeSection || !Object.keys(dirtyData).length) return;
    setSaving(true);
    try {
      const currentData = typeof activeSection.section_data === 'string'
        ? JSON.parse(activeSection.section_data || '{}')
        : (activeSection.section_data || {});
      const merged = { ...currentData, ...dirtyData };
      await api(`/api/cms/sections/${encodeURIComponent(activeSection.id)}`, {
        method: 'PUT',
        body: { section_data: merged },
      });
      const updated = { ...activeSection, section_data: merged };
      setActiveSection(updated);
      setSections((prev) => prev.map((s) => s.id === activeSection.id ? updated : s));
      setDirtyData({});
      toast('Saved · ' + activeSection.section_name);
    } catch (e) {
      toast('Save failed: ' + e.message, 'err');
    } finally {
      setSaving(false);
    }
  }

  /* publish page */
  async function publishPage() {
    if (!activePage) return;
    setPublishing(true);
    try {
      await api(`/api/cms/pages/${encodeURIComponent(activePage.id)}/publish`, { method: 'POST' });
      toast('Published · ' + activePage.title, 'ok');
      postParent('iam-cms-navigate', { path: `/dashboard/cms/pages?site=${ctx.project}` });
    } catch (e) {
      toast('Publish failed: ' + e.message, 'err');
    } finally {
      setPublishing(false);
    }
  }

  /* preview HTML inject in iframe via srcdoc */
  function previewInject() {
    if (!injectHtml.trim()) { toast('Paste HTML first', 'err'); return; }
    const frame = iframeRef.current;
    if (!frame) return;
    frame.removeAttribute('src');
    frame.srcdoc = injectHtml;
    setInjectPreviewing(true);
    toast('Preview loaded · check all viewports');
  }

  function clearInjectPreview() {
    const frame = iframeRef.current;
    if (!frame) return;
    frame.removeAttribute('srcdoc');
    if (activePage) {
      const url = pageUrl(activePage);
      if (url) frame.src = url;
    }
    setInjectPreviewing(false);
  }

  /* publish injected HTML section */
  async function publishInjectedSection() {
    if (!injectHtml.trim() || !injectName.trim()) {
      toast('Name and HTML required', 'err'); return;
    }
    if (!activePage) { toast('Select a page first', 'err'); return; }
    setSaving(true);
    try {
      // 1. Upload HTML to R2 via CMS API
      const r2Res = await api('/api/cms/sections/upload-html', {
        method: 'POST',
        body: {
          page_id: activePage.id,
          section_name: injectName,
          section_type: injectType,
          html: injectHtml,
          project_slug: ctx.project,
        },
      });
      // 2. Create section row in D1 (r2_key stored as metadata, not the HTML)
      const newSection = await api('/api/cms/sections', {
        method: 'POST',
        body: {
          page_id: activePage.id,
          section_type: injectType,
          section_name: injectName,
          sort_order: injectPosition === 'end'
            ? (sections.length + 1) * 10
            : 10,
          is_visible: 1,
          section_data: {
            r2_key: r2Res.r2_key,
            public_url: r2Res.public_url,
            html_source: 'injected',
          },
        },
      });
      setSections((prev) => {
        const next = injectPosition === 'end' ? [...prev, newSection] : [newSection, ...prev];
        return next;
      });
      setInjectHtml('');
      setInjectName('');
      clearInjectPreview();
      toast('Section published to R2 + D1 · ' + injectName, 'ok');
    } catch (e) {
      toast('Publish failed: ' + e.message, 'err');
    } finally {
      setSaving(false);
    }
  }

  function pageUrl(page) {
    if (!page) return null;
    const slug = page.slug || '';
    const host = bootstrap?.public_domain || `${ctx.project}.com`;
    return slug === 'home' || !slug
      ? `https://${host}/`
      : `https://${host}/${slug}`;
  }

  /* current iframe URL */
  const iframeSrc = useMemo(() => {
    if (injectPreviewing) return null;
    return activePage ? pageUrl(activePage) : null;
  }, [activePage, injectPreviewing, bootstrap]);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || injectPreviewing) return;
    if (iframeSrc) frame.src = iframeSrc;
  }, [iframeSrc, injectPreviewing]);

  const vp = VIEWPORTS.find((v) => v.id === viewport) || VIEWPORTS[0];
  const pages = bootstrap?.pages || [];

  /* ── RENDER ── */
  return (
    <>
      {/* toast mount */}
      <div id="iam-toast" className="iam-toast" />

      <div style={{ display: 'grid', gridTemplateRows: '44px 1fr', height: '100vh', overflow: 'hidden' }}>

        {/* TOPBAR */}
        <div className="topbar" style={{ gridColumn: '1/-1' }}>
          <div className="topbar-dot" />
          <span className="topbar-logo">CMS Studio</span>
          <div className="topbar-sep" />

          {/* page picker */}
          <select
            className="page-select"
            value={activePage?.id || ''}
            onChange={(e) => {
              const p = pages.find((pg) => pg.id === e.target.value);
              if (p) selectPage(p);
            }}
          >
            {!activePage && <option value="">Select page…</option>}
            {pages.map((p) => (
              <option key={p.id} value={p.id}>{p.title || p.slug}</option>
            ))}
          </select>

          <div className="topbar-sep" />

          {/* viewport toggle */}
          <div className="vp-toggle">
            {VIEWPORTS.map((v) => (
              <button
                key={v.id}
                className={`vp-btn ${viewport === v.id ? 'active' : ''}`}
                onClick={() => setViewport(v.id)}
                title={v.label}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>

          <div className="topbar-right">
            {injectPreviewing && (
              <button className="btn btn-sm" onClick={clearInjectPreview}>← Live site</button>
            )}
            <button
              className="btn btn-sm"
              onClick={() => { setPanelTab('inject'); }}
            >
              + Inject HTML
            </button>
            <button
              className="btn btn-sm primary"
              onClick={publishPage}
              disabled={!activePage || publishing}
            >
              {publishing ? <span className="spin">⟳</span> : null}
              {publishing ? ' Publishing…' : 'Publish'}
            </button>
          </div>
        </div>

        {/* BODY: 3 columns */}
        <div className="shell" style={{ gridRow: 2 }}>

          {/* ── LEFT SIDEBAR ── */}
          <div className="sidebar">
            <div className="sidebar-head">
              <div className="sidebar-label">
                {activePage ? activePage.title : 'Sections'}
                {loadingBoot && <span style={{ marginLeft: 6, color: 'var(--faint)' }}>loading…</span>}
              </div>
            </div>

            <div className="section-list">
              {sections.map((sec, idx) => (
                <div
                  key={sec.id}
                  className={`section-row ${activeSection?.id === sec.id ? 'active' : ''} ${!sec.is_visible ? 'hidden-row' : ''}`}
                  onClick={() => { setActiveSection(sec); setPanelTab('section'); }}
                  {...dragHandlers(idx)}
                >
                  <span className="drag-handle" title="Drag to reorder">⋮⋮</span>
                  <div className="section-icon">{TYPE_ICONS[sec.section_type] || TYPE_ICONS.default}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="section-name">{sec.section_name}</div>
                    <div className="section-type">{sec.section_type}</div>
                  </div>
                  <button
                    className="eye-btn"
                    title={sec.is_visible ? 'Hide' : 'Show'}
                    onClick={(e) => { e.stopPropagation(); toggleVisibility(sec); }}
                  >
                    {sec.is_visible ? '◉' : '◯'}
                  </button>
                </div>
              ))}
              {!sections.length && !loadingBoot && (
                <div style={{ padding: '16px 12px', color: 'var(--muted)', fontSize: 12 }}>
                  No sections yet
                </div>
              )}
            </div>

            <button
              className="add-section-btn"
              onClick={() => setPanelTab('inject')}
            >
              <span style={{ fontSize: 16 }}>+</span> Add section
            </button>
          </div>

          {/* ── CENTER CANVAS ── */}
          <div className="canvas">
            <div className="canvas-chrome">
              <div className="chrome-dot" />
              <div className="chrome-dot" />
              <div className="chrome-dot" />
              <div className="chrome-url">
                {injectPreviewing
                  ? '⚡ HTML preview — not a live URL'
                  : (iframeSrc || (activePage ? pageUrl(activePage) : 'No page selected'))}
              </div>
              {iframeSrc && !injectPreviewing && (
                <a
                  href={iframeSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--muted)', fontSize: 11, textDecoration: 'none', marginLeft: 6 }}
                >
                  ↗
                </a>
              )}
            </div>

            <div className="canvas-body">
              {activePage || injectPreviewing ? (
                <div
                  className="frame-wrap"
                  style={{
                    width: vp.width,
                    height: 'calc(100vh - 44px - 32px - 32px)',
                    maxWidth: '100%',
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    className="site-frame"
                    title="CMS Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                  />
                </div>
              ) : (
                <div className="canvas-empty">
                  <div className="canvas-empty-icon">◱</div>
                  <div>Select a page to preview</div>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="panel">
            <div className="panel-tabs">
              <button
                className={`panel-tab ${panelTab === 'section' ? 'active' : ''}`}
                onClick={() => setPanelTab('section')}
              >Edit</button>
              <button
                className={`panel-tab ${panelTab === 'inject' ? 'active' : ''}`}
                onClick={() => setPanelTab('inject')}
              >HTML</button>
              <button
                className={`panel-tab ${panelTab === 'meta' ? 'active' : ''}`}
                onClick={() => setPanelTab('meta')}
              >Page</button>
            </div>

            <div className="panel-body">
              {panelTab === 'section' && <SectionPanel
                section={activeSection}
                dirtyData={dirtyData}
                setDirtyData={setDirtyData}
                onSave={saveSection}
                saving={saving}
                onDelete={async (sec) => {
                  if (!confirm('Delete this section?')) return;
                  try {
                    await api(`/api/cms/sections/${encodeURIComponent(sec.id)}`, { method: 'DELETE' });
                    setSections((prev) => prev.filter((s) => s.id !== sec.id));
                    setActiveSection(null);
                    toast('Section deleted');
                  } catch (e) { toast('Delete failed: ' + e.message, 'err'); }
                }}
              />}
              {panelTab === 'inject' && <InjectPanel
                html={injectHtml}
                setHtml={setInjectHtml}
                name={injectName}
                setName={setInjectName}
                type={injectType}
                setType={setInjectType}
                position={injectPosition}
                setPosition={setInjectPosition}
                previewing={injectPreviewing}
                onPreview={previewInject}
                onClearPreview={clearInjectPreview}
                onPublish={publishInjectedSection}
                saving={saving}
              />}
              {panelTab === 'meta' && <MetaPanel
                page={activePage}
                sections={sections}
                project={ctx.project}
                pageUrl={iframeSrc}
                bootstrap={bootstrap}
              />}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

/* ── Section Edit Panel ─────────────────────────────────── */
function SectionPanel({ section, dirtyData, setDirtyData, onSave, saving, onDelete }) {
  if (!section) return (
    <div className="panel-empty">
      <div className="panel-empty-icon">✦</div>
      <div>Select a section to edit</div>
    </div>
  );

  const data = useMemo(() => {
    const base = typeof section.section_data === 'string'
      ? JSON.parse(section.section_data || '{}')
      : (section.section_data || {});
    return { ...base, ...dirtyData };
  }, [section, dirtyData]);

  function set(key, val) {
    setDirtyData((prev) => ({ ...prev, [key]: val }));
  }

  const EDITABLE_FIELDS = [
    ['headline', 'Headline', 'input'],
    ['title', 'Title', 'input'],
    ['heading', 'Heading', 'input'],
    ['subheadline', 'Subheadline', 'textarea'],
    ['sub', 'Subtext', 'textarea'],
    ['body', 'Body copy', 'textarea'],
    ['copy', 'Copy', 'textarea'],
    ['eyebrow', 'Eyebrow', 'input'],
    ['email', 'Email', 'input'],
    ['cta_label', 'CTA label', 'input'],
    ['cta_href', 'CTA link', 'input'],
    ['secondary_cta_label', 'Secondary CTA label', 'input'],
    ['secondary_cta_href', 'Secondary CTA link', 'input'],
  ];

  const shownFields = EDITABLE_FIELDS.filter(([key]) => data[key] !== undefined);

  return (
    <div>
      <div className="section-meta-head">
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{section.section_name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{section.section_type}</div>
        </div>
      </div>

      {!shownFields.length && (
        <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 14 }}>
          No editable fields detected. Raw JSON available below.
        </div>
      )}

      {shownFields.map(([key, label, type]) => {
        let val = data[key];
        if (typeof val === 'object' && val !== null) val = val.text || JSON.stringify(val);
        return (
          <div className="field" key={key}>
            <label className="field-label">{label}</label>
            {type === 'textarea' ? (
              <textarea
                value={val || ''}
                rows={3}
                onChange={(e) => set(key, e.target.value)}
              />
            ) : (
              <input
                type="text"
                value={val || ''}
                onChange={(e) => set(key, e.target.value)}
              />
            )}
          </div>
        );
      })}

      {/* bullets */}
      {Array.isArray(data.bullets) && (
        <BulletsEditor
          bullets={data.bullets}
          onChange={(b) => set('bullets', b)}
        />
      )}

      {/* raw JSON fallback */}
      <details style={{ marginTop: 14 }}>
        <summary style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer', marginBottom: 6 }}>
          Raw section_data
        </summary>
        <textarea
          style={{ width: '100%', minHeight: 100, fontFamily: 'monospace', fontSize: 10 }}
          value={JSON.stringify(data, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              setDirtyData(parsed);
            } catch (_) {}
          }}
        />
      </details>

      <div className="divider" />
      <div className="btn-row">
        <button
          className="btn btn-sm primary"
          onClick={onSave}
          disabled={saving || !Object.keys(dirtyData).length}
        >
          {saving ? <span className="spin">⟳</span> : null}
          {saving ? ' Saving…' : 'Save changes'}
        </button>
        <button className="btn btn-sm" onClick={() => setDirtyData({})}>Revert</button>
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn btn-sm btn-danger" style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => onDelete(section)}>
          Delete section
        </button>
      </div>
    </div>
  );
}

function BulletsEditor({ bullets, onChange }) {
  return (
    <div className="field">
      <label className="field-label">Bullets</label>
      {bullets.map((b, i) => (
        <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
          <input
            type="text"
            value={b}
            style={{ flex: 1 }}
            onChange={(e) => {
              const next = [...bullets];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            className="btn btn-sm btn-danger"
            onClick={() => onChange(bullets.filter((_, j) => j !== i))}
          >✕</button>
        </div>
      ))}
      <button
        className="btn btn-sm"
        style={{ marginTop: 4, width: '100%', justifyContent: 'center' }}
        onClick={() => onChange([...bullets, ''])}
      >
        + Add bullet
      </button>
    </div>
  );
}

/* ── HTML Inject Panel ──────────────────────────────────── */
function InjectPanel({ html, setHtml, name, setName, type, setType, position, setPosition,
  previewing, onPreview, onClearPreview, onPublish, saving }) {

  const charCount = html.length;

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Inject HTML section</div>

      <div className="field">
        <label className="field-label">Section name</label>
        <input
          type="text"
          className="section-name-input"
          placeholder="e.g. hero-dark-v2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label">Section type</label>
        <select className="section-type-select" value={type} onChange={(e) => setType(e.target.value)}>
          {['hero','services','work','faq','cta','overview','portfolio_gallery','case-study',
            'statement','contact_path','collaborate','service','closing','custom'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field-label">Position</label>
        <select className="position-select" value={position} onChange={(e) => setPosition(e.target.value)}>
          <option value="end">End of page</option>
          <option value="start">Start of page</option>
        </select>
      </div>

      <div className="inject-area">
        <textarea
          placeholder="<!-- Paste your HTML here -->"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          spellCheck={false}
        />
        <div className="inject-meta">
          <span>{charCount.toLocaleString()} chars</span>
          <span>{html.split('\n').length} lines</span>
        </div>
      </div>

      {previewing && (
        <div className="preview-note">
          ⚡ Previewing in canvas — check Desktop, Tablet, and Mobile viewports above.
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {!previewing ? (
            <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={onPreview}>
              Preview in canvas
            </button>
          ) : (
            <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={onClearPreview}>
              ← Back to live
            </button>
          )}
        </div>
        <button
          className="btn btn-sm primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={onPublish}
          disabled={saving || !html.trim() || !name.trim()}
        >
          {saving ? <span className="spin">⟳</span> : null}
          {saving ? ' Publishing…' : 'Publish section → R2 + D1'}
        </button>
      </div>

      <div className="divider" style={{ marginTop: 12 }} />
      <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.6 }}>
        HTML uploads to R2 at <code>cms/sections/{'{page}'}/{'{name}'}/</code>.
        D1 stores metadata only — no HTML in the database.
      </div>
    </div>
  );
}

/* ── Meta / Page Info Panel ─────────────────────────────── */
function MetaPanel({ page, sections, project, pageUrl, bootstrap }) {
  if (!page) return (
    <div className="panel-empty">
      <div className="panel-empty-icon">◱</div>
      <div>Select a page to view info</div>
    </div>
  );

  const visibleCount = sections.filter((s) => s.is_visible).length;
  const statusClass = page.status === 'published' ? 'status-published'
    : page.status === 'draft' ? 'status-draft' : 'status-archived';

  function fmt(ts) {
    if (!ts) return '—';
    const n = Number(ts);
    const d = Number.isFinite(n) && n > 1e8 ? new Date(n * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      + ' at '
      + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{page.title}</div>

      <div className="meta-row">
        <span className="meta-key">Status</span>
        <span className={`status-badge ${statusClass}`}>{page.status}</span>
      </div>
      <div className="meta-row">
        <span className="meta-key">Page ID</span>
        <span className="meta-val" style={{ fontSize: 10 }}>{page.id}</span>
      </div>
      <div className="meta-row">
        <span className="meta-key">Slug</span>
        <span className="meta-val">/{page.slug}</span>
      </div>
      <div className="meta-row">
        <span className="meta-key">Type</span>
        <span className="meta-val">{page.page_type || '—'}</span>
      </div>
      <div className="meta-row">
        <span className="meta-key">Sections</span>
        <span className="meta-val">{sections.length} total · {visibleCount} visible</span>
      </div>
      <div className="meta-row">
        <span className="meta-key">Last edited</span>
        <span className="meta-val" style={{ fontSize: 11 }}>{fmt(page.updated_at)}</span>
      </div>
      <div className="meta-row">
        <span className="meta-key">Tenant</span>
        <span className="meta-val" style={{ fontSize: 10 }}>tenant_sam_primeaux</span>
      </div>

      <div className="divider" />
      {pageUrl && (
        <>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5 }}>LIVE URL</div>
          <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="live-link">
            {pageUrl} ↗
          </a>
          <div className="divider" />
        </>
      )}

      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        Activity
      </div>
      {[
        { type: 'pub', action: 'Published · ' + (page.title || ''), time: fmt(page.updated_at) },
        { type: 'edit', action: 'Edited sections', time: 'Recent' },
      ].map((a, i) => (
        <div className="activity-item" key={i}>
          <div className={`activity-dot ${a.type}`} />
          <div>
            <div className="act-action">{a.action}</div>
            <div className="act-time">{a.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Mount ──────────────────────────────────────────────── */
ReactDOM.createRoot(document.getElementById('app')).render(<CmsEditor />);
