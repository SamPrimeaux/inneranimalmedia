import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Trash2, Copy, ExternalLink, X, Search,
  ChevronLeft, ChevronRight, ImageIcon, Star, SlidersHorizontal,
  RefreshCw, Eye, AlertCircle, CheckCircle, Filter
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImageMeta {
  label?: string;
  is_live?: boolean;
  preferred_bg?: string;
  notes?: string;
  tenant_slug?: string;
}

interface CfImage {
  id: string;
  filename?: string;
  uploaded?: string;
  url?: string;
  thumbnail?: string;
  variants?: string[];
  meta?: ImageMeta;
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

// ── Main Component ────────────────────────────────────────────────────────────

export function ImagesPage() {
  const [images, setImages] = useState<CfImage[]>([]);
  const [accountHash, setAccountHash] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [perPage, setPerPage] = useState(100);
  const [page, setPage] = useState(1);
  const [tenantFilter, setTenantFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<CfImage | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const { toasts, add: toast } = useToast();

  // ── Fetch images ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/images?per_page=1000', { credentials: 'same-origin' });
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setImages(d.images || []);
      if (d.accountHash) setAccountHash(d.accountHash);
    } catch (e: any) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/cms/tenants', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.tenants) setTenants(d.tenants); })
      .catch(() => {});
  }, []);

  // ── Derived list ──────────────────────────────────────────────────────────

  const filtered = React.useMemo(() => {
    let list = [...images];
    if (tenantFilter !== 'all') list = list.filter(i => i.meta?.tenant_slug === tenantFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => (i.filename || i.id || '').toLowerCase().includes(q));
    }
    if (sort === 'newest') list.sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || ''));
    else if (sort === 'oldest') list.sort((a, b) => (a.uploaded || '').localeCompare(b.uploaded || ''));
    else if (sort === 'name-az') list.sort((a, b) => (a.filename || a.id || '').localeCompare(b.filename || b.id || ''));
    else if (sort === 'name-za') list.sort((a, b) => (b.filename || b.id || '').localeCompare(a.filename || a.id || ''));
    return list;
  }, [images, tenantFilter, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // reset page on filter change
  useEffect(() => setPage(1), [sort, tenantFilter, search, perPage]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteImage = useCallback(async (img: CfImage) => {
    if (!confirm(`Delete "${img.filename || img.id}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/images/${encodeURIComponent(img.id)}`, {
        method: 'DELETE', credentials: 'same-origin'
      });
      const d = await r.json();
      if (d.ok) {
        setImages(p => p.filter(i => i.id !== img.id));
        setDetail(null);
        toast('Image deleted');
      } else {
        toast(d.error || 'Delete failed', 'err');
      }
    } catch (e: any) {
      toast('Error: ' + e.message, 'err');
    }
  }, [toast]);

  // ── Save meta ─────────────────────────────────────────────────────────────

  const saveMeta = useCallback(async (img: CfImage, payload: ImageMeta) => {
    try {
      const r = await fetch(`/api/images/${encodeURIComponent(img.id)}/meta`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (d.ok && d.meta) {
        setImages(p => p.map(i => i.id === img.id ? { ...i, meta: { ...i.meta, ...d.meta } } : i));
        toast('Saved');
        return true;
      }
      toast(d.error || 'Save failed', 'err');
    } catch (e: any) {
      toast('Error: ' + e.message, 'err');
    }
    return false;
  }, [toast]);

  // ── URL for display ───────────────────────────────────────────────────────

  const imgUrl = (img: CfImage) =>
    img.url || (accountHash && img.id ? buildImageUrl(accountHash, img.id) : '');

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
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.02em' }}>Images</span>
          {!loading && (
            <span style={{
              fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)', borderRadius: 999,
              padding: '1px 8px', marginLeft: 4
            }}>{filtered.length} total</span>
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
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
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

        {/* Loading */}
        {loading && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 64, gap: 12
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid var(--border-subtle)',
              borderTopColor: 'var(--solar-cyan)',
              animation: 'spin 0.8s linear infinite'
            }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading images…</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 64, gap: 12,
            color: 'var(--text-muted)'
          }}>
            <ImageIcon size={40} strokeWidth={1} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 14 }}>
              {images.length === 0 ? 'No images yet. Upload a file or paste a URL.' : 'No images match your filters.'}
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
                    {url ? (
                      <img
                        src={img.thumbnail || url}
                        alt={img.filename || img.id}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                        onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                      />
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
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmtDate(img.uploaded)}
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
              Page {page} of {totalPages} · {filtered.length} images
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
          accountHash={accountHash}
          onClose={() => setDetail(null)}
          onDelete={deleteImage}
          onSaveMeta={saveMeta}
          onUpdated={updated => setDetail(updated)}
        />
      )}

      {/* Upload Modal */}
      {uploadOpen && (
        <UploadModal
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailModal({ img, url, accountHash, onClose, onDelete, onSaveMeta, onUpdated }: {
  img: CfImage;
  url: string;
  accountHash: string;
  onClose: () => void;
  onDelete: (img: CfImage) => void;
  onSaveMeta: (img: CfImage, payload: ImageMeta) => Promise<boolean>;
  onUpdated: (img: CfImage) => void;
}) {
  const [label, setLabel] = useState(img.meta?.label || '');
  const [isLive, setIsLive] = useState(!!img.meta?.is_live);
  const [darkBg, setDarkBg] = useState(img.meta?.preferred_bg === 'dark');
  const [notes, setNotes] = useState(img.meta?.notes || '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const save = async () => {
    setSaving(true);
    const ok = await onSaveMeta(img, {
      label, is_live: isLive,
      preferred_bg: darkBg ? 'dark' : '',
      notes
    });
    if (ok) onUpdated({ ...img, meta: { ...img.meta, label, is_live: isLive, preferred_bg: darkBg ? 'dark' : '', notes } });
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
        width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 16, boxShadow: '0 24px 48px rgba(0,0,0,0.4)', padding: 24
      }}>
        {/* Image preview */}
        <div style={{
          width: '100%', borderRadius: 10, overflow: 'hidden',
          background: darkBg ? 'var(--bg-panel)' : 'var(--bg-app)',
          marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 180
        }}>
          {url ? (
            <img src={url} alt={img.filename || img.id}
              style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }} />
          ) : (
            <ImageIcon size={48} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--text-main)' }}>
          {img.filename || img.id}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
          Uploaded {fmtDate(img.uploaded)}
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
          <button onClick={copyUrl} style={actionBtnStyle('var(--bg-hover)', 'var(--text-main)')}>
            <Copy size={13} />{copied ? 'Copied!' : 'Copy URL'}
          </button>
          <a href={url} target="_blank" rel="noopener"
            style={{ ...actionBtnStyle('var(--bg-hover)', 'var(--text-main)'), textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <ExternalLink size={13} />Open
          </a>
          <button onClick={save} disabled={saving}
            style={actionBtnStyle('var(--solar-cyan)', '#000')}>
            {saving ? 'Saving…' : 'Save note'}
          </button>
          <button onClick={() => onDelete(img)}
            style={actionBtnStyle('rgba(239,68,68,0.15)', '#f87171')}>
            <Trash2 size={13} />Delete
          </button>
          <button onClick={onClose} style={{ ...actionBtnStyle('var(--bg-app)', 'var(--text-muted)'), marginLeft: 'auto' }}>
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ onClose, onUploaded, onError }: {
  onClose: () => void;
  onUploaded: (img: CfImage) => void;
  onError: (msg: string) => void;
}) {
  const [urlInput, setUrlInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!urlInput.trim() && !file) { setStatus('Enter a URL or choose a file.'); return; }
    setBusy(true); setStatus('Uploading…');
    try {
      let r: Response;
      if (urlInput.trim()) {
        r = await fetch('/api/images', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlInput.trim() })
        });
      } else {
        const fd = new FormData();
        fd.append('file', file!);
        r = await fetch('/api/images', { method: 'POST', credentials: 'same-origin', body: fd });
      }
      const d = await r.json();
      if (d.ok && d.image) { onUploaded(d.image); }
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
