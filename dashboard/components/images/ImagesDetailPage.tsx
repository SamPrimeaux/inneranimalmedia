import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Download,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { cloudflareImageUrl } from '../../src/lib/cloudflareImageUrl';
import { ImageShareModal } from './ImageShareModal';
import { ImageTagPicker } from './ImageTagPicker';
import { ImageVariantGrid } from './ImageVariantGrid';
import type { ImagesOutletContext } from './ImagesShell';
import { ImagesToastStack } from './ImagesUsageAccountSidebar';
import { NAMED_VARIANTS } from './imagesRegistry';
import {
  buildCfImageUrl,
  imagesDetailUrl,
  imagesPatchUrl,
  imagesResourceTagsCatalogUrl,
  useImagesToast,
} from './imagesApi';

type DetailImage = {
  id: string;
  filename?: string;
  original_filename?: string;
  url?: string;
  thumbnail_url?: string;
  cloudflare_image_id?: string | null;
  created_at?: string;
  uploaded?: string;
  mime_type?: string;
  size?: number;
  width?: number | null;
  height?: number | null;
  tags?: string[];
  resource_tags?: Record<string, string>;
  alt_text?: string | null;
  description?: string | null;
  meta?: Record<string, unknown>;
  source?: string;
  user_id?: string;
  workspace_id?: string;
  visibility?: string;
  accountHash?: string;
  variants?: string[] | Record<string, string>;
};

export function ImagesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { workspaceId } = useOutletContext<ImagesOutletContext>();
  const navigate = useNavigate();
  const { toasts, add: toast } = useImagesToast();

  const [img, setImg] = useState<DetailImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tagGroups, setTagGroups] = useState<Array<{ key: string; values: string[] }>>([]);
  const [resourceTags, setResourceTags] = useState<Record<string, string>>({});
  const [selectedVariant, setSelectedVariant] = useState('public');
  const [shareOpen, setShareOpen] = useState(false);
  const [accountHash, setAccountHash] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch(imagesDetailUrl(id, workspaceId), { credentials: 'same-origin' });
      const d = await r.json();
      if (!r.ok || d.error) {
        setError(d.error || `Failed to load (${r.status})`);
        setImg(null);
        return;
      }
      const row: DetailImage = d.item || d.image || d;
      setImg(row);
      const rt =
        (d.resource_tags && typeof d.resource_tags === 'object' && d.resource_tags) ||
        (row.resource_tags && typeof row.resource_tags === 'object' && row.resource_tags) ||
        (row.meta?.cf_resource_tags &&
        typeof row.meta.cf_resource_tags === 'object' &&
        !Array.isArray(row.meta.cf_resource_tags)
          ? (row.meta.cf_resource_tags as Record<string, string>)
          : {});
      setResourceTags(rt || {});
      if (d.accountHash) setAccountHash(String(d.accountHash));
      else if (row.accountHash) setAccountHash(String(row.accountHash));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [id, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch(imagesResourceTagsCatalogUrl(), { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const groupsObj = d.groups && typeof d.groups === 'object' ? d.groups : {};
        const keys: string[] = Array.isArray(d.keys) ? d.keys : Object.keys(groupsObj);
        setTagGroups(
          keys.map((key) => ({
            key,
            values: Array.isArray(groupsObj[key]) ? groupsObj[key].map(String) : [],
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const cfId = img?.cloudflare_image_id || (img?.id?.startsWith('cf_live_') ? img.id.slice(9) : '');
  const baseUrl = useMemo(() => {
    if (!img) return '';
    if (accountHash && cfId) return buildCfImageUrl(accountHash, cfId, 'public');
    return img.url || '';
  }, [img, accountHash, cfId]);

  const variantMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of NAMED_VARIANTS) {
      if (accountHash && cfId) map[v.id] = buildCfImageUrl(accountHash, cfId, v.id);
      else if (baseUrl && baseUrl.includes('imagedelivery.net')) {
        map[v.id] = baseUrl.replace(/\/(public|small|thumbnail|avatar|hero|large|medium)(?:\?.*)?$/i, `/${v.id}`);
      } else if (baseUrl) map[v.id] = baseUrl;
    }
    if (img?.variants && typeof img.variants === 'object' && !Array.isArray(img.variants)) {
      Object.assign(map, img.variants);
    }
    return map;
  }, [accountHash, cfId, baseUrl, img]);

  const previewUrl = variantMap[selectedVariant] || baseUrl;
  const galleryPreview = cloudflareImageUrl(baseUrl);
  const selectedVariantHint = useMemo(
    () => NAMED_VARIANTS.find((v) => v.id === selectedVariant)?.hint || '',
    [selectedVariant],
  );

  const saveResourceTags = async (next: Record<string, string>) => {
    if (!img) return;
    const prev = resourceTags;
    setResourceTags(next);
    try {
      const r = await fetch(imagesPatchUrl(img.id, workspaceId), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_tags: next }),
      });
      const d = await r.json();
      if (d.ok && (d.item || d.image || d.resource_tags)) {
        if (d.item || d.image) setImg(d.item || d.image);
        if (d.resource_tags && typeof d.resource_tags === 'object') setResourceTags(d.resource_tags);
        const syncOk = d.storage_sync?.cf_tags?.ok !== false;
        toast(syncOk ? 'Tags saved' : 'Tags saved locally — Cloudflare sync pending');
      } else {
        setResourceTags(prev);
        toast(d.error || 'Failed to save tags', 'err');
      }
    } catch (e: unknown) {
      setResourceTags(prev);
      toast(e instanceof Error ? e.message : 'Save failed', 'err');
    }
  };

  const onDelete = async () => {
    if (!img) return;
    if (!confirm(`Delete "${img.filename || img.id}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/images/${encodeURIComponent(img.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const d = await r.json();
      if (d.ok) {
        toast('Image deleted');
        navigate('/dashboard/images/storage');
      } else toast(d.error || 'Delete failed', 'err');
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'err');
    }
  };

  const onExport = () => {
    const url = previewUrl || baseUrl;
    if (!url) {
      toast('No URL to export', 'err');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = img?.filename || `${img?.id || 'image'}.jpg`;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // CF's own Metadata panel shows exactly what's actually stored against the
  // image — often just `{}` when nothing's been set. The Image ID/Filename/
  // Creator/etc fields already have their own rows in the left panel, so
  // re-packaging them into this JSON view is pure duplication, not metadata.
  // Show img.meta verbatim (empty object if there's genuinely nothing there)
  // rather than synthesizing a payload that always looks non-empty.
  const metaJson = useMemo(() => {
    const raw = img?.meta && typeof img.meta === 'object' && !Array.isArray(img.meta) ? img.meta : {};
    return JSON.stringify(raw, null, 2);
  }, [img]);

  const btn = (label: string, icon: React.ReactNode, onClick: () => void, primary?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 12px',
        borderRadius: 8,
        border: primary ? 'none' : '1px solid var(--border-subtle)',
        background: primary ? 'var(--solar-cyan)' : 'var(--bg-elevated)',
        color: primary ? '#000' : 'var(--text-main)',
        fontSize: 12,
        fontWeight: primary ? 600 : 400,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {icon}
      {label}
    </button>
  );

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
    );
  }

  if (error || !img) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error || 'Not found'}</div>
        <Link to="/dashboard/images/storage" style={{ color: 'var(--solar-cyan)', fontSize: 13 }}>
          Back to Storage
        </Link>
      </div>
    );
  }

  const created = img.created_at || img.uploaded || '—';

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 24px 32px' }}>
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <Link to="/dashboard/images/storage" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
          Images
        </Link>
        <ChevronRight size={12} />
        <Link to="/dashboard/images/storage" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
          Storage
        </Link>
        <ChevronRight size={12} />
        <span style={{ color: 'var(--text-main)' }}>{img.filename || img.id}</span>
      </nav>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{img.filename || img.id}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {btn('Export', <Download size={13} />, onExport)}
          {btn('Edit', <Pencil size={13} />, () =>
            navigate(`/dashboard/images/${encodeURIComponent(img.id)}/edit`),
          )}
          {btn('Share', <Share2 size={13} />, () => setShareOpen(true), true)}
          {btn('Delete', <Trash2 size={13} />, () => void onDelete())}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 320px) 1fr',
          gap: 20,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel)',
          }}
        >
          <Field label="Image ID" value={img.id} />
          <Field label="Created" value={String(created)} />
          <Field label="Filename" value={img.filename || img.original_filename || '—'} />
          <Field label="Creator" value={img.user_id || '—'} />
          <Field label="Visibility" value={img.visibility || 'private'} />
            <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Tags</div>
            <ImageTagPicker
              resourceTags={resourceTags}
              groups={tagGroups}
              onChange={(next) => void saveResourceTags(next)}
            />
          </div>
        </div>

        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Metadata</div>
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 8,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: 11,
              color: 'var(--text-muted)',
              overflow: 'auto',
              maxHeight: 280,
            }}
          >
            {metaJson}
          </pre>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Variants</div>
        <ImageVariantGrid
          variants={variantMap}
          selected={selectedVariant}
          onSelect={setSelectedVariant}
        />
      </div>

      <div
        style={{
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-elevated)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          minHeight: 320,
        }}
      >
        {(previewUrl || galleryPreview.src) && (
          // key forces a clean remount on variant switch so the browser never
          // paints a stale frame while the new (differently-sized) source loads.
          <img
            key={previewUrl ? selectedVariant : 'gallery-fallback'}
            src={previewUrl || galleryPreview.src}
            srcSet={!previewUrl ? galleryPreview.srcSet : undefined}
            sizes={!previewUrl ? galleryPreview.sizes : undefined}
            alt={img.filename || img.id}
            style={{ maxWidth: '100%', maxHeight: 440, objectFit: 'contain', borderRadius: 4 }}
          />
        )}
        {previewUrl ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {selectedVariant}
            {selectedVariantHint ? ` \u00b7 ${selectedVariantHint}` : ''}
          </div>
        ) : null}
      </div>

      <ImageShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        imageId={img.id}
        deliveryUrl={variantMap.public || baseUrl}
        workspaceId={workspaceId}
      />
      <ImagesToastStack toasts={toasts} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-main)',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default ImagesDetailPage;
