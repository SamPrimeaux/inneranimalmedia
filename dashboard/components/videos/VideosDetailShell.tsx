import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import {
  NavLink,
  Navigate,
  Outlet,
  useNavigate,
  useOutlet,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import type { VideosOutletContext } from './VideosShell';
import {
  deleteStreamVideo,
  formatBytes,
  formatDuration,
  getStreamVideo,
  useVideosToast,
  type StreamVideoDetail,
} from './videosApi';
import { CF_STREAM_DOCS_URL, VIDEOS_BASE, VIDEOS_DETAIL_TABS } from './videosRegistry';

export type VideosDetailOutletContext = VideosOutletContext & {
  uid: string;
  video: StreamVideoDetail;
  reload: () => Promise<void>;
  toast: (msg: string, type?: 'ok' | 'err') => void;
};

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

export function VideosDetailShell() {
  const { uid } = useParams<{ uid: string }>();
  const parent = useOutletContext<VideosOutletContext>();
  const navigate = useNavigate();
  const { toasts, add: toast } = useVideosToast();
  const [video, setVideo] = useState<StreamVideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError('');
    try {
      const res = await getStreamVideo(uid);
      if (!res.ok || !res.video) {
        setError(res.error || 'Failed to load video');
        setVideo(null);
        return;
      }
      setVideo(res.video);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
      setVideo(null);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    parent.setDocsUrl(CF_STREAM_DOCS_URL);
    return () => parent.setDocsUrl(null);
  }, [parent]);

  const ctx: VideosDetailOutletContext | null = useMemo(() => {
    if (!uid || !video) return null;
    return {
      ...parent,
      uid,
      video,
      reload,
      toast,
    };
  }, [parent, uid, video, reload, toast]);

  const onDelete = async () => {
    if (!uid) return;
    if (!confirm('Delete this Stream video? This cannot be undone.')) return;
    const res = await deleteStreamVideo(uid);
    if (!res.ok) {
      toast(res.error || 'Delete failed', 'err');
      return;
    }
    toast('Video deleted');
    navigate(VIDEOS_BASE);
  };

  if (!uid) return <Navigate to={VIDEOS_BASE} replace />;

  if (loading && !video) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Loading video…</div>
    );
  }

  if (error || !video || !ctx) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>
          {error || 'Video not found'}
        </div>
        <button
          type="button"
          onClick={() => navigate(VIDEOS_BASE)}
          style={{
            fontSize: 12,
            color: 'var(--solar-cyan)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ← Back to videos
        </button>
      </div>
    );
  }

  const watchUrl = video.watch_url || '';
  const iframeUrl = video.iframe_url || '';

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div style={{ padding: '16px 24px 0' }}>
        <button
          type="button"
          onClick={() => navigate(VIDEOS_BASE)}
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            marginBottom: 10,
            padding: 0,
          }}
        >
          ← Hosted videos
        </button>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: '-0.01em',
              }}
            >
              {video.name || video.uid}
            </h2>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              <span>{video.status || (video.ready ? 'ready' : 'pending')}</span>
              <span>{formatDuration(video.duration_sec)}</span>
              <span>{formatBytes(video.size_bytes)}</span>
              <code style={{ fontSize: 10 }}>{video.uid}</code>
            </div>
            {watchUrl ? (
              <div style={{ marginTop: 10, fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>Video Link</span>
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--solar-cyan)', wordBreak: 'break-all' }}
                >
                  {watchUrl}
                  <ExternalLink size={11} style={{ marginLeft: 4, display: 'inline' }} />
                </a>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void onDelete()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid #7f1d1d',
              background: 'transparent',
              color: '#f87171',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>

        {iframeUrl ? (
          <div
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              background: '#000',
              maxWidth: 720,
              marginBottom: 16,
            }}
          >
            <iframe
              title="Stream preview"
              src={iframeUrl}
              style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', border: 'none' }}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : null}

        <nav
          style={{ display: 'flex', gap: 0, overflowX: 'auto', borderBottom: '1px solid var(--border-subtle)' }}
          aria-label="Video detail sections"
        >
          {VIDEOS_DETAIL_TABS.map((tab) => (
            <NavLink
              key={tab.id}
              to={`${VIDEOS_BASE}/${encodeURIComponent(uid)}/${tab.id}`}
              style={({ isActive }) => ({
                padding: '10px 14px',
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--solar-cyan)' : 'var(--text-muted)',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid var(--solar-cyan)' : '2px solid transparent',
                whiteSpace: 'nowrap',
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div style={{ padding: '16px 24px 32px' }}>
        <Outlet context={ctx} />
      </div>
      <ToastStack toasts={toasts} />
    </div>
  );
}

export default VideosDetailShell;
