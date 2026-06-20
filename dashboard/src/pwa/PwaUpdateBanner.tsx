import React, { useEffect, useState } from 'react';

const PWA_UPDATE_EVENT = 'iam-pwa-update-available';

/**
 * Surfaces deploy / service-worker updates fired from registerServiceWorker.ts.
 */
export function PwaUpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onUpdate = () => setVisible(true);
    window.addEventListener(PWA_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(PWA_UPDATE_EVENT, onUpdate);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 19999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: 600,
        background: 'rgba(45, 212, 191, 0.92)',
        color: '#00212b',
        borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
      }}
    >
      <span>Update available — Reload</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          border: '1px solid rgba(0, 33, 43, 0.35)',
          background: '#00212b',
          color: '#2dd4bf',
          borderRadius: 8,
          padding: '6px 12px',
          font: 'inherit',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
      <button
        type="button"
        aria-label="Dismiss update notice"
        onClick={() => setVisible(false)}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#00212b',
          font: 'inherit',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          opacity: 0.75,
        }}
      >
        Later
      </button>
    </div>
  );
}
