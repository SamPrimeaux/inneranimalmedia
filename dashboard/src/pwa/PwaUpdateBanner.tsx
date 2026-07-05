import React, { useEffect, useState } from 'react';
import { isChatActivityBusy, subscribeChatActivityBusy } from './chatActivityGate';
import {
  applyPwaUpdateAndReload,
  PWA_UPDATE_EVENT,
  type PwaUpdateDetail,
} from './pwaUpdateEvents';

/**
 * Surfaces deploy / service-worker / bundle-stale updates.
 * Reload is user-initiated only — disabled while Agent chat is streaming.
 */
export function PwaUpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] = useState<PwaUpdateDetail | null>(null);
  const [chatBusy, setChatBusy] = useState(() => isChatActivityBusy());
  const [reloadBusy, setReloadBusy] = useState(false);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      setDetail(((e as CustomEvent<PwaUpdateDetail>).detail ?? null) as PwaUpdateDetail | null);
      setVisible(true);
    };
    window.addEventListener(PWA_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(PWA_UPDATE_EVENT, onUpdate);
  }, []);

  useEffect(() => subscribeChatActivityBusy(setChatBusy), []);

  if (!visible) return null;

  const reasonLabel =
    detail?.reason === 'bundle_stale'
      ? 'New version deployed'
      : detail?.reason === 'service_worker'
        ? 'App update ready'
        : 'Update available';

  const handleReload = () => {
    if (chatBusy || reloadBusy) return;
    setReloadBusy(true);
    void applyPwaUpdateAndReload().finally(() => setReloadBusy(false));
  };

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
      <span>
        {reasonLabel}
        {chatBusy ? ' — finish your chat, then reload' : ' — reload when ready'}
      </span>
      <button
        type="button"
        disabled={chatBusy || reloadBusy}
        onClick={handleReload}
        title={chatBusy ? 'Wait until Agent Sam finishes responding' : 'Reload to apply update'}
        style={{
          border: '1px solid rgba(0, 33, 43, 0.35)',
          background: chatBusy ? 'rgba(0,33,43,0.35)' : '#00212b',
          color: chatBusy ? 'rgba(45,212,191,0.55)' : '#2dd4bf',
          borderRadius: 8,
          padding: '6px 12px',
          font: 'inherit',
          fontSize: 12,
          fontWeight: 700,
          cursor: chatBusy || reloadBusy ? 'not-allowed' : 'pointer',
        }}
      >
        {reloadBusy ? 'Reloading…' : 'Reload'}
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
