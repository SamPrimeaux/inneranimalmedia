import { useEffect, useMemo, useState } from 'react';

async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, {
    credentials: 'include',
    headers: isForm ? opts.headers || {} : { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
    body: isForm ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || res.statusText);
  }
  return res.json();
}

function formatDate(value) {
  if (!value) return 'Not yet';
  const n = Number(value);
  const d = Number.isFinite(n) && n > 100000 ? new Date(n * 1000) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function statusLabel(status) {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'published') return 'Visible';
  if (s === 'draft') return 'Draft';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildPath(panel, site, pageId) {
  const qs = site ? `?site=${encodeURIComponent(site)}` : '';
  if (panel === 'templates') return `/dashboard/cms/templates${qs}`;
  if (panel === 'imports') return `/dashboard/cms/imports${qs}`;
  if (pageId) return `/dashboard/cms/pages/${encodeURIComponent(pageId)}${qs}`;
  return `/dashboard/cms/pages${qs}`;
}

function withQuery(path, params = {}) {
  const [base, raw = ''] = path.split('?');
  const sp = new URLSearchParams(raw);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') sp.delete(key);
    else sp.set(key, String(value));
  }
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

function Loading({ label }) {
  return <div className="pt-page"><div className="pt-page-inner"><div className="pt-card" style={{ padding: 24, color: 'var(--muted)' }}>{label}</div></div></div>;
}

function ErrorBox({ error, onRetry }) {
  return <div className="pt-card" style={{ padding: 20, color: 'var(--muted)' }}><strong style={{ color: 'var(--text)' }}>Could not load CMS data.</strong><p>{error}</p>{onRetry ? <button type="button" className="pt-btn" onClick={onRetry}>Retry</button> : null}</div>;
}

function useBootstrap(projectSlug, pageId) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const load = () => {
    if (!projectSlug) { setState({ loading: false, error: 'CMS site not resolved.', data: null }); return; }
    setState((s) => ({ ...s, loading: true, error: '' }));
    const q = new URLSearchParams({ project_slug: projectSlug });
    if (pageId) q.set('page_id', pageId);
    api(`/api/cms/bootstrap?${q}`).then((d) => setState({ loading: false, error: '', data: d })).catch((e) => setState({ loading: false, error: e.message, data: null }));
  };
  useEffect(() => { load(); }, [projectSlug, pageId]);
  return { ...state, reload: load };
}

export function PageEditor({ projectSlug, pageId, onNavigatePath }) {
  const { loading, error, data, reload } = useBootstrap(projectSlug, pageId);
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const page = useMemo(() => (data?.pages || []).find((p) => p.id === pageId) || data?.page || null, [data, pageId]);
  const sections = useMemo(() => (data?.sections || []).filter((s) => s.page_id === pageId), [data, pageId]);
  const activeSection = sections.find((s) => s.id === activeSectionId) || sections[0] || null;
  const [form, setForm] = useState({ title: '', seo_title: '', meta_description: '', robots: 'index,follow' });
  const [sectionJson, setSectionJson] = useState('{}');

  useEffect(() => {
    if (page) setForm({ title: page.title || '', seo_title: page.seo_title || '', meta_description: page.meta_description || '', robots: page.robots || 'index,follow' });
  }, [page?.id]);

  useEffect(() => {
    if (activeSection) setSectionJson(JSON.stringify(parseJson(activeSection.section_data), null, 2));
  }, [activeSection?.id]);

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(''), 1600); };

  const savePage = async () => {
    setSaving(true);
    try {
      await api(`/api/cms/pages/${encodeURIComponent(pageId)}`, { method: 'PUT', body: form });
      showToast('Page saved');
      reload();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const saveSection = async () => {
    if (!activeSection) return;
    let parsed;
    try { parsed = JSON.parse(sectionJson || '{}'); } catch { alert('Section JSON is invalid.'); return; }
    setSaving(true);
    try {
      await api(`/api/cms/sections/${encodeURIComponent(activeSection.id)}`, { method: 'PUT', body: { section_data: parsed } });
      showToast('Section draft saved');
      reload();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const publishPage = async () => {
    if (!pageId || !window.confirm('Publish this page to production?')) return;
    setSaving(true);
    try {
      await api(`/api/cms/pages/${encodeURIComponent(pageId)}/snapshot`, { method: 'POST', body: {} }).catch(() => null);
      await api(`/api/cms/pages/${encodeURIComponent(pageId)}/publish`, { method: 'POST', body: {} });
      showToast('Page published');
      reload();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const archivePage = async () => {
    if (!window.confirm('Archive this page?')) return;
    setSaving(true);
    try {
      await api(`/api/cms/pages/${encodeURIComponent(pageId)}`, { method: 'DELETE' });
      onNavigatePath(buildPath('pages', projectSlug));
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const toggleSection = async (s) => {
    try {
      await api(`/api/cms/sections/${encodeURIComponent(s.id)}/visibility`, { method: 'POST', body: { is_visible: !(s.is_visible === 1 || s.is_visible === true) } });
      reload();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <Loading label="Loading page editor..." />;
  if (error) return <div className="pt-page"><div className="pt-page-inner"><ErrorBox error={error} onRetry={reload} /></div></div>;

  return (
    <div className="pt-editor-shell">
      <header className="pt-editor-top">
        <button type="button" className="pt-icon-btn" onClick={() => onNavigatePath(buildPath('pages', projectSlug))} aria-label="Back to pages">‹</button>
        <div className="pt-editor-crumb">
          <span>{page?.title || 'Page'}</span>
          <span className="pt-badge neutral">{statusLabel(page?.status)}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="pt-btn primary" onClick={savePage} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" className="pt-btn" onClick={publishPage} disabled={saving}>Publish</button>
        <div className="pt-editor-more">
          <button type="button" className="pt-btn" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>More</button>
          {moreOpen ? (
            <div className="pt-editor-more-menu">
              <button type="button" onClick={() => { setMoreOpen(false); onNavigatePath(buildPath('templates', projectSlug)); }}>Templates</button>
              <button type="button" onClick={() => { setMoreOpen(false); void archivePage(); }}>Archive page</button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="pt-editor-layout">
        <main className="pt-editor-main">
          <article className="pt-light-card">
            <div className="pt-light-field">
              <label htmlFor="cms-page-title">Title</label>
              <input id="cms-page-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="pt-light-field">
              <label>Content</label>
              <div className="pt-richbar">
                <button type="button" className="pt-icon-btn">B</button>
                <button type="button" className="pt-icon-btn">I</button>
                <button type="button" className="pt-icon-btn">U</button>
              </div>
              <div className="pt-richarea" contentEditable suppressContentEditableWarning>
                {form.meta_description || 'Edit structured sections below. Page body maps to R2 drafts on save.'}
              </div>
            </div>
          </article>

          <article className="pt-light-card">
            <div className="pt-side-title">Search engine preview</div>
            <div className="pt-seo-title">{form.seo_title || form.title || page?.title}</div>
            <div className="pt-subtext">{`https://${projectSlug}.workers.dev › ${page?.slug || ''}`}</div>
            <p className="pt-subtext">{form.meta_description || 'No meta description yet.'}</p>
          </article>

          <section className="pt-light-card">
            <div className="pt-side-title">{page?.title || 'Page'} sections</div>
            <div className="pt-section-list">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`pt-section-row ${activeSection?.id === s.id ? 'active' : ''}`}
                  onClick={() => setActiveSectionId(s.id)}
                >
                  <span className="pt-code">‹/›</span>
                  <span>{s.section_name || s.section_type}</span>
                  <span className="pt-section-visibility">{s.is_visible === 0 ? 'hidden' : 'visible'}</span>
                </button>
              ))}
              <button
                type="button"
                className="pt-section-row pt-add"
                onClick={() => onNavigatePath(withQuery(buildPath('templates', projectSlug), { add_to_page: pageId }))}
              >
                ⊕ Add section
              </button>
            </div>
            {activeSection ? (
              <div className="pt-section-inspector">
                <div className="pt-light-field">
                  <label>Section data JSON</label>
                  <textarea className="pt-json" value={sectionJson} onChange={(e) => setSectionJson(e.target.value)} />
                </div>
                <div className="pt-editor-section-actions">
                  <button type="button" className="pt-btn primary" onClick={saveSection} disabled={saving}>Save section</button>
                  <button type="button" className="pt-btn" onClick={() => toggleSection(activeSection)}>
                    {activeSection.is_visible === 0 ? 'Show section' : 'Hide section'}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </main>

        <aside className="pt-editor-sidebar">
          <article className="pt-light-card">
            <div className="pt-side-title">Visibility</div>
            <label className="pt-radio-row"><span className="pt-radio active" /><span><strong>{statusLabel(page?.status)}</strong><div className="pt-subtext">Updated {formatDate(page?.updated_at)}</div></span></label>
            <label className="pt-radio-row"><span className="pt-radio" /><span>Hidden</span></label>
          </article>
          <article className="pt-light-card">
            <div className="pt-side-title">Template</div>
            <select value={page?.page_type || 'default'} onChange={() => {}}>
              <option>default</option>
              <option>shop</option>
              <option>landing</option>
            </select>
          </article>
          <article className="pt-light-card">
            <div className="pt-side-title">SEO</div>
            <div className="pt-light-field"><label>SEO title</label><input value={form.seo_title} onChange={(e) => setForm({ ...form, seo_title: e.target.value })} /></div>
            <div className="pt-light-field"><label>Meta description</label><textarea value={form.meta_description} onChange={(e) => setForm({ ...form, meta_description: e.target.value })} /></div>
            <div className="pt-light-field"><label>Robots</label><input value={form.robots} onChange={(e) => setForm({ ...form, robots: e.target.value })} /></div>
          </article>
        </aside>
      </div>

      {toast ? <div className="pt-toast">{toast}</div> : null}
    </div>
  );
}

export default PageEditor;
