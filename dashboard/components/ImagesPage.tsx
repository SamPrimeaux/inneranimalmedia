import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Trash2, Copy, ExternalLink, X, Search,
  ChevronLeft, ChevronRight, ImageIcon,
  RefreshCw, Eye, AlertCircle, CheckCircle, Filter,
  SlidersHorizontal, FileArchive, Maximize2, Tag, Plus
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImageMeta {
  label?: string;
  is_live?: boolean;
  preferred_bg?: string;
  notes?: string;
  tenant_slug?: string;
  category?: string;
  project_slug?: string;
}

type SourceTab = 'all' | 'r2' | 'cf_images' | 'drive';
type ItemSource = 'r2' | 'cf_images' | 'drive';

interface CfImage {
  id: string;
  source?: ItemSource;
  kind?: 'image' | 'artifact';
  r2_key?: string | null;
  cloudflare_image_id?: string | null;
  drive_file_id?: string;
  filename?: string;
  uploaded?: string;
  created_at?: string;
  url?: string;
  thumbnail?: string;
  thumbnail_url?: string;
  mime_type?: string;
  size?: number;
  width?: number | null;
  height?: number | null;
  variants?: string[];
  alt_text?: string | null;
  description?: string | null;
  tags?: string[];
  meta?: ImageMeta;
}

interface TagStat {
  tag: string;
  count: number;
}

interface Tenant {
  slug: string;
  name?: string;
}

type SortKey = 'newest' | 'oldest' | 'name-az' | 'name-za';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildImageUrl(accountHash: string, id: string, variant = 'public') {
  return `https://imagedelivery.net/${accountHash}/${id}/${variant}`;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtSize(bytes?: number) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function sourceLabel(s?: ItemSource) {
  if (s === 'cf_images') return 'CF Images';
  if (s === 'drive') return 'Drive';
  if (s === 'r2') return 'R2';
  return '—';
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface Toast { id: number; msg: string; type: 'ok' | 'err'; }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const add = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200);
  }, []);
  return { toasts, add };
}

function imagesListUrl(
  workspaceId: string | null | undefined,
  source: SourceTab,
  page: number,
  perPage: number,
  tag?: string,
  q?: string,
) {
  const params = new URLSearchParams();
  params.set('source', source);
  params.set('page', String(page));
  params.set('per_page', String(perPage));
  const ws = workspaceId?.trim();
  if (ws) params.set('workspace_id', ws);
  if (tag?.trim()) params.set('tag', tag.trim());
  if (q?.trim()) params.set('q', q.trim());
  return `/api/images?${params.toString()}`;
}

function imagesTagsUrl(workspaceId?: string | null) {
  const params = new URLSearchParams();
  const ws = workspaceId?.trim();
  if (ws) params.set('workspace_id', ws);
  const qs = params.toString();
  return qs ? `/api/images/tags?${qs}` : '/api/images/tags';
}

function imagesPatchUrl(imageId: string, workspaceId?: string | null) {
  const ws = workspaceId?.trim();
  return ws
    ? `/api/images/${encodeURIComponent(imageId)}?workspace_id=${encodeURIComponent(ws)}`
    : `/api/images/${encodeURIComponent(imageId)}`;
}

function imagesUploadUrl(workspaceId?: string | null) {
  const ws = workspaceId?.trim();
  return ws
    ? `/api/images/upload?workspace_id=${encodeURIComponent(ws)}`
    : '/api/images/upload';
}

// ── Main Component ────────────────────────────────────────────────────────────

export type ImagesPageProps = { workspaceId?: string | null };

export function ImagesPage({ workspaceId }: ImagesPageProps) {
  const [images, setImages] = useState<CfImage[]>([]);
  const [total, setTotal] = useState(0);
  const [accountHash, setAccountHash] = useState('');
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [perPage, setPerPage] = useState(100);
  const [page, setPage] = useState(1);
  const [sourceTab, setSourceTab] = useState<SourceTab>('all');
  const [mimeFilter, setMimeFilter] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [allTags, setAllTags] = useState<TagStat[]>([]);
  const [detail, setDetail] = useState<CfImage | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const { toasts, add: toast } = useToast();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  const loadTags = useCallback(async () => {
    try {
      const r = await fetch(imagesTagsUrl(workspaceId), { credentials: 'same-origin' });
      const d = await r.json();
      if (d.tags) setAllTags(d.tags);
    } catch {
      /* optional */
    }
  }, [workspaceId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(
        imagesListUrl(workspaceId, sourceTab, page, perPage, tagFilter, debouncedSearch),
        { credentials: 'same-origin' },
      );
      const d = await r.json();
      if (d.error) {
        setError(d.error);
        return;
      }
      const rows: CfImage[] = d.items || d.images || [];
      setImages(rows);
      setTotal(typeof d.total === 'number' ? d.total : rows.length);
      if (d.accountHash) setAccountHash(d.accountHash);
      if (typeof d.drive_connected === 'boolean') setDriveConnected(d.drive_connected);
      void loadTags();
    } catch (e: any) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, sourceTab, page, perPage, tagFilter, debouncedSearch, loadTags]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/cms/websites', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = d?.tenants || d?.websites;
        if (list) setTenants(list);
      })
      .catch(() => {});
  }, []);

  // ── Derived list ──────────────────────────────────────────────────────────

  const filtered = React.useMemo(() => {
    let list = [...images];
    if (tenantFilter !== 'all') list = list.filter(i => i.meta?.tenant_slug === tenantFilter);
    if (mimeFilter !== 'all') {
      list = list.filter(i => (i.mime_type || '').toLowerCase().startsWith(mimeFilter));
    }
    const ts = (i: CfImage) => i.created_at || i.uploaded || '';
    if (sort === 'newest') list.sort((a, b) => ts(b).localeCompare(ts(a)));
    else if (sort === 'oldest') list.sort((a, b) => ts(a).localeCompare(ts(b)));
    else if (sort === 'name-az') list.sort((a, b) => (a.filename || a.id || '').localeCompare(b.filename || b.id || ''));
    else if (sort === 'name-za') list.sort((a, b) => (b.filename || b.id || '').localeCompare(a.filename || a.id || ''));
    return list;
  }, [images, tenantFilter, sort, mimeFilter]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const paginated = filtered;

  useEffect(() => setPage(1), [sort, tenantFilter, debouncedSearch, perPage, sourceTab, mimeFilter, tagFilter]);

  const saveImage = useCallback(async (img: CfImage, payload: Record<string, unknown>) => {
    try {
      const r = await fetch(imagesPatchUrl(img.id, workspaceId), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.ok && (d.item || d.image)) {
        const row = d.item || d.image;
        setImages(p => p.map(i => (i.id === img.id || i.id === row.id ? row : i)));
        toast('Saved');
        return row as CfImage;
      }
      toast(d.error || 'Save failed', 'err');
    } catch (e: any) {
      toast('Error: ' + e.message, 'err');
    }
    return null;
  }, [workspaceId, toast]);

  const deleteImage = useCallback(async (img: CfImage) => {
    if (!confirm(`Delete "${img.filename || img.id}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/images/${encodeURIComponent(img.id)}`, {
        method: 'DELETE', credentials: 'same-origin'
      });
      const d = await r.json();
      if (d.ok) {
        setImages(p => p.filter(i => i.id !== img.id));
        setTotal(t => Math.max(0, t - 1));
        setDetail(null);
        toast('Image deleted');
        void loadTags();
      } else {
        toast(d.error || 'Delete failed', 'err');
      }
    } catch (e: any) {
      toast('Error: ' + e.message, 'err');
    }
  }, [toast, loadTags]);

  // ── URL for display ───────────────────────────────────────────────────────

  const imgUrl = (img: CfImage) => {
    if (img.url) return img.url;
    const cfId = img.cloudflare_image_id || (img.id?.startsWith('cf_live_') ? img.id.slice(9) : '');
    if (accountHash && cfId) return buildImageUrl(accountHash, cfId);
    return '';
  };

  const thumbUrl = (img: CfImage) =>
    img.thumbnail_url || img.thumbnail || imgUrl(img);

  const importDriveImage = useCallback(async (img: CfImage) => {
    const driveId = img.drive_file_id || (img.id?.startsWith('drive_') ? img.id.slice(6) : '');
    if (!driveId) return;
    try {
      const qs = workspaceId?.trim()
        ? `?workspace_id=${encodeURIComponent(workspaceId.trim())}`
        : '';
      const r = await fetch(`/api/images/import/drive${qs}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drive_file_id: driveId }),
      });
      const d = await r.json();
      if (d.ok && (d.item || d.image)) {
        const row = d.item || d.image;
        setImages(p => [row, ...p.filter(i => i.id !== img.id)]);
        setDetail(null);
        toast('Imported to R2 + registry');
        load();
      } else {
        toast(d.error || 'Import failed', 'err');
      }
    } catch (e: any) {
      toast('Error: ' + e.message, 'err');
    }
  }, [workspaceId, toast, load]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-app)', color: 'var(--text-main)',
      fontFamily: 'inherit', overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px 12px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-panel)', display: 'flex', alignItems: 'center',
        gap: 12, flexShrink: 0, flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <ImageIcon size={18} style={{ color: 'var(--solar-cyan)', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.02em' }}>
            Media library
          </span>
          {!loading && (
            <>
              <span style={{
                fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)', borderRadius: 999,
                padding: '1px 8px', marginLeft: 4
              }}>{total} total</span>
              {sourceTab === 'drive' && driveConnected === false && (
                <span style={{
                  fontSize: 10, color: '#f87171', background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)', borderRadius: 999,
                  padding: '1px 8px'
                }}>Drive not connected</span>
              )}
            </>
          )}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Search size={13} style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none'
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search images…"
            style={{
              paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
              borderRadius: 8, border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)', color: 'var(--text-main)',
              fontSize: 12, outline: 'none', width: 180
            }}
          />
        </div>

        <div style={{
          display: 'flex', borderRadius: 8, border: '1px solid var(--border-subtle)',
          overflow: 'hidden', flexShrink: 0
        }}>
          {(['all', 'r2', 'cf_images', 'drive'] as SourceTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setSourceTab(tab)}
              style={{
                padding: '6px 10px', fontSize: 11, border: 'none', cursor: 'pointer',
                background: sourceTab === tab ? 'var(--solar-cyan)' : 'var(--bg-elevated)',
                color: sourceTab === tab ? '#000' : 'var(--text-muted)',
                fontWeight: sourceTab === tab ? 600 : 400
              }}
            >
              {tab === 'all' ? 'All' : tab === 'cf_images' ? 'CF Images' : tab === 'drive' ? 'Drive' : 'R2'}
            </button>
          ))}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setFilterOpen(p => !p)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)',
            background: filterOpen ? 'var(--bg-hover)' : 'var(--bg-elevated)',
            color: filterOpen ? 'var(--solar-cyan)' : 'var(--text-muted)',
            fontSize: 12, cursor: 'pointer'
          }}
        >
          <SlidersHorizontal size={13} />
          Filters
        </button>

        <button
          onClick={() => load()}
          title="Refresh"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)', color: 'var(--text-muted)',
            fontSize: 12, cursor: 'pointer'
          }}
        >
          <RefreshCw size={13} />
        </button>

        <button
          onClick={() => setUploadOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: 'var(--solar-cyan)', color: '#000',
            fontSize: 12, fontWeight: 600, cursor: 'pointer'
          }}
        >
          <Upload size={13} />
          Upload
        </button>
      </div>

      {/* Filter bar */}
      {filterOpen && (
        <div style={{
          padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel)', display: 'flex', gap: 12, alignItems: 'center',
          flexWrap: 'wrap', flexShrink: 0
        }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Sort
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
              style={selectStyle}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name-az">Name A–Z</option>
              <option value="name-za">Name Z–A</option>
            </select>
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Per page
            <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
              style={selectStyle}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            MIME
            <select value={mimeFilter} onChange={e => setMimeFilter(e.target.value)}
              style={selectStyle}>
              <option value="all">All types</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/png">PNG</option>
              <option value="image/webp">WebP</option>
              <option value="image/gif">GIF</option>
              <option value="image/svg">SVG</option>
            </select>
          </label>
          {tenants.length > 0 && (
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={11} />
              Tenant
              <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}
                style={selectStyle}>
                <option value="all">All tenants</option>
                {tenants.map(t => (
                  <option key={t.slug} value={t.slug}>{t.name || t.slug}</option>
                ))}
              </select>
            </label>
          )}
          {allTags.length > 0 && (
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tag size={11} />
              Tag
              <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} style={selectStyle}>
                <option value="">All tags</option>
                {allTags.map(t => (
                  <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#f87171', fontSize: 13, marginBottom: 20
          }}>
            <AlertCircle size={15} />
            {error}
            <span style={{ fontSize: 11, opacity: 0.8, marginLeft: 4 }}>
              Ensure CLOUDFLARE_IMAGES_TOKEN has Images: Edit permission.
            </span>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <ImageGridSkeleton count={Math.min(perPage, 24)} />
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 64, gap: 12,
            color: 'var(--text-muted)'
          }}>
            <ImageIcon size={40} strokeWidth={1} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 14, textAlign: 'center', maxWidth: 420 }}>
              {images.length === 0
                ? (sourceTab === 'drive'
                  ? 'No Drive images found. Connect Google Drive in Settings → Integrations, or upload locally.'
                  : 'No media yet. Upload a file — stored in Cloudflare Images, R2 backup, and the images registry.')
                : 'No items match your filters.'}
            </span>
          </div>
        )}

        {/* Grid */}
        {!loading && paginated.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 14
          }}>
            {paginated.map(img => {
              const url = imgUrl(img);
              const isArtifact = img.kind === 'artifact';
              const isDark = img.meta?.preferred_bg === 'dark';
              const isLive = img.meta?.is_live;
              return (
                <div
                  key={img.id}
                  onClick={() => setDetail(img)}
                  style={{
                    background: isDark ? 'var(--bg-panel)' : 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 12, overflow: 'hidden',
                    cursor: 'pointer', position: 'relative',
                    transition: 'border-color 0.15s, box-shadow 0.15s'
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--solar-cyan)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  {isLive && (
                    <div style={{
                      position: 'absolute', top: 7, left: 7, zIndex: 2,
                      background: 'rgba(45,212,191,0.9)', color: '#000',
                      fontSize: 9, fontWeight: 700, padding: '2px 6px',
                      borderRadius: 999, letterSpacing: '0.05em'
                    }}>LIVE</div>
                  )}
                  <div style={{
                    width: '100%', aspectRatio: '4/3',
                    background: 'var(--bg-app)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                  }}>
                    {img.source && (
                      <div style={{
                        position: 'absolute', top: 7, right: 7, zIndex: 2,
                        background: 'rgba(0,0,0,0.65)', color: '#fff',
                        fontSize: 9, fontWeight: 600, padding: '2px 6px',
                        borderRadius: 999, letterSpacing: '0.04em'
                      }}>{sourceLabel(img.source)}</div>
                    )}
                    {!isArtifact && url ? (
                      <img
                        src={thumbUrl(img)}
                        alt={img.filename || img.id}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                        onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                      />
                    ) : isArtifact ? (
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: 6, color: 'var(--text-muted)'
                      }}>
                        <FileArchive size={28} strokeWidth={1.25} />
                        <span style={{ fontSize: 10, textAlign: 'center', padding: '0 8px', lineHeight: 1.3 }}>
                          {img.filename || 'File'}
                        </span>
                      </div>
                    ) : (
                      <ImageIcon size={24} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                    )}
                  </div>
                  <div style={{ padding: '9px 11px' }}>
                    <div style={{
                      fontSize: 11, fontWeight: 500, color: 'var(--text-main)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {img.meta?.label || img.filename || img.id}
                    </div>
                    {(img.tags?.length ?? 0) > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {img.tags!.slice(0, 3).map(tag => (
                          <span key={tag} style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 999,
                            background: 'color-mix(in srgb, var(--solar-cyan) 18%, transparent)',
                            color: 'var(--solar-cyan)', fontWeight: 600
                          }}>{tag}</span>
                        ))}
                        {img.tags!.length > 3 && (
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>+{img.tags!.length - 3}</span>
                        )}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmtDate(img.created_at || img.uploaded)}
                      {img.size ? ` · ${fmtSize(img.size)}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 12, marginTop: 28, paddingTop: 20,
            borderTop: '1px solid var(--border-subtle)'
          }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={paginationBtnStyle(page <= 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Page {page} of {totalPages} · {total} images
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={paginationBtnStyle(page >= totalPages)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <DetailModal
          img={detail}
          url={imgUrl(detail)}
          allTags={allTags.map(t => t.tag)}
          onClose={() => setDetail(null)}
          onDelete={deleteImage}
          onSave={saveImage}
          onImportDrive={importDriveImage}
          onFullscreen={u => setFullscreenUrl(u)}
          onUpdated={updated => setDetail(updated)}
        />
      )}

      {fullscreenUrl && (
        <ImageFullscreenPreview url={fullscreenUrl} onClose={() => setFullscreenUrl(null)} />
      )}

      {/* Upload Modal */}
      {uploadOpen && (
        <UploadModal
          workspaceId={workspaceId}
          onClose={() => setUploadOpen(false)}
          onUploaded={img => { setImages(p => [img, ...p]); setUploadOpen(false); toast('Uploaded: ' + (img.filename || img.id)); }}
          onError={msg => toast(msg, 'err')}
        />
      )}

      {/* Toasts */}
      <div style={{
        position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: 8, zIndex: 500, pointerEvents: 'none'
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 16px', borderRadius: 10,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            color: t.type === 'err' ? '#f87171' : 'var(--solar-cyan)',
            fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
          }}>
            {t.type === 'ok' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
            {t.msg}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes iam-img-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .iam-img-skeleton {
          background: linear-gradient(
            90deg,
            var(--bg-elevated) 0%,
            color-mix(in srgb, var(--border-subtle) 60%, var(--bg-elevated)) 50%,
            var(--bg-elevated) 100%
          );
          background-size: 200% 100%;
          animation: iam-img-shimmer 1.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// ── Skeleton grid ─────────────────────────────────────────────────────────────

function ImageGridSkeleton({ count }: { count: number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
      gap: 14
    }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{
          border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden'
        }}>
          <div className="iam-img-skeleton" style={{ width: '100%', aspectRatio: '4/3' }} />
          <div style={{ padding: '9px 11px' }}>
            <div className="iam-img-skeleton" style={{ height: 11, borderRadius: 4, width: '72%' }} />
            <div className="iam-img-skeleton" style={{ height: 9, borderRadius: 4, width: '45%', marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Fullscreen preview ────────────────────────────────────────────────────────

function ImageFullscreenPreview({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.92)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 24,
        cursor: 'zoom-out'
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close fullscreen"
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, color: '#fff', padding: 8, cursor: 'pointer'
        }}
      >
        <X size={18} />
      </button>
      <img
        src={url}
        alt=""
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
          borderRadius: 4, boxShadow: '0 24px 64px rgba(0,0,0,0.5)', cursor: 'default'
        }}
      />
    </div>
  );
}

// ── Tag editor ────────────────────────────────────────────────────────────────

function TagEditor({ tags, suggestions, onChange }: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    if (tags.includes(tag)) return;
    onChange([...tags, tag]);
    setDraft('');
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {tags.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '3px 8px', borderRadius: 999,
            background: 'color-mix(in srgb, var(--solar-cyan) 16%, transparent)',
            border: '1px solid color-mix(in srgb, var(--solar-cyan) 35%, transparent)',
            color: 'var(--solar-cyan)'
          }}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', lineHeight: 1 }}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addTag(draft);
            }
          }}
          placeholder="Add tag…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="button" onClick={() => addTag(draft)}
          style={actionBtnStyle('var(--bg-hover)', 'var(--text-main)')}>
          <Plus size={13} />
        </button>
      </div>
      {suggestions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {suggestions.filter(s => !tags.includes(s)).slice(0, 8).map(s => (
            <button key={s} type="button" onClick={() => addTag(s)}
              style={{ ...smallBtnStyle, fontSize: 10 }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailModal({ img, url, allTags, onClose, onDelete, onSave, onImportDrive, onFullscreen, onUpdated }: {
  img: CfImage;
  url: string;
  allTags: string[];
  onClose: () => void;
  onDelete: (img: CfImage) => void;
  onSave: (img: CfImage, payload: Record<string, unknown>) => Promise<CfImage | null>;
  onImportDrive: (img: CfImage) => void;
  onFullscreen: (url: string) => void;
  onUpdated: (img: CfImage) => void;
}) {
  const isArtifact = img.kind === 'artifact';
  const [label, setLabel] = useState(img.meta?.label || img.filename || '');
  const [isLive, setIsLive] = useState(!!img.meta?.is_live);
  const [darkBg, setDarkBg] = useState(img.meta?.preferred_bg === 'dark');
  const [notes, setNotes] = useState(img.meta?.notes || '');
  const [category, setCategory] = useState(img.meta?.category || '');
  const [projectSlug, setProjectSlug] = useState(img.meta?.project_slug || '');
  const [altText, setAltText] = useState(img.alt_text || '');
  const [tags, setTags] = useState<string[]>(img.tags || []);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLabel(img.meta?.label || img.filename || '');
    setIsLive(!!img.meta?.is_live);
    setDarkBg(img.meta?.preferred_bg === 'dark');
    setNotes(img.meta?.notes || '');
    setCategory(img.meta?.category || '');
    setProjectSlug(img.meta?.project_slug || '');
    setAltText(img.alt_text || '');
    setTags(img.tags || []);
  }, [img]);

  const copyUrl = () => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const save = async () => {
    setSaving(true);
    const row = await onSave(img, {
      label,
      is_live: isLive,
      preferred_bg: darkBg ? 'dark' : '',
      notes,
      category,
      project_slug: projectSlug,
      alt_text: altText,
      tags,
    });
    if (row) onUpdated(row);
    setSaving(false);
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, backdropFilter: 'blur(4px)'
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 16, boxShadow: '0 24px 48px rgba(0,0,0,0.4)', padding: 24
      }}>
        {/* Image preview */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <div style={{
            width: '100%', borderRadius: 10, overflow: 'hidden',
            background: darkBg ? 'var(--bg-panel)' : 'var(--bg-app)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 200, maxHeight: 360
          }}>
            {!isArtifact && url ? (
              <img src={url} alt={altText || img.filename || img.id}
                style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain', display: 'block', cursor: 'zoom-in' }}
                onClick={() => onFullscreen(url)} />
            ) : isArtifact ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                <FileArchive size={40} strokeWidth={1.25} style={{ marginBottom: 12, opacity: 0.85 }} />
                <div style={{ fontSize: 12, marginBottom: 8 }}>Artifact / capture — preview not shown here.</div>
                {img.r2_key && (
                  <code style={{ fontSize: 10, wordBreak: 'break-all', display: 'block', color: 'var(--text-muted)' }}>
                    {img.r2_key}
                  </code>
                )}
              </div>
            ) : (
              <ImageIcon size={48} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
            )}
          </div>
          {!isArtifact && url && (
            <button type="button" onClick={() => onFullscreen(url)} title="Fullscreen preview"
              style={{
                position: 'absolute', top: 10, right: 10,
                background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: 8,
                color: '#fff', padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11
              }}>
              <Maximize2 size={14} /> Fullscreen
            </button>
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--text-main)' }}>
          {img.filename || img.id}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
          {sourceLabel(img.source)} · {fmtDate(img.created_at || img.uploaded)}
          {img.size ? ` · ${fmtSize(img.size)}` : ''}
          {img.mime_type ? ` · ${img.mime_type}` : ''}
          {img.meta?.tenant_slug && <span style={{ marginLeft: 8, color: 'var(--solar-cyan)' }}>· {img.meta.tenant_slug}</span>}
        </div>

        {/* Variants */}
        {img.variants && img.variants.length > 0 && (
          <div style={{
            background: 'var(--bg-app)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: '10px 12px', marginBottom: 14
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Variants
            </div>
            {img.variants.map((v, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <code style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.split('/').pop()}
                </code>
                <button onClick={() => navigator.clipboard?.writeText(v)} style={smallBtnStyle}>Copy</button>
                <button onClick={() => window.open(v, '_blank', 'noopener')} style={smallBtnStyle}>
                  <Eye size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Meta fields */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Display name</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            placeholder="Friendly name…" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Tags</label>
          <TagEditor tags={tags} suggestions={allTags} onChange={setTags} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Category</label>
            <input value={category} onChange={e => setCategory(e.target.value)}
              placeholder="e.g. hero, logo, cms" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Project slug</label>
            <input value={projectSlug} onChange={e => setProjectSlug(e.target.value)}
              placeholder="e.g. inneranimalmedia" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Alt text</label>
          <input value={altText} onChange={e => setAltText(e.target.value)}
            placeholder="Accessibility description…" style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={isLive} onChange={e => setIsLive(e.target.checked)} />
            Live customer asset
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={darkBg} onChange={e => setDarkBg(e.target.checked)} />
            Dark card background
          </label>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Notes / usage</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Where this image is used…"
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' as const }} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {img.r2_key && (
          <button type="button" onClick={() => navigator.clipboard?.writeText(img.r2_key!)} style={actionBtnStyle('var(--bg-hover)', 'var(--text-main)')}>
            <Copy size={13} />Copy R2 key
          </button>
          )}
          <button type="button" onClick={copyUrl} style={actionBtnStyle('var(--bg-hover)', 'var(--text-main)')}>
            <Copy size={13} />{copied ? 'Copied!' : 'Copy proxy URL'}
          </button>
          <a href={url} target="_blank" rel="noopener"
            style={{ ...actionBtnStyle('var(--bg-hover)', 'var(--text-main)'), textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <ExternalLink size={13} />Open
          </a>
          {img.source === 'drive' && (
            <button type="button" onClick={() => onImportDrive(img)}
              style={actionBtnStyle('var(--solar-cyan)', '#000')}>
              <Upload size={13} />Import to R2
            </button>
          )}
          <button onClick={save} disabled={saving}
            style={actionBtnStyle('var(--solar-cyan)', '#000')}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {img.source !== 'drive' && (
            <button onClick={() => onDelete(img)}
              style={actionBtnStyle('rgba(239,68,68,0.15)', '#f87171')}>
              <Trash2 size={13} />Delete
            </button>
          )}
          <button onClick={onClose} style={{ ...actionBtnStyle('var(--bg-app)', 'var(--text-muted)'), marginLeft: 'auto' }}>
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ workspaceId, onClose, onUploaded, onError }: {
  workspaceId?: string | null;
  onClose: () => void;
  onUploaded: (img: CfImage) => void;
  onError: (msg: string) => void;
}) {
  const [urlInput, setUrlInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!urlInput.trim() && !file) { setStatus('Enter a URL or choose a file.'); return; }
    setBusy(true); setStatus('Uploading…');
    try {
      let r: Response;
      const base = imagesUploadUrl(workspaceId);
      const tagList = tagsInput.split(',').map(s => s.trim()).filter(Boolean);
      if (urlInput.trim()) {
        r = await fetch(base, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlInput.trim(), tags: tagList })
        });
      } else {
        const fd = new FormData();
        fd.append('file', file!);
        if (tagList.length) fd.append('tags', JSON.stringify(tagList));
        r = await fetch(base, { method: 'POST', credentials: 'same-origin', body: fd });
      }
      const d = await r.json();
      if (d.ok && (d.image || d.item)) { onUploaded(d.image || d.item); }
      else { setStatus('Error: ' + (d.error || 'Upload failed')); onError(d.error || 'Upload failed'); }
    } catch (e: any) {
      setStatus('Error: ' + e.message);
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 401, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, backdropFilter: 'blur(4px)'
      }}
    >
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 16, padding: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-main)' }}>Upload image</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <label style={labelStyle}>From URL</label>
        <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
          placeholder="https://…" style={{ ...inputStyle, marginBottom: 14 }} />

        <label style={labelStyle}>Or choose file</label>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: '1px dashed var(--border-subtle)', borderRadius: 8,
            padding: '16px 12px', cursor: 'pointer', marginBottom: 16,
            textAlign: 'center' as const, color: 'var(--text-muted)', fontSize: 12,
            background: 'var(--bg-app)', transition: 'border-color 0.15s'
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--solar-cyan)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
        >
          {file ? (
            <span style={{ color: 'var(--solar-cyan)' }}>{file.name}</span>
          ) : (
            <><Upload size={14} style={{ display: 'inline', marginRight: 6 }} />Click to browse</>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => setFile(e.target.files?.[0] || null)} />

        <label style={labelStyle}>Tags (comma-separated)</label>
        <input value={tagsInput} onChange={e => setTagsInput(e.target.value)}
          placeholder="hero, cms, inneranimalmedia" style={{ ...inputStyle, marginBottom: 14 }} />

        {status && (
          <div style={{ fontSize: 12, color: status.startsWith('Error') ? '#f87171' : 'var(--text-muted)', marginBottom: 12 }}>
            {status}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={busy}
            style={{ ...actionBtnStyle('var(--bg-app)', 'var(--text-muted)'), flex: 1, justifyContent: 'center' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy}
            style={{ ...actionBtnStyle('var(--solar-cyan)', '#000'), flex: 1, justifyContent: 'center', fontWeight: 600 }}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)', color: 'var(--text-main)', fontSize: 12, cursor: 'pointer'
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border-subtle)', background: 'var(--bg-app)',
  color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit'
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--text-muted)',
  marginBottom: 5, fontWeight: 500, letterSpacing: '0.03em'
};

const smallBtnStyle: React.CSSProperties = {
  padding: '3px 7px', borderRadius: 5, border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)', color: 'var(--text-muted)',
  fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center'
};

function actionBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
    borderRadius: 8, border: '1px solid var(--border-subtle)',
    background: bg, color, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
  };
}

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 8,
    border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-main)',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1
  };
}

export default ImagesPage;
