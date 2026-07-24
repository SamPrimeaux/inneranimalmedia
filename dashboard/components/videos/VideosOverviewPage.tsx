import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, Upload } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { VideosOutletContext } from './VideosShell';
import {
  copyStreamFromUrl,
  createStreamDirectUpload,
  fetchVideosOverview,
  formatBytes,
  formatDuration,
  useVideosToast,
  type VideosListRow,
} from './videosApi';
import {
  CF_STREAM_DOCS_URL,
  VIDEOS_SOURCE_TABS,
  videosAssetPath,
  videosDetailPath,
  type VideosSourceTab,
} from './videosRegistry';

function ToastStack({
  toasts,
}: {
  toasts: Array<{ id: number; msg: string; type: 'ok' | 'err' }>;
}) {
  if (!toasts.length) return null;
  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 12,
            background: t.type === 'err' ? '#7f1d1d' : 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: t.type === 'err' ? '#fecaca' : 'var(--text-main)',
            maxWidth: 320,
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function VideosOverviewPage() {
  const { workspaceId } = useOutletContext<VideosOutletContext>();
  const navigate = useNavigate();
  const { toasts, add: toast } = useVideosToast();
  const [source, setSource] = useState<VideosSourceTab>('all');
  const [rows, setRows] = useState<VideosListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchVideosOverview(source, workspaceId);
      setRows(res.rows);
      if (res.error && !res.rows.length) setError(res.error);
      else if (res.error) toast(res.error, 'err');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [source, workspaceId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDirectUpload = async () => {
    setBusy(true);
    try {
      const res = await createStreamDirectUpload({ max_duration_seconds: 3600 });
      if (!res.ok || !res.upload_url) {
        toast(res.error || 'Direct upload failed', 'err');
        return;
      }
      toast(res.uid ? `Upload ready · ${res.uid}` : 'Upload URL created');
      window.open(res.upload_url, '_blank', 'noopener');
      if (res.uid) {
        // Soft refresh after a beat — encode may still be pending
        setTimeout(() => void load(), 2500);
      }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Direct upload failed', 'err');
    } finally {
      setBusy(false);
    }
  };

  const onFromUrl = async () => {
    const url = linkUrl.trim();
    if (!url) {
      toast('URL required', 'err');
      return;
    }
    setBusy(true);
    try {
      const res = await copyStreamFromUrl({
        url,
        name: linkName.trim() || undefined,
      });
      if (!res.ok || !res.video?.uid) {
        toast(res.error || 'Copy from URL failed', 'err');
        return;
      }
      toast('Import started');
      setLinkOpen(false);
      setLinkUrl('');
      setLinkName('');
      navigate(videosDetailPath(res.video.uid, 'settings'));
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Copy from URL failed', 'err');
    } finally {
      setBusy(false);
    }
  };

  const chip = (id: VideosSourceTab, label: string) => (
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

  const openRow = (row: VideosListRow) => {
    if (row.source === 'stream') navigate(videosDetailPath(row.uid, 'settings'));
    else navigate(videosAssetPath(row.id));
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 20px 24px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDirectUpload()}
          style={actionBtn}
        >
          <Upload size={13} />
          Quick Upload
        </button>
        <button type="button" disabled={busy} onClick={() => setLinkOpen(true)} style={actionBtn}>
          <Link2 size={13} />
          Use Link
        </button>
        <a
          href={`${CF_STREAM_DOCS_URL}get-started/stream-uploads/`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...actionBtn, textDecoration: 'none' }}
        >
          Use API
        </a>
        <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} />
      </div>

      {linkOpen ? (
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxWidth: 560,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>Copy video from URL → Stream</div>
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            style={inputStyle}
          />
          <input
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Optional name"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => void onFromUrl()} style={actionBtn}>
              Import
            </button>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              style={{ ...actionBtn, opacity: 0.8 }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            overflow: 'hidden',
          }}
        >
          {VIDEOS_SOURCE_TABS.map((t) => chip(t.id, t.label))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rows.length} shown</span>
      </div>

      {error ? (
        <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>
      ) : null}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
      ) : !rows.length ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>
          {source === 'drive'
            ? 'No Drive videos in media_assets yet.'
            : source === 'r2'
              ? 'No R2 video assets yet.'
              : 'No videos found. Use Quick Upload or Use Link to add a Stream video.'}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 14,
          }}
        >
          {rows.map((row) => {
            const title = row.source === 'stream' ? row.name || row.uid : row.name;
            const thumb = row.source === 'stream' ? row.thumbnail : undefined;
            const badge =
              row.source === 'stream' ? 'Stream' : row.source === 'drive' ? 'Drive' : 'R2';
            return (
              <button
                key={row.rowKey}
                type="button"
                onClick={() => openRow(row)}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'var(--bg-panel)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: 0,
                  color: 'inherit',
                  fontFamily: 'inherit',
                }}
              >
                <div
                  style={{
                    aspectRatio: '16 / 9',
                    background: 'var(--bg-elevated)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{badge}</span>
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-main)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {title}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      fontSize: 10,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {badge}
                    </span>
                    {row.source === 'stream' ? (
                      <>
                        <span>{formatDuration(row.duration_sec)}</span>
                        <span>{row.status || (row.ready ? 'ready' : 'pending')}</span>
                      </>
                    ) : (
                      <>
                        <span>{formatBytes(row.size_bytes)}</span>
                        <span>{row.status || 'stored'}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <ToastStack toasts={toasts} />
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-main)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-app)',
  color: 'var(--text-main)',
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export default VideosOverviewPage;
