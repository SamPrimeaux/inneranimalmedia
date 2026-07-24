import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { connectGoogleDrive, fetchR2BucketNames } from '../../src/lib/library/libraryApi';
import { cloudflareImageUrl } from '../../src/lib/cloudflareImageUrl';
import { ImageBatchBar } from './ImageBatchBar';
import type { ImagesOutletContext } from './ImagesShell';
import {
  ImagesToastStack,
  ImagesUsageAccountSidebar,
  useImagesAccountState,
} from './ImagesUsageAccountSidebar';
import {
  buildCfImageUrl,
  imagesBatchDeleteUrl,
  imagesBatchExportUrl,
  imagesListUrl,
  imagesUploadUrl,
  useImagesToast,
  type ImagesSourceTab,
} from './imagesApi';

type ItemSource = 'r2' | 'cf_images' | 'drive';

type CfImage = {
  id: string;
  source?: ItemSource;
  filename?: string;
  url?: string;
  thumbnail?: string;
  thumbnail_url?: string;
  cloudflare_image_id?: string | null;
  drive_file_id?: string;
  r2_key?: string | null;
  r2_bucket?: string;
  created_at?: string;
  uploaded?: string;
  mime_type?: string;
};

const PER_PAGE = 50;

export function ImagesStoragePage() {
  const { workspaceId } = useOutletContext<ImagesOutletContext>();
  const navigate = useNavigate();
  const { toasts, add: toast } = useImagesToast();
  const { accountHash, setAccountHash, transformed, refresh: refreshAccount } =
    useImagesAccountState(workspaceId);

  const [images, setImages] = useState<CfImage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<ImagesSourceTab>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  const [driveAccountEmail, setDriveAccountEmail] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [r2Buckets, setR2Buckets] = useState<string[]>([]);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(imagesListUrl(workspaceId, source, page, PER_PAGE), {
        credentials: 'same-origin',
      });
      const d = await r.json();
      if (d.error) {
        setError(d.error);
        setImages([]);
        setTotal(0);
        return;
      }
      const rows: CfImage[] = d.items || d.images || [];
      setImages(rows);
      setTotal(typeof d.total === 'number' ? d.total : rows.length);
      if (d.accountHash) setAccountHash(String(d.accountHash));
      if (typeof d.drive_connected === 'boolean') setDriveConnected(d.drive_connected);
      setDriveAccountEmail(
        typeof d.drive_account_email === 'string' && d.drive_account_email
          ? d.drive_account_email
          : null,
      );
      setDriveError(typeof d.drive_error === 'string' && d.drive_error ? d.drive_error : null);
      if (Array.isArray(d.r2_buckets) && d.r2_buckets.length) {
        setR2Buckets(d.r2_buckets.map((b: string | { name?: string }) => (typeof b === 'string' ? b : b.name || '')).filter(Boolean));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, source, page, setAccountHash]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (source !== 'r2') return;
    let cancelled = false;
    fetchR2BucketNames()
      .then((list) => {
        if (!cancelled && list.length) setR2Buckets(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source]);

  const onConnectDrive = useCallback(async () => {
    setConnectingDrive(true);
    try {
      const result = await connectGoogleDrive('/dashboard/images/storage');
      if (result.ok) {
        toast('Google Drive connected');
        setSource('drive');
        await load();
      } else if (result.error && result.error !== 'popup_blocked') {
        toast(`Drive connect failed: ${result.error}`, 'err');
      }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Drive connect failed', 'err');
    } finally {
      setConnectingDrive(false);
    }
  }, [load, toast]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [source]);

  useEffect(() => {
    const close = () => setMenuId(null);
    if (menuId) {
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
    }
  }, [menuId]);

  const resolveUrl = (img: CfImage) => {
    if (img.source === 'drive') {
      const driveId = img.drive_file_id || (img.id?.startsWith('drive_') ? img.id.slice(6) : '');
      if (driveId) return `/api/images/drive/${encodeURIComponent(driveId)}/preview`;
    }
    if (img.url && !img.url.includes('drive.google.com') && !img.url.includes('docs.google.com')) {
      return img.url;
    }
    if (img.r2_key && img.r2_bucket) {
      return `/api/r2/buckets/${encodeURIComponent(img.r2_bucket)}/object/${encodeURIComponent(img.r2_key)}`;
    }
    const cfId = img.cloudflare_image_id || (img.id?.startsWith('cf_live_') ? img.id.slice(9) : '');
    if (accountHash && cfId) return buildCfImageUrl(accountHash, cfId);
    return img.url || img.thumbnail_url || img.thumbnail || '';
  };

  const previewProps = (img: CfImage) => {
    const raw = resolveUrl(img);
    return cloudflareImageUrl(raw);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) {
      toast('No image files selected', 'err');
      return;
    }
    setBusy(true);
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(imagesUploadUrl(workspaceId), {
          method: 'POST',
          credentials: 'same-origin',
          body: fd,
        });
        const d = await r.json();
        if (!(d.ok && (d.image || d.item))) {
          toast(d.error || `Upload failed: ${file.name}`, 'err');
          continue;
        }
        toast(`Uploaded: ${file.name}`);
      }
      await load();
      await refreshAccount();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'err');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteOne = async (img: CfImage) => {
    if (!confirm(`Delete "${img.filename || img.id}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/images/${encodeURIComponent(img.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const d = await r.json();
      if (d.ok) {
        toast('Image deleted');
        setSelected((s) => {
          const n = new Set(s);
          n.delete(img.id);
          return n;
        });
        await load();
      } else toast(d.error || 'Delete failed', 'err');
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'err');
    }
  };

  const exportOne = (img: CfImage) => {
    const url = resolveUrl(img);
    if (!url) {
      toast('No URL to export', 'err');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = img.filename || `${img.id}.jpg`;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyUrl = async (img: CfImage) => {
    const url = resolveUrl(img);
    if (!url) {
      toast('No URL', 'err');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('URL copied');
    } catch {
      toast('Copy failed', 'err');
    }
  };

  const batchDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} image(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(imagesBatchDeleteUrl(workspaceId), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const d = await r.json();
      if (!r.ok && d.error) {
        toast(d.error, 'err');
      } else {
        toast(`Deleted ${ids.length} image(s)`);
        setSelected(new Set());
        await load();
      }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Batch delete failed', 'err');
    } finally {
      setBusy(false);
    }
  };

  const batchExport = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    try {
      const r = await fetch(imagesBatchExportUrl(workspaceId), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (r.ok) {
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const d = await r.json();
          const urls: string[] = d.urls || d.items?.map((i: { url?: string }) => i.url).filter(Boolean) || [];
          if (urls.length) {
            for (const u of urls) window.open(u, '_blank', 'noopener');
            toast(`Exported ${urls.length} URL(s)`);
          } else if (d.error) toast(d.error, 'err');
          else toast('Export returned no URLs', 'err');
        } else {
          const blob = await r.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'images-export.zip';
          a.click();
          URL.revokeObjectURL(a.href);
          toast('Export downloaded');
        }
      } else {
        // Fallback: open each selected delivery URL
        const picked = images.filter((i) => selected.has(i.id));
        for (const img of picked) {
          const u = resolveUrl(img);
          if (u) window.open(u, '_blank', 'noopener');
        }
        toast(`Opened ${picked.length} URL(s)`);
      }
    } catch {
      const picked = images.filter((i) => selected.has(i.id));
      for (const img of picked) {
        const u = resolveUrl(img);
        if (u) window.open(u, '_blank', 'noopener');
      }
      toast(`Opened ${picked.length} URL(s)`);
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const chip = (id: ImagesSourceTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setSource(id)}
      style={{
        padding: '6px 12px',
        fontSize: 11,
        border: 'none',
        cursor: 'pointer',
        background: source === id ? 'var(--solar-cyan)' : 'var(--bg-elevated)',
        color: source === id ? '#000' : 'var(--text-muted)',
        fontWeight: source === id ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '16px 20px 24px' }}>
        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => {
            if (source === 'drive') return;
            fileRef.current?.click();
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            border: `1px dashed ${dragOver ? 'var(--solar-cyan)' : 'var(--border-subtle)'}`,
            borderRadius: 12,
            padding: '28px 16px',
            textAlign: 'center',
            background: dragOver
              ? 'color-mix(in srgb, var(--solar-cyan) 8%, var(--bg-panel))'
              : 'var(--bg-panel)',
            cursor: source === 'drive' ? 'default' : busy ? 'wait' : 'pointer',
            marginBottom: 16,
            color: 'var(--text-muted)',
            fontSize: 13,
            fontFamily: 'inherit',
            opacity: source === 'drive' ? 0.65 : 1,
          }}
        >
          <Upload size={22} style={{ color: 'var(--solar-cyan)', flexShrink: 0 }} />
          <div style={{ lineHeight: 1.4 }}>
            {source === 'drive'
              ? 'Drive is browse-only — Import copies to R2 + registry (not CF Images)'
              : busy
                ? 'Uploading…'
                : 'Drop images here or click to upload'}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              borderRadius: 8,
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
            }}
          >
            {chip('all', 'All')}
            {chip('r2', 'R2')}
            {chip('cf_images', 'CF Images')}
            {chip('drive', 'Drive')}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total} total</span>
        </div>

        <ImageBatchBar
          selectedCount={selected.size}
          onExport={() => void batchExport()}
          onDelete={() => void batchDelete()}
          disabled={busy}
        />

        {error && (
          <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : !images.length ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>
            No images found for this source.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 14,
            }}
          >
            {images.map((img) => {
              const prev = previewProps(img);
              const isSel = selected.has(img.id);
              return (
                <div
                  key={img.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSelect(img.id)}
                  onDoubleClick={() => navigate(`/dashboard/images/${encodeURIComponent(img.id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') toggleSelect(img.id);
                    if (e.key === ' ') {
                      e.preventDefault();
                      navigate(`/dashboard/images/${encodeURIComponent(img.id)}`);
                    }
                  }}
                  style={{
                    border: isSel
                      ? '1px solid var(--solar-cyan)'
                      : '1px solid var(--border-subtle)',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: 'var(--bg-panel)',
                    cursor: 'pointer',
                    position: 'relative',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ position: 'relative', aspectRatio: '4/3', background: 'var(--bg-elevated)' }}>
                    {prev.src ? (
                      <img
                        src={prev.src}
                        srcSet={prev.srcSet}
                        sizes={prev.sizes}
                        alt={img.filename || img.id}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-muted)',
                          fontSize: 11,
                        }}
                      >
                        No preview
                      </div>
                    )}
                    <input
                      type="checkbox"
                      checked={isSel}
                      onClick={(e) => toggleSelect(img.id, e)}
                      onChange={() => {}}
                      aria-label={`Select ${img.filename || img.id}`}
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        width: 16,
                        height: 16,
                        cursor: 'pointer',
                        zIndex: 2,
                      }}
                    />
                    <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
                      <button
                        type="button"
                        aria-label="More actions"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId((m) => (m === img.id ? null : img.id));
                        }}
                        style={{
                          display: 'flex',
                          padding: 5,
                          borderRadius: 6,
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {menuId === img.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: 4,
                            minWidth: 140,
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 8,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                            overflow: 'hidden',
                            zIndex: 10,
                          }}
                        >
                          <MenuItem
                            icon={<Eye size={12} />}
                            label="Open"
                            onClick={() => {
                              setMenuId(null);
                              navigate(`/dashboard/images/${encodeURIComponent(img.id)}`);
                            }}
                          />
                          <MenuItem
                            icon={<Pencil size={12} />}
                            label="Edit"
                            onClick={() => {
                              setMenuId(null);
                              navigate(`/dashboard/images/${encodeURIComponent(img.id)}/edit`);
                            }}
                          />
                          <MenuItem
                            icon={<Copy size={12} />}
                            label="Copy url"
                            onClick={() => {
                              setMenuId(null);
                              void copyUrl(img);
                            }}
                          />
                          <MenuItem
                            icon={<Download size={12} />}
                            label="Export"
                            onClick={() => {
                              setMenuId(null);
                              exportOne(img);
                            }}
                          />
                          <MenuItem
                            icon={<Trash2 size={12} />}
                            label="Delete"
                            danger
                            onClick={() => {
                              setMenuId(null);
                              void deleteOne(img);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ padding: '9px 11px' }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--text-main)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'inherit',
                      }}
                      title={img.filename || img.id}
                    >
                      {img.filename || img.id}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'inherit' }}>
                      {img.source === 'cf_images'
                        ? 'CF Images'
                        : img.source === 'drive'
                          ? 'Drive'
                          : img.source === 'r2'
                            ? 'R2'
                            : '—'}
                      <span style={{ opacity: 0.7 }}> · click select · double-click open</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginTop: 20,
            }}
          >
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={pagerBtn(page <= 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={pagerBtn(page >= totalPages)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          borderLeft: '1px solid var(--border-subtle)',
          padding: '16px 14px',
          overflowY: 'auto',
          background: 'var(--bg-panel)',
        }}
      >
        <ImagesUsageAccountSidebar
          workspaceId={workspaceId}
          source={source}
          imagesStored={total}
          imagesTransformed={transformed}
          accountHash={accountHash}
          driveConnected={driveConnected}
          driveAccountEmail={driveAccountEmail}
          driveError={driveError}
          r2Buckets={r2Buckets}
          onConnectDrive={() => void onConnectDrive()}
          connectingDrive={connectingDrive}
          onCopy={(msg) => toast(msg.includes('fail') ? msg : msg, msg.includes('fail') ? 'err' : 'ok')}
        />
      </div>

      <ImagesToastStack toasts={toasts} />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '8px 12px',
        border: 'none',
        background: 'transparent',
        color: danger ? '#f87171' : 'var(--text-main)',
        fontSize: 12,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-elevated)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-main)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };
}

export default ImagesStoragePage;
