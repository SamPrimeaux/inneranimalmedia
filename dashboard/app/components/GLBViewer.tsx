import React, { useRef, useEffect, useState } from 'react';
import '@google/model-viewer';

// Declare model-viewer as a valid JSX intrinsic element once — globally
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        'camera-controls'?: boolean;
        'auto-rotate'?: boolean;
        'shadow-intensity'?: string;
        'environment-image'?: string;
        'loading'?: 'auto' | 'lazy' | 'eager';
        style?: React.CSSProperties;
      };
    }
  }
}

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export const GLBViewer: React.FC<{ url: string; filename?: string }> = ({
  url,
  filename = '3D Asset',
}) => {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [progress, setProgress] = useState(0);
  const viewerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    const onLoad = () => setStatus('loaded');
    const onError = () => setStatus('error');
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ totalProgress: number }>).detail;
      setProgress(Math.round(detail.totalProgress * 100));
    };

    el.addEventListener('load', onLoad);
    el.addEventListener('error', onError);
    el.addEventListener('progress', onProgress);

    return () => {
      el.removeEventListener('load', onLoad);
      el.removeEventListener('error', onError);
      el.removeEventListener('progress', onProgress);
    };
  }, [url]);

  // Reset on URL change
  useEffect(() => {
    setStatus('loading');
    setProgress(0);
  }, [url]);

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg-app)] relative overflow-hidden">
      {/* Label */}
      <div className="absolute top-4 right-4 z-10 bg-[var(--bg-panel)]/80 text-[10px] uppercase tracking-widest text-[var(--text-muted)] backdrop-blur-md px-3 py-1.5 rounded-full border border-[var(--border-subtle)] shadow-xl flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            status === 'loaded'
              ? 'bg-[var(--solar-cyan)]'
              : status === 'error'
              ? 'bg-red-500'
              : 'bg-[var(--solar-cyan)] animate-pulse'
          }`}
        />
        {status === 'error' ? 'Failed to load' : `Previewing: ${filename}`}
      </div>

      {/* Loading overlay */}
      {status === 'loading' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[var(--bg-app)]/80 backdrop-blur-sm pointer-events-none">
          <div className="text-[var(--text-muted)] text-xs uppercase tracking-widest">
            Loading model... {progress > 0 ? `${progress}%` : ''}
          </div>
          <div className="w-48 h-0.5 bg-[var(--border-subtle)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--solar-cyan)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <span className="text-red-400 text-sm">Failed to load 3D asset</span>
          <span className="text-xs opacity-60 max-w-xs text-center break-all">{url}</span>
        </div>
      )}

      <model-viewer
        ref={viewerRef as any}
        src={url}
        alt={filename}
        camera-controls
        auto-rotate
        loading="auto"
        shadow-intensity="1"
        environment-image="neutral"
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: 'var(--bg-app)',
          outline: 'none',
          opacity: status === 'loaded' ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}
      />
    </div>
  );
};
