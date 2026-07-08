import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { IAM_AGENT_CHAT_COMPOSE } from '@/agentChatConstants';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { StorefrontPreview } from './StorefrontPreview';
import {
  isHtmlTemplate,
  parseIamTags,
  parseTemplateMeta,
  resolveTemplatePreviewUrl,
  type CmsTemplateRow,
} from './templatePreview';
import { cmsApi } from './cmsApi';

const api = cmsApi;

const FAVS_KEY = 'iam_tpl_favs';
const DROP_COLLAPSED_KEY = 'iam_tpl_drop_collapsed';
const STATIC_BUILDS = ['inneranimalmedia', 'companionscpas', 'meauxbility', 'fuelnfreetime'];

const CATEGORY_BG: Record<string, string> = {
  hero: '#0a0a14',
  'loading-screen': '#1a2e1a',
  cta: '#1d9e75',
  interactive: '#12082a',
  default: '#f5f4f0',
};

type SortKey = 'popular' | 'newest' | 'az' | 'most-used';
type ViewMode = 'grid' | 'list';
type SidebarFilter =
  | { kind: 'library'; value: string }
  | { kind: 'build'; value: string }
  | { kind: 'collection'; value: string }
  | { kind: 'type'; value: string };

function loadFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveFavs(favs: Set<string>) {
  try {
    localStorage.setItem(FAVS_KEY, JSON.stringify([...favs]));
  } catch {
    /* ignore */
  }
}

function categoryBg(t: CmsTemplateRow): string {
  const cat = String(t.iam_category || t.category || '').toLowerCase();
  return CATEGORY_BG[cat] || CATEGORY_BG.default;
}

function libraryKind(t: CmsTemplateRow): string {
  const type = String(t.template_type || '').toLowerCase();
  const cat = String(t.iam_category || t.category || '').toLowerCase();
  if (type === 'marketing_page' || cat === 'page') return 'pages';
  if (type === 'section' || cat === 'section') return 'sections';
  if (cat === 'block' || type === 'block') return 'blocks';
  if (type === 'starter' || cat === 'starter') return 'starters';
  return 'all';
}

type TemplateLibraryStudioProps = {
  projectSlug?: string | null;
  addToPageId?: string | null;
  onNavigatePath: (path: string) => void;
  marketingTemplates?: CmsTemplateRow[];
};

export function TemplateLibraryStudio({
  projectSlug,
  addToPageId,
  onNavigatePath,
  marketingTemplates = [],
}: TemplateLibraryStudioProps): ReactNode {
  const [templates, setTemplates] = useState<CmsTemplateRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('popular');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>({ kind: 'library', value: 'all' });
  const [filterChips, setFilterChips] = useState<string[]>([]);
  const [favs, setFavs] = useState<Set<string>>(() => loadFavs());
  const [modalTemplate, setModalTemplate] = useState<CmsTemplateRow | null>(null);
  const [dropCollapsed, setDropCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DROP_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [dropDrag, setDropDrag] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importDescribe, setImportDescribe] = useState('');
  const [tagEditId, setTagEditId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const initial = await api<{ templates?: CmsTemplateRow[] }>('/api/cms/templates');
      let list = initial.templates || [];
      const slugs = new Set(list.map((t) => t.slug).filter(Boolean));
      let seeded = false;
      for (const tpl of marketingTemplates) {
        if (tpl.slug && !slugs.has(tpl.slug)) {
          await api('/api/cms/templates', { method: 'POST', body: tpl });
          seeded = true;
        }
      }
      if (seeded) {
        const refreshed = await api<{ templates?: CmsTemplateRow[] }>('/api/cms/templates');
        list = refreshed.templates || [];
      }
      setTemplates(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [marketingTemplates]);

  useEffect(() => {
    void load();
  }, [load]);

  const builds = useMemo(() => {
    const fromApi = new Set<string>();
    for (const t of templates || []) {
      const b = String(t.iam_build || '').trim();
      if (b) fromApi.add(b);
    }
    const merged = [...fromApi];
    for (const b of STATIC_BUILDS) {
      if (!merged.includes(b)) merged.push(b);
    }
    return merged.sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates || []) {
      const c = String(t.iam_category || t.category || '').trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const libraryCounts = useMemo(() => {
    const counts = { all: 0, pages: 0, sections: 0, blocks: 0, starters: 0 };
    for (const t of templates || []) {
      counts.all += 1;
      const k = libraryKind(t);
      if (k in counts && k !== 'all') counts[k as keyof typeof counts] += 1;
    }
    return counts;
  }, [templates]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    let list = [...templates];
    const q = search.trim().toLowerCase();

    if (sidebarFilter.kind === 'library' && sidebarFilter.value !== 'all') {
      list = list.filter((t) => libraryKind(t) === sidebarFilter.value);
    } else if (sidebarFilter.kind === 'build') {
      list = list.filter((t) => String(t.iam_build || '').trim() === sidebarFilter.value);
    } else if (sidebarFilter.kind === 'collection') {
      if (sidebarFilter.value === 'agent-ready') {
        list = list.filter(
          (t) => Number(t.is_featured) === 1 && t.featured_collection === 'agent-ready',
        );
      } else if (sidebarFilter.value === 'starred') {
        list = list.filter((t) => t.id && favs.has(String(t.id)));
      } else if (sidebarFilter.value === 'needs-remaster') {
        list = list.filter((t) => parseIamTags(t.iam_tags).includes('needs-remaster'));
      } else if (sidebarFilter.value === 'imported') {
        list = list.filter((t) => parseIamTags(t.iam_tags).includes('imported'));
      }
    } else if (sidebarFilter.kind === 'type') {
      list = list.filter(
        (t) => String(t.iam_category || t.category || '').toLowerCase() === sidebarFilter.value,
      );
    }

    for (const chip of filterChips) {
      const c = chip.toLowerCase();
      list = list.filter((t) => {
        const tags = parseIamTags(t.iam_tags);
        return (
          tags.some((tag) => tag.toLowerCase() === c) ||
          String(t.iam_build || '').toLowerCase() === c ||
          String(t.iam_category || t.category || '').toLowerCase() === c ||
          String(t.slug || '').toLowerCase().includes(c)
        );
      });
    }

    if (q) {
      list = list.filter((t) => {
        const tags = parseIamTags(t.iam_tags);
        const hay = [
          t.template_name,
          t.slug,
          t.iam_build,
          t.iam_category,
          t.category,
          ...tags,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (sort === 'popular' || sort === 'most-used') {
      list.sort((a, b) => (Number(b.usage_count) || 0) - (Number(a.usage_count) || 0));
    } else if (sort === 'newest') {
      list.sort((a, b) => String(b.id || '').localeCompare(String(a.id || '')));
    } else if (sort === 'az') {
      list.sort((a, b) =>
        String(a.template_name || a.slug || '').localeCompare(String(b.template_name || b.slug || '')),
      );
    }
    return list;
  }, [templates, sidebarFilter, filterChips, search, sort, favs]);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavs(next);
      return next;
    });
  };

  const addTemplate = async (t: CmsTemplateRow) => {
    if (!addToPageId) {
      alert('Open a page first, then add a template section.');
      return;
    }
    setBusy(String(t.id));
    const data = parseTemplateMeta(t);
    try {
      await api('/api/cms/sections', {
        method: 'POST',
        body: {
          page_id: addToPageId,
          section_type: t.template_type || t.category || 'template',
          section_name: t.template_name,
          section_data: data,
          sort_order: 100,
        },
      });
      onNavigatePath(
        `/dashboard/cms/pages/${encodeURIComponent(addToPageId)}${projectSlug ? `?site=${encodeURIComponent(projectSlug)}` : ''}`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const patchTemplate = async (t: CmsTemplateRow, payload: Record<string, unknown>) => {
    if (!t.id) return;
    try {
      const res = await api<{ ok?: boolean; template?: CmsTemplateRow }>(
        `/api/cms/templates/${encodeURIComponent(String(t.id))}`,
        { method: 'PATCH', body: payload },
      );
      if (res.template) {
        setTemplates((prev) =>
          prev ? prev.map((row) => (row.id === res.template?.id ? res.template! : row)) : prev,
        );
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const collapseDrop = () => {
    setDropCollapsed(true);
    try {
      localStorage.setItem(DROP_COLLAPSED_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = [...files];
    if (!arr.length) return;
    const encoded = await Promise.all(
      arr.slice(0, 8).map(async (file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        content: await file.text().catch(() => ''),
      })),
    );
    try {
      await api('/api/cms/imports', {
        method: 'POST',
        body: {
          source_type: 'html_drop',
          files: encoded,
          project_slug: projectSlug || null,
        },
      });
      collapseDrop();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropDrag(false);
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  };

  const importFromUrl = () => {
    const url = importUrl.trim();
    if (!url) return;
    window.dispatchEvent(
      new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
        detail: {
          message: `Import and remaster: ${url}`,
          ensureAgentPanel: true,
          send: false,
          project_slug: projectSlug,
          surface: 'cms',
        },
      }),
    );
    setImportUrl('');
    collapseDrop();
  };

  const describeToAgent = () => {
    const text = importDescribe.trim();
    if (!text) return;
    window.dispatchEvent(
      new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
        detail: {
          message: text,
          ensureAgentPanel: true,
          send: false,
          project_slug: projectSlug,
          surface: 'cms',
        },
      }),
    );
    setImportDescribe('');
    collapseDrop();
  };

  const openTagEditor = (t: CmsTemplateRow) => {
    setTagEditId(String(t.id));
    setTagDraft(parseIamTags(t.iam_tags));
  };

  const saveTags = async (t: CmsTemplateRow) => {
    await patchTemplate(t, {
      iam_tags: tagDraft,
      iam_build: t.iam_build,
      iam_category: t.iam_category,
    });
    setTagEditId(null);
  };

  const sidebarItem = (
    label: string,
    count: number | null,
    active: boolean,
    onClick: () => void,
  ) => (
    <button
      type="button"
      className={`iam-tpl-sidebar__item${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      {count != null ? <span className="iam-tpl-sidebar__count">{count}</span> : null}
    </button>
  );

  return (
    <div className="iam-tpl-gallery" style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <aside className="iam-tpl-sidebar">
        <div className="iam-tpl-sidebar__section">
          <div className="iam-tpl-sidebar__label">Library</div>
          {sidebarItem('All', libraryCounts.all, sidebarFilter.kind === 'library' && sidebarFilter.value === 'all', () =>
            setSidebarFilter({ kind: 'library', value: 'all' }),
          )}
          {sidebarItem('Pages', libraryCounts.pages, sidebarFilter.kind === 'library' && sidebarFilter.value === 'pages', () =>
            setSidebarFilter({ kind: 'library', value: 'pages' }),
          )}
          {sidebarItem('Sections', libraryCounts.sections, sidebarFilter.kind === 'library' && sidebarFilter.value === 'sections', () =>
            setSidebarFilter({ kind: 'library', value: 'sections' }),
          )}
          {sidebarItem('Blocks', libraryCounts.blocks, sidebarFilter.kind === 'library' && sidebarFilter.value === 'blocks', () =>
            setSidebarFilter({ kind: 'library', value: 'blocks' }),
          )}
          {sidebarItem('Starters', libraryCounts.starters, sidebarFilter.kind === 'library' && sidebarFilter.value === 'starters', () =>
            setSidebarFilter({ kind: 'library', value: 'starters' }),
          )}
        </div>
        <div className="iam-tpl-sidebar__section">
          <div className="iam-tpl-sidebar__label">Your builds</div>
          {builds.map((b) =>
            sidebarItem(
              b,
              null,
              sidebarFilter.kind === 'build' && sidebarFilter.value === b,
              () => setSidebarFilter({ kind: 'build', value: b }),
            ),
          )}
        </div>
        <div className="iam-tpl-sidebar__section">
          <div className="iam-tpl-sidebar__label">Collections</div>
          {sidebarItem('Agent ready', null, sidebarFilter.kind === 'collection' && sidebarFilter.value === 'agent-ready', () =>
            setSidebarFilter({ kind: 'collection', value: 'agent-ready' }),
          )}
          {sidebarItem('Starred', favs.size, sidebarFilter.kind === 'collection' && sidebarFilter.value === 'starred', () =>
            setSidebarFilter({ kind: 'collection', value: 'starred' }),
          )}
          {sidebarItem('Needs remaster', null, sidebarFilter.kind === 'collection' && sidebarFilter.value === 'needs-remaster', () =>
            setSidebarFilter({ kind: 'collection', value: 'needs-remaster' }),
          )}
          {sidebarItem('Imported', null, sidebarFilter.kind === 'collection' && sidebarFilter.value === 'imported', () =>
            setSidebarFilter({ kind: 'collection', value: 'imported' }),
          )}
        </div>
        {categories.length > 0 ? (
          <div className="iam-tpl-sidebar__section">
            <div className="iam-tpl-sidebar__label">By type</div>
            {categories.map((c) =>
              sidebarItem(
                c,
                null,
                sidebarFilter.kind === 'type' && sidebarFilter.value === c,
                () => setSidebarFilter({ kind: 'type', value: c }),
              ),
            )}
          </div>
        ) : null}
      </aside>

      <div className="iam-tpl-main">
        <div className="iam-tpl-toolbar">
          <div className="iam-tpl-search">
            <span aria-hidden style={{ fontSize: 11, opacity: 0.6 }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
            />
          </div>
          {dropCollapsed ? (
            <button type="button" className="iam-tpl-chip" onClick={() => setDropCollapsed(false)}>
              + Import
            </button>
          ) : null}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            style={{
              height: 30,
              borderRadius: 6,
              border: '1px solid var(--cms-border)',
              background: 'var(--cms-bg)',
              fontSize: 12,
              padding: '0 8px',
            }}
          >
            <option value="popular">Popular</option>
            <option value="newest">Newest</option>
            <option value="az">A–Z</option>
            <option value="most-used">Most used</option>
          </select>
          <button
            type="button"
            aria-label="Grid view"
            title="Grid"
            onClick={() => setViewMode('grid')}
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              border: '1px solid var(--cms-border)',
              background: viewMode === 'grid' ? 'var(--cms-teal-soft)' : 'var(--cms-bg)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            #
          </button>
          <button
            type="button"
            aria-label="List view"
            title="List"
            onClick={() => setViewMode('list')}
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              border: '1px solid var(--cms-border)',
              background: viewMode === 'list' ? 'var(--cms-teal-soft)' : 'var(--cms-bg)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            ≡
          </button>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              marginLeft: 'auto',
              height: 30,
              padding: '0 10px',
              borderRadius: 6,
              border: '1px solid var(--cms-border)',
              background: 'var(--cms-bg)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>

        {filterChips.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 16px 0' }}>
            {filterChips.map((chip) => (
              <button
                key={chip}
                type="button"
                className="iam-tpl-chip"
                onClick={() => setFilterChips((prev) => prev.filter((c) => c !== chip))}
              >
                {chip} ×
              </button>
            ))}
          </div>
        ) : null}

        {!dropCollapsed ? (
          <div
            className={`iam-tpl-dropzone${dropDrag ? ' is-dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropDrag(true);
            }}
            onDragLeave={() => setDropDrag(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".html,.liquid,.jsx,.tsx,.zip"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.length) void uploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="iam-tpl-dropzone__title">
              Drop HTML, .liquid, .jsx, .zip, or paste a URL
            </div>
            <div className="iam-tpl-dropzone__sub">
              Agent Sam will parse, tag, and remaster into CMS blocks.
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span className="iam-tpl-tag">Accepts: .html .liquid .jsx .tsx .zip</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <input
                value={importUrl}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="Paste URL"
                style={{
                  height: 30,
                  borderRadius: 6,
                  border: '1px solid var(--cms-border)',
                  padding: '0 10px',
                  fontSize: 12,
                  minWidth: 200,
                }}
              />
              <button
                type="button"
                className="iam-tpl-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  importFromUrl();
                }}
              >
                Import URL
              </button>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <input
                value={importDescribe}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setImportDescribe(e.target.value)}
                placeholder="Describe to Agent Sam"
                style={{
                  height: 30,
                  borderRadius: 6,
                  border: '1px solid var(--cms-border)',
                  padding: '0 10px',
                  fontSize: 12,
                  minWidth: 240,
                }}
              />
              <button
                type="button"
                className="iam-tpl-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  describeToAgent();
                }}
              >
                Send
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ flex: 1, overflow: 'auto' }}>
          {error ? (
            <div style={{ padding: 16, color: 'var(--cms-muted)', fontSize: 13 }}>
              {error}
              <button type="button" onClick={() => void load()} style={{ marginLeft: 10 }}>
                Retry
              </button>
            </div>
          ) : null}

          {!templates ? (
            <div style={{ padding: 24, color: 'var(--cms-muted)' }}>Loading templates…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--cms-muted)' }}>No templates match your filters.</div>
          ) : viewMode === 'grid' ? (
            <div className="iam-tpl-grid">
              {filtered.map((t) => {
                const id = String(t.id);
                const tags = parseIamTags(t.iam_tags);
                const previewUrl = t.preview_image_url || resolveTemplatePreviewUrl(t);
                const isFav = favs.has(id);
                return (
                  <div key={id} className="iam-tpl-card">
                    <button
                      type="button"
                      className={`iam-tpl-fav${isFav ? ' is-faved' : ''}`}
                      aria-label={isFav ? 'Unfavorite' : 'Favorite'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFav(id);
                      }}
                    >
                      {isFav ? 'Saved' : 'Save'}
                    </button>
                    <div
                      className="iam-tpl-preview"
                      style={{ background: previewUrl ? undefined : categoryBg(t) }}
                    >
                      {previewUrl ? (
                        <img src={previewUrl} alt="" loading="lazy" />
                      ) : isHtmlTemplate(t) && resolveTemplatePreviewUrl(t) ? (
                        <StorefrontPreview
                          url={resolveTemplatePreviewUrl(t)!}
                          variant="desktop"
                          title={t.template_name || 'Preview'}
                        />
                      ) : null}
                    </div>
                    <div className="iam-tpl-body">
                      <div className="iam-tpl-name">{t.template_name || t.slug}</div>
                      <div className="iam-tpl-chips">
                        {t.iam_category || t.category ? (
                          <span className="iam-tpl-tag">{t.iam_category || t.category}</span>
                        ) : null}
                        {t.iam_build ? <span className="iam-tpl-tag is-build">{t.iam_build}</span> : null}
                        {tags.slice(0, 3).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="iam-tpl-tag"
                            onClick={() => openTagEditor(t)}
                          >
                            {tag}
                          </button>
                        ))}
                        {tags.length > 3 ? (
                          <span className="iam-tpl-tag">+{tags.length - 3}</span>
                        ) : null}
                      </div>
                      {tagEditId === id ? (
                        <div style={{ marginBottom: 8 }}>
                          <input
                            value={tagDraft.join(', ')}
                            onChange={(e) =>
                              setTagDraft(
                                e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              )
                            }
                            style={{
                              width: '100%',
                              fontSize: 11,
                              padding: '4px 6px',
                              borderRadius: 4,
                              border: '1px solid var(--cms-border)',
                            }}
                          />
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button type="button" className="iam-tpl-actions button use" onClick={() => void saveTags(t)}>
                              Save tags
                            </button>
                            <button type="button" onClick={() => setTagEditId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div className="iam-tpl-actions">
                        <button type="button" onClick={() => setModalTemplate(t)}>
                          Preview
                        </button>
                        <button
                          type="button"
                          className="use"
                          disabled={busy === id}
                          onClick={() => void addTemplate(t)}
                        >
                          {busy === id ? 'Adding…' : 'Use'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 16, display: 'grid', gap: 8 }}>
              {filtered.map((t) => (
                <div
                  key={String(t.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    border: '1px solid var(--cms-border)',
                    borderRadius: 8,
                    background: 'var(--cms-panel)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="iam-tpl-name">{t.template_name}</div>
                    <div className="iam-tpl-chips">
                      {t.iam_build ? <span className="iam-tpl-tag is-build">{t.iam_build}</span> : null}
                      {parseIamTags(t.iam_tags)
                        .slice(0, 3)
                        .map((tag) => (
                          <span key={tag} className="iam-tpl-tag">
                            {tag}
                          </span>
                        ))}
                    </div>
                  </div>
                  <button type="button" onClick={() => setModalTemplate(t)}>
                    Preview
                  </button>
                  <button type="button" className="use" onClick={() => void addTemplate(t)}>
                    Use
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <TemplatePreviewModal template={modalTemplate} onClose={() => setModalTemplate(null)} />
    </div>
  );
}
